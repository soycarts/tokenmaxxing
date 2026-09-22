/** One-line result of the last form submit, carried in ?ok= / ?error=. */
export function Flash({ ok, error }: { ok?: string; error?: string }) {
  if (error) {
    return (
      <p role="alert" className="rounded-xl border-[2.5px] border-danger bg-surface px-4 py-3 text-sm font-medium text-ink">
        {error}
      </p>
    );
  }
  if (ok) {
    return (
      <p role="status" className="rounded-xl border-[2.5px] border-edge bg-gold-soft px-4 py-3 text-sm font-medium text-ink">
        {ok}
      </p>
    );
  }
  return null;
}

export function first(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v;
}
