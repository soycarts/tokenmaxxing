import type { MetadataRoute } from "next";
import { siteUrl } from "@/lib/env";

/** Everything is open to crawlers and agents, including API reads, badges, cards and embeds. */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [{ userAgent: "*", allow: "/" }],
    sitemap: `${siteUrl()}/sitemap.xml`,
  };
}
