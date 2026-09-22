import { MARKDOWN_TYPE, setupMarkdown, STATIC_DOC_CACHE } from "@/lib/agent-docs";
import { siteUrl } from "@/lib/env";
import { textResponse } from "@/lib/http";

/** GET /setup.md: the markdown twin of /setup. */
export function GET() {
  return textResponse(setupMarkdown(siteUrl()), MARKDOWN_TYPE, STATIC_DOC_CACHE);
}
