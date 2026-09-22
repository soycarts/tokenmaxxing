import type { Metadata } from "next";
import Link from "next/link";
import { Flash, first } from "@/components/flash";
import { buttonClass, dangerButtonClass, inputClass, primaryButtonClass } from "@/components/form";
import { HandleForm } from "@/components/handle-form";
import { NotConfigured } from "@/components/not-configured";
import { SignInButton } from "@/components/sign-in";
import { SubmitButton } from "@/components/submit-button";
import { formatDate } from "@/lib/format";
import { suggestHandle } from "@/lib/handles";
import { PLANS, PROVIDER_LABEL, PROVIDERS, type Plans } from "@/lib/plans";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient, getSessionUser } from "@/lib/supabase/server";
import {
  createOrg,
  deleteAccount,
  joinOrg,
  leaveOrg,
  renameDevice,
  revokeDevice,
  savePlans,
  setPublic,
} from "./actions";

export const metadata: Metadata = { title: "Account" };

type Device = { id: string; name: string; created_at: string; last_push_at: string | null };
type MyOrg = { slug: string; name: string; role: string; public: boolean; invite_code: string; member_count: number };

export default async function MePage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const flash = <Flash ok={first(sp.ok)} error={first(sp.error)} />;
  const supabase = await createClient();

  if (!supabase) {
    return (
      <Shell>
        <div className="max-w-2xl">
          <NotConfigured what="Sign-in, device linking and plans will work here" />
        </div>
      </Shell>
    );
  }

  const user = await getSessionUser(supabase);
  if (!user) {
    return (
      <Shell>
        {flash}
        <p className="mt-6 max-w-[56ch] text-lg text-muted">
          Sign in to link devices, set your plans for ROI, and choose whether your profile is public. We use your GitHub account
          for identity only.
        </p>
        <div className="mt-6">
          <SignInButton next="/me" />
        </div>
      </Shell>
    );
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("handle, public, plans")
    .eq("id", user.id)
    .maybeSingle<{ handle: string; public: boolean; plans: Plans }>();

  if (!profile) {
    return (
      <Shell>
        {flash}
        <div className="mt-6">
          <HandleForm suggestion={suggestHandle(user.login)} next="/me" />
        </div>
      </Shell>
    );
  }

  const [{ data: devices }, { data: orgs }] = await Promise.all([
    supabase.from("devices").select("id, name, created_at, last_push_at").order("created_at", { ascending: false }),
    supabase.rpc("my_orgs"),
  ]);
  const admin = createAdminClient();
  const active = new Set<string>();
  if (admin) {
    const { data: tokens } = await admin.from("api_tokens").select("device_id").eq("user_id", user.id);
    for (const t of tokens ?? []) active.add(t.device_id as string);
  }

  return (
    <Shell handle={profile.handle}>
      {flash}

      <Block title="Profile">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p>
              <Link href={`/u/${profile.handle}`} className="code-cond text-paper underline">
                /u/{profile.handle}
              </Link>
            </p>
            <p className="mt-1 text-sm text-muted">
              {profile.public
                ? "Public: on leaderboards, badges and your profile page."
                : "Private: only you can see your profile. You are not on any leaderboard."}
            </p>
          </div>
          <form action={setPublic}>
            <input type="hidden" name="public" value={profile.public ? "false" : "true"} />
            <SubmitButton className={profile.public ? buttonClass : primaryButtonClass}>{profile.public ? "Make private" : "Make public"}</SubmitButton>
          </form>
        </div>
      </Block>

      <Block title="Plans" note="What you pay per month. Used for ROI; leave a provider on None if you pay per token.">
        <form action={savePlans} className="grid gap-4 sm:grid-cols-2">
          {PROVIDERS.map((provider) => (
            <label key={provider} className="block">
              <span className="text-sm text-muted">{PROVIDER_LABEL[provider]}</span>
              <select name={`plan_${provider}`} defaultValue={profile.plans?.[provider] ?? ""} className={`${inputClass} mt-1`}>
                <option value="">None</option>
                {Object.entries(PLANS[provider]).map(([plan, usd]) => (
                  <option key={plan} value={plan}>
                    {plan} (${usd}/mo)
                  </option>
                ))}
              </select>
            </label>
          ))}
          <div className="sm:col-span-2">
            <SubmitButton className={primaryButtonClass}>Save plans</SubmitButton>
          </div>
        </form>
      </Block>

      <Block title="Devices" note="Each machine you linked with the CLI. Revoking stops future pushes; past usage stays.">
        {!devices?.length ? (
          <p className="text-muted">
            No devices linked yet. Run <code className="code-cond text-paper">npx tokenmaxxing-cli link</code> in a terminal and
            open the URL it prints.
          </p>
        ) : (
          <ul className="divide-y divide-line border-y border-line">
            {(devices as Device[]).map((d) => {
              const on = !admin || active.has(d.id);
              return (
                <li key={d.id} className="flex flex-col gap-3 py-4 sm:flex-row sm:items-center sm:justify-between">
                  <form action={renameDevice} className="flex min-w-0 flex-1 gap-2">
                    <input type="hidden" name="id" value={d.id} />
                    <label className="sr-only" htmlFor={`name-${d.id}`}>Device name</label>
                    <input id={`name-${d.id}`} name="name" defaultValue={d.name} maxLength={64} className={`${inputClass} max-w-xs`} />
                    <SubmitButton className={buttonClass}>Rename</SubmitButton>
                  </form>
                  <div className="flex items-center justify-between gap-4 sm:justify-end">
                    <p className="text-sm text-muted">
                      {on ? "Last push " : "Revoked. Last push "}
                      <span className="num text-paper">{formatDate(d.last_push_at)}</span>
                    </p>
                    {on && admin && (
                      <form action={revokeDevice}>
                        <input type="hidden" name="id" value={d.id} />
                        <SubmitButton className={dangerButtonClass}>Revoke</SubmitButton>
                      </form>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </Block>

      <Block title="Orgs" note="Your totals count toward every org you are in. Members see each other; outsiders see public members only.">
        {(orgs as MyOrg[] | null)?.length ? (
          <ul className="mb-6 divide-y divide-line border-y border-line">
            {(orgs as MyOrg[]).map((o) => (
              <li key={o.slug} className="flex flex-col gap-2 py-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <Link href={`/orgs/${o.slug}`} className="font-semibold underline">{o.name}</Link>
                  <p className="text-sm text-muted">
                    {o.role === "owner" ? "Owner" : "Member"}, {o.member_count} {o.member_count === 1 ? "member" : "members"},{" "}
                    {o.public ? "public" : "private"}. Invite code <span className="num text-paper">{o.invite_code}</span>
                  </p>
                </div>
                <form action={leaveOrg}>
                  <input type="hidden" name="slug" value={o.slug} />
                  <SubmitButton className={buttonClass}>Leave</SubmitButton>
                </form>
              </li>
            ))}
          </ul>
        ) : null}
        <div className="grid gap-8 md:grid-cols-2">
          <form action={createOrg} className="space-y-3">
            <p className="font-semibold">Start an org</p>
            <label className="block">
              <span className="text-sm text-muted">Name</span>
              <input name="name" required maxLength={64} className={`${inputClass} mt-1`} />
            </label>
            <label className="block">
              <span className="text-sm text-muted">URL, /orgs/…</span>
              <input name="slug" maxLength={32} pattern="[a-z0-9\-]{2,32}" placeholder="from the name" spellCheck={false} className={`${inputClass} mt-1 code-cond`} />
            </label>
            <label className="flex items-center gap-2 text-sm text-muted">
              <input type="checkbox" name="public" defaultChecked className="accent-[var(--amber)]" />
              Show on the org leaderboard
            </label>
            <SubmitButton className={primaryButtonClass}>Create org</SubmitButton>
          </form>
          <form action={joinOrg} className="space-y-3">
            <p className="font-semibold">Join with an invite code</p>
            <label className="block">
              <span className="text-sm text-muted">Invite code</span>
              <input name="code" required maxLength={16} spellCheck={false} autoCapitalize="characters" className={`${inputClass} mt-1 code-cond uppercase`} />
            </label>
            <SubmitButton className={buttonClass}>Join org</SubmitButton>
          </form>
        </div>
      </Block>

      <Block title="Session">
        <div className="flex flex-col gap-8 md:flex-row md:justify-between">
          <form action="/auth/signout" method="post">
            <SubmitButton className={buttonClass}>Sign out</SubmitButton>
          </form>
          {admin && (
            <form action={deleteAccount} className="max-w-sm space-y-2">
              <label htmlFor="confirm" className="block text-sm text-muted">
                Delete your account, devices and every pushed row. Orgs you own go too. Type{" "}
                <span className="code-cond text-paper">{profile.handle}</span> to confirm.
              </label>
              <div className="flex gap-2">
                <input id="confirm" name="confirm" autoComplete="off" spellCheck={false} className={`${inputClass} code-cond`} />
                <SubmitButton className={dangerButtonClass}>Delete account</SubmitButton>
              </div>
            </form>
          )}
        </div>
      </Block>
    </Shell>
  );
}

function Shell({ children, handle }: { children: React.ReactNode; handle?: string }) {
  return (
    <div className="mx-auto max-w-4xl px-4 pt-12 sm:px-6 md:pt-16">
      <h1 className="mb-6 text-4xl font-extrabold tracking-[-0.03em] sm:text-5xl">{handle ? `@${handle}` : "Account"}</h1>
      {children}
    </div>
  );
}

function Block({ title, note, children }: { title: string; note?: string; children: React.ReactNode }) {
  return (
    <section className="mt-12">
      <h2 className="text-xl font-bold tracking-tight">{title}</h2>
      {note && <p className="mt-1 max-w-[64ch] text-sm text-muted">{note}</p>}
      <div className="mt-4">{children}</div>
    </section>
  );
}
