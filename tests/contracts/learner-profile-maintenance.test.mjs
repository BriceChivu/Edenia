import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const workflow = await readFile(
  new URL('../../.github/workflows/learner-profile-disaster-backup.yml', import.meta.url),
  'utf8'
)
const runbook = await readFile(
  new URL('../../docs/learner-profile-operations.md', import.meta.url),
  'utf8'
)
const migration = await readFile(
  new URL('../../supabase/migrations/20260823164742_learner_profile_retention_capacity_maintenance.sql', import.meta.url),
  'utf8'
)
const concurrencyProbe = await readFile(
  new URL('../../scripts/test-learner-profile-concurrency.mjs', import.meta.url),
  'utf8'
)

test('learner profile disaster backup workflow runs a weekly off-project dump and restore rehearsal', () => {
  assert.match(workflow, /schedule:\s*[\s\S]*cron:/)
  assert.match(workflow, /SUPABASE_DB_URL:/)
  assert.match(workflow, /version:\s*2\.116\.0/)
  assert.match(workflow, /supabase db dump[\s\S]*--file/)
  assert.match(workflow, /--data-only[\s\S]*--use-copy/)
  assert.match(
    workflow,
    /cd "\$backup_dir"[\s\S]*sha256sum schema\.sql data\.sql[\s\S]*SHA256SUMS/
  )
  assert.match(workflow, /actions\/upload-artifact@v4/)
  assert.match(workflow, /retention-days:\s*35/)
  assert.match(workflow, /supabase init --workdir "\$restore_project"/)
  assert.match(
    workflow,
    /supabase start[\s\S]*--workdir "\$restore_project"[\s\S]*--exclude/
  )
  assert.match(workflow, /supabase status[\s\S]*--workdir "\$restore_project"[\s\S]*-o json/)
  assert.match(workflow, /supabase stop[\s\S]*--workdir "\$RUNNER_TEMP\/edenia-restore-project"/)
  assert.match(workflow, /sub\(":\/\/postgres:"; ":\/\/supabase_admin:"\)/)
  assert.match(
    workflow,
    /psql "\$restore_db_url"[\s\S]*--single-transaction[\s\S]*ON_ERROR_STOP=1[\s\S]*schema\.sql[\s\S]*data\.sql/
  )
  assert.doesNotMatch(workflow, /supabase db query --local --file/)
  assert.doesNotMatch(workflow, /cat\s+.*(?:schema|data)\.sql/)
  assert.doesNotMatch(workflow, /echo\s+.*SUPABASE_DB_URL/)
})

test('learner profile operations runbook records the capacity gate and restore rehearsal', () => {
  assert.match(runbook, /record_learner_profile_capacity_check/)
  assert.match(runbook, /record_learner_profile_capacity_policy/)
  assert.match(runbook, /set_learner_profile_cleanup_enabled/)
  assert.match(runbook, /restore rehearsal/i)
  assert.match(runbook, /35 days/i)
  assert.match(runbook, /read-only/i)
  assert.match(runbook, /psql "\$restore_db_url"/)
  assert.match(runbook, /--single-transaction/)
  assert.match(runbook, /ON_ERROR_STOP=1/)
  assert.match(runbook, /supabase init --workdir "\$restore_project"/)
  assert.match(runbook, /supabase start[\s\S]*--workdir "\$restore_project"[\s\S]*--exclude/)
  assert.doesNotMatch(runbook, /supabase db query --local --file/)
  assert.doesNotMatch(runbook, /select\s+.*(?:email|envelope|state_json)/i)
})

test('retention maintenance locks profile writes and never deletes idempotency receipts', () => {
  assert.match(migration, /lock table[\s\S]*learner_profile_heads[\s\S]*learner_profile_versions/)
  assert.match(migration, /learner_profile_write_receipts/)
  assert.match(migration, /delete from public\.learner_profile_versions/)
  assert.doesNotMatch(migration, /delete from public\.learner_profile_write_receipts/)
  assert.match(migration, /database_limit_bytes bigint not null default 524288000/)
  assert.match(migration, /warning_fraction numeric\(5,4\) not null default 0\.7000/)
  assert.match(migration, /record_learner_profile_capacity_policy/)
  assert.match(migration, /protected_projected_cost_bytes/)
  assert.match(concurrencyProbe, /run_learner_profile_maintenance\(null, false\)/)
  assert.match(concurrencyProbe, /row exclusive mode/)
})
