import type { SupabaseClient } from "@supabase/supabase-js";
import type { Metric, Period } from "@/lib/periods";
import { createAnonClient } from "@/lib/supabase/server";

/** Typed wrappers around the SQL functions in supabase/schema.sql. */

export type LeaderboardRow = {
  rank: number;
  handle: string;
  display_name: string | null;
  avatar_url: string | null;
  api_equiv_usd: number;
  tokens_total: number;
  output_tokens: number;
  cache_read_ratio: number;
  unpriced_tokens: number;
  sources: string[];
  plan_usd: number;
  roi: number | null;
  efficiency: number | null;
  metric_value: number;
};

export type OrgLeaderboardRow = {
  rank: number;
  slug: string;
  name: string;
  api_equiv_usd: number;
  tokens_total: number;
  member_count: number;
};

export type SiteStats = {
  week_usd: number;
  users_tracking: number;
  public_users: number;
  top_model: string | null;
  top_model_usd: number | null;
};

export type ProfileModel = {
  source: string;
  model: string;
  input: number;
  cache_read: number;
  cache_write: number;
  output: number;
  tokens: number;
  usd: number;
  priced: boolean;
};

export type ProfilePage = {
  handle: string;
  display_name: string | null;
  avatar_url: string | null;
  public: boolean;
  is_you: boolean;
  plans: Record<string, string>;
  period: Period;
  period_days: number;
  plan_monthly_usd: number;
  plan_period_usd: number;
  api_equiv_usd: number;
  tokens_total: number;
  output_tokens: number;
  cache_read_ratio: number;
  unpriced_tokens: number;
  sources: string[];
  /** How coarse the latest push was. Absent before the v0.2 schema is applied. */
  granularity?: "hour" | "day" | "week";
  models: ProfileModel[];
  daily: { day: string; usd: number; tokens: number }[];
};

export type OrgMember = {
  handle: string;
  display_name: string | null;
  avatar_url: string | null;
  role: string;
  public: boolean;
  api_equiv_usd: number;
  tokens_total: number;
};

export type OrgPage = {
  slug: string;
  name: string;
  public: boolean;
  period: Period;
  is_member: boolean;
  is_owner: boolean;
  invite_code: string | null;
  member_count: number;
  api_equiv_usd: number;
  tokens_total: number;
  hidden_members: number;
  members: OrgMember[];
};

export type BadgeStats = { public: boolean; api_equiv_usd?: number | null; roi?: number | null; rank?: number | null };

export type Result<T> = { configured: false } | { configured: true; data: T; error?: string };

async function rpc<T>(client: SupabaseClient | null, fn: string, args: Record<string, unknown>, empty: T): Promise<Result<T>> {
  if (!client) return { configured: false };
  const { data, error } = await client.rpc(fn, args);
  if (error) {
    console.error(`[rpc ${fn}]`, error.message);
    return { configured: true, data: empty, error: error.message };
  }
  return { configured: true, data: (data ?? empty) as T };
}

export function getLeaderboard(period: Period, metric: Metric) {
  return rpc<LeaderboardRow[]>(createAnonClient(), "leaderboard", { p_period: period, p_metric: metric }, []);
}

export function getOrgLeaderboard(period: Period) {
  return rpc<OrgLeaderboardRow[]>(createAnonClient(), "org_leaderboard", { p_period: period }, []);
}

export async function getSiteStats(): Promise<Result<SiteStats | null>> {
  const res = await rpc<SiteStats[]>(createAnonClient(), "site_stats", {}, []);
  if (!res.configured) return res;
  return { ...res, data: res.data[0] ?? null };
}

/** Pass the session client to let owners see their own private profile. */
export function getProfilePage(handle: string, period: Period, client: SupabaseClient | null = createAnonClient()) {
  return rpc<ProfilePage | null>(client, "profile_page", { p_handle: handle, p_period: period }, null);
}

export function getBadgeStats(handle: string, period: Period) {
  return rpc<BadgeStats | null>(createAnonClient(), "badge_stats", { p_handle: handle, p_period: period }, null);
}

export function getOrgPage(slug: string, period: Period, client: SupabaseClient | null = createAnonClient()) {
  return rpc<OrgPage | null>(client, "org_page", { p_slug: slug, p_period: period }, null);
}
