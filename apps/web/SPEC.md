# tokenmaxxing.fyi — web SPEC (binding)

Next.js 16 App Router, TypeScript, Tailwind v4, deployed to Vercel. Supabase Postgres + Supabase Auth (GitHub OAuth) via `@supabase/ssr` + `@supabase/supabase-js`. No other runtime deps unless listed here. No analytics/tracking scripts in v1 (Vercel Analytics is allowed).

Companion CLI: `packages/cli` (see its SPEC.md). The CLI is the only writer of usage data. The site never reads anything from a user's machine.

## Positioning / copy

Headline: **How much did your AI subscription actually deliver?**
Sub: Paste one prompt into your coding agent. It installs a tiny local tracker, reads your agent logs, and prices your usage at API list rates. Subscribers usually find out they're getting a very good deal.
Tone: dry, slightly ironic about "tokenmaxxing". Ranking is by **value extracted** by default. The raw-volume board exists but is labelled "Volume (the tokenmaxxing board)".

The onboarding prompt (shown in a copy box on `/` and `/setup`, exact text):
```
Set up tokenmaxxing for me: run `npx tokenmaxxing-cli@latest init`, show me the report it prints,
and if I like it run `npx tokenmaxxing-cli link` and open the URL it prints.
Don't edit any of my tool config files unless I say so.
```

## Data model (Supabase, `supabase/schema.sql`, idempotent, RLS on)

