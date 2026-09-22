-- Exercises the leaderboard SQL, pricing joins, RLS and the link-code handoff.
-- Runs in one transaction and rolls back, so it leaves nothing behind. Needs schema.sql
-- applied first. Safe on a live project (test rows use tm-test-* handles and are rolled back),
-- but prefer a branch or local database.
--
--   psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 -f supabase/schema.test.sql
--
-- `npm test` runs it automatically when SUPABASE_DB_URL is set and psql is on PATH.

begin;

create temp table t_ids as select
  '00000000-0000-4000-8000-00000000000a'::uuid as alice,
  '00000000-0000-4000-8000-00000000000b'::uuid as bob,
  '00000000-0000-4000-8000-00000000000c'::uuid as carol,
  '00000000-0000-4000-8000-0000000000da'::uuid as dev_a,
  '00000000-0000-4000-8000-0000000000db'::uuid as dev_b,
  '00000000-0000-4000-8000-0000000000dc'::uuid as dev_c,
  to_timestamp(floor(extract(epoch from now()) / 3600) * 3600) - interval '1 hour' as h;
grant select on t_ids to anon, authenticated;

insert into auth.users (id) select alice from t_ids union all select bob from t_ids union all select carol from t_ids;

insert into public.profiles (id, handle, public, plans)
select alice, 'tm-test-alice', true, '{"claude":"max-20x"}'::jsonb from t_ids
union all select bob, 'tm-test-bob', true, '{}'::jsonb from t_ids
union all select carol, 'tm-test-carol', false, '{"claude":"pro"}'::jsonb from t_ids;

insert into public.devices (id, user_id, name)
select dev_a, alice, 'a' from t_ids
union all select dev_b, bob, 'b' from t_ids
union all select dev_c, carol, 'c' from t_ids;

-- Prices used below, pinned here so the test does not depend on the seed being applied.
insert into public.model_prices values
  ('claude-fable-5-1', 0.00001, 2.5e-7, 0.0000125, 0.00002, 0.00005, current_date),
  ('tm-test-model', 0.000001, 0.000001, 0.000001, 0.000001, 0.00001, current_date)
on conflict (model) do update set input = excluded.input, cache_read = excluded.cache_read,
  cache_write_5m = excluded.cache_write_5m, cache_write_1h = excluded.cache_write_1h, output = excluded.output;

insert into public.buckets (user_id, device_id, ts, source, model, input, cache_read, cache_write_5m, cache_write_1h, output, requests)
-- alice: the CLI's ccusage sanity row, $125.97
select alice, dev_a, h, 'claude', 'claude-fable-5-1', 21721, 221663704, 3570946, 0, 513976, 10 from t_ids
-- alice, 40 days ago: $1, only counts for `all`
union all select alice, dev_a, h - interval '40 days', 'claude', 'tm-test-model', 1000000, 0, 0, 0, 0, 1 from t_ids
-- bob: $2 exact, $0.50 via the normalised key, 5000 unpriced tokens
union all select bob, dev_b, h, 'codex', 'tm-test-model', 1000000, 0, 0, 0, 100000, 1 from t_ids
union all select bob, dev_b, h, 'claude', 'anthropic/claude-fable-5.1-20260101', 0, 0, 0, 0, 10000, 1 from t_ids
union all select bob, dev_b, h, 'gemini', 'tm-test-mystery-model', 5000, 0, 0, 0, 0, 1 from t_ids
-- carol (private): $100
union all select carol, dev_c, h, 'claude', 'tm-test-model', 0, 0, 0, 0, 10000000, 1 from t_ids;

-- Same cases as KEY_CASES in scripts/seed-prices.test.ts.
do $$
declare c record;
begin
  for c in select * from (values
    ('anthropic/Claude-Fable-5.1-20260101', 'claude-fable-5-1'),
    ('us.anthropic.claude-opus-5-5-v1:0', 'claude-opus-5-5'),
    ('gpt-5.1-codex-max', 'gpt-5-1-codex-max'),
    ('claude-opus-5-5', 'claude-opus-5-5'),
    ('gemini-3.1-pro@20260301', 'gemini-3-1-pro'),
    ('gpt-6-astra-2026-08-01', 'gpt-6-astra'),
    ('  Mixed.Case.Name  ', 'mixed.case.name')
  ) as t(input, expected) loop
    if public.model_key(c.input) is distinct from c.expected then
      raise exception 'model_key(%) = %, expected %', c.input, public.model_key(c.input), c.expected;
    end if;
  end loop;
end $$;

-- -------------------------------------------------------------- leaderboards (as anon)
set local role anon;

