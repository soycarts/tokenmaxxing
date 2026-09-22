/** Shared response helpers for the JSON API. */
export const PUBLIC_CACHE = "public, s-maxage=60, stale-while-revalidate=300";

export function json(body: unknown, init: { status?: number; cache?: string; headers?: Record<string, string> } = {}) {
  return Response.json(body, {
    status: init.status ?? 200,
    headers: { "Cache-Control": init.cache ?? "no-store", ...init.headers },
  });
}

/** A text response (markdown twins, llms.txt) with the given type and cache policy. */
export function textResponse(body: string, contentType: string, cache: string, status = 200) {
  return new Response(body, {
    status,
    headers: { "Content-Type": contentType, "Cache-Control": cache, Vary: "Accept", "X-Content-Type-Options": "nosniff" },
  });
}
