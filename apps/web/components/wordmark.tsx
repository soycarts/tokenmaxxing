import { WORDMARK_LINE, WORDMARK_STACK } from "@/lib/wordmark-paths";

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

const INK = "#211d2e";
const KEY = "#ffffff";
const GOLD = "#F5B82E";
const EXTRUDE = [10, 17] as const;
const TRAIL = ["#ffd060", "#ffb877", "#ffa3cf", "#a5afff"];

function mix(a: string, b: string, t: number): string {
  const ch = (h: string, i: number) => parseInt(h.slice(1 + i * 2, 3 + i * 2), 16);
  return `#${[0, 1, 2]
    .map((i) => Math.round(ch(a, i) + (ch(b, i) - ch(a, i)) * t).toString(16).padStart(2, "0"))
    .join("")}`;
}

/** Back to front: the colour of each extrusion step, the first ~40% solid ink. */
function trail(steps: number): string[] {
  const solid = Math.round(steps * 0.4);
  const rest = steps - solid;
  const out = Array<string>(solid).fill(INK);
  for (let i = 0; i < rest; i++) {
    const t = (i / Math.max(rest - 1, 1)) * (TRAIL.length - 1);
    const j = Math.min(Math.floor(t), TRAIL.length - 2);
    out.push(mix(TRAIL[j], TRAIL[j + 1], t - j));
  }
  return out;
}

const LAYOUTS = {
  stack: { ...WORDMARK_STACK, steps: 34 },
  line: { ...WORDMARK_LINE, steps: 18 },
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
  const colours = trail(w.steps);
  const at = (i: number) => `translate(${((EXTRUDE[0] * i) / w.steps).toFixed(2)} ${((EXTRUDE[1] * i) / w.steps).toFixed(2)})`;
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
