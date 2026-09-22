/**
 * Every env var the app reads, in one place. All are optional at build time: with nothing set
 * the site builds and renders a "not configured" state instead of failing.
 */

export type SupabasePublicEnv = { url: string; anonKey: string };

export function supabasePublicEnv(): SupabasePublicEnv | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) return null;
  return { url, anonKey };
}

export function isSupabaseConfigured(): boolean {
  return supabasePublicEnv() !== null;
}

/** Canonical origin for links printed on the site (badge snippets, OAuth redirects fallback). */
export function siteUrl(): string {
  const explicit = process.env.NEXT_PUBLIC_SITE_URL;
  if (explicit) return explicit.replace(/\/+$/, "");
  if (process.env.VERCEL_PROJECT_PRODUCTION_URL) return `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`;
  return "https://tokenmaxxing.fyi";
}

export const GITHUB_URL = "https://github.com/soycarts/tokenmaxxing";
