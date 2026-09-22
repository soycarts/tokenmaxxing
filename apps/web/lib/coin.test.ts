import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { COIN_FILL, coinIconSvg } from "./coin";

describe("coin mark", () => {
  it("ships as the favicon, byte for byte", () => {
    const file = readFileSync(new URL("../app/icon.svg", import.meta.url), "utf8");
    expect(file).toBe(coinIconSvg());
  });

  it("is a letterform on a coin, in the accent colour", () => {
    const svg = coinIconSvg();
    expect(svg).toContain(COIN_FILL);
    expect(svg).toMatch(/<path d="M[\d. ]/);
  });
});
