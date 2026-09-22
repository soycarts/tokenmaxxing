import type { Metadata } from "next";
import Link from "next/link";
import { Chips } from "@/components/chips";
import { NotConfigured } from "@/components/not-configured";
import { Board, TABS } from "@/components/leaderboard-board";
import { getLeaderboard } from "@/lib/data";
import { PERIOD_LABEL, PERIODS, parseMetric, parsePeriod, type Metric, type Period } from "@/lib/periods";

export const metadata: Metadata = { title: "Leaderboard" };


export default async function LeaderboardPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const metric = parseMetric(sp.metric);
  const period = parsePeriod(sp.period);
  const res = await getLeaderboard(period, metric);
  const tab = TABS.find((t) => t.value === metric)!;
  const href = (m: Metric, p: Period) => `/leaderboard?metric=${m}&period=${p}`;

  return (
    <div className="mx-auto max-w-6xl px-4 pt-12 sm:px-6 md:pt-16">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <h1 className="text-4xl font-extrabold tracking-[-0.03em] sm:text-5xl">Leaderboard</h1>
        <Link href={`/leaderboard/orgs?period=${period}`} className="text-sm text-muted underline hover:text-paper">
          Orgs by value
        </Link>
      </div>

      <div className="mt-8 flex flex-col gap-4">
        <nav aria-label="Ranking">
          <ul className="flex flex-wrap gap-x-6 gap-y-1 border-b border-line">
            {TABS.map((t) => {
              const on = t.value === metric;
              return (
                <li key={t.value}>
                  <Link
                    href={href(t.value, period)}
                    aria-current={on ? "page" : undefined}
                    scroll={false}
                    className={`-mb-px block border-b-2 pb-2.5 text-[0.95rem] no-underline ${
                      on ? "border-amber font-semibold text-paper" : "border-transparent text-muted hover:text-paper"
                    }`}
                  >
                    {t.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="max-w-[62ch] text-sm text-muted">{tab.blurb}</p>
          <Chips label="Period" items={PERIODS.map((p) => ({ value: p, label: PERIOD_LABEL[p] }))} active={period} href={(p) => href(metric, p)} />
        </div>
      </div>

      <div className="mt-8">
        {!res.configured ? (
          <NotConfigured what="The leaderboard will show up here" />
        ) : res.error ? (
          <p role="alert" className="text-danger">The leaderboard could not be loaded. Try again in a minute.</p>
        ) : res.data.length === 0 ? (
          <Empty />
        ) : (
          <Board rows={res.data} metric={metric} />
        )}
      </div>
    </div>
  );
}

function Empty() {
  return (
    <div className="rounded-md border border-dashed border-line-strong px-5 py-8">
      <p className="font-semibold">Nobody on this board yet.</p>
      <p className="mt-1 max-w-[60ch] text-muted">
        Boards show public profiles only. Run the setup prompt, link a device, then switch your profile to public on your{" "}
        <Link href="/me" className="text-paper underline">account page</Link>.
      </p>
    </div>
  );
}
