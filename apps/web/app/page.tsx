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
    tone: "bg-candy-pink",
    body: "Your agent runs one npx command. It finds Claude Code, Codex and Gemini CLI logs on your machine and reads only the token counts.",
  },
  {
    title: "Read the report",
    tone: "bg-candy-butter",
    body: "Every model's tokens priced at API list rates, next to what your plan costs. Cache reads included, because that is where the money is.",
  },
  {
    title: "Publish, if you like",
    tone: "bg-candy-mint",
    body: "Link a device to your GitHub sign-in and push hourly totals. Your profile stays private until you switch it on.",
  },
];

export default async function Home() {
  const stats = await getSiteStats();
  const s = stats.configured ? stats.data : null;

  return (
    <>
      <section className="mx-auto grid max-w-6xl gap-10 overflow-x-clip px-4 pb-20 pt-8 sm:px-6 md:grid-cols-[1.2fr_1fr] md:items-center md:gap-14 md:pt-14">
        <div className="min-w-0">
          <h1 className="display text-[3.3rem] leading-[0.9] sm:text-7xl lg:text-[6.1rem]">
            How much did your AI subscription actually deliver?
          </h1>
          <p className="mt-6 max-w-[50ch] text-lg leading-relaxed text-ink-2">
            Paste one prompt into your coding agent. It installs a tiny local tracker, reads your agent logs, and prices your
            usage at API list rates. Subscribers usually find out they&apos;re getting a very good deal.
          </p>
          <div className="mt-8 max-w-xl">
            <CopyBox text={ONBOARDING_PROMPT} label="onboarding prompt" title="Paste into your coding agent" />
            <p className="mt-4 text-sm text-ink-2">
              Works in Claude Code, Codex, Gemini CLI or any agent that can run a shell command.{" "}
              <Link href="/setup" className="font-semibold text-ink underline">
                Manual setup
              </Link>
            </p>
          </div>
        </div>
        <Statement />
      </section>

      <section aria-labelledby="live" className="relative overflow-x-clip py-2">
        <div className="-mx-6 -rotate-[1.2deg] border-y-[2.5px] border-edge bg-band text-on-band">
          <div className="mx-auto max-w-6xl rotate-[1.2deg] px-10 py-9 sm:px-12">
            <div className="flex flex-wrap items-baseline justify-between gap-3">
              <h2 id="live" className="display text-2xl sm:text-3xl">
                This week, across public profiles
              </h2>
              <Link href="/leaderboard" className="font-semibold text-on-band underline decoration-gold decoration-2">
                See the leaderboard
              </Link>
            </div>
            <dl className="mt-6 grid gap-6 sm:grid-cols-3 sm:gap-0 sm:divide-x-2 sm:divide-on-band/15">
              <Tile label="Value extracted, all public users" value={s ? formatUsd(s.week_usd) : "—"} gold />
              <Tile label="People tracking" value={s ? s.users_tracking.toLocaleString("en-US") : "—"} />
              <Tile label="Top model by value" value={s?.top_model ?? "—"} small={Boolean(s?.top_model)} />
            </dl>
            {!stats.configured && (
              <p className="mt-5 text-sm opacity-70">Live numbers appear here once the database is connected.</p>
            )}
          </div>
        </div>
      </section>

      <section aria-labelledby="how" className="mx-auto max-w-6xl px-4 pb-4 pt-20 sm:px-6">
        <h2 id="how" className="display text-4xl sm:text-5xl">
          How it works
        </h2>
        <ol className="mt-10 grid gap-10 md:grid-cols-3 md:gap-8">
          {STEPS.map((step, i) => (
            <li key={step.title} className="grid grid-cols-[auto_1fr] gap-4">
              <span
                aria-hidden="true"
                className={`display flex h-14 w-14 items-center justify-center rounded-full border-[2.5px] border-edge text-3xl text-on-gold shadow-[3px_3px_0_var(--edge)] ${step.tone}`}
              >
                {i + 1}
              </span>
              <div>
                <h3 className="display text-2xl">{step.title}</h3>
                <p className="mt-2 max-w-[40ch] leading-relaxed text-ink-2">{step.body}</p>
              </div>
            </li>
          ))}
        </ol>
      </section>

      <section aria-label="Privacy" className="mx-auto max-w-6xl px-4 pt-16 sm:px-6">
        <div className="flex flex-col gap-4 rounded-[22px] border-[2.5px] border-edge bg-gold-soft px-5 py-5 sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <p className="max-w-[60ch] text-lg font-semibold">{PRIVACY_LINE}</p>
          <div className="flex shrink-0 gap-5 text-sm font-semibold">
            <Link href="/privacy" className="underline">
              What we store
            </Link>
            <a href={GITHUB_URL} className="underline">
              Read the source
            </a>
          </div>
        </div>
      </section>
    </>
  );
}

function Tile({ label, value, gold, small }: { label: string; value: string; gold?: boolean; small?: boolean }) {
  return (
    <div className="min-w-0 sm:px-6 sm:first:pl-0 sm:last:pr-0">
      <dt className="text-sm opacity-75">{label}</dt>
      <dd className={`display mt-2 truncate leading-none ${small ? "text-3xl sm:text-4xl" : "text-5xl sm:text-6xl"} ${gold ? "text-gold" : ""}`}>
        {value}
      </dd>
    </div>
  );
}
