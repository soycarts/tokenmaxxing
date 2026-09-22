import Link from "next/link";
import { Wordmark } from "@/components/wordmark";
import { GITHUB_URL } from "@/lib/env";

export function SiteFooter() {
  return (
    <footer className="mt-28 border-t-[2.5px] border-edge bg-sunk">
      <div className="mx-auto grid max-w-6xl gap-10 px-4 pb-12 pt-12 sm:px-6 md:grid-cols-[minmax(0,1fr)_auto] md:items-end">
        <div>
          <p className="display max-w-[16ch] text-[2.4rem] sm:text-6xl">Nobody was actually billed this.</p>
          <p className="mt-4 max-w-[52ch] text-ink-2">
            Prices are API list rates from public pricing snapshots. The tracker reads token counts on your machine and never
            your prompts.
          </p>
          <nav aria-label="Footer" className="mt-6 flex flex-wrap gap-x-6 gap-y-2 font-semibold">
            <Link href="/privacy" className="underline decoration-line hover:decoration-ink">Privacy</Link>
            <Link href="/terms" className="underline decoration-line hover:decoration-ink">Terms</Link>
            <a href={GITHUB_URL} className="underline decoration-line hover:decoration-ink">Source on GitHub</a>
            <Link href="/leaderboard/orgs" className="underline decoration-line hover:decoration-ink">Orgs</Link>
            <Link href="/sponsors" className="underline decoration-line hover:decoration-ink">Sponsor</Link>
            <a href="/llms.txt" className="underline decoration-line hover:decoration-ink">For agents</a>
          </nav>
        </div>
        <Link href="/" aria-label="tokenmaxxing.fyi, home" className="block w-[260px] justify-self-start md:w-[320px] md:justify-self-end">
          <Wordmark id="wm-foot" className="h-auto w-full" />
        </Link>
      </div>
    </footer>
  );
}
