import { appendFileSync, mkdirSync, statSync } from 'node:fs';
import { dirname } from 'node:path';
import { bucketKey } from './bucket.js';
import { files } from './paths.js';
import { writeFileAtomic, isFile } from './fsutil.js';
import { scanLines, parseLine } from './lines.js';
import { COUNT_FIELDS, SOURCES, type Bucket } from './types.js';

export const COMPACT_THRESHOLD = 5 * 1024 * 1024;

/** Only these keys ever leave the machine (push) or get written. */
export function cleanRow(b: Bucket): Bucket {
  const out: Bucket = { v: 1, ts: b.ts, source: b.source, model: b.model } as Bucket;
  for (const f of COUNT_FIELDS) out[f] = typeof b[f] === 'number' && Number.isFinite(b[f]) ? b[f] : 0;
  return out;
}

function valid(o: any): o is Bucket {
  return o && o.v === 1 && typeof o.ts === 'string' && SOURCES.includes(o.source) && typeof o.model === 'string';
}

export interface LoadedBuckets {
  rows: Map<string, Bucket>;
  lines: number;
  bad: number;
  bytes: number;
}

/** Read buckets.jsonl keeping the last row per (ts, source, model). */
export async function loadBuckets(path = files.buckets()): Promise<LoadedBuckets> {
  const rows = new Map<string, Bucket>();
  let lines = 0;
  let bad = 0;
  if (!isFile(path)) return { rows, lines, bad, bytes: 0 };
  const size = statSync(path).size;
  await scanLines(path, 0, size, (line) => {
    lines++;
    const o = parseLine(line);
    if (!valid(o)) {
      bad++;
      return;
    }
    rows.set(bucketKey(o), cleanRow(o));
  });
  return { rows, lines, bad, bytes: size };
}

export function appendBuckets(rows: Bucket[], path = files.buckets()): void {
  if (!rows.length) return;
  mkdirSync(dirname(path), { recursive: true });
  appendFileSync(path, rows.map((r) => JSON.stringify(cleanRow(r))).join('\n') + '\n');
}

export function sortRows(rows: Iterable<Bucket>): Bucket[] {
  return [...rows].sort((a, b) =>
    a.ts < b.ts ? -1 : a.ts > b.ts ? 1 : a.source < b.source ? -1 : a.source > b.source ? 1 : a.model < b.model ? -1 : a.model > b.model ? 1 : 0,
  );
}

/** Rewrite the file keeping only the last row per key. */
export function compactBuckets(rows: Map<string, Bucket>, path = files.buckets()): void {
  const body = sortRows(rows.values()).map((r) => JSON.stringify(cleanRow(r))).join('\n');
  writeFileAtomic(path, body ? body + '\n' : '');
}

export function bucketsFileSize(path = files.buckets()): number {
  try {
    return statSync(path).size;
  } catch {
    return 0;
  }
}
