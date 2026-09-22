"use client";

/* eslint-disable @next/next/no-img-element -- a GitHub avatar, already CDN-sized */
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSyncExternalStore } from "react";
import { whoFromCookies } from "@/lib/session-cookie";

const noop = () => () => {};

/**
 * The header's account chip: the GitHub avatar when a session cookie is present. Rendered as
 * plain "Account" on the server and until hydration, so pages stay cacheable.
 */
export function AccountChip({ className }: { className: string }) {
  const pathname = usePathname();
  // Read on every render, and navigation re-renders (sign-in and sign-out both land on a new
  // URL). The cookie string is a stable snapshot, so this never loops.
  const cookie = useSyncExternalStore(noop, () => document.cookie, () => "");
  const who = cookie ? whoFromCookies(cookie) : null;
  const on = pathname === "/me";

  return (
    <Link href="/me" aria-current={on ? "page" : undefined} className={`${className} ${on ? "bg-candy-pink text-on-gold" : "bg-surface text-ink"}`}>
      {who?.avatarUrl ? (
        <img
          src={`${who.avatarUrl}${who.avatarUrl.includes("?") ? "&" : "?"}s=56`}
          alt=""
          width={24}
          height={24}
          className="-my-1 -ml-2 mr-2 h-7 w-7 rounded-full border-2 border-edge bg-line"
        />
      ) : null}
      {who ? "You" : "Account"}
    </Link>
  );
}
