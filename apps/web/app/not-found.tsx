import Link from "next/link";

export default function NotFound() {
  return (
    <div className="mx-auto max-w-4xl px-4 pt-16 sm:px-6 md:pt-24">
      <p className="num text-6xl font-semibold text-amber">404</p>
      <h1 className="mt-4 text-3xl font-extrabold tracking-[-0.03em]">Nothing here, or it&apos;s private.</h1>
      <p className="mt-3 max-w-[56ch] text-muted">
        Profiles and orgs only show up once their owner makes them public. Check the handle, or find people on the leaderboard.
      </p>
      <p className="mt-6 flex gap-5">
        <Link href="/leaderboard" className="underline">Leaderboard</Link>
        <Link href="/" className="text-muted underline hover:text-paper">Home</Link>
      </p>
    </div>
  );
}
