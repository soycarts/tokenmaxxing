/* eslint-disable @next/next/no-img-element -- sponsor logos are small remote images we do not optimise */
import Link from "next/link";
import { sponsorHost, type Sponsor } from "@/lib/sponsors";

/**
 * Sponsored placements. Always labelled, never numbered, never inside a ranking list: the row
 * sits above rank 1 with a Sour Cherry keyline and a SPONSORED chip, so nobody mistakes it for
 * an entry. `rel="sponsored"` tells crawlers the same thing.
 */

export function SponsoredChip({ className = "" }: { className?: string }) {
  return (
    <span
      className={`display inline-flex h-6 shrink-0 items-center rounded-full border-2 border-edge bg-accent px-2.5 text-[0.7rem] leading-none tracking-[0.06em] text-on-accent ${className}`}
    >
      Sponsored
    </span>
  );
}

function Logo({ s, size }: { s: Sponsor; size: number }) {
  if (!s.logo_url) {
    return (
      <span
        aria-hidden="true"
        className="display inline-flex shrink-0 items-center justify-center rounded-lg border-2 border-edge bg-surface text-ink"
        style={{ width: size, height: size, fontSize: size * 0.5 }}
      >
        {s.name.slice(0, 1).toUpperCase()}
      </span>
    );
  }
  return (
    <img
      src={s.logo_url}
      alt=""
      width={size}
      height={size}
      loading="lazy"
      referrerPolicy="no-referrer"
      className="shrink-0 rounded-lg border-2 border-edge bg-surface object-contain"
      style={{ width: size, height: size }}
    />
  );
}

/** Above rank 1 on a board. `href` overrides the link (the /sponsors example points at the mailto). */
export function SponsorRow({ s, href }: { s: Sponsor; href?: string }) {
  return (
    <aside
      aria-label={`Sponsored: ${s.name}`}
      className="relative grid grid-cols-[auto_1fr] items-center gap-x-3 gap-y-2 border-b-2 border-line bg-accent-soft py-3.5 pl-5 pr-4 shadow-[inset_5px_0_0_var(--accent)] sm:grid-cols-[4rem_1fr_auto] sm:gap-4 sm:pl-5 sm:pr-5"
    >
      <SponsoredChip className="col-span-2 justify-self-start sm:col-span-1" />
      <a href={href ?? s.url} rel="sponsored noopener" target="_blank" className="flex min-w-0 items-center gap-3 no-underline">
        <Logo s={s} size={32} />
        <span className="min-w-0">
          <span className="block truncate font-semibold text-ink hover:underline">{s.name}</span>
          {s.tagline && <span className="block truncate text-sm text-ink-2">{s.tagline}</span>}
        </span>
      </a>
      <a
        href={href ?? s.url}
        rel="sponsored noopener"
        target="_blank"
        tabIndex={-1}
        aria-hidden="true"
        className="hidden text-sm font-semibold text-ink underline decoration-accent decoration-2 sm:block"
      >
        {href ? "Your link" : sponsorHost(s)}
      </a>
    </aside>
  );
}

/** Under the ROI poster on a public profile. */
export function SponsorStrip({ s }: { s: Sponsor }) {
  return (
    <aside
      aria-label={`Sponsored: ${s.name}`}
      className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl border-[2.5px] border-edge bg-accent-soft px-4 py-2.5 shadow-[inset_5px_0_0_var(--accent)] sm:flex-nowrap"
    >
      <SponsoredChip />
      <a href={s.url} rel="sponsored noopener" target="_blank" className="flex min-w-0 flex-1 items-center gap-2.5 text-sm no-underline">
        <Logo s={s} size={24} />
        <span className="min-w-0 truncate">
          <span className="font-semibold text-ink hover:underline">{s.name}</span>
          {s.tagline && <span className="text-ink-2"> {s.tagline}</span>}
        </span>
      </a>
      <span className="hidden shrink-0 text-sm font-semibold text-ink-2 sm:inline">{sponsorHost(s)}</span>
    </aside>
  );
}

/** The quiet ask, where a sponsor would be. */
export function SponsorThisSpot({ label = "Sponsor this board", className = "" }: { label?: string; className?: string }) {
  return (
    <p className={`text-right text-sm ${className}`}>
      <Link href="/sponsors" className="text-muted underline decoration-line hover:text-ink hover:decoration-ink">
        {label}
      </Link>
    </p>
  );
}
