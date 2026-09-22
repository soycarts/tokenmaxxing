# API price tracking

Every dollar tokenmaxxing shows is tokens × a list price, so stale prices mean wrong numbers everywhere. Vendors change prices without warning. This page covers where prices come from, how they reach the CLI and the site, and what to do when a vendor moves first.

## How prices flow

```
LiteLLM model_prices_and_context_window.json ─┐
models.dev api.json ──────────────────────────┤  packages/cli/scripts/update-pricing.mjs
                                              ▼
packages/cli/src/pricing/{litellm,modelsdev}.snapshot.json  +  overrides.json  +  SNAPSHOT_DATE (index.ts)
        │                                              │
        │ npm publish (bundled, no runtime fetch)       │ apps/web/scripts/seed-prices.mjs
        ▼                                              ▼
CLI resolve(): overrides → LiteLLM → models.dev   apps/web/supabase/seed_prices.sql (idempotent upsert)
  → normalised match → unpriced                        │ .github/workflows/pricing-apply.yml, on push to main
                                                       ▼
                                                 live Supabase public.model_prices (the site prices every bucket from it)
```

1. **Upstream.** [LiteLLM](https://github.com/BerriAI/litellm/blob/main/model_prices_and_context_window.json) is the main source, including Anthropic's 1h cache-write rate. [models.dev](https://models.dev) fills in ids LiteLLM doesn't list. Both are community-maintained and usually pick up a vendor change within hours to days.
2. **Snapshots.** `update-pricing.mjs` fetches both and trims them: LiteLLM down to the providers the parsers can emit ids for, keeping only `*_cost*` fields plus limits, and models.dev down to openai/anthropic/google `cost` + `name`. An in-scope model that upstream deletes (LiteLLM removes retired models) keeps its last price with `retained_since`, so old usage stays priced. `SNAPSHOT_DATE` changes only when a snapshot file changes.
3. **CLI bundle.** The snapshots ship inside the npm package, and the CLI never fetches prices. Users get new prices when they upgrade (`npx tokenmaxxing-cli@latest`), so a price change has to be merged **and published** before it reaches them.
4. **Seed SQL.** `seed-prices.mjs` resolves the same tables with the same precedence into `seed_prices.sql`, with one row per id plus a normalised-alias row per `model_key`.
5. **Live DB.** When `seed_prices.sql` changes on `main`, `pricing-apply.yml` POSTs it to the Supabase Management API. The site computes cost at query time from `model_prices`, so it follows the new price right away. Rows are upserted and never deleted, except ids pinned `unpriced`.

A model that upstream lists at $0 input and $0 output is treated as **unpriced**, not free. The CLI reports it with the note `listed at $0 upstream`; the seed emits no row, and deletes any stale one, so the site counts its tokens as `unpriced_tokens`. If another entry for the same normalised model has a real price, that price is used; an override with a real price always wins.

Both the CLI and the site price **all** history at the current list price. A price cut therefore lowers everyone's past API-equivalent too. That is intended: the number answers "what would this usage cost at today's API prices".

### Commands

| Command | What it does |
| --- | --- |
| `npm run pricing:refresh` | fetch upstream → snapshots (bumps `SNAPSHOT_DATE` only on change) → regenerate `seed_prices.sql` |
| `npm run pricing:check` | exit 1 if upstream differs from the snapshots or the seed is stale; writes nothing |
| `npm run pricing:diff` | markdown table of effective rate changes, HEAD vs working tree |
| `node packages/cli/scripts/pricing-diff.mjs <base> [<head>]` | same, between any two git refs or directories; `--fail-on-change` exits 1 on any change |
| `node packages/cli/scripts/update-pricing.mjs --out /tmp/fresh` | fetch upstream into a scratch dir; then `pricing-diff.mjs HEAD /tmp/fresh` previews a refresh without touching the tree |

`pricing-diff.mjs` compares only ids the parsers can emit (`claude-*`, `gpt-*`, `chatgpt-*`, `codex-*`, `o1`…`o9*`, `gemini-*`, un-prefixed). It also covers the normalised alias rows that price dated or prefixed ids (source `alias of <id>`): if a different entry wins an alias, users pay a different price, the same as if the rate itself had changed.

## The daily PR

`.github/workflows/pricing.yml` runs at 06:00 UTC every day, and on demand from Actions → pricing → Run workflow. When the refresh changes the tree, it opens or updates one PR from branch `pricing/auto`, titled `pricing: snapshot YYYY-MM-DD`. The PR body is the `pricing-diff.mjs` output:

```markdown
## API price changes

Base **HEAD** (SNAPSHOT_DATE 2026-09-22) → head **working tree** (SNAPSHOT_DATE 2026-09-23). USD per million tokens; …

**1 changed, 0 added, 0 removed** (1 rows after collapsing aliases).

### Changed

| Model | Input | Cache read | Cache write 5m | Cache write 1h | Output | Source |
| --- | --- | --- | --- | --- | --- | --- |
| `gpt-6-astra` <sub>(also `gpt-6-astra-2026-08-01`)</sub> | $10.00 → **$5.00** (−50%) | $1.00 → **$0.50** (−50%) | $12.50 → **$6.25** (−50%) | $12.50 → **$6.25** (−50%) | $50.00 → **$25.00** (−50%) | litellm |

### Overrides in overrides.json

| Model | Override | Upstream alone | Status | Added | Source |
| --- | --- | --- | --- | --- | --- |
| `gpt-6-astra` | $5.00 / $25.00 | $5.00 / $25.00 | **upstream matches: delete the override** | 2026-09-22 | [link](…) |

---
Tests on the refreshed snapshots: packages/cli **success**, apps/web **success** (run).
```

(The table above is illustrative.) The workflow also runs the cli and web test suites on the refreshed snapshots and posts a `pricing / tests` commit status on the PR head. The price tests check the pricing *math* against a fixed inline rate table (the `claude-fable-5-1` = $125.97 ccusage fixture), so a real price change never fails them. What they do catch is a structural break, such as a snapshot that lost the 1h cache field. PRs opened with the default `GITHUB_TOKEN` do not trigger `ci.yml`. Set the optional `PRICING_PR_TOKEN` secret (docs/LAUNCH.md) if you want full CI on the PR as well.

Before merging:

1. Read the Changed rows. Each one should match a vendor announcement or pricing page (checklist below). A big jump with no announcement is usually upstream data churn. Common causes: a provider entry with missing cache rates winning an alias, or a model deleted upstream. Fix `update-pricing.mjs` instead of merging.
2. Removed rows should be embeddings or other models the parsers never see. Retired chat models are retained automatically.
3. Delete any override flagged **upstream matches** in the same PR.
4. Merge. `pricing-apply.yml` updates the live DB within a minute. Then publish the CLI (`cd packages/cli && npm version patch && npm publish`) so users get the new snapshot.

`ci.yml` also runs `npm run pricing:check` on every push and PR as a non-blocking job. It shows a "Pricing snapshots are stale" warning when upstream has moved and the daily PR hasn't been merged yet.

## When a vendor announces a change before upstream catches up

Use `packages/cli/src/pricing/overrides.json`. Overrides beat LiteLLM and models.dev in both the CLI and the seed. The rules (enforced by `packages/cli/test/pricing.test.mjs`):

- Rates are USD per **million** tokens: `input` and `output` are required; `cache_read`, `cache_write_5m` and `cache_write_1h` are optional.
- A missing cache field falls back to `input`, and `cache_write_1h` falls back to `cache_write_5m`. **Write every cache rate the vendor publishes explicitly**, or cache reads get priced at the full input rate.
- `source` (the vendor's https pricing page or announcement) and `added` (YYYY-MM-DD) are required. Never add a price you cannot link to.
- The key must be the exact id the logs contain. A dated id that has its own LiteLLM entry (e.g. `gpt-5.4-2026-03-05`) resolves before the undated override, so add one override per id. The `(also …)` list in the diff's row shows every variant.
- Bump `SNAPSHOT_DATE` in `packages/cli/src/pricing/index.ts` to today by hand. `update-pricing.mjs` bumps it only when a snapshot file changes, and users read it as the prices' as-of date.

### Worked example: an OpenAI price cut

Say OpenAI announces on 2026-09-22 that `gpt-6-astra` drops from $10 / $50 to $5 / $25 per million input/output tokens, with cached input at $0.50. *These numbers are only an illustration. Always copy the real ones from the announcement.*

1. Check what we charge today and which ids exist:
   ```bash
   node -e 'const l=require("./packages/cli/src/pricing/litellm.snapshot.json");for(const k of Object.keys(l))if(/^gpt-6-astra/.test(k))console.log(k,l[k])'
   ```
2. Add one entry per id to `overrides.json`, keeping the existing `unpriced` pins:
   ```json
   {
     "codex-auto-review": { "unpriced": "bundled reviewer, no list price" },
     "gpt-reserve": { "unpriced": "bundled with Codex, no list price" },
     "gpt-6-astra": {
       "input": 5, "cache_read": 0.5, "cache_write_5m": 6.25, "cache_write_1h": 6.25, "output": 25,
       "source": "https://openai.com/api/pricing/", "added": "2026-09-22"
     }
   }
   ```
   Copy every rate the vendor publishes. The bundled LiteLLM entry prices this model's cache writes at 1.25× input, so the example keeps that ratio. If a vendor lists no cache-write price, set both write rates to `input`, which is what LiteLLM's missing-field fallback does.
3. Set `export const SNAPSHOT_DATE = '2026-09-22';` in `packages/cli/src/pricing/index.ts`.
4. Regenerate, review, test:
   ```bash
   node apps/web/scripts/seed-prices.mjs   # or: npm run pricing:refresh (also pulls upstream)
   npm run pricing:diff                    # expect: gpt-6-astra $10.00 → $5.00 (−50%) … litellm → override
   npm test
   ```
5. Commit `cli: gpt-6-astra override for OpenAI's 2026-09-22 price cut` (overrides.json + index.ts) and `web: regenerate seed_prices.sql`. Push to main to update the live DB, then publish the CLI.
6. When LiteLLM catches up, the daily PR's Overrides table marks `gpt-6-astra` **upstream matches: delete the override**. Delete it in that PR.

To pin a model with no public list price (bundled or internal models), use `{ "unpriced": "<why>" }` instead. It is never priced, not even through a fuzzy match, and the note shows in the report.

## How users see freshness

`SNAPSHOT_DATE` is the date the bundled prices last changed. The CLI shows it:

- in every report header: `tokenmaxxing · last 30 days · 2026-08-23 → 2026-09-22 · pricing snapshot 2026-09-22`
- in `tokenmaxxing doctor`: `pricing:  bundled snapshot 2026-09-22 (LiteLLM + models.dev, overrides.json)`
- in `--json` output as `pricing_snapshot`

The seed writes the same date into every `model_prices.snapshot_date`, so the site can show the as-of date of the prices it uses. The date only moves when prices actually change, so an old date on a recent CLI version means the prices really haven't moved since then.

## Research checklist (for a scheduled agent or a human)

Run this after a vendor announcement, or weekly. A scheduled agent should run it in order and open a PR (never push to main) for anything it finds.

1. `npm run pricing:check`. If upstream moved, run `npm run pricing:refresh && npm run pricing:diff` and use that table as the PR body.
2. Check each vendor's pricing page against `npm run pricing:diff` for the ids users actually run (the leaderboard's top models):
   - **OpenAI**: https://openai.com/api/pricing/ and https://platform.openai.com/docs/pricing; announcements at https://openai.com/news/ and https://platform.openai.com/docs/changelog
   - **Anthropic**: https://platform.claude.com/docs/en/about-claude/pricing (the page LiteLLM cites; lists 5m and 1h cache writes); announcements at https://www.anthropic.com/news
   - **Google AI (Gemini API)**: https://ai.google.dev/gemini-api/docs/pricing and https://ai.google.dev/gemini-api/docs/changelog; Vertex: https://cloud.google.com/vertex-ai/generative-ai/pricing
3. Check whether upstream already has the change in flight, and prefer waiting a day over adding an override if a fix is about to merge:
   - **LiteLLM**: commits to https://github.com/BerriAI/litellm/commits/main/model_prices_and_context_window.json and open PRs at https://github.com/BerriAI/litellm/pulls?q=is%3Apr+is%3Aopen+pricing
   - **models.dev**: https://github.com/sst/models.dev (per-model TOML under `providers/<provider>/models/`) and its open PRs
4. If a vendor price is live and upstream has neither the change nor an open PR, add an override as above, citing the vendor URL. Optionally open an upstream PR to LiteLLM or models.dev so the override can be deleted sooner.
5. Never guess a price. If a page is ambiguous (tiers, regional premiums, batch vs standard), use the standard, non-batch, global rate for prompts at or below the smallest context tier, and say so in the PR.
