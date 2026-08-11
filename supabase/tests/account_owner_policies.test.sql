begin;

create extension if not exists pgtap with schema extensions;
set local search_path = extensions, public, auth, pg_catalog;

select plan(19);

select policies_are(
  'public',
  'subscriptions',
  array['Users can view their own subscription'],
  'subscriptions retains exactly its owner SELECT policy'
);
select policies_are(
  'public',
  'founding_members',
  array['Users can view their own founding member status'],
  'founding_members retains exactly its owner SELECT policy'
);
insert into public.subscriptions (
  user_id,
  stripe_customer_id,
  stripe_subscription_id,
  status,
  plan
) values
  (
    '11111111-1111-4111-8111-111111111111',
    'cus_owner_policy_a',
    'sub_owner_policy_a',
    'active',
    'plus-monthly'
  ),
  (
    '22222222-2222-4222-8222-222222222222',
    'cus_owner_policy_b',
    'sub_owner_policy_b',
    'active',
    'plus-annual'
  );

insert into public.founding_members (user_id)
values
  ('11111111-1111-4111-8111-111111111111'),
  ('22222222-2222-4222-8222-222222222222');

set local role authenticated;
set local request.jwt.claim.role = 'authenticated';
set local request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';

select results_eq(
  $$select count(*) from public.subscriptions$$,
  array[1::bigint],
  'user A sees one subscription'
);
select results_eq(
  $$select user_id from public.subscriptions$$,
  $$values ('11111111-1111-4111-8111-111111111111'::uuid)$$,
  'user A sees only their subscription'
);
select results_eq(
  $$select count(*) from public.founding_members$$,
  array[1::bigint],
  'user A sees one founding-member row'
);
select results_eq(
  $$select user_id from public.founding_members$$,
  $$values ('11111111-1111-4111-8111-111111111111'::uuid)$$,
  'user A sees only their founding-member row'
);
select results_eq(
  $$
    update public.subscriptions
    set plan = 'tampered'
    returning 1
  $$,
  $$select 1 where false$$,
  'user A still cannot update a subscription'
);
select results_eq(
  $$
    delete from public.founding_members
    returning 1
  $$,
  $$select 1 where false$$,
  'user A still cannot delete a founding-member row'
);

set local request.jwt.claim.sub = '22222222-2222-4222-8222-222222222222';

select results_eq(
  $$select count(*) from public.subscriptions$$,
  array[1::bigint],
  'user B sees one subscription'
);
select results_eq(
  $$select user_id from public.subscriptions$$,
  $$values ('22222222-2222-4222-8222-222222222222'::uuid)$$,
  'user B sees only their subscription'
);
select results_eq(
  $$select count(*) from public.founding_members$$,
  array[1::bigint],
  'user B sees one founding-member row'
);
select results_eq(
  $$select user_id from public.founding_members$$,
  $$values ('22222222-2222-4222-8222-222222222222'::uuid)$$,
  'user B sees only their founding-member row'
);

set local role anon;
reset request.jwt.claim.sub;
set local request.jwt.claim.role = 'anon';

select results_eq(
  $$select count(*) from public.subscriptions$$,
  array[0::bigint],
  'an unauthenticated client sees no subscriptions'
);
select results_eq(
  $$select count(*) from public.founding_members$$,
  array[0::bigint],
  'an unauthenticated client sees no founding-member rows'
);

set local role service_role;
set local request.jwt.claim.role = 'service_role';

select results_eq(
  $$select count(*) from public.subscriptions$$,
  array[2::bigint],
  'service role still sees all subscriptions'
);
select results_eq(
  $$select count(*) from public.founding_members$$,
  array[2::bigint],
  'service role still sees all founding-member rows'
);

reset role;

select results_eq(
  $$
    select count(*)
    from pg_catalog.pg_policies
    where schemaname = 'public'
      and tablename = 'subscriptions'
      and cmd = 'SELECT'
      and roles = array['public']::name[]
  $$,
  array[1::bigint],
  'the subscription policy remains a public-role SELECT policy'
);
select results_eq(
  $$
    select count(*)
    from pg_catalog.pg_policies
    where schemaname = 'public'
      and tablename = 'founding_members'
      and cmd = 'SELECT'
      and roles = array['public']::name[]
  $$,
  array[1::bigint],
  'the founding-member policy remains a public-role SELECT policy'
);
select results_eq(
  $$
    select count(*)
    from pg_catalog.pg_policies
    where schemaname = 'public'
      and tablename in ('subscriptions', 'founding_members')
      and permissive = 'PERMISSIVE'
  $$,
  array[2::bigint],
  'both owner policies remain permissive'
);

select * from finish();
rollback;
