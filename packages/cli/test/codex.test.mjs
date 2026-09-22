import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, renameSync, appendFileSync } from 'node:fs';
import { join } from 'node:path';
import * as codex from '../dist/parsers/codex.js';
import { BucketAccumulator } from '../dist/bucket.js';
import { BoundedSet } from '../dist/dedup.js';
import { newStats } from '../dist/parsers/context.js';
import { fakeHome } from './helpers.mjs';

function ctxFor(root, cursor = { files: {}, dedup: [], badLines: 0 }) {
  return { paths: [root], cursor, dedup: new BoundedSet(200_000, cursor.dedup), acc: new BucketAccumulator(), stats: newStats() };
}
async function run(ctx) {
  const rows = await codex.parse(ctx);
  ctx.cursor.dedup = ctx.dedup.toJSON();
  return new Map(rows.map((r) => [`${r.ts}|${r.model}`, r]));
}
const pick = ({ input, cache_read, cache_write_5m, cache_write_1h, output, reasoning, requests, conversations }) =>
  ({ input, cache_read, cache_write_5m, cache_write_1h, output, reasoning, requests, conversations });

// Hand-computed from test/fixtures/codex/rollout-2026.jsonl (token_usage_record path; token_count ignored):
//   gpt-6-astra: records (37957,0,189,0) + (50414,37760,280,11) → input 37957 + 12654 = 50611, cached 37760
//   gpt-5.6-sol: records (159544,158208,257,0) + (166925,159360,170,0) → input 1336 + 7565 = 8901, cached 317568
//   the replayed response_id on the last line is ignored.
// rollout-2025.jsonl (token_count path): cumulative (7134,3072,318,192) → (14421,10112,1702,384); repeats and info:null add 0
//   → input 14421 - 10112 = 4309, cached 10112, output 1702, reasoning 384, 2 non-zero deltas.
test('codex: 2026 token_usage_record path and 2025 token_count fallback', async () => {
  const home = fakeHome({ claude: false, gemini: false });
  const ctx = ctxFor(join(home, '.codex'));
  const rows = await run(ctx);
  assert.equal(ctx.stats.filesSeen, 2);
  assert.deepEqual([...rows.keys()].sort(), [
    '2025-12-17T05:00:00Z|gpt-5.1-codex-max',
    '2026-09-22T06:00:00Z|gpt-5.6-sol',
    '2026-09-22T06:00:00Z|gpt-6-astra',
  ]);
  assert.deepEqual(pick(rows.get('2026-09-22T06:00:00Z|gpt-6-astra')), {
    input: 50611, cache_read: 37760, cache_write_5m: 0, cache_write_1h: 0, output: 469, reasoning: 11, requests: 2, conversations: 1,
  });
  assert.deepEqual(pick(rows.get('2026-09-22T06:00:00Z|gpt-5.6-sol')), {
    input: 8901, cache_read: 317568, cache_write_5m: 0, cache_write_1h: 0, output: 427, reasoning: 0, requests: 2, conversations: 1,
  });
  assert.deepEqual(pick(rows.get('2025-12-17T05:00:00Z|gpt-5.1-codex-max')), {
    input: 4309, cache_read: 10112, cache_write_5m: 0, cache_write_1h: 0, output: 1702, reasoning: 384, requests: 2, conversations: 0,
  });
});

test('codex: incremental fallback continues from the stored cumulative total', async () => {
  const home = fakeHome({ claude: false, gemini: false });
  const root = join(home, '.codex');
  const ctx1 = ctxFor(root);
  await run(ctx1);
  const file = join(root, 'archived_sessions', 'rollout-2025.jsonl');
  const tot = { input_tokens: 20000, cached_input_tokens: 15000, cache_write_input_tokens: 0, output_tokens: 2000, reasoning_output_tokens: 400, total_tokens: 22000 };
  appendFileSync(file, JSON.stringify({ timestamp: '2025-12-17T06:01:00.000Z', type: 'event_msg', payload: { type: 'token_count', info: { total_token_usage: tot } } }) + '\n');
  const ctx2 = ctxFor(root, JSON.parse(JSON.stringify(ctx1.cursor)));
  const rows = await run(ctx2);
  assert.deepEqual(pick(rows.get('2025-12-17T06:00:00Z|gpt-5.1-codex-max')), {
    input: (20000 - 14421) - (15000 - 10112), cache_read: 15000 - 10112, cache_write_5m: 0, cache_write_1h: 0,
    output: 2000 - 1702, reasoning: 400 - 384, requests: 1, conversations: 0,
  });
});

test('codex: a session moved into archived_sessions/ is not counted again', async () => {
  const home = fakeHome({ claude: false, gemini: false });
  const root = join(home, '.codex');
  const ctx1 = ctxFor(root);
  await run(ctx1);
  renameSync(join(root, 'sessions', '2026', '09', '21', 'rollout-2026.jsonl'), join(root, 'archived_sessions', 'rollout-2026.jsonl'));
  const ctx2 = ctxFor(root, JSON.parse(JSON.stringify(ctx1.cursor)));
  const rows = await run(ctx2);
  assert.equal(rows.size, 0);
  assert.equal(ctx2.stats.filesChanged, 0);
});

test('codex: model falls back to session_meta then unknown-codex', async () => {
  const home = fakeHome({ claude: false, gemini: false, codex: false });
  const dir = join(home, '.codex', 'sessions', '2026', '01', '01');
  mkdirSync(dir, { recursive: true });
  const rec = (id, ts) => JSON.stringify({ timestamp: ts, type: 'token_usage_record', payload: { response_id: id, usage: { input_tokens: 10, cached_input_tokens: 4, output_tokens: 3 } } });
  appendFileSync(join(dir, 'rollout-a.jsonl'), rec('r1', '2026-01-01T00:00:01Z') + '\n');
  appendFileSync(join(dir, 'rollout-b.jsonl'), JSON.stringify({ timestamp: '2026-01-01T00:00:00Z', type: 'session_meta', payload: { model: 'gpt-6-luna' } }) + '\n' + rec('r2', '2026-01-01T00:00:02Z') + '\n');
  const rows = await run(ctxFor(join(home, '.codex')));
  assert.equal(rows.get('2026-01-01T00:00:00Z|unknown-codex')?.input, 6);
  assert.equal(rows.get('2026-01-01T00:00:00Z|gpt-6-luna')?.cache_read, 4);
});
