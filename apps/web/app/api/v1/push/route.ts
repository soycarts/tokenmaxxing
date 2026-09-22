import { json } from "@/lib/http";
import { validatePush } from "@/lib/push";
import { createAdminClient } from "@/lib/supabase/admin";
import { bearerToken, hashApiToken } from "@/lib/tokens";

export const maxDuration = 30;

const MAX_BODY_BYTES = 4 * 1024 * 1024; // 5000 rows at ~300 bytes each, with room to spare
const CHUNK = 1000;

/**
 * POST /api/v1/push. Bearer device token → (user, device). Body `{ v:1, deviceId, rows }`.
 * Valid rows are upserted on (device_id, ts, source, model), replacing the hour's totals.
 * 200 when every row was accepted, 422 when any row was rejected (the rest are still written).
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

  const rows = result.rows.map((r) => ({ ...r, user_id: auth.user_id, device_id: auth.device_id }));
  for (let i = 0; i < rows.length; i += CHUNK) {
    const { error } = await admin.from("buckets").upsert(rows.slice(i, i + CHUNK), { onConflict: "device_id,ts,source,model" });
    if (error) {
      console.error("[push upsert]", error.message);
      return json({ error: "server_error", accepted: i }, { status: 500 });
    }
  }

  const now = new Date().toISOString();
  await Promise.all([
    admin.from("devices").update({ last_push_at: now }).eq("id", auth.device_id),
    admin.from("api_tokens").update({ last_used_at: now }).eq("token_hash", auth.token_hash),
  ]);

  return json({ accepted: rows.length, rejected: result.rejected }, { status: result.rejected.length ? 422 : 200 });
}
