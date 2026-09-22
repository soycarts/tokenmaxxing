import { apiMarkdown, MARKDOWN_TYPE, STATIC_DOC_CACHE } from "@/lib/agent-docs";
import { siteUrl } from "@/lib/env";
import { textResponse } from "@/lib/http";

/** GET /api.md: every public endpoint, its params and example JSON. */
export function GET() {
  return textResponse(apiMarkdown(siteUrl()), MARKDOWN_TYPE, STATIC_DOC_CACHE);
}
