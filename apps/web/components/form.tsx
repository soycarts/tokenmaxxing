/** Shared form control styles. */
export const inputClass =
  "w-full rounded-md border border-line-strong bg-sunk px-3 py-2 text-sm text-paper placeholder:text-faint focus:border-amber focus:outline-none";

/** Every button: a visible press (scale + nudge) and a dimmed, non-interactive pending state. */
export const pressClass =
  "transition-[transform,background-color,border-color,opacity] duration-100 active:scale-[0.97] active:translate-y-px disabled:cursor-progress disabled:opacity-60 disabled:active:scale-100 disabled:active:translate-y-0";

export const buttonClass =
  `inline-flex items-center justify-center rounded-md border border-line-strong bg-raised px-3.5 py-2 text-sm font-semibold text-paper hover:border-amber active:bg-sunk ${pressClass}`;

export const primaryButtonClass =
  `inline-flex items-center justify-center rounded-md bg-amber px-4 py-2 text-sm font-semibold text-ink hover:bg-paper active:bg-paper ${pressClass}`;

export const dangerButtonClass =
  `inline-flex items-center justify-center rounded-md border border-danger/60 px-3.5 py-2 text-sm font-semibold text-danger hover:bg-danger/10 active:bg-danger/20 ${pressClass}`;
