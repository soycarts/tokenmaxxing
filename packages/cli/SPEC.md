# tokenmaxxing-cli — SPEC (binding)

npm package `tokenmaxxing-cli`, bin `tokenmaxxing`. Run as `npx tokenmaxxing-cli@latest <cmd>`.
(The bare `tokenmaxxing` npm name is taken by an unrelated account-switcher; never depend on it.)

## Non-negotiables

- **Zero runtime dependencies.** Node ≥ 20. TypeScript source in `src/`, compiled by `tsc` to `dist/` (ESM). Only devDependencies: `typescript`, `@types/node`.
- **Never reads credentials.** No Keychain, no `~/.claude/.credentials.json`, no `~/.codex/auth.json`, no `state.vscdb`, no JWTs, no provider API calls. A test greps `src/` for `Keychain|credentials|auth.json|state.vscdb|accessToken|api2.cursor|cursor.com` and fails on any hit.
- **Never edits another tool's config** unless the user runs `tokenmaxxing hook install` explicitly.
- **No telemetry.** The only network call is `push` (opt-in) and it is printed before it happens.
- **Never silently price at $0.** Unknown models are reported as `unpriced` and listed.
- Every parser is one file under `src/parsers/` with fixture-based tests under `test/`. Fixtures are redacted copies of real logs (see "Fixtures").

## Commands

```
tokenmaxxing init                # detect tools, write ~/.tokenmaxxing/config.json, run first sync, print report
tokenmaxxing sync                # incremental parse of all detected sources → buckets
tokenmaxxing report [--since 7d|30d|YYYY-MM-DD] [--json] [--by model|source|day]
tokenmaxxing plan set <provider> <plan>   # e.g. plan set claude max-20x ; plan set openai pro ; plan set cursor ultra
tokenmaxxing plan list
tokenmaxxing verify [--since 30d]         # compare Claude totals with `ccusage` if installed
tokenmaxxing link                         # prints URL; user opens it and signs in; CLI polls; stores token
tokenmaxxing push                         # upload bucket rows (opt-in); prints exactly what is sent
tokenmaxxing hook install|uninstall|status # OPT-IN Claude Code Stop hook + Codex notify hook that runs `sync`
tokenmaxxing schedule install|uninstall|status   # launchd (mac) / cron (linux) every 30 min running `sync`
tokenmaxxing doctor                       # paths found, files scanned, cursor state, pricing snapshot date
tokenmaxxing --version
```

`init` is the only thing the onboarding prompt needs. It must finish in one command with no questions, and end by printing the report and the one-liner `Next: tokenmaxxing plan set <provider> <plan>  (for ROI)  ·  tokenmaxxing link  (to publish)`.

## Storage (`~/.tokenmaxxing/`, override with `TOKENMAXXING_HOME`)

- `config.json` — `{ version, deviceId (uuid v4, generated once), sources: {claude:{enabled,paths:[]},codex:{...},gemini:{...},cursor:{...}}, plans: {claude:"max-20x",...}, site: {url:"https://tokenmaxxing.fyi", token?:string, handle?:string} }`
- `buckets.jsonl` — append-only rows, one per (hour, source, model). Row schema:
  ```
  { "v":1, "ts":"2026-09-22T13:00:00Z", "source":"claude|codex|gemini|cursor", "model":"claude-opus-5-5",
    "input":0, "cache_read":0, "cache_write_5m":0, "cache_write_1h":0, "output":0, "reasoning":0,
    "requests":0, "conversations":0 }
  ```
  `sync` recomputes affected hours and appends a **replacement** row; the reader keeps the last row per key (ts,source,model). Periodically compact (rewrite keeping last per key) when file > 5MB (and it holds superseded rows). A `sync.lock` file (stale after 10 min) keeps concurrent hook/schedule syncs from double-counting.
- `cursors.json` — per source: per-file `{ size, mtimeMs, offset }` plus dedup sets (bounded, see parsers).
- `cache/` — nothing in v1 (pricing is bundled).

## Parsers

Each exports `parse(ctx): Promise<Bucket[]>` where ctx gives paths, cursors, and a `dedup` set. All parse incrementally from the stored byte offset; if a file shrank, reparse from 0. Unknown/garbled JSON lines are skipped and counted in doctor output.

