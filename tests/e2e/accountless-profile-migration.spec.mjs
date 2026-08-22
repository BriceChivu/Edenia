import { expect, test } from '../support/network-fixture.mjs'

const DAY_MS = 24 * 60 * 60 * 1000
const OWNER_ID = '123e4567-e89b-42d3-a456-426614174000'
const PROFILE_ID = '323e4567-e89b-42d3-a456-426614174002'
const AUTH_STORAGE_KEY = 'edenia_v1_internal_test_plus_auth_v1'
const PROFILE_ACCESS_STORAGE_KEY =
  'edenia_v1_internal_test_learner_profile_access_v1'
const PROFILE_SYNC_STORAGE_KEY =
  'edenia_v1_internal_test_learner_profile_sync_v1'
const MIGRATION_STORAGE_KEY =
  'edenia_v1_internal_test_accountless_profile_migration_v1'
const MIGRATION_BACKUP_STORAGE_KEY =
  `${PROFILE_SYNC_STORAGE_KEY}_accountless_migration`
const STATE_STORAGE_KEY = 'edenia_v1_internal_test'
const SECRET_CHANNEL_NAME = 'LEGACY PRIVATE LEARNER CHANNEL'

function runtimeConfig(enabled) {
  return `window.EDENIA_CONFIG = {
    youtubeApiKey: '',
    freePlusEnabled: false,
    plusCheckoutEnabled: false,
    accountFeaturesRollout: '${enabled ? 'internal' : 'off'}',
    learnerProfileLifecycleEnabled: ${enabled},
    studyGuidanceEnabled: false,
    indexedDbBackupsEnabled: false,
    indexedDbBackupCleanupEnabled: false,
    supabaseUrl: 'https://accountless-profile-test.supabase.co',
    supabasePublishableKey: 'test-publishable-key'
  }`
}

function restoredSession() {
  const encode = value => Buffer.from(JSON.stringify(value)).toString('base64url')
  return {
    access_token: `${encode({ alg: 'HS256', typ: 'JWT' })}.${encode({
      aud: 'authenticated',
      exp: 1893456000,
      role: 'authenticated',
      sub: OWNER_ID
    })}.test-signature`,
    expires_at: 1893456000,
    expires_in: 31536000,
    refresh_token: 'test-refresh-token',
    token_type: 'bearer',
    user: {
      id: OWNER_ID,
      email: 'accountless-owner@example.com',
      app_metadata: { provider: 'email', providers: ['email'] },
      user_metadata: {}
    }
  }
}

async function seedAccountlessProfile(page, { withSession = false } = {}) {
  return page.evaluate(({
    authStorageKey,
    channelName,
    session,
    stateStorageKey,
    withRestoredSession
  }) => {
    const state = window.defaultState(4, [], 'light', [], 'en')
    const completedAt = '2026-08-18T00:00:00.000Z'
    state.onboarding.introSeenAt = completedAt
    state.onboarding.setupCompleted = true
    state.onboarding.setupCompletedAt = completedAt
    state.onboarding.walkthroughCompleted = true
    state.onboarding.walkthroughCompletedAt = completedAt
    state.config.ankiEnabled = false
    state.config.channels = [{
      id: 'accountless-private-channel',
      image: '',
      language: 'French',
      name: channelName
    }]
    state.streak = {
      current: 41,
      lastActivityDate: '2026-08-21',
      longest: 41
    }
    const serialized = JSON.stringify(state)
    localStorage.setItem(stateStorageKey, serialized)
    if (withRestoredSession) {
      localStorage.setItem(authStorageKey, JSON.stringify(session))
    }
    return serialized
  }, {
    authStorageKey: AUTH_STORAGE_KEY,
    channelName: SECRET_CHANNEL_NAME,
    session: restoredSession(),
    stateStorageKey: STATE_STORAGE_KEY,
    withRestoredSession: withSession
  })
}

async function installRuntimeRoute(page, isEnabled) {
  await page.route('**/config.local.js', route => route.fulfill({
    body: runtimeConfig(isEnabled()),
    contentType: 'text/javascript',
    status: 200
  }))
}

