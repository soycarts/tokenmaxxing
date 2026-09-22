import { NextResponse } from "next/server";
import { safeNext } from "@/lib/redirect";
import { createClient } from "@/lib/supabase/server";

/** Starts GitHub OAuth (PKCE). GET for links, POST for the sign-in buttons. */
async function start(request: Request, next: string) {
  const origin = new URL(request.url).origin;
  const supabase = await createClient();
  if (!supabase) return NextResponse.redirect(new URL("/me", origin), 303);

  const redirectTo = `${origin}/auth/callback?next=${encodeURIComponent(next)}`;
  const { data, error } = await supabase.auth.signInWithOAuth({ provider: "github", options: { redirectTo } });
  if (error || !data.url) {
    return NextResponse.redirect(new URL(`/me?error=${encodeURIComponent("GitHub sign-in could not start.")}`, origin), 303);
  }
  return NextResponse.redirect(data.url, 303);
}

export async function GET(request: Request) {
  return start(request, safeNext(new URL(request.url).searchParams.get("next")));
}

export async function POST(request: Request) {
  const form = await request.formData();
  return start(request, safeNext(form.get("next")));
}
