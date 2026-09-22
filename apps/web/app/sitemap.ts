import type { MetadataRoute } from "next";
import { siteUrl } from "@/lib/env";
import { createAnonClient } from "@/lib/supabase/server";

export const revalidate = 3600;

const PAGES = ["/", "/leaderboard", "/leaderboard/orgs", "/setup", "/sponsors", "/privacy", "/terms"];

/** Public pages, plus every public profile (RLS returns only those to the anon key). */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = siteUrl();
  const out: MetadataRoute.Sitemap = PAGES.map((p) => ({ url: `${base}${p === "/" ? "" : p}`, changeFrequency: p.startsWith("/leaderboard") ? "hourly" : "weekly" }));
  const client = createAnonClient();
  if (!client) return out;
  const { data, error } = await client.from("profiles").select("handle, created_at").eq("public", true).order("handle").limit(10000);
  if (error) {
    console.error("[sitemap]", error.message);
    return out;
  }
  for (const p of data ?? []) out.push({ url: `${base}/u/${p.handle}`, changeFrequency: "daily" });
  return out;
}
