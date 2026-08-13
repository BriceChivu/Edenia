-- Add the encrypted, accountless legacy-progress relay without enabling it.
-- Browser callers reach only Edge Functions; even service_role receives no
-- direct access to the private tables below.
create extension if not exists pgcrypto with schema extensions;

create schema if not exists private;

revoke all on schema private from public, anon, authenticated, service_role;

create table private.legacy_progress_transfer_control (
  singleton boolean primary key default true,
  acceptance_enabled boolean not null default false,
  consumption_enabled boolean not null default false,
  transfer_ttl_seconds integer not null default 900,
  tombstone_ttl_seconds integer not null default 86400,
  max_live_rows integer not null default 256,
  max_live_ciphertext_bytes bigint not null default 268435456,
  rate_window_seconds integer not null default 60,
  max_creates_per_window integer not null default 60,
  max_consumes_per_window integer not null default 300,
  create_window_started_at timestamptz not null
    default pg_catalog.date_trunc('minute', pg_catalog.now()),
  creates_in_window integer not null default 0,
  consume_window_started_at timestamptz not null
    default pg_catalog.date_trunc('minute', pg_catalog.now()),
  consumes_in_window integer not null default 0,
  updated_at timestamptz not null default pg_catalog.now(),
  constraint legacy_progress_transfer_control_singleton_check check (
    singleton
  ),
  constraint legacy_progress_transfer_control_ttl_check check (
    transfer_ttl_seconds between 60 and 1200
    and tombstone_ttl_seconds between 60 and 86400
  ),
  constraint legacy_progress_transfer_control_capacity_check check (
    max_live_rows between 1 and 10000
    and max_live_ciphertext_bytes between 2097168 and 536870912
  ),
  constraint legacy_progress_transfer_control_rate_check check (
    rate_window_seconds between 10 and 3600
    and max_creates_per_window between 1 and 10000
    and max_consumes_per_window between 1 and 50000
    and creates_in_window >= 0
    and consumes_in_window >= 0
  )
);

insert into private.legacy_progress_transfer_control (
  singleton,
  acceptance_enabled,
  consumption_enabled
) values (true, false, false);

comment on table private.legacy_progress_transfer_control is
  'Server-only relay kill switches, capacity, TTL, and anonymous global request limits. Both switches start off.';

create table private.legacy_progress_transfers (
  capability_digest bytea primary key,
  initialization_vector bytea,
  ciphertext bytea,
  ciphertext_digest bytea,
  ciphertext_bytes integer,
  state text not null default 'created',
  created_at timestamptz not null,
  claimed_at timestamptz,
  completed_at timestamptz,
  expires_at timestamptz not null,
  purge_after timestamptz not null,
  constraint legacy_progress_transfers_capability_digest_check check (
    pg_catalog.octet_length(capability_digest) = 32
  ),
  constraint legacy_progress_transfers_state_check check (
    state in ('created', 'claimed', 'completed')
  ),
  constraint legacy_progress_transfers_expiry_check check (
    expires_at > created_at
    and expires_at <= created_at + interval '20 minutes'
    and purge_after >= expires_at
  ),
  constraint legacy_progress_transfers_payload_check check (
    (
      state in ('created', 'claimed')
      and initialization_vector is not null
      and pg_catalog.octet_length(initialization_vector) = 12
      and ciphertext is not null
      and ciphertext_bytes = pg_catalog.octet_length(ciphertext)
      and ciphertext_bytes between 17 and 2097168
      and ciphertext_digest is not null
      and pg_catalog.octet_length(ciphertext_digest) = 32
    )
    or (
      state = 'completed'
      and initialization_vector is null
      and ciphertext is null
      and ciphertext_bytes is null
      and ciphertext_digest is null
    )
  ),
  constraint legacy_progress_transfers_lifecycle_check check (
    (
      state = 'created'
      and claimed_at is null
      and completed_at is null
      and purge_after = expires_at
    )
    or (
      state = 'claimed'
      and claimed_at between created_at and expires_at
      and completed_at is null
      and purge_after = expires_at
    )
    or (
      state = 'completed'
      and claimed_at between created_at and expires_at
      and completed_at between claimed_at and expires_at
      and purge_after > completed_at
      and purge_after <= completed_at + interval '24 hours'
    )
  )
);

comment on table private.legacy_progress_transfers is
  'Short-lived opaque AES-GCM relay records keyed only by a capability digest. No identity, URL, plaintext, or source-state hash is stored.';

