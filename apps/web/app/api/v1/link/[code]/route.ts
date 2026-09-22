import { json } from "@/lib/http";
import { normalizeLinkCode } from "@/lib/link-code";
import { clientIp, createRateLimiter } from "@/lib/rate-limit";
import { createAdminClient } from "@/lib/supabase/admin";

// The CLI polls every 3s for up to 5 minutes (20/min). 40/min per IP leaves room for two
// terminals behind one NAT. In-memory and per instance: see lib/rate-limit.ts.
const limiter = createRateLimiter(40, 60_000);

/**
 * GET /api/v1/link/{code}: 404 until the code is confirmed on /link, then `{ token, handle }`
 * exactly once. The plaintext token is nulled in the same statement that returns it.
 */
export async function GET(request: Request, ctx: { params: Promise<{ code: string }> }) {
  const rl = limiter(clientIp(request.headers));
  if (!rl.ok) return json({ error: "rate_limited" }, { status: 429, headers: { "Retry-After": String(rl.retryAfterS) } });

  const code = normalizeLinkCode((await ctx.params).code);
  if (!code) return json({ error: "invalid_code" }, { status: 400 });

  const admin = createAdminClient();
  if (!admin) return json({ error: "not_configured" }, { status: 503 });

  const { data, error } = await admin.rpc("consume_link_code", { p_code: code });
  if (error) {
    console.error("[link poll]", error.message);
    return json({ error: "server_error" }, { status: 500 });
  }
  const row = Array.isArray(data) ? data[0] : null;
  if (!row?.token) return json({ error: "pending" }, { status: 404 });
  return json({ token: row.token, handle: row.handle });
}
