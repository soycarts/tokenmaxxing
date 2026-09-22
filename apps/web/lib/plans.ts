/**
 * Subscription plan prices, USD per month. Copied from packages/cli/src/plans.json so the site
 * and the CLI compute ROI against the same numbers. supabase/schema.sql carries the same table
 * in `plan_price_usd()`; lib/plans.test.ts fails if the two drift.
 */
export const PLANS = {
  claude: { pro: 20, "max-5x": 100, "max-20x": 200 },
  openai: { plus: 20, pro: 200 },
  cursor: { pro: 20, "pro-plus": 60, ultra: 200 },
  google: { "ai-pro": 19.99, "ai-ultra-100": 100, "ai-ultra": 200 },
} as const;

export type Provider = keyof typeof PLANS;
export const PROVIDERS = Object.keys(PLANS) as Provider[];

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

export type Plans = Partial<Record<Provider, string>>;

/** Average days per month, the same constant the CLI uses to prorate a plan over a period. */
export const DAYS_PER_MONTH = 30.4375;

export function planPrice(provider: string, plan: string): number | null {
  const table = (PLANS as Record<string, Record<string, number>>)[provider];
  if (!table || !Object.prototype.hasOwnProperty.call(table, plan)) return null;
  return table[plan];
}

/** Keeps only known provider/plan pairs; anything else is dropped rather than priced at $0. */
export function sanitizePlans(input: unknown): Plans {
  const out: Plans = {};
  if (!input || typeof input !== "object") return out;
  for (const [provider, plan] of Object.entries(input as Record<string, unknown>)) {
    if (typeof plan === "string" && planPrice(provider, plan) !== null) {
      out[provider as Provider] = plan;
    }
  }
  return out;
}

export function monthlyPlanUsd(plans: Plans): number {
  let total = 0;
  for (const [provider, plan] of Object.entries(plans)) {
    const price = plan ? planPrice(provider, plan) : null;
    if (price !== null) total += price;
  }
  return total;
}
