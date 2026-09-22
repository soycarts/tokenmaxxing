import { readFileSync } from 'node:fs';
import type { Bucket } from '../types.js';

export const SNAPSHOT_DATE = '2026-09-22';

/** USD per token. */
export interface Rates {
  input: number;
  cache_read: number;
  cache_write_5m: number;
  cache_write_1h: number;
  output: number;
}

type Json = Record<string, any>;
let litellm: Json | undefined;
let modelsdev: Json | undefined;
let overrides: Json | undefined;

function load(name: string): Json {
  return JSON.parse(readFileSync(new URL(`./${name}`, import.meta.url), 'utf8'));
}

function tables() {
  litellm ??= load('litellm.snapshot.json');
  modelsdev ??= load('modelsdev.snapshot.json');
  overrides ??= load('overrides.json');
  return { litellm: litellm!, modelsdev: modelsdev!, overrides: overrides! };
}

/** Test hook: replace the bundled tables (pass `undefined` to reload the bundled one). */
export function _setTables(t: { litellm?: Json; modelsdev?: Json; overrides?: Json }): void {
  if ('litellm' in t) litellm = t.litellm;
  if ('modelsdev' in t) modelsdev = t.modelsdev;
  if ('overrides' in t) overrides = t.overrides;
  cache.clear();
  normIndex = undefined;
  zeroCanon = undefined;
}

const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

/** Note for a model that upstream lists at $0 input and $0 output: that is not a price, so it is unpriced. */
export const ZERO_UPSTREAM_NOTE = 'listed at $0 upstream';

const zeroLitellm = (e: any): boolean => !!e && e.input_cost_per_token === 0 && e.output_cost_per_token === 0;
const zeroModelsdev = (e: any): boolean => !!e?.cost && e.cost.input === 0 && e.cost.output === 0;

function fromLitellm(e: any): Rates | null {
  if (!e || !isNum(e.input_cost_per_token) || !isNum(e.output_cost_per_token) || zeroLitellm(e)) return null;
  const input = e.input_cost_per_token;
  const w5 = isNum(e.cache_creation_input_token_cost) ? e.cache_creation_input_token_cost : input;
  return {
    input,
    cache_read: isNum(e.cache_read_input_token_cost) ? e.cache_read_input_token_cost : input,
    cache_write_5m: w5,
    cache_write_1h: isNum(e.cache_creation_input_token_cost_above_1hr) ? e.cache_creation_input_token_cost_above_1hr : w5,
    output: e.output_cost_per_token,
  };
}

function fromModelsdev(provider: string, e: any): Rates | null {
  const c = e?.cost;
  if (!c || !isNum(c.input) || !isNum(c.output) || zeroModelsdev(e)) return null;
  const input = c.input / 1e6;
  const write = isNum(c.cache_write) ? c.cache_write / 1e6 : input;
  return {
    input,
    cache_read: isNum(c.cache_read) ? c.cache_read / 1e6 : input,
    cache_write_5m: write,
    cache_write_1h: provider === 'anthropic' ? write * 1.6 : write,
    output: c.output / 1e6,
  };
}

/**
 * overrides.json: `{ "<model>": { input, output, cache_read?, cache_write_5m?, cache_write_1h? } }` in USD per MILLION tokens,
 * or `{ "<model>": { "unpriced": "<note>" } }` to pin a model as unpriced with a note.
 */
function fromOverride(e: any): Rates | null {
  if (!e || !isNum(e.input) || !isNum(e.output)) return null;
  const input = e.input / 1e6;
  const w5 = isNum(e.cache_write_5m) ? e.cache_write_5m / 1e6 : input;
  return {
    input,
    cache_read: isNum(e.cache_read) ? e.cache_read / 1e6 : input,
    cache_write_5m: w5,
    cache_write_1h: isNum(e.cache_write_1h) ? e.cache_write_1h / 1e6 : w5,
    output: e.output / 1e6,
  };
}

function modelsdevExact(id: string): Rates | null {
  const md = tables().modelsdev;
  for (const provider of Object.keys(md)) {
    const e = md[provider]?.models?.[id];
    const r = e && fromModelsdev(provider, e);
    if (r) return r;
  }
  return null;
}

