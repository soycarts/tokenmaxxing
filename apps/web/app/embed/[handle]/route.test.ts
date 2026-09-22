import { createHash } from "node:crypto";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/data", () => ({ getProfilePage: async () => ({ configured: true, data: null }) }));

const { GET } = await import("./route");
const { RESIZE_SCRIPT } = await import("@/lib/embed");

const get = (h: string, q = "") => GET(new Request(`http://localhost/embed/${h}${q}`), { params: Promise.resolve({ handle: h }) });

describe("GET /embed/{handle}", () => {
  it("is a framable HTML page with the card inline", async () => {
    const res = await get("carter", "?theme=dark");
    expect(res.headers.get("content-type")).toBe("text/html; charset=utf-8");
    expect(res.headers.get("x-frame-options")).toBeNull();
    const csp = res.headers.get("content-security-policy")!;
    expect(csp).toContain("frame-ancestors *");
    expect(csp).toContain("default-src 'none'");
    const html = await res.text();
    expect(html).toContain("<svg");
    expect(html).toContain(">@CARTER</text>");
    expect(html).toMatch(/<a href="[^"]+\/u\/carter" target="_blank" rel="noopener">/);
  });

  it("runs exactly one script, the resize ping, allowed by its hash", async () => {
    const res = await get("carter");
    const html = await res.text();
    const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1]);
    expect(scripts).toEqual([RESIZE_SCRIPT]);
    expect(RESIZE_SCRIPT.split("\n")).toHaveLength(3);
    const hash = createHash("sha256").update(scripts[0]).digest("base64");
    expect(res.headers.get("content-security-policy")).toContain(`'sha256-${hash}'`);
    expect(html).not.toMatch(/<script[^>]+src=/);
  });
});
