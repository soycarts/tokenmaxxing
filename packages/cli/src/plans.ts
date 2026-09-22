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
  return planTable()[provider]?.[plan];
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
