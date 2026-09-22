import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { buildPriceTable, generate, modelKey, toSql } from "./seed-prices.mjs";

type Rates = { input: number; cache_read: number; cache_write_5m: number; cache_write_1h: number; output: number };

const pricing = resolve(__dirname, "../../../packages/cli/src/pricing");
const load = (f: string) => JSON.parse(readFileSync(resolve(pricing, f), "utf8"));

function table(): Map<string, Rates> {
  return buildPriceTable({ litellm: load("litellm.snapshot.json"), modelsdev: load("modelsdev.snapshot.json") });
}

const cost = (t: Record<keyof Rates, number>, r: Rates) =>
  t.input * r.input + t.cache_read * r.cache_read + t.cache_write_5m * r.cache_write_5m + t.cache_write_1h * r.cache_write_1h + t.output * r.output;

describe("seed-prices", () => {
  it("prices the CLI's ccusage sanity row at $125.97", () => {
    const r = table().get("claude-fable-5-1")!;
    const tokens = { input: 21721, output: 513976, cache_write_5m: 3570946, cache_write_1h: 0, cache_read: 221663704 };
    expect(cost(tokens, r)).toBeCloseTo(125.97, 2);
    const oneHour = { ...tokens, cache_write_5m: 0, cache_write_1h: 3570946 };
    expect(cost(oneHour, r)).toBeGreaterThan(cost(tokens, r));
  });

  it("normalises keys the same way as public.model_key()", () => {
    expect(modelKey("anthropic/Claude-Fable-5.1-20260101")).toBe("claude-fable-5-1");
    expect(modelKey("gpt-5.1-codex-max")).toBe("gpt-5-1-codex-max");
    expect(modelKey("claude-opus-5-5")).toBe("claude-opus-5-5");
  });

  it("adds normalised aliases without overriding real keys, and applies precedence", () => {
    const t = buildPriceTable({
      overrides: { "my-model": { input: 1, output: 2 } },
      litellm: { "my-model": { input_cost_per_token: 9, output_cost_per_token: 9 }, "Foo.Bar-20250101": { input_cost_per_token: 3, output_cost_per_token: 4 } },
      modelsdev: { anthropic: { models: { "claude-x": { cost: { input: 1, output: 5, cache_write: 1.25 } } } } },
    });
    expect(t.get("my-model")).toMatchObject({ input: 1, output: 2, cache_read: 1 });
    expect(t.get("foo-bar")).toMatchObject({ input: 3, output: 4 });
    const cx = t.get("claude-x")!;
    expect(cx.input).toBeCloseTo(1e-6);
    expect(cx.cache_read).toBeCloseTo(1e-6); // missing cache_read falls back to input, never $0
    expect(cx.cache_write_1h).toBeCloseTo(1.25e-6 * 1.6);
  });

  it("never emits a priced row with a zero input and output rate from missing data", () => {
    const t = buildPriceTable({ litellm: { "no-costs": { mode: "image_generation" } } });
    expect(t.has("no-costs")).toBe(false);
  });

  it("emits valid upsert SQL and the committed seed_prices.sql is current", () => {
    const sql = toSql(new Map([["it's", { input: 2.5e-7, cache_read: 1, cache_write_5m: 1, cache_write_1h: 1, output: 1 }]]), "2026-09-22");
    expect(sql).toContain("('it''s', 2.5e-7, 1, 1, 1, 1, date '2026-09-22')");
    expect(sql).toContain("on conflict (model) do update set");
    const committed = readFileSync(resolve(__dirname, "../supabase/seed_prices.sql"), "utf8");
    expect(committed, "run `npm run seed-prices`").toBe(generate());
  });
});
