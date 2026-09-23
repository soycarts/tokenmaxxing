"use client";

import { useState } from "react";
import { useFormStatus } from "react-dom";

/**
 * A submit button that shows something is happening. With a server action, `useFormStatus`
 * reports the pending state; with a plain POST form (sign-in, sign-out) the click itself flips
 * a local flag until the navigation lands. Either way the label changes and the button dims.
 *
 * In a form with several submit buttons, give each a `name`/`value`: only the one that was
 * pressed shows the pending state (the submission's form data names its submitter).
 */
export function SubmitButton({
  children,
  pendingLabel = "Working…",
  className,
  name,
  value,
  formNoValidate,
  "aria-label": ariaLabel,
}: {
  children: React.ReactNode;
  pendingLabel?: string;
  className: string;
  name?: string;
  value?: string;
  /** Submit without the browser's field validation (add/remove row buttons). */
  formNoValidate?: boolean;
  "aria-label"?: string;
}) {
  const { pending, data } = useFormStatus();
  const [clicked, setClicked] = useState(false);
  const mine = !name || !data || data.get(name) === value;
  const busy = (pending && mine) || clicked;

  return (
    <button
      type="submit"
      name={name}
      value={value}
      formNoValidate={formNoValidate}
      aria-label={ariaLabel}
      className={className}
      disabled={busy}
      aria-busy={busy}
      onClick={(e) => {
        const form = e.currentTarget.form;
        if (form && !formNoValidate && !form.checkValidity()) return;
        // Defer: a submit button that is disabled by the time the click's default action runs
        // does not submit a plain POST form (the GitHub sign-in form). Flip the flag on the next
        // macrotask, after the browser has started the submission.
        window.setTimeout(() => setClicked(true), 0);
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
