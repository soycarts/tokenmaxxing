# Launch checklist

State as of 2026-09-22: code on GitHub, Supabase schema + prices applied, Vercel project `tokenmaxxing` linked from `apps/web`, domain added to Vercel but DNS not yet pointed. Nothing deployed, nothing on npm.

## 1. Vercel env (run from `apps/web`, values are in `.env.local`)

```bash
cd apps/web && set -a && . ./.env.local && set +a && \
for env in production preview; do
  printf '%s' "$NEXT_PUBLIC_SUPABASE_URL"      | vercel env add NEXT_PUBLIC_SUPABASE_URL      $env --force
  printf '%s' "$NEXT_PUBLIC_SUPABASE_ANON_KEY" | vercel env add NEXT_PUBLIC_SUPABASE_ANON_KEY $env --force
  printf '%s' "$SUPABASE_SERVICE_ROLE_KEY"     | vercel env add SUPABASE_SERVICE_ROLE_KEY     $env --force
  printf '%s' "https://tokenmaxxing.fyi"       | vercel env add NEXT_PUBLIC_SITE_URL          $env --force
  printf '%s' "$(openssl rand -base64 32)"     | vercel env add CRON_SECRET                   $env --force
done
```

## 2. Deploy

```bash
cd apps/web && vercel deploy --prod --yes
```

Optional: `vercel git connect` in `apps/web` for deploy-on-push, then set Root Directory to `apps/web` in the Vercel project settings.

## 3. DNS at Porkbun

Delete Porkbun's parking records for the apex, then add:

| Type  | Host | Value                 |
|-------|------|-----------------------|
| A     | @    | 76.76.21.21           |
| CNAME | www  | cname.vercel-dns.com  |

Vercel issues the certificate automatically once the A record resolves. Check with `vercel domains inspect tokenmaxxing.fyi`.

## 4. GitHub OAuth (needed for sign-in only)

1. github.com/settings/developers → New OAuth App. Homepage `https://tokenmaxxing.fyi`, callback `https://iitzmnrocuepimnhbkth.supabase.co/auth/v1/callback`.
2. Supabase dashboard → Authentication → Providers → GitHub → enable, paste client id + secret.
3. Site URL and redirect allow-list are already set (prod, www, `*.vercel.app`, localhost 3000/3020).

## 5. npm

```bash
cd packages/cli && npm publish --access public
```

Package name is `tokenmaxxing-cli` (bare `tokenmaxxing` is owned by someone else). The site's copy box already says `npx tokenmaxxing-cli@latest init`.

## 6. Smoke test after deploy

```bash
npx tokenmaxxing-cli@latest init
npx tokenmaxxing-cli plan set claude max-20x
npx tokenmaxxing-cli link          # opens https://tokenmaxxing.fyi/link?code=…
npx tokenmaxxing-cli push
```

Then check `https://tokenmaxxing.fyi/u/<handle>` and `https://tokenmaxxing.fyi/leaderboard`.

## 7. GitHub Actions: pricing automation

The workflows in `.github/workflows/` (`ci.yml`, `pricing.yml`, `pricing-apply.yml`; see `docs/PRICING.md`) need three things set once in the GitHub repo:

1. **Repo secrets** (Settings → Secrets and variables → Actions → New repository secret), used only by `pricing-apply.yml` to upsert `apps/web/supabase/seed_prices.sql` into the live DB when it changes on main:

   | Secret | Value |
   |--------|-------|
   | `SUPABASE_ACCESS_TOKEN` | a personal access token from https://supabase.com/dashboard/account/tokens (name it `tokenmaxxing-pricing-apply`) |
   | `SUPABASE_PROJECT_REF`  | `iitzmnrocuepimnhbkth` |

   From a terminal, without the token landing in shell history (`gh` prompts for the value):

   ```bash
   gh secret set SUPABASE_ACCESS_TOKEN --repo soycarts/tokenmaxxing
   gh secret set SUPABASE_PROJECT_REF  --repo soycarts/tokenmaxxing --body iitzmnrocuepimnhbkth
   ```

   A Supabase personal access token can manage every project the account can reach, so keep it only in the repo secret and revoke it on the tokens page if it leaks. The workflow never prints it; it reaches curl only through a temp config file that is deleted afterwards.

2. **Let Actions open PRs**: Settings → Actions → General → Workflow permissions → tick "Allow GitHub Actions to create and approve pull requests". Without it, the daily `pricing.yml` run fails at "Open or update the pricing PR".

3. **Optional `PRICING_PR_TOKEN`**: PRs opened with the default token do not trigger `ci.yml`. The pricing workflow posts its own `pricing / tests` status either way. For full CI on `pricing/auto` PRs, add a fine-grained PAT scoped to this repo (Contents: read and write, Pull requests: read and write) as `PRICING_PR_TOKEN`.

Check it works: Actions → pricing → Run workflow. The run should end with "Pricing snapshots are up to date; no PR" or open a `pricing: snapshot YYYY-MM-DD` PR. After the first push to main that touches `seed_prices.sql`, Actions → pricing-apply should show `seed_prices.sql → HTTP 2xx` and the row count in the job summary.