### claude (`src/parsers/claude.ts`)
- Roots: `CLAUDE_CONFIG_DIR` (comma-separated, each must contain `projects/`), else `~/.config/claude`, `~/.claude`. Files: `projects/**/*.jsonl` including `**/subagents/*.jsonl`.
- Usage lines: `type=="assistant"` with `message.usage`. Confirmed real shape:
  ```
  top: cwd, isSidechain, message, parentUuid, requestId, sessionId, timestamp, type, uuid, version
  message: id, model, role, usage:{ input_tokens, output_tokens, cache_creation_input_tokens, cache_read_input_tokens,
           cache_creation:{ ephemeral_5m_input_tokens, ephemeral_1h_input_tokens }, service_tier, speed, iterations:[...] }
  ```
- Map: input←input_tokens, cache_read←cache_read_input_tokens, cache_write_5m←cache_creation.ephemeral_5m_input_tokens, cache_write_1h←cache_creation.ephemeral_1h_input_tokens. If `cache_creation` absent, cache_write_5m←cache_creation_input_tokens. If `cache_creation` is present but 5m+1h ≠ `cache_creation_input_tokens` (seen on model-fallback responses, where the split describes the first iteration and the totals the last), `cache_creation_input_tokens` is the total and the split's 5m/1h ratio is applied to it (keeps token totals equal to ccusage). output←output_tokens. reasoning←0 (Claude does not report it separately; do NOT subtract). requests←1.
- Skip lines where `message.model` is `<synthetic>` or missing, or usage is all zeros.
- **Dedup key** = `${message.id}:${requestId ?? ''}` (ccusage rule). Keep a bounded Set (last 200k keys, LRU by insertion) in `cursors.json`. Same message.id appearing in a subagent file AND the parent counts once.
- conversations: count `type=="user"` lines whose `message.content` is a string or contains a text block, deduped by `uuid` (bounded 200k set in `cursors.json`), excluding files under `/subagents/`. Each is attributed to the model of the next assistant usage line in the same file (held in the file cursor until one arrives).
- Hour bucket from `timestamp` (UTC, floor to hour).

### codex (`src/parsers/codex.ts`)
- Root: `${CODEX_HOME:-~/.codex}`. Files: `sessions/**/rollout-*.jsonl` and `archived_sessions/rollout-*.jsonl`. File cursors are keyed by basename (rollout names embed the session uuid), so a session moved from `sessions/` to `archived_sessions/` is not re-read; the fallback path's last cumulative total, the current model and the last `root_turn_id` are stored in the file cursor.
- Model attribution: track the latest `turn_context.payload.model` seen in the file (e.g. `gpt-6-astra`, `gpt-5.1-codex-max`); attribute subsequent usage to it. If none yet, use `session_meta.payload.model` if present, else `"unknown-codex"`.
- **Primary**: `type=="token_usage_record"` lines (present in 2026 logs). `payload.usage` = per-response delta: `{input_tokens, cached_input_tokens, cache_write_input_tokens, output_tokens, reasoning_output_tokens, total_tokens}`. Dedup by `payload.response_id`. Note `input_tokens` INCLUDES `cached_input_tokens` (see real sample: input 50414, cached 37760). So: input←input_tokens − cached_input_tokens; cache_read←cached_input_tokens; cache_write_5m←cache_write_input_tokens; output←output_tokens (already includes reasoning); reasoning←reasoning_output_tokens (informational, NOT priced separately).
- **Fallback** (older logs with no `token_usage_record`): `type=="event_msg"`, `payload.type=="token_count"`, `payload.info.total_token_usage` is cumulative per session → emit delta vs previous cumulative for that file; ignore lines with `info: null`. Same field mapping. Never use both paths for the same file: if a file has any `token_usage_record`, ignore its `token_count` events.
- Hour bucket from top-level `timestamp`.
- conversations: count `turn_context` lines with a new `root_turn_id` (2025 logs have none, so they report 0).

### gemini (`src/parsers/gemini.ts`) — best effort, no local data on dev machine
- Files: `~/.gemini/tmp/*/chats/*.json`. Each file: `{ messages:[{ role, tokens:{input,cached,output,tool,thoughts}, timestamp?, model? }] }`.
- Map: input←input − cached, cache_read←cached, output←output + tool + thoughts, reasoning←thoughts (informational; thoughts are priced as output). Dedup per file by message index (store count parsed per file). Model from message.model else `"gemini-unknown"`. `role` falls back to `type` (the real Gemini CLI writes `type: "user"|"gemini"`); message timestamp falls back to the file's `lastUpdated`/`startTime`, then mtime.
- If the directory is missing, the source is simply disabled by `init`.

