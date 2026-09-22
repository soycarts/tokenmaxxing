# Supabase

`schema.sql` is the whole schema: tables, RLS, column grants and the SQL functions behind
every leaderboard and profile page. It is idempotent. `seed_prices.sql` is generated from the
CLI's pricing snapshots by `npm run seed-prices` and is committed. Both are safe to re-run.

## Going live

1. Create a Supabase project.
2. SQL editor (or `psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 -f ...`): run `schema.sql`, then
   `seed_prices.sql`. Re-run both after any change to either file.
3. Authentication → Sign In / Providers → GitHub: enable it. Create a GitHub OAuth app
   (GitHub → Settings → Developer settings → OAuth Apps) with
   - Homepage URL: `https://tokenmaxxing.fyi`
   - Authorization callback URL: `https://<project-ref>.supabase.co/auth/v1/callback`

   and paste its client id and secret into Supabase.
4. Authentication → URL Configuration:
   - Site URL: `https://tokenmaxxing.fyi`
   - Redirect URLs: `https://tokenmaxxing.fyi/auth/callback`, `http://localhost:3020/auth/callback`,
     and `https://*-<vercel-team>.vercel.app/auth/callback` if preview deployments should sign in.
5. Vercel project env (Production, and Preview if wanted): `NEXT_PUBLIC_SUPABASE_URL`,
   `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `NEXT_PUBLIC_SITE_URL`,
   `CRON_SECRET`. See `../.env.example`.
6. `vercel.json` schedules `/api/cron/refresh` daily; Vercel sends `CRON_SECRET` as a bearer token.

## Testing the SQL

`schema.test.sql` seeds three users in a transaction, checks every leaderboard metric, the
pricing joins (exact and normalised model ids, unpriced tokens), RLS, column grants, the org
visibility rules and the one-shot link-code handoff, then rolls back.

Against a Supabase database (a branch or local stack is best):

```sh
SUPABASE_DB_URL=postgresql://... npm test   # runs it via psql when psql is on PATH
```

Against a throwaway plain Postgres, with a small stand-in for Supabase's auth schema:

```sh
docker run -d --rm --name tmx-pg -e POSTGRES_PASSWORD=pw postgres:17-alpine
for f in test/stub-supabase.sql schema.sql seed_prices.sql schema.test.sql; do
  docker exec -i tmx-pg psql -U postgres -v ON_ERROR_STOP=1 -q < "$f" || break
done
docker stop tmx-pg
```

`test/stub-supabase.sql` must never be run against a real Supabase project.
