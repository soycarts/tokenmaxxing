import { parseCardSize, parseCardTheme } from "@/lib/card";
import { cardSvg, IMAGE_CACHE } from "@/lib/card-response";
import { parsePeriod } from "@/lib/periods";

/** GET /card/{handle}.svg?period=week|month|all&theme=light|dark|auto&size=sm|md */
export async function GET(request: Request, ctx: { params: Promise<{ file: string }> }) {
  const { file } = await ctx.params;
  if (!file.endsWith(".svg")) return new Response("Not found", { status: 404 });
  const handle = decodeURIComponent(file.slice(0, -4)).toLowerCase();
  const url = new URL(request.url);
  const svg = await cardSvg(
    handle,
    parsePeriod(url.searchParams.get("period"), "month"),
    parseCardSize(url.searchParams.get("size")),
    parseCardTheme(url.searchParams.get("theme")),
  );
  return new Response(svg, {
    headers: {
      "Content-Type": "image/svg+xml; charset=utf-8",
      "Cache-Control": IMAGE_CACHE,
      "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
