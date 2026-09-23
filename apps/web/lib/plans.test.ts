import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  PLANS,
  applyPlanOp,
  PLAN_LABEL,
  describePlans,
  invalidRows,
  planPrice,
  plansMonthlyUsd,
  rowsFromForm,
  rowsFromPlans,
  sanitizePlans,
} from "./plans";

const root = resolve(__dirname, "..");

function form(fields: Record<string, string>): FormData {
  const f = new FormData();
  for (const [k, v] of Object.entries(fields)) f.set(k, v);
  return f;
}

describe("plan table", () => {
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

  it("labels every plan", () => {
    for (const [p, plans] of Object.entries(PLANS)) {
      expect(Object.keys(PLAN_LABEL[p as keyof typeof PLANS]).sort()).toEqual(Object.keys(plans).sort());
    }
    expect(PLAN_LABEL.openai["pro-100"]).toBe("Pro $100");
  });

  it("prices known plans only", () => {
    expect(planPrice("claude", "max-20x")).toBe(200);
    expect(planPrice("openai", "pro")).toBe(200);
    expect(planPrice("google", "ai-ultra-100")).toBe(99.99);
    expect(planPrice("claude", "toString")).toBeNull();
    expect(planPrice("toString", "pro")).toBeNull();
  });
});

describe("sanitizePlans", () => {
  it("reads the legacy string shape as one line", () => {
    expect(sanitizePlans({ claude: "max-20x", openai: "enterprise", evil: "pro" })).toEqual({ claude: [{ plan: "max-20x", qty: 1 }] });
  });

  it("reads the list shape, drops unknown plans and bad qty, merges duplicates", () => {
    expect(
      sanitizePlans({
        claude: [{ plan: "max-20x", qty: 5 }, { plan: "pro" }, { plan: "max-20x", qty: 2 }, { plan: "ultra", qty: 1 }, { plan: "pro", qty: 0 }, { plan: "pro", qty: 2.5 }, { plan: "pro", qty: "3" }],
        openai: [{ plan: "pro", qty: 2 }],
        cursor: [],
      }),
    ).toEqual({ claude: [{ plan: "max-20x", qty: 7 }, { plan: "pro", qty: 1 }], openai: [{ plan: "pro", qty: 2 }] });
    expect(sanitizePlans({ claude: [{ plan: "pro", qty: 60 }, { plan: "pro", qty: 60 }] })).toEqual({ claude: [{ plan: "pro", qty: 99 }] });
    expect(sanitizePlans(null)).toEqual({});
    expect(sanitizePlans("claude")).toEqual({});
    expect(sanitizePlans([{ claude: "pro" }])).toEqual({});
  });

  it("validates custom lines", () => {
    expect(sanitizePlans({ openai: [{ plan: "custom", label: " Codex  $100 promo ", monthly: 100 }] })).toEqual({
      openai: [{ plan: "custom", label: "Codex $100 promo", monthly: 100, qty: 1 }],
    });
    expect(sanitizePlans({ openai: [{ plan: "custom", label: "", monthly: 9.999, qty: 2 }] }).openai).toEqual([{ plan: "custom", label: "Custom", monthly: 10, qty: 2 }]);
    expect(sanitizePlans({ openai: [{ plan: "custom", label: "x".repeat(99), monthly: 5 }] }).openai![0].label).toHaveLength(40);
    expect(sanitizePlans({ openai: [{ plan: "custom", monthly: 0 }, { plan: "custom", monthly: 10001 }, { plan: "custom", monthly: "5" }] })).toEqual({});
  });

  it("keeps at most 10 lines per provider", () => {
    const many = Array.from({ length: 12 }, (_, i) => ({ plan: "custom", label: `seat ${i}`, monthly: 1 }));
    expect(sanitizePlans({ cursor: many }).cursor).toHaveLength(10);
  });

  it("reads the /me form rows", () => {
    const f = form({
      rows_claude: "3",
      plan_claude_0: "max-20x",
      qty_claude_0: "5",
      plan_claude_1: "pro",
      qty_claude_1: "",
      plan_claude_2: "",
      qty_claude_2: "4",
      rows_openai: "2",
      plan_openai_0: "custom",
      qty_openai_0: "1",
      label_openai_0: "Codex $100 promo",
      monthly_openai_0: "100",
      plan_openai_1: "pro",
      qty_openai_1: "abc",
      rows_google: "1",
      plan_google_0: "ai-pro",
      qty_google_0: "2",
      plan_google_1: "ai-ultra", // beyond rows_google: ignored
      rows_evil: "1",
      plan_evil_0: "pro",
    });
    expect(sanitizePlans(f)).toEqual({
      claude: [{ plan: "max-20x", qty: 5 }, { plan: "pro", qty: 1 }],
      openai: [{ plan: "custom", label: "Codex $100 promo", monthly: 100, qty: 1 }],
      google: [{ plan: "ai-pro", qty: 2 }],
    });
    expect(invalidRows(rowsFromForm(f))).toBe(1);
  });

  it("round-trips saved plans through the form rows", () => {
    const plans = { claude: [{ plan: "max-20x", qty: 5 }, { plan: "pro", qty: 1 }], openai: [{ plan: "custom", label: "Promo", monthly: 12.5, qty: 2 }] };
    const rows = rowsFromPlans(plans);
    expect(rows.cursor).toEqual([{ plan: "", qty: "1", label: "", monthly: "" }]);
    const f = new FormData();
    for (const [p, list] of Object.entries(rows)) {
      f.set(`rows_${p}`, String(list.length));
      list.forEach((r, i) => {
        f.set(`plan_${p}_${i}`, r.plan);
        f.set(`qty_${p}_${i}`, r.qty);
        f.set(`label_${p}_${i}`, r.label);
        f.set(`monthly_${p}_${i}`, r.monthly);
      });
    }
    expect(sanitizePlans(f)).toEqual(plans);
  });
});

