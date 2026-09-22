---
name: tokenmaxxing
description: Set up tokenmaxxing for the user. Measures their AI coding-agent token usage from local logs (Claude Code, Codex, Gemini CLI), prices it at API list rates, shows the value their subscription delivered, and optionally publishes it to tokenmaxxing.fyi. Use when the user asks to set up tokenmaxxing, see their token usage or subscription ROI, or join the tokenmaxxing leaderboard.
---

# tokenmaxxing

Everything runs locally through `npx tokenmaxxing-cli`. Node 20 or newer is required. The tool has zero dependencies, reads only the log files the user's agents already write, never reads credentials, sends nothing until the user runs `link` and `push`, and never edits the user's tool configuration unless the user explicitly asks for hooks.

## Steps

1. Run the first sync and show the report verbatim:

   ```bash
   npx tokenmaxxing-cli@latest init
   ```

   It detects installed tools, parses their logs (a 30-day history of thousands of sessions takes seconds), and prints a table of tokens and API-equivalent USD per model. Show the user the whole table.

2. Offer to set their subscription plans so the report shows a value multiple. Ask which they have and how many seats of each; do not guess. Providers and plans:

   ```bash
   npx tokenmaxxing-cli plan add claude pro|max-5x|max-20x|team-standard|team-premium [x2]
   npx tokenmaxxing-cli plan add openai go|plus|pro-100|pro|business [x2]
   npx tokenmaxxing-cli plan add cursor pro|pro-plus|ultra|teams [x2]
   npx tokenmaxxing-cli plan add google ai-plus|ai-pro|ai-ultra-100|ai-ultra [x2]
   npx tokenmaxxing-cli plan add openai custom 100 "Codex $100 promo"   # a price not in the list
   npx tokenmaxxing-cli plan list
   npx tokenmaxxing-cli report
   ```

   `plan add` adds a line (several plans from one provider add up); `plan set` replaces a provider's plans; `plan remove <provider> [<plan>]` takes one off.

3. Only if the user wants to publish, link the machine. This is opt-in:

   ```bash
   npx tokenmaxxing-cli link
   ```

   It prints a URL with an 8-character code and polls for five minutes. Tell the user to open the URL, sign in with GitHub, and confirm the device. Do not open the URL yourself unless the user asks.

4. Before the first push, ask how much detail they want to upload. Hourly rows give the most detailed profile; daily or weekly totals mean the site never sees which hours they work:

   ```bash
   npx tokenmaxxing-cli granularity set hour|day|week
   npx tokenmaxxing-cli push
   ```

   `push` prints exactly what it sends (hourly, daily or weekly token counts per model, nothing else) before sending. Their profile is private by default; they choose on the site's Account page whether to appear on the leaderboard.

5. Optional automation, only if the user asks for it, because it edits their tool config or installs a scheduled job:

   ```bash
   npx tokenmaxxing-cli hook install --yes      # Claude Code Stop hook + Codex notify hook that run `sync`
   npx tokenmaxxing-cli schedule install --yes  # launchd / cron every 30 minutes
   ```

## Rules

- Never edit `~/.claude/settings.json`, `~/.codex/config.toml` or any other tool config yourself. The CLI's `hook install` is the only sanctioned way and requires the user's request.
- Never read or print the token stored in `~/.tokenmaxxing/config.json`.
- If `init` reports a model as unpriced, say so plainly; the tool never silently prices a model at zero.
- `npx tokenmaxxing-cli verify` compares Claude totals with `ccusage` when it is installed. Offer it if the user doubts the numbers.
- `npx tokenmaxxing-cli doctor` explains which paths were scanned when a tool seems missing.

## Reference

- Site: https://tokenmaxxing.fyi (markdown twins at /setup.md and /api.md; machine summary at /llms.txt)
- Source: https://github.com/soycarts/tokenmaxxing (MIT)
- Data on disk: `~/.tokenmaxxing/` (`config.json`, `buckets.jsonl`, `cursors.json`); override with `TOKENMAXXING_HOME`.
