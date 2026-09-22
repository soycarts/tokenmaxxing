/**
 * Who is signed in, read from the Supabase session cookie in the browser, for the header's
 * account chip only. It is presentation, never authorisation: every page and action still
 * verifies the session on the server. Reading it client-side keeps the root layout free of
 * cookies(), so static and revalidated pages stay static, and keeps supabase-js out of the
 * bundle.
 *
 * @supabase/ssr writes the session as `sb-<ref>-auth-token`, optionally split into `.0`, `.1`
 * chunks, usually as "base64-" + base64url(JSON). The cookie is not httpOnly by design (the
 * browser client reads it too).
 */

export type Who = { avatarUrl: string | null; login: string | null };

const NAME = /^sb-[^=]+-auth-token(?:\.(\d+))?$/;
const PREFIX = "base64-";

function fromBase64Url(s: string): string {
  const b64 = s.replace(/-/g, "+").replace(/_/g, "/");
  const bin = atob(b64 + "=".repeat((4 - (b64.length % 4)) % 4));
  return new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0)));
}

function str(v: unknown): string | null {
  return typeof v === "string" && v ? v : null;
}

function https(v: unknown): string | null {
  const s = str(v);
  return s && s.startsWith("https://") ? s : null;
}

function fromMeta(meta: unknown): Who | null {
  if (!meta || typeof meta !== "object") return null;
  const m = meta as Record<string, unknown>;
  const who = { avatarUrl: https(m.avatar_url), login: str(m.user_name) ?? str(m.preferred_username) };
  return who.avatarUrl || who.login ? who : null;
}

export function whoFromCookies(cookieHeader: string): Who | null {
  const chunks = new Map<string, { i: number; v: string }[]>();
  for (const part of cookieHeader.split(/;\s*/)) {
    const eq = part.indexOf("=");
    if (eq < 1) continue;
    const name = part.slice(0, eq);
    const m = NAME.exec(name);
    if (!m) continue;
    const base = m[1] === undefined ? name : name.slice(0, name.lastIndexOf("."));
    const list = chunks.get(base) ?? [];
    let value = part.slice(eq + 1);
    try {
      value = decodeURIComponent(value);
    } catch {
      // leave it as it is
    }
    list.push({ i: m[1] === undefined ? -1 : Number(m[1]), v: value });
    chunks.set(base, list);
  }

  for (const list of chunks.values()) {
    const raw = list.sort((a, b) => a.i - b.i).map((c) => c.v).join("");
    try {
      const json = raw.startsWith(PREFIX) ? fromBase64Url(raw.slice(PREFIX.length)) : raw;
      const session = JSON.parse(json) as { user?: { user_metadata?: unknown }; access_token?: unknown };
      const who = fromMeta(session.user?.user_metadata);
      if (who) return who;
      // no user object stored: the access token's claims carry the same metadata
      const token = str(session.access_token);
      if (token) {
        const claims = JSON.parse(fromBase64Url(token.split(".")[1] ?? "")) as { user_metadata?: unknown };
        const fromToken = fromMeta(claims.user_metadata);
        if (fromToken) return fromToken;
      }
      // a session with nothing we can show is still a session
      return { avatarUrl: null, login: null };
    } catch {
      continue;
    }
  }
  return null;
}
