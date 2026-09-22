import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolve, cost, candidates, normalize, SNAPSHOT_DATE, _setTables } from '../dist/pricing/index.js';

const T = { input: 21721, output: 513976, cache_write_5m: 3570946, cache_write_1h: 0, cache_read: 221663704 };

// claude-fable-5-1 as LiteLLM priced it on 2026-09-22. The sanity test runs on this fixed table, not the
// bundled snapshot, so it checks the mapping and the math and never blocks a legitimate price change.
const FABLE_5_1 = {
  input_cost_per_token: 1e-5,
  output_cost_per_token: 5e-5,
  cache_read_input_token_cost: 2.5e-7,
  cache_creation_input_token_cost: 1.25e-5,
  cache_creation_input_token_cost_above_1hr: 2e-5,
  litellm_provider: 'anthropic',
};

function withTables(t, fn) {
  _setTables({ litellm: {}, modelsdev: {}, overrides: {}, ...t });
  try {
    return fn();
  } finally {
    _setTables({ litellm: undefined, modelsdev: undefined, overrides: undefined });
  }
}

test('claude-fable-5-1 sanity cost matches ccusage (125.97 ± 0.01) on the fixed rate table', () => {
  withTables({ litellm: { 'claude-fable-5-1': FABLE_5_1 } }, () => {
    const r = resolve('claude-fable-5-1');
    assert.ok(r);
    assert.ok(Math.abs(cost(T, r) - 125.97) <= 0.01, `got ${cost(T, r)}`);
    // the same tokens written to the 1h cache cost exactly (1h - 5m rate) more
    const oneHour = { ...T, cache_write_5m: 0, cache_write_1h: T.cache_write_5m };
    assert.ok(Math.abs(cost(oneHour, r) - cost(T, r) - 3570946 * (2e-5 - 1.25e-5)) < 1e-6);
  });
});

test('bundled snapshot: claude-fable-5-1 is priced and its 1h cache write costs more than 5m', () => {
  const r = resolve('claude-fable-5-1');
  assert.ok(r, 'claude-fable-5-1 missing from the bundled snapshot');
  for (const [k, v] of Object.entries(r)) assert.ok(v > 0, `${k} is ${v}`);
  const oneHour = { ...T, cache_write_5m: 0, cache_write_1h: T.cache_write_5m };
  assert.ok(cost(oneHour, r) > cost(T, r), 'cache_write_1h must be above cache_write_5m (was the 1h field trimmed?)');
});

test('snapshot date constant is an ISO date, not in the future', () => {
  assert.match(SNAPSHOT_DATE, /^\d{4}-\d{2}-\d{2}$/);
  assert.ok(SNAPSHOT_DATE <= new Date().toISOString().slice(0, 10));
});

test('normalised matches: dots, provider prefixes, date and bedrock suffixes', () => {
  const base = resolve('claude-opus-5-5');
  assert.ok(base);
  assert.deepEqual(resolve('claude-opus-5.5'), base);
  assert.deepEqual(resolve('anthropic/claude-opus-5-5'), base);
  assert.deepEqual(resolve('Claude-Opus-5-5'), base);
  assert.deepEqual(resolve('us.anthropic.claude-opus-5-5-v1:0'), base);
  assert.deepEqual(resolve('claude-opus-5-5-20260101'), base);
  assert.equal(normalize('anthropic/claude-haiku-4-5-20251001'), 'claude-haiku-4-5');
  assert.ok(candidates('claude-opus-5-5').includes('claude-opus-5.5'));
});

test('unknown models are null (reported unpriced, never $0)', () => {
  assert.equal(resolve('unknown-codex'), null);
  assert.equal(resolve('gemini-unknown'), null);
  assert.equal(resolve('totally-made-up-model-9'), null);
});

test('LiteLLM mapping: missing cache_creation falls back to input; 1h falls back to 5m', () => {
  const entry = { input_cost_per_token: 1.25e-6, output_cost_per_token: 1e-5, cache_read_input_token_cost: 1.25e-7, litellm_provider: 'openai' };
  withTables({ litellm: { 'gpt-5.1-codex-max': entry } }, () => {
    const r = resolve('gpt-5.1-codex-max');
    assert.equal(r.input, 0.00000125);
    assert.equal(r.cache_read, 1.25e-7);
    assert.equal(r.cache_write_5m, r.input);
    assert.equal(r.cache_write_1h, r.cache_write_5m);
  });
});

test('resolution order: overrides > LiteLLM exact > models.dev exact (anthropic 1h = 1.6×)', () => {
  _setTables({
    litellm: { 'll-model': { input_cost_per_token: 1e-6, output_cost_per_token: 2e-6, cache_read_input_token_cost: 1e-7, cache_creation_input_token_cost: 1.25e-6 } },
    modelsdev: {
      anthropic: { models: { 'md-claude': { cost: { input: 3, output: 15, cache_read: 0.3, cache_write: 3.75 } }, 'll-model': { cost: { input: 99, output: 99 } } } },
      openai: { models: { 'md-gpt': { cost: { input: 2, output: 8 } } } },
    },
    overrides: { 'll-model': { input: 5, output: 10 } },
  });
  try {
    assert.equal(resolve('ll-model').input, 5e-6); // override wins
    const md = resolve('md-claude');
    assert.equal(md.input, 3e-6);
    assert.ok(Math.abs(md.cache_write_1h - 3.75e-6 * 1.6) < 1e-15);
    const gpt = resolve('md-gpt');
    assert.equal(gpt.cache_read, gpt.input); // missing cache_read -> input
    assert.equal(gpt.cache_write_1h, gpt.cache_write_5m); // non-anthropic: no 1h premium
  } finally {
    _setTables({ litellm: undefined, modelsdev: undefined, overrides: undefined });
  }
});

test('bundled overrides pin codex-auto-review and gpt-reserve as unpriced with a note (no invented price)', async () => {
  const { unpricedNote } = await import('../dist/pricing/index.js');
  assert.equal(resolve('codex-auto-review'), null);
  assert.equal(resolve('gpt-reserve'), null);
  assert.equal(unpricedNote('codex-auto-review'), 'bundled reviewer, no list price');
  assert.equal(unpricedNote('gpt-reserve'), 'bundled with Codex, no list price');
  assert.equal(unpricedNote('gpt-6-astra'), undefined);
  const ov = JSON.parse((await import('node:fs')).readFileSync(new URL('../src/pricing/overrides.json', import.meta.url), 'utf8'));
  for (const e of Object.values(ov)) assert.deepEqual(Object.keys(e), ['unpriced']);
});
