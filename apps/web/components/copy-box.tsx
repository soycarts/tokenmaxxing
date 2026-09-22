"use client";

import { useState } from "react";

/**
 * Text with a copy button. The full variant has a title bar naming where the text goes; the
 * compact variant is a one-line command with the button inline.
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
      className={`shrink-0 rounded border px-2.5 py-1 text-xs font-semibold transition-colors ${
        copied ? "border-amber bg-amber text-ink" : "border-line-strong bg-raised text-paper hover:border-amber"
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
      <div className="flex items-start gap-3 rounded-md border border-line-strong bg-sunk py-1.5 pl-3 pr-1.5">
        <pre className="code-cond min-w-0 flex-1 overflow-x-auto whitespace-pre-wrap break-all py-1 text-[0.8rem] leading-relaxed text-paper">{text}</pre>
        {button}
        {live}
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-md border border-line-strong bg-sunk">
      <div className="flex items-center justify-between gap-3 border-b border-line px-4 py-1.5">
        <span className="text-xs text-muted">{title ?? label}</span>
        {button}
      </div>
      <pre className="code-cond overflow-x-auto whitespace-pre-wrap break-words px-4 py-4 text-[0.82rem] leading-[1.7] text-paper">{text}</pre>
      {live}
    </div>
  );
}
