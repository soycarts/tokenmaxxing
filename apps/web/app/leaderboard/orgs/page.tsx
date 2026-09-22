import type { Metadata } from "next";
import Link from "next/link";
import { Chips } from "@/components/chips";
import { MEDAL } from "@/components/leaderboard-board";
import { NotConfigured } from "@/components/not-configured";
import { getOrgLeaderboard } from "@/lib/data";
import { formatTokens, formatUsd } from "@/lib/format";
import { PERIOD_LABEL, PERIODS, parsePeriod } from "@/lib/periods";

export const metadata: Metadata = { title: "Orgs" };

export default async function OrgLeaderboardPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const period = parsePeriod((await searchParams).period);
  const res = await getOrgLeaderboard(period);

  return (
    <div className="mx-auto max-w-6xl px-4 pt-10 sm:px-6 md:pt-14">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <h1 className="display text-[3.4rem] sm:text-7xl lg:text-8xl">Orgs by value</h1>
        <Link href={`/leaderboard?period=${period}`} className="mb-2 font-semibold underline">
          People
        </Link>
      </div>
      <div className="mt-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <p className="max-w-[62ch] text-ink-2">
          API-equivalent value summed over every member. Public orgs only. Start one from your account page.
        </p>
        <Chips label="Period" items={PERIODS.map((p) => ({ value: p, label: PERIOD_LABEL[p] }))} active={period} href={(p) => `/leaderboard/orgs?period=${p}`} />
      </div>

      <div className="mt-8">
        {!res.configured ? (
          <NotConfigured what="The org leaderboard will show up here" />
        ) : res.error ? (
          <p role="alert" className="font-semibold text-danger">The org leaderboard could not be loaded. Try again in a minute.</p>
        ) : res.data.length === 0 ? (
          <div className="rounded-[22px] border-[2.5px] border-dashed border-edge px-6 py-8 sm:px-8">
            <div>
              <p className="display text-3xl">No public orgs yet.</p>
              <p className="mt-2 text-ink-2">
                Create one on your <Link href="/me" className="font-semibold text-ink underline">account page</Link> and share the invite code.
              </p>
            </div>
          </div>
        ) : (
          <ol className="sticker divide-y-2 divide-line overflow-hidden">
            {res.data.map((o) => (
              <li key={o.slug} className="grid grid-cols-[2.75rem_1fr_auto] items-center gap-x-3 gap-y-1 px-4 py-3.5 sm:grid-cols-[4rem_1fr_10rem_9rem_7rem] sm:gap-4 sm:px-5">
                <span className="row-span-2 sm:row-span-1">
                  {o.rank <= 3 ? (
                    <span className={`display inline-flex h-9 w-9 items-center justify-center rounded-full border-[2.5px] border-edge text-lg text-on-gold ${MEDAL[o.rank - 1]}`}>
                      {o.rank}
                    </span>
                  ) : (
                    <span className="display inline-block w-9 text-center text-lg text-muted">{o.rank}</span>
                  )}
                </span>
                <Link href={`/orgs/${o.slug}`} className="truncate font-semibold no-underline hover:underline">
                  {o.name}
                </Link>
                <span className="display text-right text-2xl leading-none sm:text-[1.7rem]">{formatUsd(o.api_equiv_usd)}</span>
                <span className="num col-start-2 text-xs text-ink-2 sm:col-start-auto sm:text-right sm:text-sm">
                  {formatTokens(o.tokens_total)} tokens
                </span>
                <span className="col-start-3 text-right text-xs text-ink-2 sm:col-start-auto sm:text-sm">
                  {o.member_count} {o.member_count === 1 ? "member" : "members"}
                </span>
              </li>
            ))}
          </ol>
        )}
      </div>
    </div>
  );
}
