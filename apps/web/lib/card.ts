/**
 * Profile cards: the ROI poster at README size, as a plain string-built SVG (no dependency).
 *
 *   sm 320 x 96   gold panel, the multiple in giant Anton, handle, API-equivalent dollars,
 *                 a period chip and the wordmark.
 *   md 480 x 160  adds the 30-day bars and the top three models by value, with the handle and
 *                 wordmark on a white strip like the poster's footer.
 *
 * Built to survive GitHub's camo proxy, which serves the file as an <img>: no scripts, no
 * foreignObject, no external requests, no embedded fonts. Text names Anton with Impact and
 * Arial Black behind it; every Anton string is measured with Anton's own advance widths and
 * pinned with textLength, so a fallback face is squeezed into the same box instead of
 * overflowing. The wordmark and the multiplication sign (Anton has no ×) are drawn as paths.
 *
 * theme=auto carries both palettes and switches with prefers-color-scheme inside the SVG.
 */
import { ANTON_ADVANCE, ANTON_FALLBACK } from "./anton-metrics";
import { escapeXml } from "./badge";
import { formatRoi, formatUsd } from "./format";
import type { Period } from "./periods";
import { wordmarkLineHeight, wordmarkLineSvg } from "./wordmark-svg";

export const CARD_SIZES = ["sm", "md"] as const;
export type CardSize = (typeof CARD_SIZES)[number];
export const CARD_THEMES = ["light", "dark", "auto"] as const;
export type CardTheme = (typeof CARD_THEMES)[number];

export const CARD_DIMENSIONS: Record<CardSize, { w: number; h: number }> = {
  sm: { w: 320, h: 96 },
  md: { w: 480, h: 160 },
};

export type CardData = {
  handle: string;
  period: Period;
  api_equiv_usd: number;
  /** API-equivalent value over plan cost for the period; null without a plan. */
  roi: number | null;
  /** The last 30 days, oldest first. */
  daily: { day: string; usd: number }[];
  /** Models with their value, any order; the card takes the top three priced ones. */
  models: { model: string; usd: number; priced?: boolean }[];
};

export const PERIOD_CHIP: Record<Period, string> = { week: "7d", month: "30d", all: "all" };
const PERIOD_WORDS: Record<Period, string> = { week: "last 7 days", month: "last 30 days", all: "all time" };

// ---------------------------------------------------------------------------- palette

type Palette = Record<(typeof ROLES)[number], string>;
const ROLES = ["gold", "ink", "edge", "strip", "stripInk", "stripMuted", "rim", "grey", "greyInk", "bar", "barLast"] as const;

/** The site's tokens (app/globals.css). The gold panel keeps Liquorice ink in both themes. */
const LIGHT: Palette = {
  gold: "#f5b82e",
  ink: "#211d2e",
  edge: "#211d2e",
  strip: "#ffffff",
  stripInk: "#211d2e",
  stripMuted: "#5a5468",
  rim: "#211d2e",
  grey: "#e6e0ea",
  greyInk: "#5a5468",
  bar: "#211d2e",
  barLast: "#c2136b",
};
const DARK: Palette = {
  gold: "#ffd060",
  ink: "#211d2e",
  edge: "#0c0a12",
  strip: "#2a2438",
  stripInk: "#f7f4fb",
  stripMuted: "#c9c2d6",
  rim: "#4a4260",
  grey: "#3a3249",
  greyInk: "#c9c2d6",
  bar: "#211d2e",
  barLast: "#c2136b",
};

const FILL_ROLES = new Set<string>(["gold", "ink", "edge", "strip", "stripInk", "stripMuted", "grey", "greyInk", "bar", "barLast"]);

function stylesheet(theme: CardTheme): string {
  const rules = (p: Palette) =>
    ROLES.map((role) => (FILL_ROLES.has(role) ? `.tmx-${role}{fill:${p[role]}}` : `.tmx-${role}{stroke:${p[role]}}`)).join("") +
    `.tmx-edge-s{stroke:${p.edge}}`;
  const base = theme === "dark" ? DARK : LIGHT;
  const fonts =
    `.tmx-d{font-family:Anton,Impact,"Arial Black",sans-serif}` +
    `.tmx-m{font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace}`;
  const auto = theme === "auto" ? `@media (prefers-color-scheme:dark){${rules(DARK)}}` : "";
  return `<style>${fonts}${rules(base)}${auto}</style>`;
}

