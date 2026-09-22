import { createHash } from "node:crypto";
import { escapeXml } from "./badge";

/**
 * /embed/{handle}: the md card in a bare HTML page for an <iframe>. No site chrome and no
 * script but the resize ping below. Anton comes from our own origin, so inside the frame the
 * card renders in the real face (the SVG image version cannot load fonts).
 */
export const RESIZE_SCRIPT = `function r(){parent.postMessage({type:"tokenmaxxing:resize",height:document.documentElement.scrollHeight},"*")}
addEventListener("load",r);
addEventListener("resize",r);`;

export const RESIZE_SCRIPT_HASH = `sha256-${createHash("sha256").update(RESIZE_SCRIPT).digest("base64")}`;

export const EMBED_CSP = [
  "default-src 'none'",
  "style-src 'unsafe-inline'",
  "font-src 'self'",
  `script-src '${RESIZE_SCRIPT_HASH}'`,
  "base-uri 'none'",
  "form-action 'none'",
  "frame-ancestors *",
].join("; ");

export function embedHtml({ svg, href, title }: { svg: string; href: string; title: string }): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>${escapeXml(title)}</title>
<style>
@font-face{font-family:"Anton";src:url("/fonts/Anton.ttf") format("truetype");font-display:swap}
html,body{margin:0;padding:0;background:transparent}
a{display:block;max-width:480px;line-height:0;border-radius:18px}
a:focus-visible{outline:3px solid #c2136b;outline-offset:2px}
svg{display:block;width:100%;height:auto}
</style>
</head>
<body>
<a href="${escapeXml(href)}" target="_blank" rel="noopener">${svg}</a>
<script>${RESIZE_SCRIPT}</script>
</body>
</html>
`;
}
