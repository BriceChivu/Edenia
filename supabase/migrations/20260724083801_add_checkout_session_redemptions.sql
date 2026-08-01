create table public.checkout_session_redemptions (
  session_id_hash text primary key
    check (length(session_id_hash) = 64),
  claim_id uuid not null,
  claimed_at timestamptz not null default now(),
  redeemed_at timestamptz
);

comment on table public.checkout_session_redemptions is
  'Single-use claims for exchanging completed Stripe Checkout Sessions for Supabase sign-in tokens.';

alter table public.checkout_session_redemptions enable row level security;

revoke all on table public.checkout_session_redemptions from anon, authenticated;
grant select, insert, update, delete on table public.checkout_session_redemptions to service_role;

create table public.checkout_redemption_settings (
  singleton boolean primary key default true
    check (singleton),
  accept_sessions_created_after timestamptz not null default date_trunc('second', now())
);

insert into public.checkout_redemption_settings (singleton)
values (true);

comment on table public.checkout_redemption_settings is
  'Deployment cutoff that prevents Checkout Sessions used before single-use redemption was enabled from being replayed once.';

alter table public.checkout_redemption_settings enable row level security;

revoke all on table public.checkout_redemption_settings from anon, authenticated;
grant select on table public.checkout_redemption_settings to service_role;