function fulfillMigration(route) {
  const operation = route.request().postDataJSON()
  return route.fulfill({
    json: [{
      envelope: operation.p_envelope,
      generation: 1,
      payload_sha256: operation.p_envelope.integrity.payloadSha256,
      profile_id: PROFILE_ID,
      revision: 1,
      status: 'migrated'
    }],
    status: 200
  })
}

test('the grace notice snoozes early and becomes non-dismissible for the final seven days', async ({
  page
}, testInfo) => {
  test.skip(!['desktop-standard', 'phone-small'].includes(testInfo.project.name))
  let enabled = false
  await installRuntimeRoute(page, () => enabled)
  await page.route('https://accountless-profile-test.supabase.co/**', route => (
    route.fulfill({ json: {}, status: 200 })
  ))

  await page.goto('/?internal_test=1')
  await seedAccountlessProfile(page)
  enabled = true
  await page.reload({ waitUntil: 'domcontentloaded' })

  await expect(page.locator('#mainApp')).toBeVisible()
  await expect(page.locator('#accountlessProfileMigrationNotice')).toBeVisible()
  await expect(page.locator('#accountlessProfileMigrationTitle')).toHaveText(
    'Keep your town safe across devices'
  )
  await expect(page.getByRole('button', {
    name: 'Back up my progress now'
  })).toBeVisible()
  await page.getByRole('button', { name: 'Later' }).click()
  await expect(page.locator('#accountlessProfileMigrationNotice')).toBeHidden()
  await page.reload({ waitUntil: 'domcontentloaded' })
  await expect(page.locator('#accountlessProfileMigrationNotice')).toBeHidden()

  await page.evaluate(({ dayMs, storageKey }) => {
    const record = JSON.parse(localStorage.getItem(storageKey))
    record.finalGateAt = Date.now() + (7 * dayMs)
    record.graceStartedAt = record.finalGateAt - (30 * dayMs)
    record.nextNoticeAt = Date.now() + (20 * dayMs)
    localStorage.setItem(storageKey, JSON.stringify(record))
  }, { dayMs: DAY_MS, storageKey: MIGRATION_STORAGE_KEY })
  await page.reload({ waitUntil: 'domcontentloaded' })

  await expect(page.locator('#accountlessProfileMigrationTitle')).toHaveText(
    'Sign-in required in 7 days'
  )
  await expect(page.getByRole('button', { name: 'Later' })).toBeHidden()
  await expect(page.locator('html')).toHaveAttribute(
    'data-accountless-profile-migration-urgency',
    '1'
  )
  await expect(page.locator('#accountlessProfileMigrationNotice'))
    .toHaveAttribute('role', 'region')
  await expect(page.locator('#accountlessProfileMigrationNotice'))
    .toHaveAttribute('aria-modal', 'false')
  await page.getByRole('button', { name: 'Switch to dark mode' }).click()
  await expect(page.locator('body')).toHaveAttribute('data-theme', 'dark')
})

