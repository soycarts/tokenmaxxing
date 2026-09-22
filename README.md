# tokenmaxxing.fyi

Paste one prompt into your coding agent. See how much API-equivalent value your subscription delivered. Optionally flex it.

```
Set up tokenmaxxing for me: run `npx tokenmaxxing-cli@latest init`, show me the report it prints,
and if I like it run `npx tokenmaxxing-cli link` and open the URL it prints.
Don't edit any of my tool config files unless I say so.
```

- `packages/cli` — `tokenmaxxing-cli` on npm. Zero deps. Reads local agent logs only. Never touches credentials. No telemetry.
- `apps/web` — tokenmaxxing.fyi (Next.js on Vercel, Supabase).

See `packages/cli/SPEC.md` and `apps/web/SPEC.md`.
