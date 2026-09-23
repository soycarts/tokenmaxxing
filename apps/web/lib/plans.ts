/**
 * Subscription plan prices, USD per month per seat. Copied from packages/cli/src/plans.json so
 * the site and the CLI compute ROI against the same numbers. supabase/schema.sql carries the
 * same table in `plan_price_usd()`; lib/plans.test.ts fails if the three drift.
 */
export const PLANS = {
  claude: { pro: 20, "max-5x": 100, "max-20x": 200, "team-standard": 25, "team-premium": 125 },
  openai: { go: 8, plus: 20, "pro-100": 100, pro: 200, business: 25 },
  cursor: { pro: 20, "pro-plus": 60, ultra: 200, teams: 40 },
  google: { "ai-plus": 4.99, "ai-pro": 19.99, "ai-ultra-100": 99.99, "ai-ultra": 199.99 },
} as const;

export type Provider = keyof typeof PLANS;
export const PROVIDERS = Object.keys(PLANS) as Provider[];

/** How each plan is named in the UI. */
export const PLAN_LABEL: { [P in Provider]: Record<keyof (typeof PLANS)[P], string> } = {
  claude: { pro: "Pro", "max-5x": "Max 5x", "max-20x": "Max 20x", "team-standard": "Team Standard", "team-premium": "Team Premium" },
  openai: { go: "Go", plus: "Plus", "pro-100": "Pro $100", pro: "Pro", business: "Business" },
  cursor: { pro: "Pro", "pro-plus": "Pro+", ultra: "Ultra", teams: "Teams" },
  google: { "ai-plus": "AI Plus", "ai-pro": "AI Pro", "ai-ultra-100": "AI Ultra $100", "ai-ultra": "AI Ultra" },
};

/** Which usage source each provider's plan pays for. */
export const PROVIDER_SOURCE: Record<Provider, string> = {
  claude: "claude",
  openai: "codex",
  cursor: "cursor",
  google: "gemini",
};

export const PROVIDER_LABEL: Record<Provider, string> = {
  claude: "Claude",
  openai: "ChatGPT (Codex)",
  cursor: "Cursor",
  google: "Google AI",
};

/** The provider name inside a plan description: "5× ChatGPT Pro", not "5× ChatGPT (Codex) Pro". */
const PROVIDER_SHORT: Record<Provider, string> = { claude: "Claude", openai: "ChatGPT", cursor: "Cursor", google: "Google" };

export const CUSTOM = "custom";
export const QTY_MAX = 99;
export const LABEL_MAX = 40;
export const CUSTOM_MIN = 0.01;
export const CUSTOM_MAX = 10000;
/** Rows per provider on /me and lines kept by sanitizePlans. */
export const LINES_MAX = 10;

/** `qty` seats of a listed plan, or a custom line with its own label and monthly price per seat. */
export type PlanLine = { plan: string; qty: number; label?: string; monthly?: number };
export type Plans = Partial<Record<Provider, PlanLine[]>>;

/** Average days per month, the same constant the CLI uses to prorate a plan over a period. */
export const DAYS_PER_MONTH = 30.4375;

const own = (o: object, k: string) => Object.prototype.hasOwnProperty.call(o, k);

export function isProvider(p: string): p is Provider {
  return own(PLANS, p);
}

export function planPrice(provider: string, plan: string): number | null {
  if (!isProvider(provider)) return null;
  const table = PLANS[provider] as Record<string, number>;
  return own(table, plan) ? table[plan] : null;
}

const isQty = (n: unknown): n is number => typeof n === "number" && Number.isInteger(n) && n >= 1 && n <= QTY_MAX;

export function cleanLabel(s: unknown): string {
  const t = typeof s === "string" ? s.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, LABEL_MAX).trim() : "";
  return t || "Custom";
}

/** A custom monthly amount rounded to cents, or null when out of range. */
export function cleanMonthly(n: unknown): number | null {
  if (typeof n !== "number" || !Number.isFinite(n)) return null;
  const r = Math.round(n * 100) / 100;
  return r >= CUSTOM_MIN && r <= CUSTOM_MAX ? r : null;
}

