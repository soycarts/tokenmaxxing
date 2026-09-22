import Link from "next/link";
import { Avatar } from "@/components/avatar";
import { Chips } from "@/components/chips";
import { CopyBox } from "@/components/copy-box";
import { SourceIcons, sourceLabel } from "@/components/source-icons";
import { Sparkline } from "@/components/sparkline";
import type { ProfilePage } from "@/lib/data";
import { siteUrl } from "@/lib/env";
import { formatPct, formatRoi, formatTokens, formatUsd } from "@/lib/format";
import { PERIOD_LABEL, PERIODS } from "@/lib/periods";
import { PROVIDER_LABEL, type Provider } from "@/lib/plans";

export function ProfileView({ p }: { p: ProfilePage }) {
  const roi = p.plan_period_usd > 0 ? p.api_equiv_usd / p.plan_period_usd : null;
  const planList = Object.entries(p.plans ?? {});
  const unpriced = p.models.filter((m) => !m.priced);
  const base = siteUrl();
  const badge = `[![tokenmaxxing](${base}/badge/${p.handle}.svg?metric=value&period=month)](${base}/u/${p.handle})`;

  return (
    <div className="mx-auto max-w-6xl px-4 pt-10 sm:px-6 md:pt-14">
      {p.is_you && !p.public && (
        <p className="mb-6 rounded-xl border-[2.5px] border-edge bg-gold-soft px-4 py-3 text-sm font-medium">
          Only you can see this page. Make your profile public on your <Link href="/me" className="underline">account page</Link> to
          appear on leaderboards.
        </p>
      )}

      <header className="flex flex-wrap items-center justify-between gap-5">
        <div className="flex min-w-0 items-center gap-4">
          <Avatar src={p.avatar_url} name={p.handle} size={64} />
          <div className="min-w-0">
            <h1 className="display truncate text-5xl sm:text-6xl">@{p.handle}</h1>
            {p.display_name && <p className="mt-1 text-ink-2">{p.display_name}</p>}
          </div>
        </div>
        <Chips label="Period" items={PERIODS.map((x) => ({ value: x, label: PERIOD_LABEL[x] }))} active={p.period} href={(x) => `/u/${p.handle}?period=${x}`} />
      </header>

      <RoiPoster p={p} roi={roi} planList={planList} />

      <dl className="sticker mt-8 grid grid-cols-2 overflow-hidden sm:grid-cols-4">
        <Stat label="Tokens" value={formatTokens(p.tokens_total)} />
        <Stat label="Output tokens" value={formatTokens(p.output_tokens)} />
        <Stat label="Cache hit" value={formatPct(p.cache_read_ratio)} />
        <div className="border-l-2 border-line px-5 py-4 max-sm:border-t-2">
          <dt className="text-sm text-ink-2">Tools</dt>
          <dd className="mt-2.5">
            {p.sources.length ? <SourceIcons sources={p.sources} /> : <span className="text-muted">none yet</span>}
            <span className="sr-only">{p.sources.map(sourceLabel).join(", ")}</span>
          </dd>
        </div>
      </dl>

      <section aria-labelledby="daily" className="mt-14">
        <div className="flex items-baseline justify-between gap-4">
          <h2 id="daily" className="display text-3xl sm:text-4xl">Last 30 days</h2>
          <span className="display text-2xl">{formatUsd(p.daily.reduce((s, d) => s + d.usd, 0))}</span>
        </div>
        <div className="sticker mt-4 px-4 pb-3 pt-5 sm:px-6">
          <Sparkline days={p.daily} />
        </div>
      </section>

      <section aria-labelledby="models" className="mt-14">
        <h2 id="models" className="display text-3xl sm:text-4xl">By model, {PERIOD_LABEL[p.period].toLowerCase()}</h2>
        {p.models.length === 0 ? (
          <p className="mt-3 text-ink-2">No usage in this period.</p>
        ) : (
          <div className="sticker mt-4 overflow-hidden">
            <table className="w-full text-sm">
              <thead className="hidden bg-band text-left text-on-band sm:table-header-group">
                <tr>
                  <th scope="col" className="display px-4 py-3 text-sm font-normal tracking-[0.05em]">Model</th>
                  <th scope="col" className="display px-4 py-3 text-right text-sm font-normal tracking-[0.05em]">Input</th>
                  <th scope="col" className="display px-4 py-3 text-right text-sm font-normal tracking-[0.05em]">Cache read</th>
                  <th scope="col" className="display px-4 py-3 text-right text-sm font-normal tracking-[0.05em]">Cache write</th>
                  <th scope="col" className="display px-4 py-3 text-right text-sm font-normal tracking-[0.05em]">Output</th>
                  <th scope="col" className="display px-4 py-3 text-right text-sm font-normal tracking-[0.05em]">At API rates</th>
                </tr>
              </thead>
              <tbody className="num">
                {p.models.map((m) => (
                  <tr key={`${m.source}/${m.model}`} className="grid grid-cols-2 gap-x-4 gap-y-1 border-t-2 border-line px-4 py-3.5 first:border-t-0 sm:table-row sm:p-0 sm:first:border-t-0">
                    <td className="col-span-2 break-all font-mono text-[0.82rem] sm:px-4 sm:py-3">
                      <span className="text-muted">{m.source} </span>
                      {m.model}
                    </td>
                    <Cell label="Input" v={formatTokens(m.input)} />
                    <Cell label="Cache read" v={formatTokens(m.cache_read)} />
                    <Cell label="Cache write" v={formatTokens(m.cache_write)} />
                    <Cell label="Output" v={formatTokens(m.output)} />
                    <td className="col-span-2 flex justify-between font-bold sm:table-cell sm:px-4 sm:py-3 sm:text-right">
                      <span className="font-normal text-ink-2 sm:hidden">At API rates</span>
                      {m.priced ? formatUsd(m.usd, { cents: true }) : <span className="font-normal text-muted">unpriced</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {unpriced.length > 0 && (
          <p className="mt-4 max-w-[80ch] text-sm text-ink-2">
            {formatTokens(p.unpriced_tokens)} tokens from {unpriced.length === 1 ? "a model" : `${unpriced.length} models`} with no
            published API price ({unpriced.map((m) => m.model).join(", ")}) count toward volume but add $0 to value.
          </p>
        )}
      </section>

      {p.public && (
        <section aria-labelledby="badge" className="mt-14 max-w-3xl">
          <h2 id="badge" className="display text-3xl sm:text-4xl">Badge</h2>
          <p className="mt-2 text-ink-2">
            For a README. Swap <code className="font-mono text-[0.85em] text-ink">metric=value</code> for{" "}
            <code className="font-mono text-[0.85em] text-ink">roi</code> or <code className="font-mono text-[0.85em] text-ink">rank</code>, and{" "}
            <code className="font-mono text-[0.85em] text-ink">period</code> for week, month or all.
          </p>
          {/* eslint-disable-next-line @next/next/no-img-element -- live SVG from our own route */}
          <img src={`/badge/${p.handle}.svg?metric=value&period=month`} alt={`tokenmaxxing badge for ${p.handle}`} height={20} className="mt-4 h-5" />
          <div className="mt-3">
            <CopyBox text={badge} label="badge markdown" compact />
          </div>
        </section>
      )}
    </div>
  );
}

/**
 * The share-ready card: the multiple as a poster, gold, with a "paid for itself" stamp once
 * the plan has. Without a plan, the dollar figure takes the stage instead.
 */
function RoiPoster({ p, roi, planList }: { p: ProfilePage; roi: number | null; planList: [string, string][] }) {
  const paidOff = roi !== null && roi >= 1;
  const periodWord = PERIOD_LABEL[p.period].toLowerCase();
  return (
    <section aria-label="Return on plan" className="sticker relative mt-10 overflow-hidden bg-gold text-on-gold">
      <div className="grid gap-2 px-5 pb-6 pt-6 sm:px-9 sm:pb-8 sm:pt-8 md:grid-cols-[minmax(0,1fr)_auto] md:items-end">
        <div className="min-w-0">
          <p className={`display text-lg tracking-[0.04em] sm:text-xl md:pr-0 ${paidOff ? "pr-24 sm:pr-40" : ""}`}>
            {roi === null ? `API-equivalent value, ${periodWord}` : `Multiple of plan price, ${periodWord}`}
          </p>
          <p className="display mt-3 text-[6.5rem] leading-[0.82] tracking-[-0.01em] sm:text-[11rem] lg:text-[15rem]">
            {roi === null ? formatUsd(p.api_equiv_usd) : formatRoi(roi)}
          </p>
          <p className="mt-5 max-w-[54ch] text-[0.95rem] font-medium leading-relaxed sm:text-base">
            {roi !== null ? (
              <>
                <strong className="font-bold">{formatUsd(p.api_equiv_usd)}</strong> of API-equivalent usage against{" "}
                {formatUsd(p.plan_period_usd, { cents: true })} of plan cost for the period (
                {planList.map(([prov, plan]) => `${PROVIDER_LABEL[prov as Provider] ?? prov} ${plan}`).join(", ")},{" "}
                {formatUsd(p.plan_monthly_usd, { cents: true })}/mo).
              </>
            ) : (
              <>No plan set, so no ROI. {p.is_you ? <Link href="/me" className="font-bold underline">Set one</Link> : null}</>
            )}
          </p>
        </div>
        {paidOff && (
          <p
            aria-hidden="true"
            className="display absolute right-4 top-4 flex h-[92px] w-[92px] rotate-[10deg] items-center justify-center rounded-full border-[2.5px] border-edge bg-accent text-center text-[0.95rem] leading-[0.95] tracking-[0.03em] text-on-accent shadow-[4px_4px_0_var(--edge)] sm:right-8 sm:top-7 sm:h-[128px] sm:w-[128px] sm:text-[1.3rem] md:static md:mb-4 md:h-[176px] md:w-[176px] md:text-[1.9rem]"
          >
            Paid for
            <br />
            itself
          </p>
        )}
      </div>
      <div className="flex items-center justify-between gap-4 border-t-[2.5px] border-edge bg-surface px-5 py-3 text-ink sm:px-9">
        <span className="truncate font-mono text-sm">tokenmaxxing.fyi/u/{p.handle}</span>
        <span className="display shrink-0 text-sm tracking-[0.05em]">At API list rates</span>
      </div>
    </section>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="border-line px-5 py-4 max-sm:[&:nth-child(n+3)]:border-t-2 max-sm:[&:nth-child(even)]:border-l-2 sm:[&:not(:first-child)]:border-l-2">
      <dt className="text-sm text-ink-2">{label}</dt>
      <dd className="display mt-1.5 text-4xl leading-none">{value}</dd>
    </div>
  );
}

function Cell({ label, v }: { label: string; v: string }) {
  return (
    <td className="flex justify-between sm:table-cell sm:px-4 sm:py-3 sm:text-right">
      <span className="text-ink-2 sm:hidden">{label}</span>
      {v}
    </td>
  );
}
