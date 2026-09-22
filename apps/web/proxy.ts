import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

/**
 * Refreshes the Supabase session cookie on page requests (the @supabase/ssr pattern; Next 16
 * calls this file proxy.ts). A no-op when Supabase is not configured or there is no session
 * cookie, so anonymous traffic never waits on a network call.
 */
export async function proxy(request: NextRequest) {
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
  matcher: ["/((?!_next/static|_next/image|favicon.ico|api/|badge/|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)"],
};
