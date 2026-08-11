import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readdir, readFile } from 'node:fs/promises'
import test from 'node:test'

const projectRoot = new URL('../../', import.meta.url)
const migrationsRoot = new URL('supabase/migrations/', projectRoot)
const functionsRoot = new URL('supabase/functions/', projectRoot)

const APPLIED_MIGRATION_HASHES = Object.freeze({
  '20260724083801_add_checkout_session_redemptions.sql':
    '4e32cf150af1f1f8131891487b62988f6813eee4f95c8b48c68a0f3f1ed30cc7',
  '20260724100505_add_plus_schema.sql':
    'ace32c5bcda6a136251f163746476588cc2054135f25fcac3f7ed450e55ba6ae',
  '20260724110044_enforce_plus_backup_access.sql':
    '06917713d08654c4a02d75f6baecb46eb7510dfbd14a8a3158c3e6ce4695fce6',
  '20260724111513_enforce_atomic_founding_member_limit.sql':
    'dd2df121f71db5171fa33b1b7c60bef1a1e4ce872fc869795079705f587ffa36',
  '20260724112256_keep_state_backup_history.sql':
    '678fdb88532213cf3034e0851c7a635468e0c381de5e12ba07aa7351c6629d97',
  '20260724115832_reserve_founding_checkout_slots.sql':
    '2242d15329ecebcc446f710de98533b772e02d0c13e6971986037c0231c35b13',
  '20260724120318_index_founding_checkout_reservation_user.sql':
    '9d4df46ad6e40efcb785199665f6be2df90642d7b459e7945ccc8605d691bcb6'
})

test('applied Supabase migrations preserve their exact identities and bytes', async () => {
  const migrationFiles = (await readdir(migrationsRoot)).sort()
  for (const migrationFile of Object.keys(APPLIED_MIGRATION_HASHES)) {
    assert.ok(
      migrationFiles.includes(migrationFile),
      `${migrationFile} must remain in additive migration history`
    )
  }
  for (const migrationFile of migrationFiles) {
    assert.match(
      migrationFile,
      /^\d{14}_[a-z0-9_]+\.sql$/,
      `${migrationFile} must use a Supabase migration identity`
    )
  }

  for (const migrationFile of Object.keys(APPLIED_MIGRATION_HASHES)) {
    const source = await readFile(new URL(migrationFile, migrationsRoot))
    const hash = createHash('sha256').update(source).digest('hex')
    assert.equal(
      hash,
      APPLIED_MIGRATION_HASHES[migrationFile],
      `${migrationFile} must remain byte-identical to the applied migration`
    )
  }
})

test('billing hardening stays authenticated, environment-owned, and additive', async () => {
  const config = await readFile(
    new URL('supabase/config.toml', projectRoot),
    'utf8'
  )
  assert.match(
    config,
    /\[functions\.create-checkout-session\][\s\S]*?verify_jwt = true/
  )
  assert.match(
    config,
    /\[functions\.stripe-webhook\][\s\S]*?verify_jwt = false/
  )
  assert.match(
    config,
    /\[functions\.link-checkout-session\][\s\S]*?verify_jwt = false/
  )
  assert.match(
    config,
    /\[functions\.create-billing-portal\][\s\S]*?verify_jwt = true/
  )
  assert.match(
    config,
    /\[functions\.get-plus-offer\][\s\S]*?verify_jwt = false/
  )

  const checkoutSource = await readFile(
    new URL('create-checkout-session/index.ts', functionsRoot),
    'utf8'
  )
  assert.match(checkoutSource, /supabase\.auth\.getUser\(token\)/)
  assert.match(checkoutSource, /assertOnlyKeys\(body, \['plan'\]\)/)
  assert.match(checkoutSource, /supabase_user_id: user\.id/)
  assert.doesNotMatch(checkoutSource, /price_[A-Za-z0-9]{10,}/)
  assert.doesNotMatch(checkoutSource, /founding-member-first-year/)
  assert.match(checkoutSource, /\/plus\/\?upgrade_success=1/)
  assert.match(checkoutSource, /\/plus\/\?checkout_cancelled=1/)

  const portalSource = await readFile(
    new URL('create-billing-portal/index.ts', functionsRoot),
    'utf8'
  )
  assert.match(portalSource, /supabase\.auth\.getUser\(token\)/)
  assert.match(portalSource, /stripe\.billingPortal\.sessions\.create/)
  assert.match(portalSource, /\.eq\('user_id', user\.id\)/)

  const offerSource = await readFile(
    new URL('get-plus-offer/index.ts', functionsRoot),
    'utf8'
  )
  assert.match(offerSource, /stripe\.prices\.retrieve/)
  assert.match(offerSource, /normalizePublicPlusPlan/)
  assert.doesNotMatch(offerSource, /sk_(?:test|live)_/)

  const webhookSource = await readFile(
    new URL('stripe-webhook/index.ts', functionsRoot),
    'utf8'
  )
  assert.match(webhookSource, /claim_stripe_webhook_event/)
  assert.match(webhookSource, /complete_stripe_webhook_event/)
  assert.match(webhookSource, /release_stripe_webhook_event/)
  assert.match(webhookSource, /readStripeWebhookConfig/)

  const migrationFiles = (await readdir(migrationsRoot)).filter(file =>
    file.endsWith('_harden_stripe_billing_lifecycle.sql')
  )
  assert.equal(migrationFiles.length, 1)
  const migration = await readFile(
    new URL(migrationFiles[0], migrationsRoot),
    'utf8'
  )
  assert.match(migration, /create table public\.stripe_webhook_events/)
  assert.match(migration, /create table public\.billing_rate_limit_buckets/)
  assert.match(migration, /security definer\nset search_path = ''/)
  assert.match(
    migration,
    /set past_due_since = coalesce\(past_due_since, updated_at, now\(\)\)/
  )
  assert.match(migration, /subscriptions\.past_due_since > now\(\) - interval '7 days'/)
  assert.match(
    migration,
    /revoke all on table public\.stripe_webhook_events from public, anon, authenticated/
  )

  const cancellationMigrations = (await readdir(migrationsRoot)).filter(file =>
    file.endsWith('_add_subscription_cancellation_state.sql')
  )
  assert.equal(cancellationMigrations.length, 1)
  const cancellationMigration = await readFile(
    new URL(cancellationMigrations[0], migrationsRoot),
    'utf8'
  )
  assert.match(
    cancellationMigration,
    /add column cancel_at_period_end boolean not null default false/
  )
})

