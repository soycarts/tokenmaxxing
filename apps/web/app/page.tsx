import Link from "next/link";
import { CopyBox } from "@/components/copy-box";
import { Statement } from "@/components/statement";
import { ONBOARDING_PROMPT, PRIVACY_LINE } from "@/lib/copy";
import { getSiteStats } from "@/lib/data";
import { GITHUB_URL } from "@/lib/env";
import { formatUsd } from "@/lib/format";

export const revalidate = 60;

const STEPS = [
  {
    title: "Paste the prompt",
    body: "Your agent runs one npx command. It finds Claude Code, Codex and Gemini CLI logs on your machine and reads only the token counts.",
  },
  {
    title: "Read the report",
    body: "Every model's tokens priced at API list rates, next to what your plan costs. Cache reads included, because that is where the money is.",
  },
  {
    title: "Publish, if you like",
    body: "Link a device to your GitHub sign-in and push hourly totals. Your profile stays private until you switch it on.",
  },
];

export default async function Home() {
  const stats = await getSiteStats();
  const s = stats.configured ? stats.data : null;

  return (
    <>
      <section className="mx-auto grid max-w-6xl gap-12 px-4 pb-16 pt-12 sm:px-6 md:grid-cols-[1.15fr_1fr] md:items-center md:gap-16 md:pt-20">
        <div>
          <h1 className="max-w-[14ch] text-[2.6rem] font-extrabold leading-[1.02] tracking-[-0.035em] sm:text-6xl lg:text-[4.4rem]">
            How much did your AI subscription actually deliver?
          </h1>
          <p className="mt-6 max-w-[52ch] text-lg leading-relaxed text-muted">
            Paste one prompt into your coding agent. It installs a tiny local tracker, reads your agent logs, and prices your
            usage at API list rates. Subscribers usually find out they&apos;re getting a very good deal.
          </p>
          <div className="mt-8 max-w-xl">
            <CopyBox text={ONBOARDING_PROMPT} label="onboarding prompt" title="Paste into your coding agent" />
            <p className="mt-3 text-sm text-faint">
              Works in Claude Code, Codex, Gemini CLI or any agent that can run a shell command.{" "}
              <Link href="/setup" className="text-muted underline hover:text-paper">
                Manual setup
              </Link>
            </p>
          </div>
        </div>
        <Statement />
      </section>

      <section aria-labelledby="live" className="border-y border-line bg-raised/40">
        <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
          <div className="flex flex-wrap items-baseline justify-between gap-3">
            <h2 id="live" className="text-lg font-bold tracking-tight">
              This week, across public profiles
            </h2>
            <Link href="/leaderboard" className="text-sm text-muted underline hover:text-paper">
              See the leaderboard
            </Link>
          </div>
          <dl className="mt-6 grid gap-px overflow-hidden rounded-md border border-line bg-line sm:grid-cols-3">
            <Tile label="Value extracted, all public users" value={s ? formatUsd(s.week_usd) : "—"} accent />
            <Tile label="People tracking" value={s ? s.users_tracking.toLocaleString("en-US") : "—"} />
            <Tile label="Top model by value" value={s?.top_model ?? "—"} small={Boolean(s?.top_model)} />
          </dl>
          {!stats.configured && (
            <p className="mt-3 text-sm text-faint">Live numbers appear here once the database is connected.</p>
          )}
        </div>
      </section>

      <section aria-labelledby="how" className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
        <h2 id="how" className="text-lg font-bold tracking-tight">
          How it works
        </h2>
        <ol className="mt-8 grid gap-10 md:grid-cols-3 md:gap-8">
          {STEPS.map((step, i) => (
            <li key={step.title} className="grid grid-cols-[auto_1fr] gap-4">
              <span className="num flex h-8 w-8 items-center justify-center rounded-full border border-line-strong text-sm text-amber">
                {i + 1}
              </span>
              <div>
                <h3 className="font-semibold">{step.title}</h3>
                <p className="mt-2 max-w-[40ch] leading-relaxed text-muted">{step.body}</p>
              </div>
            </li>
          ))}
        </ol>
      </section>

      <section aria-label="Privacy" className="mx-auto max-w-6xl px-4 sm:px-6">
        <div className="flex flex-col gap-4 rounded-md border border-line px-5 py-5 sm:flex-row sm:items-center sm:justify-between">
          <p className="max-w-[60ch] text-paper">
            <em className="not-italic font-semibold">{PRIVACY_LINE}</em>
          </p>
          <div className="flex shrink-0 gap-5 text-sm">
            <Link href="/privacy" className="text-muted underline hover:text-paper">
              What we store
            </Link>
            <a href={GITHUB_URL} className="text-muted underline hover:text-paper">
              Read the source
            </a>
          </div>
        </div>
      </section>
    </>
  );
}

function Tile({ label, value, accent, small }: { label: string; value: string; accent?: boolean; small?: boolean }) {
  return (
    <div className="bg-ink px-5 py-5">
      <dt className="text-sm text-muted">{label}</dt>
      <dd
        className={`num mt-2 truncate font-semibold tracking-tight ${small ? "text-xl sm:text-2xl" : "text-3xl"} ${
          accent ? "text-amber" : "text-paper"
        }`}
      >
        {value}
      </dd>
    </div>
  );
}
