import { describe, expect, it } from "vitest";
import { safeNext } from "./redirect";

describe("safeNext", () => {
  it("keeps relative paths and rejects anything that leaves the site", () => {
    expect(safeNext("/link?code=ABCDEFGH")).toBe("/link?code=ABCDEFGH");
    expect(safeNext("//evil.com")).toBe("/me");
    expect(safeNext("/\\evil.com")).toBe("/me");
    expect(safeNext("https://evil.com")).toBe("/me");
    expect(safeNext(undefined, "/")).toBe("/");
  });
});
