import { files } from './paths.js';
import { readJson, writeJsonAtomic } from './fsutil.js';

export interface FileCursor {
  size: number;
  mtimeMs: number;
  offset: number;
  /** codex: latest model seen via turn_context; claude: last assistant model (for attributing prompts). */
  model?: string;
  /** codex: file contains token_usage_record lines (so token_count events are ignored). */
  records?: boolean;
  /** codex fallback: last cumulative total_token_usage (compact keys i,c,w,o,r). */
  cum?: Record<string, number>;
  /** codex: last root_turn_id seen. */
  root?: string;
  /** claude: hour buckets of prompts not yet attributed to a model. */
  pending?: string[];
  /** gemini: number of messages already parsed. */
  count?: number;
}

/** [key, hour, model, input, cache_read, cache_write_5m, cache_write_1h, output] */
export type RecentUsage = [string, string, string, number, number, number, number, number];

export interface SourceCursor {
  files: Record<string, FileCursor>;
  dedup: string[];
  /** claude: user-prompt uuids already counted as conversations. */
  convDedup?: string[];
  /** claude: contributions of the most recent dedup keys, so a later, larger line can replace them. */
  recent?: RecentUsage[];
  badLines: number;
  lastSync?: string;
  lastFilesScanned?: number;
  lastFilesChanged?: number;
}

export interface Cursors {
  v: 1;
  sources: Record<string, SourceCursor>;
}

export function emptySourceCursor(): SourceCursor {
  return { files: {}, dedup: [], badLines: 0 };
}

export function loadCursors(): Cursors {
  const c = readJson<Cursors | null>(files.cursors(), null);
  if (!c || c.v !== 1 || typeof c.sources !== 'object') return { v: 1, sources: {} };
  return c;
}

export function sourceCursor(c: Cursors, name: string): SourceCursor {
  if (!c.sources[name]) c.sources[name] = emptySourceCursor();
  const s = c.sources[name];
  s.files ??= {};
  s.dedup ??= [];
  s.badLines ??= 0;
  return s;
}

export function saveCursors(c: Cursors): void {
  // Compact JSON: dedup sets can hold hundreds of thousands of keys.
  writeJsonAtomic(files.cursors(), c, false);
}