/** class + presentation attribute, so a renderer that ignores <style> still gets colours. */
function paint(theme: CardTheme, role: (typeof ROLES)[number] | "edge-s", extraClass = ""): string {
  const p = theme === "dark" ? DARK : LIGHT;
  const cls = (c: string) => (extraClass ? `${extraClass} ${c}` : c);
  if (role === "edge-s") return `class="${cls("tmx-edge-s")}" stroke="${p.edge}"`;
  if (role === "rim") return `class="${cls("tmx-rim")}" stroke="${p.rim}"`;
  return `class="${cls(`tmx-${role}`)}" fill="${p[role]}"`;
}

// ---------------------------------------------------------------------------- text

const DISPLAY_FONT = `font-family="Anton, Impact, 'Arial Black', sans-serif"`;
const MONO_FONT = `font-family="ui-monospace, SFMono-Regular, Menlo, Consolas, monospace"`;
const MONO_ADVANCE = 0.6; // em per character, true of every common monospace

/** Width in em of an Anton string. */
export function antonEm(text: string): number {
  let w = 0;
  for (const ch of text) w += ANTON_ADVANCE[ch] ?? ANTON_FALLBACK;
  return w;
}

/** Largest size in [min, max] at which `text` fits `maxW`, and the width it then takes. */
function fit(text: string, maxW: number, max: number, min: number): { size: number; width: number } {
  const em = antonEm(text) || 1;
  const size = Math.max(min, Math.min(max, maxW / em));
  return { size: round(size), width: round(Math.min(em * size, maxW)) };
}

type TextOpts = { x: number; y: number; size: number; width: number; anchor?: "start" | "end"; fillRole: (typeof ROLES)[number] };

function anton(theme: CardTheme, text: string, o: TextOpts): string {
  const anchor = o.anchor === "end" ? ` text-anchor="end"` : "";
  return `<text ${DISPLAY_FONT} ${paint(theme, o.fillRole, "tmx-d")} x="${round(o.x)}" y="${round(o.y)}" font-size="${o.size}"${anchor} textLength="${o.width}" lengthAdjust="spacingAndGlyphs">${escapeXml(text)}</text>`;
}

function truncateMono(text: string, maxW: number, size: number): string {
  const max = Math.floor(maxW / (size * MONO_ADVANCE));
  return text.length <= max ? text : `${text.slice(0, Math.max(1, max - 1))}…`;
}

// ---------------------------------------------------------------------------- shapes

/** Anton has no ×; this one is drawn to sit on the baseline at Anton's x-height. */
function times(theme: CardTheme, x: number, baseline: number, size: number): { svg: string; width: number } {
  const s = size * 0.46; // box the sign occupies
  const t = size * 0.125; // stroke thickness
  const L = s * 1.3;
  const cx = x + s / 2;
  const cy = baseline - s / 2 - size * 0.03;
  const svg =
    `<g ${paint(theme, "ink")} transform="translate(${round(cx)} ${round(cy)}) rotate(45)">` +
    `<rect x="${round(-L / 2)}" y="${round(-t / 2)}" width="${round(L)}" height="${round(t)}"/>` +
    `<rect x="${round(-t / 2)}" y="${round(-L / 2)}" width="${round(t)}" height="${round(L)}"/></g>`;
  return { svg, width: s };
}

/** The big figure: the multiple (digits plus a drawn ×) or, without a plan, the dollars. */
function bigFigure(theme: CardTheme, d: CardData, x: number, baseline: number, maxW: number, maxSize: number): string {
  if (d.roi === null) {
    const text = formatUsd(d.api_equiv_usd);
    const f = fit(text, maxW, maxSize, 18);
    return anton(theme, text, { x, y: baseline, size: f.size, width: f.width, fillRole: "ink" });
  }
  const digits = formatRoi(d.roi).replace("×", "");
  const em = antonEm(digits) + 0.04 + 0.46;
  const size = round(Math.max(18, Math.min(maxSize, maxW / em)));
  const width = round(antonEm(digits) * size);
  const sign = times(theme, x + width + size * 0.04, baseline, size);
  return anton(theme, digits, { x, y: baseline, size, width, fillRole: "ink" }) + sign.svg;
}

