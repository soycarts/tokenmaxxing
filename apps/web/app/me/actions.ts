"use server";

import { redirect } from "next/navigation";
import { suggestSlug } from "@/lib/handles";
import { HANDLE_RE, SLUG_RE } from "@/lib/periods";
import { applyPlanOp, invalidRows, rowsFromForm, sanitizePlans, type PlansFormState } from "@/lib/plans";
import { safeNext } from "@/lib/redirect";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient, getSessionUser } from "@/lib/supabase/server";

/**
 * Account mutations. Every action re-derives the user from the verified session; nothing is
 * trusted from the form except the values being changed. RLS and column grants in
 * supabase/schema.sql are the second line of defence.
 */

function back(to: string, key: "ok" | "error", message: string): never {
  const sep = to.includes("?") ? "&" : "?";
  redirect(`${to}${sep}${key}=${encodeURIComponent(message)}`);
}

async function requireUser() {
  const supabase = await createClient();
  if (!supabase) back("/me", "error", "The database is not connected yet.");
  const user = await getSessionUser(supabase);
  if (!user) back("/me", "error", "Sign in first.");
  return { supabase, user };
}

export async function createProfile(form: FormData) {
  const next = safeNext(form.get("next"));
  const { supabase, user } = await requireUser();
  const handle = String(form.get("handle") ?? "").trim().toLowerCase();
  if (!HANDLE_RE.test(handle)) back(next, "error", "Handles are 3 to 24 characters: lowercase letters, digits and dashes.");

  const { error } = await supabase.from("profiles").insert({
    id: user.id,
    handle,
    display_name: user.name?.slice(0, 64) ?? null,
    avatar_url: user.avatarUrl?.slice(0, 512) ?? null,
  });
  if (error) {
    if (error.code === "23505") back(next, "error", error.message.includes("pkey") ? "You already have a handle." : `@${handle} is taken.`);
    back(next, "error", "Could not save the handle.");
  }
  back(next, "ok", `You are @${handle}.`);
}

export async function setPublic(form: FormData) {
  const { supabase, user } = await requireUser();
  const makePublic = form.get("public") === "true";
  const { error } = await supabase.from("profiles").update({ public: makePublic }).eq("id", user.id);
  if (error) back("/me", "error", "Could not change visibility.");
  back("/me", "ok", makePublic ? "Your profile is public." : "Your profile is private.");
}

/**
 * The /me plans form (used with useActionState, so it also works without JavaScript). The
 * add/remove buttons post `op=add:<provider>` / `op=remove:<provider>:<i>` and get the edited
 * rows back unsaved; anything else (the Save button, or Enter) saves.
 */
export async function savePlans(prev: PlansFormState, form: FormData): Promise<PlansFormState> {
  const op = String(form.get("op") ?? "save");
  if (op.startsWith("add:") || op.startsWith("remove:")) {
    return { rows: applyPlanOp(rowsFromForm(form), op), v: (prev?.v ?? 0) + 1 };
  }
  const { supabase, user } = await requireUser();
  const plans = sanitizePlans(form);
  const { error } = await supabase.from("profiles").update({ plans }).eq("id", user.id);
  if (error) back("/me", "error", "Could not save plans.");
  const bad = invalidRows(rowsFromForm(form));
  back(
    "/me",
    "ok",
    bad
      ? `Plans saved. ${bad === 1 ? "One row was" : `${bad} rows were`} left out: seats must be 1 to 99 and a custom amount $0.01 to $10,000 a month.`
      : "Plans saved.",
  );
}

export async function renameDevice(form: FormData) {
  const { supabase, user } = await requireUser();
  const id = String(form.get("id") ?? "");
  const name = String(form.get("name") ?? "").trim().slice(0, 64);
  if (!name) back("/me", "error", "Device names can't be empty.");
  const { error } = await supabase.from("devices").update({ name }).eq("id", id).eq("user_id", user.id);
  if (error) back("/me", "error", "Could not rename the device.");
  back("/me", "ok", "Device renamed.");
}

export async function revokeDevice(form: FormData) {
  const { user } = await requireUser();
  const admin = createAdminClient();
  if (!admin) back("/me", "error", "Revoking needs the server key, which is not configured.");
  const id = String(form.get("id") ?? "");
  const { error } = await admin.from("api_tokens").delete().eq("device_id", id).eq("user_id", user.id);
  if (error) back("/me", "error", "Could not revoke the device.");
  back("/me", "ok", "Device revoked. Its past usage stays; it can no longer push.");
}

export async function createOrg(form: FormData) {
  const { supabase } = await requireUser();
  const name = String(form.get("name") ?? "").trim().slice(0, 64);
  const slug = (String(form.get("slug") ?? "").trim().toLowerCase() || suggestSlug(name)).slice(0, 32);
  if (!name) back("/me", "error", "Give the org a name.");
  if (!SLUG_RE.test(slug)) back("/me", "error", "Org URLs are 2 to 32 characters: lowercase letters, digits and dashes.");
  const { error } = await supabase.rpc("create_org", { p_slug: slug, p_name: name, p_public: form.get("public") === "on" });
  if (error) back("/me", "error", error.code === "23505" ? `/orgs/${slug} is taken.` : "Could not create the org.");
  back("/me", "ok", `Created ${name}. Share the invite code with your team.`);
}

export async function joinOrg(form: FormData) {
  const { supabase } = await requireUser();
  const code = String(form.get("code") ?? "").trim();
  if (!code) back("/me", "error", "Paste an invite code.");
  const { data, error } = await supabase.rpc("join_org", { p_code: code });
  if (error) back("/me", "error", error.code === "P0002" ? "No org has that invite code." : "Could not join the org.");
  back("/me", "ok", `Joined /orgs/${data}.`);
}

export async function leaveOrg(form: FormData) {
  const { supabase, user } = await requireUser();
  const slug = String(form.get("slug") ?? "");
  const { data: org } = await supabase.from("orgs").select("id").eq("slug", slug).maybeSingle();
  if (!org) back("/me", "error", "Org not found.");
  const { error } = await supabase.from("org_members").delete().eq("org_id", org.id).eq("user_id", user.id);
  if (error) back("/me", "error", "Could not leave the org.");
  back("/me", "ok", "Left the org.");
}

export async function deleteAccount(form: FormData) {
  const { supabase, user } = await requireUser();
  const { data: profile } = await supabase.from("profiles").select("handle").eq("id", user.id).maybeSingle();
  const confirm = String(form.get("confirm") ?? "").trim().toLowerCase();
  if (!profile || confirm !== profile.handle) back("/me", "error", "Type your handle exactly to confirm.");
  const admin = createAdminClient();
  if (!admin) back("/me", "error", "Deleting needs the server key, which is not configured.");
  const { error } = await admin.auth.admin.deleteUser(user.id);
  if (error) back("/me", "error", "Could not delete the account.");
  await supabase.auth.signOut();
  redirect("/?ok=deleted");
}
