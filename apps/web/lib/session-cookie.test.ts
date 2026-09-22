import { describe, expect, it } from "vitest";
import { whoFromCookies } from "./session-cookie";

const b64url = (s: string) => Buffer.from(s, "utf8").toString("base64url");
const meta = { avatar_url: "https://avatars.githubusercontent.com/u/1?v=4", user_name: "carter" };
const session = (extra: object) => JSON.stringify({ access_token: "x.e30.y", refresh_token: "r", ...extra });

describe("whoFromCookies", () => {
  it("reads the avatar and login from a base64 session cookie", () => {
    const c = `other=1; sb-abc-auth-token=base64-${b64url(session({ user: { user_metadata: meta } }))}`;
    expect(whoFromCookies(c)).toEqual({ avatarUrl: meta.avatar_url, login: "carter" });
  });

  it("joins chunked cookies in order", () => {
    const value = `base64-${b64url(session({ user: { user_metadata: meta } }))}`;
    const cut = Math.floor(value.length / 2);
    const c = `sb-abc-auth-token.1=${value.slice(cut)}; sb-abc-auth-token.0=${value.slice(0, cut)}`;
    expect(whoFromCookies(c)?.login).toBe("carter");
  });

  it("falls back to the access token's claims", () => {
    const token = `h.${b64url(JSON.stringify({ user_metadata: meta }))}.s`;
    const c = `sb-abc-auth-token=${encodeURIComponent(JSON.stringify({ access_token: token }))}`;
    expect(whoFromCookies(c)?.avatarUrl).toBe(meta.avatar_url);
  });

  it("is null when signed out or the cookie is garbage, and drops non-https avatars", () => {
    expect(whoFromCookies("")).toBeNull();
    expect(whoFromCookies("theme=dark")).toBeNull();
    expect(whoFromCookies("sb-abc-auth-token=base64-!!!")).toBeNull();
    const c = `sb-abc-auth-token=base64-${b64url(session({ user: { user_metadata: { avatar_url: "javascript:alert(1)" } } }))}`;
    expect(whoFromCookies(c)).toEqual({ avatarUrl: null, login: null });
  });
});
