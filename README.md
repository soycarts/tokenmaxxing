# tokenmaxxing.fyi

Paste one prompt into your coding agent. See how much API-equivalent value your subscription delivered. Optionally flex it.

```
Set up tokenmaxxing for me: run `npx tokenmaxxing-cli@latest init`, show me the report it prints,
and if I like it run `npx tokenmaxxing-cli link` and open the URL it prints.
Don't edit any of my tool config files unless I say so.
```

## For agents

Point Claude Code, Codex or any agent at this repo or at https://tokenmaxxing.fyi/skill.md. The skill in
[`skills/tokenmaxxing/SKILL.md`](skills/tokenmaxxing/SKILL.md) walks through `init`, plans, `link`, granularity and
`push`, and states the rules (no config edits without being asked, no credential reads, nothing uploaded until
the user says so). Or just say "go to tokenmaxxing.fyi and set me up": the site serves
[`/llms.txt`](https://tokenmaxxing.fyi/llms.txt), `/skill.md`, `/setup.md`, `/api.md` and `/.well-known/agent.json`,
and its pages answer in markdown to `Accept: text/markdown` or `?format=md`.

- `packages/cli` — `tokenmaxxing-cli` on npm. Zero deps. Reads local agent logs only. Never touches credentials. No telemetry.
- `apps/web` — tokenmaxxing.fyi (Next.js on Vercel, Supabase).

See `packages/cli/SPEC.md` and `apps/web/SPEC.md`.
