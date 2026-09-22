/**
 * Everything the site says to agents: /llms.txt, /setup.md, /api.md, /.well-known/agent.json,
 * and the markdown twins of /, /leaderboard and /u/{handle}. Pure functions of their inputs,
 * so they are unit-tested and the pages' own data drives the tables.
 */
import { INSTALL_COMMAND, ONBOARDING_PROMPT, PRIVACY_LINE } from "./copy";
import type { LeaderboardRow, ProfilePage } from "./data";
import { formatPct, formatRoi, formatTokens, formatUsd, roiOf } from "./format";
import { PERIOD_LABEL, type Metric, type Period } from "./periods";
import { GRANULARITY_COMMAND, GRANULARITY_TEXT, LINK_COMMAND, PLAN_COMMAND, PUSH_COMMAND, UPLOADED } from "./setup-content";
import type { Sponsor } from "./sponsors";

export const MARKDOWN_TYPE = "text/markdown; charset=utf-8";
export const STATIC_DOC_CACHE = "public, s-maxage=3600";

export const SITE_DESCRIPTION =
  "tokenmaxxing measures AI coding-agent token usage from local logs (Claude Code, Codex, Gemini CLI), prices it at API list rates, and shows how much value a subscription delivered. Publishing to the public leaderboard is optional.";

/** Escapes a table cell: pipes and newlines would break the row. */
export function cell(v: unknown): string {
  return String(v ?? "").replace(/\|/g, "\\|").replace(/\s*\n\s*/g, " ");
}

function table(head: string[], rows: unknown[][]): string {
  return [`| ${head.join(" | ")} |`, `| ${head.map((h, i) => (i === 0 ? "---" : /^(#|Value|Tokens|ROI|Output|Cache|Multiple|At API)/.test(h) ? "---:" : "---")).join(" | ")} |`, ...rows.map((r) => `| ${r.map(cell).join(" | ")} |`)].join("\n");
}

const fence = (s: string, lang = "") => `\`\`\`${lang}\n${s}\n\`\`\``;

export function llmsTxt(base: string): string {
  return `# tokenmaxxing

> ${SITE_DESCRIPTION}

Everything runs locally through \`npx tokenmaxxing-cli\` (Node 20+, zero dependencies). It reads only the log files the user's agents already write, never reads credentials, uploads nothing until the user runs \`link\` and \`push\`, and never edits tool configuration unless the user asks for hooks.

## Set up a user (paste-ready prompt)

${fence(ONBOARDING_PROMPT)}

## Install commands

${fence([INSTALL_COMMAND, "npx tokenmaxxing-cli plan set <provider> <plan>   # optional; ask which plans the user has", LINK_COMMAND, GRANULARITY_COMMAND, PUSH_COMMAND].join("\n"), "bash")}

Show the user the report \`init\` prints. Ask before setting plans (never guess), before linking, before choosing a granularity, and before pushing. Do not open the link URL yourself unless asked.

## Docs

- [Agent skill](${base}/skill.md): the full procedure and rules, as a SKILL.md
- [Setup](${base}/setup.md): what gets uploaded, granularity, hooks, uninstall
- [API](${base}/api.md): every public endpoint, badges, cards and embeds
- [Privacy policy](${base}/privacy)
- [Terms](${base}/terms)

Pages also answer in markdown: send \`Accept: text/markdown\` or add \`?format=md\` to ${base}/, /setup, /leaderboard, /u/{handle}, /privacy and /terms.
`;
}

export function agentJson(base: string) {
  return {
    name: "tokenmaxxing",
    description: SITE_DESCRIPTION,
    url: base,
    prompt: ONBOARDING_PROMPT,
    install: INSTALL_COMMAND,
    skill_url: `${base}/skill.md`,
    api_docs_url: `${base}/api.md`,
    llms_txt_url: `${base}/llms.txt`,
    setup_url: `${base}/setup.md`,
  };
}

export function homeMarkdown(base: string): string {
  return `# How much did your AI subscription actually deliver?

Paste one prompt into your coding agent. It installs a tiny local tracker, reads your agent logs, and prices your usage at API list rates. Subscribers usually find out they're getting a very good deal.

${fence(ONBOARDING_PROMPT)}

Works in Claude Code, Codex, Gemini CLI or any agent that can run a shell command.

## How it works

1. **Paste the prompt.** Your agent runs one npx command. It finds Claude Code, Codex and Gemini CLI logs on your machine and reads only the token counts.
2. **Read the report.** Every model's tokens priced at API list rates, next to what your plan costs.
3. **Publish, if you like.** Link a device to your GitHub sign-in and push hourly, daily or weekly totals. Your profile stays private until you switch it on.

${PRIVACY_LINE}

- [Leaderboard](${base}/leaderboard) (markdown: \`${base}/leaderboard?format=md\`)
- [Setup](${base}/setup.md)
- [Agent skill](${base}/skill.md)
- [API](${base}/api.md)
- [Privacy](${base}/privacy) · [Terms](${base}/terms)
`;
}

