# tokenmaxxing monorepo

- `packages/cli/SPEC.md` and `apps/web/SPEC.md` are binding contracts. Change the spec first, then the code.
- CLI: zero runtime deps, never reads credentials, never edits other tools' configs without explicit `hook install`, no telemetry, never silently prices a model at $0.
- Web: Next.js App Router, Supabase (Postgres + GitHub OAuth), Vercel. Public API responses cached 60s.
- npm workspaces. `npm test` at root runs everything.
- Commit small. Conventional commit prefixes (`cli:`, `web:`, `docs:`).
