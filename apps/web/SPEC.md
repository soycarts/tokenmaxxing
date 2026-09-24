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
               avatar_url text, public boolean default false, plans jsonb default '{}',  -- {"claude":[{"plan":"max-20x","qty":5}]}, see Plans
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

### Plans (`profiles.plans`)

Same shape and rules as the CLI's `config.plans` (packages/cli/SPEC.md, Plans): per provider a list of lines `{ plan, qty }` (qty integer 1–99, absent = 1), or a custom line `{ plan:"custom", label (1–40 chars), monthly (0.01–10000), qty }`; the legacy string form `{ "claude":"max-20x" }` means one line of qty 1 and stays readable forever. The price table lives in `lib/plans.ts` (mirror of the CLI's `plans.json`) and SQL `plan_price_usd()`; `lib/plans.test.ts` fails when the three drift.
- `lib/plans.ts`: `Plans = Partial<Record<Provider, PlanLine[]>>`. `sanitizePlans(input)` accepts either JSON shape or the `/me` FormData and returns the normalised list shape: unknown providers/plan ids and bad qty dropped, duplicate plan ids merged by summing qty (cap 99; custom lines merge only when label and monthly match), at most 10 lines per provider. `plansMonthlyUsd(plans)` = Σ price × qty (custom: monthly × qty). `describePlans(plans)` → "5× Max 20x + 1× Pro"; `describePlans(plans, { provider: true })` → "5× Claude Max 20x, 1× Claude Pro". UI labels: `pro-100` is "Pro $100", `max-20x` "Max 20x", custom lines show their label.
- SQL `plans_monthly_usd(jsonb)` reads both shapes (a string, or an array of `{plan, qty}` / custom objects), prices each valid line at price × qty, and ignores anything it cannot price. `profile_page` returns `plans` as stored plus `plans_monthly_usd` (and the older alias `plan_monthly_usd`), so the page never recomputes. `profiles.plans` is capped at 4 KB of JSON by a check constraint. Every writer (the `/me` action) stores the list shape.
- Custom lines let anyone state any monthly figure, so the ROI board ranks only users whose plans total at least $20/month (the cheapest real plan). Profiles and badges still show ROI for any positive plan cost; the value board is unaffected.

Views / functions (SQL):
- `user_period_stats(period text)` → per user: api_equiv_usd, tokens_total, output_tokens, cache_read_ratio, unpriced_tokens, sources[] for `week|month|all`.
- `leaderboard(period, metric)` — metric ∈ `value` (api_equiv_usd desc), `roi` (api_equiv_usd ÷ prorated `plans_monthly_usd(plans)`, users with plans totalling ≥ $20/month only), `efficiency` (output_tokens per api_equiv_usd desc, min $5 spend), `volume` (tokens_total desc). Only `profiles.public = true`. Returns top 100.
- `org_leaderboard(period)` — Σ api_equiv_usd per org, member count, only `orgs.public`.
- Materialize weekly/monthly via a Vercel cron hitting `/api/cron/refresh` (`CRON_SECRET`), or plain views if fast enough for v1 (buckets are hourly rows; 1k users × 90 days × 24 × ~5 models ≈ 10M rows — start with plain views + indexes on (user_id, ts), (ts); revisit).

RLS: profiles readable by anyone when public, else owner; buckets readable by owner only (leaderboards go through SECURITY DEFINER functions that expose aggregates only); orgs/org_members readable by members and public when org.public; everything writable by owner only. `link_codes` and `api_tokens` are only touched via server routes using the service role key (server-only env `SUPABASE_SERVICE_ROLE_KEY`; never shipped to the client).

## Routes

