-- tokenmaxxing.fyi schema + row-level security.
-- Run in the Supabase SQL editor (or `psql "$SUPABASE_DB_URL" -f supabase/schema.sql`), then
-- run supabase/seed_prices.sql. Idempotent: safe to re-run after any change to this file.
--
-- Who writes what:
--   * The CLI is the only writer of usage (`buckets`), through POST /api/v1/push, which
--     authenticates a device token and writes with the service-role key.
--   * `link_codes` and `api_tokens` are touched only by server routes using the service-role
--     key. RLS is on with no policies, so the anon/authenticated keys can read nothing there.
--   * Everything a signed-in user may change about themselves goes through RLS + column grants.
--   * Leaderboards and profile pages go through SECURITY DEFINER functions that return
--     aggregates only. `buckets` rows themselves are readable by their owner and nobody else.
--
-- Cost is computed here, from `model_prices` (seeded from the CLI's snapshots), never trusted
-- from the client. A model with no price costs 0 and is counted in `unpriced_tokens`.
--
-- Changing a function's return type: `create or replace` cannot do that, which is why each
-- table-returning function below is dropped first. Plain column/table changes are additive.

create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;

-- ------------------------------------------------------------------ helpers (no table deps)

-- Random code from the lookalike-free alphabet (no 0/O/1/I). 256 % 32 = 0, so no modulo bias.
create or replace function public.gen_code(len int)
returns text language plpgsql volatile set search_path = '' as $$
declare
  alphabet constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  b bytea := extensions.gen_random_bytes(len);
  result text := '';
begin
  for i in 0 .. len - 1 loop
    result := result || substr(alphabet, (get_byte(b, i) % 32) + 1, 1);
  end loop;
  return result;
end $$;

-- Normalised model id, the CLI's canon(), mirrored by modelKey() in scripts/seed-prices.mjs
-- (a test compares them): lowercase; drop a `provider/` prefix, a bedrock `us.anthropic.`
-- style prefix, a `-v1:0` suffix and a date suffix; version dots to dashes.
create or replace function public.model_key(m text)
returns text language sql immutable parallel safe set search_path = '' as $$
  select regexp_replace(
    regexp_replace(regexp_replace(regexp_replace(regexp_replace(regexp_replace(
      lower(btrim(m)),
      '^.*/', ''),
      '^(?:[a-z]{2,4}\.)?(?:anthropic|openai|google|meta|amazon)\.', ''),
      '-v[0-9]+(?::[0-9]+)?$', ''),
      '[-@][0-9]{8}$', ''),
      '-[0-9]{4}-[0-9]{2}-[0-9]{2}$', ''),
    '([0-9])\.([0-9])', '\1-\2', 'g')
$$;

-- Plan prices, USD per month. Mirrors lib/plans.ts (a unit test keeps them in step).
create or replace function public.plan_price_usd(p_provider text, p_plan text)
returns numeric language sql immutable parallel safe set search_path = '' as $$
  select p.usd from (values
    ('claude', 'pro', 20::numeric),
    ('claude', 'max-5x', 100::numeric),
    ('claude', 'max-20x', 200::numeric),
    ('openai', 'plus', 20::numeric),
    ('openai', 'pro', 200::numeric),
    ('cursor', 'pro', 20::numeric),
    ('cursor', 'pro-plus', 60::numeric),
    ('cursor', 'ultra', 200::numeric),
    ('google', 'ai-pro', 19.99::numeric),
    ('google', 'ai-ultra-100', 100::numeric),
    ('google', 'ai-ultra', 200::numeric)
  ) as p(provider, plan, usd)
  where p.provider = p_provider and p.plan = p_plan
$$;

create or replace function public.plans_monthly_usd(p_plans jsonb)
returns numeric language sql immutable parallel safe set search_path = '' as $$
  select coalesce(sum(public.plan_price_usd(e.key, e.value)), 0)
  from jsonb_each_text(case when jsonb_typeof(p_plans) = 'object' then p_plans else '{}'::jsonb end) as e
$$;

-- Rolling windows: week = last 7 days, month = last 30 days, all = everything.
create or replace function public.period_since(p_period text)
returns timestamptz language plpgsql stable set search_path = '' as $$
begin
  case p_period
    when 'week' then return now() - interval '7 days';
    when 'month' then return now() - interval '30 days';
    when 'all' then return '-infinity'::timestamptz;
    else raise exception 'period must be week, month or all' using errcode = '22023';
  end case;
end $$;

-- ------------------------------------------------------------------------------ profiles
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  handle text unique not null check (handle ~ '^[a-z0-9-]{3,24}$'),
  display_name text check (char_length(display_name) <= 64),
  avatar_url text check (char_length(avatar_url) <= 512),
  public boolean not null default false,
  plans jsonb not null default '{}'::jsonb check (jsonb_typeof(plans) = 'object'),
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

drop policy if exists "profiles read public or own" on public.profiles;
create policy "profiles read public or own" on public.profiles
  for select to anon, authenticated
  using (public or id = auth.uid());

drop policy if exists "profiles insert own" on public.profiles;
create policy "profiles insert own" on public.profiles
  for insert to authenticated
  with check (id = auth.uid());

drop policy if exists "profiles update own" on public.profiles;
create policy "profiles update own" on public.profiles
  for update to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

-- The handle is chosen once, when the row is created: it is not in the updatable columns.
revoke insert, update, delete on public.profiles from anon;
revoke update, delete on public.profiles from authenticated;
grant update (display_name, avatar_url, public, plans) on public.profiles to authenticated;

-- ------------------------------------------------------------------------------- devices
create table if not exists public.devices (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  name text not null default 'device' check (char_length(name) between 1 and 64),
  created_at timestamptz not null default now(),
  last_push_at timestamptz
);
create index if not exists devices_user_idx on public.devices (user_id);

alter table public.devices enable row level security;

drop policy if exists "devices read own" on public.devices;
create policy "devices read own" on public.devices
  for select to authenticated
  using (user_id = auth.uid());

drop policy if exists "devices rename own" on public.devices;
create policy "devices rename own" on public.devices
  for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

revoke insert, update, delete on public.devices from anon, authenticated;
grant update (name) on public.devices to authenticated;

-- ---------------------------------------------------------------------------- api_tokens
create table if not exists public.api_tokens (
  token_hash text primary key check (token_hash ~ '^[0-9a-f]{64}$'),
  user_id uuid not null references public.profiles (id) on delete cascade,
  device_id uuid not null references public.devices (id) on delete cascade,
  created_at timestamptz not null default now(),
  last_used_at timestamptz
);
create index if not exists api_tokens_device_idx on public.api_tokens (device_id);

alter table public.api_tokens enable row level security;
revoke all on public.api_tokens from anon, authenticated;

-- ---------------------------------------------------------------------------- link_codes
create table if not exists public.link_codes (
  code text primary key check (code ~ '^[A-HJ-NP-Z2-9]{8}$'),
  user_id uuid references public.profiles (id) on delete cascade,
  token_plain text,
  device_id uuid references public.devices (id) on delete cascade,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '10 minutes',
  consumed_at timestamptz
);
create index if not exists link_codes_expires_idx on public.link_codes (expires_at);

alter table public.link_codes enable row level security;
revoke all on public.link_codes from anon, authenticated;

-- ------------------------------------------------------------------------------- buckets
create table if not exists public.buckets (
  user_id uuid not null references public.profiles (id) on delete cascade,
  device_id uuid not null references public.devices (id) on delete cascade,
  ts timestamptz not null check (extract(epoch from ts) = floor(extract(epoch from ts) / 3600) * 3600),
  source text not null check (source in ('claude', 'codex', 'gemini', 'cursor')),
  model text not null check (char_length(model) between 1 and 128),
  input bigint not null default 0 check (input >= 0),
  cache_read bigint not null default 0 check (cache_read >= 0),
  cache_write_5m bigint not null default 0 check (cache_write_5m >= 0),
  cache_write_1h bigint not null default 0 check (cache_write_1h >= 0),
  output bigint not null default 0 check (output >= 0),
  reasoning bigint not null default 0 check (reasoning >= 0),
  requests int not null default 0 check (requests >= 0),
  conversations int not null default 0 check (conversations >= 0),
  primary key (device_id, ts, source, model)
);
create index if not exists buckets_user_ts_idx on public.buckets (user_id, ts);
create index if not exists buckets_ts_idx on public.buckets (ts);

alter table public.buckets enable row level security;

drop policy if exists "buckets read own" on public.buckets;
create policy "buckets read own" on public.buckets
  for select to authenticated
  using (user_id = auth.uid());

revoke insert, update, delete on public.buckets from anon, authenticated;

-- v0.2 push granularity. The CLI may fold its hourly buckets into daily (ts = 00:00 UTC) or
-- weekly (ts = Monday 00:00 UTC) totals before pushing; the row says which. The primary key
-- is unchanged, and every aggregate sums over ts ranges, so coarse rows need nothing else.
alter table public.buckets add column if not exists granularity text not null default 'hour';
do $$ begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'buckets_granularity_check' and conrelid = 'public.buckets'::regclass
  ) then
    alter table public.buckets add constraint buckets_granularity_check check (
      granularity in ('hour', 'day', 'week')
      and (granularity = 'hour' or extract(epoch from ts)::bigint % 86400 = 0)
      and (granularity <> 'week' or extract(isodow from ts at time zone 'utc') = 1)
    );
  end if;
