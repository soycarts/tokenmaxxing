import Link from "next/link";
import { buttonClass, primaryButtonClass } from "@/components/form";

export default function NotFound() {
  return (
    <div className="mx-auto max-w-4xl px-4 pt-12 sm:px-6 md:pt-20">
      <p aria-hidden="true" className="display inline-block -rotate-3 rounded-[22px] border-[2.5px] border-edge bg-candy-pink px-5 pb-1 pt-3 text-[6rem] leading-none text-on-gold shadow-[6px_6px_0_var(--edge)] sm:text-[8rem]">
        404
      </p>
      <h1 className="display mt-8 text-[3.4rem] sm:text-7xl">Nothing here, or it&apos;s private.</h1>
      <p className="mt-4 max-w-[56ch] text-lg text-ink-2">
        Profiles and orgs only show up once their owner makes them public. Check the handle, or find people on the leaderboard.
      </p>
      <p className="mt-8 flex flex-wrap gap-4">
        <Link href="/leaderboard" className={primaryButtonClass}>Leaderboard</Link>
        <Link href="/" className={buttonClass}>Home</Link>
      </p>
    </div>
  );
}
