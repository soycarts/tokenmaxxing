/** What /setup shows, shared with its markdown twin /setup.md so the two never drift. */

export const UPLOADED: [field: string, example: string, what: string][] = [
  ["ts", "2026-09-22T13:00:00Z", "The start of the period: the hour, rounded down, or 00:00 UTC for daily and Monday 00:00 UTC for weekly totals. Nothing finer."],
  ["source", "claude", "Which tool: claude, codex, gemini or cursor."],
  ["model", "claude-opus-5-5", "The model id the tool logged."],
  ["input, output", "2912, 217904", "Token counts for that period and model."],
  ["cache_read, cache_write_5m, cache_write_1h", "317502113, 8902114, 0", "Cache token counts, priced separately."],
  ["reasoning", "0", "Reasoning tokens, informational (already inside output)."],
  ["requests, conversations", "412, 6", "How many API calls and chats in that period."],
  ["deviceId", "a random uuid", "Generated once on your machine, so two laptops don't overwrite each other."],
  ["granularity", "hour", "hour, day or week: how coarse the rows are. You choose it; see below."],
];

export const GRANULARITY_COMMAND = "npx tokenmaxxing-cli granularity set hour|day|week";

export const GRANULARITY_TEXT =
  "Hourly rows (the default) give your profile the most detail. Daily or weekly totals mean the site never sees which hours you work, at the cost of that detail. Changing it replaces every row the site holds for that device on the next push, so nothing is counted twice.";

export const LINK_COMMAND = "npx tokenmaxxing-cli link";
export const PUSH_COMMAND = "npx tokenmaxxing-cli push";
export const PLAN_COMMAND = "npx tokenmaxxing-cli plan set claude max-20x";
