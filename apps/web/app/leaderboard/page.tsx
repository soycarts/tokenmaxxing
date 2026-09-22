import type { Metadata } from "next";
import Link from "next/link";
import { after } from "next/server";
import { Chips } from "@/components/chips";
import { NotConfigured } from "@/components/not-configured";
import { Board, TABS } from "@/components/leaderboard-board";
import { SponsorRow, SponsorThisSpot } from "@/components/sponsor";
import { getLeaderboard } from "@/lib/data";
import { boardPlacement } from "@/lib/sponsors";
import { getSponsor, recordImpression } from "@/lib/sponsors-data";
import { PERIOD_LABEL, PERIODS, parseMetric, parsePeriod, type Metric, type Period } from "@/lib/periods";

export const metadata: Metadata = { title: "Leaderboard" };

export default async function LeaderboardPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const metric = parseMetric(sp.metric);
  const period = parsePeriod(sp.period);
  const placement = boardPlacement(metric);
  const [res, sponsor] = await Promise.all([getLeaderboard(period, metric), getSponsor(placement)]);
  if (sponsor) after(() => recordImpression(sponsor, placement));
  const tab = TABS.find((t) => t.value === metric)!;
  const href = (m: Metric, p: Period) => `/leaderboard?metric=${m}&period=${p}`;

  return (
    <div className="mx-auto max-w-6xl px-4 pt-10 sm:px-6 md:pt-14">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <h1 className="display text-[3.4rem] sm:text-7xl lg:text-8xl">Leaderboard</h1>
        <Link href={`/leaderboard/orgs?period=${period}`} className="mb-2 font-semibold underline">
          Orgs by value
        </Link>
      </div>

      <nav aria-label="Ranking" className="mt-8">
        <ul className="flex flex-wrap gap-3">
          {TABS.map((t) => {
            const on = t.value === metric;
            const volume = t.value === "volume";
            return (
              <li key={t.value}>
                <Link
                  href={href(t.value, period)}
                  aria-current={on ? "page" : undefined}
                  scroll={false}
                  className={`press display inline-flex h-12 items-center rounded-full px-5 text-lg leading-none tracking-[0.03em] no-underline sm:h-14 sm:px-6 sm:text-xl ${
                    on ? `${t.tone} text-on-gold` : "bg-surface text-ink"
                  }`}
                >
                  {volume ? (
                    <span>
                      Volume <span className="text-[0.72em] opacity-70">(the tokenmaxxing board)</span>
                    </span>
                  ) : (
                    t.label
                  )}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      <div className="mt-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <p className="max-w-[62ch] text-ink-2">{tab.blurb}</p>
        <Chips label="Period" items={PERIODS.map((p) => ({ value: p, label: PERIOD_LABEL[p] }))} active={period} href={(p) => href(metric, p)} />
      </div>

      <div className="mt-8">
        {!res.configured ? (
          <NotConfigured what="The leaderboard will show up here" />
        ) : res.error ? (
          <p role="alert" className="font-semibold text-danger">The leaderboard could not be loaded. Try again in a minute.</p>
        ) : res.data.length === 0 ? (
          <>
            {sponsor && (
              <div className="sticker mb-6 overflow-hidden">
                <SponsorRow s={sponsor} />
              </div>
            )}
            <Empty />
          </>
        ) : (
          <Board rows={res.data} metric={metric} sponsor={sponsor ? <SponsorRow s={sponsor} /> : undefined} />
        )}
        {res.configured && !sponsor && <SponsorThisSpot className="mt-3" />}
      </div>
    </div>
  );
}

function Empty() {
  return (
    <div className="rounded-[22px] border-[2.5px] border-dashed border-edge px-6 py-8 sm:px-8">
      <div>
        <p className="display text-3xl">Nobody on this board yet.</p>
        <p className="mt-2 max-w-[60ch] text-ink-2">
          Boards show public profiles only. Run the setup prompt, link a device, then switch your profile to public on your{" "}
          <Link href="/me" className="font-semibold text-ink underline">account page</Link>.
        </p>
      </div>
    </div>
  );
}
