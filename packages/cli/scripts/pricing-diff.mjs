#!/usr/bin/env node
// Markdown diff of effective API prices between two pricing snapshot sets.
//
//   node scripts/pricing-diff.mjs                        # HEAD vs working tree
//   node scripts/pricing-diff.mjs <base> [<head>]        # each a git ref, or a directory / snapshot file path
//   node scripts/pricing-diff.mjs HEAD /tmp/fresh        # e.g. after `update-pricing.mjs --out /tmp/fresh`
//   node scripts/pricing-diff.mjs --fail-on-change       # exit 1 when anything changed (default: always exit 0)
//
// A snapshot set is litellm.snapshot.json + modelsdev.snapshot.json + overrides.json (+ index.ts for
// SNAPSHOT_DATE). A git ref reads them from packages/cli/src/pricing at that ref; a directory reads them
// from that directory (a missing file counts as empty); the word WORKTREE means the working tree.
//
// Rates are resolved with the CLI's exact-key precedence (overrides → LiteLLM → models.dev, same field
// mapping as src/pricing/index.ts) and shown in USD per million tokens. Only ids the parsers can emit are
// compared: un-prefixed anthropic/openai/google ids (claude-*, gpt-*, chatgpt-*, codex-*, o1..o9*, gemini-*),
// plus the normalised alias rows that price dated/prefixed ids (source "alias of <id>"), since a change in
// which entry wins an alias changes what users pay just as a rate change does. Ids that share a canonical
// form and an identical change are collapsed into one row.
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, resolve as resolvePath } from 'node:path';
import { fileURLToPath } from 'node:url';

const PRICING = 'packages/cli/src/pricing';
const FILES = ['litellm.snapshot.json', 'modelsdev.snapshot.json', 'overrides.json', 'index.ts'];
const FIELDS = [
  ['input', 'Input'],
  ['cache_read', 'Cache read'],
  ['cache_write_5m', 'Cache write 5m'],
  ['cache_write_1h', 'Cache write 1h'],
  ['output', 'Output'],
];
const FAMILY = /^(?:claude|gpt|chatgpt|codex|o[1-9]|gemini)(?:[-.]|$)/;
const MAX_BODY = 60_000; // GitHub PR bodies cap at 65,536 characters

