"use server";

import { redirect } from "next/navigation";
import { normalizeLinkCode } from "@/lib/link-code";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient, getSessionUser } from "@/lib/supabase/server";
import { generateApiToken, hashApiToken } from "@/lib/tokens";

function fail(code: string, message: string): never {
  redirect(`/link?code=${encodeURIComponent(code)}&error=${encodeURIComponent(message)}`);
}

/**
 * Confirming a code: create the device and its token, and park the plaintext token on the
 * link_codes row for the CLI's next poll (GET /api/v1/link/{code}), which nulls it.
 */
export async function confirmLink(form: FormData) {
  const raw = String(form.get("code") ?? "");
  const code = normalizeLinkCode(raw);
  if (!code) fail(raw, "That is not a valid link code.");

  const supabase = await createClient();
  const admin = createAdminClient();
  if (!supabase || !admin) fail(code, "Linking is not configured on this deployment.");
  const user = await getSessionUser(supabase);
  if (!user) fail(code, "Sign in first.");

  const { data: profile } = await supabase.from("profiles").select("handle").eq("id", user.id).maybeSingle();
  if (!profile) fail(code, "Choose a handle first.");

  const { data: existing } = await admin.from("link_codes").select("code").eq("code", code).maybeSingle();
  if (existing) fail(code, "This code has already been used. Run `tokenmaxxing link` again for a new one.");

  const name = String(form.get("name") ?? "").trim().slice(0, 64) || "device";
  const { data: device, error: deviceError } = await admin
    .from("devices")
    .insert({ user_id: user.id, name })
    .select("id")
    .single();
  if (deviceError || !device) fail(code, "Could not create the device.");

  const token = generateApiToken();
  const { error: tokenError } = await admin
    .from("api_tokens")
    .insert({ token_hash: hashApiToken(token), user_id: user.id, device_id: device.id });
  const { error: codeError } = tokenError
    ? { error: tokenError }
    : await admin.from("link_codes").insert({ code, user_id: user.id, token_plain: token, device_id: device.id });
  if (tokenError || codeError) {
    await admin.from("devices").delete().eq("id", device.id); // cascades to the token
    fail(code, codeError?.code === "23505" ? "This code has already been used." : "Could not link the device.");
  }

  redirect(`/link?code=${code}&done=1`);
}
