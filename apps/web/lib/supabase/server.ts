import { createServerClient } from "@supabase/ssr";
import { createClient as createPlainClient, type SupabaseClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { supabasePublicEnv } from "@/lib/env";

/**
 * Session-aware client for Server Components, Server Actions and Route Handlers.
 * Returns null when Supabase is not configured, so callers render the empty state.
 */
export async function createClient(): Promise<SupabaseClient | null> {
  const env = supabasePublicEnv();
  if (!env) return null;
  const cookieStore = await cookies();
  return createServerClient(env.url, env.anonKey, {
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll: (items) => {
        try {
          for (const { name, value, options } of items) cookieStore.set(name, value, options);
        } catch {
          // Server Components cannot set cookies; proxy.ts refreshes the session instead.
        }
      },
    },
  });
}

/**
 * Sessionless anon client for public, cacheable reads (leaderboards, badges, public profiles).
 * It never touches cookies, so pages that use only this can be statically revalidated.
 */
export function createAnonClient(): SupabaseClient | null {
  const env = supabasePublicEnv();
  if (!env) return null;
  return createPlainClient(env.url, env.anonKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}

export type SessionUser = { id: string; login: string | null; name: string | null; avatarUrl: string | null };

/** The verified signed-in user (JWT checked by Supabase), or null. */
export async function getSessionUser(supabase: SupabaseClient): Promise<SessionUser | null> {
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) return null;
  const meta = (data.user.user_metadata ?? {}) as Record<string, unknown>;
  const str = (v: unknown) => (typeof v === "string" && v ? v : null);
  return {
    id: data.user.id,
    login: str(meta.user_name) ?? str(meta.preferred_username),
    name: str(meta.full_name) ?? str(meta.name),
    avatarUrl: str(meta.avatar_url),
  };
}
