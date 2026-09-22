import { profileBadge, renderBadge, BADGE_GREY, type BadgeMetric } from "@/lib/badge";
import { getBadgeStats } from "@/lib/data";
import { HANDLE_RE, parsePeriod } from "@/lib/periods";

const METRICS: BadgeMetric[] = ["value", "roi", "rank"];

/** GET /badge/{handle}.svg?metric=value|roi|rank&period=week|month|all */
export async function GET(request: Request, ctx: { params: Promise<{ file: string }> }) {
  const { file } = await ctx.params;
  if (!file.endsWith(".svg")) return new Response("Not found", { status: 404 });
  const handle = decodeURIComponent(file.slice(0, -4)).toLowerCase();
  const url = new URL(request.url);
  const metricParam = url.searchParams.get("metric") as BadgeMetric | null;
  const metric = metricParam && METRICS.includes(metricParam) ? metricParam : "value";
  const period = parsePeriod(url.searchParams.get("period"), "month");

  let svg: string;
  if (!HANDLE_RE.test(handle)) {
    svg = profileBadge(null, metric, period);
  } else {
    const res = await getBadgeStats(handle, period);
    if (!res.configured) svg = renderBadge("tokenmaxxing", "not configured", BADGE_GREY);
    else if (res.error) svg = renderBadge("tokenmaxxing", "unavailable", BADGE_GREY);
    else svg = profileBadge(res.data, metric, period);
  }

  return new Response(svg, {
    headers: {
      "Content-Type": "image/svg+xml; charset=utf-8",
      "Cache-Control": "public, max-age=60, s-maxage=60, stale-while-revalidate=300",
      "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
