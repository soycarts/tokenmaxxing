import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // content/*.md (legal docs, the agent skill) is read with fs by pages and route handlers.
  outputFileTracingIncludes: { "/*": ["./content/**/*"] },
  // The skill is published at both spellings; the folder can only exist once on macOS.
  async rewrites() {
    return [{ source: "/SKILL.md", destination: "/skill.md" }];
  },
};

export default nextConfig;
