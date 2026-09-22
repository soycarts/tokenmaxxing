import type { Metadata } from "next";
import { LegalPage } from "@/components/legal-page";
import { legalDoc } from "@/lib/content";

export const metadata: Metadata = { title: "Terms of use" };

/** docs/legal/TERMS.md, via content/ (scripts/sync-content.mjs). Rendered at build time. */
export default function TermsPage() {
  return <LegalPage doc={legalDoc("TERMS.md")} />;
}