### cursor (`src/parsers/cursor.ts`) — activity only, no tokens
- `~/.cursor/ai-tracking/ai-code-tracking.db` has no token counts (verified). v1 reads nothing from it; `init` reports Cursor as "detected — token counts not available locally; Cursor is excluded from totals". Leave the file and a TODO. Do not add a sqlite dependency.

## Pricing (`src/pricing/`)

- Bundled snapshots: `litellm.snapshot.json` (trimmed, ~419 entries, has `cache_creation_input_token_cost_above_1hr`) and `modelsdev.snapshot.json` (`{openai|anthropic|google:{models:{id:{cost:{input,output,cache_read,cache_write}}}}}`, per-million USD). Both already in the repo. Add `overrides.json` (empty object initially) and `SNAPSHOT_DATE` constant = 2026-09-22.
- `resolve(model): Rates | null` → `{ input, cache_read, cache_write_5m, cache_write_1h, output }` in USD per token. Order: overrides → LiteLLM exact → models.dev exact (across providers) → normalised match (lowercase; strip date suffix `-20250101`; try `claude-opus-5-5` ↔ `claude-opus-5.5`; strip provider prefix) → null.
- LiteLLM mapping: input←input_cost_per_token, cache_read←cache_read_input_token_cost ?? input, cache_write_5m←cache_creation_input_token_cost ?? input, cache_write_1h←cache_creation_input_token_cost_above_1hr ?? cache_write_5m, output←output_cost_per_token.
- `overrides.json`: `{ "<model>": { input, output, cache_read?, cache_write_5m?, cache_write_1h? } }` in USD per **million** tokens; missing cache fields fall back as for models.dev. models.dev: divide by 1e6; cache_write_1h = cache_write × 1.6 for anthropic (matches Anthropic's published 1h premium), = cache_write otherwise; missing cache_read → input; missing cache_write → input.
- `cost(bucket, rates)` = Σ tokens×rate over input, cache_read, cache_write_5m, cache_write_1h, output. Reasoning is never priced separately (Codex and Claude include it in output; Gemini's `thoughts` are added to output by the parser).
- Sanity test: for `claude-fable-5-1` with tokens (input 21721, output 513976, cache_write_5m 3570946, cache_read 221663704) cost must equal 125.97 ± 0.01 (matches ccusage). Same tokens with cache_write_1h instead of 5m must be higher.
- `scripts/update-pricing.mjs` re-fetches both upstreams into the snapshots (used by a GitHub Action later, not at runtime).

## Plans (`src/plans.json`)

```
claude:  pro 20, max-5x 100, max-20x 200
openai:  plus 20, pro 200          (ChatGPT plans that include Codex)
cursor:  pro 20, pro-plus 60, ultra 200
google:  ai-pro 19.99, ai-ultra-100 100, ai-ultra 200
```
Provider ↔ source: claude→claude, openai→codex, cursor→cursor, google→gemini.
ROI for a period = api_equivalent_cost(source, period) ÷ (plan_price × period_days ÷ 30.4375). Report shows `ROI 12.3×` per configured provider and a total line.

## Report format (`report`, default `--since 30d`)

`--since Nd` starts at local midnight N days before today and runs to now (so `30d` on 2026-09-22 shows 2026-08-23 → 2026-09-22, like `ccusage --since 20260823`); ROI uses N days. `--since YYYY-MM-DD` starts at that local midnight.

```
tokenmaxxing · last 30 days · 2026-08-23 → 2026-09-22 · pricing snapshot 2026-09-22

SOURCE   MODEL               INPUT     CACHE R     CACHE W    OUTPUT     API-EQUIV
claude   claude-opus-5-5      2.9k     317.5M       8.9M     217.9k      $112.38
claude   claude-fable-5-1     3.8k      37.5M     414.0k     151.0k       $22.14
codex    gpt-6-astra         ...
──────────────────────────────────────────────────────────────────────────────
TOTAL                                                                  $4,476.25

Plans:  claude max-20x $200/mo → API-equivalent $4,3xx → ROI 21.8×
        openai pro $200/mo    → API-equivalent $1xx   → ROI 0.7×
Unpriced models (0 tokens counted toward $): none
```
Numbers formatted with k/M/B; `--json` emits `{ period, rows:[...], totals, plans:[...], unpriced:[...] }`.

## verify

If `ccusage` is on PATH: run `ccusage daily --since YYYYMMDD --json`, then `sync`, and compare per-model input/output/cacheCreation/cacheRead totals with our claude buckets over the same **local** calendar days (ccusage 15.x groups by local date and has no timezone flag; hourly buckets map exactly onto local days in whole-hour time zones), print a table with deltas and a pass/fail at 1% tolerance on tokens. Cost will differ (ccusage prices all cache writes at the 5m rate); print both and say why. If ccusage is missing, say how to install it and exit 0.

## link / push

- `{site}` = `--site URL` flag > `TOKENMAXXING_SITE` env > `config.site.url` (default `https://tokenmaxxing.fyi`). Connection errors and 404s are reported as one-line errors (exit 1), never stack traces.
- `link`: generate 8-char code, print `Open {site}/link?code=XXXX and sign in`, then poll `GET {site}/api/v1/link/{code}` every 3s for up to 5 min (202/204 or a body without `token` = keep polling); on `{ token, handle }` store both in config together with the `site.url` used. (Site side is built separately; stub the poll with a clear error if 404.)
- `push`: send `POST {site}/api/v1/push` with header `Authorization: Bearer <token>` and body `{ v:1, deviceId, rows:[bucket rows since last pushed ts, ≤ 5000 per request] }`. "Since" is `ts >= lastPushedTs`, so the last pushed hour is re-sent (its row may have been replaced since; the site upserts by (deviceId, ts, source, model)). Print the row count, the date range, the envelope, the row fields and the first row before sending; `--dry-run` prints every request body and sends nothing. Store `lastPushedTs` in config at `site.lastPushedTs` after each successful request. Never send paths, project names, prompts, or anything besides bucket rows (rows are rebuilt from a key whitelist).

## hook install (opt-in)

- Claude Code: add to `~/.claude/settings.json` → `hooks.Stop` an entry `{ "matcher": "", "hooks":[{ "type":"command", "command":"npx -y tokenmaxxing-cli sync --quiet" }] }` only if not already present; keep a backup `settings.json.tokenmaxxing.bak`. `uninstall` removes exactly that entry.
- Codex: append `notify = ["npx","-y","tokenmaxxing-cli","sync","--quiet"]` to `~/.codex/config.toml` only if no `notify` key exists; otherwise print instructions instead of editing.
- Print the exact diff before writing and require `--yes` or an interactive `y` (non-interactive without `--yes` changes nothing and exits 1). The Codex `notify` line is inserted before the first `[table]` so it stays a top-level TOML key; `sync` ignores the JSON argument Codex appends. `schedule install` follows the same confirm rule.

## Fixtures

Create `test/fixtures/claude/session.jsonl` (≈30 lines), `test/fixtures/claude/subagents/agent-x.jsonl` (with one duplicated message.id from the parent), `test/fixtures/codex/rollout-2026.jsonl` (token_usage_record path, ≥3 records, 2 turn_contexts with different models, 1 duplicate response_id), `test/fixtures/codex/rollout-2025.jsonl` (token_count path, cumulative, includes an `info:null` line), `test/fixtures/gemini/chats/x.json`. Build them from the real files at `~/.claude/projects/-Users-carter-dev/21eedb53-eff7-42d3-83f1-cbfc1b4408bf.jsonl`, the newest `~/.codex/sessions/2026/09/21/rollout-*.jsonl`, and `~/.codex/archived_sessions/rollout-2025-12-16T21-33-31-*.jsonl`, **replacing all message/tool content, cwd, git branch and file paths with placeholders**. Tests use `node --test` via `npm test`. Expected numbers in tests are hand-computed from the fixture.

## Done means

- `npm run build && npm test` green.
- `node dist/cli.js init` on this machine finishes < 60s over 6.4k Claude files + Codex, prints a report whose Claude totals `verify` confirms within 1% of ccusage for the last 30 days.
- `npm pack` produces a tarball < 1.5MB with no deps.
- README.md in the package: the onboarding prompt at the top, privacy statement, commands.
