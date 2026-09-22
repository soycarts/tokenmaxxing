import { MARKDOWN_TYPE, STATIC_DOC_CACHE } from "@/lib/agent-docs";
import { readContent } from "@/lib/content";
import { textResponse } from "@/lib/http";

/** GET /skill.md (and /SKILL.md, via next.config rewrites): skills/tokenmaxxing/SKILL.md verbatim. */
export function GET() {
  return textResponse(readContent("SKILL.md"), MARKDOWN_TYPE, STATIC_DOC_CACHE);
}