test('an inherited session attaches the untouched town only after explicit confirmation and verified cloud acceptance', async ({
  page
}, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-standard')
  let enabled = false
  let migrationCalls = 0
  let acceptedEnvelope = null
  let acceptedRevision = 1
  await installRuntimeRoute(page, () => enabled)
  await page.route('https://accountless-profile-test.supabase.co/**', route => {
    const pathname = new URL(route.request().url()).pathname
    if (pathname.endsWith('/rpc/migrate_my_accountless_profile')) {
      migrationCalls += 1
      acceptedEnvelope = route.request().postDataJSON().p_envelope
      return fulfillMigration(route)
    }
    if (pathname.endsWith('/rpc/commit_my_learner_profile')) {
      const operation = route.request().postDataJSON()
      acceptedEnvelope = operation.p_envelope
      acceptedRevision = operation.p_base_revision + 1
      return route.fulfill({
        json: [{
          base_revision: operation.p_base_revision,
          generation: operation.p_generation,
          payload_sha256: operation.p_envelope.integrity.payloadSha256,
          profile_id: operation.p_profile_id,
          revision: acceptedRevision,
          status: 'accepted'
        }],
        status: 200
      })
    }
    if (pathname.endsWith('/rpc/resolve_my_learner_profile')) {
      return route.fulfill({
        json: [{
          created: false,
          envelope: acceptedEnvelope,
          generation: 1,
          profile_id: PROFILE_ID,
          revision: acceptedRevision,
          status: 'profile_ready'
        }],
        status: 200
      })
    }
    return route.fulfill({ json: {}, status: 200 })
  })

  await page.goto('/?internal_test=1')
  const originalState = await seedAccountlessProfile(page, { withSession: true })
  enabled = true
  await page.reload({ waitUntil: 'domcontentloaded' })

  await expect(page.locator('#mainApp')).toBeVisible()
  await page.getByRole('button', { name: 'Back up my progress now' }).click()
  await expect(page.locator('#accountlessProfileMigrationTitle')).toHaveText(
    'Continue as accountless-owner@example.com?'
  )
  expect(migrationCalls).toBe(0)

  await page.getByRole('button', { name: 'Continue as this email' }).click()
  await expect.poll(() => migrationCalls).toBe(1)
  await expect(page.locator('#mainApp')).toBeVisible()
  await expect(page.locator('#accountlessProfileMigrationNotice')).toBeHidden()
  await expect.poll(() => page.evaluate(syncKey => (
    JSON.parse(localStorage.getItem(syncKey))?.pending
  ), PROFILE_SYNC_STORAGE_KEY)).toBeNull()

  const stored = await page.evaluate(({
    accessKey,
    backupKey,
    migrationKey,
    stateKey,
    syncKey
  }) => ({
    access: JSON.parse(localStorage.getItem(accessKey)),
    migration: localStorage.getItem(migrationKey),
    migrationBackup: localStorage.getItem(backupKey),
    state: JSON.parse(localStorage.getItem(stateKey)),
    sync: JSON.parse(localStorage.getItem(syncKey))
  }), {
    accessKey: PROFILE_ACCESS_STORAGE_KEY,
    backupKey: MIGRATION_BACKUP_STORAGE_KEY,
    migrationKey: MIGRATION_STORAGE_KEY,
    stateKey: STATE_STORAGE_KEY,
    syncKey: PROFILE_SYNC_STORAGE_KEY
  })
  expect(JSON.parse(originalState).config.channels).toEqual([
    expect.objectContaining({ name: SECRET_CHANNEL_NAME })
  ])
  expect(stored.state.config.channels).toEqual([
    expect.objectContaining({ name: SECRET_CHANNEL_NAME })
  ])
  expect(stored.access).toMatchObject({
    generation: 1,
    ownerId: OWNER_ID,
    profileId: PROFILE_ID,
    revision: 1
  })
  expect(stored.sync).toMatchObject({
    generation: 1,
    ownerId: OWNER_ID,
    pending: null,
    profileId: PROFILE_ID,
    queued: null,
    version: 1
  })
  expect(stored.sync.acceptedRevision).toBeGreaterThanOrEqual(1)
  expect(stored.migration).toBeNull()
  expect(stored.migrationBackup).toBeNull()
})

