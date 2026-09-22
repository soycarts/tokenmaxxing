/**
 * Content negotiation for agents (SPEC-v0.2 C). proxy.ts asks these two questions of every
 * page request and rewrites to the markdown twin under /md/ when both say yes.
 */

/** Pages with a markdown twin, and where the twin lives. */
export function markdownTwin(pathname: string): string | null {
  const p = pathname.length > 1 ? pathname.replace(/\/+$/, "") : pathname;
  if (p === "/") return "/md/home";
  if (p === "/setup" || p === "/leaderboard" || p === "/privacy" || p === "/terms") return `/md${p}`;
  const u = /^\/u\/([^/]+)$/.exec(p);
  if (u) return `/md/u/${u[1]}`;
  return null;
}

/**
 * True for `?format=md`, or when the Accept header ranks text/markdown at least as high as
 * text/html (browsers never ask for markdown; agents ask for it first).
 */
export function wantsMarkdown(accept: string | null, search: URLSearchParams): boolean {
  const format = search.get("format");
  if (format === "md" || format === "markdown") return true;
  if (!accept) return false;
  let md = 0;
  let html = 0;
  for (const part of accept.split(",")) {
    const [type, ...params] = part.trim().toLowerCase().split(";");
    const qp = params.map((x) => x.trim()).find((x) => x.startsWith("q="));
    const q = qp ? Number(qp.slice(2)) : 1;
    if (!Number.isFinite(q)) continue;
    if (type === "text/markdown" || type === "text/x-markdown") md = Math.max(md, q);
    else if (type === "text/html" || type === "application/xhtml+xml") html = Math.max(html, q);
  }
  return md > 0 && md >= html;
}
