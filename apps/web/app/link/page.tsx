import type { Metadata } from "next";
import { Flash, first } from "@/components/flash";
import { bigPrimaryButtonClass, buttonClass, inputClass } from "@/components/form";
import { HandleForm } from "@/components/handle-form";
import { NotConfigured } from "@/components/not-configured";
import { SignInButton } from "@/components/sign-in";
import { SubmitButton } from "@/components/submit-button";
import { suggestHandle } from "@/lib/handles";
import { normalizeLinkCode } from "@/lib/link-code";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient, getSessionUser } from "@/lib/supabase/server";
import { confirmLink } from "./actions";

export const metadata: Metadata = { title: "Link a device", robots: { index: false } };

export default async function LinkPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const raw = first(sp.code);
  const code = normalizeLinkCode(raw);
  const flash = <Flash error={first(sp.error)} />;

  if (!code) {
    return (
      <Shell>
        {raw && <Flash error={`"${raw}" is not a link code. Codes are 8 letters and digits.`} />}
        <p className="mt-4 max-w-[56ch] text-lg text-ink-2">
          Run <code className="font-mono text-[0.9em] text-ink">npx tokenmaxxing-cli link</code> in your terminal. It prints a URL with a code;
          open it here, or type the code.
        </p>
        <form method="get" className="mt-6 flex max-w-sm gap-2">
          <label htmlFor="code" className="sr-only">Link code</label>
          <input id="code" name="code" required maxLength={12} autoCapitalize="characters" spellCheck={false} placeholder="ABCD2345" className={`${inputClass} font-mono uppercase`} />
          <button type="submit" className={buttonClass}>Continue</button>
        </form>
      </Shell>
    );
  }

  if (first(sp.done)) {
    return (
      <Shell>
        <div className="sticker mt-4 max-w-2xl bg-gold px-6 py-7 text-on-gold sm:px-8">
          <div>
            <p className="display text-4xl sm:text-5xl">Done, go back to your terminal.</p>
            <p className="mt-2 font-medium">
              The CLI picks up its token within a few seconds. Then <code className="font-mono text-[0.9em]">npx tokenmaxxing-cli push</code>{" "}
              uploads your hourly totals.
            </p>
          </div>
        </div>
      </Shell>
    );
  }

  const supabase = await createClient();
  const admin = createAdminClient();
  if (!supabase || !admin) {
    return (
      <Shell>
        <div className="max-w-2xl">
          <NotConfigured what="Device linking will work here" />
        </div>
      </Shell>
    );
  }

  const user = await getSessionUser(supabase);
  const here = `/link?code=${code}`;
  if (!user) {
    return (
      <Shell>
        {flash}
        <div className="sticker mt-4 max-w-2xl px-6 py-7 sm:px-8">
          <div>
            <p className="max-w-[40ch] text-lg leading-relaxed text-ink-2">
              Sign in with GitHub to link device{" "}
              <span className="display inline-block rounded-lg border-[2.5px] border-edge bg-gold px-2 py-0.5 text-xl tracking-[0.14em] text-on-gold">
                {code}
              </span>{" "}
              to your account.
            </p>
            <div className="mt-6">
              <SignInButton next={here} />
            </div>
          </div>
        </div>
      </Shell>
    );
  }

  const { data: profile } = await supabase.from("profiles").select("handle").eq("id", user.id).maybeSingle();
  if (!profile) {
    return (
      <Shell>
        {flash}
        <p className="mb-6 mt-4 text-lg text-ink-2">One step first: pick your handle, then confirm the device.</p>
        <HandleForm suggestion={suggestHandle(user.login)} next={here} />
      </Shell>
    );
  }

  const { data: used } = await admin.from("link_codes").select("user_id, consumed_at").eq("code", code).maybeSingle();

  return (
    <Shell>
      {flash}
      {used ? (
        <p className="mt-4 max-w-[56ch] text-lg text-ink-2">
          {used.user_id === user.id && used.consumed_at
            ? "This device is already linked. Go back to your terminal."
            : "This code has already been used. Run `tokenmaxxing link` again for a new one."}
        </p>
      ) : (
        <form action={confirmLink} className="sticker mt-4 max-w-xl px-6 py-7 sm:px-8">
          <input type="hidden" name="code" value={code} />
          <p className="display text-4xl">
            Link device{" "}
            <span className="inline-block rounded-xl border-[2.5px] border-edge bg-gold px-2.5 py-1 tracking-[0.14em] text-on-gold">{code}</span>?
          </p>
          <p className="mt-4 text-sm text-ink-2">
            Only confirm if you just ran <code className="font-mono text-[0.9em] text-ink">tokenmaxxing link</code> yourself and this code
            matches your terminal. The device will be able to push usage to @{profile.handle}.
          </p>
          <label className="mt-5 block">
            <span className="text-sm font-semibold">Device name</span>
            <input name="name" defaultValue="laptop" maxLength={64} className={`${inputClass} mt-1 max-w-xs`} />
          </label>
          <SubmitButton pendingLabel="Linking…" className={`${bigPrimaryButtonClass} mt-6`}>
            Link this device
          </SubmitButton>
        </form>
      )}
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto max-w-4xl px-4 pt-10 sm:px-6 md:pt-14">
      <h1 className="display mb-4 text-[3.4rem] sm:text-7xl">Link a device</h1>
      {children}
    </div>
  );
}
