export type SourceName = 'claude' | 'codex' | 'gemini' | 'cursor';
export const SOURCES: SourceName[] = ['claude', 'codex', 'gemini', 'cursor'];

export type Provider = 'claude' | 'openai' | 'cursor' | 'google';
export const PROVIDER_SOURCE: Record<Provider, SourceName> = {
  claude: 'claude',
  openai: 'codex',
  cursor: 'cursor',
  google: 'gemini',
};

/** One row of buckets.jsonl: totals for one (hour, source, model). */
export interface Bucket {
  v: 1;
  ts: string; // hour start, UTC, e.g. 2026-09-22T13:00:00Z
  source: SourceName;
  model: string;
  input: number;
  cache_read: number;
  cache_write_5m: number;
  cache_write_1h: number;
  output: number;
  reasoning: number;
  requests: number;
  conversations: number;
}

export const TOKEN_FIELDS = ['input', 'cache_read', 'cache_write_5m', 'cache_write_1h', 'output', 'reasoning'] as const;
export const COUNT_FIELDS = [...TOKEN_FIELDS, 'requests', 'conversations'] as const;
export type CountField = (typeof COUNT_FIELDS)[number];

export interface Usage {
  input: number;
  cache_read: number;
  cache_write_5m: number;
  cache_write_1h: number;
  output: number;
  reasoning: number;
}
