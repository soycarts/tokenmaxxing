import type { CardData } from "./card";
import type { ProfilePage } from "./data";
import { roiOf } from "./format";

/** The numbers a card shows, from the same profile_page document the profile renders. */
export function cardDataFromProfile(p: ProfilePage): CardData {
  return {
    handle: p.handle,
    period: p.period,
    api_equiv_usd: Number(p.api_equiv_usd) || 0,
    roi: roiOf(Number(p.api_equiv_usd) || 0, Number(p.plan_period_usd) || 0),
    daily: (p.daily ?? []).map((d) => ({ day: d.day, usd: Number(d.usd) || 0 })),
    models: (p.models ?? []).map((m) => ({ model: m.model, usd: Number(m.usd) || 0, priced: m.priced })),
  };
}
