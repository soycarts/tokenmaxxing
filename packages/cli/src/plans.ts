import { readFileSync } from 'node:fs';
import { PROVIDER_SOURCE, type Provider, type SourceName } from './types.js';

export type PlanTable = Record<Provider, Record<string, number>>;

let plans: PlanTable | undefined;
export function planTable(): PlanTable {
  plans ??= JSON.parse(readFileSync(new URL('./plans.json', import.meta.url), 'utf8')) as PlanTable;
  return plans;
}

export const PROVIDERS = Object.keys(PROVIDER_SOURCE) as Provider[];

export function isProvider(p: string): p is Provider {
  return (PROVIDERS as string[]).includes(p);
}

export function planPrice(provider: Provider, plan: string): number | undefined {
  const t = planTable()[provider];
  return t && Object.prototype.hasOwnProperty.call(t, plan) ? t[plan] : undefined;
}

export function sourceFor(provider: Provider): SourceName {
  return PROVIDER_SOURCE[provider];
}

export const MONTH_DAYS = 30.4375;

/** API-equivalent cost ÷ plan cost prorated to the period length. */
export function roi(apiCost: number, monthlyPrice: number, days: number): number {
  const prorated = (monthlyPrice * days) / MONTH_DAYS;
  return prorated > 0 ? apiCost / prorated : 0;
}

// ------------------------------------------------------------------ plan lines

export const CUSTOM = 'custom';
export const QTY_MAX = 99;
export const LABEL_MAX = 40;
export const CUSTOM_MIN = 0.01;
export const CUSTOM_MAX = 10000;

/** One subscription line: `qty` seats of a listed plan, or a custom line with its own label and monthly price. */
export interface PlanLine {
  plan: string;
  qty: number;
  label?: string;
  monthly?: number;
}

export type Plans = Partial<Record<Provider, PlanLine[]>>;

export const isQty = (n: unknown): n is number => typeof n === 'number' && Number.isInteger(n) && n >= 1 && n <= QTY_MAX;

export function cleanLabel(s: unknown): string {
  const t = typeof s === 'string' ? s.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, LABEL_MAX).trim() : '';
  return t || 'Custom';
}

/** Custom monthly amount rounded to cents, or undefined when out of range. */
export function cleanMonthly(n: unknown): number | undefined {
  if (typeof n !== 'number' || !Number.isFinite(n)) return undefined;
  const r = Math.round(n * 100) / 100;
  return r >= CUSTOM_MIN && r <= CUSTOM_MAX ? r : undefined;
}

function lineOf(provider: Provider, raw: unknown): PlanLine | undefined {
  if (typeof raw === 'string') return planPrice(provider, raw) === undefined ? undefined : { plan: raw, qty: 1 };
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return undefined;
  const o = raw as Record<string, unknown>;
  const qty = o.qty === undefined ? 1 : o.qty;
  if (!isQty(qty) || typeof o.plan !== 'string') return undefined;
  if (o.plan === CUSTOM) {
    const monthly = cleanMonthly(o.monthly);
    return monthly === undefined ? undefined : { plan: CUSTOM, label: cleanLabel(o.label), monthly, qty };
  }
  return planPrice(provider, o.plan) === undefined ? undefined : { plan: o.plan, qty };
}

const lineKey = (l: PlanLine) => (l.plan === CUSTOM ? `${CUSTOM}\u0000${l.label}\u0000${l.monthly}` : l.plan);

/**
 * One provider's lines from either stored shape: the legacy string (`"max-20x"`) or a list of
 * line objects. Unknown plans and bad quantities are dropped; duplicates merge by summing qty.
 */
export function normalizeLines(provider: Provider, raw: unknown): PlanLine[] {
  const items = Array.isArray(raw) ? raw : raw === undefined || raw === null ? [] : [raw];
  const out: PlanLine[] = [];
  const byKey = new Map<string, PlanLine>();
  for (const item of items) {
    const l = lineOf(provider, item);
    if (!l) continue;
    const prev = byKey.get(lineKey(l));
    if (prev) prev.qty = Math.min(QTY_MAX, prev.qty + l.qty);
    else {
      byKey.set(lineKey(l), l);
      out.push(l);
    }
  }
  return out;
}