create index legacy_progress_transfers_purge_after_idx
  on private.legacy_progress_transfers (purge_after);

create table private.legacy_progress_transfer_daily_metrics (
  metric_date date primary key,
  completed_count bigint not null default 0,
  constraint legacy_progress_transfer_daily_metrics_count_check check (
    completed_count >= 0
  )
);

comment on table private.legacy_progress_transfer_daily_metrics is
  'Anonymous UTC-day completion totals used only for relay retirement evidence.';

alter table private.legacy_progress_transfer_control enable row level security;
alter table private.legacy_progress_transfers enable row level security;
alter table private.legacy_progress_transfer_daily_metrics
  enable row level security;

revoke all on table private.legacy_progress_transfer_control
  from public, anon, authenticated, service_role;
revoke all on table private.legacy_progress_transfers
  from public, anon, authenticated, service_role;
revoke all on table private.legacy_progress_transfer_daily_metrics
  from public, anon, authenticated, service_role;

create or replace function private.enforce_legacy_progress_transfer_transition()
returns trigger
language plpgsql
volatile
security invoker
set search_path = ''
as $$
begin
  if old.state = 'created' and new.state not in ('created', 'claimed') then
    raise exception 'legacy_progress_transfer_invalid_transition'
      using errcode = '23514';
  end if;
  if old.state = 'claimed' and new.state not in ('claimed', 'completed') then
    raise exception 'legacy_progress_transfer_invalid_transition'
      using errcode = '23514';
  end if;
  if old.state = 'completed' and new.state <> 'completed' then
    raise exception 'legacy_progress_transfer_invalid_transition'
      using errcode = '23514';
  end if;
  return new;
end;
$$;

revoke execute on function private.enforce_legacy_progress_transfer_transition()
  from public, anon, authenticated, service_role;

create trigger enforce_legacy_progress_transfer_transition
before update on private.legacy_progress_transfers
for each row execute function
  private.enforce_legacy_progress_transfer_transition();

create or replace function private.cleanup_legacy_progress_transfers(
  p_now timestamptz,
  p_batch_size integer
)
returns integer
language plpgsql
volatile
security invoker
set search_path = ''
as $$
declare
  deleted_count integer := 0;
begin
  if p_now is null or p_batch_size < 1 or p_batch_size > 1000 then
    raise exception 'legacy_progress_cleanup_arguments_invalid'
      using errcode = '22023';
  end if;

  with expired as materialized (
    select transfer.capability_digest
    from private.legacy_progress_transfers as transfer
    where transfer.purge_after <= p_now
    order by transfer.purge_after, transfer.capability_digest
    for update skip locked
    limit p_batch_size
  )
  delete from private.legacy_progress_transfers as transfer
  using expired
  where transfer.capability_digest = expired.capability_digest;

  get diagnostics deleted_count = row_count;
  return deleted_count;
end;
$$;

revoke execute on function private.cleanup_legacy_progress_transfers(
  timestamptz, integer
) from public, anon, authenticated, service_role;

create or replace function public.create_legacy_progress_transfer(
  p_capability_digest bytea,
  p_initialization_vector bytea,
  p_ciphertext bytea,
  p_ciphertext_digest bytea,
  p_ciphertext_bytes integer,
  p_now timestamptz default pg_catalog.now()
)
returns table (
  status text,
  expires_at timestamptz
)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  control private.legacy_progress_transfer_control%rowtype;
  existing private.legacy_progress_transfers%rowtype;
  live_rows bigint := 0;
  live_bytes bigint := 0;
  new_expiry timestamptz;