function lineOf(provider: Provider, raw: unknown): PlanLine | null {
  if (typeof raw === "string") return planPrice(provider, raw) === null ? null : { plan: raw, qty: 1 };
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const o = raw as Record<string, unknown>;
  const qty = o.qty === undefined ? 1 : o.qty;
  if (!isQty(qty) || typeof o.plan !== "string") return null;
  if (o.plan === CUSTOM) {
    const monthly = cleanMonthly(o.monthly);
    return monthly === null ? null : { plan: CUSTOM, label: cleanLabel(o.label), monthly, qty };
  }
  return planPrice(provider, o.plan) === null ? null : { plan: o.plan, qty };
}

const lineKey = (l: PlanLine) => (l.plan === CUSTOM ? `${CUSTOM}\u0000${l.label}\u0000${l.monthly}` : l.plan);

/** One provider's lines from either stored shape. Unknown plans and bad qty are dropped; duplicates merge. */
function normalizeLines(provider: Provider, raw: unknown): PlanLine[] {
  const items = Array.isArray(raw) ? raw : raw == null ? [] : [raw];
  const out: PlanLine[] = [];
  const byKey = new Map<string, PlanLine>();
  for (const item of items) {
    const l = lineOf(provider, item);
    if (!l) continue;
    const prev = byKey.get(lineKey(l));
    if (prev) prev.qty = Math.min(QTY_MAX, prev.qty + l.qty);
    else if (out.length < LINES_MAX) {
      byKey.set(lineKey(l), l);
      out.push(l);
    }
  }
  return out;
}

/** The raw rows the /me plans form posts: `rows_<provider>` and `plan_/qty_/label_/monthly_<provider>_<i>`. */
export type FormRow = { plan: string; qty: string; label: string; monthly: string };
export type FormRows = Record<Provider, FormRow[]>;

export const blankRow = (): FormRow => ({ plan: "", qty: "1", label: "", monthly: "" });

export function rowsFromForm(form: FormData): FormRows {
  const str = (k: string) => {
    const v = form.get(k);
    return typeof v === "string" ? v : "";
  };
  const out = {} as FormRows;
  for (const p of PROVIDERS) {
    const n = Math.min(LINES_MAX, Math.max(0, Number.parseInt(str(`rows_${p}`), 10) || 0));
    out[p] = Array.from({ length: n }, (_, i) => ({
      plan: str(`plan_${p}_${i}`),
      qty: str(`qty_${p}_${i}`),
      label: str(`label_${p}_${i}`).slice(0, LABEL_MAX * 2),
      monthly: str(`monthly_${p}_${i}`),
    }));
  }
  return out;
}

/** The rows a saved Plans value renders as; a provider without lines gets one blank row. */
export function rowsFromPlans(plans: Plans): FormRows {
  const out = {} as FormRows;
  for (const p of PROVIDERS) {
    const lines = plans[p] ?? [];
    out[p] = lines.length
      ? lines.map((l) => ({ plan: l.plan, qty: String(l.qty), label: l.plan === CUSTOM ? (l.label ?? "") : "", monthly: l.plan === CUSTOM ? String(l.monthly ?? "") : "" }))
      : [blankRow()];
  }
  return out;
}

const num = (s: string) => (/^\s*\d+(\.\d+)?\s*$/.test(s) ? Number(s) : NaN);

/** Form rows as plan-line objects: blank rows (plan "") are skipped, a blank qty means 1. */
function linesFromRows(rows: FormRows): Record<Provider, unknown[]> {
  const out = {} as Record<Provider, unknown[]>;
  for (const p of PROVIDERS) {
    out[p] = rows[p]
      .filter((r) => r.plan)
      .map((r) => ({
        plan: r.plan,
        qty: r.qty.trim() === "" ? 1 : num(r.qty),
        ...(r.plan === CUSTOM ? { label: r.label, monthly: num(r.monthly.replace("$", "")) } : {}),
      }));
  }
  return out;
}