test('Supabase source contains the five staged billing Edge Functions', async () => {
  const entries = await readdir(functionsRoot, { withFileTypes: true })
  const functionNames = entries
    .filter(entry => entry.isDirectory() && entry.name !== '_shared')
    .map(entry => entry.name)
    .sort()
  assert.deepEqual(functionNames, [
    'create-billing-portal',
    'create-checkout-session',
    'get-plus-offer',
    'link-checkout-session',
    'stripe-webhook'
  ])

  const config = await readFile(
    new URL('supabase/config.toml', projectRoot),
    'utf8'
  )
  for (const functionName of functionNames) {
    assert.match(config, new RegExp(`\\[functions\\.${functionName}\\]`))
    assert.match(
      config,
      new RegExp(`entrypoint = "\\./functions/${functionName}/index\\.ts"`)
    )

    const denoConfig = JSON.parse(await readFile(
      new URL(`${functionName}/deno.json`, functionsRoot),
      'utf8'
    ))
    assert.equal(
      denoConfig.imports['@supabase/supabase-js'],
      'npm:@supabase/supabase-js@2.110.7'
    )

    const functionSource = await readFile(
      new URL(`${functionName}/index.ts`, functionsRoot),
      'utf8'
    )
    assert.match(
      functionSource,
      /https:\/\/esm\.sh\/stripe@14\.25\.0\?target=deno/
    )
    assert.doesNotMatch(functionSource, /stripe@14\?target=deno/)
  }
})

test('shared backend tests remain connected to package scripts and CI', async () => {
  const packageJson = JSON.parse(await readFile(
    new URL('package.json', projectRoot),
    'utf8'
  ))
  assert.equal(
    packageJson.scripts['test:supabase'],
    'node --test supabase/functions/_shared/*.test.ts'
  )
  assert.match(packageJson.scripts.test, /npm run test:supabase/)
  assert.match(packageJson.scripts['test:ci'], /npm run test:supabase/)

  const workflow = await readFile(
    new URL('.github/workflows/ci.yml', projectRoot),
    'utf8'
  )
  assert.match(workflow, /supabase\/\*\)/)
  assert.match(workflow, /name: Run Supabase backend tests/)
  assert.match(workflow, /run: npm run test:supabase/)
  assert.match(workflow, /version: 2\.111\.0/)
  assert.match(
    workflow,
    /name: Start isolated Supabase database[\s\S]*run: supabase start/
  )
  assert.doesNotMatch(workflow, /supabase db query --local --file/)
  assert.match(
    workflow,
    /supabase test db supabase\/tests\/reminder_preferences_rls\.test\.sql --local/
  )
})