test('a failed first backup survives reload and retries the same protected operation', async ({
  page
}, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-standard')
  let enabled = false
  const migrationOperations = []
  const catchUpOperations = []
  await installRuntimeRoute(page, () => enabled)
  await page.route('https://accountless-profile-test.supabase.co/**', route => {
    const pathname = new URL(route.request().url()).pathname
    if (pathname.endsWith('/rpc/commit_my_learner_profile')) {
      const operation = route.request().postDataJSON()
      catchUpOperations.push(operation)
      if (catchUpOperations.length === 1) {
        return route.fulfill({
          json: [{ status: 'temporarily_unavailable' }],
          status: 200
        })
      }
      return route.fulfill({
        json: [{
          base_revision: operation.p_base_revision,
          generation: operation.p_generation,
          payload_sha256: operation.p_envelope.integrity.payloadSha256,
          profile_id: operation.p_profile_id,
          revision: operation.p_base_revision + 1,
          status: 'already_accepted'
        }],
        status: 200
      })
    }
    if (!pathname.endsWith('/rpc/migrate_my_accountless_profile')) {
      return route.fulfill({ json: {}, status: 200 })
    }
    migrationOperations.push(route.request().postDataJSON())
    if (migrationOperations.length === 1) {
      return route.fulfill({
        json: [{ status: 'temporarily_unavailable' }],
        status: 200
      })
    }
    return fulfillMigration(route)
  })

  await page.goto('/?internal_test=1')
  const originalState = await seedAccountlessProfile(page, { withSession: true })
  enabled = true
  await page.reload({ waitUntil: 'domcontentloaded' })
  await page.getByRole('button', { name: 'Back up my progress now' }).click()
  await page.getByRole('button', { name: 'Continue as this email' }).click()

  await expect(page.locator('#accountlessProfileMigrationTitle')).toHaveText(
    'Not backed up yet'
  )
  await expect(page.locator('#mainApp')).toBeVisible()
  const failed = await page.evaluate(({
    accessKey,
    migrationKey,
    stateKey,
    syncKey
  }) => ({
    access: JSON.parse(localStorage.getItem(accessKey)),
    migration: JSON.parse(localStorage.getItem(migrationKey)),
    state: JSON.parse(localStorage.getItem(stateKey)),
    sync: localStorage.getItem(syncKey)
  }), {
    accessKey: PROFILE_ACCESS_STORAGE_KEY,
    migrationKey: MIGRATION_STORAGE_KEY,
    stateKey: STATE_STORAGE_KEY,
    syncKey: PROFILE_SYNC_STORAGE_KEY
  })
  expect(JSON.parse(originalState).config.channels).toEqual([
    expect.objectContaining({ name: SECRET_CHANNEL_NAME })
  ])
  expect(failed.state.config.channels).toEqual([
    expect.objectContaining({ name: SECRET_CHANNEL_NAME })
  ])
  expect(failed.access.ownerId).toBeNull()
  expect(failed.migration.attempt.status).toBe('backup-failed')
  expect(failed.sync).toBeNull()

  await page.evaluate(stateKey => {
    const state = JSON.parse(localStorage.getItem(stateKey))
    state.config.weeklyGoalHours = 13
    localStorage.setItem(stateKey, JSON.stringify(state))
  }, STATE_STORAGE_KEY)

  await page.reload({ waitUntil: 'domcontentloaded' })
  await expect(page.locator('#accountlessProfileMigrationTitle')).toHaveText(
    'Not backed up yet'
  )
  await page.getByRole('button', { name: 'Try backup again' }).click()
  await expect(page.locator('#accountlessProfileMigrationTitle')).toHaveText(
    'Continue as accountless-owner@example.com?'
  )
  expect(migrationOperations.length).toBe(1)
  await page.getByRole('button', { name: 'Continue as this email' }).click()
  await expect.poll(() => migrationOperations.length).toBe(2)
  await expect.poll(() => catchUpOperations.length).toBe(1)
  await expect(page.locator('#accountlessProfileMigrationTitle')).toHaveText(
    'Not backed up yet'
  )
  await expect(page.locator('#accountlessProfileMigrationNotice'))
    .toHaveAttribute('role', 'region')
  expect(await page.evaluate(accessKey => (
    JSON.parse(localStorage.getItem(accessKey))?.ownerId
  ), PROFILE_ACCESS_STORAGE_KEY)).toBeNull()

  await page.reload({ waitUntil: 'domcontentloaded' })
  await page.getByRole('button', { name: 'Try backup again' }).click()
  await expect(page.locator('#accountlessProfileMigrationTitle')).toHaveText(
    'Continue as accountless-owner@example.com?'
  )
  expect(migrationOperations.length).toBe(2)
  await page.getByRole('button', { name: 'Continue as this email' }).click()
  await expect.poll(() => migrationOperations.length).toBe(3)
  await expect.poll(() => catchUpOperations.length).toBe(2)
  await expect(page.locator('#accountlessProfileMigrationNotice')).toBeHidden()
  expect(migrationOperations[1].p_operation_id)
    .toBe(migrationOperations[0].p_operation_id)
  expect(migrationOperations[1].p_envelope)
    .toEqual(migrationOperations[0].p_envelope)
  expect(migrationOperations[2]).toEqual(migrationOperations[1])
  expect(catchUpOperations[1]).toEqual(catchUpOperations[0])
  expect(catchUpOperations[0].p_envelope.profile.config.weeklyGoalHours)
    .toBe(13)
  expect(await page.evaluate(accessKey => (
    JSON.parse(localStorage.getItem(accessKey))?.ownerId
  ), PROFILE_ACCESS_STORAGE_KEY)).toBe(OWNER_ID)
})