end $$;

-- ---------------------------------------------------------------------------------- orgs
create table if not exists public.orgs (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null check (slug ~ '^[a-z0-9-]{2,32}$'),
  name text not null check (char_length(name) between 1 and 64),
  invite_code text unique not null default public.gen_code(10),
  owner_id uuid not null references public.profiles (id) on delete cascade,
  public boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.org_members (
  org_id uuid not null references public.orgs (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  role text not null default 'member' check (role in ('owner', 'member')),
  joined_at timestamptz not null default now(),
  primary key (org_id, user_id)
);
create index if not exists org_members_user_idx on public.org_members (user_id);

-- SECURITY DEFINER so the org_members policy can ask "is the viewer a member" without the
-- policy recursing into itself.
create or replace function public.is_org_member(p_org uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.org_members m where m.org_id = p_org and m.user_id = auth.uid()
  )
$$;

alter table public.orgs enable row level security;

drop policy if exists "orgs read public or member" on public.orgs;
create policy "orgs read public or member" on public.orgs
  for select to anon, authenticated
  using (public or public.is_org_member(id));

drop policy if exists "orgs update owner" on public.orgs;
create policy "orgs update owner" on public.orgs
  for update to authenticated
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());

drop policy if exists "orgs delete owner" on public.orgs;
create policy "orgs delete owner" on public.orgs
  for delete to authenticated
  using (owner_id = auth.uid());

-- invite_code is never readable through the API: members get it from org_page().
-- Orgs are created through create_org(), which also adds the owner as a member.
revoke insert, update, delete on public.orgs from anon, authenticated;
revoke select on public.orgs from anon, authenticated;
grant select (id, slug, name, owner_id, public, created_at) on public.orgs to anon, authenticated;
grant update (name, public) on public.orgs to authenticated;
grant delete on public.orgs to authenticated;

alter table public.org_members enable row level security;

drop policy if exists "org members read" on public.org_members;
create policy "org members read" on public.org_members
  for select to anon, authenticated
  using (
    public.is_org_member(org_id)
    or exists (select 1 from public.orgs o where o.id = org_id and o.public)
  );

drop policy if exists "org members leave or owner removes" on public.org_members;
create policy "org members leave or owner removes" on public.org_members
  for delete to authenticated
  using (
    user_id = auth.uid()
    or exists (select 1 from public.orgs o where o.id = org_id and o.owner_id = auth.uid())
  );

revoke insert, update, delete on public.org_members from anon, authenticated;
grant delete on public.org_members to authenticated;

-- -------------------------------------------------------------------------- model_prices
create table if not exists public.model_prices (
  model text primary key,
  input numeric not null check (input >= 0),
  cache_read numeric not null check (cache_read >= 0),
  cache_write_5m numeric not null check (cache_write_5m >= 0),
  cache_write_1h numeric not null check (cache_write_1h >= 0),
  output numeric not null check (output >= 0),
  snapshot_date date not null
);

alter table public.model_prices enable row level security;

drop policy if exists "model prices readable" on public.model_prices;
create policy "model prices readable" on public.model_prices
  for select to anon, authenticated
  using (true);

revoke insert, update, delete on public.model_prices from anon, authenticated;

-- ------------------------------------------------------------------------------ sponsors
-- Sponsored placements (v0.2, scaffold only: no billing, rows are added by hand in SQL).
-- Anyone may read a sponsor while it is active and inside its window; nobody writes through
-- the API. Impressions are counted server-side by record_sponsor_impression().
create table if not exists public.sponsors (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null check (slug ~ '^[a-z0-9-]{2,48}$'),
  name text not null check (char_length(name) between 1 and 64),
  tagline text not null default '' check (char_length(tagline) <= 80),
  url text not null check (url ~ '^https://' and char_length(url) <= 512),
  logo_url text check (logo_url is null or (logo_url ~ '^https://' and char_length(logo_url) <= 512)),
  placements text[] not null default '{}' check (placements <@ array[
    'leaderboard:value', 'leaderboard:roi', 'leaderboard:efficiency', 'leaderboard:volume',
    'leaderboard:orgs', 'profile'
  ]::text[]),
  starts_at timestamptz not null default now(),
  ends_at timestamptz not null default now() + interval '30 days',
  active boolean not null default false,
  created_at timestamptz not null default now(),
  check (ends_at > starts_at)
);
create index if not exists sponsors_placements_idx on public.sponsors using gin (placements);

alter table public.sponsors enable row level security;

drop policy if exists "sponsors read live" on public.sponsors;
create policy "sponsors read live" on public.sponsors
  for select to anon, authenticated
  using (active and now() between starts_at and ends_at);

revoke insert, update, delete on public.sponsors from anon, authenticated;

create table if not exists public.sponsor_impressions (
  sponsor_id uuid not null references public.sponsors (id) on delete cascade,
  day date not null,
  placement text not null,
  count int not null default 0 check (count >= 0),
  primary key (sponsor_id, day, placement)
);

alter table public.sponsor_impressions enable row level security;
revoke all on public.sponsor_impressions from anon, authenticated;

-- ============================================================== aggregates (internal)
-- These see every user's rows. They are SECURITY DEFINER and granted to nobody but the
-- owner and service_role; the public functions further down wrap them and filter.

drop function if exists public._priced(text, uuid);
create function public._priced(p_period text, p_user uuid default null)
returns table (
  user_id uuid, source text, model text,
  input bigint, cache_read bigint, cache_write_5m bigint, cache_write_1h bigint,
  output bigint, reasoning bigint, requests bigint, conversations bigint,
  tokens bigint, usd numeric, priced boolean, first_ts timestamptz
)
language sql stable security definer set search_path = '' as $$
  select
    a.user_id, a.source, a.model,
    a.input, a.cache_read, a.cache_write_5m, a.cache_write_1h, a.output, a.reasoning,
    a.requests, a.conversations,
    (a.input + a.cache_read + a.cache_write_5m + a.cache_write_1h + a.output)::bigint,
    a.input * coalesce(p1.input, p2.input, 0)
      + a.cache_read * coalesce(p1.cache_read, p2.cache_read, 0)
      + a.cache_write_5m * coalesce(p1.cache_write_5m, p2.cache_write_5m, 0)
      + a.cache_write_1h * coalesce(p1.cache_write_1h, p2.cache_write_1h, 0)
      + a.output * coalesce(p1.output, p2.output, 0),
    (p1.model is not null or p2.model is not null),
    a.first_ts
  from (
    select
      b.user_id, b.source, b.model,
      sum(b.input)::bigint as input,
      sum(b.cache_read)::bigint as cache_read,
      sum(b.cache_write_5m)::bigint as cache_write_5m,
      sum(b.cache_write_1h)::bigint as cache_write_1h,
      sum(b.output)::bigint as output,
      sum(b.reasoning)::bigint as reasoning,
      sum(b.requests)::bigint as requests,
      sum(b.conversations)::bigint as conversations,
      min(b.ts) as first_ts
    from public.buckets b
    where b.ts >= public.period_since(p_period)
      and (p_user is null or b.user_id = p_user)
    group by b.user_id, b.source, b.model
  ) a
  left join public.model_prices p1 on p1.model = a.model
  left join public.model_prices p2 on p1.model is null and p2.model = public.model_key(a.model)
$$;

drop function if exists public._period_stats(text, uuid);
create function public._period_stats(p_period text, p_user uuid default null)
returns table (
  user_id uuid, api_equiv_usd numeric, tokens_total bigint, output_tokens bigint,
  cache_read_ratio numeric, unpriced_tokens bigint, sources text[], period_days numeric
)
language sql stable security definer set search_path = '' as $$
  select
    x.user_id,
    round(sum(x.usd), 6),
    sum(x.tokens)::bigint,
    sum(x.output)::bigint,
    case when sum(x.input + x.cache_read + x.cache_write_5m + x.cache_write_1h) > 0
      then round(sum(x.cache_read)::numeric / sum(x.input + x.cache_read + x.cache_write_5m + x.cache_write_1h), 6)
      else 0 end,
    sum(case when x.priced then 0 else x.tokens end)::bigint,
    array_agg(distinct x.source order by x.source),
    case p_period
      when 'week' then 7::numeric
      when 'month' then 30::numeric
      else greatest(1::numeric, (extract(epoch from now() - min(x.first_ts)) / 86400)::numeric)
    end
  from public._priced(p_period, p_user) x
  group by x.user_id
$$;

-- ================================================================= public functions

-- Per-user aggregates for a period; only users whose profile is public, plus yourself.
drop function if exists public.user_period_stats(text);
create function public.user_period_stats(p_period text)
returns table (
  user_id uuid, handle text, api_equiv_usd numeric, tokens_total bigint, output_tokens bigint,
  cache_read_ratio numeric, unpriced_tokens bigint, sources text[]
)
language sql stable security definer set search_path = '' as $$
  select s.user_id, p.handle, s.api_equiv_usd, s.tokens_total, s.output_tokens,
         s.cache_read_ratio, s.unpriced_tokens, s.sources
  from public._period_stats(p_period) s
  join public.profiles p on p.id = s.user_id
  where p.public or p.id = auth.uid()
$$;

-- metric: value = api_equiv_usd desc; roi = api_equiv_usd / plan cost over the period
-- (Σ monthly plan prices × period_days / 30.4375, users with a plan only); efficiency =
-- output tokens per API-equivalent dollar, min $5; volume = tokens_total desc.
drop function if exists public.leaderboard(text, text);
create function public.leaderboard(p_period text default 'week', p_metric text default 'value')
returns table (
  rank int, handle text, display_name text, avatar_url text,
  api_equiv_usd numeric, tokens_total bigint, output_tokens bigint, cache_read_ratio numeric,
  unpriced_tokens bigint, sources text[], plan_usd numeric, roi numeric, efficiency numeric,
  metric_value numeric
)
language plpgsql stable security definer set search_path = '' as $$
#variable_conflict use_column
begin
  if p_metric not in ('value', 'roi', 'efficiency', 'volume') then
    raise exception 'metric must be value, roi, efficiency or volume' using errcode = '22023';
  end if;
  return query
  with s as (
    select pr.handle, pr.display_name, pr.avatar_url, st.*,
           public.plans_monthly_usd(pr.plans) * st.period_days / 30.4375 as plan_cost
    from public._period_stats(p_period) st
    join public.profiles pr on pr.id = st.user_id
    where pr.public and st.tokens_total > 0
  ), m as (
    select s.*,
      case when s.plan_cost > 0 then s.api_equiv_usd / s.plan_cost end as roi_v,
      case when s.api_equiv_usd >= 5 then s.output_tokens / s.api_equiv_usd end as eff_v
    from s
  ), f as (
    select m.*,
      case p_metric
        when 'value' then m.api_equiv_usd
        when 'roi' then m.roi_v
        when 'efficiency' then m.eff_v
        else m.tokens_total::numeric
      end as mv
    from m
  )
  select
    (row_number() over (order by f.mv desc, f.handle))::int,
    f.handle, f.display_name, f.avatar_url,
    f.api_equiv_usd, f.tokens_total, f.output_tokens, f.cache_read_ratio, f.unpriced_tokens,
    f.sources, round(f.plan_cost, 2), round(f.roi_v, 4), round(f.eff_v, 2), f.mv
  from f
  where f.mv is not null
  order by f.mv desc, f.handle
  limit 100;
end $$;

drop function if exists public.org_leaderboard(text);
create function public.org_leaderboard(p_period text default 'week')
returns table (rank int, slug text, name text, api_equiv_usd numeric, tokens_total bigint, member_count int)
language sql stable security definer set search_path = '' as $$
  with totals as (
    select o.slug, o.name,
      coalesce(sum(s.api_equiv_usd), 0) as usd,
      coalesce(sum(s.tokens_total), 0)::bigint as tokens,
      count(distinct m.user_id)::int as members
    from public.orgs o
    join public.org_members m on m.org_id = o.id
    left join public._period_stats(p_period) s on s.user_id = m.user_id
    where o.public
    group by o.id, o.slug, o.name
  )
  select (row_number() over (order by t.usd desc, t.slug))::int, t.slug, t.name, round(t.usd, 6), t.tokens, t.members
  from totals t
  order by t.usd desc, t.slug
  limit 100
$$;

-- Home page tiles.
drop function if exists public.site_stats();
create function public.site_stats()
-- month_usd (v0.2, for /sponsors) is the 30-day total over public profiles only, like week_usd.
returns table (
  week_usd numeric, users_tracking int, public_users int, top_model text, top_model_usd numeric,
  month_usd numeric
)
language sql stable security definer set search_path = '' as $$
  with wk as (
    select x.* from public._priced('week') x
    join public.profiles p on p.id = x.user_id
    where p.public
  ), best as (
    select wk.model, sum(wk.usd) as usd from wk where wk.priced group by wk.model order by 2 desc limit 1
  ), mo as (
    select x.usd from public._priced('month') x
    join public.profiles p on p.id = x.user_id
    where p.public
  )
  select
    coalesce((select round(sum(wk.usd), 2) from wk), 0),
    (select count(distinct b.user_id)::int from public.buckets b where b.ts >= now() - interval '30 days'),
    (select count(*)::int from public.profiles p where p.public),
    (select best.model from best),
    (select round(best.usd, 2) from best),
    coalesce((select round(sum(mo.usd), 2) from mo), 0)
$$;

-- Everything /u/[handle] shows, as one JSON document. Null if the profile does not exist or
-- is private and not yours.
drop function if exists public.profile_page(text, text);
create function public.profile_page(p_handle text, p_period text default 'month')
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  pr public.profiles%rowtype;
  v_usd numeric; v_tokens bigint; v_output bigint; v_ratio numeric; v_unpriced bigint;
  v_sources text[]; v_days numeric;
  result jsonb;
  plan_monthly numeric;
begin
  select * into pr from public.profiles where handle = lower(p_handle);
  if not found or (not pr.public and pr.id is distinct from auth.uid()) then
    return null;
  end if;

  select s.api_equiv_usd, s.tokens_total, s.output_tokens, s.cache_read_ratio, s.unpriced_tokens,
         s.sources, s.period_days
  into v_usd, v_tokens, v_output, v_ratio, v_unpriced, v_sources, v_days
  from public._period_stats(p_period, pr.id) s;
  if not found then
    v_usd := 0; v_tokens := 0; v_output := 0; v_ratio := 0; v_unpriced := 0; v_sources := '{}';
    v_days := case p_period when 'week' then 7 else 30 end;
  end if;
  plan_monthly := public.plans_monthly_usd(pr.plans);

  select jsonb_build_object(
    'handle', pr.handle,
    'display_name', pr.display_name,
    'avatar_url', pr.avatar_url,
    'public', pr.public,
    'is_you', coalesce(pr.id = auth.uid(), false),
    'plans', pr.plans,
    'period', p_period,
    'plan_monthly_usd', plan_monthly,
    'period_days', round(v_days, 2),
    'plan_period_usd', round(plan_monthly * v_days / 30.4375, 2),
    'api_equiv_usd', round(v_usd, 4),
    'tokens_total', v_tokens,
    'output_tokens', v_output,
    'cache_read_ratio', v_ratio,
    'unpriced_tokens', v_unpriced,
    'sources', to_jsonb(v_sources),
    -- v0.2: how coarse the rows from the most recently pushed device are (hour|day|week).
    'granularity', coalesce((
      select b.granularity from public.buckets b
      where b.device_id = (
        select d.id from public.devices d
        where d.user_id = pr.id and d.last_push_at is not null
        order by d.last_push_at desc limit 1
      )
      order by b.ts desc limit 1
    ), 'hour'),
    'models', coalesce((
      select jsonb_agg(jsonb_build_object(
        'source', m.source, 'model', m.model, 'input', m.input, 'cache_read', m.cache_read,
        'cache_write', m.cache_write_5m + m.cache_write_1h, 'output', m.output,
        'tokens', m.tokens, 'usd', round(m.usd, 4), 'priced', m.priced
      ) order by m.usd desc, m.tokens desc)
      from public._priced(p_period, pr.id) m
    ), '[]'::jsonb),
    'daily', (
      select jsonb_agg(jsonb_build_object('day', d.day::date, 'usd', round(coalesce(x.usd, 0), 2), 'tokens', coalesce(x.tokens, 0)) order by d.day)
      from generate_series(
        ((now() at time zone 'utc')::date - 29)::timestamp,
        ((now() at time zone 'utc')::date)::timestamp,
        interval '1 day'
      ) as d(day)
      left join (
        select a.day, sum(a.tokens) as tokens,
          sum(a.input * coalesce(p1.input, p2.input, 0)
            + a.cache_read * coalesce(p1.cache_read, p2.cache_read, 0)
            + a.cache_write_5m * coalesce(p1.cache_write_5m, p2.cache_write_5m, 0)
            + a.cache_write_1h * coalesce(p1.cache_write_1h, p2.cache_write_1h, 0)
            + a.output * coalesce(p1.output, p2.output, 0)) as usd
        from (
          select (b.ts at time zone 'utc')::date as day, b.model,
            sum(b.input) as input, sum(b.cache_read) as cache_read,
            sum(b.cache_write_5m) as cache_write_5m, sum(b.cache_write_1h) as cache_write_1h,
            sum(b.output) as output,
            sum(b.input + b.cache_read + b.cache_write_5m + b.cache_write_1h + b.output) as tokens
          from public.buckets b
          where b.user_id = pr.id and b.ts >= now() - interval '31 days'
          group by 1, 2
        ) a
        left join public.model_prices p1 on p1.model = a.model
        left join public.model_prices p2 on p1.model is null and p2.model = public.model_key(a.model)
        group by a.day
      ) x on x.day = d.day::date
    )
  ) into result;
  return result;
end $$;

-- Badge numbers. Null if the handle does not exist; {public:false} if it is private.
drop function if exists public.badge_stats(text, text);
create function public.badge_stats(p_handle text, p_period text default 'week')
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  pr public.profiles%rowtype;
  v_usd numeric; v_tokens bigint; v_days numeric;
  plan_cost numeric;
  my_rank int;
begin
  select * into pr from public.profiles where handle = lower(p_handle);
  if not found then return null; end if;
  if not pr.public then return jsonb_build_object('public', false); end if;

  select s.api_equiv_usd, s.tokens_total, s.period_days into v_usd, v_tokens, v_days
  from public._period_stats(p_period, pr.id) s;
  if not found then
    return jsonb_build_object('public', true, 'api_equiv_usd', 0, 'roi', null, 'rank', null);
  end if;
  plan_cost := public.plans_monthly_usd(pr.plans) * v_days / 30.4375;
  select count(*)::int + 1 into my_rank
  from public._period_stats(p_period) o
  join public.profiles op on op.id = o.user_id
  where op.public and o.api_equiv_usd > v_usd;

  return jsonb_build_object(
    'public', true,
    'api_equiv_usd', round(v_usd, 2),
    'roi', case when plan_cost > 0 then round(v_usd / plan_cost, 2) end,
    'rank', case when v_tokens > 0 then my_rank end
  );
end $$;

-- Everything /orgs/[slug] shows. Members appear only if their profile is public or the viewer
-- is a member. The org total counts every member: joining an org is consent to that.
drop function if exists public.org_page(text, text);
create function public.org_page(p_slug text, p_period text default 'month')
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  o public.orgs%rowtype;
  v_member boolean;
begin
  select * into o from public.orgs where slug = lower(p_slug);
  if not found then return null; end if;
  v_member := public.is_org_member(o.id);
  if not o.public and not v_member then return null; end if;

  return (
    with ms as (
      select m.user_id, m.role, p.handle, p.display_name, p.avatar_url, p.public,
             coalesce(s.api_equiv_usd, 0) as usd, coalesce(s.tokens_total, 0) as tokens
      from public.org_members m
      join public.profiles p on p.id = m.user_id
      left join public._period_stats(p_period) s on s.user_id = m.user_id
      where m.org_id = o.id
    )
    select jsonb_build_object(
      'slug', o.slug,
      'name', o.name,
      'public', o.public,
      'period', p_period,
      'is_member', v_member,
      'is_owner', coalesce(o.owner_id = auth.uid(), false),
      'invite_code', case when v_member then o.invite_code end,
      'member_count', (select count(*) from ms),
      'api_equiv_usd', (select round(coalesce(sum(ms.usd), 0), 2) from ms),
      'tokens_total', (select coalesce(sum(ms.tokens), 0) from ms),
      'hidden_members', (select count(*) from ms where not (ms.public or v_member)),
      'members', coalesce((
        select jsonb_agg(jsonb_build_object(
          'handle', ms.handle, 'display_name', ms.display_name, 'avatar_url', ms.avatar_url,
          'role', ms.role, 'public', ms.public, 'api_equiv_usd', round(ms.usd, 2), 'tokens_total', ms.tokens
        ) order by ms.usd desc, ms.handle)
        from ms where ms.public or v_member
      ), '[]'::jsonb)
    )
  );
end $$;

-- Orgs the signed-in user belongs to, for /me.
drop function if exists public.my_orgs();
create function public.my_orgs()
returns table (slug text, name text, role text, public boolean, invite_code text, member_count int)
language sql stable security definer set search_path = '' as $$
  select o.slug, o.name, m.role, o.public, o.invite_code,
         (select count(*)::int from public.org_members mm where mm.org_id = o.id)
  from public.org_members m
  join public.orgs o on o.id = m.org_id
  where m.user_id = auth.uid()
  order by o.name
$$;

create or replace function public.create_org(p_slug text, p_name text, p_public boolean default true)
returns text language plpgsql volatile security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
  new_id uuid;
begin
  if uid is null then raise exception 'sign in first' using errcode = '42501'; end if;
  if not exists (select 1 from public.profiles where id = uid) then
    raise exception 'choose a handle first' using errcode = '42501';
  end if;
  insert into public.orgs (slug, name, owner_id, public)
  values (lower(p_slug), btrim(p_name), uid, coalesce(p_public, true))
  returning id into new_id;
  insert into public.org_members (org_id, user_id, role) values (new_id, uid, 'owner');
  return lower(p_slug);
end $$;

create or replace function public.join_org(p_code text)
returns text language plpgsql volatile security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
  o public.orgs%rowtype;
begin
  if uid is null then raise exception 'sign in first' using errcode = '42501'; end if;
  if not exists (select 1 from public.profiles where id = uid) then
    raise exception 'choose a handle first' using errcode = '42501';
  end if;
  select * into o from public.orgs where invite_code = upper(btrim(p_code));
  if not found then raise exception 'no org has that invite code' using errcode = 'P0002'; end if;
  insert into public.org_members (org_id, user_id) values (o.id, uid) on conflict do nothing;
  return o.slug;
end $$;

-- ============================================================ service-role functions

-- Hands the plaintext token to the polling CLI exactly once. The `token_plain is not null`
-- predicate is re-checked under the row lock, so two concurrent polls cannot both win.
drop function if exists public.consume_link_code(text);
create function public.consume_link_code(p_code text)
returns table (token text, handle text)
language sql volatile security definer set search_path = '' as $$
  with prev as (
    select lc.code, lc.token_plain, lc.user_id from public.link_codes lc where lc.code = p_code
  ), upd as (
    update public.link_codes lc
    set token_plain = null, consumed_at = now()
    from prev
    where lc.code = prev.code
      and lc.token_plain is not null
      and lc.consumed_at is null
      and lc.expires_at > now()
    returning prev.token_plain, prev.user_id
  )
  select upd.token_plain, p.handle from upd join public.profiles p on p.id = upd.user_id
$$;

-- POST /api/v1/push with `replaceDevice: true`: drop every row the device holds and write the
-- batch, in one transaction, so a push that changes granularity never double counts. The user
-- comes from the device row, never from the payload. Returns the number of rows written.
create or replace function public.replace_device_buckets(p_device uuid, p_rows jsonb)
returns int language plpgsql volatile security definer set search_path = '' as $$
declare
  v_user uuid;
  n int;
begin
  select d.user_id into v_user from public.devices d where d.id = p_device;
  if v_user is null then raise exception 'no such device' using errcode = 'P0002'; end if;
  if jsonb_typeof(p_rows) is distinct from 'array' then
    raise exception 'p_rows must be a JSON array' using errcode = '22023';
  end if;

  delete from public.buckets b where b.device_id = p_device;

  insert into public.buckets (
    user_id, device_id, ts, source, model, granularity,
    input, cache_read, cache_write_5m, cache_write_1h, output, reasoning, requests, conversations
  )
  select v_user, p_device, r.ts, r.source, r.model, coalesce(r.granularity, 'hour'),
    coalesce(r.input, 0), coalesce(r.cache_read, 0), coalesce(r.cache_write_5m, 0),
    coalesce(r.cache_write_1h, 0), coalesce(r.output, 0), coalesce(r.reasoning, 0),
    coalesce(r.requests, 0), coalesce(r.conversations, 0)
  from jsonb_to_recordset(p_rows) as r(
    ts timestamptz, source text, model text, granularity text,
    input bigint, cache_read bigint, cache_write_5m bigint, cache_write_1h bigint,
    output bigint, reasoning bigint, requests int, conversations int
  )
  on conflict (device_id, ts, source, model) do update set
    granularity = excluded.granularity, input = excluded.input, cache_read = excluded.cache_read,
    cache_write_5m = excluded.cache_write_5m, cache_write_1h = excluded.cache_write_1h,
    output = excluded.output, reasoning = excluded.reasoning, requests = excluded.requests,
    conversations = excluded.conversations;
  get diagnostics n = row_count;
  return n;
end $$;

-- One impression per server render of a sponsored slot. Called fire-and-forget with the
-- service role; exactness is not required.
create or replace function public.record_sponsor_impression(p_sponsor uuid, p_placement text, p_count int default 1)
returns void language sql volatile security definer set search_path = '' as $$
  insert into public.sponsor_impressions (sponsor_id, day, placement, count)
  values (p_sponsor, (now() at time zone 'utc')::date, p_placement, greatest(coalesce(p_count, 1), 1))
  on conflict (sponsor_id, day, placement)
  do update set count = public.sponsor_impressions.count + excluded.count
$$;

-- Housekeeping for /api/cron/refresh: an expired, never-collected code revokes the token it
-- minted, and drops the device if nothing was ever pushed from it. Old rows are deleted.
create or replace function public.cleanup_link_codes()
returns int language plpgsql volatile security definer set search_path = '' as $$
declare
  n int;
begin
  delete from public.api_tokens t
  using public.link_codes lc
  where lc.device_id = t.device_id and lc.consumed_at is null and lc.expires_at < now();

  delete from public.devices d
  using public.link_codes lc
  where lc.device_id = d.id and lc.consumed_at is null and lc.expires_at < now()
    and d.last_push_at is null;

  delete from public.link_codes lc where lc.expires_at < now() - interval '1 day';
  get diagnostics n = row_count;
  return n;
end $$;

-- ================================================================================ grants
-- Postgres grants EXECUTE to PUBLIC on every new function, and Supabase adds anon and
-- authenticated. Take it all back, then grant exactly what each role needs.
revoke execute on function public._priced(text, uuid) from public, anon, authenticated;
revoke execute on function public._period_stats(text, uuid) from public, anon, authenticated;
revoke execute on function public.consume_link_code(text) from public, anon, authenticated;
revoke execute on function public.cleanup_link_codes() from public, anon, authenticated;
revoke execute on function public.create_org(text, text, boolean) from public, anon;
revoke execute on function public.join_org(text) from public, anon;
revoke execute on function public.my_orgs() from public, anon;
revoke execute on function public.replace_device_buckets(uuid, jsonb) from public, anon, authenticated;
revoke execute on function public.record_sponsor_impression(uuid, text, int) from public, anon, authenticated;

grant execute on function public.consume_link_code(text) to service_role;
grant execute on function public.cleanup_link_codes() to service_role;
grant execute on function public.replace_device_buckets(uuid, jsonb) to service_role;
grant execute on function public.record_sponsor_impression(uuid, text, int) to service_role;
grant execute on function public.create_org(text, text, boolean) to authenticated;
grant execute on function public.join_org(text) to authenticated;
grant execute on function public.my_orgs() to authenticated;

grant execute on function public.user_period_stats(text) to anon, authenticated;
grant execute on function public.leaderboard(text, text) to anon, authenticated;
grant execute on function public.org_leaderboard(text) to anon, authenticated;
grant execute on function public.site_stats() to anon, authenticated;
grant execute on function public.profile_page(text, text) to anon, authenticated;
grant execute on function public.badge_stats(text, text) to anon, authenticated;
grant execute on function public.org_page(text, text) to anon, authenticated;

-- Tell PostgREST to pick up new functions and grants now rather than on its next poll.
notify pgrst, 'reload schema';
