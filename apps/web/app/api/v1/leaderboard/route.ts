import { getLeaderboard } from "@/lib/data";
import { json, PUBLIC_CACHE } from "@/lib/http";
import { METRICS, PERIODS, type Metric, type Period } from "@/lib/periods";
import { boardPlacement, sponsorJson } from "@/lib/sponsors";
import { getSponsor } from "@/lib/sponsors-data";

/**
 * GET /api/v1/leaderboard?period=week&metric=value. When the board has a live sponsor the
 * response carries `sponsor: { label: "Sponsored", name, tagline, url, logo_url }`, which is
 * never one of the ranked `rows`.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const period = (url.searchParams.get("period") ?? "week") as Period;
  const metric = (url.searchParams.get("metric") ?? "value") as Metric;
  if (!PERIODS.includes(period)) return json({ error: "period must be week, month or all" }, { status: 400 });
  if (!METRICS.includes(metric)) return json({ error: "metric must be value, roi, efficiency or volume" }, { status: 400 });

  const [res, sponsor] = await Promise.all([getLeaderboard(period, metric), getSponsor(boardPlacement(metric))]);
  if (!res.configured) return json({ period, metric, configured: false, rows: [] }, { cache: PUBLIC_CACHE });
  if (res.error) return json({ error: "server_error" }, { status: 500 });
  return json({ period, metric, ...(sponsor ? { sponsor: sponsorJson(sponsor) } : {}), rows: res.data }, { cache: PUBLIC_CACHE });
}
