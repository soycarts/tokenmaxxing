import { describe, expect, it } from "vitest";
import { markdownTwin, wantsMarkdown } from "./negotiate";

const q = (s = "") => new URLSearchParams(s);

describe("wantsMarkdown", () => {
  it("honours ?format=md", () => {
    expect(wantsMarkdown(null, q("format=md"))).toBe(true);
    expect(wantsMarkdown("text/html", q("format=md"))).toBe(true);
  });

  it("serves markdown when asked for it first, HTML to browsers", () => {
    expect(wantsMarkdown("text/markdown", q())).toBe(true);
    expect(wantsMarkdown("text/markdown, text/html;q=0.9, */*;q=0.1", q())).toBe(true);
    expect(wantsMarkdown("text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8", q())).toBe(false);
    expect(wantsMarkdown("text/html, text/markdown;q=0.5", q())).toBe(false);
    expect(wantsMarkdown("text/markdown;q=0", q())).toBe(false);
    expect(wantsMarkdown("*/*", q())).toBe(false);
    expect(wantsMarkdown(null, q())).toBe(false);
  });
});

describe("markdownTwin", () => {
  it("maps the negotiable pages and nothing else", () => {
    expect(markdownTwin("/")).toBe("/md/home");
    expect(markdownTwin("/setup")).toBe("/md/setup");
    expect(markdownTwin("/leaderboard/")).toBe("/md/leaderboard");
    expect(markdownTwin("/u/carter")).toBe("/md/u/carter");
    expect(markdownTwin("/privacy")).toBe("/md/privacy");
    expect(markdownTwin("/terms")).toBe("/md/terms");
    expect(markdownTwin("/me")).toBeNull();
    expect(markdownTwin("/u/carter/x")).toBeNull();
    expect(markdownTwin("/leaderboard/orgs")).toBeNull();
  });
});