export function setupMarkdown(base: string): string {
  return `# Set up tokenmaxxing

One command reads your local agent logs and prints a report. Nothing leaves your machine unless you link it and push.

## The quick way

Paste this into your coding agent. It runs the tracker, shows you the report, and asks before publishing anything.

${fence(ONBOARDING_PROMPT)}

Agents: the full procedure is at ${base}/skill.md.

## Or run it yourself

Node 20 or newer. No global install, no dependencies.

${fence(INSTALL_COMMAND, "bash")}

\`init\` detects Claude Code, Codex and Gemini CLI logs, parses them into hourly totals in \`~/.tokenmaxxing/\`, and prints the report. Set your plan for an ROI line with \`${PLAN_COMMAND}\`.

To publish, run \`${LINK_COMMAND}\`, open the URL it prints, sign in with GitHub and confirm the code. Then \`${PUSH_COMMAND}\` uploads your totals, printing the row count and date range first.

## What gets uploaded

Only when you run \`push\`, and only rows like these. Never prompts, responses, file paths, project names, git branches or credentials. The tracker never reads credential files.

${table(["Field", "Example", "What it is"], UPLOADED.map(([f, e, w]) => [`\`${f}\``, `\`${e}\``, w]))}

## Hourly, daily or weekly

${GRANULARITY_TEXT}

${fence(GRANULARITY_COMMAND, "bash")}

## Hooks are opt-in

By default the tracker only runs when you run it. \`npx tokenmaxxing-cli hook install\` adds a Claude Code Stop hook and a Codex notify hook that run \`sync\`; it prints the exact change to your config, waits for a yes, and keeps a backup. \`npx tokenmaxxing-cli schedule install\` is the alternative: a launchd or cron job every 30 minutes, with no edits to other tools.

## Uninstall

1. \`npx tokenmaxxing-cli hook uninstall\` and \`npx tokenmaxxing-cli schedule uninstall\`, if you installed either.
2. Delete the local data: \`rm -rf ~/.tokenmaxxing\`.
3. If you linked a device, revoke it on your account page (${base}/me) and make your profile private.
`;
}

