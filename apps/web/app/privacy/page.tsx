import type { Metadata } from "next";
import { Code, PageShell, Section } from "@/components/prose";
import { PRIVACY_LINE } from "@/lib/copy";

export const metadata: Metadata = { title: "Privacy" };

export default function PrivacyPage() {
  return (
    <PageShell title="Privacy" lede={PRIVACY_LINE}>
      <Section title="On your machine" id="local">
        <p>
          The CLI reads your agent logs locally and keeps hourly totals in <Code>~/.tokenmaxxing/</Code>. It never reads
          credentials, keychains or auth files, makes no network calls except <Code>link</Code> and <Code>push</Code>, and has no
          telemetry.
        </p>
      </Section>
      <Section title="What this site stores" id="stored">
        <p>
          Your GitHub id, username, display name and avatar URL from sign-in. The handle you choose, whether your profile is
          public, and the plans you set. For each linked device: a name, when it last pushed, and a hash of its token (never the
          token itself). And the hourly rows you push: timestamp, tool, model and token counts.
        </p>
        <p>
          We do not store prompts, responses, file paths, project names or analytics profiles, and the app keeps no IP
          addresses (the host&apos;s standard request logs aside).
        </p>
      </Section>
      <Section title="Who can see it" id="visibility">
        <p>
          Profiles are private until you make them public. Private profiles do not appear on leaderboards or badges. Your raw
          hourly rows are readable only by you; public pages show aggregates. If you join an org, your totals count toward the
          org total, and org members can see you in the member list.
        </p>
      </Section>
      <Section title="Removing it" id="removal">
        <p>
          Make your profile private and revoke devices on your account page at any time. Deleting your account there removes
          your profile, devices, tokens, org memberships and every row pushed from them.
        </p>
      </Section>
      <Section title="Cookies" id="cookies">
        <p>Only the sign-in session cookie. No ads, no trackers.</p>
      </Section>
    </PageShell>
  );
}
