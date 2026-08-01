-- Keep multiple immutable recovery points instead of replacing the user's only
-- cloud backup. The database retains the eight most recent snapshots per user.

-- The legacy row's updated_at is the time its state was last replaced, so carry
-- that timestamp forward as the snapshot's creation time.
update public.state_backups
set created_at = coalesce(updated_at, created_at, now()),
    updated_at = coalesce(updated_at, created_at, now());

alter table public.state_backups
  alter column created_at set not null,
  alter column updated_at set not null;

alter table public.state_backups
  drop constraint if exists state_backups_user_id_key;

create index state_backups_user_created_at_idx
  on public.state_backups (user_id, created_at desc, id desc);

-- Backups are append-only for browser clients. Pruning happens inside the
-- database after a successful Plus-authorized insert.
drop policy if exists "Plus users can update their own state backup"
  on public.state_backups;

revoke insert, update on table public.state_backups from authenticated;
grant insert (user_id, state_json) on table public.state_backups
  to authenticated;

create or replace function public.prune_state_backup_history()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- Serialize pruning for one user so concurrent backups cannot escape the cap.
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(new.user_id::text, 20260724)
  );

  delete from public.state_backups
  where id in (
    select id
    from public.state_backups
    where user_id = new.user_id
    order by created_at desc, id desc
    offset 8
  );

  return new;
end;
$$;

revoke execute on function public.prune_state_backup_history()
  from public, anon, authenticated;
grant execute on function public.prune_state_backup_history() to service_role;

drop trigger if exists prune_state_backup_history
  on public.state_backups;
create trigger prune_state_backup_history
  after insert on public.state_backups
  for each row
  execute function public.prune_state_backup_history();

comment on function public.prune_state_backup_history() is
  'Retains the eight newest immutable cloud backup snapshots for each user.';
