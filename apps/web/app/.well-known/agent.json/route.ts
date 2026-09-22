import { agentJson, STATIC_DOC_CACHE } from "@/lib/agent-docs";
import { siteUrl } from "@/lib/env";
import { json } from "@/lib/http";

/** GET /.well-known/agent.json: name, description, the onboarding prompt and where the docs are. */
export function GET() {
  return json(agentJson(siteUrl()), { cache: STATIC_DOC_CACHE });
}
