import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Avatar } from "@/components/avatar";
import { Chips } from "@/components/chips";
import { NotConfigured } from "@/components/not-configured";
import { getOrgPage } from "@/lib/data";
import { formatTokens, formatUsd } from "@/lib/format";
import { PERIOD_LABEL, PERIODS, SLUG_RE, parsePeriod } from "@/lib/periods";
import { createClient } from "@/lib/supabase/server";

type Props = {
  params: Promise<{ slug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  return { title: `/orgs/${(await params).slug}` };
}

export default async function OrgRoute({ params, searchParams }: Props) {
  const slug = decodeURIComponent((await params).slug).toLowerCase();
  const period = parsePeriod((await searchParams).period, "month");
  if (!SLUG_RE.test(slug)) notFound();

  const supabase = await createClient();
  if (!supabase) {
    return (
      <div className="mx-auto max-w-6xl px-4 pt-12 sm:px-6 md:pt-16">
        <h1 className="text-4xl font-extrabold tracking-[-0.03em]">/orgs/{slug}</h1>
        <div className="mt-8 max-w-2xl"><NotConfigured what="Orgs will show up here" /></div>
      </div>
    );
  }
  const res = await getOrgPage(slug, period, supabase);
  if (!res.configured) notFound();
  if (res.error) throw new Error("org_page failed");
  const o = res.data;
  if (!o) notFound();

  return (
    <div className="mx-auto max-w-6xl px-4 pt-12 sm:px-6 md:pt-16">
      <header className="flex flex-wrap items-end justify-between gap-6">
        <div>
          <h1 className="text-4xl font-extrabold tracking-[-0.03em] sm:text-5xl">{o.name}</h1>
          <p className="mt-2 text-muted">
            {o.member_count} {o.member_count === 1 ? "member" : "members"}
            {o.public ? "" : ", private org"}
          </p>
        </div>
        <Chips label="Period" items={PERIODS.map((x) => ({ value: x, label: PERIOD_LABEL[x] }))} active={o.period} href={(x) => `/orgs/${o.slug}?period=${x}`} />
      </header>

      <dl className="mt-10 grid gap-px overflow-hidden rounded-md border border-line bg-line sm:grid-cols-[1.4fr_1fr]">
        <div className="bg-raised px-6 py-7">
          <dt className="text-sm text-muted">API-equivalent value, {PERIOD_LABEL[o.period].toLowerCase()}</dt>
          <dd className="num mt-2 text-5xl font-semibold tracking-tight text-amber">{formatUsd(o.api_equiv_usd)}</dd>
        </div>
        <div className="flex flex-col justify-center bg-ink px-6 py-7">
          <dt className="text-sm text-muted">Tokens</dt>
          <dd className="num mt-2 text-4xl font-semibold">{formatTokens(o.tokens_total)}</dd>
        </div>
      </dl>

      {o.is_member && o.invite_code && (
        <p className="mt-6 text-sm text-muted">
          Invite code for teammates: <span className="num rounded bg-raised px-2 py-1 text-paper">{o.invite_code}</span>. They join
          from their <Link href="/me" className="underline">account page</Link>.
        </p>
      )}

      <section aria-labelledby="members" className="mt-10">
        <h2 id="members" className="font-bold">Members</h2>
        {o.members.length === 0 ? (
          <p className="mt-3 text-muted">No public members to show.</p>
        ) : (
          <ol className="mt-3 divide-y divide-line border-y border-line">
            {o.members.map((m) => (
              <li key={m.handle} className="flex items-center justify-between gap-4 py-3">
                <span className="flex min-w-0 items-center gap-2.5">
                  <Avatar src={m.avatar_url} name={m.handle} />
                  {m.public ? (
                    <Link href={`/u/${m.handle}`} className="truncate font-medium no-underline hover:text-amber">{m.handle}</Link>
                  ) : (
                    <span className="truncate font-medium">{m.handle} <span className="text-xs text-faint">(private)</span></span>
                  )}
                  {m.role === "owner" && <span className="text-xs text-faint">owner</span>}
                </span>
                <span className="text-right">
                  <span className="num block font-semibold">{formatUsd(m.api_equiv_usd)}</span>
                  <span className="num block text-xs text-muted">{formatTokens(m.tokens_total)} tokens</span>
                </span>
              </li>
            ))}
          </ol>
        )}
        {o.hidden_members > 0 && (
          <p className="mt-3 text-sm text-muted">
            {o.hidden_members} private {o.hidden_members === 1 ? "member counts" : "members count"} toward the total but {o.hidden_members === 1 ? "isn't" : "aren't"} listed.
          </p>
        )}
      </section>
    </div>
  );
}
