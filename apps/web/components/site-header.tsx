import Link from "next/link";
import { AccountChip } from "@/components/account-chip";
import { GitHubStar } from "@/components/github-star";
import { chipClass } from "@/components/chip";
import { NavChip } from "@/components/nav-chip";
import { ThemeToggle } from "@/components/theme-toggle";
import { Wordmark } from "@/components/wordmark";

export function SiteHeader() {
  return (
    <header className="mx-auto flex w-full max-w-6xl flex-wrap items-center justify-between gap-x-4 gap-y-3 px-4 pb-2 pt-4 sm:px-6 sm:pt-5">
      <div className="flex items-center gap-3 sm:gap-4">
        <Link href="/" aria-label="tokenmaxxing.fyi, home" className="-ml-1 block w-[184px] shrink-0 sm:w-[272px]">
          <Wordmark id="wm-head" layout="line" className="h-auto w-full" />
        </Link>
        <GitHubStar className="max-sm:hidden" />
      </div>
      <div className="flex items-center gap-2 sm:order-last">
        <GitHubStar compact className="sm:hidden" />
        <ThemeToggle />
      </div>
      <nav aria-label="Main" className="order-last flex w-full items-center gap-2.5 sm:order-none sm:ml-auto sm:w-auto sm:gap-3">
        <NavChip href="/leaderboard" tone="bg-candy-butter">Leaderboard</NavChip>
        <NavChip href="/setup" tone="bg-candy-mint">Setup</NavChip>
        <AccountChip className={chipClass} />
      </nav>
    </header>
  );
}