do $$
declare r record; n int;
begin
  -- value
  select count(*) into n from public.leaderboard('week', 'value') where handle like 'tm-test-%';
  if n <> 2 then raise exception 'value: expected 2 test rows (carol is private), got %', n; end if;
  select * into r from public.leaderboard('week', 'value') where handle = 'tm-test-alice';
  if r.api_equiv_usd not between 125.96 and 125.98 then raise exception 'value: alice usd %', r.api_equiv_usd; end if;
  if r.tokens_total <> 225770347 then raise exception 'value: alice tokens %', r.tokens_total; end if;
  if (select rank from public.leaderboard('week', 'value') where handle = 'tm-test-bob') <= r.rank then
    raise exception 'value: bob should rank below alice';
  end if;
  select * into r from public.leaderboard('week', 'value') where handle = 'tm-test-bob';
  if r.api_equiv_usd <> 2.5 then raise exception 'value: bob usd % (normalised key not priced?)', r.api_equiv_usd; end if;
  if r.unpriced_tokens <> 5000 then raise exception 'value: bob unpriced %', r.unpriced_tokens; end if;
  if r.sources <> array['claude', 'codex', 'gemini'] then raise exception 'value: bob sources %', r.sources; end if;

  -- roi: prorated plan cost, users with a plan only
  if exists (select 1 from public.leaderboard('week', 'roi') where handle = 'tm-test-bob') then
    raise exception 'roi: bob has no plan and must not be ranked';
  end if;
  select * into r from public.leaderboard('week', 'roi') where handle = 'tm-test-alice';
  if abs(r.roi - 125.968 / (200 * 7 / 30.4375)) > 0.01 then raise exception 'roi: alice %', r.roi; end if;

  -- efficiency: output per dollar, min $5 spend
  if exists (select 1 from public.leaderboard('week', 'efficiency') where handle = 'tm-test-bob') then
    raise exception 'efficiency: bob spent under $5 and must not be ranked';
  end if;
  select * into r from public.leaderboard('week', 'efficiency') where handle = 'tm-test-alice';
  if abs(r.efficiency - 513976 / 125.968) > 1 then raise exception 'efficiency: alice %', r.efficiency; end if;

  -- volume
  if (select rank from public.leaderboard('week', 'volume') where handle = 'tm-test-alice')
     >= (select rank from public.leaderboard('week', 'volume') where handle = 'tm-test-bob') then
    raise exception 'volume: alice should outrank bob';
  end if;

  -- all-time includes the 40-day-old row
  select * into r from public.leaderboard('all', 'value') where handle = 'tm-test-alice';
  if r.api_equiv_usd not between 126.96 and 126.98 then raise exception 'all: alice usd %', r.api_equiv_usd; end if;

  -- bad input is an error, not an empty board
  begin
    perform * from public.leaderboard('fortnight', 'value');
    raise exception 'period check missing';
  exception when invalid_parameter_value then null;
  end;

  -- user_period_stats hides private users from anon
  if exists (select 1 from public.user_period_stats('week') where handle = 'tm-test-carol') then
    raise exception 'user_period_stats leaked a private user';
  end if;

  -- site tiles
  select * into r from public.site_stats();
  if r.week_usd < 128.47 then raise exception 'site_stats week_usd %', r.week_usd; end if;
  if r.users_tracking < 3 then raise exception 'site_stats users_tracking %', r.users_tracking; end if;

  -- profile pages
  if public.profile_page('tm-test-carol', 'week') is not null then raise exception 'private profile visible to anon'; end if;
  if jsonb_array_length(public.profile_page('tm-test-bob', 'week') -> 'models') <> 3 then
    raise exception 'profile models %', public.profile_page('tm-test-bob', 'week') -> 'models';
  end if;
  if jsonb_array_length(public.profile_page('tm-test-bob', 'week') -> 'daily') <> 30 then
    raise exception 'profile daily series should have 30 days';
  end if;

  -- badges
  if (public.badge_stats('tm-test-carol', 'week') ->> 'public')::boolean then raise exception 'badge: carol should be private'; end if;
  if public.badge_stats('tm-test-nobody', 'week') is not null then raise exception 'badge: unknown handle should be null'; end if;
  if public.badge_stats('tm-test-alice', 'week') ->> 'roi' is null then raise exception 'badge: alice roi missing'; end if;

  -- RLS: anon sees no bucket rows and no private profiles
  select count(*) into n from public.buckets;
  if n <> 0 then raise exception 'anon can read % bucket rows', n; end if;
  if exists (select 1 from public.profiles where handle = 'tm-test-carol') then raise exception 'anon can read a private profile'; end if;
  select count(*) into n from public.api_tokens;
  raise exception 'anon can read api_tokens';
