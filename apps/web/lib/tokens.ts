import { createHash, randomBytes } from "node:crypto";

/** Device API tokens: `tmx_` + 32 random bytes, base64url. Only the sha256 hex is stored. */
export function generateApiToken(): string {
  return `tmx_${randomBytes(32).toString("base64url")}`;
}

export function hashApiToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

export function bearerToken(header: string | null): string | null {
  if (!header) return null;
  const match = /^Bearer\s+(\S+)$/i.exec(header.trim());
  return match ? match[1] : null;
}
