-- Give an authenticated user a read-only export of data Edenia currently holds
-- for that account. The function accepts no owner identifier: the verified JWT
-- is the only source of ownership. Browser-local state remains outside this
-- export, while any snapshots already stored on the server are included.

create or replace function public.export_account_server_data()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  export_user_id uuid := (select auth.uid());
  exported_data jsonb;
begin
  if export_user_id is null then
    raise exception 'account_export_authentication_required'
      using errcode = '42501';
  end if;

  select pg_catalog.jsonb_build_object(
    'schema_version', 'edenia-account-export-v1',
    'generated_at', pg_catalog.transaction_timestamp(),
    'scope', pg_catalog.jsonb_build_object(
      'server_data', true,
      'current_device_progress', false
    ),
    'account', pg_catalog.jsonb_build_object(
      'id', account_user.id,
      'email', account_user.email,
      'email_confirmed_at', account_user.email_confirmed_at,
      'created_at', account_user.created_at,
      'updated_at', account_user.updated_at,
      'last_sign_in_at', account_user.last_sign_in_at,
      'providers', coalesce(
        (
          select pg_catalog.jsonb_agg(provider.provider order by provider.provider)
          from (
            select distinct identity.provider
            from auth.identities as identity
            where identity.user_id = export_user_id
          ) as provider
        ),
        '[]'::jsonb
      )
    ),
    'billing', pg_catalog.jsonb_build_object(
      'subscription', (
        select pg_catalog.jsonb_build_object(
          'status', subscription.status,
          'plan', subscription.plan,
          'current_period_end', subscription.current_period_end,
          'past_due_since', subscription.past_due_since,
          'created_at', subscription.created_at,
          'updated_at', subscription.updated_at
        )
        from public.subscriptions as subscription
        where subscription.user_id = export_user_id
      ),
      'founding_member', coalesce(
        (
          select pg_catalog.jsonb_build_object(
            'is_founding_member', true,
            'created_at', founding_member.created_at
          )
          from public.founding_members as founding_member
          where founding_member.user_id = export_user_id
        ),
        pg_catalog.jsonb_build_object('is_founding_member', false)
      ),
      'founding_checkout_reservation', (
        select pg_catalog.jsonb_build_object(
          'status', reservation.status,
          'reserved_at', reservation.reserved_at,
          'expires_at', reservation.expires_at,
          'completed_at', reservation.completed_at,
          'released_at', reservation.released_at,
          'updated_at', reservation.updated_at
        )
        from public.founding_checkout_reservations as reservation
        left join public.founding_members as founding_member
          on founding_member.reservation_id = reservation.id
        where reservation.user_id = export_user_id
          or founding_member.user_id = export_user_id
        order by reservation.updated_at desc, reservation.id desc
        limit 1
      )
    ),
    'cloud_backup_snapshots', coalesce(
      (
        select pg_catalog.jsonb_agg(
          pg_catalog.jsonb_build_object(
            'id', backup.id,
            'state', backup.state_json,
            'created_at', backup.created_at,
            'updated_at', backup.updated_at
          )
          order by backup.created_at desc, backup.id desc
        )
        from public.state_backups as backup
        where backup.user_id = export_user_id
      ),
      '[]'::jsonb
    ),
    'reminders', pg_catalog.jsonb_build_object(
      'preference', (
        select pg_catalog.jsonb_build_object(
          'enabled', preference.enabled,
          'days', preference.days,
          'local_time', preference.local_time,
          'timezone', preference.timezone,
          'locale', preference.locale,
          'consent_granted_at', preference.consent_granted_at,
          'consent_revoked_at', preference.consent_revoked_at,
          'consent_version', preference.consent_version,
          'consent_source', preference.consent_source,
          'created_at', preference.created_at,
          'updated_at', preference.updated_at
        )
        from public.reminder_preferences as preference
        where preference.user_id = export_user_id
      ),
      'is_internal_tester', exists (
        select 1
        from private.reminder_delivery_testers as tester
        where tester.user_id = export_user_id
      ),
      'suppression', (
        select pg_catalog.jsonb_build_object(
          'reason', suppression.reason,
          'source', suppression.source,
          'suppressed_at', suppression.suppressed_at,
          'created_at', suppression.created_at
        )
        from private.reminder_suppressions as suppression
        where suppression.user_id = export_user_id
      ),
      'delivery_occurrences', coalesce(
        (
          select pg_catalog.jsonb_agg(
            pg_catalog.jsonb_build_object(
              'id', delivery.id,
              'scheduled_local_date', delivery.scheduled_local_date,
              'scheduled_local_time', delivery.scheduled_local_time,
              'scheduled_for', delivery.scheduled_for,
              'timezone', delivery.timezone,
              'locale', delivery.locale,
              'consent_version', delivery.consent_version,
              'consent_granted_at', delivery.consent_granted_at,
              'status', delivery.status,
              'attempt_count', delivery.attempt_count,
              'last_claimed_at', delivery.last_claimed_at,
              'dry_run_observed_at', delivery.dry_run_observed_at,
              'suppressed_at', delivery.suppressed_at,
              'provider_name', delivery.provider_name,
              'send_started_at', delivery.send_started_at,
              'send_retry_deadline', delivery.send_retry_deadline,
              'provider_accepted_at', delivery.provider_accepted_at,
              'permanent_failure_at', delivery.permanent_failure_at,
              'failure_code', delivery.failure_code,
              'outcome_ambiguous_at', delivery.outcome_ambiguous_at,
              'created_at', delivery.created_at,
              'updated_at', delivery.updated_at
            )
            order by delivery.scheduled_for desc, delivery.id desc
          )
          from private.reminder_deliveries as delivery
          where delivery.user_id = export_user_id
        ),
        '[]'::jsonb
      ),
      'unsubscribe_history', coalesce(
        (
          select pg_catalog.jsonb_agg(
            pg_catalog.jsonb_build_object(
              'delivery_id', token.delivery_id,
              'created_at', token.created_at,
              'consumed_at', token.consumed_at
            )
            order by token.created_at desc, token.delivery_id desc
          )
          from private.reminder_unsubscribe_tokens as token
          where token.user_id = export_user_id
        ),
        '[]'::jsonb
      ),
      'provider_events', coalesce(
        (
          select pg_catalog.jsonb_agg(
            pg_catalog.jsonb_build_object(
              'delivery_id', event.delivery_id,
              'provider_name', event.provider_name,
              'event_type', event.event_type,
              'event_created_at', event.event_created_at,
              'received_at', event.received_at,
              'action', event.action
            )
            order by event.received_at desc, event.delivery_id desc
          )
          from private.reminder_provider_events as event
          join private.reminder_deliveries as delivery
            on delivery.id = event.delivery_id
          where delivery.user_id = export_user_id
        ),
        '[]'::jsonb
      )
    )
  )
  into exported_data
  from auth.users as account_user
  where account_user.id = export_user_id;

  if exported_data is null then
    raise exception 'account_export_authentication_required'
      using errcode = '42501';
  end if;

  return exported_data;
end
$function$;

comment on function public.export_account_server_data() is
  'Exports only the authenticated owner server data. Omits current device state and operational secrets.';

revoke all on function public.export_account_server_data()
  from public, anon, authenticated, service_role;
grant execute on function public.export_account_server_data()
  to authenticated;
