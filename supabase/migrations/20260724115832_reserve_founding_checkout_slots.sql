-- Reserve one of the ten founding offers before creating the discounted Stripe
-- Checkout Session. The existing capacity row is the single source of truth for
-- both paid founding members and Checkout reservations.

create table public.founding_checkout_reservations (
  id uuid primary key default gen_random_uuid(),
  email_hash text not null
    constraint founding_checkout_reservations_email_hash_check
      check (email_hash ~ '^[0-9a-f]{64}$'),
  stripe_checkout_session_id text unique,
  status text not null default 'reserved'
    constraint founding_checkout_reservations_status_check
      check (status in ('reserved', 'completed', 'released')),
  reserved_at timestamptz not null default now(),
  expires_at timestamptz not null,
  completed_at timestamptz,
  released_at timestamptz,
  user_id uuid references auth.users (id),
  updated_at timestamptz not null default now(),
  constraint founding_checkout_reservations_email_hash_key unique (email_hash)
);

alter table public.founding_checkout_reservations enable row level security;

revoke all privileges on table public.founding_checkout_reservations
  from public, anon, authenticated;
grant select, insert, update, delete
  on table public.founding_checkout_reservations
  to service_role;

alter table public.founding_members
  add column reservation_id uuid;

alter table public.founding_members
  add constraint founding_members_reservation_id_key unique (reservation_id),
  add constraint founding_members_reservation_id_fkey
    foreign key (reservation_id)
    references public.founding_checkout_reservations (id);

create or replace function public.reserve_founding_checkout_slot(
  p_email_hash text,
  p_expires_at timestamptz
)
returns table (
  reservation_id uuid,
  reservation_expires_at timestamptz
)
language plpgsql
security invoker
set search_path = ''
as $$
declare
  existing_reservation public.founding_checkout_reservations%rowtype;
  has_existing_reservation boolean;
  expired_reservation_count integer;
  next_claimed_count integer;
  next_reservation_id uuid;
begin
  if p_email_hash is null or p_email_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'invalid_founding_reservation_email_hash'
      using errcode = '22023';
  end if;

  if p_expires_at <= now() or p_expires_at > now() + interval '24 hours' then
    raise exception 'invalid_founding_reservation_expiry'
      using errcode = '22023';
  end if;

  -- This row lock serializes the short capacity decision without holding a
  -- database lock while Stripe is called.
  perform 1
  from public.founding_member_capacity
  where singleton
  for update;

  if not found then
    raise exception 'founding_capacity_unavailable';
  end if;

  -- Stripe normally sends checkout.session.expired, but capacity recovery must
  -- not depend on delivery of that external event. Reclaim expired reservations
  -- while holding the same capacity lock used for every claim.
  update public.founding_checkout_reservations
  set status = 'released',
      released_at = now(),
      updated_at = now()
  where status = 'reserved'
    and expires_at <= now();

  get diagnostics expired_reservation_count = row_count;

  if expired_reservation_count > 0 then
    update public.founding_member_capacity
    set claimed_count = greatest(claimed_count - expired_reservation_count, 0)
    where singleton;
  end if;

  select reservations.*
  into existing_reservation
  from public.founding_checkout_reservations as reservations
  where reservations.email_hash = p_email_hash
  for update;
  has_existing_reservation := found;

  if has_existing_reservation and existing_reservation.status = 'completed' then
    raise exception 'founding_reservation_already_completed'
      using errcode = '23505';
  end if;

  if has_existing_reservation and existing_reservation.status = 'reserved' then
    next_reservation_id := existing_reservation.id;

    return query
      select reservations.id, reservations.expires_at
      from public.founding_checkout_reservations as reservations
      where reservations.id = next_reservation_id;
    return;
  end if;

  update public.founding_member_capacity
  set claimed_count = claimed_count + 1
  where singleton
    and claimed_count < 10
  returning claimed_count into next_claimed_count;

  if next_claimed_count is null then
    raise exception 'founding_slots_full'
      using errcode = 'P0001';
  end if;

  if has_existing_reservation then
    next_reservation_id := gen_random_uuid();
    update public.founding_checkout_reservations
    set id = next_reservation_id,
        stripe_checkout_session_id = null,
        status = 'reserved',
        reserved_at = now(),
        expires_at = p_expires_at,
        completed_at = null,
        released_at = null,
        user_id = null,
        updated_at = now()
    where id = existing_reservation.id;
  else
    insert into public.founding_checkout_reservations (
      email_hash,
      expires_at
    )
    values (
      p_email_hash,
      p_expires_at
    )
    returning id into next_reservation_id;
  end if;

  return query
    select reservations.id, reservations.expires_at
    from public.founding_checkout_reservations as reservations
    where reservations.id = next_reservation_id;
end;
$$;

