begin;

create extension if not exists pgtap with schema extensions;
set local search_path = extensions, public, auth, pg_catalog;

select plan(14);

select policies_are(
  'public',
  'state_backups',
  array[
    'Plus users can insert their own state backup',
    'Plus users can view their own state backup'
  ],
  'state backups retain only append-only browser policies'
);
select ok(
  not pg_catalog.has_table_privilege(
    'public',
    'public.state_backups',
    'UPDATE'
  )
  and not pg_catalog.has_table_privilege(
    'anon',
    'public.state_backups',
    'UPDATE'
  )
  and not pg_catalog.has_table_privilege(
    'authenticated',
    'public.state_backups',
    'UPDATE'
  ),
  'browser roles cannot update immutable backups'
);
select ok(
  pg_catalog.has_column_privilege(
    'authenticated',
    'public.state_backups',
    'user_id',
    'INSERT'
  )
  and pg_catalog.has_column_privilege(
    'authenticated',
    'public.state_backups',
    'state_json',
    'INSERT'
  ),
  'authenticated clients retain the narrow backup insert grant'
);
select results_eq(
  $$
    select count(*)
    from pg_catalog.pg_policies
    where schemaname = 'public'
      and tablename = 'state_backups'
      and policyname = 'Plus users can view their own state backup'
      and qual like '%past_due_since > (now() -%7 days%'
  $$,
  array[1::bigint],
  'the read policy contains the seven-day past-due window'
);
select results_eq(
  $$
    select count(*)
    from pg_catalog.pg_policies
    where schemaname = 'public'
      and tablename = 'state_backups'
      and policyname = 'Plus users can insert their own state backup'
      and with_check like '%past_due_since > (now() -%7 days%'
  $$,
  array[1::bigint],
  'the insert policy contains the seven-day past-due window'
);

insert into auth.users (id, email) values
  ('a1111111-1111-4111-8111-111111111111', 'active-backup@example.com'),
  ('b2222222-2222-4222-8222-222222222222', 'recent-past-due@example.com'),
  ('c3333333-3333-4333-8333-333333333333', 'expired-past-due@example.com'),
  ('d4444444-4444-4444-8444-444444444444', 'missing-past-due@example.com');

insert into public.subscriptions (
  user_id,
  stripe_customer_id,
  stripe_subscription_id,
  status,
  plan,
  past_due_since
) values
  (
    'a1111111-1111-4111-8111-111111111111',
    'cus_backup_active',
    'sub_backup_active',
    'active',
    'plus-monthly',
    null
  ),
  (
    'b2222222-2222-4222-8222-222222222222',
    'cus_backup_recent',
    'sub_backup_recent',
    'past_due',
    'plus-monthly',
    now() - interval '6 days'
  ),
  (
    'c3333333-3333-4333-8333-333333333333',
    'cus_backup_expired',
    'sub_backup_expired',
    'past_due',
    'plus-monthly',
    now() - interval '8 days'
  ),
  (
    'd4444444-4444-4444-8444-444444444444',
    'cus_backup_missing',
    'sub_backup_missing',
    'past_due',
    'plus-monthly',
    null
  );

insert into public.state_backups (user_id, state_json) values
  ('a1111111-1111-4111-8111-111111111111', '{"source":"service"}'::jsonb),
  ('b2222222-2222-4222-8222-222222222222', '{"source":"service"}'::jsonb),
  ('c3333333-3333-4333-8333-333333333333', '{"source":"service"}'::jsonb),
  ('d4444444-4444-4444-8444-444444444444', '{"source":"service"}'::jsonb);

set local role authenticated;
set local request.jwt.claim.role = 'authenticated';

set local request.jwt.claim.sub = 'a1111111-1111-4111-8111-111111111111';
select results_eq(
  $$select count(*) from public.state_backups$$,
  array[1::bigint],
  'an active subscriber can read their backup'
);
select lives_ok(
  $$insert into public.state_backups (user_id, state_json) values ('a1111111-1111-4111-8111-111111111111', '{"source":"browser"}'::jsonb)$$,
  'an active subscriber can append a backup'
);

set local request.jwt.claim.sub = 'b2222222-2222-4222-8222-222222222222';
select results_eq(
  $$select count(*) from public.state_backups$$,
  array[1::bigint],
  'a recently past-due subscriber remains inside the grace window'
);
select lives_ok(
  $$insert into public.state_backups (user_id, state_json) values ('b2222222-2222-4222-8222-222222222222', '{"source":"browser"}'::jsonb)$$,
  'a recently past-due subscriber can append during grace'
);

set local request.jwt.claim.sub = 'c3333333-3333-4333-8333-333333333333';
select results_eq(
  $$select count(*) from public.state_backups$$,
  array[0::bigint],
  'an expired past-due subscriber cannot read cloud backups'
);
select throws_ok(
  $$insert into public.state_backups (user_id, state_json) values ('c3333333-3333-4333-8333-333333333333', '{"source":"browser"}'::jsonb)$$,
  '42501',
  'new row violates row-level security policy for table "state_backups"',
  'an expired past-due subscriber cannot append a backup'
);

set local request.jwt.claim.sub = 'd4444444-4444-4444-8444-444444444444';
select results_eq(
  $$select count(*) from public.state_backups$$,
  array[0::bigint],
  'a past-due subscriber without a grace timestamp cannot read backups'
);
select throws_ok(
  $$insert into public.state_backups (user_id, state_json) values ('d4444444-4444-4444-8444-444444444444', '{"source":"browser"}'::jsonb)$$,
  '42501',
  'new row violates row-level security policy for table "state_backups"',
  'a past-due subscriber without a grace timestamp cannot append a backup'
);

set local request.jwt.claim.sub = 'a1111111-1111-4111-8111-111111111111';
select throws_ok(
  $$update public.state_backups set state_json = '{"tampered":true}'::jsonb$$,
  '42501',
  'permission denied for table state_backups',
  'browser clients cannot mutate an existing backup'
);

reset role;

select * from finish();
rollback;
