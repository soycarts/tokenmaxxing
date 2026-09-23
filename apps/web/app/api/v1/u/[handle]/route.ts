import { getProfilePage } from "@/lib/data";
import { json, PUBLIC_CACHE } from "@/lib/http";
import { HANDLE_RE, PERIODS, type Period } from "@/lib/periods";
import { sanitizePlans } from "@/lib/plans";

/** GET /api/v1/u/{handle}?period=month: public profile aggregates, 404 if not public. */
export async function GET(request: Request, ctx: { params: Promise<{ handle: string }> }) {
  const handle = decodeURIComponent((await ctx.params).handle).toLowerCase();
  const period = (new URL(request.url).searchParams.get("period") ?? "month") as Period;
  if (!PERIODS.includes(period)) return json({ error: "period must be week, month or all" }, { status: 400 });
  if (!HANDLE_RE.test(handle)) return json({ error: "not_found" }, { status: 404, cache: PUBLIC_CACHE });

  // Sessionless on purpose: the API never shows a private profile, even to its owner.
  const res = await getProfilePage(handle, period);
  if (!res.configured) return json({ error: "not_configured" }, { status: 503 });
  if (res.error) return json({ error: "server_error" }, { status: 500 });
  if (!res.data) return json({ error: "not_found" }, { status: 404, cache: PUBLIC_CACHE });
  const { is_you: _isYou, ...profile } = res.data;
  // plans always in the list shape, whatever is stored; plans_monthly_usd is the summed cost.
  const monthly = Number(profile.plans_monthly_usd ?? profile.plan_monthly_usd) || 0;
  return json({ ...profile, plans: sanitizePlans(profile.plans), plans_monthly_usd: monthly }, { cache: PUBLIC_CACHE });
}
