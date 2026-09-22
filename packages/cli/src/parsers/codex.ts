import { readdir, stat } from 'node:fs/promises';
import { basename, join } from 'node:path';
import { BucketAccumulator, hourOf } from '../bucket.js';
import { walkFiles } from '../fsutil.js';
import { parseLine, scanLines } from '../lines.js';
import type { Bucket, Usage } from '../types.js';
import type { FileCursor } from '../cursors.js';
import { num, type ParseContext } from './context.js';

const isRollout = (n: string) => n.startsWith('rollout-') && n.endsWith('.jsonl');
/** Top-level `type` (and event_msg payload.type) sit in the first bytes of every Codex line. */
const HEAD = 320;
const NEEDLES = ['"token_usage_record"', '"turn_context"', '"session_meta"', '"token_count"'].map((s) => Buffer.from(s));

export interface RawCodexUsage {
  input_tokens: number;
  cached_input_tokens: number;
  cache_write_input_tokens: number;
  output_tokens: number;
  reasoning_output_tokens: number;
}
const RAW_FIELDS: (keyof RawCodexUsage)[] = [
  'input_tokens', 'cached_input_tokens', 'cache_write_input_tokens', 'output_tokens', 'reasoning_output_tokens',
];

function raw(u: any): RawCodexUsage {
  return {
    input_tokens: num(u?.input_tokens),
    cached_input_tokens: num(u?.cached_input_tokens),
    cache_write_input_tokens: num(u?.cache_write_input_tokens),
    output_tokens: num(u?.output_tokens),
    reasoning_output_tokens: num(u?.reasoning_output_tokens),
  };
}

/** Codex `input_tokens` includes `cached_input_tokens`; `output_tokens` already includes reasoning. */
export function codexUsage(r: RawCodexUsage): Usage {
  return {
    input: Math.max(0, r.input_tokens - r.cached_input_tokens),
    cache_read: r.cached_input_tokens,
    cache_write_5m: r.cache_write_input_tokens,
    cache_write_1h: 0,
    output: r.output_tokens,
    reasoning: r.reasoning_output_tokens,
  };
}

const isZeroRaw = (r: RawCodexUsage) => RAW_FIELDS.every((f) => r[f] === 0);

/** rollout files keyed by basename (so a session moved into archived_sessions/ is not re-counted). */
export async function codexFiles(roots: string[]): Promise<Map<string, string>> {
  const found = new Map<string, string>();
  for (const root of roots) {
    const list = await walkFiles(join(root, 'sessions'), isRollout);
    try {
      const archived = join(root, 'archived_sessions');
      for (const n of (await readdir(archived)).sort()) if (isRollout(n)) list.push(join(archived, n));
    } catch {
      /* no archived_sessions */
    }
    for (const f of list) if (!found.has(basename(f))) found.set(basename(f), f);
  }
  return found;
}

export async function parse(ctx: ParseContext): Promise<Bucket[]> {
  const { cursor, dedup, acc, stats } = ctx;
  const files = await codexFiles(ctx.paths);

  for (const [key, file] of files) {
    stats.filesSeen++;
    let st;
    try {
      st = await stat(file);
    } catch {
      continue;
    }
    const prev: FileCursor | undefined = cursor.files[key];
    if (prev && prev.size === st.size && prev.mtimeMs === st.mtimeMs) continue;
    stats.filesChanged++;
    const shrank = !!prev && st.size < prev.offset;
    const base = shrank ? undefined : prev;
    const start = base?.offset ?? 0;

    let model: string | undefined = base?.model;
    let root: string | undefined = base?.root;
    let cum: RawCodexUsage | undefined = base?.cum ? raw(fromUsageCursor(base.cum)) : undefined;
    let sawRecords = !!base?.records;
    const recAcc = new BucketAccumulator();
    const fbAcc = new BucketAccumulator();
    const modelNow = () => model ?? 'unknown-codex';

    const handle = (obj: any): void => {
      if (!obj || typeof obj !== 'object') return;
      const p = obj.payload;
      switch (obj.type) {
        case 'session_meta':
          if (!model && typeof p?.model === 'string' && p.model) model = p.model;
          return;
        case 'turn_context': {
          if (typeof p?.model === 'string' && p.model) model = p.model;
          const r = p?.root_turn_id;
          if (typeof r === 'string' && r && r !== root) {
            root = r;
            const h = hourOf(obj.timestamp);
            if (h) acc.addConversation(h, 'codex', modelNow());
          }
          return;
        }
        case 'token_usage_record': {
          sawRecords = true;
          if (!p?.usage) return;
          const rid = p.response_id;
          if (typeof rid === 'string' && rid && !dedup.add(rid)) return;
          const r = raw(p.usage);
          if (isZeroRaw(r)) return;
          const h = hourOf(obj.timestamp);
          if (!h) {
            stats.badLines++;
            return;
          }
          recAcc.addUsage(h, 'codex', modelNow(), codexUsage(r));
          return;
        }
        case 'event_msg': {
          if (p?.type !== 'token_count' || !p.info) return;
          const tot = p.info.total_token_usage;
          if (!tot) return;
          const now = raw(tot);
          let delta: RawCodexUsage;
          if (!cum) delta = now;
          else if (RAW_FIELDS.every((f) => now[f] >= cum![f])) {
            delta = raw({});
            for (const f of RAW_FIELDS) delta[f] = now[f] - cum[f];
          } else {
            // Cumulative counter went backwards (session reset): count this response only.
            delta = p.info.last_token_usage ? raw(p.info.last_token_usage) : now;
          }
          cum = now;
          if (isZeroRaw(delta)) return;
          const h = hourOf(obj.timestamp);
          if (h) fbAcc.addUsage(h, 'codex', modelNow(), codexUsage(delta));
          return;
        }
      }
    };

    const onLine = (line: Buffer): void => {
      const head = line.subarray(0, HEAD);
      if (!NEEDLES.some((n) => head.indexOf(n) !== -1)) return;
      const obj = parseLine(line);
      if (obj === undefined) {
        stats.badLines++;
        return;
      }
      handle(obj);
    };

    let end = start;
    try {
      const res = await scanLines(file, start, st.size, onLine);
      end = res.end;
      stats.bytesRead += st.size - start;
      if (res.tail) {
        const obj = parseLine(res.tail);
        if (obj !== undefined) {
          handle(obj);
          end = st.size;
        }
      }
    } catch {
      continue;
    }

    // Never mix paths within one file: token_usage_record wins whenever the file has any.
    for (const b of (sawRecords ? recAcc : fbAcc).rows()) {
      acc.addUsage(b.ts, 'codex', b.model, b, b.requests);
    }

    const next: FileCursor = { size: st.size, mtimeMs: st.mtimeMs, offset: end };
    if (model) next.model = model;
    if (root) next.root = root;
    if (sawRecords) next.records = true;
    if (cum) next.cum = toUsageCursor(cum);
    cursor.files[key] = next;
  }
  return acc.rows();
}

// The cursor stores the raw cumulative counters under Usage-like names to keep cursors.json compact.
function toUsageCursor(r: RawCodexUsage): Record<string, number> {
  return { i: r.input_tokens, c: r.cached_input_tokens, w: r.cache_write_input_tokens, o: r.output_tokens, r: r.reasoning_output_tokens };
}
function fromUsageCursor(c: any): any {
  return {
    input_tokens: c.i, cached_input_tokens: c.c, cache_write_input_tokens: c.w, output_tokens: c.o, reasoning_output_tokens: c.r,
  };
}