/** Every provider's lines, from either shape. Unknown providers and empty providers are dropped. */
export function normalizePlans(raw: unknown): Plans {
  const out: Plans = {};
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return out;
  for (const [provider, v] of Object.entries(raw as Record<string, unknown>)) {
    if (!isProvider(provider)) continue;
    const lines = normalizeLines(provider, v);
    if (lines.length) out[provider] = lines;
  }
  return out;
}

/** Monthly price of one seat of a line. */
export function unitPrice(provider: Provider, l: PlanLine): number {
  return l.plan === CUSTOM ? (l.monthly ?? 0) : (planPrice(provider, l.plan) ?? 0);
}

const cents = (n: number) => Math.round(n * 100) / 100;

/** Σ unit price × qty for one provider. */
export function providerMonthly(provider: Provider, lines: PlanLine[]): number {
  return cents(lines.reduce((s, l) => s + unitPrice(provider, l) * l.qty, 0));
}

/** Σ over providers. */
export function plansMonthly(p: Plans): number {
  return cents(PROVIDERS.reduce((s, prov) => s + providerMonthly(prov, p[prov] ?? []), 0));
}

/** `max-20x` or the custom line's label. */
export const lineName = (l: PlanLine) => (l.plan === CUSTOM ? (l.label ?? 'Custom') : l.plan);

/** "5× max-20x + 1× pro" */
export function describeLines(lines: PlanLine[]): string {
  return lines.map((l) => `${l.qty}× ${lineName(l)}`).join(' + ');
}

/** `x5`, `X5` or `×5` → 5; anything else → undefined. */
export function parseQtyToken(s: string): number | undefined {
  const m = /^[x×](\d{1,3})$/i.exec(s);
  return m ? Number(m[1]) : undefined;
}

/**
 * The plan part of `plan set|add <provider> <plan> [xN]` and
 * `plan set|add <provider> custom <monthly> [label…] [xN]`. `--qty N` may stand in for `xN`.
 * Returns the line, or a message saying what is wrong.
 */
export function parsePlanSpec(provider: Provider, args: string[], qtyFlag?: string): PlanLine | string {
  const [plan, ...rest] = args;
  let qty: number | undefined;
  const words: string[] = [];
  for (const a of rest) {
    const q = parseQtyToken(a);
    if (q === undefined) words.push(a);
    else if (qty !== undefined) return 'give the quantity once';
    else qty = q;
  }
  if (qtyFlag !== undefined) {
    if (qty !== undefined) return 'give the quantity once (xN or --qty N)';
    qty = /^\d{1,3}$/.test(qtyFlag) ? Number(qtyFlag) : NaN;
  }
  qty ??= 1;
  if (!isQty(qty)) return `quantity must be a whole number from 1 to ${QTY_MAX}`;
  const t = planTable()[provider];
  if (!plan || (plan !== CUSTOM && planPrice(provider, plan) === undefined)) {
    return `plan for ${provider} must be one of: ${Object.keys(t).join(', ')}, or custom <monthly> [label]`;
  }
  if (plan === CUSTOM) {
    const [amount, ...label] = words;
    const monthly = amount !== undefined && /^\$?\d+(\.\d+)?$/.test(amount) ? cleanMonthly(Number(amount.replace('$', ''))) : undefined;
    if (monthly === undefined) return `custom needs a monthly amount from ${CUSTOM_MIN} to ${CUSTOM_MAX}, e.g. plan add ${provider} custom 100 "Promo"`;
    const text = label.join(' ').trim();
    if (text.length > LABEL_MAX) return `custom label must be at most ${LABEL_MAX} characters`;
    return { plan: CUSTOM, label: cleanLabel(text), monthly, qty };
  }
  if (words.length) return `unexpected argument: ${words[0]}`;
  return { plan, qty };
}

/** Adds a line to a provider's lines, merging with an existing line for the same plan. */
export function addLine(lines: PlanLine[], line: PlanLine): PlanLine[] | string {
  const prev = lines.find((l) => lineKey(l) === lineKey(line));
  if (prev && prev.qty + line.qty > QTY_MAX) return `${lineName(line)} would reach ${prev.qty + line.qty}; the most is ${QTY_MAX}`;
  return prev ? lines.map((l) => (l === prev ? { ...l, qty: l.qty + line.qty } : l)) : [...lines, line];
}