begin
  if p_now is null
    or p_capability_digest is null
    or pg_catalog.octet_length(p_capability_digest) <> 32
    or p_initialization_vector is null
    or pg_catalog.octet_length(p_initialization_vector) <> 12
    or p_ciphertext is null
    or p_ciphertext_bytes is null
    or p_ciphertext_bytes <> pg_catalog.octet_length(p_ciphertext)
    or p_ciphertext_bytes < 17
    or p_ciphertext_bytes > 2097168
    or p_ciphertext_digest is null
    or pg_catalog.octet_length(p_ciphertext_digest) <> 32
    or extensions.digest(p_ciphertext, 'sha256') <> p_ciphertext_digest
  then
    raise exception 'legacy_progress_create_arguments_invalid'
      using errcode = '22023';
  end if;

  select value.* into strict control
  from private.legacy_progress_transfer_control as value
  where value.singleton
  for update;

  if not control.acceptance_enabled then
    return query select 'acceptance_disabled'::text, null::timestamptz;
    return;
  end if;

  perform private.cleanup_legacy_progress_transfers(p_now, 100);

  select transfer.* into existing
  from private.legacy_progress_transfers as transfer
  where transfer.capability_digest = p_capability_digest
  for update;

  if found then
    if existing.state = 'created'
      and existing.expires_at > p_now
      and existing.initialization_vector = p_initialization_vector
      and existing.ciphertext = p_ciphertext
      and existing.ciphertext_digest = p_ciphertext_digest
      and existing.ciphertext_bytes = p_ciphertext_bytes
    then
      return query select 'created'::text, existing.expires_at;
    else
      return query select 'conflict'::text, null::timestamptz;
    end if;
    return;
  end if;

  if p_now >= control.create_window_started_at
      + pg_catalog.make_interval(secs => control.rate_window_seconds) then
    update private.legacy_progress_transfer_control as value
    set create_window_started_at = p_now,
        creates_in_window = 0,
        updated_at = p_now
    where value.singleton;
    control.create_window_started_at := p_now;
    control.creates_in_window := 0;
  end if;
  if control.creates_in_window >= control.max_creates_per_window then
    return query select 'rate_limited'::text, null::timestamptz;
    return;
  end if;

  select
    pg_catalog.count(*),
    coalesce(pg_catalog.sum(transfer.ciphertext_bytes), 0)
  into live_rows, live_bytes
  from private.legacy_progress_transfers as transfer
  where transfer.state in ('created', 'claimed')
    and transfer.purge_after > p_now;

  if live_rows >= control.max_live_rows
    or live_bytes + p_ciphertext_bytes
      > control.max_live_ciphertext_bytes then
    return query select 'capacity_exceeded'::text, null::timestamptz;
    return;
  end if;

  new_expiry := p_now + pg_catalog.make_interval(
    secs => control.transfer_ttl_seconds
  );
  insert into private.legacy_progress_transfers (
    capability_digest,
    initialization_vector,
    ciphertext,
    ciphertext_digest,
    ciphertext_bytes,
    state,
    created_at,
    expires_at,
    purge_after
  ) values (
    p_capability_digest,
    p_initialization_vector,
    p_ciphertext,
    p_ciphertext_digest,
    p_ciphertext_bytes,
    'created',
    p_now,
    new_expiry,
    new_expiry
  );
  update private.legacy_progress_transfer_control as value
  set creates_in_window = value.creates_in_window + 1,
      updated_at = p_now
  where value.singleton;

  return query select 'created'::text, new_expiry;
end;
$$;

revoke execute on function public.create_legacy_progress_transfer(
  bytea, bytea, bytea, bytea, integer, timestamptz
) from public, anon, authenticated, service_role;
grant execute on function public.create_legacy_progress_transfer(
  bytea, bytea, bytea, bytea, integer, timestamptz
) to service_role;

create or replace function public.claim_legacy_progress_transfer(
  p_capability_digest bytea,
  p_now timestamptz default pg_catalog.now()
)
returns table (
  status text,
  initialization_vector bytea,
  ciphertext bytea,
  ciphertext_digest bytea,
  ciphertext_bytes integer,
  expires_at timestamptz
)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  control private.legacy_progress_transfer_control%rowtype;
  transfer private.legacy_progress_transfers%rowtype;
begin
  if p_now is null
    or p_capability_digest is null
    or pg_catalog.octet_length(p_capability_digest) <> 32
  then
    raise exception 'legacy_progress_claim_arguments_invalid'
      using errcode = '22023';
  end if;

  select value.* into strict control
  from private.legacy_progress_transfer_control as value
  where value.singleton
  for update;

  if not control.consumption_enabled then
    return query select
      'consumption_disabled'::text,
      null::bytea,
      null::bytea,
      null::bytea,
      null::integer,
      null::timestamptz;
    return;
  end if;

  if p_now >= control.consume_window_started_at
      + pg_catalog.make_interval(secs => control.rate_window_seconds) then
    update private.legacy_progress_transfer_control as value
    set consume_window_started_at = p_now,
        consumes_in_window = 0,
        updated_at = p_now
    where value.singleton;
    control.consume_window_started_at := p_now;
    control.consumes_in_window := 0;
  end if;
  if control.consumes_in_window >= control.max_consumes_per_window then
    return query select
      'rate_limited'::text,
      null::bytea,
      null::bytea,
      null::bytea,
      null::integer,
      null::timestamptz;
    return;
  end if;
  update private.legacy_progress_transfer_control as value
  set consumes_in_window = value.consumes_in_window + 1,
      updated_at = p_now
  where value.singleton;

  perform private.cleanup_legacy_progress_transfers(p_now, 100);
  select value.* into transfer
  from private.legacy_progress_transfers as value
  where value.capability_digest = p_capability_digest
  for update;

  if not found or transfer.state <> 'created'
      or transfer.expires_at <= p_now then
    return query select
      'invalid'::text,
      null::bytea,
      null::bytea,
      null::bytea,
      null::integer,
      null::timestamptz;
    return;
  end if;

  update private.legacy_progress_transfers as value
  set state = 'claimed',
      claimed_at = p_now
  where value.capability_digest = p_capability_digest;

  return query select
    'claimed'::text,
    transfer.initialization_vector,
    transfer.ciphertext,
    transfer.ciphertext_digest,
    transfer.ciphertext_bytes,
    transfer.expires_at;
