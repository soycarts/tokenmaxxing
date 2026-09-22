import { homeMarkdown, leaderboardMarkdown, MARKDOWN_TYPE, profileMarkdown, setupMarkdown, STATIC_DOC_CACHE } from "@/lib/agent-docs";
import { legalDoc } from "@/lib/content";
import { getLeaderboard, getProfilePage } from "@/lib/data";
import { siteUrl } from "@/lib/env";
import { PUBLIC_CACHE, textResponse } from "@/lib/http";
import { HANDLE_RE, parseMetric, parsePeriod } from "@/lib/periods";
import { boardPlacement } from "@/lib/sponsors";
import { getSponsor } from "@/lib/sponsors-data";

/**
 * Markdown twins of the pages, reached through proxy.ts when a request sends
 * `Accept: text/markdown` or `?format=md` (see lib/negotiate.ts). Also addressable directly.
 */
export async function GET(request: Request, ctx: { params: Promise<{ path: string[] }> }) {
  const path = (await ctx.params).path.map(decodeURIComponent);
  const sp = new URL(request.url).searchParams;
  const base = siteUrl();
  const md = (body: string, cache = STATIC_DOC_CACHE, status = 200) => textResponse(body, MARKDOWN_TYPE, cache, status);

  switch (path.join("/")) {
    case "home":
      return md(homeMarkdown(base));
    case "setup":
      return md(setupMarkdown(base));
    case "privacy":
      return md(legalDoc("PRIVACY.md").markdown);
    case "terms":
      return md(legalDoc("TERMS.md").markdown);
    case "leaderboard": {
      const period = parsePeriod(sp.get("period"));
      const metric = parseMetric(sp.get("metric"));
      const [res, sponsor] = await Promise.all([getLeaderboard(period, metric), getSponsor(boardPlacement(metric))]);
      if (res.configured && res.error) return md("# Leaderboard unavailable\n\nTry again in a minute.\n", "no-store", 500);
      return md(leaderboardMarkdown({ base, period, metric, rows: res.configured ? res.data : [], sponsor, configured: res.configured }), PUBLIC_CACHE);
    }
  }

  if (path.length === 2 && path[0] === "u") {
    const handle = path[1].toLowerCase();
    const notFound = () => md(`# Not found\n\nNo public profile called @${handle.replace(/[^a-z0-9-]/g, "")}.\n`, PUBLIC_CACHE, 404);
    if (!HANDLE_RE.test(handle)) return notFound();
    // Sessionless, like the JSON API: private profiles stay private here even to their owner.
    const res = await getProfilePage(handle, parsePeriod(sp.get("period"), "month"));
    if (!res.configured) return md("# Not connected\n\nThe database is not connected yet.\n", "no-store", 503);
    if (res.error) return md("# Profile unavailable\n\nTry again in a minute.\n", "no-store", 500);
    if (!res.data || !res.data.public) return notFound();
    return md(profileMarkdown(res.data, base), PUBLIC_CACHE);
  }

  return md("# Not found\n", PUBLIC_CACHE, 404);
}
