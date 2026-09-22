import { describe, expect, it } from "vitest";
import { BADGE_GREY, escapeXml, profileBadge, renderBadge, textWidth } from "./badge";

describe("renderBadge", () => {
  it("produces a standalone SVG with the label and message", () => {
    const svg = renderBadge("value 7d", "$4,476");
    expect(svg.startsWith('<svg xmlns="http://www.w3.org/2000/svg"')).toBe(true);
    expect(svg.endsWith("</svg>")).toBe(true);
    expect(svg).toContain(">value 7d</text>");
    expect(svg).toContain(">$4,476</text>");
    expect(svg).toContain('aria-label="value 7d: $4,476"');
    expect(svg).toContain('height="20"');
  });

  it("sizes the badge to its text", () => {
    const width = (s: string) => Number(/width="(\d+(?:\.\d+)?)"/.exec(s)![1]);
    expect(width(renderBadge("a", "b"))).toBeLessThan(width(renderBadge("a much longer label", "and message")));
    expect(textWidth("mmmm")).toBeGreaterThan(textWidth("iiii"));
  });

  it("escapes markup in user-controlled text", () => {
    const svg = renderBadge("<script>", `a&b"c'`);
    expect(svg).not.toContain("<script>");
    expect(svg).toContain("&lt;script&gt;");
    expect(svg).toContain("a&amp;b&quot;c&apos;");
    expect(escapeXml("<&>")).toBe("&lt;&amp;&gt;");
  });

  it("falls back to the accent when given a non-hex colour", () => {
    const svg = renderBadge("a", "b", "red;stroke:url(evil)");
    expect(svg).not.toContain("evil");
  });
});

describe("profileBadge", () => {
  it("renders a grey private badge for private or unknown profiles", () => {
    for (const stats of [null, { public: false }]) {
      const svg = profileBadge(stats, "value", "week");
      expect(svg).toContain(">private</text>");
      expect(svg).toContain(BADGE_GREY);
    }
  });

  it("formats value, roi and rank", () => {
    expect(profileBadge({ public: true, api_equiv_usd: 4476.25 }, "value", "month")).toContain(">$4,476</text>");
    expect(profileBadge({ public: true, api_equiv_usd: 12_345 }, "value", "all")).toContain(">$12.3k</text>");
    expect(profileBadge({ public: true, api_equiv_usd: 3.5 }, "value", "week")).toContain(">$3.50</text>");
    expect(profileBadge({ public: true, roi: 21.84 }, "roi", "month")).toContain(">21.8×</text>");
    expect(profileBadge({ public: true, rank: 3 }, "rank", "week")).toContain(">#3</text>");
  });

  it("is honest when there is nothing to show", () => {
    expect(profileBadge({ public: true, roi: null }, "roi", "week")).toContain(">no plan set</text>");
    expect(profileBadge({ public: true, rank: null }, "rank", "week")).toContain(">unranked</text>");
  });
});
