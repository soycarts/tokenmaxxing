"use client";

import { primaryButtonClass } from "@/components/form";

export default function ErrorPage({ reset }: { error: Error; reset: () => void }) {
  return (
    <div className="mx-auto max-w-4xl px-4 pt-12 sm:px-6 md:pt-20">
      <h1 className="display text-5xl sm:text-6xl">This page failed to load.</h1>
      <p className="mt-4 max-w-[56ch] text-lg text-ink-2">The database did not answer. It is usually back within a minute.</p>
      <button type="button" onClick={reset} className={`${primaryButtonClass} mt-8`}>
        Try again
      </button>
    </div>
  );
}
