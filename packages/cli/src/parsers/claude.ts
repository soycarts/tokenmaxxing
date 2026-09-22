import { stat } from 'node:fs/promises';
import { join, sep } from 'node:path';
import { BoundedSet } from '../dedup.js';
import { hourOf } from '../bucket.js';
import { isFile, walkFiles } from '../fsutil.js';
import { has, parseLine, scanLines } from '../lines.js';
import type { Bucket, Usage } from '../types.js';
import type { FileCursor, RecentUsage } from '../cursors.js';
import { DEDUP_LIMIT, RECENT_LIMIT, num, type ParseContext } from './context.js';

const USAGE = Buffer.from('"usage"');
const USER = Buffer.from('"type":"user"');
const USER_SPACED = Buffer.from('"type": "user"');
const SUBAGENTS = `${sep}subagents${sep}`;
const MAX_PENDING = 50;

/** All Claude Code transcript files (including subagents/) under each root's projects/ dir. */
export async function claudeFiles(roots: string[]): Promise<string[]> {
  const out: string[] = [];
  for (const root of roots) {
    out.push(...(await walkFiles(join(root, 'projects'), (n) => n.endsWith('.jsonl'))));
  }
  return [...new Set(out)];
}

/** Map a Claude `message.usage` object to our token fields; null when every counter is zero. */
export function claudeUsage(u: any): Usage | null {
  const input = num(u.input_tokens);
  const output = num(u.output_tokens);
  const cacheRead = num(u.cache_read_input_tokens);
  const cacheCreation = num(u.cache_creation_input_tokens);
  let w5: number;
  let w1: number;
  if (u.cache_creation && typeof u.cache_creation === 'object') {
    w5 = num(u.cache_creation.ephemeral_5m_input_tokens);
    w1 = num(u.cache_creation.ephemeral_1h_input_tokens);
    // Model-fallback responses report `cache_creation` for the first iteration but the top-level
    // total for the final one. The total wins (as in ccusage); keep the split's 5m/1h ratio.
    if (u.cache_creation_input_tokens !== undefined && w5 + w1 !== cacheCreation) {
      const split = w5 + w1;
      w1 = split > 0 ? Math.round((cacheCreation * w1) / split) : 0;
      w5 = cacheCreation - w1;
    }
  } else {
    w5 = cacheCreation;
    w1 = 0;
  }
  if (input + output + cacheRead + w5 + w1 === 0) return null;
  return { input, cache_read: cacheRead, cache_write_5m: w5, cache_write_1h: w1, output, reasoning: 0 };
}

interface Contribution {
  hour: string;
  model: string;
  usage: Usage;
  total: number;
}

const totalOf = (u: Usage) => u.input + u.cache_read + u.cache_write_5m + u.cache_write_1h + u.output;
const negate = (u: Usage): Usage => ({
  input: -u.input, cache_read: -u.cache_read, cache_write_5m: -u.cache_write_5m,
  cache_write_1h: -u.cache_write_1h, output: -u.output, reasoning: -u.reasoning,
});

function loadRecent(rows: RecentUsage[] | undefined): Map<string, Contribution> {
  const m = new Map<string, Contribution>();
  for (const r of rows ?? []) {
    if (!Array.isArray(r) || r.length < 8) continue;
    const usage: Usage = { input: r[3], cache_read: r[4], cache_write_5m: r[5], cache_write_1h: r[6], output: r[7], reasoning: 0 };
    m.set(r[0], { hour: r[1], model: r[2], usage, total: totalOf(usage) });
  }
  return m;
}

function saveRecent(m: Map<string, Contribution>): RecentUsage[] {
  const all = [...m.entries()];
  return all.slice(Math.max(0, all.length - RECENT_LIMIT)).map(([k, c]) => [
    k, c.hour, c.model, c.usage.input, c.usage.cache_read, c.usage.cache_write_5m, c.usage.cache_write_1h, c.usage.output,
  ]);
}

