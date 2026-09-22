/** Shared form control styles. */
export const inputClass =
  "w-full rounded-xl border-[2.5px] border-edge bg-surface px-3.5 py-2.5 text-[0.95rem] text-ink placeholder:text-muted focus:border-accent focus:outline-none";

/**
 * Every button is a sticker: an ink keyline and a hard shadow that collapses under the press
 * (`.press` in globals.css), and a dimmed, pressed-in, non-interactive pending state.
 */
export const pressClass = "press disabled:cursor-progress";

const base = `${pressClass} display inline-flex items-center justify-center rounded-xl leading-none tracking-[0.04em] no-underline`;
const md = "px-4 py-2.5 text-[0.95rem]";

export const buttonClass = `${base} ${md} bg-surface text-ink hover:bg-sunk`;

export const primaryButtonClass = `${base} ${md} bg-accent text-on-accent`;

/** The one big action on a page: sign in, link this device. */
export const bigPrimaryButtonClass = `${base} px-6 py-3.5 text-lg bg-accent text-on-accent`;

export const dangerButtonClass = `${base} ${md} bg-surface text-danger hover:bg-danger hover:text-on-accent`;
