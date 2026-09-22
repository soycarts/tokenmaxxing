import { join } from 'node:path';
import { isDir, isFile } from './fsutil.js';
import { claudeCandidateRoots, codexHome, cursorTrackingDb, geminiHome } from './paths.js';
import type { SourceConfig } from './config.js';
import type { SourceName } from './types.js';

export interface Detection {
  source: SourceName;
  found: boolean;
  paths: string[];
  note?: string;
}

/** Look for each tool's local log directory. Reads directory metadata only. */
export function detect(): Record<SourceName, Detection> {
  const claudeRoots = claudeCandidateRoots().filter((r) => isDir(join(r, 'projects')));
  const cx = codexHome();
  const codexFound = isDir(join(cx, 'sessions')) || isDir(join(cx, 'archived_sessions'));
  const gm = geminiHome();
  const geminiFound = isDir(join(gm, 'tmp'));
  const cursorDb = cursorTrackingDb();
  const cursorFound = isFile(cursorDb);
  return {
    claude: { source: 'claude', found: claudeRoots.length > 0, paths: claudeRoots },
    codex: { source: 'codex', found: codexFound, paths: codexFound ? [cx] : [] },
    gemini: { source: 'gemini', found: geminiFound, paths: geminiFound ? [gm] : [] },
    cursor: {
      source: 'cursor',
      found: cursorFound,
      paths: cursorFound ? [cursorDb] : [],
      note: 'token counts not available locally; Cursor is excluded from totals',
    },
  };
}

export function detectionToSources(d: Record<SourceName, Detection>): Record<SourceName, SourceConfig> {
  const out = {} as Record<SourceName, SourceConfig>;
  for (const k of Object.keys(d) as SourceName[]) out[k] = { enabled: d[k].found, paths: d[k].paths };
  return out;
}
