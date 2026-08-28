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
    '9d4df46ad6e40efcb785199665f6be2df90642d7b459e7945ccc8605d691bcb6',
  '20260811164133_add_reminder_preferences.sql':
    '630024afcbda54bd0343ae387ba165a40fb646fe75bff4c6508ad32125b8b81b',
  '20260811181142_add_reminder_dispatch_ledger.sql':
    '8df254b6347b98101aae80cb1b31f36dd622c5486e2c65bdba84facf00db5588',
  '20260811190020_add_reminder_suppression_safety.sql':
    '33fcc3067389f4d565592f4bbd1432d09dc733cf02aa7f1bac0460ba56880d9d',
  '20260811204159_add_reminder_provider_delivery_state.sql':
    '09cbea7e1c2519d683d145d14f3872a2edee6596746320e0e3046a84063d2db0',
  '20260811210318_fence_live_reminder_prerequisites.sql':
    'c79bdf333fd9d5072c1355651fe38999c4282dd2bbcee000647924ab978df2af',
  '20260811213747_add_reminder_provider_event_ledger.sql':
    '64cf6ccfb918c82db7679e6dac20d8ede482fac8b5f5fc97c787bb48323217b2',
  '20260811224323_optimize_account_owner_policies.sql':
    '0d1f8fb9f3ffeef110e90ec48661b2158ae938e671cf062bcb0eb2a0c05e4620',
  '20260811230042_add_self_scoped_account_export.sql':
    '90b65e79dd0c63f0f74079dab18dffdbd1e51fe63413f0b88869b4c432e8d230',
  '20260811231519_hide_account_export_definer.sql':
    'a870a47f3fdde3fea9987a05f6d693386473ae766d4ad7503b3d8ebb2a1de100',
  '20260812000351_ensure_account_export_rate_limit.sql':
    '06b324039d1210c92d56c06bf2ffe057399fb0a66a25383aabcc26b63369bd90',
  '20260812002050_ensure_stripe_webhook_prerequisites.sql':
    '64417c01d94fc580f8eeb6d5548bf8e2e0a4fe69b5e6822fb256a5856648aa45',
  '20260812032007_add_reminder_operational_metrics.sql':
    'ebf1be299cb342b1e137557f1273b4a05c0a5bf758cf652a6c0e096d50de9c28'
})

