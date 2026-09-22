"use client";

import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import { supabasePublicEnv } from "@/lib/env";

let browserClient: SupabaseClient | null = null;

/**
 * One browser client per tab, or null when unconfigured. Nothing ships this by default: the
 * site's interactive bits are Server Actions, which keeps supabase-js out of the page bundles.
 */
export function createClient(): SupabaseClient | null {
  if (browserClient) return browserClient;
  const env = supabasePublicEnv();
  if (!env) return null;
  browserClient = createBrowserClient(env.url, env.anonKey);
  return browserClient;
}