export function apiMarkdown(base: string): string {
  const lb = {
    period: "week",
    metric: "value",
    sponsor: { label: "Sponsored", name: "Acme", tagline: "Only present when the board has a live sponsor", url: "https://acme.example", logo_url: null },
    rows: [
      {
        rank: 1,
        handle: "carter",
        display_name: "Carter",
        avatar_url: "https://avatars.githubusercontent.com/u/1",
        api_equiv_usd: 1043.2,
        tokens_total: 91234567,
        output_tokens: 1200000,
        cache_read_ratio: 0.93,
        unpriced_tokens: 0,
        sources: ["claude", "codex"],
        plan_usd: 46,
        roi: 22.68,
        efficiency: 1150.3,
        metric_value: 1043.2,
      },
    ],
  };
  const profile = {
    handle: "carter",
    display_name: "Carter",
    avatar_url: "https://avatars.githubusercontent.com/u/1",
    public: true,
    plans: { claude: "max-20x" },
    period: "month",
    plan_monthly_usd: 200,
    period_days: 30,
    plan_period_usd: 197.13,
    api_equiv_usd: 4476.25,
    tokens_total: 380000000,
    output_tokens: 4200000,
    cache_read_ratio: 0.93,
    unpriced_tokens: 0,
    sources: ["claude", "codex"],
    granularity: "hour",
    models: [{ source: "claude", model: "claude-opus-5-5", input: 2900000, cache_read: 310000000, cache_write: 12000000, output: 3400000, tokens: 328300000, usd: 3902.1, priced: true }],
    daily: [{ day: "2026-09-22", usd: 131.04, tokens: 11200000 }],
  };
  const org = {
    slug: "acme",
    name: "Acme",
    public: true,
    period: "month",
    member_count: 4,
    api_equiv_usd: 9120.55,
    tokens_total: 812000000,
    hidden_members: 1,
    members: [{ handle: "carter", display_name: "Carter", avatar_url: null, role: "owner", public: true, api_equiv_usd: 4476.25, tokens_total: 380000000 }],
  };
  const push = {
    v: 1,
    deviceId: "0b7c8a52-7d1e-4a55-9a53-1f3f5f1c2d11",
    granularity: "day",
    replaceDevice: true,
    rows: [{ ts: "2026-09-22T00:00:00Z", source: "claude", model: "claude-opus-5-5", input: 2912, cache_read: 317502113, cache_write_5m: 8902114, cache_write_1h: 0, output: 217904, reasoning: 0, requests: 412, conversations: 6 }],
  };
  const j = (v: unknown) => fence(JSON.stringify(v, null, 2), "json");

  return `# tokenmaxxing API

Base URL: ${base}. Public reads are JSON, need no key, and are cached for 60 seconds (\`Cache-Control: public, s-maxage=60, stale-while-revalidate=300\`). Private profiles never appear in any public response. Be gentle: no bulk scraping of profiles (see ${base}/terms).

Common parameters: \`period\` is \`week\` (last 7 days), \`month\` (last 30 days) or \`all\`. Money is API-equivalent USD at list prices; nobody was billed it.

## GET /api/v1/leaderboard

Top 100 public profiles for a board.

| Param | Values | Default |
| --- | --- | --- |
| \`period\` | \`week\` \\| \`month\` \\| \`all\` | \`week\` |
| \`metric\` | \`value\` (API-equivalent USD) \\| \`roi\` (value / plan cost for the period, users with a plan) \\| \`efficiency\` (output tokens per USD, from $5) \\| \`volume\` (tokens) | \`value\` |

${j(lb)}

\`sponsor\` is optional and never one of the ranked \`rows\`. Before the database is connected the response is \`{ period, metric, configured: false, rows: [] }\`. Bad params are a 400.

## GET /api/v1/u/{handle}

Aggregates for one public profile. \`period\` defaults to \`month\`. 404 \`{ "error": "not_found" }\` when the handle does not exist or is private.

${j(profile)}

\`daily\` always covers the last 30 days (UTC). \`granularity\` is how coarse the owner's latest upload was (\`hour\`, \`day\` or \`week\`); coarse rows are drawn on the day their period starts.

## GET /api/v1/orgs/{slug}

A public org's totals. Members appear only if their own profile is public; \`hidden_members\` counts the rest. \`period\` defaults to \`month\`.

${j(org)}

## GET /badge/{handle}.svg

Shields-style badge, 20px tall. \`metric\` = \`value\` | \`roi\` | \`rank\` (default \`value\`), \`period\` (default \`month\`). Private profiles render a grey "private" badge.

${fence(`[![tokenmaxxing](${base}/badge/carter.svg?metric=value&period=month)](${base}/u/carter)`, "markdown")}

## GET /card/{handle}.svg

The profile card: the value multiple as a gold poster. Pure SVG with no scripts, fonts or external requests, so it survives GitHub's image proxy.

| Param | Values | Default |
| --- | --- | --- |
| \`size\` | \`sm\` (320 x 96) \\| \`md\` (480 x 160, adds the 30-day bars and top three models) | \`sm\` |
| \`theme\` | \`light\` \\| \`dark\` \\| \`auto\` (follows the viewer's \`prefers-color-scheme\`) | \`auto\` |
| \`period\` | \`week\` \\| \`month\` \\| \`all\` | \`month\` |

${fence(`[![tokenmaxxing](${base}/card/carter.svg?size=sm&theme=auto)](${base}/u/carter)`, "markdown")}

${fence(`<a href="${base}/u/carter"><img src="${base}/card/carter.svg?size=md" alt="@carter on tokenmaxxing" width="480" height="160"></a>`, "html")}

## GET /embed/{handle}

The md card as a minimal HTML page for an iframe (\`frame-ancestors *\`). Takes \`period\` and \`theme\`. Its only script posts \`{ type: "tokenmaxxing:resize", height }\` to the parent.

${fence(`<iframe src="${base}/embed/carter" width="480" height="160" style="border:0" loading="lazy" title="tokenmaxxing"></iframe>`, "html")}

## Markdown

Agents can read the site itself as markdown: send \`Accept: text/markdown\` or add \`?format=md\` to \`/\`, \`/setup\`, \`/leaderboard\` (same \`period\` and \`metric\` params), \`/u/{handle}\`, \`/privacy\` and \`/terms\`. Also: \`/llms.txt\`, \`/setup.md\`, \`/api.md\`, \`/skill.md\`, \`/.well-known/agent.json\`.

## CLI endpoints (not for agents to call directly)

The CLI uses these; run \`npx tokenmaxxing-cli link\` and \`push\` instead.

### GET /api/v1/link/{code}

Polled by \`tokenmaxxing link\`. \`202 { "error": "pending" }\` until the user confirms the code at ${base}/link, then \`{ "token", "handle" }\` exactly once. Rate-limited per IP.

### POST /api/v1/push

\`Authorization: Bearer <device token>\`. Up to 5000 rows per request. \`granularity\` is \`hour\` (default), \`day\` or \`week\`, and every row's \`ts\` must be the start of its period: a whole UTC hour, 00:00 UTC, or Monday 00:00 UTC. The per-row token cap scales with it (x24 for day, x168 for week). \`replaceDevice: true\` deletes every row the device already has before writing the batch, in one transaction; the CLI sends it on the first batch of a push that changes granularity.

${j(push)}

Response: \`200 { "accepted": 1, "rejected": [{ "index": 3, "reason": "ts: must be 00:00 UTC for granularity day" }] }\`. A malformed envelope is a 400; a bad token is a 401.
`;
}