function chip(theme: CardTheme, label: string, right: number, top: number, h: number, size: number): { svg: string; width: number } {
  const text = label.toUpperCase();
  const tw = round(antonEm(text) * size);
  const w = round(tw + h * 0.9);
  const x = right - w;
  const svg =
    `<rect ${paint(theme, "ink")} x="${round(x)}" y="${round(top)}" width="${w}" height="${h}" rx="${h / 2}"/>` +
    anton(theme, text, { x: x + (w - tw) / 2, y: top + h / 2 + size * 0.36, size, width: tw, fillRole: "gold" });
  return { svg, width: w };
}

function bars(theme: CardTheme, days: CardData["daily"], x: number, y: number, w: number, h: number): string {
  const n = Math.max(days.length, 1);
  const gap = 1.5;
  const bw = (w - gap * (n - 1)) / n;
  const max = Math.max(0, ...days.map((d) => d.usd));
  let out = "";
  days.forEach((d, i) => {
    const bh = max > 0 ? Math.max((d.usd / max) * h, d.usd > 0 ? 1.5 : 0) : 0;
    if (bh <= 0) return;
    const last = i === days.length - 1;
    out += `<rect ${paint(theme, last ? "barLast" : "bar")} x="${round(x + i * (bw + gap))}" y="${round(y + h - bh)}" width="${round(bw)}" height="${round(bh)}" rx="1"/>`;
  });
  out += `<rect ${paint(theme, "ink")} x="${round(x)}" y="${round(y + h)}" width="${round(w)}" height="1.5"/>`;
  return out;
}

type Frame = { x: number; y: number; w: number; h: number; rx: number; off: number; stroke: number };

function frame(size: CardSize): Frame {
  const { w, h } = CARD_DIMENSIONS[size];
  const stroke = 2.5;
  const off = size === "sm" ? 4 : 5;
  return { x: stroke / 2, y: stroke / 2, w: w - stroke - off, h: h - stroke - off, rx: size === "sm" ? 14 : 18, off, stroke };
}

/** Shadow, panel fill, optional footer strip, outline. `fillRole` is gold or grey. */
function panel(theme: CardTheme, f: Frame, fillRole: "gold" | "grey", stripH: number): string {
  const { x, y, w, h, rx, off, stroke } = f;
  let out = `<rect ${paint(theme, "edge")} x="${x + off}" y="${y + off}" width="${w}" height="${h}" rx="${rx}"/>`;
  out += `<rect ${paint(theme, fillRole)} x="${x}" y="${y}" width="${w}" height="${h}" rx="${rx}"/>`;
  if (stripH > 0) {
    const top = y + h - stripH;
    out += `<clipPath id="tmx-clip"><rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${rx}"/></clipPath>`;
    out += `<rect ${paint(theme, "strip")} clip-path="url(#tmx-clip)" x="${x}" y="${round(top)}" width="${w}" height="${stripH}"/>`;
    out += `<rect ${paint(theme, "edge")} x="${x}" y="${round(top - stroke / 2)}" width="${w}" height="${stroke}"/>`;
  }
  out += `<rect ${paint(theme, "edge-s")} fill="none" stroke-width="${stroke}" x="${x}" y="${y}" width="${w}" height="${h}" rx="${rx}"/>`;
  // Dark only: a faint light rim inside the keyline, as the site's stickers have on Blackcurrant.
  if (theme !== "light") {
    const inset = stroke / 2 + 1;
    const rim = `<rect ${paint(theme, "rim")} fill="none" stroke-width="1" x="${x + inset}" y="${y + inset}" width="${w - inset * 2}" height="${h - inset * 2}" rx="${rx - inset}"/>`;
    out += theme === "dark" ? rim : `<g class="tmx-rimwrap">${rim}</g>`;
  }
  return out;
}

