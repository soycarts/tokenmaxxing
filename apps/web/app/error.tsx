"use client";

export default function ErrorPage({ reset }: { error: Error; reset: () => void }) {
  return (
    <div className="mx-auto max-w-4xl px-4 pt-16 sm:px-6 md:pt-24">
      <h1 className="text-3xl font-extrabold tracking-[-0.03em]">This page failed to load.</h1>
      <p className="mt-3 max-w-[56ch] text-muted">The database did not answer. It is usually back within a minute.</p>
      <button type="button" onClick={reset} className="mt-6 rounded-md border border-line-strong px-3.5 py-2 text-sm font-semibold hover:border-amber">
        Try again
      </button>
    </div>
  );
}