create or replace function public.attach_founding_checkout_session(
  p_reservation_id uuid,
  p_session_id text
)
returns boolean
language plpgsql
security invoker
set search_path = ''
as $$
declare
  attached boolean;
begin
  if p_session_id is null or btrim(p_session_id) = '' then
    raise exception 'invalid_founding_checkout_session'
      using errcode = '22023';
  end if;

  update public.founding_checkout_reservations
  set stripe_checkout_session_id = p_session_id,
      updated_at = now()
  where id = p_reservation_id
    and status = 'reserved'
    and (
      stripe_checkout_session_id is null
      or stripe_checkout_session_id = p_session_id
    )
  returning true into attached;

  return coalesce(attached, false);
end;
$$;

create or replace function public.complete_founding_checkout_reservation(
  p_reservation_id uuid,
  p_session_id text,
  p_user_id uuid
)
returns boolean
language plpgsql
security invoker
set search_path = ''
as $$
declare
  reservation public.founding_checkout_reservations%rowtype;
begin
  perform 1
  from public.founding_member_capacity
  where singleton
  for update;

  select reservations.*
  into reservation
  from public.founding_checkout_reservations as reservations
  where reservations.id = p_reservation_id
  for update;

  if not found then
    raise exception 'founding_reservation_not_found'
      using errcode = 'P0002';
  end if;

  if reservation.status = 'completed' then
    if reservation.stripe_checkout_session_id = p_session_id
      and reservation.user_id = p_user_id
    then
      return true;
    end if;

    raise exception 'founding_reservation_completion_mismatch'
      using errcode = '23514';
  end if;

  if reservation.status <> 'reserved'
    or (
      reservation.stripe_checkout_session_id is not null
      and reservation.stripe_checkout_session_id <> p_session_id
    )
  then
    raise exception 'founding_reservation_not_completable'
      using errcode = '23514';
  end if;

  update public.founding_checkout_reservations
  set stripe_checkout_session_id = p_session_id,
      status = 'completed',
      completed_at = now(),
      user_id = p_user_id,
      updated_at = now()
  where id = p_reservation_id;

  -- The reservation already incremented claimed_count. The founding-members
  -- trigger recognizes this completed reservation and does not claim twice.
  insert into public.founding_members (user_id, reservation_id)
  values (p_user_id, p_reservation_id);

  return true;
end;
$$;

create or replace function public.release_founding_checkout_reservation(
  p_reservation_id uuid,
  p_session_id text
)
returns boolean
language plpgsql
security invoker
set search_path = ''
as $$
declare
  released boolean;
begin
  perform 1
  from public.founding_member_capacity
  where singleton
  for update;

  update public.founding_checkout_reservations
  set status = 'released',
      released_at = now(),
      updated_at = now()
  where id = p_reservation_id
    and status = 'reserved'
    and stripe_checkout_session_id = p_session_id
  returning true into released;

  if coalesce(released, false) then
    update public.founding_member_capacity
    set claimed_count = greatest(claimed_count - 1, 0)
    where singleton;
  end if;

  return coalesce(released, false);
end;
$$;

revoke execute on function public.reserve_founding_checkout_slot(text, timestamptz)
  from public, anon, authenticated;
revoke execute on function public.attach_founding_checkout_session(uuid, text)
  from public, anon, authenticated;
revoke execute on function public.complete_founding_checkout_reservation(uuid, text, uuid)
  from public, anon, authenticated;
revoke execute on function public.release_founding_checkout_reservation(uuid, text)
  from public, anon, authenticated;

grant execute on function public.reserve_founding_checkout_slot(text, timestamptz)
  to service_role;
grant execute on function public.attach_founding_checkout_session(uuid, text)
  to service_role;
grant execute on function public.complete_founding_checkout_reservation(uuid, text, uuid)
  to service_role;
grant execute on function public.release_founding_checkout_reservation(uuid, text)
  to service_role;

create or replace function public.check_founding_member_limit()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  next_claimed_count integer;
begin
  if new.reservation_id is not null then
    if not exists (
      select 1
      from public.founding_checkout_reservations as reservations
      where reservations.id = new.reservation_id
        and reservations.status = 'completed'
        and reservations.user_id = new.user_id
    ) then
      raise exception 'Founding member reservation is not completed'
        using errcode = '23514';
    end if;

    return new;
  end if;

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
    set claimed_count = (
      select count(*)::integer
      from public.founding_checkout_reservations
      where status = 'reserved'
    )
    where singleton;
    return null;
  end if;

  raise exception 'Unsupported founding-member slot operation: %', tg_op;
end;
$$;

comment on table public.founding_checkout_reservations is
  'Server-only lifecycle for atomically reserving the ten founding Checkout offers.';
comment on column public.founding_member_capacity.claimed_count is
  'Number of completed founding members plus active founding Checkout reservations.';
