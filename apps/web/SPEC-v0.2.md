# tokenmaxxing.fyi — v0.2 additions (binding, extends SPEC.md)

Four workstreams, all inside `apps/web` unless stated. Nothing here changes existing API contracts.

## A. Legal pages

- `/privacy` and `/terms` render the text of `docs/legal/PRIVACY.md` and `docs/legal/TERMS.md` (repo root `docs/legal/`). Load them at build time (fs read in a server component or a tiny script that copies them into `content/`), render with a minimal markdown-to-JSX (no new runtime deps: a small hand-rolled renderer for headings, paragraphs, lists, bold, links is fine, or `react-markdown` only if it is already present). Keep the "Draft for legal review" banner visible until an env `LEGAL_EFFECTIVE_DATE` is set, at which point it prints "Effective <date>".
- Footer links to both. The sign-in button gets one line under it: "By signing in you agree to the Terms and Privacy policy."
- Account deletion confirmation references the privacy policy's retention section.

## B. Sponsored placements (scaffold only, no billing)

Schema (add to `supabase/schema.sql`, idempotent):
```
sponsors (id uuid pk, slug text unique, name text, tagline text (≤ 80), url text, logo_url text null,
          placements text[] default '{}',   -- any of: 'leaderboard:value','leaderboard:roi','leaderboard:efficiency','leaderboard:volume','leaderboard:orgs','profile'
          starts_at timestamptz, ends_at timestamptz, active boolean default false, created_at)
sponsor_impressions (sponsor_id uuid, day date, placement text, count int, pk (sponsor_id, day, placement))
```
RLS: readable by anyone when `active and now() between starts_at and ends_at`; writable by nobody through the client (admin via SQL only for now).

Rendering:
- Each leaderboard tab shows at most one sponsor row **above** rank 1, visually distinct (accent keyline, small "SPONSORED" chip), never numbered, never counted. Public profile pages show a slim sponsor strip under the ROI card. Sponsor content is name, tagline, link, optional logo.
- When no active sponsor exists for a placement, render a quiet "Sponsor this board" link to `/sponsors`.
- `/sponsors` page: what's available (the six placements), audience line pulled live from stats ("N developers, $X API-equivalent tracked this month"), and a mailto `sponsors@tokenmaxxing.fyi`. No form.
- Impressions: increment `sponsor_impressions` server-side per render, batched through the existing cron or a fire-and-forget RPC; exactness is not required.
- `GET /api/v1/leaderboard` gains an optional `sponsor` object in the response so agents see the label too.

## C. Agent-friendly surface

Anyone should be able to tell Claude Code or Codex "go to tokenmaxxing.fyi and set me up" and have it work with no human reading.

- `/llms.txt`: short description, the onboarding prompt, the install commands, links to `/setup.md`, `/skill.md`, `/api.md`, `/privacy`, `/terms`.
- `/skill.md`: a Claude Code / Codex skill in the standard `SKILL.md` frontmatter format (`name: tokenmaxxing`, `description:`), with steps: run `npx tokenmaxxing-cli@latest init`, show the report, offer `plan set`, offer `link` (tell the user to open the URL), then `push`; and a "do not edit the user's tool config unless asked" rule. Also served at `/SKILL.md`.
- `/setup.md`, `/api.md`: markdown twins of `/setup` and a new API reference (every public endpoint, params, example JSON, badge/card URLs). Implement as route handlers returning `text/markdown; charset=utf-8` with `Cache-Control: public, s-maxage=3600`.
- Content negotiation: `/`, `/setup`, `/leaderboard`, `/u/[handle]`, `/privacy`, `/terms` return markdown when `Accept: text/markdown` is sent or when `?format=md` is present (and the JSON they already have via `/api/v1`). Implement once in a helper; the markdown for `/` and `/setup` is static, for `/leaderboard` and `/u/[handle]` it is a table built from the same data the page uses.
- `robots.txt` allows everything including `/api/v1` reads and `/badge`, `/card`, `/embed`; `sitemap.xml` lists public pages plus public profiles.
- `/.well-known/agent.json` (small): name, description, `prompt`, `skill_url`, `api_docs_url`.
- README at repo root gains an "For agents" section with the prompt and the skill URL.

## D. Widgets

Everything is server-rendered SVG or a static HTML page; no client JS required in the host.

1. `GET /card/{handle}.svg?period=week|month|all&theme=light|dark|auto&size=sm|md`
   - `sm` 320×96: wordmark, handle, ROI multiple (Anton, big), API-equivalent $, "30d" chip.
   - `md` 480×160: adds the 30-day sparkline and top three models by value.
   - `theme=auto` uses `<style>@media (prefers-color-scheme: dark)…` inside the SVG; GitHub README `<img>` respects it.
   - Private profile → grey "private" card. 60s cache. Pure string template like the badge; share the number formatting with the pages. Fonts: embed nothing; use `font-family: Anton, Impact, 'Arial Black', sans-serif` so GitHub (which strips webfonts) still renders something bold.
2. `GET /embed/{handle}?period=&theme=`: a minimal HTML page (no site chrome, no scripts other than a 4-line auto-resize `postMessage`) meant for an `<iframe>`; sends `Content-Security-Policy: frame-ancestors *` and `X-Frame-Options` unset.
3. `GET /badge/{handle}.svg` stays as is (shields-style).
4. The profile page gets an "Embed" panel with three ready-to-copy snippets, using the existing CopyBox:
   - GitHub README: `[![tokenmaxxing](https://tokenmaxxing.fyi/card/{handle}.svg?size=sm&theme=auto)](https://tokenmaxxing.fyi/u/{handle})`
   - Any HTML page: `<a href=…><img src="…/card/{handle}.svg?size=md" alt="…" width="480" height="160"></a>`
   - iframe: `<iframe src="https://tokenmaxxing.fyi/embed/{handle}" width="480" height="160" style="border:0" loading="lazy" title="tokenmaxxing"></iframe>`
5. Tests: snapshot-free assertions that `card` returns valid SVG with the handle and multiple present, correct dimensions per size, `private` variant when not public, and the cache header.

## Done means

`npm run build`, `npm test`, `npm run lint` green; screenshots of `/card/carter.svg` (both sizes, both themes), `/embed/carter`, `/sponsors`, `/privacy`, `/terms`; `curl -H 'Accept: text/markdown' https://localhost/leaderboard` returns a markdown table; `/skill.md` validates as SKILL.md frontmatter. Schema change applied with the same idempotent style as the rest of `schema.sql` (do not apply to the live DB; Carter's session does that).
