#!/usr/bin/env node
/**
 * Emits supabase/seed_prices.sql from the CLI's bundled pricing snapshots, so the site and
 * the CLI price the same tokens the same way.
 *
 *   node scripts/seed-prices.mjs            # writes supabase/seed_prices.sql
 *   node scripts/seed-prices.mjs --check    # exits 1 if the committed file is stale
 *
 * Precedence mirrors the CLI's resolve(): overrides, then LiteLLM exact, then models.dev exact.
 * Every key is also emitted under its normalised form (see modelKey, mirrored by the SQL
 * function public.model_key) unless that form is already a real key, shortest source id first
 * like the CLI's canonical index. That gives the server the CLI's fuzzy-match step as a plain
 * index lookup.
 *
 * Overrides are USD per million tokens (as in the CLI); `{ "unpriced": "<note>" }` pins a model
 * as unpriced: it gets no row, no alias resolves to it, and any stale row is deleted.
 *
 * Output rates are USD per token. Missing cache rates fall back to the input rate, never $0.
 */
import { readFileSync, writeFileSync, existsSync, readdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const pricingDir = resolve(here, "../../../packages/cli/src/pricing");
const outFile = resolve(here, "../supabase/seed_prices.sql");
const FALLBACK_SNAPSHOT_DATE = "2026-09-22";

/**
 * The CLI's canon(): lowercase; drop a `provider/` prefix, a bedrock `us.anthropic.` style
 * prefix, a `-v1:0` suffix and a date suffix; version dots to dashes (opus-5.5 == opus-5-5).
 * Keep in step with public.model_key() in schema.sql (a test compares them).
 */
export function modelKey(model) {
  return model
    .trim()
    .toLowerCase()
    .replace(/^.*\//, "")
    .replace(/^(?:[a-z]{2,4}\.)?(?:anthropic|openai|google|meta|amazon)\./, "")
    .replace(/-v\d+(?::\d+)?$/, "")
    .replace(/[-@]\d{8}$/, "")
    .replace(/-\d{4}-\d{2}-\d{2}$/, "")
    .replace(/(\d)\.(\d)/g, "$1-$2");
}

const num = (v) => (typeof v === "number" && Number.isFinite(v) ? v : undefined);

function fromLitellm(entry) {
  const input = num(entry.input_cost_per_token);
  const output = num(entry.output_cost_per_token);
  if (input === undefined || output === undefined) return null;
  const cacheWrite5m = num(entry.cache_creation_input_token_cost) ?? input;
  return {
    input,
    cache_read: num(entry.cache_read_input_token_cost) ?? input,
    cache_write_5m: cacheWrite5m,
    cache_write_1h: num(entry.cache_creation_input_token_cost_above_1hr) ?? cacheWrite5m,
    output,
  };
}

function fromModelsDev(provider, entry) {
  const c = entry?.cost;
  if (!c) return null;
  const input = num(c.input);
  const output = num(c.output);
  if (input === undefined || output === undefined) return null;
  const cacheRead = num(c.cache_read) ?? input;
  const cacheWrite = num(c.cache_write) ?? input;
  return {
    input: input / 1e6,
    cache_read: cacheRead / 1e6,
    cache_write_5m: cacheWrite / 1e6,
    cache_write_1h: (provider === "anthropic" ? cacheWrite * 1.6 : cacheWrite) / 1e6,
    output: output / 1e6,
  };
}

/** Overrides are per MILLION tokens, like models.dev. */
function fromOverride(entry) {
  if (!entry || typeof entry !== "object") return null;
  const input = num(entry.input);
  const output = num(entry.output);
  if (input === undefined || output === undefined) return null;
  const cw5 = num(entry.cache_write_5m) ?? input;
  return {
    input: input / 1e6,
    cache_read: (num(entry.cache_read) ?? input) / 1e6,
    cache_write_5m: cw5 / 1e6,
    cache_write_1h: (num(entry.cache_write_1h) ?? cw5) / 1e6,
    output: output / 1e6,
  };
}

/** Model ids pinned as unpriced by overrides.json, plus their normalised forms. */
export function pinnedUnpriced(overrides = {}) {
  const out = new Set();
  for (const [model, entry] of Object.entries(overrides)) {
    if (entry && typeof entry.unpriced === "string") {
      out.add(model);
      out.add(modelKey(model));
    }
  }
  return out;
}

/** Returns a Map model → rates, ordered by insertion precedence. */
export function buildPriceTable({ litellm = {}, modelsdev = {}, overrides = {} }) {
  const table = new Map();
  const pinned = pinnedUnpriced(overrides);
  const put = (model, rates) => {
    if (rates && !table.has(model) && !pinned.has(model)) table.set(model, rates);
  };
  for (const [model, entry] of Object.entries(overrides)) put(model, fromOverride(entry));
  for (const [model, entry] of Object.entries(litellm)) {
    if (model === "sample_spec") continue;
    put(model, fromLitellm(entry));
  }
  for (const [provider, block] of Object.entries(modelsdev)) {
    for (const [model, entry] of Object.entries(block?.models ?? {})) put(model, fromModelsDev(provider, entry));
  }
  const sources = [...table.keys()].sort((a, b) => a.length - b.length || (a < b ? -1 : 1));
  for (const model of sources) put(modelKey(model), table.get(model));
  return table;
}

// 12 significant digits drops float noise from the models.dev per-million division; Postgres
// numeric reads exponent notation exactly, so 2.5e-7 is stored as 0.00000025.
const lit = (n) => String(Number(n.toPrecision(12)));
const q = (s) => `'${s.replaceAll("'", "''")}'`;

export function toSql(table, snapshotDate, pinned = new Set()) {
  const models = [...table.keys()].sort();
  const unpriced = [...pinned].sort();
  const lines = models.map((m) => {
    const r = table.get(m);
    return `  (${q(m)}, ${lit(r.input)}, ${lit(r.cache_read)}, ${lit(r.cache_write_5m)}, ${lit(r.cache_write_1h)}, ${lit(r.output)}, date ${q(snapshotDate)})`;
  });
  return [
    "-- GENERATED by apps/web/scripts/seed-prices.mjs from packages/cli/src/pricing. Do not edit.",
    `-- ${models.length} rows, USD per token, pricing snapshot ${snapshotDate}. Idempotent upsert.`,
    "insert into public.model_prices (model, input, cache_read, cache_write_5m, cache_write_1h, output, snapshot_date) values",
    lines.join(",\n"),
    "on conflict (model) do update set",
    "  input = excluded.input,",
    "  cache_read = excluded.cache_read,",
    "  cache_write_5m = excluded.cache_write_5m,",
    "  cache_write_1h = excluded.cache_write_1h,",
    "  output = excluded.output,",
    "  snapshot_date = excluded.snapshot_date;",
    ...(unpriced.length
      ? ["", "-- Pinned as unpriced by overrides.json: never priced, even by a normalised match.", `delete from public.model_prices where model in (${unpriced.map(q).join(", ")});`]
      : []),
    "",
  ].join("\n");
}

function readJson(path, fallback) {
  return existsSync(path) ? JSON.parse(readFileSync(path, "utf8")) : fallback;
}

/** Reads SNAPSHOT_DATE from the CLI's pricing source if it declares one. */
function snapshotDate() {
  if (existsSync(pricingDir)) {
    for (const f of readdirSync(pricingDir)) {
      if (!/\.(ts|mts|js|mjs)$/.test(f)) continue;
      const m = /SNAPSHOT_DATE\s*=\s*["'](\d{4}-\d{2}-\d{2})["']/.exec(readFileSync(join(pricingDir, f), "utf8"));
      if (m) return m[1];
    }
  }
  return FALLBACK_SNAPSHOT_DATE;
}

export function generate() {
  const overrides = readJson(join(pricingDir, "overrides.json"), {});
  const table = buildPriceTable({
    litellm: readJson(join(pricingDir, "litellm.snapshot.json"), {}),
    modelsdev: readJson(join(pricingDir, "modelsdev.snapshot.json"), {}),
    overrides,
  });
  return toSql(table, snapshotDate(), pinnedUnpriced(overrides));
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const sql = generate();
  if (process.argv.includes("--check")) {
    const current = existsSync(outFile) ? readFileSync(outFile, "utf8") : "";
    if (current !== sql) {
      console.error("supabase/seed_prices.sql is stale: run `npm run seed-prices`.");
      process.exit(1);
    }
    console.log("supabase/seed_prices.sql is up to date.");
  } else {
    writeFileSync(outFile, sql);
    console.log(`wrote ${outFile} (${sql.split("\n").length} lines)`);
  }
}
