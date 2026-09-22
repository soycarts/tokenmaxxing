/**
 * The coin: tokenmaxxing's small mark, for the favicon and the badge. A Sour Cherry token in
 * the same sticker construction as the wordmark (ink contour, white die-cut keyline, a hard
 * offset shadow) stamped with Anton's T. Colours are fixed, so it reads on a light or a dark
 * tab strip alike. Drawn in a 128 x 128 box.
 */
import { COIN_T } from "./wordmark-paths";

export const COIN_FILL = "#c2136b"; // Sour Cherry
export const COIN_INK = "#211d2e"; // Liquorice
export const COIN_KEY = "#ffffff";

/** The coin as an SVG fragment in its 128-unit box. `shadow` adds the sticker's offset shadow. */
export function coinSvg({ shadow = true }: { shadow?: boolean } = {}): string {
  return (
    (shadow ? `<circle cx="70" cy="70" r="52" fill="${COIN_INK}"/>` : "") +
    `<circle cx="64" cy="64" r="46" fill="${COIN_FILL}" stroke="${COIN_INK}" stroke-width="12"/>` +
    `<circle cx="64" cy="64" r="44" fill="none" stroke="${COIN_KEY}" stroke-width="5"/>` +
    `<circle cx="64" cy="64" r="33" fill="none" stroke="${COIN_KEY}" stroke-width="2.5" stroke-dasharray="4 5" opacity=".55"/>` +
    `<path d="${COIN_T}" transform="translate(-3.5 0)" fill="${COIN_KEY}" stroke="${COIN_INK}" stroke-width="5" stroke-linejoin="round" paint-order="stroke"/>`
  );
}

/** app/icon.svg, byte for byte (lib/coin.test.ts checks the file against this). */
export function coinIconSvg(): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128">${coinSvg()}</svg>\n`;
}
