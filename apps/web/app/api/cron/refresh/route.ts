import { timingSafeEqual } from "node:crypto";
import { json } from "@/lib/http";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * GET /api/cron/refresh, called daily by Vercel Cron (vercel.json) with
 * `Authorization: Bearer $CRON_SECRET`. Leaderboards are plain SQL over indexed buckets in v1,
 * so there is nothing to materialise yet; this expires uncollected link codes and the tokens
 * they minted. If the views ever get slow, refresh materialised views here.
 */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return json({ error: "CRON_SECRET not set" }, { status: 503 });
  const given = Buffer.from(request.headers.get("authorization") ?? "");
  const expected = Buffer.from(`Bearer ${secret}`);
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) {
    return json({ error: "unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();
  if (!admin) return json({ error: "not_configured" }, { status: 503 });
  const { data, error } = await admin.rpc("cleanup_link_codes");
  if (error) {
    console.error("[cron refresh]", error.message);
    return json({ error: "server_error" }, { status: 500 });
  }
  return json({ ok: true, link_codes_deleted: data ?? 0 });
}
