import { describe, expect, it } from "vitest";
import { antonEm, CARD_DIMENSIONS, renderCard, renderMessageCard, topModels, type CardData } from "./card";
import { cardDataFromProfile } from "./card-data";
import type { ProfilePage } from "./data";

const days = Array.from({ length: 30 }, (_, i) => ({ day: `2026-09-${String(i + 1).padStart(2, "0")}`, usd: i % 5 === 0 ? 0 : i * 3 }));

const DATA: CardData = {
  handle: "carter",
  period: "month",
  api_equiv_usd: 4476.25,
  roi: 21.78,
  daily: days,
  models: [
    { model: "gpt-6-astra", usd: 115.91 },
    { model: "claude-opus-5-5", usd: 3902.1 },
    { model: "mystery-model", usd: 0, priced: false },
    { model: "claude-fable-5-1", usd: 458.24 },
    { model: "tiny", usd: 0.5 },
  ],
};

/** A small well-formedness check: every tag closes, attributes are quoted and unique. */
function assertWellFormed(svg: string) {
  expect(svg.startsWith('<svg xmlns="http://www.w3.org/2000/svg"')).toBe(true);
  expect(svg.endsWith("</svg>")).toBe(true);
  const stack: string[] = [];
  const tag = /<(\/?)([a-zA-Z][\w:-]*)((?:\s+[\w:-]+="[^"]*")*)\s*(\/?)>/g;
  let last = 0;
  let m: RegExpExecArray | null;
  const body = svg.replace(/<style>[^<]*<\/style>/g, "<style></style>");
  while ((m = tag.exec(body))) {
    expect(body.slice(last, m.index)).not.toMatch(/[<>]/);
    last = tag.lastIndex;
    const [, close, name, attrs, self] = m;
    const names = [...attrs.matchAll(/([\w:-]+)="/g)].map((a) => a[1]);
    expect(new Set(names).size, `duplicate attribute on <${name}>`).toBe(names.length);
    if (close) expect(stack.pop()).toBe(name);
    else if (!self) stack.push(name);
  }
  expect(body.slice(last)).toBe("");
  expect(stack).toEqual([]);
}

function dims(svg: string) {
  const m = /^<svg[^>]*\swidth="(\d+)"\s+height="(\d+)"\s+viewBox="0 0 (\d+) (\d+)"/.exec(svg)!;
  return { w: Number(m[1]), h: Number(m[2]), vw: Number(m[3]), vh: Number(m[4]) };
}

describe("renderCard", () => {
  for (const size of ["sm", "md"] as const) {
    for (const theme of ["light", "dark", "auto"] as const) {
      it(`${size}/${theme} is a well-formed standalone SVG`, () => {
        const svg = renderCard(DATA, size, theme);
        assertWellFormed(svg);
        expect(dims(svg)).toEqual({ w: CARD_DIMENSIONS[size].w, h: CARD_DIMENSIONS[size].h, vw: CARD_DIMENSIONS[size].w, vh: CARD_DIMENSIONS[size].h });
      });
    }
  }

  it("sizes: sm is 320x96, md is 480x160", () => {
    expect(dims(renderCard(DATA, "sm"))).toMatchObject({ w: 320, h: 96 });
    expect(dims(renderCard(DATA, "md"))).toMatchObject({ w: 480, h: 160 });
  });

  it("shows the handle, the multiple, the dollars and the period chip", () => {
    for (const size of ["sm", "md"] as const) {
      const svg = renderCard(DATA, size);
      expect(svg).toContain(">@CARTER</text>");
      expect(svg).toContain(">21.8</text>"); // the × is drawn, Anton has none
      expect(svg).toContain(">$4,476");
      expect(svg).toContain(">30D</text>");
      expect(svg).toContain('aria-label="@carter on tokenmaxxing: 21.8× their plan price, $4,476 at API list rates, last 30 days"');
    }
    expect(renderCard({ ...DATA, period: "week" })).toContain(">7D</text>");
  });

  it("md adds the top three priced models by value and 30 bars", () => {
    const svg = renderCard(DATA, "md");
    const names = [...svg.matchAll(/class="tmx-m tmx-ink"[^>]*>([^<]+)<\/text>/g)].map((m) => m[1]);
    expect(names).toEqual(["claude-opus-5-5", "claude-fable-5-1", "gpt-6-astra"]);
    expect(svg).not.toContain("mystery-model");
    expect(svg).toContain(">$3,902</text>");
    const bars = svg.match(/class="tmx-bar(Last)?"/g) ?? [];
    expect(bars.length).toBe(days.filter((d) => d.usd > 0).length);
    expect(renderCard(DATA, "sm")).not.toContain("claude-opus-5-5");
  });

  it("without a plan the dollars take the stage", () => {
    const svg = renderCard({ ...DATA, roi: null }, "md");
    expect(svg).toContain(">$4,476</text>");
    expect(svg).toContain(">API-EQUIVALENT VALUE</text>");
    expect(svg).not.toContain("21.8");
  });

  it("never reaches outside itself: no scripts, foreignObject, external refs or fonts", () => {
    for (const svg of [renderCard(DATA, "sm"), renderCard(DATA, "md", "dark"), renderMessageCard("carter", "private", "md")]) {
      expect(svg).not.toMatch(/<script|<foreignObject|<image|@import|@font-face|url\((?!#)|href="(?!#)|xlink:href/i);
      expect(svg).toContain(`font-family="Anton, Impact, 'Arial Black', sans-serif"`);
    }
  });

  it("theme=auto carries a dark media query; explicit themes do not", () => {
    expect(renderCard(DATA, "sm", "auto")).toContain("@media (prefers-color-scheme:dark)");
    expect(renderCard(DATA, "sm", "light")).not.toContain("prefers-color-scheme");
    const dark = renderCard(DATA, "sm", "dark");
    expect(dark).not.toContain("prefers-color-scheme");
    expect(dark).toContain('fill="#ffd060"');
  });

  it("escapes model names and fits long handles into the card", () => {
    const svg = renderCard({ ...DATA, handle: "a-really-long-handle-xyz", models: [{ model: "<b>&x", usd: 5 }] }, "md");
    assertWellFormed(svg);
    expect(svg).toContain("&lt;b&gt;&amp;x");
    const m = /textLength="([\d.]+)"[^>]*>@A-REALLY-LONG-HANDLE-XYZ</.exec(svg)!;
    expect(Number(m[1])).toBeLessThanOrEqual(150);
  });
});

describe("renderMessageCard", () => {
  it("renders a grey private card at the same sizes", () => {
    for (const size of ["sm", "md"] as const) {
      const svg = renderMessageCard("carter", "private", size, "auto");
      assertWellFormed(svg);
      expect(dims(svg)).toMatchObject(CARD_DIMENSIONS[size]);
      expect(svg).toContain(">PRIVATE</text>");
      expect(svg).toContain(">@CARTER</text>");
      expect(svg).toContain('class="tmx-grey"');
      expect(svg).not.toContain('class="tmx-gold"');
    }
  });
});

describe("helpers", () => {
  it("measures with Anton's advances", () => {
    expect(antonEm("0")).toBeCloseTo(0.4941, 3);
    expect(antonEm("MM")).toBeGreaterThan(antonEm("II"));
  });

  it("topModels keeps the three most valuable priced models", () => {
    expect(topModels(DATA.models).map((m) => m.model)).toEqual(["claude-opus-5-5", "claude-fable-5-1", "gpt-6-astra"]);
  });

  it("cardDataFromProfile computes the multiple like the profile page", () => {
    const p = {
      handle: "carter",
      period: "month",
      api_equiv_usd: 4476.25,
      plan_period_usd: 205.48,
      daily: [{ day: "2026-09-01", usd: 1, tokens: 1 }],
      models: [{ model: "m", usd: 1, priced: true }],
    } as unknown as ProfilePage;
    expect(cardDataFromProfile(p).roi).toBeCloseTo(21.78, 2);
    expect(cardDataFromProfile({ ...p, plan_period_usd: 0 }).roi).toBeNull();
  });
});