/** lowercase, strip provider prefix (anthropic/…, us.anthropic.…), bedrock `-v1:0` and date suffixes. */
export function normalize(model: string): string {
  let m = model.trim().toLowerCase();
  m = m.replace(/^.*\//, '');
  m = m.replace(/^(?:[a-z]{2,4}\.)?(?:anthropic|openai|google|meta|amazon)\./, '');
  m = m.replace(/-v\d+(?::\d+)?$/, '');
  m = m.replace(/[-@]\d{8}$/, '').replace(/-\d{4}-\d{2}-\d{2}$/, '');
  return m;
}

/** Canonical form for fuzzy matching: normalised, with version dots as dashes (claude-opus-5.5 == claude-opus-5-5). */
export function canon(model: string): string {
  return normalize(model).replace(/(\d)\.(\d)/g, '$1-$2');
}

/** Candidate ids to try as exact keys, most specific first. */
export function candidates(model: string): string[] {
  const out = new Set<string>();
  for (const s of [model.trim().toLowerCase(), normalize(model)]) {
    out.add(s);
    out.add(s.replace(/(\d)-(\d)/g, '$1.$2'));
    out.add(s.replace(/(\d)\.(\d)/g, '$1-$2'));
  }
  return [...out];
}

let normIndex: Map<string, string> | undefined;
let zeroCanon: Set<string> | undefined;
function litellmCanonIndex(): Map<string, string> {
  if (normIndex) return normIndex;
  normIndex = new Map();
  zeroCanon = new Set();
  const ll = tables().litellm;
  // Shortest key first so an un-prefixed id wins over bedrock/vertex variants. Entries listed at $0/$0 never
  // take the slot (they are not prices); they are only remembered for the unpriced note.
  const keys = Object.keys(ll).sort((a, b) => a.length - b.length || (a < b ? -1 : 1));
  for (const k of keys) {
    const c = canon(k);
    if (zeroLitellm(ll[k])) zeroCanon.add(c);
    else if (!normIndex.has(c)) normIndex.set(c, k);
  }
  return normIndex;
}

/** True when some lookup step for this model hit an upstream entry listed at $0 input and $0 output. */
function listedAtZero(model: string): boolean {
  const { litellm: ll, modelsdev: md } = tables();
  for (const c of [model, ...candidates(model)]) {
    if (zeroLitellm(ll[c])) return true;
    for (const provider of Object.keys(md)) if (zeroModelsdev(md[provider]?.models?.[c])) return true;
  }
  litellmCanonIndex();
  return zeroCanon!.has(canon(model));
}

const cache = new Map<string, Rates | null>();

/** Rates for a model in USD/token, or null when unknown (reported as unpriced, never $0). */
export function resolve(model: string): Rates | null {
  if (cache.has(model)) return cache.get(model)!;
  const r = resolveUncached(model);
  cache.set(model, r);
  return r;
}

/**
 * Why an unpriced model is unpriced, when we know: the note of an `unpriced` pin in overrides.json (bundled
 * models with no list price), or ZERO_UPSTREAM_NOTE when upstream lists it at $0/$0 and nothing else prices it.
 */
export function unpricedNote(model: string): string | undefined {
  const e = tables().overrides[model];
  if (e && typeof e.unpriced === 'string') return e.unpriced;
  return resolve(model) === null && listedAtZero(model) ? ZERO_UPSTREAM_NOTE : undefined;
}

function resolveUncached(model: string): Rates | null {
  const { litellm: ll, overrides: ov } = tables();
  if (ov[model]) {
    if (typeof ov[model].unpriced === 'string') return null; // pinned unpriced: never fuzzy-match a price
    const r = fromOverride(ov[model]);
    if (r) return r;
  }
  let r = fromLitellm(ll[model]);
  if (r) return r;
  r = modelsdevExact(model);
  if (r) return r;
  for (const c of candidates(model)) {
    r = fromOverride(ov[c]) ?? fromLitellm(ll[c]) ?? modelsdevExact(c);
    if (r) return r;
  }
  const k = litellmCanonIndex().get(canon(model));
  return k ? fromLitellm(ll[k]) : null;
}

export function cost(b: Pick<Bucket, 'input' | 'cache_read' | 'cache_write_5m' | 'cache_write_1h' | 'output'>, rates: Rates): number {
  return (
    b.input * rates.input +
    b.cache_read * rates.cache_read +
    b.cache_write_5m * rates.cache_write_5m +
    b.cache_write_1h * rates.cache_write_1h +
    b.output * rates.output
  );
}
