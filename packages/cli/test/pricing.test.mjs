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

test('listed at $0 input and $0 output upstream = unpriced with a note; a real price elsewhere or an override wins', async () => {
  const { unpricedNote, ZERO_UPSTREAM_NOTE } = await import('../dist/pricing/index.js');
  assert.equal(ZERO_UPSTREAM_NOTE, 'listed at $0 upstream');
  const zero = { input_cost_per_token: 0, output_cost_per_token: 0, litellm_provider: 'gemini' };
  withTables({
    litellm: {
      'gemini-free-exp': zero,
      'gemini/gemini-free-exp-2': zero,
      'gemini/free-gemma': zero, // shortest id for canon "free-gemma", but not a price
      'google.free-gemma': { input_cost_per_token: 2.3e-7, output_cost_per_token: 3.8e-7, litellm_provider: 'bedrock_converse' },
      'gemini-overridden': zero,
      'gemini-half-free': { input_cost_per_token: 0, output_cost_per_token: 1e-6, litellm_provider: 'gemini' },
    },
    modelsdev: { google: { models: { 'gemini-md-free': { cost: { input: 0, output: 0 } } } } },
    overrides: { 'gemini-overridden': { input: 1, output: 2, source: 'https://ai.google.dev/gemini-api/docs/pricing', added: '2026-09-22' } },
  }, () => {
    // exact, prefixed/normalised and models.dev hits on a $0/$0 entry are unpriced, never $0
    for (const m of ['gemini-free-exp', 'gemini-free-exp-2', 'gemini-md-free']) {
      assert.equal(resolve(m), null, m);
      assert.equal(unpricedNote(m), 'listed at $0 upstream', m);
    }
    // another entry for the same normalised model with a real price is used instead
    assert.equal(resolve('free-gemma').input, 2.3e-7);
    assert.equal(resolve('gemini/free-gemma').input, 2.3e-7);
    assert.equal(unpricedNote('free-gemma'), undefined);
    // an explicit override with a real price still wins
    assert.equal(resolve('gemini-overridden').input, 1e-6);
    assert.equal(unpricedNote('gemini-overridden'), undefined);
    // only both rates at 0 counts: a free input with a paid output is a price
    assert.equal(resolve('gemini-half-free').output, 1e-6);
    // an unknown model gets no note
    assert.equal(unpricedNote('gemini-unknown'), undefined);
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
});

test('overrides.json: every entry is an unpriced pin or a cited vendor price (never an invented one)', async () => {
  const ov = JSON.parse((await import('node:fs')).readFileSync(new URL('../src/pricing/overrides.json', import.meta.url), 'utf8'));
  for (const [model, e] of Object.entries(ov)) {
    if ('unpriced' in e) {
      assert.deepEqual(Object.keys(e), ['unpriced'], model);
      assert.equal(typeof e.unpriced, 'string', model);
      continue;
    }
    assert.ok(typeof e.input === 'number' && typeof e.output === 'number', `${model}: input and output (USD per million) are required`);
    assert.match(e.source ?? '', /^https:\/\/\S+$/, `${model}: source must be the vendor's https pricing page or announcement`);
    assert.match(e.added ?? '', /^\d{4}-\d{2}-\d{2}$/, `${model}: added must be YYYY-MM-DD`);
    const allowed = ['input', 'output', 'cache_read', 'cache_write_5m', 'cache_write_1h', 'source', 'added'];
    for (const k of Object.keys(e)) assert.ok(allowed.includes(k), `${model}: unknown field ${k}`);
    for (const k of ['input', 'output', 'cache_read', 'cache_write_5m', 'cache_write_1h']) {
      if (k in e) assert.ok(typeof e[k] === 'number' && e[k] >= 0, `${model}: ${k} must be a non-negative number`);
    }
    assert.ok(resolve(model), `${model}: override does not resolve`);
  }
});
