alter table public.subscriptions
  add column cancel_at_period_end boolean not null default false;

comment on column public.subscriptions.cancel_at_period_end is
  'Current Stripe subscription cancellation-at-period-end state, synchronized by billing webhooks.';
