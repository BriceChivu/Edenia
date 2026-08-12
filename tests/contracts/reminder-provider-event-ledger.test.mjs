import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const projectRoot = new URL('../../', import.meta.url)
const migration = await readFile(
  new URL(
    'supabase/migrations/20260812120000_add_reminder_provider_event_ledger.sql',
    projectRoot
  ),
  'utf8'
)
const metricsMigration = await readFile(
  new URL(
    'supabase/migrations/20260812160000_add_reminder_operational_metrics.sql',
    projectRoot
  ),
  'utf8'
)
const workflow = await readFile(
  new URL('.github/workflows/ci.yml', projectRoot),
  'utf8'
)

test('provider events persist bounded non-personal correlation metadata', () => {
  assert.match(migration, /create table private\.reminder_provider_events/)
  assert.match(migration, /primary key \(provider_name, event_id\)/)
  assert.match(migration, /foreign key \(delivery_id\) references private\.reminder_deliveries/)
  assert.match(migration, /provider_name = 'resend'/)
  assert.match(migration, /event_type in \([\s\S]*?'email\.bounced'[\s\S]*?'email\.complained'/)
  assert.match(migration, /action in \('observed', 'suppressed'\)/)
  assert.doesNotMatch(
    migration,
    /recipient_email|email_address|raw_payload|payload json|provider_body/iu
  )
})

test('provider events are private and mutate only through one service RPC', () => {
  assert.match(
    migration,
    /alter table private\.reminder_provider_events enable row level security/
  )
  assert.match(
    migration,
    /revoke all on table private\.reminder_provider_events[\s\S]*?from public, anon, authenticated, service_role/
  )
  assert.match(migration, /create function public\.record_reminder_provider_event/)
  assert.match(
    migration,
    /revoke execute on function public\.record_reminder_provider_event\([\s\S]*?from public, anon, authenticated/
  )
  assert.match(
    migration,
    /grant execute on function public\.record_reminder_provider_event\([\s\S]*?to service_role/
  )
})

test('the event RPC deduplicates before reconciling or suppressing', () => {
  const insertIndex = migration.indexOf('insert into private.reminder_provider_events')
  const acceptanceIndex = migration.indexOf("if v_delivery.status in ('claimed', 'outcome_ambiguous')")
  const suppressionIndex = migration.indexOf('if v_action = \'suppressed\'')
  assert.ok(insertIndex >= 0)
  assert.ok(acceptanceIndex > insertIndex)
  assert.ok(suppressionIndex > acceptanceIndex)
  assert.match(migration, /on conflict \(provider_name, event_id\) do nothing/)
  assert.match(migration, /return 'duplicate'/)
  assert.match(migration, /return 'event_conflict'/)
  assert.match(migration, /return 'unmatched'/)
})

test('only provider-owned adverse events become sticky suppression', () => {
  assert.match(
    migration,
    /when 'email\.bounced' then 'hard_bounce'[\s\S]*?when 'email\.complained' then 'complaint'[\s\S]*?else 'provider_suppressed'/
  )
  assert.match(
    migration,
    /private\.apply_reminder_suppression\([\s\S]*?'provider_webhook'/
  )
  assert.match(
    migration,
    /p_reason in \('hard_bounce', 'complaint', 'provider_suppressed'\)[\s\S]*?p_source = 'provider_webhook'/
  )
})

test('the provider-event migration cannot create a delivery path', () => {
  assert.doesNotMatch(
    migration,
    /cron\.schedule|pg_cron|net\.http|api\.resend\.com|RESEND_API_KEY|Deno\.env|fetch\s*\(/iu
  )
  assert.doesNotMatch(migration, /delivery_enabled\s*=\s*true/iu)
})

test('service-only reminder metrics stay aggregate and cannot send', () => {
  assert.match(
    metricsMigration,
    /create function public\.get_reminder_operational_metrics/
  )
  assert.match(metricsMigration, /duplicate_provider_events_prevented/)
  assert.match(metricsMigration, /oldest_age_seconds/)
  assert.match(metricsMigration, /'provider_accepted'/)
  assert.match(metricsMigration, /'permanent_failure'/)
  assert.match(metricsMigration, /'outcome_ambiguous'/)
  assert.match(
    metricsMigration,
    /revoke execute on function public\.get_reminder_operational_metrics\(timestamptz\)[\s\S]*?from public, anon, authenticated/
  )
  assert.match(
    metricsMigration,
    /grant execute on function public\.get_reminder_operational_metrics\(timestamptz\)[\s\S]*?to service_role/
  )
  assert.doesNotMatch(
    metricsMigration,
    /recipient_email|email_address|raw_payload|provider_body|cron\.schedule|pg_cron|api\.resend\.com|RESEND_API_KEY|Deno\.env|fetch\s*\(/iu
  )
  assert.doesNotMatch(metricsMigration, /delivery_enabled\s*=\s*true/iu)
})

test('provider event SQL verification is mandatory for matching changes', () => {
  assert.match(workflow, /\*_add_reminder_provider_event_ledger\.sql/)
  assert.match(workflow, /reminder_provider_event_ledger\.test\.sql/)
  assert.match(
    workflow,
    /supabase test db supabase\/tests\/reminder_provider_event_ledger\.test\.sql --local/
  )
})
