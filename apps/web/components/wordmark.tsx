import { WM_GOLD as GOLD, WM_INK as INK, WM_KEY as KEY, WORDMARK_LAYOUTS, wordmarkStep, wordmarkTrail } from "@/lib/wordmark-svg";

/**
 * The TOKENMAXXING wordmark, built like jobmaxxing.ai's: Anton outlines, slanted and tilted,
 * white letter faces with an ink contour, a candy extrusion (ink, then gold into apricot,
 * bubblegum and periwinkle) and a white die-cut keyline round the lot. ".fyi" sits small, in
 * gold. Purely typographic: no character. Colours are fixed: it is a sticker, so it
 * carries its own contrast on Milk and on Blackcurrant.
 *
 * `stack` is TOKEN over MAXXING (footer, anywhere big); `line` is one row for the header.
 * `id` must be unique on the page: the letters are drawn once and re-used by reference.
 */

const LAYOUTS = {
  stack: { ...WORDMARK_LAYOUTS.stack, steps: 34 },
  line: { ...WORDMARK_LAYOUTS.line, steps: 18 },
};

export function Wordmark({
  id,
  layout = "stack",
  className,
}: {
  id: string;
  layout?: keyof typeof LAYOUTS;
  className?: string;
}) {
  const w = LAYOUTS[layout];
  const colours = wordmarkTrail(w.steps);
  const at = (i: number) => wordmarkStep(i, w.steps);
  const keylineSteps = Array.from({ length: Math.floor(w.steps / 2) + 1 }, (_, k) => w.steps - k * 2);
  const extrudeSteps = Array.from({ length: w.steps }, (_, k) => w.steps - k);
  const L = `#${id}-l`;
  const F = `#${id}-f`;

  return (
    <svg viewBox={w.viewBox} className={className} role="img" aria-label="tokenmaxxing.fyi">
      <defs>
        <path id={`${id}-l`} d={w.letters} />
        <path id={`${id}-f`} d={w.fyi} />
      </defs>
      <g transform={w.tilt}>
        {keylineSteps.map((i) => (
          <g key={`k${i}`} transform={at(i)} fill="none" stroke={KEY} strokeWidth="17" strokeLinejoin="round">
            <use href={L} />
            <use href={F} />
          </g>
        ))}
        {extrudeSteps.map((i) => (
          <g key={`e${i}`} transform={at(i)} fill={colours[i - 1]}>
            <use href={L} />
            <use href={F} />
          </g>
        ))}
        <g stroke={INK} strokeWidth="8.5" strokeLinejoin="round" paintOrder="stroke">
          <use href={L} fill={KEY} />
          <use href={F} fill={GOLD} />
        </g>
      </g>
    </svg>
  );
}
