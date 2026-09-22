/** One-line result of the last form submit, carried in ?ok= / ?error=. */
export function Flash({ ok, error }: { ok?: string; error?: string }) {
  if (error) {
    return (
      <p role="alert" className="rounded-md border border-danger/50 bg-danger/10 px-4 py-3 text-sm text-paper">
        {error}
      </p>
    );
  }
  if (ok) {
    return (
      <p role="status" className="rounded-md border border-amber/50 bg-amber-soft px-4 py-3 text-sm text-paper">
        {ok}
      </p>
    );
  }
  return null;
}

export function first(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v;
}
