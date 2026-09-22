import { describe, expect, it } from "vitest";
import { LINK_CODE_ALPHABET, LINK_CODE_LENGTH, generateLinkCode, isValidLinkCode, normalizeLinkCode } from "./link-code";

describe("link-code alphabet", () => {
  it("is 32 uppercase symbols with no lookalikes", () => {
    expect(LINK_CODE_ALPHABET).toHaveLength(32);
    expect(new Set(LINK_CODE_ALPHABET).size).toBe(32);
    for (const bad of ["0", "O", "1", "I"]) expect(LINK_CODE_ALPHABET).not.toContain(bad);
    expect(LINK_CODE_ALPHABET).toBe(LINK_CODE_ALPHABET.toUpperCase());
  });

  it("generates 8-character codes from the alphabet only", () => {
    for (let i = 0; i < 500; i++) {
      const code = generateLinkCode();
      expect(code).toHaveLength(LINK_CODE_LENGTH);
      for (const ch of code) expect(LINK_CODE_ALPHABET).toContain(ch);
      expect(isValidLinkCode(code)).toBe(true);
    }
  });

  it("maps every byte value onto the alphabet without bias", () => {
    const all = new Map<string, number>();
    for (let b = 0; b < 256; b++) {
      const ch = generateLinkCode((buf) => buf.fill(b))[0];
      all.set(ch, (all.get(ch) ?? 0) + 1);
    }
    expect(all.size).toBe(32);
    for (const n of all.values()) expect(n).toBe(8);
  });

  it("matches the SQL check constraint pattern", () => {
    expect(isValidLinkCode("ABCDEFGH")).toBe(true);
    expect(isValidLinkCode("ABCDEFG0")).toBe(false);
    expect(isValidLinkCode("ABCDEFGO")).toBe(false);
    expect(isValidLinkCode("ABCDEFG1")).toBe(false);
    expect(isValidLinkCode("ABCDEFGI")).toBe(false);
    expect(isValidLinkCode("ABCDEFG")).toBe(false);
    expect(isValidLinkCode("abcdefgh")).toBe(false);
  });

  it("normalises hand-typed codes", () => {
    expect(normalizeLinkCode(" abcd-efgh ")).toBe("ABCDEFGH");
    expect(normalizeLinkCode("abcd efgh")).toBe("ABCDEFGH");
    expect(normalizeLinkCode("ABCD0FGH")).toBeNull();
    expect(normalizeLinkCode(undefined)).toBeNull();
  });
});
