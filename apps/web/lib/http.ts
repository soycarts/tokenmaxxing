/** Shared response helpers for the JSON API. */
export const PUBLIC_CACHE = "public, s-maxage=60, stale-while-revalidate=300";

export function json(body: unknown, init: { status?: number; cache?: string; headers?: Record<string, string> } = {}) {
  return Response.json(body, {
    status: init.status ?? 200,
    headers: { "Cache-Control": init.cache ?? "no-store", ...init.headers },
  });
}
