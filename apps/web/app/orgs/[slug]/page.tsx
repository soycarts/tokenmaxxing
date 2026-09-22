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
      <div className="mx-auto max-w-6xl px-4 pt-10 sm:px-6 md:pt-14">
        <h1 className="display break-all text-5xl sm:text-6xl">/orgs/{slug}</h1>
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
    <div className="mx-auto max-w-6xl px-4 pt-10 sm:px-6 md:pt-14">
      <header className="flex flex-wrap items-end justify-between gap-6">
        <div className="min-w-0">
          <h1 className="display break-words text-[3.4rem] sm:text-7xl">{o.name}</h1>
          <p className="mt-2 text-ink-2">
            {o.member_count} {o.member_count === 1 ? "member" : "members"}
            {o.public ? "" : ", private org"}
          </p>
        </div>
        <Chips label="Period" items={PERIODS.map((x) => ({ value: x, label: PERIOD_LABEL[x] }))} active={o.period} href={(x) => `/orgs/${o.slug}?period=${x}`} />
      </header>

      <dl className="sticker mt-10 grid overflow-hidden sm:grid-cols-[1.4fr_1fr]">
        <div className="bg-gold px-6 py-7 text-on-gold sm:px-8">
          <dt className="display text-lg tracking-[0.04em]">API-equivalent value, {PERIOD_LABEL[o.period].toLowerCase()}</dt>
          <dd className="display mt-2 text-7xl leading-[0.9] sm:text-8xl">{formatUsd(o.api_equiv_usd)}</dd>
        </div>
        <div className="flex flex-col justify-center border-edge px-6 py-7 max-sm:border-t-[2.5px] sm:border-l-[2.5px] sm:px-8">
          <dt className="display text-lg tracking-[0.04em]">Tokens</dt>
          <dd className="display mt-2 text-6xl leading-[0.9]">{formatTokens(o.tokens_total)}</dd>
        </div>
      </dl>

      {o.is_member && o.invite_code && (
        <p className="mt-6 text-ink-2">
          Invite code for teammates: <span className="display rounded-lg border-2 border-edge bg-gold-soft px-2 py-1 tracking-[0.12em] text-ink">{o.invite_code}</span>. They join
          from their <Link href="/me" className="underline">account page</Link>.
        </p>
      )}

      <section aria-labelledby="members" className="mt-10">
        <h2 id="members" className="display text-3xl sm:text-4xl">Members</h2>
        {o.members.length === 0 ? (
          <p className="mt-3 text-ink-2">No public members to show.</p>
        ) : (
          <ol className="sticker mt-4 divide-y-2 divide-line overflow-hidden">
            {o.members.map((m) => (
              <li key={m.handle} className="flex items-center justify-between gap-4 px-4 py-3.5 sm:px-5">
                <span className="flex min-w-0 items-center gap-2.5">
                  <Avatar src={m.avatar_url} name={m.handle} size={32} />
                  {m.public ? (
                    <Link href={`/u/${m.handle}`} className="truncate font-semibold no-underline hover:underline">{m.handle}</Link>
                  ) : (
                    <span className="truncate font-semibold">{m.handle} <span className="text-xs font-normal text-muted">(private)</span></span>
                  )}
                  {m.role === "owner" && <span className="text-xs text-muted">owner</span>}
                </span>
                <span className="text-right">
                  <span className="display block text-2xl leading-none">{formatUsd(m.api_equiv_usd)}</span>
                  <span className="num block text-xs text-ink-2">{formatTokens(m.tokens_total)} tokens</span>
                </span>
              </li>
            ))}
          </ol>
        )}
        {o.hidden_members > 0 && (
          <p className="mt-3 text-sm text-ink-2">
            {o.hidden_members} private {o.hidden_members === 1 ? "member counts" : "members count"} toward the total but {o.hidden_members === 1 ? "isn't" : "aren't"} listed.
          </p>
        )}
      </section>
    </div>
  );
}
