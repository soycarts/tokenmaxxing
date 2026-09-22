import { parseCardTheme } from "@/lib/card";
import { cardSvg, IMAGE_CACHE } from "@/lib/card-response";
import { EMBED_CSP, embedHtml } from "@/lib/embed";
import { siteUrl } from "@/lib/env";
import { parsePeriod } from "@/lib/periods";

/**
 * GET /embed/{handle}?period=week|month|all&theme=light|dark|auto: the md card as a page for
 * an <iframe>. Framable from anywhere (frame-ancestors *; no X-Frame-Options).
 */
export async function GET(request: Request, ctx: { params: Promise<{ handle: string }> }) {
  const handle = decodeURIComponent((await ctx.params).handle).toLowerCase();
  const url = new URL(request.url);
  const svg = await cardSvg(handle, parsePeriod(url.searchParams.get("period"), "month"), "md", parseCardTheme(url.searchParams.get("theme")));
  const html = embedHtml({ svg, href: `${siteUrl()}/u/${encodeURIComponent(handle)}`, title: `@${handle} on tokenmaxxing` });
  return new Response(html, {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": IMAGE_CACHE,
      "Content-Security-Policy": EMBED_CSP,
      "X-Content-Type-Options": "nosniff",
      "Referrer-Policy": "strict-origin-when-cross-origin",
    },
  });
}
