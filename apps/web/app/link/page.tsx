import type { Metadata } from "next";
import { Flash, first } from "@/components/flash";
import { inputClass, primaryButtonClass, buttonClass } from "@/components/form";
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
        <p className="mt-4 max-w-[56ch] text-muted">
          Run <code className="code-cond text-paper">npx tokenmaxxing-cli link</code> in your terminal. It prints a URL with a code;
          open it here, or type the code.
        </p>
        <form method="get" className="mt-6 flex max-w-sm gap-2">
          <label htmlFor="code" className="sr-only">Link code</label>
          <input id="code" name="code" required maxLength={12} autoCapitalize="characters" spellCheck={false} placeholder="ABCD2345" className={`${inputClass} code-cond uppercase`} />
          <button type="submit" className={buttonClass}>Continue</button>
        </form>
      </Shell>
    );
  }

  if (first(sp.done)) {
    return (
      <Shell>
        <div className="mt-2 max-w-xl rounded-md border border-amber/60 bg-amber-soft px-6 py-6">
          <p className="text-2xl font-bold">Done, go back to your terminal.</p>
          <p className="mt-2 text-muted">
            The CLI picks up its token within a few seconds. Then <code className="code-cond text-paper">npx tokenmaxxing-cli push</code>{" "}
            uploads your hourly totals.
          </p>
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
        <p className="mt-4 max-w-[56ch] text-lg text-muted">
          Sign in with GitHub to link device <span className="num text-paper">{code}</span> to your account.
        </p>
        <div className="mt-6">
          <SignInButton next={here} />
        </div>
      </Shell>
    );
  }

  const { data: profile } = await supabase.from("profiles").select("handle").eq("id", user.id).maybeSingle();
  if (!profile) {
    return (
      <Shell>
        {flash}
        <p className="mb-6 mt-4 text-muted">One step first: pick your handle, then confirm the device.</p>
        <HandleForm suggestion={suggestHandle(user.login)} next={here} />
      </Shell>
    );
  }

  const { data: used } = await admin.from("link_codes").select("user_id, consumed_at").eq("code", code).maybeSingle();

  return (
    <Shell>
      {flash}
      {used ? (
        <p className="mt-4 max-w-[56ch] text-muted">
          {used.user_id === user.id && used.consumed_at
            ? "This device is already linked. Go back to your terminal."
            : "This code has already been used. Run `tokenmaxxing link` again for a new one."}
        </p>
      ) : (
        <form action={confirmLink} className="mt-2 max-w-xl rounded-md border border-line-strong bg-raised px-6 py-6">
          <input type="hidden" name="code" value={code} />
          <p className="text-2xl font-bold">
            Link device <span className="num tracking-[0.12em] text-amber">{code}</span>?
          </p>
          <p className="mt-2 text-sm text-muted">
            Only confirm if you just ran <code className="code-cond text-paper">tokenmaxxing link</code> yourself and this code
            matches your terminal. The device will be able to push usage to @{profile.handle}.
          </p>
          <label className="mt-5 block">
            <span className="text-sm text-muted">Device name</span>
            <input name="name" defaultValue="laptop" maxLength={64} className={`${inputClass} mt-1 max-w-xs`} />
          </label>
          <SubmitButton pendingLabel="Linking…" className={`${primaryButtonClass} mt-5`}>
            Link this device
          </SubmitButton>
        </form>
      )}
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto max-w-4xl px-4 pt-12 sm:px-6 md:pt-16">
      <h1 className="mb-4 text-4xl font-extrabold tracking-[-0.03em] sm:text-5xl">Link a device</h1>
      {children}
    </div>
  );
}