const METRIC_HEAD: Record<Metric, string> = { value: "Value", roi: "ROI", efficiency: "Output per $", volume: "Tokens" };

export function leaderboardMarkdown(o: {
  base: string;
  period: Period;
  metric: Metric;
  rows: LeaderboardRow[];
  sponsor?: Sponsor | null;
  configured: boolean;
}): string {
  const title = `# tokenmaxxing leaderboard: ${METRIC_HEAD[o.metric]}, ${PERIOD_LABEL[o.period].toLowerCase()}`;
  const other = (["value", "roi", "efficiency", "volume"] as Metric[]).map((m) => `[${m}](${o.base}/leaderboard?metric=${m}&period=${o.period}&format=md)`).join(" · ");
  const lines = [title, "", `Public profiles only, at API list prices. Boards: ${other}. JSON: ${o.base}/api/v1/leaderboard?metric=${o.metric}&period=${o.period}`, ""];
  if (o.sponsor) lines.push(`> Sponsored: [${cell(o.sponsor.name)}](${o.sponsor.url})${o.sponsor.tagline ? ` — ${cell(o.sponsor.tagline)}` : ""} (not a ranked entry)`, "");
  if (!o.configured) {
    lines.push("The database is not connected yet, so the board is empty.");
    return lines.join("\n") + "\n";
  }
  const primary = (r: LeaderboardRow) =>
    o.metric === "roi" ? formatRoi(r.roi) : o.metric === "efficiency" ? `${formatTokens(r.efficiency)}/$` : o.metric === "volume" ? formatTokens(r.tokens_total) : formatUsd(r.api_equiv_usd);
  lines.push(
    table(
      ["#", "Handle", METRIC_HEAD[o.metric], ...(o.metric === "value" ? [] : ["Value"]), "Tokens", "Tools"],
      o.rows.map((r) => [
        r.rank,
        `[${r.handle}](${o.base}/u/${r.handle})`,
        primary(r),
        ...(o.metric === "value" ? [] : [formatUsd(r.api_equiv_usd)]),
        formatTokens(r.tokens_total),
        r.sources.join(", "),
      ]),
    ),
  );
  if (!o.rows.length) lines.push("", "Nobody on this board yet. Boards show public profiles only.");
  return lines.join("\n") + "\n";
}

export function profileMarkdown(p: ProfilePage, base: string): string {
  const roi = roiOf(p.api_equiv_usd, p.plan_period_usd);
  const when = PERIOD_LABEL[p.period].toLowerCase();
  const lines = [
    `# @${p.handle} on tokenmaxxing`,
    "",
    roi === null
      ? `**${formatUsd(p.api_equiv_usd)}** of API-equivalent usage, ${when}. No plan set, so no multiple.`
      : `**${formatRoi(roi)}** the plan price, ${when}: ${formatUsd(p.api_equiv_usd)} of API-equivalent usage against ${formatUsd(p.plan_period_usd, { cents: true })} of plan cost.`,
    "",
    table(["Tokens", "Output", "Cache hit", "Tools"], [[formatTokens(p.tokens_total), formatTokens(p.output_tokens), formatPct(p.cache_read_ratio), p.sources.join(", ") || "none"]]),
    "",
    `## By model, ${when}`,
    "",
    p.models.length
      ? table(
          ["Tool", "Model", "Input", "Cache read", "Cache write", "Output", "At API rates"],
          p.models.map((m) => [m.source, `\`${m.model}\``, formatTokens(m.input), formatTokens(m.cache_read), formatTokens(m.cache_write), formatTokens(m.output), m.priced ? formatUsd(m.usd, { cents: true }) : "unpriced"]),
        )
      : "No usage in this period.",
    "",
    "## Last 30 days",
    "",
    table(["Day", "At API rates"], p.daily.map((d) => [d.day, formatUsd(d.usd, { cents: true })])),
    "",
  ];
  if (p.granularity === "day" || p.granularity === "week") {
    lines.push(`Uploads are ${p.granularity === "day" ? "daily" : "weekly"} totals.`, "");
  }
  lines.push(`JSON: ${base}/api/v1/u/${p.handle}?period=${p.period} · Card: ${base}/card/${p.handle}.svg?size=md`, "");
  return lines.join("\n");
}
