import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { supabasePublicEnv } from "@/lib/env";

/**
 * Service-role client. Bypasses RLS: used only by server routes that own link_codes,
 * api_tokens and bucket writes. `server-only` makes importing this from a Client Component a
 * build error, so SUPABASE_SERVICE_ROLE_KEY can never reach a browser bundle.
 */
export function createAdminClient(): SupabaseClient | null {
  const env = supabasePublicEnv();
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!env || !key) return null;
  return createClient(env.url, key, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}
