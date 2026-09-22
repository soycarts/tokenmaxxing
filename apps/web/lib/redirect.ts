/** Only same-site relative paths are allowed as post-login destinations (no open redirect). */
export function safeNext(raw: unknown, fallback = "/me"): string {
  if (typeof raw !== "string") return fallback;
  if (!raw.startsWith("/") || raw.startsWith("//") || raw.startsWith("/\\")) return fallback;
  return raw;
}