Pages
- `/` — hero, prompt copy box, live tiles: "value extracted this week (all public users)", "users tracking", "top model by value". Three-step "how it works". Privacy strip: *We receive hourly token counts per model. Never prompts, paths, or project names.* Links to leaderboard and GitHub.
- `/setup` — prompt box, manual install (`npx tokenmaxxing-cli@latest init`), what gets uploaded (table), hooks are opt-in, uninstall.
- `/leaderboard` — tabs Value (default) · ROI · Efficiency · Volume; period chips week / month / all; rows: rank, avatar+handle, primary metric, secondary (tokens, sources icons). `/leaderboard/orgs` — orgs by value.
- `/u/[handle]` — public profile (404 if not public unless it's you): ROI card (api-equiv $ vs plan price, multiple; caption "$17,224 of API-equivalent usage against $1,020.00/mo of plans (5× Claude Max 20x, 1× Claude Pro)" from `describePlans`), tiles (tokens, output, cache-hit %), by-model table, 30-day sparkline (SVG, no chart lib), badge embed snippet, "unpriced models" note if any.
- `/me` — signed-in: set handle (once), toggle public, set plans (per provider a list of rows: plan `<select>` with a "Custom amount" option that reveals label and monthly-price inputs, qty `<input type=number min=1 max=99>`, a remove button, and "Add another plan"; works without JavaScript: fields are `plan_<provider>_<i>`, `qty_<provider>_<i>`, `label_<provider>_<i>`, `monthly_<provider>_<i>` plus a hidden `rows_<provider>` count, and add/remove are submit buttons `name="op"` value `add:<provider>` / `remove:<provider>:<i>` that re-render the form from the posted rows without saving; "Save plans" saves), devices list (rename/revoke), orgs (create, join by code, leave), and the CLI link status.
- `/orgs/[slug]` — org page: total value, members table (opt-in only: members shown only if they are public or the viewer is a member), invite code visible to members.
- `/link` — `?code=XXXX`: if not signed in, GitHub OAuth then return here; shows "Link device `code`?" → confirm → server creates device + token, stores `token_plain` on the link_code row (consumed by CLI poll, then nulled). Shows "Done, go back to your terminal".
- `/auth/callback` — Supabase OAuth code exchange (`@supabase/ssr` pattern).
- `/privacy` — plain page.

API (all JSON, `app/api/v1/...`)
- `GET /api/v1/link/{code}` — CLI polls. `202 { error:"pending" }` until confirmed (404 means the endpoint does not exist); then `{ token, handle }` **once** (then null the plaintext and set consumed_at). Rate-limit by IP (in-memory Map is fine on Vercel for v1; note the limitation).
- `POST /api/v1/push` — Bearer token → user/device. Body `{ v:1, deviceId, rows:[...] }` ≤ 5000 rows. Validate with zod: ts is a whole hour, not in the future (+5 min slack), source ∈ claude|codex|gemini|cursor, all counts ≥ 0 integers, per-row tokens ≤ 1T/hour (sanity bound only; a real heavy hour measured 575M, almost all cache reads, and fleet users go far higher) (flag, don't reject: set `flagged=true`? — v1: drop rows over the cap and list them in `rejected`; still 200). Upsert on PK. Update `devices.last_push_at`, `api_tokens.last_used_at`. Returns `{ accepted, rejected:[...] }`.
- `GET /api/v1/leaderboard?period=week&metric=value` — public, `Cache-Control: public, s-maxage=60, stale-while-revalidate=300`.
- `GET /api/v1/u/{handle}?period=month` — public profile aggregates (404 if not public). `plans` is always the normalised list shape; `plans_monthly_usd` is the summed monthly cost (`plan_monthly_usd` stays as an alias).
- `GET /api/v1/orgs/{slug}` — public org aggregates.
- `GET /badge/{handle}.svg?metric=value|roi|rank&period=week|month|all` — shields-style flat SVG, 60s cache, grey "private" variant if profile not public. Pure string template, no dependency.
- `GET /api/cron/refresh` — optional, guarded by `CRON_SECRET`.

## Auth & env

- GitHub OAuth through Supabase Auth. Server client via `@supabase/ssr` (`lib/supabase/server.ts`, `lib/supabase/client.ts`, `proxy.ts`/middleware for session refresh — use whatever Next 16 expects; check `~/dev/samefacts` for a working pattern).
- Env: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `NEXT_PUBLIC_SITE_URL`, `CRON_SECRET`. Ship `.env.example`.
- The app must **build and render every page with no Supabase env set** (show an "not configured" state / empty leaderboards) so it can be deployed before the DB exists.

## Design

Load the `frontend-design` skill before writing UI. A sibling of jobmaxxing.ai's "GUMDROP" identity, bold rather than quiet:

- Tokens as CSS variables in `app/globals.css`, mapped into Tailwind's `@theme`. Light-first: Milk `#fffdf7` paper, Liquorice `#211d2e` ink, Sour Cherry `#c2136b` for primary actions. Dark is "Blackcurrant" (`#1c1826` / `#2a2438`, accent `#ff7ec4`), chosen by `data-theme` on `<html>` (a stored choice from the header toggle) or, with no choice, `prefers-color-scheme`; a head script sets it before first paint so there is no flash.
- Butterscotch gold (`#f5b82e`, `#ffd060` on dark) marks value (the ROI poster, value figures); the candy stage colours (bubblegum, apricot, butter, mint, periwinkle) mark the four leaderboard tabs.
- Anton (self-hosted from `public/fonts`, never hotlinked), uppercase with tight leading, for headlines, section heads, tabs, buttons and big numbers. Body copy stays in a readable system sans with tabular numerals; commands and prompts in the system monospace.
- No mascot. The mark is purely typographic: "TOKENMAXXING" with a small ".fyi", Anton outlines in inline SVG built like jobmaxxing's wordmark (slant, tilt, ink contour, candy extrusion, white keyline). The favicon (`app/icon.svg`) and the badge carry a small Sour Cherry coin stamped with Anton's T.
- Chips, buttons and panels are stickers: a thick ink keyline and a hard offset shadow that collapses on press.
- Mobile: 16px gutters, no horizontal scroll. Tables collapse to cards under 640px. Inline SVG for sparklines, badge, mascot and wordmark. No component library, no chart library.

## Tests / verification

- `npm run build` clean with no env.
- `vitest` unit tests for: push validation (zod schema + hour rounding + caps), badge SVG generation, leaderboard metric SQL is exercised by a `supabase/schema.test.sql`-style script only if a DB is available (skip otherwise), link-code generator alphabet.
- `scripts/seed-prices.mjs` reads `../../packages/cli/src/pricing/*.snapshot.json` + overrides and emits `supabase/seed_prices.sql` (upsert statements). Commit the generated SQL. A model listed at $0/$0 upstream gets no row (and the SQL deletes any stale one), so its tokens count as `unpriced_tokens`, matching the CLI.
- Lighthouse-ish sanity: home page < 150KB JS.

## Out of scope v1

Ads. Paid org tier. Email. Anti-cheat beyond caps + rate limit. Non-GitHub login.
