import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import * as gemini from '../dist/parsers/gemini.js';
import { BucketAccumulator } from '../dist/bucket.js';
import { BoundedSet } from '../dist/dedup.js';
import { newStats } from '../dist/parsers/context.js';
import { fakeHome } from './helpers.mjs';

function ctxFor(root, cursor = { files: {}, dedup: [], badLines: 0 }) {
  return { paths: [root], cursor, dedup: new BoundedSet(10, []), acc: new BucketAccumulator(), stats: newStats() };
}
const pick = ({ input, cache_read, output, reasoning, requests, conversations }) => ({ input, cache_read, output, reasoning, requests, conversations });

// Hand-computed from test/fixtures/gemini/chats/x.json:
//   m2 gemini-2.5-pro: input 12000-8000 = 4000, cached 8000, output 900+100(tool)+400(thoughts) = 1400, reasoning 400
//   m4 (no model, `type` key): gemini-unknown, input 3000, output 250+0+50 = 300, reasoning 50
//   m5 all-zero: skipped. m1/m3 user prompts → one conversation each.
test('gemini: fixture totals and incremental message index', async () => {
  const home = fakeHome({ claude: false, codex: false });
  const root = join(home, '.gemini');
  const ctx = ctxFor(root);
  const rows = new Map((await gemini.parse(ctx)).map((r) => [`${r.ts}|${r.model}`, r]));
  assert.deepEqual(pick(rows.get('2026-09-20T10:00:00Z|gemini-2.5-pro')), { input: 4000, cache_read: 8000, output: 1400, reasoning: 400, requests: 1, conversations: 1 });
  assert.deepEqual(pick(rows.get('2026-09-20T11:00:00Z|gemini-unknown')), { input: 3000, cache_read: 0, output: 300, reasoning: 50, requests: 1, conversations: 1 });
  assert.equal(rows.size, 2);

  const file = join(root, 'tmp', 'placeholder-hash', 'chats', 'x.json');
  const doc = JSON.parse(readFileSync(file, 'utf8'));
  doc.messages.push({ role: 'model', timestamp: '2026-09-20T12:00:00.000Z', model: 'gemini-2.5-pro', tokens: { input: 10, cached: 0, output: 5, tool: 0, thoughts: 0 } });
  writeFileSync(file, JSON.stringify(doc));
  const ctx2 = ctxFor(root, JSON.parse(JSON.stringify(ctx.cursor)));
  const delta = await gemini.parse(ctx2);
  assert.equal(delta.length, 1);
  assert.deepEqual(pick(delta[0]), { input: 10, cache_read: 0, output: 5, reasoning: 0, requests: 1, conversations: 0 });
});

test('gemini: missing directory yields nothing', async () => {
  const home = fakeHome({ claude: false, codex: false, gemini: false });
  assert.deepEqual(await gemini.parse(ctxFor(join(home, '.gemini'))), []);
});