function svgOpen(size: CardSize, label: string, theme: CardTheme): string {
  const { w, h } = CARD_DIMENSIONS[size];
  const l = escapeXml(label);
  // In auto the rim is hidden until the dark query matches.
  const rimToggle = theme === "auto" ? `<style>.tmx-rimwrap{display:none}@media (prefers-color-scheme:dark){.tmx-rimwrap{display:inline}}</style>` : "";
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" role="img" aria-label="${l}"><title>${l}</title>${stylesheet(theme)}${rimToggle}`;
}

// ---------------------------------------------------------------------------- cards

export function describeCard(d: CardData): string {
  const when = PERIOD_WORDS[d.period];
  const money = `${formatUsd(d.api_equiv_usd)} at API list rates`;
  return d.roi === null
    ? `@${d.handle} on tokenmaxxing: ${money}, ${when}`
    : `@${d.handle} on tokenmaxxing: ${formatRoi(d.roi)} their plan price, ${money}, ${when}`;
}

export function topModels(models: CardData["models"], n = 3): CardData["models"] {
  return models
    .filter((m) => m.priced !== false && m.usd > 0)
    .sort((a, b) => b.usd - a.usd)
    .slice(0, n);
}

export function renderCard(d: CardData, size: CardSize = "sm", theme: CardTheme = "auto"): string {
  return size === "md" ? renderMd(d, theme) : renderSm(d, theme);
}

function renderSm(d: CardData, theme: CardTheme): string {
  const f = frame("sm");
  const right = f.x + f.w - 12;
  const colX = 176;
  let body = panel(theme, f, "gold", 0);

  body += bigFigure(theme, d, 14, 77, 150, 70);

  const c = chip(theme, PERIOD_CHIP[d.period], right, 12, 18, 11);
  body += c.svg;
  const handle = `@${d.handle}`.toUpperCase();
  const hf = fit(handle, right - colX - c.width - 8, 20, 10);
  body += anton(theme, handle, { x: colX, y: 29, size: hf.size, width: hf.width, fillRole: "ink" });

  const unit = "AT API RATES";
  if (d.roi === null) {
    const nf = fit("NO PLAN SET", right - colX, 13, 8);
    body += anton(theme, "NO PLAN SET", { x: colX, y: 52, size: nf.size, width: nf.width, fillRole: "ink" });
  } else {
    const money = formatUsd(d.api_equiv_usd);
    const mf = fit(money, right - colX - antonEm(unit) * 10.5 - 6, 22, 11);
    body += anton(theme, money, { x: colX, y: 53, size: mf.size, width: mf.width, fillRole: "ink" });
    const uf = fit(unit, right - colX - mf.width - 6, 10.5, 7);
    body += anton(theme, unit, { x: colX + mf.width + 6, y: 53, size: uf.size, width: uf.width, fillRole: "ink" });
  }

  const wmW = Math.min(118, right - colX);
  body += wordmarkLineSvg("tmx-wm", colX - 2, f.y + f.h - 8 - wordmarkLineHeight(wmW), wmW, 8);
  return `${svgOpen("sm", describeCard(d), theme)}${body}</svg>`;
}

