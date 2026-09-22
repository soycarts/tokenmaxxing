import type { Metric } from "./periods";

/**
 * Sponsored placements (SPEC-v0.2 B). Scaffold only: sponsors are rows added by hand in SQL,
 * readable through RLS while active and inside their window. One per placement at most; the
 * most recently started wins.
 */
export const PLACEMENTS = [
  "leaderboard:value",
  "leaderboard:roi",
  "leaderboard:efficiency",
  "leaderboard:volume",
  "leaderboard:orgs",
  "profile",
] as const;
export type Placement = (typeof PLACEMENTS)[number];

export const SPONSOR_EMAIL = "sponsors@tokenmaxxing.fyi";

export type Sponsor = {
  id: string;
  slug: string;
  name: string;
  tagline: string;
  url: string;
  logo_url: string | null;
};

export function boardPlacement(metric: Metric): Placement {
  return `leaderboard:${metric}`;
}

const https = (u: unknown): string | null => {
  if (typeof u !== "string") return null;
  try {
    const url = new URL(u);
    return url.protocol === "https:" ? url.toString() : null;
  } catch {
    return null;
  }
};

/** Trusts nothing about the row: a sponsor with no https link is not shown at all. */
export function cleanSponsor(row: unknown): Sponsor | null {
  if (!row || typeof row !== "object") return null;
  const r = row as Record<string, unknown>;
  const url = https(r.url);
  if (!url || typeof r.id !== "string" || typeof r.name !== "string" || !r.name.trim()) return null;
  return {
    id: r.id,
    slug: typeof r.slug === "string" ? r.slug : "",
    name: r.name.trim().slice(0, 64),
    tagline: typeof r.tagline === "string" ? r.tagline.trim().slice(0, 80) : "",
    url,
    logo_url: https(r.logo_url),
  };
}

/** What the public API exposes, so agents see the label too. */
export function sponsorJson(s: Sponsor) {
  return { label: "Sponsored", name: s.name, tagline: s.tagline, url: s.url, logo_url: s.logo_url };
}

/** The link as people read it: the host, without www. */
export function sponsorHost(s: Sponsor): string {
  return new URL(s.url).host.replace(/^www\./, "");
}
