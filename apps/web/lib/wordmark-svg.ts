import { WORDMARK_LINE, WORDMARK_STACK } from "./wordmark-paths";

/**
 * The wordmark's construction, shared by the React component (components/wordmark.tsx) and the
 * string-built SVG cards: slanted Anton outlines with an ink contour, a candy extrusion (ink,
 * then gold into apricot, bubblegum and periwinkle) and a white die-cut keyline.
 */
export const WM_INK = "#211d2e";
export const WM_KEY = "#ffffff";
export const WM_GOLD = "#F5B82E";
export const WM_EXTRUDE = [10, 17] as const;
const TRAIL = ["#ffd060", "#ffb877", "#ffa3cf", "#a5afff"];

export const WORDMARK_LAYOUTS = { stack: WORDMARK_STACK, line: WORDMARK_LINE };

function mix(a: string, b: string, t: number): string {
  const ch = (h: string, i: number) => parseInt(h.slice(1 + i * 2, 3 + i * 2), 16);
  return `#${[0, 1, 2]
    .map((i) => Math.round(ch(a, i) + (ch(b, i) - ch(a, i)) * t).toString(16).padStart(2, "0"))
    .join("")}`;
}

/** Back to front: the colour of each extrusion step, the first ~40% solid ink. */
export function wordmarkTrail(steps: number): string[] {
  const solid = Math.round(steps * 0.4);
  const rest = steps - solid;
  const out = Array<string>(solid).fill(WM_INK);
  for (let i = 0; i < rest; i++) {
    const t = (i / Math.max(rest - 1, 1)) * (TRAIL.length - 1);
    const j = Math.min(Math.floor(t), TRAIL.length - 2);
    out.push(mix(TRAIL[j], TRAIL[j + 1], t - j));
  }
  return out;
}

/** The translate for extrusion step i of n. */
export function wordmarkStep(i: number, steps: number): string {
  return `translate(${((WM_EXTRUDE[0] * i) / steps).toFixed(2)} ${((WM_EXTRUDE[1] * i) / steps).toFixed(2)})`;
}

/**
 * The one-line wordmark as an SVG fragment placed at (x, y) with the given width. `id` prefixes
 * the defs it adds, so it must be unique in the document. Fewer steps than the site's header
 * because at card size they would only thicken the extrusion.
 */
export function wordmarkLineSvg(id: string, x: number, y: number, width: number, steps = 8): string {
  const w = WORDMARK_LINE;
  const [vx, vy, vw] = w.viewBox.split(" ").map(Number);
  const k = width / vw;
  const colours = wordmarkTrail(steps);
  const L = `#${id}-l`;
  const F = `#${id}-f`;
  const both = `<use href="${L}"/><use href="${F}"/>`;
  let body = "";
  for (let i = steps; i >= 0; i -= 2) {
    body += `<g transform="${wordmarkStep(i, steps)}" fill="none" stroke="${WM_KEY}" stroke-width="17" stroke-linejoin="round">${both}</g>`;
  }
  for (let i = steps; i >= 1; i--) {
    body += `<g transform="${wordmarkStep(i, steps)}" fill="${colours[i - 1]}">${both}</g>`;
  }
  body += `<g stroke="${WM_INK}" stroke-width="8.5" stroke-linejoin="round" paint-order="stroke"><use href="${L}" fill="${WM_KEY}"/><use href="${F}" fill="${WM_GOLD}"/></g>`;
  return (
    `<defs><path id="${id}-l" d="${w.letters}"/><path id="${id}-f" d="${w.fyi}"/></defs>` +
    `<g transform="translate(${r(x - vx * k)} ${r(y - vy * k)}) scale(${k.toFixed(5)})"><g transform="${w.tilt}">${body}</g></g>`
  );
}

/** Height of the one-line wordmark at a given width. */
export function wordmarkLineHeight(width: number): number {
  const [, , vw, vh] = WORDMARK_LINE.viewBox.split(" ").map(Number);
  return (vh * width) / vw;
}

const r = (n: number) => Math.round(n * 100) / 100;