```
profiles      (id uuid pk = auth.users.id, handle text unique not null (3–24, [a-z0-9-]), display_name text,
               avatar_url text, public boolean default false, plans jsonb default '{}',  -- {"claude":"max-20x"}
               created_at timestamptz default now())
devices       (id uuid pk, user_id uuid fk profiles, name text, created_at, last_push_at)
api_tokens    (token_hash text pk (sha256 hex), user_id uuid fk, device_id uuid fk, created_at, last_used_at)
link_codes    (code text pk (8 chars, uppercase, no 0/O/1/I), user_id uuid null, token_plain text null,
               device_id uuid null, created_at, expires_at (now()+10 min), consumed_at null)
buckets       (user_id uuid, device_id uuid, ts timestamptz, source text, model text,
               input bigint, cache_read bigint, cache_write_5m bigint, cache_write_1h bigint,
               output bigint, reasoning bigint, requests int, conversations int,
               primary key (device_id, ts, source, model))
orgs          (id uuid pk, slug text unique, name text, invite_code text unique, owner_id uuid fk profiles, public boolean default true, created_at)
org_members   (org_id uuid fk, user_id uuid fk, role text default 'member', joined_at, pk (org_id,user_id))
model_prices  (model text pk, input numeric, cache_read numeric, cache_write_5m numeric, cache_write_1h numeric, output numeric, snapshot_date date)
```
Cost is computed **server-side** from `model_prices` (seeded from the CLI's snapshots by `scripts/seed-prices.mjs` so both sides agree). Unknown models cost 0 and are counted in `unpriced_tokens`.

Views / functions (SQL):
- `user_period_stats(period text)` → per user: api_equiv_usd, tokens_total, output_tokens, cache_read_ratio, unpriced_tokens, sources[] for `week|month|all`.
- `leaderboard(period, metric)` — metric ∈ `value` (api_equiv_usd desc), `roi` (api_equiv_usd ÷ Σ plan prices, users with a plan only), `efficiency` (output_tokens per api_equiv_usd desc, min $5 spend), `volume` (tokens_total desc). Only `profiles.public = true`. Returns top 100.
- `org_leaderboard(period)` — Σ api_equiv_usd per org, member count, only `orgs.public`.
- Materialize weekly/monthly via a Vercel cron hitting `/api/cron/refresh` (`CRON_SECRET`), or plain views if fast enough for v1 (buckets are hourly rows; 1k users × 90 days × 24 × ~5 models ≈ 10M rows — start with plain views + indexes on (user_id, ts), (ts); revisit).

RLS: profiles readable by anyone when public, else owner; buckets readable by owner only (leaderboards go through SECURITY DEFINER functions that expose aggregates only); orgs/org_members readable by members and public when org.public; everything writable by owner only. `link_codes` and `api_tokens` are only touched via server routes using the service role key (server-only env `SUPABASE_SERVICE_ROLE_KEY`; never shipped to the client).

## Routes

Pages
- `/` — hero, prompt copy box, live tiles: "value extracted this week (all public users)", "users tracking", "top model by value". Three-step "how it works". Privacy strip: *We receive hourly token counts per model. Never prompts, paths, or project names.* Links to leaderboard and GitHub.
- `/setup` — prompt box, manual install (`npx tokenmaxxing-cli@latest init`), what gets uploaded (table), hooks are opt-in, uninstall.
- `/leaderboard` — tabs Value (default) · ROI · Efficiency · Volume; period chips week / month / all; rows: rank, avatar+handle, primary metric, secondary (tokens, sources icons). `/leaderboard/orgs` — orgs by value.
- `/u/[handle]` — public profile (404 if not public unless it's you): ROI card (api-equiv $ vs plan price, multiple), tiles (tokens, output, cache-hit %), by-model table, 30-day sparkline (SVG, no chart lib), badge embed snippet, "unpriced models" note if any.
- `/me` — signed-in: set handle (once), toggle public, set plans (dropdowns per provider from the CLI's plans.json copied to `lib/plans.ts`), devices list (rename/revoke), orgs (create, join by code, leave), and the CLI link status.
- `/orgs/[slug]` — org page: total value, members table (opt-in only: members shown only if they are public or the viewer is a member), invite code visible to members.
- `/link` — `?code=XXXX`: if not signed in, GitHub OAuth then return here; shows "Link device `code`?" → confirm → server creates device + token, stores `token_plain` on the link_code row (consumed by CLI poll, then nulled). Shows "Done, go back to your terminal".
- `/auth/callback` — Supabase OAuth code exchange (`@supabase/ssr` pattern).
- `/privacy` — plain page.

API (all JSON, `app/api/v1/...`)
- `GET /api/v1/link/{code}` — CLI polls. `202 { error:"pending" }` until confirmed (404 means the endpoint does not exist); then `{ token, handle }` **once** (then null the plaintext and set consumed_at). Rate-limit by IP (in-memory Map is fine on Vercel for v1; note the limitation).
- `POST /api/v1/push` — Bearer token → user/device. Body `{ v:1, deviceId, rows:[...] }` ≤ 5000 rows. Validate with zod: ts is a whole hour, not in the future (+5 min slack), source ∈ claude|codex|gemini|cursor, all counts ≥ 0 integers, per-row tokens ≤ 50M/hour (flag, don't reject: set `flagged=true`? — v1: drop rows over the cap and list them in `rejected`; still 200). Upsert on PK. Update `devices.last_push_at`, `api_tokens.last_used_at`. Returns `{ accepted, rejected:[...] }`.
- `GET /api/v1/leaderboard?period=week&metric=value` — public, `Cache-Control: public, s-maxage=60, stale-while-revalidate=300`.
- `GET /api/v1/u/{handle}?period=month` — public profile aggregates (404 if not public).
- `GET /api/v1/orgs/{slug}` — public org aggregates.
- `GET /badge/{handle}.svg?metric=value|roi|rank&period=week|month|all` — shields-style flat SVG, 60s cache, grey "private" variant if profile not public. Pure string template, no dependency.
- `GET /api/cron/refresh` — optional, guarded by `CRON_SECRET`.

## Auth & env

- GitHub OAuth through Supabase Auth. Server client via `@supabase/ssr` (`lib/supabase/server.ts`, `lib/supabase/client.ts`, `proxy.ts`/middleware for session refresh — use whatever Next 16 expects; check `~/dev/samefacts` for a working pattern).
- Env: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `NEXT_PUBLIC_SITE_URL`, `CRON_SECRET`. Ship `.env.example`.
- The app must **build and render every page with no Supabase env set** (show an "not configured" state / empty leaderboards) so it can be deployed before the DB exists.

## Design

Load the `frontend-design` skill before writing UI. Dark-first, monospace numerals, one accent colour, no template look. Mobile: 16px gutters, no horizontal scroll. Tables collapse to cards under 640px. Use inline SVG for sparklines and badge. No component library.

## Tests / verification

- `npm run build` clean with no env.
- `vitest` unit tests for: push validation (zod schema + hour rounding + caps), badge SVG generation, leaderboard metric SQL is exercised by a `supabase/schema.test.sql`-style script only if a DB is available (skip otherwise), link-code generator alphabet.
- `scripts/seed-prices.mjs` reads `../../packages/cli/src/pricing/*.snapshot.json` + overrides and emits `supabase/seed_prices.sql` (upsert statements). Commit the generated SQL.
- Lighthouse-ish sanity: home page < 150KB JS.

## Out of scope v1

Ads. Paid org tier. Email. Anti-cheat beyond caps + rate limit. Non-GitHub login.
