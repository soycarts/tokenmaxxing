import type { BucketAccumulator } from '../bucket.js';
import type { SourceCursor } from '../cursors.js';
import type { BoundedSet } from '../dedup.js';

export const DEDUP_LIMIT = 200_000;
/** Recent per-key contributions kept in cursors.json for cross-sync replacement. */
export const RECENT_LIMIT = 10_000;

export interface ParseStats {
  filesSeen: number;
  filesChanged: number;
  bytesRead: number;
  badLines: number;
}

export interface ParseContext {
  /** Source roots from config (e.g. ~/.claude, ~/.codex, ~/.gemini). */
  paths: string[];
  /** Mutable per-source cursor state (per-file offsets etc). Persisted by sync. */
  cursor: SourceCursor;
  /** Mutable bounded dedup set for this source. Persisted by sync. */
  dedup: BoundedSet;
  /** Receives per-(hour, model) deltas. */
  acc: BucketAccumulator;
  stats: ParseStats;
}

export function newStats(): ParseStats {
  return { filesSeen: 0, filesChanged: 0, bytesRead: 0, badLines: 0 };
}

export function num(v: unknown): number {
  return typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : 0;
}
