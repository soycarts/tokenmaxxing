# tokenmaxxing-cli

Paste this into your coding agent:

```
Set up tokenmaxxing for me: run `npx tokenmaxxing-cli@latest init`, show me the report it prints,
and if I like it run `npx tokenmaxxing-cli link` and open the URL it prints.
Don't edit any of my tool config files unless I say so.
```

`tokenmaxxing` reads the usage logs your AI coding tools already keep on disk (Claude Code, Codex,
Gemini CLI), prices every token at API rates, and tells you what your subscription is worth:

```
tokenmaxxing · last 30 days · 2026-08-23 → 2026-09-22 · pricing snapshot 2026-09-22

SOURCE   MODEL              INPUT   CACHE R   CACHE W   OUTPUT   API-EQUIV
claude   claude-opus-5-5     2.9k    317.5M      8.9M   217.9k     $112.38
codex    gpt-6-astra        24.4M      1.1B         0     2.5M   $1,500.63
──────────────────────────────────────────────────────────────────────────
TOTAL                       24.4M      1.4B      8.9M     2.7M   $1,613.01

Plans:  claude max-20x $200/mo → API-equivalent $112.38   → ROI 0.6×
Unpriced models (0 tokens counted toward $): none
```

The package name is `tokenmaxxing-cli`; the command it installs is `tokenmaxxing`. (The bare
`tokenmaxxing` package on npm is an unrelated project.)

## Privacy

- **Local logs only.** It reads `~/.claude/projects/**/*.jsonl` (or `CLAUDE_CONFIG_DIR`),
  `~/.codex/sessions` + `archived_sessions` (or `CODEX_HOME`) and `~/.gemini/tmp/*/chats/*.json`.
  From those lines it keeps token counts, model names and timestamps; prompts, code, paths and
  project names are never stored.
- **Never touches sign-in data.** No keychain access, no auth or token files of any tool, no provider
  API calls. A test fails the build if the source ever mentions them.
- **No telemetry.** Nothing leaves your machine unless you run `tokenmaxxing push`, which prints exactly
  what it will send (hourly bucket rows: timestamp, source, model, token counts) before sending it.
- **Never edits other tools' configs** unless you run `tokenmaxxing hook install` and confirm the diff.
- **Zero runtime dependencies.** Pricing is a bundled snapshot of LiteLLM + models.dev; unknown models
  are listed as *unpriced*, never silently counted as $0.

Everything it writes lives in `~/.tokenmaxxing/` (override with `TOKENMAXXING_HOME`):
`config.json`, `buckets.jsonl` (one row per hour × source × model) and `cursors.json` (per-file read
offsets so each `sync` only reads what's new).

## Commands

```
tokenmaxxing init                          detect tools, write config, first sync, print report
tokenmaxxing sync [--quiet]                incremental parse of all detected sources
tokenmaxxing report [--since 7d|30d|YYYY-MM-DD] [--json] [--by model|source|day]
tokenmaxxing plan set <provider> <plan>    claude: pro | max-5x | max-20x
                                           openai: plus | pro          (ChatGPT plans that include Codex)
                                           cursor: pro | pro-plus | ultra
                                           google: ai-pro | ai-ultra-100 | ai-ultra
tokenmaxxing plan list
tokenmaxxing verify [--since 30d]          compare Claude totals with `ccusage` (if installed), 1% tolerance
tokenmaxxing link [--site URL]             prints a sign-in URL, waits for the site, stores the token
tokenmaxxing push [--site URL] [--dry-run] [--all] [--granularity hour|day|week]
                                           upload bucket rows (opt-in); prints what is sent
tokenmaxxing granularity [set hour|day|week]  hour (default) uploads hourly rows; day or week uploads
                                           totals only, so the site never sees which hours you work
tokenmaxxing hook install|uninstall|status [--yes]      Claude Code Stop hook + Codex notify hook running `sync`
tokenmaxxing schedule install|uninstall|status [--yes]  launchd (macOS) / cron (Linux), every 30 min
tokenmaxxing doctor                        paths found, files scanned, cursor state, pricing snapshot date
tokenmaxxing --version
```

ROI = API-equivalent cost for the period ÷ (plan price × days ÷ 30.4375).

Notes:

- Cursor is detected but excluded from totals: its local database has no token counts.
- `verify` groups by local calendar day because that is how `ccusage` groups. It checks input and cache tokens
  at 1%; output is informational and expected higher, because ccusage counts only the first line of a message
  that Claude Code writes as several lines, while tokenmaxxing counts its final usage. Costs differ from ccusage
  by design: ccusage prices every cache write at the 5-minute rate; tokenmaxxing prices 1-hour cache
  writes at the 1-hour rate.
- `--site` (or `TOKENMAXXING_SITE`) points `link`/`push` at another server, e.g. `http://localhost:3000`.
- Changing granularity (or `push --all`) tells the site to replace every row it holds for this device, so
  switching between hourly and daily totals never double counts. The current day or week is resent on each
  push until it is complete.
- Custom prices: `src/pricing/overrides.json` in a checkout (`{ "<model>": { "input": 3, "output": 15,
  "cache_read": 0.3, "cache_write_5m": 3.75, "cache_write_1h": 6 } }`, USD per million tokens) wins over
  the snapshots; `{ "<model>": { "unpriced": "<note>" } }` keeps a model unpriced and shows the note (used for
  Codex's bundled `codex-auto-review` and `gpt-reserve`, which have no list price).

MIT licensed.
