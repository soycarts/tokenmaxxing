import { getOrgPage } from "@/lib/data";
import { json, PUBLIC_CACHE } from "@/lib/http";
import { PERIODS, SLUG_RE, type Period } from "@/lib/periods";

/** GET /api/v1/orgs/{slug}?period=month: public org aggregates (public members only). */
export async function GET(request: Request, ctx: { params: Promise<{ slug: string }> }) {
  const slug = decodeURIComponent((await ctx.params).slug).toLowerCase();
  const period = (new URL(request.url).searchParams.get("period") ?? "month") as Period;
  if (!PERIODS.includes(period)) return json({ error: "period must be week, month or all" }, { status: 400 });
  if (!SLUG_RE.test(slug)) return json({ error: "not_found" }, { status: 404, cache: PUBLIC_CACHE });

  const res = await getOrgPage(slug, period);
  if (!res.configured) return json({ error: "not_configured" }, { status: 503 });
  if (res.error) return json({ error: "server_error" }, { status: 500 });
  if (!res.data) return json({ error: "not_found" }, { status: 404, cache: PUBLIC_CACHE });
  const { invite_code: _code, is_member: _m, is_owner: _o, ...org } = res.data;
  return json(org, { cache: PUBLIC_CACHE });
}
