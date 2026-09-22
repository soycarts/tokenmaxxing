/** Shown wherever live data would be, when the database is not connected yet. */
export function NotConfigured({ what = "Live data will show up here" }: { what?: string }) {
  return (
    <div role="status" className="rounded-[22px] border-[2.5px] border-dashed border-edge px-5 py-5 text-ink-2 sm:px-6">
      <div>
        <p className="display text-xl text-ink">The database isn&apos;t connected yet.</p>
        <p className="mt-1.5 max-w-[60ch]">
          {what} once it is. The CLI works without it: run{" "}
          <code className="font-mono text-[0.85rem] text-ink">npx tokenmaxxing-cli@latest init</code> to see your own report
          locally.
        </p>
      </div>
    </div>
  );
}
