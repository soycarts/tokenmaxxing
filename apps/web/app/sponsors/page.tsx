import type { Metadata } from "next";
import Link from "next/link";
import { primaryButtonClass } from "@/components/form";
import { PageShell, Section } from "@/components/prose";
import { SponsorRow } from "@/components/sponsor";
import { getSiteStats } from "@/lib/data";
import { formatUsd } from "@/lib/format";
import { SPONSOR_EMAIL, type Placement, type Sponsor } from "@/lib/sponsors";

export const metadata: Metadata = {
  title: "Sponsor a board",
  description: "Sponsored placements on the tokenmaxxing leaderboards and profiles: one labelled row per board, never ranked.",
};

export const revalidate = 60;

const SLOTS: { placement: Placement; name: string; where: string; tone: string; href: string }[] = [
  { placement: "leaderboard:value", name: "Value board", where: "The default leaderboard: API-equivalent dollars extracted.", tone: "bg-candy-butter", href: "/leaderboard?metric=value" },
  { placement: "leaderboard:roi", name: "ROI board", where: "Value divided by what people pay for their plans.", tone: "bg-candy-mint", href: "/leaderboard?metric=roi" },
  { placement: "leaderboard:efficiency", name: "Efficiency board", where: "Output tokens per API-equivalent dollar.", tone: "bg-candy-peri", href: "/leaderboard?metric=efficiency" },
  { placement: "leaderboard:volume", name: "Volume board", where: "Raw tokens through the pipe. The tokenmaxxing board.", tone: "bg-candy-pink", href: "/leaderboard?metric=volume" },
  { placement: "leaderboard:orgs", name: "Orgs board", where: "Teams ranked by the value their members extract.", tone: "bg-candy-apricot", href: "/leaderboard/orgs" },
  { placement: "profile", name: "Public profiles", where: "A slim strip under the ROI poster on every public profile.", tone: "bg-gold", href: "/leaderboard" },
];

const EXAMPLE: Sponsor = {
  id: "example",
  slug: "example",
  name: "Your company",
  tagline: "One line, up to 80 characters, about what you make.",
  url: `https://tokenmaxxing.fyi/sponsors`,
  logo_url: null,
};

export default async function SponsorsPage() {
  const stats = await getSiteStats();
  const s = stats.configured ? stats.data : null;
  const mailto = `mailto:${SPONSOR_EMAIL}?subject=${encodeURIComponent("Sponsoring tokenmaxxing")}`;

  return (
    <PageShell
      title="Sponsor a board"
      lede={
        s ? (
          <>
            <strong className="font-semibold text-ink">
              {s.users_tracking.toLocaleString("en-US")} {s.users_tracking === 1 ? "developer tracks" : "developers track"}
            </strong>{" "}
            their coding agents here
            {typeof s.month_usd === "number" ? (
              <>
                , and public profiles logged <strong className="font-semibold text-ink">{formatUsd(s.month_usd)}</strong> of
                API-equivalent usage in the last 30 days.
              </>
            ) : (
              "."
            )}
          </>
        ) : (
          "The people on these boards run coding agents all day and know exactly what their tokens are worth. Live audience numbers appear here once the database is connected."
        )
      }
    >
      <Section title="Six places, one sponsor each" id="placements">
        <p>
          Each board shows at most one sponsor, in a labelled row above rank 1. It is never numbered, never counted and never
          moves anyone&apos;s rank.
        </p>
      </Section>
      <ul className="mt-6 grid max-w-5xl gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {SLOTS.map((slot) => (
          <li key={slot.placement} className="sticker flex flex-col gap-3 px-5 py-5">
            <span
              aria-hidden="true"
              className={`h-3 w-12 rounded-full border-2 border-edge ${slot.tone}`}
            />
            <h3 className="display text-2xl">{slot.name}</h3>
            <p className="text-sm leading-relaxed text-ink-2">{slot.where}</p>
            <Link href={slot.href} className="mt-auto text-sm font-semibold text-ink underline decoration-line hover:decoration-ink">
              See where it goes
            </Link>
          </li>
        ))}
      </ul>

      <Section title="What a placement looks like" id="looks">
        <p>
          Your name, a tagline of up to 80 characters, a link and, if you like, a square logo. That is all: no tracking pixels,
          no scripts, no retargeting.
        </p>
      </Section>
      <figure className="mt-6 max-w-4xl">
        <div className="sticker overflow-hidden">
          <div aria-hidden="true" className="hidden grid-cols-[4rem_1fr_10rem] gap-4 bg-band px-5 py-3 text-on-band sm:grid">
            <span className="display text-sm tracking-[0.05em]">Rank</span>
            <span className="display text-sm tracking-[0.05em]">Who</span>
            <span className="display text-right text-sm tracking-[0.05em]">Value</span>
          </div>
          <SponsorRow s={EXAMPLE} href={mailto} />
          <div aria-hidden="true" className="grid grid-cols-[2.75rem_1fr_auto] items-center gap-3 px-4 py-3.5 opacity-60 sm:grid-cols-[4rem_1fr_10rem] sm:gap-4 sm:px-5">
            <span className="display inline-flex h-9 w-9 items-center justify-center rounded-full border-[2.5px] border-edge bg-candy-butter text-lg text-on-gold">
              1
            </span>
            <span className="font-semibold">the top entry</span>
            <span className="display text-right text-2xl leading-none">$4,476</span>
          </div>
        </div>
        <figcaption className="mt-3 text-sm text-ink-2">An example row, as it sits above rank 1.</figcaption>
      </figure>

      <Section title="What you get back" id="reporting">
        <p>
          Impression counts per placement per day, in aggregate. Sponsors receive no personal data about anyone on the site, as
          the <Link href="/privacy#sponsors" className="font-semibold text-ink underline">privacy policy</Link> says.
        </p>
      </Section>

      <Section title="Get in touch" id="contact">
        <p>
          Placements are arranged by email for now. Say which boards and which weeks, and we&apos;ll reply with dates and a
          price.
        </p>
        <p>
          <a href={mailto} className={primaryButtonClass}>
            Email {SPONSOR_EMAIL}
          </a>
        </p>
      </Section>
    </PageShell>
  );
}
