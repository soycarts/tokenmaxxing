import { HANDLE_RE } from "@/lib/periods";

/** A GitHub login squeezed into the handle rules: lowercase [a-z0-9-], 3 to 24 chars. */
export function suggestHandle(login: string | null | undefined): string {
  const base = (login ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 24);
  return HANDLE_RE.test(base) ? base : "";
}

export function suggestSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 32);
}
