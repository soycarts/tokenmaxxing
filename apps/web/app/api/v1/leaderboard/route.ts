import { getLeaderboard } from "@/lib/data";
import { json, PUBLIC_CACHE } from "@/lib/http";
import { METRICS, PERIODS, type Metric, type Period } from "@/lib/periods";

/** GET /api/v1/leaderboard?period=week&metric=value */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const period = (url.searchParams.get("period") ?? "week") as Period;
  const metric = (url.searchParams.get("metric") ?? "value") as Metric;
  if (!PERIODS.includes(period)) return json({ error: "period must be week, month or all" }, { status: 400 });
  if (!METRICS.includes(metric)) return json({ error: "metric must be value, roi, efficiency or volume" }, { status: 400 });

  const res = await getLeaderboard(period, metric);
  if (!res.configured) return json({ period, metric, configured: false, rows: [] }, { cache: PUBLIC_CACHE });
  if (res.error) return json({ error: "server_error" }, { status: 500 });
  return json({ period, metric, rows: res.data }, { cache: PUBLIC_CACHE });
}
