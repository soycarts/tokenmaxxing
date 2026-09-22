import { describe, expect, it } from "vitest";
import { parseInline, parseMarkdown, safeHref, slugify } from "./markdown";

describe("parseMarkdown", () => {
  it("parses headings with stable ids, paragraphs and lists", () => {
    const blocks = parseMarkdown("# Title\n\nOne line\nand its continuation.\n\n## Retention and deletion\n\n- a\n- **b**\n\n1. first\n2. second\n");
    expect(blocks.map((b) => b.t)).toEqual(["h", "p", "h", "ul", "ol"]);
    expect(blocks[2]).toMatchObject({ t: "h", level: 2, id: "retention-and-deletion" });
    expect(blocks[1]).toEqual({ t: "p", c: [{ t: "text", v: "One line and its continuation." }] });
    expect(blocks[3]).toMatchObject({ t: "ul", items: [[{ t: "text", v: "a" }], [{ t: "strong", c: [{ t: "text", v: "b" }] }]] });
  });

  it("dedupes heading ids", () => {
    const ids = parseMarkdown("## Changes\n\n## Changes\n").map((b) => (b.t === "h" ? b.id : ""));
    expect(ids).toEqual(["changes", "changes-2"]);
  });

  it("keeps snake_case and never passes HTML through", () => {
    expect(parseInline("cache_read_ratio <script>x</script>")).toEqual([{ t: "text", v: "cache_read_ratio <script>x</script>" }]);
  });

  it("parses code, emphasis and links, dropping unsafe hrefs", () => {
    expect(parseInline("run `tokenmaxxing hook install` *now* [Account](/me) [x](javascript:alert(1))")).toEqual([
      { t: "text", v: "run " },
      { t: "code", v: "tokenmaxxing hook install" },
      { t: "text", v: " " },
      { t: "em", c: [{ t: "text", v: "now" }] },
      { t: "text", v: " " },
      { t: "link", href: "/me", c: [{ t: "text", v: "Account" }] },
      { t: "text", v: " " },
      { t: "text", v: "x" },
      { t: "text", v: ")" },
    ]);
    expect(safeHref("https://tokenmaxxing.fyi")).toBe("https://tokenmaxxing.fyi");
    expect(safeHref("mailto:privacy@tokenmaxxing.fyi")).toBe("mailto:privacy@tokenmaxxing.fyi");
    expect(safeHref("//evil.test")).toBeNull();
    expect(safeHref("http://x.test")).toBeNull();
  });

  it("slugifies like the privacy page's anchors expect", () => {
    expect(slugify("Retention and deletion")).toBe("retention-and-deletion");
    expect(slugify("1. What this covers")).toBe("1-what-this-covers");
  });
});
