/** Shown wherever live data would be, when the database is not connected yet. */
export function NotConfigured({ what = "Live data will show up here" }: { what?: string }) {
  return (
    <div role="status" className="rounded-md border border-dashed border-line-strong px-4 py-5 text-sm text-muted">
      <p className="font-semibold text-paper">The database for this deployment is not connected yet.</p>
      <p className="mt-1">
        {what} once it is. The CLI works without it: run{" "}
        <code className="code-cond text-[0.85rem] text-paper">npx tokenmaxxing-cli@latest init</code> to see your own report
        locally.
      </p>
    </div>
  );
}
