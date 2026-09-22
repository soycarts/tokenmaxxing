#!/usr/bin/env node
// Re-fetch the bundled pricing snapshots (dev/CI only — the CLI never fetches prices at runtime).
//
//   node scripts/update-pricing.mjs              # writes src/pricing/*.snapshot.json; bumps SNAPSHOT_DATE only if one changed
//   node scripts/update-pricing.mjs --check      # exit 1 if upstream differs from the bundled snapshots (writes nothing)
//   node scripts/update-pricing.mjs --out <dir>  # write the fresh snapshots to <dir> instead (for pricing-diff.mjs)
//
// SNAPSHOT_DATE is the date the bundled prices last changed, so a no-op refresh leaves the tree clean
// (the daily pricing workflow opens a PR only when `git diff` is non-empty).
//
// LiteLLM is trimmed to the chat-capable providers the parsers can emit model ids for, keeping only
// pricing/limit fields (every key containing `_cost`, which includes cache_creation_input_token_cost_above_1hr);
// models.dev is trimmed to { openai|anthropic|google: { models: { id: { cost, name } } } }.
//
// Retired models keep their last price: an in-scope id that upstream drops (LiteLLM deletes models after their
// deprecation_date) is carried over from the bundled snapshot with `retained_since: <date>`, so historical
// usage stays priced instead of turning unpriced. Delete an entry by hand to drop it for good.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const LITELLM_URL = 'https://raw.githubusercontent.com/BerriAI/litellm/main/model_prices_and_context_window.json';
const MODELSDEV_URL = 'https://models.dev/api.json';
// Not vertex_ai-anthropic_models: Vertex ids (`claude-x@date`) already normalise to the first-party
// Anthropic key, and several Vertex entries lack cache rates, so as the shortest id sharing a normalised
// key they would win the alias and price cache reads at the input rate (10x) for retired models.
const PROVIDERS = new Set([
  'anthropic', 'openai', 'text-completion-openai', 'gemini', 'vertex_ai-language-models',
  'bedrock', 'bedrock_converse', 'deepseek',
]);
const META = new Set(['litellm_provider', 'mode', 'max_input_tokens', 'max_output_tokens', 'deprecation_date', 'retained_since']);
const KEEP = (k) => k.includes('_cost') || META.has(k);
const MODELSDEV_PROVIDERS = ['openai', 'anthropic', 'google'];
const today = new Date().toISOString().slice(0, 10);

const src = (p) => new URL(`../src/pricing/${p}`, import.meta.url);

async function getJson(url) {
  const res = await fetch(url, { signal: AbortSignal.timeout(60_000) });
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
  return res.json();
}

const priced = (e) => e && PROVIDERS.has(e.litellm_provider) && typeof e.input_cost_per_token === 'number' && typeof e.output_cost_per_token === 'number';
const trimEntry = (e) => Object.fromEntries(Object.entries(e).filter(([k]) => KEEP(k)));

function trimLitellm(all, bundled) {
  const out = {};
  for (const [id, e] of Object.entries(all)) {
    if (id === 'sample_spec' || !priced(e)) continue;
    out[id] = trimEntry(e);
  }
  for (const [id, e] of Object.entries(bundled)) {
    if (id in out || id === 'sample_spec' || !priced(e)) continue;
    out[id] = { ...trimEntry(e), retained_since: e.retained_since ?? today };
  }
  return out;
}

function trimModelsdev(all, bundled) {
  const out = {};
  for (const p of MODELSDEV_PROVIDERS) {
    const models = {};
    for (const [id, m] of Object.entries(all[p]?.models ?? {})) if (m?.cost) models[id] = { cost: m.cost, name: m.name };
    for (const [id, m] of Object.entries(bundled[p]?.models ?? {})) {
      if (!(id in models) && m?.cost) models[id] = { cost: m.cost, name: m.name, retained_since: m.retained_since ?? today };
    }
    out[p] = { models };
  }
  return out;
}

const bundledJson = (f) => {
  try {
    return JSON.parse(readFileSync(src(f), 'utf8'));
  } catch {
    return {};
  }
};

const [litellm, modelsdev] = await Promise.all([getJson(LITELLM_URL), getJson(MODELSDEV_URL)]);
const next = {
  'litellm.snapshot.json': JSON.stringify(trimLitellm(litellm, bundledJson('litellm.snapshot.json'))),
  'modelsdev.snapshot.json': JSON.stringify(trimModelsdev(modelsdev, bundledJson('modelsdev.snapshot.json'))),
};

const changed = Object.entries(next).filter(([f, body]) => readFileSync(src(f), 'utf8').trim() !== body).map(([f]) => f);

if (process.argv.includes('--check')) {
  console.log(changed.length ? `upstream differs from the bundled snapshot: ${changed.join(', ')} (run \`npm run pricing:refresh\`)` : 'pricing snapshots up to date');
  process.exit(changed.length ? 1 : 0);
}

const outAt = process.argv.indexOf('--out');
if (outAt !== -1) {
  const dir = process.argv[outAt + 1];
  if (!dir) throw new Error('--out needs a directory');
  mkdirSync(dir, { recursive: true });
  for (const [f, body] of Object.entries(next)) writeFileSync(join(dir, f), body + '\n');
  writeFileSync(join(dir, 'overrides.json'), readFileSync(src('overrides.json')));
  console.log(`wrote ${Object.keys(next).join(', ')} and overrides.json to ${dir}`);
  process.exit(0);
}

if (!changed.length) {
  console.log('pricing snapshots up to date; nothing written');
  process.exit(0);
}
for (const f of changed) writeFileSync(src(f), next[f] + '\n');
const idx = src('index.ts');
writeFileSync(idx, readFileSync(idx, 'utf8').replace(/export const SNAPSHOT_DATE = '[\d-]+';/, `export const SNAPSHOT_DATE = '${today}';`));
console.log(`wrote ${changed.join(', ')}; SNAPSHOT_DATE = ${today}`);
