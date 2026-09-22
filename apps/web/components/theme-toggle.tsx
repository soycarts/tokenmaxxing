"use client";

import { useLayoutEffect, useSyncExternalStore } from "react";
import { THEME_KEY, resolveTheme } from "@/lib/theme";

type Theme = "light" | "dark";

function subscribe(onChange: () => void) {
  const obs = new MutationObserver(onChange);
  obs.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
  return () => obs.disconnect();
}

const current = (): Theme => (document.documentElement.dataset.theme === "dark" ? "dark" : "light");

function stored(): string | null {
  try {
    return localStorage.getItem(THEME_KEY);
  } catch {
    return null;
  }
}

/** The sun/moon chip. The head script has already set data-theme; this only flips and stores it. */
export function ThemeToggle() {
  const theme = useSyncExternalStore<Theme | null>(subscribe, current, () => null);
  const next: Theme = theme === "dark" ? "light" : "dark";

  // In development React's Strict Mode remount strips the attribute the head script set on
  // <html>; put it back before paint. A no-op in production.
  useLayoutEffect(() => {
    if (!document.documentElement.dataset.theme) {
      document.documentElement.dataset.theme = resolveTheme(stored(), matchMedia("(prefers-color-scheme: dark)").matches);
    }
  }, []);

  return (
    <button
      type="button"
      onClick={() => {
        document.documentElement.dataset.theme = next;
        try {
          localStorage.setItem(THEME_KEY, next);
        } catch {
          // private mode: the choice lasts for this page only
        }
      }}
      aria-label={theme ? `Switch to ${next} theme` : "Switch theme"}
      className="press inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-surface text-ink [--lift:3px]"
    >
      <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round">
        {theme === "dark" ? (
          <>
            <circle cx="12" cy="12" r="4.2" fill="currentColor" />
            <path d="M12 2.5v2.2M12 19.3v2.2M2.5 12h2.2M19.3 12h2.2M5.3 5.3l1.6 1.6M17.1 17.1l1.6 1.6M5.3 18.7l1.6-1.6M17.1 6.9l1.6-1.6" />
          </>
        ) : (
          <path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z" fill="currentColor" strokeLinejoin="round" />
        )}
      </svg>
    </button>
  );
}
