import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Files copied from the repo into content/ by scripts/sync-content.mjs. Each is read with a
 * literal path (and listed in next.config's outputFileTracingIncludes) so it ships with any
 * function that serves it.
 */
export type ContentName = "PRIVACY.md" | "TERMS.md" | "SKILL.md";

const cache = new Map<ContentName, string>();

export function readContent(name: ContentName): string {
  let text = cache.get(name);
  if (text === undefined) {
    const dir = join(process.cwd(), "content");
    text =
      name === "PRIVACY.md"
        ? readFileSync(join(dir, "PRIVACY.md"), "utf8")
        : name === "TERMS.md"
          ? readFileSync(join(dir, "TERMS.md"), "utf8")
          : readFileSync(join(dir, "SKILL.md"), "utf8");
    cache.set(name, text);
  }
  return text;
}

const DRAFT_RE = /\*\*Draft for legal review\. Not yet in force\.\*\*\s*Effective date: to be set at launch\.\s*/;

/** "Effective 1 October 2026" once LEGAL_EFFECTIVE_DATE is set, else null (the draft banner shows). */
export function legalEffectiveDate(raw = process.env.LEGAL_EFFECTIVE_DATE): string | null {
  const v = raw?.trim();
  if (!v) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(v)) {
    const d = new Date(`${v}T00:00:00Z`);
    if (!Number.isNaN(d.getTime())) {
      return d.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
    }
  }
  return v;
}

export type LegalDoc = {
  title: string;
  /** The status line the page prints in its banner. */
  status: { draft: true } | { draft: false; effective: string };
  /** The document without its H1 and without the draft sentence (the banner carries it). */
  body: string;
  /** The document as markdown for agents: the draft sentence or the effective date, in place. */
  markdown: string;
};

export function legalDoc(name: "PRIVACY.md" | "TERMS.md", effectiveRaw?: string): LegalDoc {
  const src = readContent(name);
  const effective = legalEffectiveDate(effectiveRaw ?? process.env.LEGAL_EFFECTIVE_DATE);
  const h1 = /^#\s+(.+)\n+/.exec(src);
  const title = h1 ? h1[1].trim() : name.replace(/\.md$/, "");
  const rest = h1 ? src.slice(h1[0].length) : src;
  return {
    title,
    status: effective ? { draft: false, effective } : { draft: true },
    body: rest.replace(DRAFT_RE, ""),
    markdown: effective ? src.replace(DRAFT_RE, `Effective ${effective}. `) : src,
  };
}