function isPrompt(content: unknown): boolean {
  if (typeof content === 'string') return true;
  return Array.isArray(content) && content.some((b) => b && typeof b === 'object' && (b as any).type === 'text');
}

export async function parse(ctx: ParseContext): Promise<Bucket[]> {
  const { cursor, dedup, acc, stats } = ctx;
  const conv = new BoundedSet(DEDUP_LIMIT, cursor.convDedup ?? []);
  // Per-key contributions: every key seen this run, plus the most recent keys from earlier syncs.
  const contribs = loadRecent(cursor.recent);
  const list = await claudeFiles(ctx.paths);
  const live = new Set(list);

  for (const file of list) {
    stats.filesSeen++;
    let st;
    try {
      st = await stat(file);
    } catch {
      continue;
    }
    const prev: FileCursor | undefined = cursor.files[file];
    if (prev && prev.size === st.size && prev.mtimeMs === st.mtimeMs) continue;
    stats.filesChanged++;

    const shrank = !!prev && st.size < prev.offset;
    const start = prev && !shrank ? prev.offset : 0;
    let lastModel = shrank ? undefined : prev?.model;
    let pending: string[] = shrank ? [] : [...(prev?.pending ?? [])];
    const isSub = file.includes(SUBAGENTS);

    const handle = (obj: any): void => {
      if (!obj || typeof obj !== 'object') return;
      if (obj.type === 'assistant') {
        const m = obj.message;
        const model = m?.model;
        if (!m || !m.usage || typeof model !== 'string' || !model || model === '<synthetic>') return;
        lastModel = model;
        if (pending.length) {
          for (const h of pending) acc.addConversation(h, 'claude', model);
          pending = [];
        }
        const usage = claudeUsage(m.usage);
        if (!usage) return;
        const hour = hourOf(obj.timestamp);
        if (!hour) {
          stats.badLines++;
          return;
        }
        if (typeof m.id !== 'string' || !m.id) {
          acc.addUsage(hour, 'claude', model, usage);
          return;
        }
        // One message is written as several lines whose usage is cumulative: keep the largest.
        const key = `${m.id}:${obj.requestId ?? ''}`;
        const total = totalOf(usage);
        const prevC = contribs.get(key);
        if (prevC) {
          if (total <= prevC.total) return;
          acc.addUsage(prevC.hour, 'claude', prevC.model, negate(prevC.usage), -1);
          contribs.delete(key);
        } else if (dedup.has(key)) {
          return; // seen long ago; its contribution is no longer kept, so it cannot be replaced
        }
        dedup.add(key);
        contribs.set(key, { hour, model, usage, total });
        if (contribs.size > DEDUP_LIMIT * 1.25) {
          let excess = contribs.size - DEDUP_LIMIT;
          for (const k of contribs.keys()) {
            if (excess-- <= 0) break;
            contribs.delete(k);
          }
        }
        acc.addUsage(hour, 'claude', model, usage);
      } else if (obj.type === 'user' && !isSub) {
        if (typeof obj.uuid !== 'string' || !isPrompt(obj.message?.content)) return;
        if (!conv.add(obj.uuid)) return;
        const hour = hourOf(obj.timestamp);
        if (!hour) return;
        // Attributed to the model of the next assistant response in this file.
        pending.push(hour);
        if (pending.length > MAX_PENDING) pending.shift();
      }
    };

    const onLine = (line: Buffer): void => {
      if (!(has(line, USAGE) || (!isSub && (has(line, USER) || has(line, USER_SPACED))))) return;
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
      continue; // unreadable file: leave cursor untouched, retry next sync
    }
    const next: FileCursor = { size: st.size, mtimeMs: st.mtimeMs, offset: end };
    if (lastModel) next.model = lastModel;
    if (pending.length) next.pending = pending;
    cursor.files[file] = next;
  }

  for (const f of Object.keys(cursor.files)) if (!live.has(f) && !isFile(f)) delete cursor.files[f];
  cursor.convDedup = conv.toJSON();
  cursor.recent = saveRecent(contribs);
  return acc.rows();
}