function renderMd(d: CardData, theme: CardTheme): string {
  const f = frame("md");
  const stripH = 34;
  const left = 18;
  const right = f.x + f.w - 16;
  const colX = 240;
  const goldBottom = f.y + f.h - stripH;
  let body = panel(theme, f, "gold", stripH);

  const label = d.roi === null ? "API-EQUIVALENT VALUE" : "MULTIPLE OF PLAN PRICE";
  const lf = fit(label, colX - left - 16, 12, 8);
  body += anton(theme, label, { x: left, y: 27, size: lf.size, width: lf.width, fillRole: "ink" });
  // Anton's cap height is 0.86 em: at 84px the figure's top clears the label by ~8px.
  body += bigFigure(theme, d, left, goldBottom - 13, colX - left - 16, 84);

  const c = chip(theme, PERIOD_CHIP[d.period], right, 12, 19, 11.5);
  body += c.svg;

  const top = topModels(d.models);
  const rowY = [48, 64, 80];
  if (top.length === 0) {
    body += anton(theme, "NO PRICED USAGE YET", { x: colX, y: rowY[0], size: 11, width: round(antonEm("NO PRICED USAGE YET") * 11), fillRole: "ink" });
  }
  top.forEach((m, i) => {
    const money = formatUsd(m.usd);
    const mf = fit(money, 70, 13, 8);
    body += anton(theme, money, { x: right, y: rowY[i], size: mf.size, width: mf.width, anchor: "end", fillRole: "ink" });
    const name = truncateMono(m.model, right - colX - mf.width - 10, 10.5);
    body += `<text ${MONO_FONT} ${paint(theme, "ink", "tmx-m")} x="${colX}" y="${rowY[i]}" font-size="10.5">${escapeXml(name)}</text>`;
  });

  body += bars(theme, d.daily, colX, 89, right - colX, 18);

  // footer strip: handle, dollars, wordmark
  const base = goldBottom + stripH / 2 + 5.5;
  const wmW = 108;
  const wmH = wordmarkLineHeight(wmW);
  body += wordmarkLineSvg("tmx-wm", right - wmW + 4, goldBottom + (stripH - wmH) / 2 + 1, wmW, 8);
  const handle = `@${d.handle}`.toUpperCase();
  const hf = fit(handle, 150, 16, 9);
  body += anton(theme, handle, { x: left, y: base, size: hf.size, width: hf.width, fillRole: "stripInk" });
  const money = `${formatUsd(d.api_equiv_usd)} AT API LIST RATES`;
  const mf = fit(money, right - wmW - 12 - (left + hf.width + 10), 11, 7);
  body += anton(theme, money, { x: left + hf.width + 10, y: base - 0.5, size: mf.size, width: mf.width, fillRole: "stripMuted" });

  return `${svgOpen("md", describeCard(d), theme)}${body}</svg>`;
}

/**
 * The grey card for a private or unknown profile (or a site with no database), same frame and
 * size as the real one so a README layout never jumps.
 */
export function renderMessageCard(handle: string | null, message: string, size: CardSize = "sm", theme: CardTheme = "auto"): string {
  const f = frame(size);
  const who = handle ? `@${handle}`.toUpperCase() : "TOKENMAXXING";
  const word = message.toUpperCase();
  const label = handle ? `@${handle} on tokenmaxxing: ${message}` : `tokenmaxxing: ${message}`;
  let body: string;
  if (size === "sm") {
    const right = f.x + f.w - 12;
    const colX = 176;
    body = panel(theme, f, "grey", 0);
    const wf = fit(word, 150, 44, 14);
    body += anton(theme, word, { x: 14, y: 62, size: wf.size, width: wf.width, fillRole: "greyInk" });
    const hf = fit(who, right - colX, 18, 9);
    body += anton(theme, who, { x: colX, y: 40, size: hf.size, width: hf.width, fillRole: "greyInk" });
    const wmW = Math.min(118, right - colX);
    body += wordmarkLineSvg("tmx-wm", colX - 2, f.y + f.h - 8 - wordmarkLineHeight(wmW), wmW, 8);
  } else {
    const stripH = 34;
    const left = 18;
    const right = f.x + f.w - 16;
    const goldBottom = f.y + f.h - stripH;
    body = panel(theme, f, "grey", stripH);
    const wf = fit(word, right - left, 80, 16);
    body += anton(theme, word, { x: left, y: goldBottom - 18, size: wf.size, width: wf.width, fillRole: "greyInk" });
    const wmW = 108;
    const wmH = wordmarkLineHeight(wmW);
    body += wordmarkLineSvg("tmx-wm", right - wmW + 4, goldBottom + (stripH - wmH) / 2 + 1, wmW, 8);
    const hf = fit(who, right - wmW - 12 - left, 16, 9);
    body += anton(theme, who, { x: left, y: goldBottom + stripH / 2 + 5.5, size: hf.size, width: hf.width, fillRole: "stripInk" });
  }
  return `${svgOpen(size, label, theme)}${body}</svg>`;
}

export function parseCardSize(raw: string | null): CardSize {
  return raw === "md" ? "md" : "sm";
}

export function parseCardTheme(raw: string | null): CardTheme {
  return raw === "light" || raw === "dark" ? raw : "auto";
}

function round(n: number): number {
  return Math.round(n * 100) / 100;
}
