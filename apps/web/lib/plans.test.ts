import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { PLANS, monthlyPlanUsd, planPrice, sanitizePlans } from "./plans";

const root = resolve(__dirname, "..");

describe("plans", () => {
  it("matches the CLI's plans.json when it is present", () => {
    const cli = resolve(root, "../../packages/cli/src/plans.json");
    if (!existsSync(cli)) return;
    expect(JSON.parse(readFileSync(cli, "utf8"))).toEqual(PLANS);
  });

  it("matches plan_price_usd() in supabase/schema.sql", () => {
    const sql = readFileSync(resolve(root, "supabase/schema.sql"), "utf8");
    const rows = [...sql.matchAll(/\('(\w+)', '([\w-]+)', ([\d.]+)::numeric\)/g)].map((m) => [m[1], m[2], Number(m[3])]);
    const expected = Object.entries(PLANS).flatMap(([p, plans]) => Object.entries(plans).map(([k, v]) => [p, k, v]));
    expect(rows.sort()).toEqual(expected.sort());
  });

  it("prices known plans and drops unknown ones", () => {
    expect(planPrice("claude", "max-20x")).toBe(200);
    expect(planPrice("claude", "toString")).toBeNull();
    expect(sanitizePlans({ claude: "max-20x", openai: "enterprise", evil: "pro" })).toEqual({ claude: "max-20x" });
    expect(monthlyPlanUsd({ claude: "max-20x", google: "ai-pro" })).toBeCloseTo(219.99);
  });
});
