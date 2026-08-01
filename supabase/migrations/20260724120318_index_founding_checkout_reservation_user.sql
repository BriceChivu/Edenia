create index founding_checkout_reservations_user_id_idx
  on public.founding_checkout_reservations (user_id)
  where user_id is not null;
