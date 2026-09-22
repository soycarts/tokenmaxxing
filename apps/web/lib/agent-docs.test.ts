import { describe, expect, it } from "vitest";
import { agentJson, apiMarkdown, cell, homeMarkdown, leaderboardMarkdown, llmsTxt, profileMarkdown, setupMarkdown } from "./agent-docs";
import { ONBOARDING_PROMPT } from "./copy";
import type { LeaderboardRow, ProfilePage } from "./data";

const BASE = "https://tokenmaxxing.fyi";

const row = (rank: number, handle: string): LeaderboardRow => ({
  rank,
  handle,
  display_name: null,
  avatar_url: null,
  api_equiv_usd: 4476.25 / rank,
  tokens_total: 380e6 / rank,
  output_tokens: 1,
  cache_read_ratio: 0.9,
  unpriced_tokens: 0,
  sources: ["claude", "codex"],
  plan_usd: 200,
  roi: 21.8 / rank,
  efficiency: 900,
  metric_value: 1,
});

describe("agent docs", () => {
  it("llms.txt carries the prompt, the install command and every doc link", () => {
    const t = llmsTxt(BASE);
    expect(t.startsWith("# tokenmaxxing\n\n> ")).toBe(true);
    expect(t).toContain(ONBOARDING_PROMPT);
    expect(t).toContain("npx tokenmaxxing-cli@latest init");
    for (const p of ["/setup.md", "/skill.md", "/api.md", "/privacy", "/terms"]) expect(t).toContain(`${BASE}${p}`);
  });

  it("agent.json has the fields the spec names", () => {
    expect(agentJson(BASE)).toMatchObject({ name: "tokenmaxxing", prompt: ONBOARDING_PROMPT, skill_url: `${BASE}/skill.md`, api_docs_url: `${BASE}/api.md` });
    expect(typeof agentJson(BASE).description).toBe("string");
  });

  it("api.md documents every public endpoint and the push envelope", () => {
    const md = apiMarkdown(BASE);
    for (const e of ["GET /api/v1/leaderboard", "GET /api/v1/u/{handle}", "GET /api/v1/orgs/{slug}", "GET /badge/{handle}.svg", "GET /card/{handle}.svg", "GET /embed/{handle}", "POST /api/v1/push", "GET /api/v1/link/{code}"]) {
      expect(md).toContain(`## ${e}`.replace("## POST", "### POST").replace("## GET /api/v1/link", "### GET /api/v1/link"));
    }
    expect(md).toContain('"replaceDevice": true');
    expect(md).toContain('"granularity": "day"');
    expect(md).toContain(`${BASE}/card/carter.svg?size=sm&theme=auto`);
    // every ```json block parses
    for (const m of md.matchAll(/```json\n([\s\S]*?)\n```/g)) expect(() => JSON.parse(m[1])).not.toThrow();
  });

  it("home and setup twins are static and carry the prompt", () => {
    expect(homeMarkdown(BASE)).toContain(ONBOARDING_PROMPT);
    const setup = setupMarkdown(BASE);
    expect(setup).toContain("| Field | Example | What it is |");
    expect(setup).toContain("granularity set hour|day|week");
  });

  it("leaderboard markdown is a table built from the rows", () => {
    const md = leaderboardMarkdown({ base: BASE, period: "week", metric: "value", rows: [row(1, "carter"), row(2, "alice")], configured: true });
    const lines = md.split("\n");
    const head = lines.findIndex((l) => l.startsWith("| # |"));
    expect(lines[head]).toBe("| # | Handle | Value | Tokens | Tools |");
    expect(lines[head + 1]).toMatch(/^\| ---:? \| --- \| ---: \| ---: \| --- \|$/);
    expect(lines[head + 2]).toBe(`| 1 | [carter](${BASE}/u/carter) | $4,476 | 380M | claude, codex |`);
    expect(lines[head + 3]).toContain("[alice]");
    const roi = leaderboardMarkdown({ base: BASE, period: "month", metric: "roi", rows: [row(1, "carter")], configured: true });
    expect(roi).toContain("| # | Handle | ROI | Value | Tokens | Tools |");
    expect(roi).toContain("| 21.8× |");
  });

  it("an empty board is still a table, and a sponsor is labelled and not ranked", () => {
    const md = leaderboardMarkdown({
      base: BASE,
      period: "week",
      metric: "value",
      rows: [],
      configured: true,
      sponsor: { id: "1", slug: "a", name: "Acme | Co", tagline: "", url: "https://acme.dev", logo_url: null },
    });
    expect(md).toContain("| # | Handle | Value | Tokens | Tools |");
    expect(md).toContain("> Sponsored: [Acme \\| Co](https://acme.dev) (not a ranked entry)");
    expect(md).toContain("Nobody on this board yet");
  });

  it("profile markdown shows the multiple and a model table", () => {
    const p = {
      handle: "carter",
      period: "month",
      public: true,
      api_equiv_usd: 4476.25,
      plan_period_usd: 205.48,
      tokens_total: 380e6,
      output_tokens: 4.2e6,
      cache_read_ratio: 0.93,
      sources: ["claude"],
      granularity: "week",
      models: [{ source: "claude", model: "claude-opus-5-5", input: 1, cache_read: 2, cache_write: 3, output: 4, tokens: 10, usd: 3902.1, priced: true }],
      daily: [{ day: "2026-09-22", usd: 1, tokens: 1 }],
    } as unknown as ProfilePage;
    const md = profileMarkdown(p, BASE);
    expect(md).toContain("# @carter on tokenmaxxing");
    expect(md).toContain("**21.8×** the plan price");
    expect(md).toContain("| claude | `claude-opus-5-5` |");
    expect(md).toContain("Uploads are weekly totals.");
  });

  it("escapes table cells", () => {
    expect(cell("a|b\nc")).toBe("a\\|b c");
  });
});
