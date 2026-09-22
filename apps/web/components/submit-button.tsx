"use client";

import { useState } from "react";
import { useFormStatus } from "react-dom";

/**
 * A submit button that shows something is happening. With a server action, `useFormStatus`
 * reports the pending state; with a plain POST form (sign-in, sign-out) the click itself flips
 * a local flag until the navigation lands. Either way the label changes and the button dims.
 */
export function SubmitButton({
  children,
  pendingLabel = "Working…",
  className,
}: {
  children: React.ReactNode;
  pendingLabel?: string;
  className: string;
}) {
  const { pending } = useFormStatus();
  const [clicked, setClicked] = useState(false);
  const busy = pending || clicked;

  return (
    <button
      type="submit"
      className={className}
      disabled={busy}
      aria-busy={busy}
      onClick={(e) => {
        const form = e.currentTarget.form;
        if (form && !form.checkValidity()) return;
        setClicked(true);
        window.setTimeout(() => setClicked(false), 8000);
      }}
    >
      {busy ? (
        <span className="inline-flex items-center gap-2">
          <span aria-hidden className="h-3 w-3 animate-spin rounded-full border-2 border-current border-t-transparent" />
          {pendingLabel}
        </span>
      ) : (
        children
      )}
    </button>
  );
}
