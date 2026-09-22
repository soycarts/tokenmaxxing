import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { legalDoc, legalEffectiveDate, readContent } from "./content";
import { parseMarkdown } from "./markdown";

const ROOT = resolve(__dirname, "../../..");
const COPIES = { "PRIVACY.md": "docs/legal/PRIVACY.md", "TERMS.md": "docs/legal/TERMS.md", "SKILL.md": "skills/tokenmaxxing/SKILL.md" } as const;

describe("content/", () => {
  for (const [name, rel] of Object.entries(COPIES)) {
    it.skipIf(!existsSync(resolve(ROOT, rel)))(`content/${name} matches ${rel} (run npm run sync-content)`, () => {
      expect(readContent(name as keyof typeof COPIES)).toBe(readFileSync(resolve(ROOT, rel), "utf8"));
    });
  }

  it("SKILL.md has the frontmatter an agent skill needs", () => {
    const m = /^---\n([\s\S]*?)\n---\n/.exec(readContent("SKILL.md"));
    expect(m).not.toBeNull();
    const fm = Object.fromEntries(m![1].split("\n").map((l) => [l.slice(0, l.indexOf(":")), l.slice(l.indexOf(":") + 1).trim()]));
    expect(fm.name).toBe("tokenmaxxing");
    expect(fm.description.length).toBeGreaterThan(40);
    expect(fm.description.length).toBeLessThanOrEqual(1024);
  });
});

describe("legalDoc", () => {
  it("strips the H1 and reads the effective date from the document", () => {
    const d = legalDoc("PRIVACY.md");
    expect(d.title).toBe("Privacy policy");
    expect(d.effective).toBe("22 September 2026");
    expect(d.body).not.toContain("# Privacy policy");
    expect(d.body).toContain("Controller: Bountify, Inc.");
    expect(d.body).not.toContain("Draft for legal review");
    expect(d.body).not.toContain("to be created");
    expect(legalDoc("TERMS.md").effective).toBe("22 September 2026");
    expect(legalEffectiveDate("no date here")).toBeNull();
  });

  it("has the section the account page links to", () => {
    const ids = parseMarkdown(legalDoc("PRIVACY.md").body).flatMap((b) => (b.t === "h" ? [b.id] : []));
    expect(ids).toContain("retention-and-deletion");
    expect(ids).toContain("sponsors");
  });
});
