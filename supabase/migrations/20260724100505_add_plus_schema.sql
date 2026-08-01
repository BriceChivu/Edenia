-- Baseline for the Edenia Plus schema that was originally created in production.
-- This migration is marked as applied on that existing project and creates the
-- same objects when migrations are replayed against a fresh Supabase database.

create table public.subscriptions (
  id uuid not null default gen_random_uuid(),
  user_id uuid not null default auth.uid(),
  stripe_customer_id text not null,
  stripe_subscription_id text,
  status text not null,
  plan text not null,
  current_period_end timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  past_due_since timestamptz,
  constraint subscriptions_pkey primary key (id),
  constraint subscriptions_user_id_key unique (user_id)
);

alter table public.subscriptions enable row level security;

create policy "Users can view their own subscription"
  on public.subscriptions
  as permissive
  for select
  to public
  using (auth.uid() = user_id);

grant all on table public.subscriptions to anon;
grant all on table public.subscriptions to authenticated;
grant all on table public.subscriptions to service_role;

create table public.founding_members (
  id uuid not null default gen_random_uuid(),
  user_id uuid not null default auth.uid(),
  created_at timestamptz default now(),
  constraint founding_members_pkey primary key (id),
  constraint founding_members_user_id_key unique (user_id)
);

alter table public.founding_members enable row level security;

create policy "Users can view their own founding member status"
  on public.founding_members
  as permissive
  for select
  to public
  using (auth.uid() = user_id);

grant all on table public.founding_members to anon;
grant all on table public.founding_members to authenticated;
grant all on table public.founding_members to service_role;

create function public.check_founding_member_limit()
returns trigger
language plpgsql
as $$
begin
  if (select count(*) from founding_members) >= 10 then
    raise exception 'Founding member slots are full';
  end if;
  return new;
end;
$$;

create trigger enforce_founding_limit
  before insert on public.founding_members
  for each row
  execute function public.check_founding_member_limit();

create table public.state_backups (
  id uuid not null default gen_random_uuid(),
  user_id uuid not null,
  state_json jsonb not null,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  constraint state_backups_pkey primary key (id),
  constraint state_backups_user_id_key unique (user_id),
  constraint state_backups_user_id_fkey
    foreign key (user_id) references auth.users (id)
);

alter table public.state_backups enable row level security;

create policy "Users can view their own state backup"
  on public.state_backups
  as permissive
  for select
  to public
  using (auth.uid() = user_id);

create policy "Users can upsert their own state backup"
  on public.state_backups
  as permissive
  for insert
  to public
  with check (auth.uid() = user_id);

create policy "Users can update their own state backup"
  on public.state_backups
  as permissive
  for update
  to public
  using (auth.uid() = user_id);

grant all on table public.state_backups to anon;
grant all on table public.state_backups to authenticated;
grant all on table public.state_backups to service_role;
