import { describe, expect, it } from "vitest";
import { boardPlacement, cleanSponsor, PLACEMENTS, sponsorHost, sponsorJson } from "./sponsors";

const ROW = { id: "1", slug: "acme", name: " Acme ", tagline: "Ships things", url: "https://www.acme.dev/x", logo_url: "https://acme.dev/l.png" };

describe("sponsors", () => {
  it("maps every board to a placement the schema allows", () => {
    for (const m of ["value", "roi", "efficiency", "volume"] as const) expect(PLACEMENTS).toContain(boardPlacement(m));
    expect(PLACEMENTS).toContain("leaderboard:orgs");
    expect(PLACEMENTS).toContain("profile");
  });

  it("cleans a row and drops anything without an https link", () => {
    expect(cleanSponsor(ROW)).toMatchObject({ name: "Acme", url: "https://www.acme.dev/x", logo_url: "https://acme.dev/l.png" });
    expect(cleanSponsor({ ...ROW, url: "javascript:alert(1)" })).toBeNull();
    expect(cleanSponsor({ ...ROW, url: "http://acme.dev" })).toBeNull();
    expect(cleanSponsor({ ...ROW, logo_url: "http://acme.dev/l.png" })!.logo_url).toBeNull();
    expect(cleanSponsor({ ...ROW, tagline: "x".repeat(200) })!.tagline).toHaveLength(80);
    expect(cleanSponsor(null)).toBeNull();
  });

  it("labels the API object and shows the host", () => {
    const s = cleanSponsor(ROW)!;
    expect(sponsorJson(s)).toEqual({ label: "Sponsored", name: "Acme", tagline: "Ships things", url: "https://www.acme.dev/x", logo_url: "https://acme.dev/l.png" });
    expect(sponsorHost(s)).toBe("acme.dev");
  });
});
