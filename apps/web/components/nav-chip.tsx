"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export const chipClass =
  "press display inline-flex h-10 items-center rounded-full px-4 text-[0.95rem] leading-none tracking-[0.03em] no-underline [--lift:3px]";

/** A header chip. The current section is pressed in and filled with its candy colour. */
export function NavChip({ href, tone, children }: { href: string; tone: string; children: React.ReactNode }) {
  const pathname = usePathname();
  const on = pathname === href || pathname.startsWith(`${href}/`);
  return (
    <Link href={href} aria-current={on ? "page" : undefined} className={`${chipClass} ${on ? `${tone} text-on-gold` : "bg-surface text-ink"}`}>
      {children}
    </Link>
  );
}
