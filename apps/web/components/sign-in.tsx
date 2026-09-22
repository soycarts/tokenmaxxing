import Link from "next/link";
import { bigPrimaryButtonClass } from "@/components/form";
import { SubmitButton } from "@/components/submit-button";

/** A plain form POST, so starting OAuth never depends on client JS or gets prefetched. */
export function SignInButton({ next, label = "Sign in with GitHub" }: { next: string; label?: string }) {
  return (
    <form action="/auth/signin" method="post">
      <input type="hidden" name="next" value={next} />
      <SubmitButton pendingLabel="Redirecting to GitHub…" className={bigPrimaryButtonClass}>
        {label}
      </SubmitButton>
      <p className="mt-3 text-sm text-ink-2">
        By signing in you agree to the{" "}
        <Link href="/terms" className="font-semibold text-ink underline">
          Terms
        </Link>{" "}
        and{" "}
        <Link href="/privacy" className="font-semibold text-ink underline">
          Privacy policy
        </Link>
        .
      </p>
    </form>
  );
}
