import type { Metadata } from "next";
import Link from "next/link";
import { Chips } from "@/components/chips";
import { NotConfigured } from "@/components/not-configured";
import { getOrgLeaderboard } from "@/lib/data";
import { formatTokens, formatUsd } from "@/lib/format";
import { PERIOD_LABEL, PERIODS, parsePeriod } from "@/lib/periods";

export const metadata: Metadata = { title: "Orgs" };

export default async function OrgLeaderboardPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const period = parsePeriod((await searchParams).period);
  const res = await getOrgLeaderboard(period);

  return (
    <div className="mx-auto max-w-6xl px-4 pt-12 sm:px-6 md:pt-16">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <h1 className="text-4xl font-extrabold tracking-[-0.03em] sm:text-5xl">Orgs by value</h1>
        <Link href={`/leaderboard?period=${period}`} className="text-sm text-muted underline hover:text-paper">
          People
        </Link>
      </div>
      <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="max-w-[62ch] text-sm text-muted">
          API-equivalent value summed over every member. Public orgs only. Start one from your account page.
        </p>
        <Chips label="Period" items={PERIODS.map((p) => ({ value: p, label: PERIOD_LABEL[p] }))} active={period} href={(p) => `/leaderboard/orgs?period=${p}`} />
      </div>

      <div className="mt-8">
        {!res.configured ? (
          <NotConfigured what="The org leaderboard will show up here" />
        ) : res.error ? (
          <p role="alert" className="text-danger">The org leaderboard could not be loaded. Try again in a minute.</p>
        ) : res.data.length === 0 ? (
          <div className="rounded-md border border-dashed border-line-strong px-5 py-8">
            <p className="font-semibold">No public orgs yet.</p>
            <p className="mt-1 text-muted">
              Create one on your <Link href="/me" className="text-paper underline">account page</Link> and share the invite code.
            </p>
          </div>
        ) : (
          <ol className="divide-y divide-line border-y border-line">
            {res.data.map((o) => (
              <li key={o.slug} className="grid grid-cols-[2.5rem_1fr_auto] items-center gap-x-3 gap-y-1 py-3 sm:grid-cols-[3.5rem_1fr_10rem_9rem_7rem] sm:gap-4">
                <span className={`num row-span-2 text-sm sm:row-span-1 ${o.rank <= 3 ? "text-amber" : "text-faint"}`}>
                  {String(o.rank).padStart(2, "0")}
                </span>
                <Link href={`/orgs/${o.slug}`} className="truncate font-medium no-underline hover:text-amber">
                  {o.name}
                </Link>
                <span className="num text-right text-lg font-semibold">{formatUsd(o.api_equiv_usd)}</span>
                <span className="num col-start-2 text-xs text-muted sm:col-start-auto sm:text-right sm:text-sm">
                  {formatTokens(o.tokens_total)} tokens
                </span>
                <span className="col-start-3 text-right text-xs text-muted sm:col-start-auto sm:text-sm">
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
