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

/** The document's own status line: "Effective 22 September 2026. Controller: …". */
const EFFECTIVE_RE = /^Effective ([^.]+)\.\s*/m;

/** The effective date printed in the document, or null if the document has none. */
export function legalEffectiveDate(src: string): string | null {
  const m = EFFECTIVE_RE.exec(src);
  return m ? m[1].trim() : null;
}

export type LegalDoc = {
  title: string;
  /** "22 September 2026", from the document's own first line; the page prints it under the title. */
  effective: string | null;
  /** The document without its H1 (the status line stays in the body, under the printed date). */
  body: string;
  /** The document as markdown for agents, verbatim. */
  markdown: string;
};

export function legalDoc(name: "PRIVACY.md" | "TERMS.md"): LegalDoc {
  const src = readContent(name);
  const h1 = /^#\s+(.+)\n+/.exec(src);
  const title = h1 ? h1[1].trim() : name.replace(/\.md$/, "");
  const rest = h1 ? src.slice(h1[0].length) : src;
  return { title, effective: legalEffectiveDate(src), body: rest, markdown: src };
}