exception
  when insufficient_privilege then null; -- expected from the api_tokens read above
end $$;

reset role;

-- --------------------------------------------------------------- signed-in users
select set_config('request.jwt.claims', json_build_object('sub', carol, 'role', 'authenticated')::text, true) from t_ids;
set local role authenticated;

do $$
begin
  if public.profile_page('tm-test-carol', 'week') is null then raise exception 'carol cannot see her own private profile'; end if;
  if not (public.profile_page('tm-test-carol', 'week') ->> 'is_you')::boolean then raise exception 'is_you should be true'; end if;
  if (select count(*) from public.buckets) <> 1 then raise exception 'carol should read exactly her 1 bucket row'; end if;
  begin
    update public.profiles set handle = 'tm-test-carol2' where handle = 'tm-test-carol';
    raise exception 'handle should not be updatable';
  exception when insufficient_privilege then null;
  end;
  update public.profiles set plans = '{"claude":"max-5x"}' where handle = 'tm-test-carol';
  if not found then raise exception 'carol could not update her plans'; end if;
  update public.profiles set public = true where handle = 'tm-test-bob';
  if found then raise exception 'carol updated bob'; end if;
end $$;

reset role;

-- --------------------------------------------------------------------------- orgs
select set_config('request.jwt.claims', json_build_object('sub', alice, 'role', 'authenticated')::text, true) from t_ids;
set local role authenticated;
select public.create_org('tm-test-org', 'Test Org', true);
reset role;

create temp table t_org as select invite_code from public.orgs where slug = 'tm-test-org';
grant select on t_org to authenticated;

select set_config('request.jwt.claims', json_build_object('sub', carol, 'role', 'authenticated')::text, true) from t_ids;
set local role authenticated;
select public.join_org((select invite_code from t_org));
do $$
begin
  if (public.org_page('tm-test-org', 'week') ->> 'invite_code') is null then raise exception 'members should see the invite code'; end if;
  if jsonb_array_length(public.org_page('tm-test-org', 'week') -> 'members') <> 2 then raise exception 'members should see every member'; end if;
end $$;
reset role;

select set_config('request.jwt.claims', '', true);
set local role anon;
do $$
declare o jsonb := public.org_page('tm-test-org', 'week');
begin
  if o ->> 'invite_code' is not null then raise exception 'anon sees invite code'; end if;
  if jsonb_array_length(o -> 'members') <> 1 then raise exception 'anon should see only the public member: %', o -> 'members'; end if;
  if (o ->> 'hidden_members')::int <> 1 then raise exception 'hidden_members %', o ->> 'hidden_members'; end if;
  if (o ->> 'api_equiv_usd')::numeric not between 225.96 and 225.98 then raise exception 'org total %', o ->> 'api_equiv_usd'; end if;
  if (select member_count from public.org_leaderboard('week') where slug = 'tm-test-org') <> 2 then raise exception 'org_leaderboard member_count'; end if;
  begin
    perform invite_code from public.orgs;
    raise exception 'anon can select orgs.invite_code';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.consume_link_code('ABCDEFGH');
    raise exception 'anon can call consume_link_code';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;

-- ----------------------------------------------------------------- link-code handoff
insert into public.link_codes (code, user_id, token_plain, device_id)
select 'ABCDEFGH', alice, 'tmx_test_plain', dev_a from t_ids;

do $$
declare r record; n int;
begin
  select * into r from public.consume_link_code('ABCDEFGH');
  if r.token is distinct from 'tmx_test_plain' or r.handle is distinct from 'tm-test-alice' then
    raise exception 'first poll should return the token, got %', r;
  end if;
  select count(*) into n from public.consume_link_code('ABCDEFGH');
  if n <> 0 then raise exception 'second poll must return nothing'; end if;
  if (select token_plain from public.link_codes where code = 'ABCDEFGH') is not null then raise exception 'plaintext not nulled'; end if;
  begin
    insert into public.link_codes (code) values ('ABCDEFG0');
    raise exception 'link code alphabet check missing';
  exception when check_violation then null;
  end;
  begin
    insert into public.buckets (user_id, device_id, ts, source, model)
    select alice, dev_a, h + interval '30 minutes', 'claude', 'x' from t_ids;
    raise exception 'whole-hour check missing';
  exception when check_violation then null;
  end;
end $$;

select 'schema.test.sql: all assertions passed' as result;
rollback;