describe("plansMonthlyUsd and describePlans", () => {
  const mixed = { claude: [{ plan: "max-20x", qty: 5 }, { plan: "pro", qty: 1 }] };

  it("sums price × qty over both shapes", () => {
    expect(plansMonthlyUsd(mixed)).toBe(1020);
    expect(plansMonthlyUsd({ claude: "max-20x", google: "ai-pro" })).toBeCloseTo(219.99);
    expect(plansMonthlyUsd({ ...mixed, openai: [{ plan: "custom", label: "Codex", monthly: 100, qty: 2 }] })).toBe(1220);
    expect(plansMonthlyUsd({ google: [{ plan: "ai-plus", qty: 3 }] })).toBe(14.97);
    expect(plansMonthlyUsd({})).toBe(0);
  });

  it("describes lines with labels", () => {
    expect(describePlans(mixed)).toBe("5× Max 20x + 1× Pro");
    expect(describePlans(mixed, { provider: true })).toBe("5× Claude Max 20x, 1× Claude Pro");
    expect(describePlans({ claude: "max-20x", openai: [{ plan: "pro-100", qty: 2 }, { plan: "custom", label: "Codex promo", monthly: 50 }] }, { provider: true })).toBe(
      "1× Claude Max 20x, 2× ChatGPT Pro $100, 1× Codex promo",
    );
    expect(describePlans({})).toBe("");
  });
});

describe("applyPlanOp", () => {
  const rows = rowsFromPlans({ claude: [{ plan: "max-20x", qty: 5 }, { plan: "pro", qty: 1 }] });
  it("adds a blank row, up to 10", () => {
    expect(applyPlanOp(rows, "add:claude").claude).toHaveLength(3);
    expect(applyPlanOp(rows, "add:claude").claude[2]).toEqual({ plan: "", qty: "1", label: "", monthly: "" });
    let r = rows;
    for (let i = 0; i < 12; i++) r = applyPlanOp(r, "add:cursor");
    expect(r.cursor).toHaveLength(10);
  });
  it("removes a row; the last one leaves a blank row", () => {
    expect(applyPlanOp(rows, "remove:claude:0").claude).toEqual([{ plan: "pro", qty: "1", label: "", monthly: "" }]);
    expect(applyPlanOp(applyPlanOp(rows, "remove:claude:0"), "remove:claude:0").claude).toEqual([{ plan: "", qty: "1", label: "", monthly: "" }]);
  });
  it("ignores anything else", () => {
    expect(applyPlanOp(rows, "save")).toBe(rows);
    expect(applyPlanOp(rows, "add:evil")).toBe(rows);
    expect(applyPlanOp(rows, "add:toString")).toBe(rows);
  });
});
