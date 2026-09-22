<!--
  plans.json: consumer/prosumer monthly prices in USD, per seat, as of 2026-09-22.
  Sources:
  - Anthropic pricing page: Pro, Max 5x, Max 20x, Team Standard, Team Premium
  - OpenAI help centre, "About ChatGPT Pro tiers": Go, Plus, Pro $100, Pro, Business
  - Cursor pricing page: Pro, Pro+, Ultra, Teams
  - Google One AI plans, after the I/O 2026 change: AI Plus, AI Pro, AI Ultra $100, AI Ultra
  Mirrored in apps/web/lib/plans.ts and SQL plan_price_usd() in apps/web/supabase/schema.sql;
  apps/web/lib/plans.test.ts fails if they drift.
-->
# Plan prices

Monthly USD per seat, as set by docs/specs/multi-plans.md.

| provider | plan id | label | USD/mo |
| --- | --- | --- | --- |
| claude | pro | Pro | 20 |
| claude | max-5x | Max 5x | 100 |
| claude | max-20x | Max 20x | 200 |
| claude | team-standard | Team Standard | 25 |
| claude | team-premium | Team Premium | 125 |
| openai | go | Go | 8 |
| openai | plus | Plus | 20 |
| openai | pro-100 | Pro $100 | 100 |
| openai | pro | Pro | 200 |
| openai | business | Business | 25 |
| cursor | pro | Pro | 20 |
| cursor | pro-plus | Pro+ | 60 |
| cursor | ultra | Ultra | 200 |
| cursor | teams | Teams | 40 |
| google | ai-plus | AI Plus | 4.99 |
| google | ai-pro | AI Pro | 19.99 |
| google | ai-ultra-100 | AI Ultra $100 | 99.99 |
| google | ai-ultra | AI Ultra | 199.99 |

Codex is included in ChatGPT Plus, Pro and Business. Any provider may also carry a custom line
(`plan: "custom"`, a label and a monthly amount) for promos and prices this table does not list.
