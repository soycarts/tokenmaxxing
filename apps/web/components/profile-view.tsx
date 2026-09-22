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
    <div className="mx-auto max-w-6xl px-4 pt-12 sm:px-6 md:pt-16">
      {p.is_you && !p.public && (
        <p className="mb-6 rounded-md border border-amber/50 bg-amber-soft px-4 py-3 text-sm">
          Only you can see this page. Make your profile public on your <Link href="/me" className="underline">account page</Link> to
          appear on leaderboards.
        </p>
      )}

      <header className="flex flex-wrap items-center justify-between gap-6">
        <div className="flex items-center gap-4">
          <Avatar src={p.avatar_url} name={p.handle} size={56} />
          <div>
            <h1 className="text-3xl font-extrabold tracking-[-0.03em] sm:text-4xl">@{p.handle}</h1>
            {p.display_name && <p className="text-muted">{p.display_name}</p>}
          </div>
        </div>
        <Chips label="Period" items={PERIODS.map((x) => ({ value: x, label: PERIOD_LABEL[x] }))} active={p.period} href={(x) => `/u/${p.handle}?period=${x}`} />
      </header>

      <section aria-label="Return on plan" className="mt-10 grid gap-px overflow-hidden rounded-md border border-line bg-line md:grid-cols-[1.4fr_1fr]">
        <div className="bg-raised px-6 py-7">
          <p className="text-sm text-muted">API-equivalent value, {PERIOD_LABEL[p.period].toLowerCase()}</p>
          <p className="num mt-2 text-5xl font-semibold tracking-tight text-amber sm:text-6xl">{formatUsd(p.api_equiv_usd)}</p>
          <p className="mt-4 text-sm text-muted">
            {planList.length ? (
              <>
                Against {formatUsd(p.plan_period_usd, { cents: true })} of plan cost for the period (
                {planList.map(([prov, plan]) => `${PROVIDER_LABEL[prov as Provider] ?? prov} ${plan}`).join(", ")},{" "}
                {formatUsd(p.plan_monthly_usd, { cents: true })}/mo).
              </>
            ) : (
              <>No plan set, so no ROI. {p.is_you ? <Link href="/me" className="underline">Set one</Link> : null}</>
            )}
          </p>
        </div>
        <div className="flex flex-col justify-center bg-ink px-6 py-7">
          <p className="text-sm text-muted">Multiple of plan price</p>
          <p className="num mt-2 text-5xl font-semibold tracking-tight">{roi === null ? "—" : formatRoi(roi)}</p>
        </div>
      </section>

      <dl className="mt-6 grid grid-cols-2 gap-px overflow-hidden rounded-md border border-line bg-line sm:grid-cols-4">
        <Stat label="Tokens" value={formatTokens(p.tokens_total)} />
        <Stat label="Output tokens" value={formatTokens(p.output_tokens)} />
        <Stat label="Cache hit" value={formatPct(p.cache_read_ratio)} />
        <div className="bg-ink px-5 py-4">
          <dt className="text-sm text-muted">Tools</dt>
          <dd className="mt-2">
            {p.sources.length ? <SourceIcons sources={p.sources} /> : <span className="text-faint">none yet</span>}
            <span className="sr-only">{p.sources.map(sourceLabel).join(", ")}</span>
          </dd>
        </div>
      </dl>

      <section aria-labelledby="daily" className="mt-10">
        <div className="flex items-baseline justify-between">
          <h2 id="daily" className="font-bold">Last 30 days</h2>
          <span className="num text-sm text-muted">{formatUsd(p.daily.reduce((s, d) => s + d.usd, 0))}</span>
        </div>
        <div className="mt-3">
          <Sparkline days={p.daily} />
        </div>
      </section>

      <section aria-labelledby="models" className="mt-10">
        <h2 id="models" className="font-bold">By model, {PERIOD_LABEL[p.period].toLowerCase()}</h2>
        {p.models.length === 0 ? (
          <p className="mt-3 text-muted">No usage in this period.</p>
        ) : (
          <div className="mt-3 overflow-hidden rounded-md border border-line">
            <table className="w-full text-sm">
              <thead className="hidden bg-raised text-left text-muted sm:table-header-group">
                <tr>
                  <th scope="col" className="px-4 py-2.5 font-medium">Model</th>
                  <th scope="col" className="px-4 py-2.5 text-right font-medium">Input</th>
                  <th scope="col" className="px-4 py-2.5 text-right font-medium">Cache read</th>
                  <th scope="col" className="px-4 py-2.5 text-right font-medium">Cache write</th>
                  <th scope="col" className="px-4 py-2.5 text-right font-medium">Output</th>
                  <th scope="col" className="px-4 py-2.5 text-right font-medium">At API rates</th>
                </tr>
              </thead>
              <tbody className="num">
                {p.models.map((m) => (
                  <tr key={`${m.source}/${m.model}`} className="grid grid-cols-2 gap-x-4 gap-y-1 border-t border-line px-4 py-3 first:border-t-0 sm:table-row sm:p-0 sm:first:border-t">
                    <td className="col-span-2 break-all sm:px-4 sm:py-2.5">
                      <span className="text-faint">{m.source} </span>
                      {m.model}
                    </td>
                    <Cell label="Input" v={formatTokens(m.input)} />
                    <Cell label="Cache read" v={formatTokens(m.cache_read)} />
                    <Cell label="Cache write" v={formatTokens(m.cache_write)} />
                    <Cell label="Output" v={formatTokens(m.output)} />
                    <td className="col-span-2 flex justify-between font-semibold sm:table-cell sm:px-4 sm:py-2.5 sm:text-right">
                      <span className="font-sans font-normal text-muted sm:hidden">At API rates</span>
                      {m.priced ? formatUsd(m.usd, { cents: true }) : <span className="font-sans font-normal text-faint">unpriced</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {unpriced.length > 0 && (
          <p className="mt-3 text-sm text-muted">
            {formatTokens(p.unpriced_tokens)} tokens from {unpriced.length === 1 ? "a model" : `${unpriced.length} models`} with no
            published API price ({unpriced.map((m) => m.model).join(", ")}) count toward volume but add $0 to value.
          </p>
        )}
      </section>

      {p.public && (
        <section aria-labelledby="badge" className="mt-10 max-w-3xl">
          <h2 id="badge" className="font-bold">Badge</h2>
          <p className="mt-2 text-sm text-muted">
            For a README. Swap <code className="code-cond text-paper">metric=value</code> for <code className="code-cond text-paper">roi</code> or{" "}
            <code className="code-cond text-paper">rank</code>, and <code className="code-cond text-paper">period</code> for week, month or all.
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

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-ink px-5 py-4">
      <dt className="text-sm text-muted">{label}</dt>
      <dd className="num mt-1 text-2xl font-semibold">{value}</dd>
    </div>
  );
}

function Cell({ label, v }: { label: string; v: string }) {
  return (
    <td className="flex justify-between sm:table-cell sm:px-4 sm:py-2.5 sm:text-right">
      <span className="font-sans text-muted sm:hidden">{label}</span>
      {v}
    </td>
  );
}
