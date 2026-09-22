#!/usr/bin/env node
// Re-fetch the bundled pricing snapshots (dev/CI only — the CLI never fetches prices at runtime).
//
//   node scripts/update-pricing.mjs            # writes src/pricing/*.snapshot.json and bumps SNAPSHOT_DATE
//   node scripts/update-pricing.mjs --check    # exit 1 if upstream differs from the bundled snapshots
//
// LiteLLM is trimmed to the chat-capable providers the parsers can emit model ids for, keeping only
// pricing/limit fields; models.dev is trimmed to { openai|anthropic|google: { models: { id: { cost, name } } } }.
import { readFileSync, writeFileSync } from 'node:fs';

const LITELLM_URL = 'https://raw.githubusercontent.com/BerriAI/litellm/main/model_prices_and_context_window.json';
const MODELSDEV_URL = 'https://models.dev/api.json';
const PROVIDERS = new Set([
  'anthropic', 'openai', 'text-completion-openai', 'gemini', 'vertex_ai-language-models', 'vertex_ai-anthropic_models',
  'bedrock', 'bedrock_converse', 'deepseek',
]);
const KEEP = (k) => k.endsWith('_cost') || k.includes('_cost_per_') || ['litellm_provider', 'mode', 'max_input_tokens', 'max_output_tokens'].includes(k);

const src = (p) => new URL(`../src/pricing/${p}`, import.meta.url);

async function getJson(url) {
  const res = await fetch(url, { signal: AbortSignal.timeout(60_000) });
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
  return res.json();
}

function trimLitellm(all) {
  const out = {};
  for (const [id, e] of Object.entries(all)) {
    if (id === 'sample_spec' || !e || !PROVIDERS.has(e.litellm_provider)) continue;
    if (typeof e.input_cost_per_token !== 'number' || typeof e.output_cost_per_token !== 'number') continue;
    out[id] = Object.fromEntries(Object.entries(e).filter(([k]) => KEEP(k)));
  }
  return out;
}

function trimModelsdev(all) {
  const out = {};
  for (const p of ['openai', 'anthropic', 'google']) {
    const models = {};
    for (const [id, m] of Object.entries(all[p]?.models ?? {})) if (m?.cost) models[id] = { cost: m.cost, name: m.name };
    out[p] = { models };
  }
  return out;
}

const [litellm, modelsdev] = await Promise.all([getJson(LITELLM_URL), getJson(MODELSDEV_URL)]);
const next = {
  'litellm.snapshot.json': JSON.stringify(trimLitellm(litellm)),
  'modelsdev.snapshot.json': JSON.stringify(trimModelsdev(modelsdev)),
};

if (process.argv.includes('--check')) {
  const changed = Object.entries(next).filter(([f, body]) => readFileSync(src(f), 'utf8').trim() !== body);
  console.log(changed.length ? `changed: ${changed.map(([f]) => f).join(', ')}` : 'pricing snapshots up to date');
  process.exit(changed.length ? 1 : 0);
}

for (const [f, body] of Object.entries(next)) writeFileSync(src(f), body + '\n');
const today = new Date().toISOString().slice(0, 10);
const idx = src('index.ts');
writeFileSync(idx, readFileSync(idx, 'utf8').replace(/export const SNAPSHOT_DATE = '[\d-]+';/, `export const SNAPSHOT_DATE = '${today}';`));
console.log(`wrote ${Object.keys(next).join(', ')}; SNAPSHOT_DATE = ${today}`);
