import "server-only";
import { createAdminClient } from "./supabase/admin";
import { createAnonClient } from "./supabase/server";
import { cleanSponsor, type Placement, type Sponsor } from "./sponsors";

let warned = false;

/** The live sponsor for a placement, or null (none, not configured, or schema not applied yet). */
export async function getSponsor(placement: Placement): Promise<Sponsor | null> {
  const client = createAnonClient();
  if (!client) return null;
  const now = new Date().toISOString();
  const { data, error } = await client
    .from("sponsors")
    .select("id, slug, name, tagline, url, logo_url")
    .contains("placements", [placement])
    .eq("active", true)
    .lte("starts_at", now)
    .gte("ends_at", now)
    .order("starts_at", { ascending: false })
    .limit(1);
  if (error) {
    if (!warned) console.warn("[sponsors]", error.message);
    warned = true;
    return null;
  }
  return cleanSponsor(data?.[0]);
}

/**
 * One impression per render, counted with the service role. Call from `after()` so it never
 * delays the page; failures are ignored because exactness is not required.
 */
export async function recordImpression(sponsor: Sponsor, placement: Placement): Promise<void> {
  const admin = createAdminClient();
  if (!admin) return;
  const { error } = await admin.rpc("record_sponsor_impression", { p_sponsor: sponsor.id, p_placement: placement });
  if (error) console.warn("[sponsor impression]", error.message);
}