test('production Auth config preserves exact returns and Free-plan safeguards', async () => {
  const config = await readFile(
    new URL('supabase/config.toml', projectRoot),
    'utf8'
  )

  assert.match(
    config,
    /\[auth\][\s\S]*?site_url = "https:\/\/www\.edenia\.study\/"/
  )
  assert.doesNotMatch(config, /auth\/confirm/)
  assert.doesNotMatch(config, /additional_redirect_urls = \[[^\]]*\*/)
  assert.match(
    config,
    /\[auth\.email\][\s\S]*?enable_confirmations = true[\s\S]*?max_frequency = "1m"[\s\S]*?otp_length = 6/
  )
  assert.match(
    config,
    /\[auth\.mfa\.totp\][\s\S]*?enroll_enabled = true[\s\S]*?verify_enabled = true/
  )
  assert.match(config, /\[storage\.vector\][\s\S]*?enabled = false/)
  assert.doesNotMatch(config, /site_url = "http:|https:\/\/127\.0\.0\.1:3000/)
})

test('new and existing users receive the same branded six-digit code', async () => {
  const config = await readFile(
    new URL('supabase/config.toml', projectRoot),
    'utf8'
  )
  const templateFiles = ['confirmation.html', 'magic_link.html']

  const templates = []
  for (const templateFile of templateFiles) {
    const template = await readFile(
      new URL(`supabase/templates/${templateFile}`, projectRoot),
      'utf8'
    )
    templates.push(template)

    assert.match(template, /<title>Edenia<\/title>/, templateFile)
    assert.match(template, />\{\{ \.Token \}\}</, templateFile)
    assert.match(template, /six-digit code/i, templateFile)
    for (const locale of ['en', 'es', 'fr', 'zh-Hans', 'zh-Hant']) {
      assert.match(
        template,
        new RegExp(`\\.Data\\.edenia_auth_locale "${locale}"`),
        `${templateFile}:${locale}`
      )
    }
    assert.match(template, /código de seis dígitos/i, templateFile)
    assert.match(template, /code à six chiffres/i, templateFile)
    assert.match(template, /六位数验证码/, templateFile)
    assert.match(template, /六位數驗證碼/, templateFile)
    assert.doesNotMatch(
      template,
      /ConfirmationURL|TokenHash|auth\/confirm|supabase\.co|essddsmidqigxwhuzlgo/i,
      templateFile
    )
    assert.doesNotMatch(
      template,
      /<script|<form|<img|<a\b|https?:\/\//i,
      templateFile
    )
  }
  assert.equal(templates[0], templates[1])

  assert.match(
    config,
    /\[auth\.email\.template\.confirmation\][\s\S]*?content_path = "\.\/supabase\/templates\/confirmation\.html"/
  )
  assert.match(
    config,
    /\[auth\.email\.template\.magic_link\][\s\S]*?content_path = "\.\/supabase\/templates\/magic_link\.html"/
  )
  assert.equal(
    config.match(/subject = .*edenia_auth_locale.*$/gm)?.length,
    2
  )
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

test('account owner policies use statement-level auth identity without widening access', async () => {
  const source = await readFile(
    new URL('20260811224323_optimize_account_owner_policies.sql', migrationsRoot),
    'utf8'
  )

  assert.match(
    source,
    /alter policy "Users can view their own subscription"[\s\S]*using \(\(select auth\.uid\(\)\) = user_id\);/
  )
  assert.match(
    source,
    /alter policy "Users can view their own founding member status"[\s\S]*using \(\(select auth\.uid\(\)\) = user_id\);/
  )
  assert.equal(source.match(/alter policy/g)?.length, 2)
  assert.equal(source.match(/select auth\.uid\(\)/g)?.length, 2)
  assert.doesNotMatch(source, /create policy|drop policy|grant|revoke/i)
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

  const obsoleteBillingMigrations = (await readdir(migrationsRoot)).filter(file =>
    file.endsWith('_harden_stripe_billing_lifecycle.sql')
      || file.endsWith('_add_subscription_cancellation_state.sql')
  )
  assert.deepEqual(obsoleteBillingMigrations, [])

  const rateLimitRepairMigrations = (await readdir(migrationsRoot)).filter(file =>
    file.endsWith('_ensure_account_export_rate_limit.sql')
  )
  assert.equal(rateLimitRepairMigrations.length, 1)
  const rateLimitRepairMigration = await readFile(
    new URL(rateLimitRepairMigrations[0], migrationsRoot),
    'utf8'
  )
  assert.match(
    rateLimitRepairMigration,
    /create table if not exists public\.billing_rate_limit_buckets/
  )
  assert.match(
    rateLimitRepairMigration,
    /create or replace function public\.consume_billing_rate_limit\(/
  )
  assert.match(
    rateLimitRepairMigration,
    /revoke all on function public\.consume_billing_rate_limit\([\s\S]*from public, anon, authenticated/
  )
  assert.match(
    rateLimitRepairMigration,
    /grant execute on function public\.consume_billing_rate_limit\([\s\S]*to service_role/
  )

  const webhookRepairMigrations = (await readdir(migrationsRoot)).filter(file =>
    file.endsWith('_ensure_stripe_webhook_prerequisites.sql')
  )
  assert.equal(webhookRepairMigrations.length, 1)
  const webhookRepairMigration = await readFile(
    new URL(webhookRepairMigrations[0], migrationsRoot),
    'utf8'
  )
  assert.match(
    webhookRepairMigration,
    /create table if not exists public\.stripe_webhook_events/
  )
  assert.match(
    webhookRepairMigration,
    /create or replace function public\.claim_stripe_webhook_event\(/
  )
  assert.match(
    webhookRepairMigration,
    /revoke all on function public\.claim_stripe_webhook_event\([\s\S]*from public, anon, authenticated/
  )
  assert.match(
    webhookRepairMigration,
    /add column if not exists cancel_at_period_end boolean not null default false/
  )

  const backupGraceMigrations = (await readdir(migrationsRoot)).filter(file =>
    file.endsWith('_reconcile_plus_backup_grace_policies.sql')
  )
  assert.equal(backupGraceMigrations.length, 1)
  const backupGraceMigration = await readFile(
    new URL(backupGraceMigrations[0], migrationsRoot),
    'utf8'
  )
  assert.match(
    backupGraceMigration,
    /set past_due_since = coalesce\(past_due_since, updated_at, now\(\)\)/
  )
  assert.match(
    backupGraceMigration,
    /subscriptions\.past_due_since > now\(\) - interval '7 days'/
  )
  assert.match(
    backupGraceMigration,
    /drop policy if exists "Plus users can update their own state backup"/
  )
  assert.match(
    backupGraceMigration,
    /revoke update on table public\.state_backups from public, anon, authenticated/
  )
  assert.doesNotMatch(
    backupGraceMigration,
    /create policy "Plus users can update their own state backup"/
  )
})

test('Supabase source contains the staged backend Edge Functions', async () => {
  const entries = await readdir(functionsRoot, { withFileTypes: true })
  const functionNames = entries
    .filter(entry => entry.isDirectory() && entry.name !== '_shared')
    .map(entry => entry.name)
    .sort()
  assert.deepEqual(functionNames, [
    'auth-health-monitor',
    'consume-legacy-progress-transfer',
    'create-billing-portal',
    'create-checkout-session',
    'create-legacy-progress-transfer',
    'dispatch-study-reminders',
    'export-account-data',
    'get-plus-offer',
    'link-checkout-session',
    'resend-reminder-webhook',
    'stripe-webhook',
    'unsubscribe-study-reminders'
  ])

  const reminderFunctionNames = new Set([
    'dispatch-study-reminders',
    'resend-reminder-webhook',
    'unsubscribe-study-reminders'
  ])
  const relayFunctionNames = new Set([
    'consume-legacy-progress-transfer',
    'create-legacy-progress-transfer'
  ])
  const billingFunctionNames = functionNames.filter(
    functionName => !reminderFunctionNames.has(functionName)
      && !relayFunctionNames.has(functionName)
      && functionName !== 'auth-health-monitor'
      && functionName !== 'export-account-data'
  )
  const config = await readFile(new URL('supabase/config.toml', projectRoot), 'utf8')
  for (const functionName of billingFunctionNames) {
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

  assert.match(
    config,
    /\[functions\.auth-health-monitor\][\s\S]*?verify_jwt = false/
  )
  const authMonitorDenoConfig = JSON.parse(await readFile(
    new URL('auth-health-monitor/deno.json', functionsRoot),
    'utf8'
  ))
  assert.equal(
    authMonitorDenoConfig.imports['@supabase/supabase-js'],
    'npm:@supabase/supabase-js@2.110.7'
  )
  const authMonitorSource = await readFile(
    new URL('auth-health-monitor/index.ts', functionsRoot),
    'utf8'
  )
  assert.match(authMonitorSource, /auth\/v1\/health/)
  assert.match(authMonitorSource, /record_auth_health_check_from_monitor/)
  assert.match(authMonitorSource, /read_auth_health_monitor_status/)

  assert.match(
    config,
    /\[functions\.unsubscribe-study-reminders\][\s\S]*?verify_jwt = false/
  )
  const unsubscribeDenoConfig = JSON.parse(await readFile(
    new URL('unsubscribe-study-reminders/deno.json', functionsRoot),
    'utf8'
  ))
  assert.equal(
    unsubscribeDenoConfig.imports['@supabase/server'],
    'npm:@supabase/server@1.4.1'
  )
  const unsubscribeSource = await readFile(
    new URL('unsubscribe-study-reminders/index.ts', functionsRoot),
    'utf8'
  )
  assert.match(unsubscribeSource, /auth: 'none', cors: false/)
  assert.match(unsubscribeSource, /context\.supabaseAdmin/)
  assert.doesNotMatch(unsubscribeSource, /Deno\.env|getUser|\.from\(/)

  const unsubscribeHandlerSource = await readFile(
    new URL('_shared/reminder-unsubscribe.ts', functionsRoot),
    'utf8'
  )
  assert.match(unsubscribeHandlerSource, /'Content-Type': 'application\/json/)
  assert.match(unsubscribeHandlerSource, /https:\/\/www\.edenia\.study/)
  assert.match(unsubscribeHandlerSource, /http:\/\/localhost:8000/)
  assert.doesNotMatch(unsubscribeHandlerSource, /text\/html|<!doctype html>/i)

  assert.match(
    config,
    /\[functions\.resend-reminder-webhook\][\s\S]*?verify_jwt = false/
  )
  const resendWebhookDenoConfig = JSON.parse(await readFile(
    new URL('resend-reminder-webhook/deno.json', functionsRoot),
    'utf8'
  ))
  assert.equal(
    resendWebhookDenoConfig.imports['@supabase/supabase-js'],
    'npm:@supabase/supabase-js@2.110.7'
  )
  assert.equal(
    resendWebhookDenoConfig.imports.svix,
    'npm:svix@1.99.1'
  )
  const resendWebhookSource = await readFile(
    new URL('resend-reminder-webhook/index.ts', functionsRoot),
    'utf8'
  )
  assert.match(resendWebhookSource, /RESEND_WEBHOOK_SECRET/)
  assert.match(resendWebhookSource, /record_reminder_provider_event/)
  assert.doesNotMatch(resendWebhookSource, /RESEND_API_KEY|api\.resend\.com/)

  assert.match(
    config,
    /\[functions\.export-account-data\][\s\S]*?verify_jwt = true/
  )
  const exportDenoConfig = JSON.parse(await readFile(
    new URL('export-account-data/deno.json', functionsRoot),
    'utf8'
  ))
  assert.equal(
    exportDenoConfig.imports['@supabase/supabase-js'],
    'npm:@supabase/supabase-js@2.110.7'
  )
  const exportSource = await readFile(
    new URL('export-account-data/index.ts', functionsRoot),
    'utf8'
  )
  assert.match(exportSource, /supabase\.auth\.getUser\(token\)/)
  assert.match(exportSource, /export_account_server_data_for_service/)
  assert.match(exportSource, /p_verified_user_id: userId/)
  assert.match(exportSource, /scope: 'account-export-user'/)
  assert.doesNotMatch(exportSource, /private\.export_account_server_data|console\./)
})

test('account server export stays self-scoped and omits operational secrets', async () => {
  const exportMigrations = (await readdir(migrationsRoot)).filter(file =>
    file.endsWith('_add_self_scoped_account_export.sql')
  )
  assert.equal(exportMigrations.length, 1)

  const migration = await readFile(
    new URL(exportMigrations[0], migrationsRoot),
    'utf8'
  )
  assert.match(
    migration,
    /function public\.export_account_server_data\(\)\nreturns jsonb/
  )
  assert.match(migration, /stable\nsecurity definer\nset search_path = ''/)
  assert.match(migration, /export_user_id uuid := \(select auth\.uid\(\)\)/)
  assert.match(migration, /where account_user\.id = export_user_id/)
  assert.match(migration, /'current_device_progress', false/)
  assert.match(migration, /'state', backup\.state_json/)
  assert.match(
    migration,
    /revoke all on function public\.export_account_server_data\(\)[\s\S]*from public, anon, authenticated, service_role/
  )
  assert.match(
    migration,
    /grant execute on function public\.export_account_server_data\(\)[\s\S]*to authenticated/
  )
  assert.doesNotMatch(migration, /\bp_user_id\b/)
  assert.doesNotMatch(
    migration,
    /\b(?:token_digest|claim_token|stripe_customer_id|stripe_subscription_id|email_hash|stripe_checkout_session_id|provider_message_id|event_id)\b/
  )
  assert.doesNotMatch(
    migration,
    /\b(?:insert into|update|delete from|alter table|create table)\b/i
  )

  const routingMigrations = (await readdir(migrationsRoot)).filter(file =>
    file.endsWith('_hide_account_export_definer.sql')
  )
  assert.equal(routingMigrations.length, 1)

  const routingMigration = await readFile(
    new URL(routingMigrations[0], migrationsRoot),
    'utf8'
  )
  assert.match(
    routingMigration,
    /alter function public\.export_account_server_data\(\)[\s\S]*set schema private/
  )
  assert.match(
    routingMigration,
    /create function public\.export_account_server_data_for_service\([\s\S]*p_verified_user_id uuid[\s\S]*security definer/
  )
  assert.match(
    routingMigration,
    /exported_data := private\.export_account_server_data\(\)/
  )
  assert.match(
    routingMigration,
    /set_config\([\s\S]*'request\.jwt\.claim\.sub'[\s\S]*p_verified_user_id::text/
  )
  assert.match(
    routingMigration,
    /grant execute on function public\.export_account_server_data_for_service\(uuid\)[\s\S]*to service_role/
  )
  assert.doesNotMatch(routingMigration, /grant .* on (?:table|all tables)/i)
  assert.doesNotMatch(routingMigration, /grant usage on schema private/i)
  assert.doesNotMatch(
    routingMigration,
    /grant execute on function [^\n]+[\s\S]*to (?:anon|authenticated)/
  )
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
  assert.equal(
    packageJson.scripts['test:reminder-function'],
    'deno check --frozen --config supabase/functions/dispatch-study-reminders/deno.json supabase/functions/dispatch-study-reminders/index.ts && deno check --frozen --config supabase/functions/unsubscribe-study-reminders/deno.json supabase/functions/unsubscribe-study-reminders/index.ts && deno check --frozen --config supabase/functions/resend-reminder-webhook/deno.json supabase/functions/resend-reminder-webhook/index.ts'
  )
  assert.equal(
    packageJson.scripts['test:account-export-function'],
    'deno check --frozen --config supabase/functions/export-account-data/deno.json supabase/functions/export-account-data/index.ts'
  )
  assert.match(packageJson.scripts.test, /npm run test:supabase/)
  assert.match(packageJson.scripts.test, /npm run test:reminder-function/)
  assert.match(packageJson.scripts.test, /npm run test:account-export-function/)
  assert.match(packageJson.scripts['test:ci'], /npm run test:supabase/)
  assert.match(packageJson.scripts['test:ci'], /npm run test:reminder-function/)
  assert.match(packageJson.scripts['test:ci'], /npm run test:account-export-function/)

  const workflow = await readFile(
    new URL('.github/workflows/ci.yml', projectRoot),
    'utf8'
  )
  assert.match(workflow, /supabase\/\*\)/)
  assert.match(workflow, /name: Run Supabase backend tests/)
  assert.match(workflow, /run: npm run test:supabase/)
  assert.match(workflow, /uses: denoland\/setup-deno@v2/)
  assert.match(workflow, /deno-version: v2\.1\.4/)
  assert.match(workflow, /run: npm run test:reminder-function/)
  assert.match(workflow, /run: npm run test:account-export-function/)
  assert.match(workflow, /version: 2\.111\.0/)
  assert.match(
    workflow,
    /name: Start isolated Supabase database[\s\S]*run: supabase start/
  )
  assert.doesNotMatch(workflow, /supabase db query --local --file/)
  assert.match(
    workflow,
    /supabase test db supabase\/tests\/learner_profile_progress_sync\.test\.sql --local/
  )
  assert.match(
    workflow,
    /supabase\/migrations\/\*_synchronize_learner_profile_progress\.sql\|supabase\/tests\/learner_profile_progress_sync\.test\.sql/
  )
  assert.match(
    workflow,
    /supabase test db supabase\/tests\/learner_profile_import\.test\.sql --local/
  )
  assert.match(
    workflow,
    /supabase\/migrations\/\*_import_learner_profile_with_rollback\.sql\|supabase\/tests\/learner_profile_import\.test\.sql/
  )
  assert.match(
    workflow,
    /supabase test db supabase\/tests\/reminder_preferences_rls\.test\.sql --local/
  )
  assert.match(
    workflow,
    /supabase test db supabase\/tests\/account_owner_policies\.test\.sql --local/
  )
  assert.match(
    workflow,
    /supabase\/migrations\/\*_optimize_account_owner_policies\.sql\|supabase\/tests\/account_owner_policies\.test\.sql/
  )
  assert.match(
    workflow,
    /supabase test db supabase\/tests\/account_server_data_export\.test\.sql --local/
  )
  assert.match(
    workflow,
    /supabase\/migrations\/\*_add_self_scoped_account_export\.sql\|supabase\/migrations\/\*_hide_account_export_definer\.sql\|supabase\/tests\/account_server_data_export\.test\.sql/
  )
  assert.match(
    workflow,
    /supabase test db supabase\/tests\/account_export_rate_limit\.test\.sql --local/
  )
  assert.match(
    workflow,
    /supabase\/migrations\/\*_ensure_account_export_rate_limit\.sql\|supabase\/tests\/account_export_rate_limit\.test\.sql/
  )
})
