/** A plain form POST, so starting OAuth never depends on client JS or gets prefetched. */
export function SignInButton({ next, label = "Sign in with GitHub" }: { next: string; label?: string }) {
  return (
    <form action="/auth/signin" method="post">
      <input type="hidden" name="next" value={next} />
      <button
        type="submit"
        className="inline-flex items-center rounded-md bg-paper px-4 py-2.5 text-sm font-semibold text-ink hover:bg-amber"
      >
        {label}
      </button>
    </form>
  );
}
