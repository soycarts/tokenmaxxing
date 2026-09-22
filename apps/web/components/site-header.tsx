import Link from "next/link";

const NAV = [
  { href: "/leaderboard", label: "Leaderboard" },
  { href: "/setup", label: "Setup" },
  { href: "/me", label: "Account" },
];

export function SiteHeader() {
  return (
    <header className="border-b border-line">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-4 sm:px-6">
        <Link href="/" className="group flex items-baseline text-[1.05rem] font-bold tracking-tight text-paper no-underline">
          tokenmaxxing<span className="hidden font-medium text-faint group-hover:text-amber min-[400px]:inline">.fyi</span>
        </Link>
        <nav aria-label="Main" className="flex items-center gap-3.5 text-sm sm:gap-6">
          {NAV.map((item) => (
            <Link key={item.href} href={item.href} className="text-muted no-underline hover:text-paper">
              {item.label}
            </Link>
          ))}
        </nav>
      </div>
    </header>
  );
}
