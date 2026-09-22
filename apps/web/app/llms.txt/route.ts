import { llmsTxt, STATIC_DOC_CACHE } from "@/lib/agent-docs";
import { siteUrl } from "@/lib/env";
import { textResponse } from "@/lib/http";

/** GET /llms.txt: what the site is and how an agent sets a user up. */
export function GET() {
  return textResponse(llmsTxt(siteUrl()), "text/plain; charset=utf-8", STATIC_DOC_CACHE);
}
