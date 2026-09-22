import Link from "next/link";
import { GITHUB_URL } from "@/lib/env";

export function SiteFooter() {
  return (
    <footer className="mt-24 border-t border-line">
      <div className="mx-auto flex max-w-6xl flex-col gap-3 px-4 py-8 text-sm text-faint sm:flex-row sm:items-center sm:justify-between sm:px-6">
        <p>Prices are API list rates from public pricing snapshots. Nobody was actually billed this.</p>
        <div className="flex gap-5">
          <Link href="/privacy" className="hover:text-paper">Privacy</Link>
          <a href={GITHUB_URL} className="hover:text-paper">Source on GitHub</a>
        </div>
      </div>
    </footer>
  );
}