test('a restored sign-in still waits for explicit confirmation after reload', async ({
  page
}, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-standard')
  let enabled = false
  let migrationCalls = 0
  await installRuntimeRoute(page, () => enabled)
  await page.route('https://accountless-profile-test.supabase.co/**', route => {
    const pathname = new URL(route.request().url()).pathname
    if (pathname.endsWith('/rpc/migrate_my_accountless_profile')) {
      migrationCalls += 1
    }
    return route.fulfill({ json: {}, status: 200 })
  })

  await page.goto('/?internal_test=1')
  await seedAccountlessProfile(page)
  enabled = true
  await page.reload({ waitUntil: 'domcontentloaded' })
  await page.getByRole('button', { name: 'Back up my progress now' }).click()
  await expect(page.locator('#settingsPanel')).toBeVisible()
  await page.evaluate(({ authStorageKey, session }) => {
    localStorage.setItem(authStorageKey, JSON.stringify(session))
  }, {
    authStorageKey: AUTH_STORAGE_KEY,
    session: restoredSession()
  })

  await page.reload({ waitUntil: 'domcontentloaded' })
  await expect(page.locator('#accountlessProfileMigrationTitle')).toHaveText(
    'Continue as accountless-owner@example.com?'
  )
  expect(migrationCalls).toBe(0)
  expect(await page.evaluate(accessKey => (
    JSON.parse(localStorage.getItem(accessKey))?.ownerId
  ), PROFILE_ACCESS_STORAGE_KEY)).toBeNull()
})

test('failed authentication leaves the accountless town and pending choice intact', async ({
  page
}, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-standard')
  let enabled = false
  await installRuntimeRoute(page, () => enabled)
  await page.route('https://accountless-profile-test.supabase.co/**', route => {
    const pathname = new URL(route.request().url()).pathname
    if (pathname.endsWith('/auth/v1/otp')) {
      return route.fulfill({ json: {}, status: 200 })
    }
    return route.fulfill({ json: {}, status: 200 })
  })

  await page.goto('/?internal_test=1')
  const originalState = await seedAccountlessProfile(page)
  enabled = true
  await page.reload({ waitUntil: 'domcontentloaded' })
  await page.getByRole('button', { name: 'Back up my progress now' }).click()
  await expect(page.locator('#settingsPanel')).toBeVisible()
  await page.locator('#accountEmail').fill('failed@example.com')
  await page.locator('[data-account-action="email-form"]').press('Enter')
  await expect(page.locator('#accountEmailCodeForm')).toBeVisible()
  await page.locator('#accountEmailCode').fill('123')
  await page.locator('#accountEmailCodeForm').press('Enter')
  await expect(page.locator('#accountFeedback')).toBeVisible()

  const stored = await page.evaluate(({
    accessKey,
    migrationKey,
    stateKey
  }) => ({
    access: JSON.parse(localStorage.getItem(accessKey)),
    migration: JSON.parse(localStorage.getItem(migrationKey)),
    state: JSON.parse(localStorage.getItem(stateKey))
  }), {
    accessKey: PROFILE_ACCESS_STORAGE_KEY,
    migrationKey: MIGRATION_STORAGE_KEY,
    stateKey: STATE_STORAGE_KEY
  })
  expect(JSON.parse(originalState).config.channels).toEqual([
    expect.objectContaining({ name: SECRET_CHANNEL_NAME })
  ])
  expect(stored.state.config.channels).toEqual([
    expect.objectContaining({ name: SECRET_CHANNEL_NAME })
  ])
  expect(stored.access.ownerId).toBeNull()
  expect(stored.migration.attempt.status).toBe('awaiting-authentication')
})