const here = dirname(fileURLToPath(import.meta.url));
const root = (() => {
  try {
    return execFileSync('git', ['rev-parse', '--show-toplevel'], { cwd: here, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  } catch {
    return resolvePath(here, '../../..');
  }
})();

// ---------- loading ----------

function fromDir(dir, label = dir) {
  const read = (f) => (existsSync(join(dir, f)) ? readFileSync(join(dir, f), 'utf8') : undefined);
  return { label, ...Object.fromEntries(FILES.map((f) => [f, read(f)])) };
}

function fromRef(ref) {
  execFileSync('git', ['rev-parse', '--verify', '--quiet', `${ref}^{commit}`], { cwd: root, stdio: 'ignore' });
  const read = (f) => {
    try {
      return execFileSync('git', ['show', `${ref}:${PRICING}/${f}`], { cwd: root, encoding: 'utf8', maxBuffer: 256 << 20, stdio: ['ignore', 'pipe', 'ignore'] });
    } catch {
      return undefined;
    }
  };
  return { label: ref, ...Object.fromEntries(FILES.map((f) => [f, read(f)])) };
}

function load(spec) {
  if (spec === 'WORKTREE') return fromDir(join(root, PRICING), 'working tree');
  if (existsSync(spec)) return fromDir(statSync(spec).isDirectory() ? spec : dirname(spec), spec);
  try {
    return fromRef(spec);
  } catch {
    throw new Error(`${spec}: not a directory, snapshot file or git ref`);
  }
}

const parse = (text) => (text ? JSON.parse(text) : {});
const snapshotDate = (ts) => /SNAPSHOT_DATE\s*=\s*['"](\d{4}-\d{2}-\d{2})['"]/.exec(ts ?? '')?.[1];

// ---------- rates (mirrors src/pricing/index.ts; USD per token) ----------

const isNum = (v) => typeof v === 'number' && Number.isFinite(v);

function fromLitellm(e) {
  if (!e || !isNum(e.input_cost_per_token) || !isNum(e.output_cost_per_token)) return null;
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

function fromModelsdev(provider, e) {
  const c = e?.cost;
  if (!c || !isNum(c.input) || !isNum(c.output)) return null;
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

function fromOverride(e) {
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

/** Same as the CLI's canon(): normalised id with version dots as dashes. */
function canon(model) {
  return model
    .trim()
    .toLowerCase()
    .replace(/^.*\//, '')
    .replace(/^(?:[a-z]{2,4}\.)?(?:anthropic|openai|google|meta|amazon)\./, '')
    .replace(/-v\d+(?::\d+)?$/, '')
    .replace(/[-@]\d{8}$/, '')
    .replace(/-\d{4}-\d{2}-\d{2}$/, '')
    .replace(/(\d)\.(\d)/g, '$1-$2');
}

/**
 * Map id → { rates, source } for every parser-emittable id priced in this set: exact ids first, then the
 * normalised alias of any priced id (shortest source id wins, as in the CLI's fuzzy step and the site's
 * model_key lookup) when that alias is itself a parser-emittable id with no exact entry.
 */
function priceTable(set) {
  const litellm = parse(set['litellm.snapshot.json']);
  const modelsdev = parse(set['modelsdev.snapshot.json']);
  const overrides = parse(set['overrides.json']);
  const ids = new Set([...Object.keys(overrides), ...Object.keys(litellm)]);
  for (const block of Object.values(modelsdev)) for (const id of Object.keys(block?.models ?? {})) ids.add(id);
  ids.delete('sample_spec');
  const pinned = new Set();
  const exact = new Map();
  for (const id of ids) {
    const ov = overrides[id];
    if (ov && typeof ov.unpriced === 'string') {
      pinned.add(id).add(canon(id));
      continue;
    }
    let rates = fromOverride(ov);
    let source = 'override';
    if (!rates) [rates, source] = [fromLitellm(litellm[id]), 'litellm'];
    if (!rates) {
      for (const [provider, block] of Object.entries(modelsdev)) {
        rates = fromModelsdev(provider, block?.models?.[id]);
        if (rates) {
          source = 'models.dev';
          break;
        }
      }
    }
    if (rates) exact.set(id, { rates, source });
  }
  const out = new Map([...exact].filter(([id]) => FAMILY.test(id)));
  const bySize = [...exact.keys()].sort((a, b) => a.length - b.length || (a < b ? -1 : 1));
  for (const id of bySize) {
    const key = canon(id);
    if (exact.has(key) || out.has(key) || pinned.has(key) || !FAMILY.test(key)) continue;
    out.set(key, { rates: exact.get(id).rates, source: `alias of ${id}` });
  }
  return out;
}

// ---------- diff ----------

const perM = (v) => v * 1e6;
const round = (v) => Number(v.toPrecision(10));
const same = (a, b) => round(perM(a)) === round(perM(b));

/** $2.50, $0.625, $0.0375: at least two decimals, more only when the rate needs them. */
function usd(v) {
  const m = round(perM(v));
  return `$${Number(m.toFixed(2)) === m ? m.toFixed(2) : String(m)}`;
}

function pct(a, b) {
  if (a === 0) return b === 0 ? '0%' : 'from $0';
  const p = ((b - a) / a) * 100;
  const abs = Math.abs(p);
  return `${p > 0 ? '+' : p < 0 ? '−' : ''}${abs.toFixed(abs >= 10 ? 0 : 1)}%`;
}

/** Collapse ids sharing a canonical form and an identical signature; the shortest id names the row. */
function collapse(entries, signature) {
  const groups = new Map();
  for (const e of entries) {
    const k = `${canon(e.id)}\u0000${signature(e)}`;
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(e);
  }
  return [...groups.values()]
    .map((g) => {
      g.sort((a, b) => a.id.length - b.id.length || (a.id < b.id ? -1 : 1));
      return { ...g[0], aliases: g.slice(1).map((e) => e.id) };
    })
    .sort((a, b) => (a.id < b.id ? -1 : 1));
}

const name = (e) => `\`${e.id}\`${e.aliases.length ? ` <sub>(also ${e.aliases.map((a) => `\`${a}\``).join(', ')})</sub>` : ''}`;
const sig = (r) => FIELDS.map(([f]) => round(perM(r[f]))).join(',');

export function diff(baseSet, headSet) {
  const base = priceTable(baseSet);
  const head = priceTable(headSet);
  const changed = [];
  const added = [];
  const removed = [];
  for (const [id, h] of head) {
    const b = base.get(id);
    if (!b) added.push({ id, ...h });
    else if (FIELDS.some(([f]) => !same(b.rates[f], h.rates[f]))) changed.push({ id, old: b, new: h });
  }
  for (const [id, b] of base) if (!head.has(id)) removed.push({ id, ...b });
  return {
    changed: collapse(changed, (e) => `${sig(e.old.rates)}>${sig(e.new.rates)}`),
    added: collapse(added, (e) => sig(e.rates)),
    removed: collapse(removed, (e) => sig(e.rates)),
    counts: { changed: changed.length, added: added.length, removed: removed.length },
  };
}

export function render(baseSet, headSet, d) {
  const date = (s) => (snapshotDate(s['index.ts']) ? ` (SNAPSHOT_DATE ${snapshotDate(s['index.ts'])})` : '');
  const header = ['Model', ...FIELDS.map(([, h]) => h), 'Source'];
  const row = (cells) => `| ${cells.join(' | ')} |`;
  const table = (rows) => [row(header), row(header.map(() => '---')), ...rows.map(row)].join('\n');
  const flat = (e) => [name(e), ...FIELDS.map(([f]) => usd(e.rates[f])), e.source];
  const out = [
    '## API price changes',
    '',
    `Base **${baseSet.label}**${date(baseSet)} → head **${headSet.label}**${date(headSet)}. USD per million tokens; only ids the CLI parsers can emit (anthropic/openai/google families).`,
    '',
    `**${d.counts.changed} changed, ${d.counts.added} added, ${d.counts.removed} removed** (${d.changed.length + d.added.length + d.removed.length} rows after collapsing aliases).`,
  ];
  if (d.changed.length) {
    out.push('', '### Changed', '', table(d.changed.map((e) => [
      name(e),
      ...FIELDS.map(([f]) => (same(e.old.rates[f], e.new.rates[f]) ? usd(e.new.rates[f]) : `${usd(e.old.rates[f])} → **${usd(e.new.rates[f])}** (${pct(e.old.rates[f], e.new.rates[f])})`)),
      e.old.source === e.new.source ? e.new.source : `${e.old.source} → ${e.new.source}`,
    ])));
  }
  if (d.added.length) out.push('', '### Added', '', table(d.added.map(flat)));
  if (d.removed.length) out.push('', '### Removed', '', 'No longer priced by the snapshots (a stale row stays in `model_prices` until deleted by hand).', '', table(d.removed.map(flat)));
  if (!d.changed.length && !d.added.length && !d.removed.length) {
    out.push('', 'No rate changes for parser-emittable models. Any snapshot diff is in other providers, limits or metadata.');
  }
  let md = out.join('\n') + '\n';
  if (md.length > MAX_BODY) {
    const cut = md.lastIndexOf('\n', MAX_BODY - 200);
    md = `${md.slice(0, cut)}\n\n_…truncated at ${MAX_BODY.toLocaleString('en-US')} characters; run \`node packages/cli/scripts/pricing-diff.mjs\` locally for the full table._\n`;
  }
  return md;
}

if (process.argv[1] && resolvePath(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const failOnChange = args.includes('--fail-on-change');
  const [baseSpec = 'HEAD', headSpec = 'WORKTREE'] = args.filter((a) => !a.startsWith('--'));
  const baseSet = load(baseSpec);
  const headSet = load(headSpec);
  const d = diff(baseSet, headSet);
  process.stdout.write(render(baseSet, headSet, d));
  const any = d.counts.changed + d.counts.added + d.counts.removed > 0;
  process.exit(failOnChange && any ? 1 : 0);
}
