import { closeSync, mkdirSync, openSync, rmSync, statSync, writeSync } from 'node:fs';
import { addInto, emptyBucket, bucketKey, isZero, BucketAccumulator } from './bucket.js';
import { loadConfig, type Config } from './config.js';
import { loadCursors, saveCursors, sourceCursor } from './cursors.js';
import { BoundedSet } from './dedup.js';
import { files, tmxHome } from './paths.js';
import { appendBuckets, bucketsFileSize, compactBuckets, COMPACT_THRESHOLD, loadBuckets } from './store.js';
import { DEDUP_LIMIT, newStats, type ParseContext, type ParseStats } from './parsers/context.js';
import * as claude from './parsers/claude.js';
import * as codex from './parsers/codex.js';
import * as gemini from './parsers/gemini.js';
import * as cursor from './parsers/cursor.js';
import { COUNT_FIELDS, type Bucket, type SourceName } from './types.js';

export const PARSERS: Record<SourceName, (ctx: ParseContext) => Promise<Bucket[]>> = {
  claude: claude.parse,
  codex: codex.parse,
  gemini: gemini.parse,
  cursor: cursor.parse,
};

export interface SyncResult {
  ms: number;
  rowsWritten: number;
  perSource: Partial<Record<SourceName, ParseStats>>;
  compacted: boolean;
  skippedLocked?: boolean;
}

const LOCK_STALE_MS = 10 * 60 * 1000;

function acquireLock(): boolean {
  mkdirSync(tmxHome(), { recursive: true });
  const path = files.lock();
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const fd = openSync(path, 'wx');
      writeSync(fd, String(process.pid));
      closeSync(fd);
      return true;
    } catch {
      try {
        if (Date.now() - statSync(path).mtimeMs > LOCK_STALE_MS) {
          rmSync(path, { force: true });
          continue;
        }
      } catch {
        continue;
      }
      return false;
    }
  }
  return false;
}

function releaseLock(): void {
  rmSync(files.lock(), { force: true });
}

/** Incrementally parse every enabled source and append replacement rows for affected hours. */
export async function sync(cfg: Config = loadConfig(), onProgress?: (msg: string) => void): Promise<SyncResult> {
  const t0 = Date.now();
  if (!acquireLock()) return { ms: 0, rowsWritten: 0, perSource: {}, compacted: false, skippedLocked: true };
  try {
    const cursors = loadCursors();
    const deltas = new Map<string, Bucket>();
    const perSource: Partial<Record<SourceName, ParseStats>> = {};

    for (const name of Object.keys(PARSERS) as SourceName[]) {
      const sc = cfg.sources[name];
      if (!sc?.enabled || !sc.paths.length) continue;
      if (name === 'cursor') continue; // activity only: nothing to read in v1 (see parsers/cursor.ts)
      onProgress?.(`scanning ${name}…`);
      const cur = sourceCursor(cursors, name);
      const dedup = new BoundedSet(DEDUP_LIMIT, cur.dedup);
      const ctx: ParseContext = { paths: sc.paths, cursor: cur, dedup, acc: new BucketAccumulator(), stats: newStats() };
      const rows = await PARSERS[name](ctx);
      cur.dedup = dedup.toJSON();
      cur.badLines += ctx.stats.badLines;
      cur.lastSync = new Date().toISOString();
      cur.lastFilesScanned = ctx.stats.filesSeen;
      cur.lastFilesChanged = ctx.stats.filesChanged;
      perSource[name] = ctx.stats;
      for (const r of rows) {
        if (isZero(r)) continue;
        const k = bucketKey(r);
        const d = deltas.get(k);
        if (d) addInto(d, r);
        else deltas.set(k, { ...r });
      }
    }

    let rowsWritten = 0;
    let compacted = false;
    if (deltas.size) {
      const existing = await loadBuckets();
      const out: Bucket[] = [];
      for (const [k, d] of deltas) {
        const next = { ...(existing.rows.get(k) ?? emptyBucket(d.ts, d.source, d.model)) };
        addInto(next, d);
        // A replaced Claude contribution is subtracted; never let a row go negative if the stores disagree.
        for (const f of COUNT_FIELDS) if (next[f] < 0) next[f] = 0;
        existing.rows.set(k, next);
        out.push(next);
      }
      appendBuckets(out);
      rowsWritten = out.length;
      // Compact only when there is something to drop, so a large-but-dense file isn't rewritten every sync.
      if (bucketsFileSize() > COMPACT_THRESHOLD && existing.lines + out.length > existing.rows.size * 1.2) {
        compactBuckets(existing.rows);
        compacted = true;
      }
    }
    saveCursors(cursors);
    return { ms: Date.now() - t0, rowsWritten, perSource, compacted };
  } finally {
    releaseLock();
  }
}
