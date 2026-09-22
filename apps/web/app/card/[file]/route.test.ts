import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ProfilePage, Result } from "@/lib/data";

let result: Result<ProfilePage | null> = { configured: false };
const asked: { handle: string; period: string }[] = [];

vi.mock("@/lib/data", () => ({
  getProfilePage: async (handle: string, period: string) => {
    asked.push({ handle, period });
    return result;
  },
}));

const { GET } = await import("./route");

const PROFILE = {
  handle: "carter",
  display_name: null,
  avatar_url: null,
  public: true,
  is_you: false,
  plans: { claude: "max-20x" },
  period: "month",
  period_days: 30,
  plan_monthly_usd: 200,
  plan_period_usd: 205.48,
  api_equiv_usd: 4476.25,
  tokens_total: 1,
  output_tokens: 1,
  cache_read_ratio: 0.9,
  unpriced_tokens: 0,
  sources: ["claude"],
  models: [{ source: "claude", model: "claude-opus-5-5", input: 0, cache_read: 0, cache_write: 0, output: 0, tokens: 0, usd: 3902.1, priced: true }],
  daily: [{ day: "2026-09-22", usd: 100, tokens: 1 }],
} as ProfilePage;

function get(path: string) {
  const url = new URL(path, "http://localhost");
  const file = url.pathname.split("/").pop()!;
  return GET(new Request(url), { params: Promise.resolve({ file }) });
}

beforeEach(() => {
  asked.length = 0;
  result = { configured: true, data: PROFILE };
});

describe("GET /card/{handle}.svg", () => {
  it("returns an SVG with the handle and multiple, and a 60s public cache", async () => {
    const res = await get("/card/carter.svg");
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("image/svg+xml; charset=utf-8");
    expect(res.headers.get("cache-control")).toContain("s-maxage=60");
    expect(res.headers.get("cache-control")).toContain("max-age=60");
    const svg = await res.text();
    expect(svg).toContain(">@CARTER</text>");
    expect(svg).toContain(">21.8</text>");
    expect(svg).toMatch(/^<svg[^>]* width="320" height="96"/);
    expect(asked).toEqual([{ handle: "carter", period: "month" }]);
  });

  it("size=md is 480x160 and period is passed through", async () => {
    const svg = await (await get("/card/Carter.svg?size=md&period=week")).text();
    expect(svg).toMatch(/^<svg[^>]* width="480" height="160"/);
    expect(asked).toEqual([{ handle: "carter", period: "week" }]);
  });

  it("private or unknown profiles get the grey private card, never numbers", async () => {
    for (const r of [{ configured: true, data: null }, { configured: true, data: { ...PROFILE, public: false } }] as const) {
      result = r as Result<ProfilePage | null>;
      const res = await get("/card/carter.svg?size=md");
      const svg = await res.text();
      expect(svg).toContain(">PRIVATE</text>");
      expect(svg).not.toContain("4,476");
      expect(res.headers.get("cache-control")).toContain("s-maxage=60");
    }
  });

  it("a malformed handle never reaches the database", async () => {
    const svg = await (await get("/card/%3Cscript%3E.svg")).text();
    expect(svg).toContain(">PRIVATE</text>");
    expect(asked).toEqual([]);
  });

  it("not configured and errors are grey cards too", async () => {
    result = { configured: false };
    expect(await (await get("/card/carter.svg")).text()).toContain(">NOT CONNECTED</text>");
    result = { configured: true, data: null, error: "boom" };
    expect(await (await get("/card/carter.svg")).text()).toContain(">UNAVAILABLE</text>");
  });

  it("404s anything that is not .svg", async () => {
    expect((await get("/card/carter.png")).status).toBe(404);
  });
});
