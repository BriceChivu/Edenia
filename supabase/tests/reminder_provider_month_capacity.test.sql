begin;
create extension if not exists pgtap with schema extensions;
set local search_path=extensions,public,auth,pg_catalog;
select no_plan();
\ir helpers/reminder_521_fixtures.sql

-- All times are past, transaction-local fixtures. A provider cycle ending on
-- the 12th includes this September reservation in its October usage period.
-- No learner record or real provider send is needed for capacity accounting.
select pg_temp.email_capacity('2026-10-10T11:00:00Z',0,1799);
select is(private.reminder_capacity_slots('2026-10-10T11:00:00Z'),1,
 '1799 provider-month sends leave one optional slot before unknown reservations');
select ok(not has_function_privilege('authenticated','private.reminder_capacity_slots(timestamptz,uuid)','execute'),
 'function replacement preserves browser execution denial');
select ok(not has_function_privilege('service_role','private.reminder_capacity_slots(timestamptz,uuid)','execute'),
 'function replacement preserves private internal-only execution');

insert into private.reminder_quota_reservations(delivery_id,utc_date,reserved_at,consumed_at)
values('52161000-0000-4000-8000-000000000001','2026-09-20',
 '2026-09-20T11:00:00Z','2026-09-20T11:00:00Z');
select is(private.reminder_capacity_slots('2026-10-10T11:00:00Z'),0,
 'previous-calendar-month uncertain send within31days consumes final provider-month slot');
select is(private.reminder_capacity_reason('2026-10-10T11:00:00Z'),'capacity_exhausted',
 'cross-calendar-month uncertainty is reported as exhausted capacity');
select ok(not private.reserve_reminder_capacity('52161000-0000-4000-8000-000000000002','2026-10-10T11:00:00Z'),
 'actual reservation boundary cannot spend the provider-month slot already held by uncertainty');
select is((select count(*) from private.reminder_quota_reservations),1::bigint,
 'rejected reservation leaves the uncertainty ledger intact without minting another slot');

update private.reminder_quota_reservations set provider_observed_at='2026-10-10T10:59:00Z';
select is(private.reminder_capacity_slots('2026-10-10T11:00:00Z'),1,
 'exact provider-observed send is included in shared usage and not subtracted a second time');

-- Expiry uses the full timestamp, not utc_date or a calendar-month boundary.
update private.reminder_quota_reservations set provider_observed_at=null,
 utc_date='2026-09-09',reserved_at='2026-09-09T11:00:00.000001Z',consumed_at='2026-09-09T11:00:00.000001Z';
select is(private.reminder_capacity_slots('2026-10-10T11:00:00Z'),0,
 'uncertainty one microsecond inside31days still consumes provider-month headroom');
update private.reminder_quota_reservations set reserved_at='2026-09-09T11:00:00Z',consumed_at='2026-09-09T11:00:00Z';
select is(private.reminder_capacity_slots('2026-10-10T11:00:00Z'),1,
 'exactly31day-old uncertainty expires consistently with the existing rolling product cap');
update private.reminder_quota_reservations set reserved_at='2026-09-09T10:59:59.999999Z',consumed_at='2026-09-09T10:59:59.999999Z';
select is(private.reminder_capacity_slots('2026-10-10T11:00:00Z'),1,
 'uncertainty more than31days old does not consume current provider-month headroom');

update private.reminder_quota_reservations set utc_date='2026-09-20',
 reserved_at='2026-09-20T11:00:00Z',consumed_at=null,released_at='2026-09-20T11:00:01Z';
select is(private.reminder_capacity_slots('2026-10-10T11:00:00Z'),1,
 'released unstarted reservation remains excluded from provider-month uncertainty');

-- These independent fixtures keep the established product ceilings unchanged
-- even when provider-wide usage leaves room for optional emails.
delete from private.reminder_quota_reservations;
select pg_temp.email_capacity('2026-10-10T11:00:00Z',0,0);
insert into private.reminder_quota_reservations(delivery_id,utc_date,reserved_at,consumed_at)
select extensions.gen_random_uuid(),'2026-10-10','2026-10-10T10:59:00Z','2026-10-10T10:59:00Z'
from generate_series(1,60);
select is(private.reminder_capacity_slots('2026-10-10T11:00:00Z'),0,
 'product daily ceiling remains60 reservations');
delete from private.reminder_quota_reservations;
insert into private.reminder_quota_reservations(delivery_id,utc_date,reserved_at,consumed_at,provider_observed_at)
select extensions.gen_random_uuid(),'2026-09-20','2026-09-20T11:00:00Z','2026-09-20T11:00:00Z','2026-09-20T11:00:01Z'
from generate_series(1,1800);
select is(private.reminder_capacity_slots('2026-10-10T11:00:00Z'),0,
 'product rolling31day ceiling remains1800 even for previously observed sends');

select * from finish();
rollback;
