import type { Metadata } from "next";
import { LegalPage } from "@/components/legal-page";
import { legalDoc } from "@/lib/content";

export const metadata: Metadata = { title: "Privacy policy" };

/** docs/legal/PRIVACY.md, via content/ (scripts/sync-content.mjs). Rendered at build time. */
export default function PrivacyPage() {
  return <LegalPage doc={legalDoc("PRIVACY.md")} />;
}
