/**
 * Shields-style flat badge, as a plain string template. No dependency.
 *
 * Text width is estimated from a per-character table for 11px Verdana (the shields.io face),
 * which is close enough that labels never clip; the SVG also sets textLength so renderers
 * squeeze rather than overflow if a font differs.
 */

import { COIN_INK, coinSvg } from "./coin";

const NARROW = new Set("ijl.,:;|!'`() Iit[]f".split(""));
const WIDE = new Set("mwMW@%".split(""));

export function textWidth(text: string): number {
  let w = 0;
  for (const ch of text) {
    if (NARROW.has(ch)) w += 3.9;
    else if (WIDE.has(ch)) w += 10.2;
    else if (ch >= "A" && ch <= "Z") w += 7.6;
    else if (ch >= "0" && ch <= "9") w += 7;
    else if (ch === "$" || ch === "×" || ch === "#") w += 7;
    else w += 6.6;
  }
  return Math.ceil(w);
}

export function escapeXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

export const BADGE_ACCENT = "#f5b82e"; // butterscotch gold, the site's colour for value
export const BADGE_GREY = "#9f9f9f";
const LABEL_BG = COIN_INK; // Liquorice

/** The coin mark at badge size, ~15px, at the left of the label. */
const MARK_W = 18; // the room it takes, in px
const MARK = `<g transform="translate(2.5 2) scale(0.125)">${coinSvg({ shadow: false })}</g>`;

export function renderBadge(label: string, message: string, color: string = BADGE_ACCENT): string {
  const pad = 6;
  const lw = textWidth(label) + pad * 2 + MARK_W;
  const mw = textWidth(message) + pad * 2;
  const w = lw + mw;
  const lx = MARK_W + (lw - MARK_W) / 2; // the label's centre, right of the mark
  const l = escapeXml(label);
  const m = escapeXml(message);
  const c = /^#[0-9a-fA-F]{3,8}$/.test(color) ? color : BADGE_ACCENT;
  const dark = c === BADGE_ACCENT; // gold reads better with dark text
  const msgFill = dark ? COIN_INK : "#fff";
  // Text is drawn at 10x and scaled down, the shields.io trick for crisp sub-pixel placement.
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="20" role="img" aria-label="${l}: ${m}"><title>${l}: ${m}</title><clipPath id="r"><rect width="${w}" height="20" rx="4" fill="#fff"/></clipPath><g clip-path="url(#r)"><rect width="${lw}" height="20" fill="${LABEL_BG}"/><rect x="${lw}" width="${mw}" height="20" fill="${c}"/></g>${MARK}<g fill="#fff" text-anchor="middle" font-family="Verdana,Geneva,DejaVu Sans,sans-serif" text-rendering="geometricPrecision" font-size="110"><text aria-hidden="true" x="${lx * 10}" y="150" fill="#010101" fill-opacity=".3" transform="scale(.1)" textLength="${(lw - MARK_W - pad * 2) * 10}">${l}</text><text x="${lx * 10}" y="140" transform="scale(.1)" textLength="${(lw - MARK_W - pad * 2) * 10}">${l}</text><text aria-hidden="true" x="${(lw + mw / 2) * 10}" y="150" fill="#010101" fill-opacity="${dark ? 0 : 0.3}" transform="scale(.1)" textLength="${(mw - pad * 2) * 10}">${m}</text><text x="${(lw + mw / 2) * 10}" y="140" fill="${msgFill}" transform="scale(.1)" textLength="${(mw - pad * 2) * 10}">${m}</text></g></svg>`;
}

export type BadgeMetric = "value" | "roi" | "rank";

export type BadgeStats = {
  public: boolean;
  api_equiv_usd?: number | null;
  roi?: number | null;
  rank?: number | null;
};

const PERIOD_WORD: Record<string, string> = { week: "7d", month: "30d", all: "all time" };

function money(n: number): string {
  if (n >= 10_000) return `$${(n / 1000).toFixed(1)}k`;
  if (n >= 100) return `$${Math.round(n).toLocaleString("en-US")}`;
  return `$${n.toFixed(2)}`;
}

/** Picks label/message/colour for a profile badge. `null` stats means unknown or unconfigured. */
export function profileBadge(stats: BadgeStats | null, metric: BadgeMetric, period: string): string {
  const when = PERIOD_WORD[period] ?? period;
  if (!stats || !stats.public) return renderBadge("tokenmaxxing", "private", BADGE_GREY);
  if (metric === "roi") {
    const roi = stats.roi;
    return roi === null || roi === undefined
      ? renderBadge(`ROI ${when}`, "no plan set", BADGE_GREY)
      : renderBadge(`ROI ${when}`, `${roi >= 100 ? roi.toFixed(0) : roi.toFixed(1)}×`);
  }
  if (metric === "rank") {
    const rank = stats.rank;
    return rank === null || rank === undefined
      ? renderBadge(`rank ${when}`, "unranked", BADGE_GREY)
      : renderBadge(`rank ${when}`, `#${rank}`);
  }
  return renderBadge(`tokenmaxxing ${when}`, money(stats.api_equiv_usd ?? 0));
}
