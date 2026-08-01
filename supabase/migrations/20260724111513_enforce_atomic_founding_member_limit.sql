-- Block founding-member inserts while the counter is initialized and the
-- trigger is replaced. The lock is held only for this migration transaction.
lock table public.founding_members in share row exclusive mode;

create table public.founding_member_capacity (
  singleton boolean primary key default true
    constraint founding_member_capacity_singleton_check check (singleton),
  claimed_count integer not null
    constraint founding_member_capacity_claimed_count_check
      check (claimed_count between 0 and 10)
);

insert into public.founding_member_capacity (singleton, claimed_count)
select true, count(*)::integer
from public.founding_members;

comment on table public.founding_member_capacity is
  'Single locked counter row that atomically enforces the ten founding-member slots.';

alter table public.founding_member_capacity enable row level security;

revoke all privileges on table public.founding_member_capacity
  from public, anon, authenticated;
grant select, update on table public.founding_member_capacity to service_role;

create or replace function public.check_founding_member_limit()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  next_claimed_count integer;
begin
  update public.founding_member_capacity
  set claimed_count = claimed_count + 1
  where singleton
    and claimed_count < 10
  returning claimed_count into next_claimed_count;

  if next_claimed_count is null then
    raise exception 'Founding member slots are full'
      using errcode = '23514';
  end if;

  return new;
end;
$$;

create or replace function public.release_founding_member_slot()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    update public.founding_member_capacity
    set claimed_count = greatest(claimed_count - 1, 0)
    where singleton;
    return old;
  end if;

  if tg_op = 'TRUNCATE' then
    update public.founding_member_capacity
    set claimed_count = 0
    where singleton;
    return null;
  end if;

  raise exception 'Unsupported founding-member slot operation: %', tg_op;
end;
$$;

revoke execute on function public.check_founding_member_limit()
  from public, anon, authenticated;
revoke execute on function public.release_founding_member_slot()
  from public, anon, authenticated;
grant execute on function public.check_founding_member_limit() to service_role;
grant execute on function public.release_founding_member_slot() to service_role;

drop trigger if exists release_founding_slot on public.founding_members;
create trigger release_founding_slot
  after delete on public.founding_members
  for each row
  execute function public.release_founding_member_slot();

drop trigger if exists reset_founding_slots on public.founding_members;
create trigger reset_founding_slots
  after truncate on public.founding_members
  for each statement
  execute function public.release_founding_member_slot();
