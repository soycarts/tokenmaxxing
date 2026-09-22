# Multiple subscriptions per provider (binding spec)

People hold more than one plan from the same vendor: five Claude Max 20x seats and one Pro, two ChatGPT Pro accounts. ROI must divide by the sum of everything they pay.

## Data shape (CLI config, site `profiles.plans`, SQL)

New canonical shape, per provider a list of lines:

```json
{ "claude": [ { "plan": "max-20x", "qty": 5 }, { "plan": "pro", "qty": 1 } ],
  "openai": [ { "plan": "pro", "qty": 2 } ] }
```

- `qty` is an integer 1–99. Lines with an unknown plan id are dropped on read. Duplicate plan ids within a provider are merged by summing qty.
- **Legacy shape stays readable forever**: `{ "claude": "max-20x" }` means `[ { "plan": "max-20x", "qty": 1 } ]`. Every reader (CLI `loadConfig`, site `sanitizePlans`, SQL `plans_monthly_usd`) normalises both shapes. Writers always emit the new shape.
- Monthly cost per provider = Σ price(plan) × qty. ROI = api_equiv ÷ (Σ over providers × period_days ÷ 30.4375), unchanged otherwise.

## Plan table refresh (2026-09-22, consumer/prosumer monthly prices)

Replace `packages/cli/src/plans.json` (and the mirrored table in `apps/web/lib/plans.ts` and SQL `plan_price_usd()`) with:

```
claude:  pro 20 · max-5x 100 · max-20x 200 · team-standard 25 · team-premium 125
openai:  go 8 · plus 20 · pro-100 100 · pro 200 · business 25          (ChatGPT plans; Codex is included in Plus/Pro/Business)
cursor:  pro 20 · pro-plus 60 · ultra 200 · teams 40
google:  ai-plus 4.99 · ai-pro 19.99 · ai-ultra-100 99.99 · ai-ultra 199.99
```

Existing ids keep their meaning (`openai/pro` stays $200; `google/ai-ultra-100` is now 99.99, `ai-ultra` 199.99). Labels in the UI: "Pro $100" for `pro-100`, etc. Sources: OpenAI help centre "About ChatGPT Pro tiers", Anthropic pricing page, cursor.com/pricing, Google One AI plans (I/O 2026 change). Put the source list and date in a comment at the top of plans.json's neighbour `plans.md`.

**Custom lines.** Any provider may also carry `{ "plan": "custom", "label": "Codex $100 promo", "monthly": 100 }` (label ≤ 40 chars, monthly 0.01–10000). CLI: `tokenmaxxing plan add openai custom 100 "Codex $100 promo"`. Site: a "Custom amount" option in the plan select reveals label and monthly-price inputs. SQL and `plansMonthlyUsd` price a custom line at `monthly × qty`. Custom lines are shown with their label wherever plans are described.

## CLI (`packages/cli`)

```
tokenmaxxing plan list                         # per provider: lines with qty and monthly total; * marks providers with a plan
tokenmaxxing plan set <provider> <plan> [xN]   # replaces the provider's lines with this one (qty N, default 1)
tokenmaxxing plan add <provider> <plan> [xN]   # adds a line (or adds N to an existing line for that plan)
tokenmaxxing plan remove <provider> [<plan>]   # removes one line, or all lines for the provider
tokenmaxxing plan set <provider> none          # still clears (existing behaviour)
```

`x5` is the quantity syntax (also accept `--qty 5`). `report` prints one line per provider: `claude  5× max-20x + 1× pro = $1,020/mo → API-equivalent $17,224 → ROI 16.9×`. `--json` emits `plans: [{ provider, lines:[{plan, qty, monthly}], monthly, api_equiv, roi }]`. `config.plans` migrates from the string form on load and is saved in the new shape on the next write. Tests: normalisation of both shapes, merge of duplicate lines, `x5` parsing, ROI with mixed lines.

## Site (`apps/web`)

- `lib/plans.ts`: `Plans` becomes `Partial<Record<Provider, PlanLine[]>>`, `sanitizePlans` accepts FormData rows and both JSON shapes, exports `plansMonthlyUsd(plans)` and `describePlans(plans)` ("5× Max 20x + 1× Pro").
- `/me` plans form: per provider, a list of rows (plan `<select>`, qty `<input type=number min=1 max=99>`, remove button) plus "Add another plan" per provider. Progressive enhancement: the form must work without JS (server action receives `plan_claude_0`, `qty_claude_0`, … and a hidden row count; the add/remove buttons can be submit buttons with `name="op"`). Keep the brand styling and the `SubmitButton` pending state.
- Profile ROI poster caption uses `describePlans`: "$17,224 of API-equivalent usage against $1,020.00/mo of plans (5× Claude Max 20x, 1× Claude Pro)". Cards (`/card`, `/badge`) unchanged except they read the summed monthly cost.
- SQL: `plans_monthly_usd(jsonb)` handles both shapes (array of objects with `plan`/`qty`, or a string) and multiplies by qty; `schema.test.sql` gains cases for both shapes and for a mixed provider. `profile_page` returns `plans` in whatever shape is stored plus a `plans_monthly_usd` number so the page never recomputes. Idempotent, re-runnable; do not apply to the live DB (Carter's session applies it).
- `/api/v1/u/{handle}` gains `plans_monthly_usd` and `plans` (normalised new shape).

## Done means

CLI: `npm test` green, `plan add claude pro x2` then `plan list` shows two lines and the summed total, `report --json` shows per-provider monthly. Web: `npm run build`, `npm test`, `npm run lint` green; schema applied twice on a throwaway Postgres with `schema.test.sql` passing; screenshots of the `/me` plans section with two Claude lines at 1280 and 375, light and dark, and the ROI poster caption with mixed plans via a temporary mock (deleted after).