/** How many filled-in form rows would be dropped as invalid (bad qty, bad custom amount, unknown plan). */
export function invalidRows(rows: FormRows): number {
  let n = 0;
  const lines = linesFromRows(rows);
  for (const p of PROVIDERS) for (const l of lines[p]) if (!lineOf(p, l)) n++;
  return n;
}

/**
 * Keeps only priceable lines, in the list shape. Accepts either stored JSON shape (the legacy
 * `{claude:"max-20x"}` or `{claude:[{plan,qty}]}`) or the /me form's FormData. Anything unknown
 * is dropped rather than priced at $0.
 */
export function sanitizePlans(input: unknown): Plans {
  if (typeof FormData !== "undefined" && input instanceof FormData) return sanitizePlans(linesFromRows(rowsFromForm(input)));
  const out: Plans = {};
  if (!input || typeof input !== "object" || Array.isArray(input)) return out;
  for (const [provider, v] of Object.entries(input as Record<string, unknown>)) {
    if (!isProvider(provider)) continue;
    const lines = normalizeLines(provider, v);
    if (lines.length) out[provider] = lines;
  }
  return out;
}

const cents = (n: number) => Math.round(n * 100) / 100;

export function linePrice(provider: Provider, l: PlanLine): number {
  return l.plan === CUSTOM ? (l.monthly ?? 0) : (planPrice(provider, l.plan) ?? 0);
}

/** Σ price × qty for one provider. */
export function providerMonthlyUsd(provider: Provider, lines: PlanLine[] = []): number {
  return cents(lines.reduce((s, l) => s + linePrice(provider, l) * l.qty, 0));
}

/** Σ price × qty over every provider (custom lines: monthly × qty). Accepts either stored shape. */
export function plansMonthlyUsd(plans: unknown): number {
  const p = sanitizePlans(plans);
  return cents(PROVIDERS.reduce((s, prov) => s + providerMonthlyUsd(prov, p[prov]), 0));
}

/** "Max 20x", "Pro $100", or a custom line's label. */
export function planLabel(provider: Provider, l: Pick<PlanLine, "plan" | "label">): string {
  if (l.plan === CUSTOM) return l.label || "Custom";
  return (PLAN_LABEL[provider] as Record<string, string>)[l.plan] ?? l.plan;
}

/**
 * "5× Max 20x + 1× Pro"; with `{ provider: true }`, "5× Claude Max 20x, 1× Claude Pro".
 * Accepts either stored shape.
 */
export function describePlans(plans: unknown, opts: { provider?: boolean } = {}): string {
  const p = sanitizePlans(plans);
  const parts = PROVIDERS.flatMap((prov) =>
    (p[prov] ?? []).map((l) => `${l.qty}× ${opts.provider && l.plan !== CUSTOM ? `${PROVIDER_SHORT[prov]} ` : ""}${planLabel(prov, l)}`),
  );
  return parts.join(opts.provider ? ", " : " + ");
}

/** What the /me plans form renders; `v` changes on every add/remove so the form remounts with the new rows. */
export type PlansFormState = { rows: FormRows; v: number };

/**
 * The form's add/remove buttons, applied to the posted rows without saving:
 * `add:<provider>` appends a blank row, `remove:<provider>:<i>` drops row i (a provider left
 * with no rows gets one blank row). Anything else leaves the rows as they are.
 */
export function applyPlanOp(rows: FormRows, op: string): FormRows {
  const [kind, provider, index] = op.split(":");
  if (!provider || !isProvider(provider)) return rows;
  const list = rows[provider] ?? [];
  if (kind === "add") return { ...rows, [provider]: list.length < LINES_MAX ? [...list, blankRow()] : list };
  if (kind === "remove") {
    const i = Number(index);
    const next = list.filter((_, j) => j !== i);
    return { ...rows, [provider]: next.length ? next : [blankRow()] };
  }
  return rows;
}
