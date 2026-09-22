"use client";

import { useState } from "react";

/**
 * Text with a copy button. The full variant is a sticker with a Liquorice title bar naming
 * where the text goes; the compact variant is a one-line command with the button inline.
 */
export function CopyBox({ text, label, title, compact = false }: { text: string; label: string; title?: string; compact?: boolean }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      setCopied(false);
    }
  }

  const button = (
    <button
      type="button"
      onClick={copy}
      aria-label={`Copy ${label}`}
      className={`press display inline-flex h-8 shrink-0 items-center rounded-lg px-3 text-[0.8rem] leading-none tracking-[0.05em] [--lift:2px] ${
        copied ? "bg-candy-mint text-on-gold" : "bg-gold text-on-gold"
      }`}
    >
      {copied ? "Copied" : "Copy"}
    </button>
  );
  const live = (
    <span className="sr-only" aria-live="polite">
      {copied ? `${label} copied to clipboard` : ""}
    </span>
  );

  if (compact) {
    return (
      <div className="flex items-start gap-3 rounded-xl border-[2.5px] border-edge bg-surface py-1.5 pl-3.5 pr-1.5">
        <pre className="min-w-0 flex-1 overflow-x-auto whitespace-pre-wrap break-all py-1 font-mono text-[0.8rem] leading-relaxed text-ink">{text}</pre>
        {button}
        {live}
      </div>
    );
  }

  return (
    <div className="sticker overflow-hidden">
      <div className="flex items-center justify-between gap-3 bg-band py-2 pl-4 pr-2.5 text-on-band">
        <span className="display text-[0.9rem] tracking-[0.05em]">{title ?? label}</span>
        {button}
      </div>
      <pre className="overflow-x-auto whitespace-pre-wrap break-words px-4 py-4 font-mono text-[0.8rem] leading-[1.75] text-ink sm:px-5">{text}</pre>
      {live}
    </div>
  );
}
