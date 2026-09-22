import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { markdownTwin, wantsMarkdown } from "@/lib/negotiate";

/**
 * Two jobs, on page requests only (Next 16 calls this file proxy.ts):
 *
 * 1. Content negotiation for agents. `/`, `/setup`, `/leaderboard`, `/u/{handle}`, `/privacy`
 *    and `/terms` answer in markdown for `Accept: text/markdown` or `?format=md`, by rewriting
 *    to their twin under /md/ (lib/negotiate.ts). The twins send `Vary: Accept`; Next owns the
 *    HTML responses' Vary header, but on Vercel this rewrite runs before the CDN cache, and
 *    `?format=md` is a distinct URL for any other cache.
 * 2. Refreshing the Supabase session cookie (the @supabase/ssr pattern). A no-op when Supabase
 *    is not configured or there is no session cookie, so anonymous traffic never waits on a
 *    network call.
 */
export async function proxy(request: NextRequest) {
  const twin = markdownTwin(request.nextUrl.pathname);
  if (twin && wantsMarkdown(request.headers.get("accept"), request.nextUrl.searchParams)) {
    const target = request.nextUrl.clone();
    target.pathname = twin;
    target.searchParams.delete("format");
    return NextResponse.rewrite(target);
  }
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) return NextResponse.next({ request });
  if (!request.cookies.getAll().some((c) => c.name.startsWith("sb-"))) return NextResponse.next({ request });

  let response = NextResponse.next({ request });
  const supabase = createServerClient(url, anonKey, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (items) => {
        for (const { name, value } of items) request.cookies.set(name, value);
        response = NextResponse.next({ request });
        for (const { name, value, options } of items) response.cookies.set(name, value, options);
      },
    },
  });
  // Validates the JWT and refreshes it if expired; the result itself is not needed here.
  await supabase.auth.getClaims();
  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|api/|badge/|card/|embed/|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)"],
};
