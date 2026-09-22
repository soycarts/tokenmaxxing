import type { Metadata } from "next";
import Link from "next/link";
import { CopyBox } from "@/components/copy-box";
import { Code, PageShell, Section } from "@/components/prose";
import { INSTALL_COMMAND, ONBOARDING_PROMPT } from "@/lib/copy";

export const metadata: Metadata = { title: "Setup" };

const UPLOADED: [string, string, string][] = [
  ["ts", "2026-09-22T13:00:00Z", "The hour, rounded down. Nothing finer."],
  ["source", "claude", "Which tool: claude, codex, gemini or cursor."],
  ["model", "claude-opus-5-5", "The model id the tool logged."],
  ["input, output", "2912, 217904", "Token counts for that hour and model."],
  ["cache_read, cache_write_5m, cache_write_1h", "317502113, 8902114, 0", "Cache token counts, priced separately."],
  ["reasoning", "0", "Reasoning tokens, informational (already inside output)."],
  ["requests, conversations", "412, 6", "How many API calls and chats that hour."],
  ["deviceId", "a random uuid", "Generated once on your machine, so two laptops don't overwrite each other."],
];

export default function SetupPage() {
  return (
    <PageShell
      title="Set up tokenmaxxing"
      lede="One command reads your local agent logs and prints a report. Nothing leaves your machine unless you link it and push."
    >
      <Section title="The quick way" id="prompt">
        <p>Paste this into your coding agent. It runs the tracker, shows you the report, and asks before publishing anything.</p>
        <CopyBox text={ONBOARDING_PROMPT} label="onboarding prompt" title="Paste into your coding agent" />
      </Section>

      <Section title="Or run it yourself" id="manual">
        <p>Node 20 or newer. No global install, no dependencies.</p>
        <CopyBox text={INSTALL_COMMAND} label="install command" compact />
        <p>
          <Code>init</Code> detects Claude Code, Codex and Gemini CLI logs, parses them into hourly totals in{" "}
          <Code>~/.tokenmaxxing/</Code>, and prints the report. Set your plan for an ROI line with{" "}
          <Code>npx tokenmaxxing-cli plan set claude max-20x</Code>.
        </p>
        <p>
          To publish, run <Code>npx tokenmaxxing-cli link</Code>, open the URL it prints, sign in with GitHub and confirm the
          code. Then <Code>npx tokenmaxxing-cli push</Code> uploads your totals, printing the row count and date range first.
        </p>
      </Section>

      <Section title="What gets uploaded" id="uploaded">
        <p>
          Only when you run <Code>push</Code>, and only rows like these. Never prompts, responses, file paths, project names, git
          branches or credentials. The tracker never reads credential files.
        </p>
      </Section>
      <div className="mt-6 max-w-4xl overflow-hidden rounded-md border border-line">
        <table className="w-full text-sm">
          <thead className="hidden bg-raised text-left text-muted sm:table-header-group">
            <tr>
              <th scope="col" className="px-4 py-2.5 font-medium">Field</th>
              <th scope="col" className="px-4 py-2.5 font-medium">Example</th>
              <th scope="col" className="px-4 py-2.5 font-medium">What it is</th>
            </tr>
          </thead>
          <tbody>
            {UPLOADED.map(([field, example, what]) => (
              <tr key={field} className="grid gap-1 border-t border-line px-4 py-3 first:border-t-0 sm:table-row sm:px-0 sm:py-0 sm:first:border-t">
                <td className="code-cond text-[0.8rem] text-paper sm:px-4 sm:py-2.5">{field}</td>
                <td className="num text-[0.78rem] text-muted sm:px-4 sm:py-2.5">{example}</td>
                <td className="text-muted sm:px-4 sm:py-2.5">{what}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Section title="Hooks are opt-in" id="hooks">
        <p>
          By default the tracker only runs when you run it. If you want totals kept fresh, <Code>tokenmaxxing hook install</Code>{" "}
          adds a Claude Code Stop hook and a Codex notify hook that run <Code>sync</Code>. It prints the exact change to your
          config and waits for a yes before writing, and keeps a backup. <Code>tokenmaxxing schedule install</Code> is the
          alternative: a launchd or cron job every 30 minutes, with no edits to other tools.
        </p>
      </Section>

      <Section title="Uninstall" id="uninstall">
        <ol className="list-decimal space-y-2 pl-5">
          <li>
            <Code>npx tokenmaxxing-cli hook uninstall</Code> and <Code>npx tokenmaxxing-cli schedule uninstall</Code>, if you
            installed either.
          </li>
          <li>
            Delete the local data: <Code>rm -rf ~/.tokenmaxxing</Code>.
          </li>
          <li>
            If you linked a device, revoke it on your <Link href="/me" className="text-paper underline">account page</Link> and
            make your profile private.
          </li>
        </ol>
      </Section>
    </PageShell>
  );
}
