import { NextResponse } from "next/server";
import { safeNext } from "@/lib/redirect";
import { createClient } from "@/lib/supabase/server";

/** OAuth return: exchange the code for a session cookie, then go where the user was headed. */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const next = safeNext(url.searchParams.get("next"));
  const code = url.searchParams.get("code");
  const supabase = await createClient();

  if (supabase && code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) return NextResponse.redirect(new URL(next, url.origin));
  }
  const message = url.searchParams.get("error_description") ?? "Sign-in did not complete. Try again.";
  return NextResponse.redirect(new URL(`/me?error=${encodeURIComponent(message)}`, url.origin));
}