end;
$$;

revoke execute on function public.claim_legacy_progress_transfer(
  bytea, timestamptz
) from public, anon, authenticated, service_role;
grant execute on function public.claim_legacy_progress_transfer(
  bytea, timestamptz
) to service_role;

create or replace function public.complete_legacy_progress_transfer(
  p_capability_digest bytea,
  p_now timestamptz default pg_catalog.now()
)
returns text
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  control private.legacy_progress_transfer_control%rowtype;
  transfer private.legacy_progress_transfers%rowtype;
  metric_day date;
begin
  if p_now is null
    or p_capability_digest is null
    or pg_catalog.octet_length(p_capability_digest) <> 32
  then
    raise exception 'legacy_progress_complete_arguments_invalid'
      using errcode = '22023';
  end if;

  select value.* into strict control
  from private.legacy_progress_transfer_control as value
  where value.singleton
  for update;

  if not control.consumption_enabled then
    return 'consumption_disabled';
  end if;

  if p_now >= control.consume_window_started_at
      + pg_catalog.make_interval(secs => control.rate_window_seconds) then
    update private.legacy_progress_transfer_control as value
    set consume_window_started_at = p_now,
        consumes_in_window = 0,
        updated_at = p_now
    where value.singleton;
    control.consume_window_started_at := p_now;
    control.consumes_in_window := 0;
  end if;
  if control.consumes_in_window >= control.max_consumes_per_window then
    return 'rate_limited';
  end if;
  update private.legacy_progress_transfer_control as value
  set consumes_in_window = value.consumes_in_window + 1,
      updated_at = p_now
  where value.singleton;

  perform private.cleanup_legacy_progress_transfers(p_now, 100);
  select value.* into transfer
  from private.legacy_progress_transfers as value
  where value.capability_digest = p_capability_digest
  for update;

  if not found then
    return 'invalid';
  end if;
  if transfer.state = 'completed' and transfer.purge_after > p_now then
    return 'already_completed';
  end if;
  if transfer.state <> 'claimed' or transfer.expires_at <= p_now then
    return 'invalid';
  end if;

  update private.legacy_progress_transfers as value
  set state = 'completed',
      initialization_vector = null,
      ciphertext = null,
      ciphertext_digest = null,
      ciphertext_bytes = null,
      completed_at = p_now,
      purge_after = greatest(
        transfer.expires_at,
        p_now + pg_catalog.make_interval(
          secs => control.tombstone_ttl_seconds
        )
      )
  where value.capability_digest = p_capability_digest;

  metric_day := (p_now at time zone 'UTC')::date;
  insert into private.legacy_progress_transfer_daily_metrics (
    metric_date,
    completed_count
  ) values (metric_day, 1)
  on conflict (metric_date) do update
  set completed_count =
    private.legacy_progress_transfer_daily_metrics.completed_count + 1;

  return 'completed';
end;
$$;

revoke execute on function public.complete_legacy_progress_transfer(
  bytea, timestamptz
) from public, anon, authenticated, service_role;
grant execute on function public.complete_legacy_progress_transfer(
  bytea, timestamptz
) to service_role;

create or replace function public.cleanup_legacy_progress_transfers(
  p_now timestamptz default pg_catalog.now(),
  p_batch_size integer default 500
)
returns integer
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  return private.cleanup_legacy_progress_transfers(p_now, p_batch_size);
end;
$$;

revoke execute on function public.cleanup_legacy_progress_transfers(
  timestamptz, integer
) from public, anon, authenticated, service_role;
grant execute on function public.cleanup_legacy_progress_transfers(
  timestamptz, integer
) to service_role;
