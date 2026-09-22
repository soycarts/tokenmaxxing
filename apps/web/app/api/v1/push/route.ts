import type { SupabaseClient } from "@supabase/supabase-js";
import { json } from "@/lib/http";
import { validatePush } from "@/lib/push";
import { createAdminClient } from "@/lib/supabase/admin";
import { bearerToken, hashApiToken } from "@/lib/tokens";

export const maxDuration = 30;

const MAX_BODY_BYTES = 4 * 1024 * 1024; // 5000 rows at ~300 bytes each, with room to spare
const CHUNK = 1000;

/**
 * POST /api/v1/push. Bearer device token → (user, device). Body
 * `{ v:1, deviceId, granularity?: "hour"|"day"|"week", replaceDevice?: true, rows }`.
 * Valid rows are upserted on (device_id, ts, source, model), replacing that period's totals.
 * With `replaceDevice: true` every row the device already has is deleted first, in the same
 * transaction as the insert (the `replace_device_buckets` RPC), so switching granularity never
 * double counts. The CLI sets it on the first batch of a push only.
 * 200 always once authenticated and parsed; `rejected` lists rows that failed validation (the rest are written).
 * The device comes from the token; the body's deviceId is the CLI's local id and is only
 * validated, never trusted for authorisation.
 */
export async function POST(request: Request) {
  const token = bearerToken(request.headers.get("authorization"));
  if (!token) return json({ error: "missing_token" }, { status: 401, headers: { "WWW-Authenticate": "Bearer" } });

  const admin = createAdminClient();
  if (!admin) return json({ error: "not_configured" }, { status: 503 });

  const { data: auth, error: authError } = await admin
    .from("api_tokens")
    .select("token_hash, user_id, device_id")
    .eq("token_hash", hashApiToken(token))
    .maybeSingle();
  if (authError) {
    console.error("[push auth]", authError.message);
    return json({ error: "server_error" }, { status: 500 });
  }
  if (!auth) return json({ error: "invalid_token" }, { status: 401, headers: { "WWW-Authenticate": "Bearer" } });

  const length = Number(request.headers.get("content-length") ?? 0);
  if (length > MAX_BODY_BYTES) return json({ error: "body_too_large" }, { status: 413 });

  let body: unknown;
  try {
    const text = await request.text();
    if (text.length > MAX_BODY_BYTES) return json({ error: "body_too_large" }, { status: 413 });
    body = JSON.parse(text);
  } catch {
    return json({ error: "invalid_json" }, { status: 400 });
  }

  const result = validatePush(body);
  if (!result.ok) return json({ error: result.error, issues: result.issues }, { status: 400 });

  if (result.replaceDevice) {
    // One statement, one transaction: delete the device's rows, insert this batch.
    const { data: written, error } = await admin.rpc("replace_device_buckets", {
      p_device: auth.device_id,
      p_rows: result.rows,
    });
    if (error) {
      console.error("[push replace]", error.message);
      return json({ error: "server_error", accepted: 0 }, { status: 500 });
    }
    await touch(admin, auth);
    return json({ accepted: typeof written === "number" ? written : result.rows.length, rejected: result.rejected, replaced: true }, { status: 200 });
  }

  const rows = result.rows.map((r) => ({ ...r, user_id: auth.user_id, device_id: auth.device_id }));
  for (let i = 0; i < rows.length; i += CHUNK) {
    const { error } = await admin.from("buckets").upsert(rows.slice(i, i + CHUNK), { onConflict: "device_id,ts,source,model" });
    if (error) {
      console.error("[push upsert]", error.message);
      return json({ error: "server_error", accepted: i }, { status: 500 });
    }
  }

  await touch(admin, auth);
  return json({ accepted: rows.length, rejected: result.rejected }, { status: 200 });
}

async function touch(admin: SupabaseClient, auth: { token_hash: string; device_id: string }) {
  const now = new Date().toISOString();
  await Promise.all([
    admin.from("devices").update({ last_push_at: now }).eq("id", auth.device_id),
    admin.from("api_tokens").update({ last_used_at: now }).eq("token_hash", auth.token_hash),
  ]);
}
