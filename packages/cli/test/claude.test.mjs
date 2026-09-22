import { test } from 'node:test';
import assert from 'node:assert/strict';
import { appendFileSync, readFileSync, writeFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import * as claude from '../dist/parsers/claude.js';
import { BucketAccumulator } from '../dist/bucket.js';
import { BoundedSet } from '../dist/dedup.js';
import { newStats } from '../dist/parsers/context.js';
import { fakeHome } from './helpers.mjs';

function ctxFor(root, cursor = { files: {}, dedup: [], badLines: 0 }) {
  return { paths: [root], cursor, dedup: new BoundedSet(200_000, cursor.dedup), acc: new BucketAccumulator(), stats: newStats() };
}
async function run(ctx) {
  const rows = await claude.parse(ctx);
  ctx.cursor.dedup = ctx.dedup.toJSON();
  return new Map(rows.map((r) => [`${r.ts}|${r.model}`, r]));
}

// Hand-computed from test/fixtures/claude (see fixtures/README.md):
// parent, hour 00, claude-fable-5, 5 unique message ids (streamed lines share usage):
//   input 8660+2+2+2+2 = 8668; output 792+476+407+1227+439 = 3341
//   cache_write_1h 5202+9465+1428+281+46 = 16422; cache_read 10540+15742+25207+32472+33980 = 117941
// parent, hour 01, claude-opus-5-5: legacy usage (no cache_creation) → 5m = 1000
// subagent, 2026-07-28T20, claude-opus-5: first-seen usage per id (out 1, not 292), dup of parent id skipped
const FABLE = { input: 8668, output: 3341, cache_write_5m: 0, cache_write_1h: 16422, cache_read: 117941, requests: 5, conversations: 2 };
const OPUS55 = { input: 10, output: 300, cache_write_5m: 1000, cache_write_1h: 0, cache_read: 2000, requests: 1, conversations: 1 };
const SUB = { input: 4, output: 6, cache_write_5m: 11840 + 8960, cache_write_1h: 0, cache_read: 13524 + 25364, requests: 2, conversations: 0 };

function pick(r) {
  const { input, output, cache_write_5m, cache_write_1h, cache_read, requests, conversations } = r;
  return { input, output, cache_write_5m, cache_write_1h, cache_read, requests, conversations };
}

test('claude: fixture totals, dedup across subagent + parent, synthetic/zero/garbled skipped', async () => {
  const home = fakeHome({ codex: false, gemini: false });
  const ctx = ctxFor(join(home, '.claude'));
  const rows = await run(ctx);
  assert.equal(rows.size, 3, [...rows.keys()].join(', '));
  assert.deepEqual(pick(rows.get('2026-07-05T00:00:00Z|claude-fable-5')), FABLE);
  assert.deepEqual(pick(rows.get('2026-07-05T01:00:00Z|claude-opus-5-5')), OPUS55);
  assert.deepEqual(pick(rows.get('2026-07-28T20:00:00Z|claude-opus-5')), SUB);
  assert.equal(rows.get('2026-07-05T00:00:00Z|claude-fable-5').reasoning, 0);
  assert.equal(ctx.stats.badLines, 1);
  assert.equal(ctx.stats.filesSeen, 2);
});

test('claude: unchanged files are skipped; appended lines parse from the stored offset', async () => {
  const home = fakeHome({ codex: false, gemini: false });
  const root = join(home, '.claude');
  const ctx1 = ctxFor(root);
  await run(ctx1);
  const cursor = JSON.parse(JSON.stringify(ctx1.cursor));

  const ctx2 = ctxFor(root, cursor);
  const again = await run(ctx2);
  assert.equal(again.size, 0);
  assert.equal(ctx2.stats.filesChanged, 0);

  const file = join(root, 'projects', '-placeholder-project', 'session.jsonl');
  const line = {
    type: 'assistant', uuid: 'fx-appended', requestId: 'req_fx_appended', timestamp: '2026-07-05T02:15:00.000Z',
    message: { model: 'claude-fable-5', id: 'msg_fx_appended', usage: { input_tokens: 7, output_tokens: 8, cache_read_input_tokens: 9, cache_creation_input_tokens: 10, cache_creation: { ephemeral_5m_input_tokens: 10, ephemeral_1h_input_tokens: 0 } } },
  };
  const before = statSync(file).size;
  appendFileSync(file, JSON.stringify(line) + '\n');
  const ctx3 = ctxFor(root, JSON.parse(JSON.stringify(ctx2.cursor)));
  const delta = await run(ctx3);
  assert.equal(ctx3.stats.filesChanged, 1);
  assert.equal(ctx3.stats.bytesRead, statSync(file).size - before);
  assert.deepEqual([...delta.keys()], ['2026-07-05T02:00:00Z|claude-fable-5']);
  assert.deepEqual(pick(delta.get('2026-07-05T02:00:00Z|claude-fable-5')), {
    input: 7, output: 8, cache_write_5m: 10, cache_write_1h: 0, cache_read: 9, requests: 1, conversations: 0,
  });
});

test('claude: a partial trailing line is not consumed until it is complete', async () => {
  const home = fakeHome({ codex: false, gemini: false });
  const root = join(home, '.claude');
  const file = join(root, 'projects', '-placeholder-project', 'session.jsonl');
  const ctx1 = ctxFor(root);
  await run(ctx1);
  const line = JSON.stringify({
    type: 'assistant', requestId: 'req_fx_partial', timestamp: '2026-07-05T03:00:01.000Z',
    message: { model: 'claude-fable-5', id: 'msg_fx_partial', usage: { input_tokens: 1, output_tokens: 1 } },
  });
  appendFileSync(file, line.slice(0, 40));
  const ctx2 = ctxFor(root, JSON.parse(JSON.stringify(ctx1.cursor)));
  assert.equal((await run(ctx2)).size, 0);
  appendFileSync(file, line.slice(40) + '\n');
  const ctx3 = ctxFor(root, JSON.parse(JSON.stringify(ctx2.cursor)));
  const rows = await run(ctx3);
  assert.equal(rows.get('2026-07-05T03:00:00Z|claude-fable-5')?.requests, 1);
});

test('claude: a shrunk file is reparsed from 0 and dedup prevents double counting', async () => {
  const home = fakeHome({ codex: false, gemini: false });
  const root = join(home, '.claude');
  const file = join(root, 'projects', '-placeholder-project', 'session.jsonl');
  const ctx1 = ctxFor(root);
  await run(ctx1);
  const text = readFileSync(file, 'utf8');
  writeFileSync(file, text.split('\n').slice(0, 12).join('\n') + '\n'); // rewrite shorter
  const ctx2 = ctxFor(root, JSON.parse(JSON.stringify(ctx1.cursor)));
  const rows = await run(ctx2);
  assert.equal(ctx2.stats.filesChanged, 1);
  for (const r of rows.values()) assert.equal(r.requests, 0, 'no usage re-counted');
});

test('claude: cache_creation split that disagrees with the total keeps the total (model fallback lines)', () => {
  const u = claude.claudeUsage({
    input_tokens: 2, output_tokens: 10, cache_read_input_tokens: 5, cache_creation_input_tokens: 54914,
    cache_creation: { ephemeral_1h_input_tokens: 113733, ephemeral_5m_input_tokens: 0 },
  });
  assert.equal(u.cache_write_5m + u.cache_write_1h, 54914);
  assert.equal(u.cache_write_1h, 54914);
  const legacy = claude.claudeUsage({ input_tokens: 1, output_tokens: 1, cache_creation_input_tokens: 40 });
  assert.equal(legacy.cache_write_5m, 40);
  assert.equal(claude.claudeUsage({ input_tokens: 0, output_tokens: 0 }), null);
});

test('claude: CLAUDE_CONFIG_DIR-style multiple roots are all scanned', async () => {
  const a = fakeHome({ codex: false, gemini: false });
  const b = fakeHome({ codex: false, gemini: false });
  const ctx = { ...ctxFor(join(a, '.claude')), paths: [join(a, '.claude'), join(b, '.claude')] };
  const rows = await run(ctx);
  assert.equal(ctx.stats.filesSeen, 4);
  // identical message ids in both roots count once
  assert.deepEqual(pick(rows.get('2026-07-05T00:00:00Z|claude-fable-5')).input, FABLE.input);
});
