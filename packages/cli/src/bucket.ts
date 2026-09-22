import type { Bucket, SourceName, Usage } from './types.js';
import { COUNT_FIELDS } from './types.js';

export function emptyBucket(ts: string, source: SourceName, model: string): Bucket {
  return {
    v: 1, ts, source, model,
    input: 0, cache_read: 0, cache_write_5m: 0, cache_write_1h: 0, output: 0, reasoning: 0,
    requests: 0, conversations: 0,
  };
}

export function bucketKey(b: Pick<Bucket, 'ts' | 'source' | 'model'>): string {
  return `${b.ts}|${b.source}|${b.model}`;
}

/** Floor an ISO timestamp (or epoch ms) to the UTC hour: `2026-09-22T13:00:00Z`. Returns null if invalid. */
export function hourOf(t: string | number | undefined | null): string | null {
  if (t === undefined || t === null || t === '') return null;
  const ms = typeof t === 'number' ? t : Date.parse(t);
  if (!Number.isFinite(ms)) return null;
  return new Date(ms).toISOString().slice(0, 13) + ':00:00Z';
}

/** Accumulates per-(hour, source, model) deltas produced by a parser run. */
export class BucketAccumulator {
  readonly map = new Map<string, Bucket>();

  get(ts: string, source: SourceName, model: string): Bucket {
    const key = `${ts}|${source}|${model}`;
    let b = this.map.get(key);
    if (!b) {
      b = emptyBucket(ts, source, model);
      this.map.set(key, b);
    }
    return b;
  }

  addUsage(ts: string, source: SourceName, model: string, u: Usage, requests = 1): void {
    const b = this.get(ts, source, model);
    b.input += u.input;
    b.cache_read += u.cache_read;
    b.cache_write_5m += u.cache_write_5m;
    b.cache_write_1h += u.cache_write_1h;
    b.output += u.output;
    b.reasoning += u.reasoning;
    b.requests += requests;
  }

  addConversation(ts: string, source: SourceName, model: string, n = 1): void {
    this.get(ts, source, model).conversations += n;
  }

  rows(): Bucket[] {
    return [...this.map.values()];
  }
}

export function addInto(target: Bucket, delta: Bucket): void {
  for (const f of COUNT_FIELDS) target[f] += delta[f];
}

export function isZero(b: Bucket): boolean {
  return COUNT_FIELDS.every((f) => b[f] === 0);
}
