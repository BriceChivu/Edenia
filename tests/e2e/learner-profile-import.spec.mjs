import { expect, test } from '../support/network-fixture.mjs'
import {
  LEARNER_PROFILE_RESOLUTION_STATUSES
} from '../../src/domain/learner-profile-resolution.js'
import {
  createPortableLearnerProfileEnvelope,
  LEARNER_PROFILE_CLOUD_ENVELOPE_MAX_BYTES
} from '../../src/state/portable-learner-profile.js'

const SUPABASE_ORIGIN = 'https://profile-import-test.supabase.co'
const USER_ID = '123e4567-e89b-42d3-a456-426614174000'
const OTHER_USER_ID = '923e4567-e89b-42d3-a456-426614174009'
const PROFILE_ID = '223e4567-e89b-42d3-a456-426614174001'
const STATE_KEY = 'edenia_v1_internal_test'
const ACCESS_KEY = 'edenia_v1_internal_test_learner_profile_access_v1'
const SYNC_KEY = 'edenia_v1_internal_test_learner_profile_sync_v1'
const IMPORT_KEY = `${SYNC_KEY}_import_v1`
const AUTH_KEY = 'edenia_v1_internal_test_plus_auth_v1'
const ACCOUNT_RETURN_ORIGIN = 'http://localhost:8000'
const SERVED_ORIGIN = `http://localhost:${Number(
  process.env.EDENIA_TEST_NORMAL_PORT || 8000
)}`
const PROTECTED_UNTIL = '2099-10-01T00:00:00.000Z'

function accessToken() {
  const encode = value => Buffer.from(JSON.stringify(value)).toString('base64url')
  return `${encode({ alg: 'HS256', typ: 'JWT' })}.${encode({
    aud: 'authenticated',
    exp: 1893456000,
    role: 'authenticated',
    sub: USER_ID
  })}.test-signature`
}

function authenticatedSession() {
  return {
    access_token: accessToken(),
    expires_at: 1893456000,
    expires_in: 31536000,
    refresh_token: 'profile-import-refresh-token',
    token_type: 'bearer',
    user: {
      app_metadata: { provider: 'email', providers: ['email'] },
      aud: 'authenticated',
      created_at: '2026-08-20T00:00:00.000Z',
      email: 'profile-import@example.test',
      id: USER_ID,
      identities: [],
      role: 'authenticated',
      user_metadata: {}
    }
  }
}

function runtimeConfig() {
  return `window.EDENIA_CONFIG = ${JSON.stringify({
    accountFeaturesRollout: 'internal',
    freePlusEnabled: false,
    googleSignInMode: 'off',
    indexedDbBackupCleanupEnabled: false,
    indexedDbBackupsEnabled: false,
    learnerProfileLifecycleEnabled: true,
    plusCheckoutEnabled: false,
    studyGuidanceEnabled: false,
    supabasePublishableKey: 'test-publishable-key',
    supabaseUrl: SUPABASE_ORIGIN,
    youtubeApiKey: ''
  })}`
}

async function useAccountReturnOrigin(page) {
  if (SERVED_ORIGIN === ACCOUNT_RETURN_ORIGIN) return
  await page.route(`${ACCOUNT_RETURN_ORIGIN}/**`, async route => {
    const requested = new URL(route.request().url())
    const served = new URL(
      `${requested.pathname}${requested.search}`,
      `${SERVED_ORIGIN}/`
    )
    const response = await route.fetch({ url: served.href })
    await route.fulfill({ response })
  })
}

async function createProfileEnvelope({
  activityLog = [],
  language,
  locale,
  marker,
  sourceOwnerId,
  updatedAt
}) {
  const { envelope } = await createPortableLearnerProfileEnvelope({
    activityLog,
    analytics: { distinctId: `analytics-${sourceOwnerId}` },
    anki: {},
    authSession: { accessToken: `secret-${sourceOwnerId}` },
    cityProgress: { maxLevelIndex: locale === 'en' ? 1 : 5 },
    config: {
      ankiEnabled: true,
      channelShelfOrder: [],
      channelVideoFormats: {},
      channels: [],
      includeShorts: true,
      locale,
      removedChannelIds: [],
      removedDefaultChannelIds: [],
      weeklyGoalHours: 4
    },
    credentials: { password: `password-${sourceOwnerId}` },
    learnerProfile: {
      createdAt: '2026-08-20T00:00:00.000Z',
      languages: [language],
      level: 'beginner',
      marker,
      ownerId: sourceOwnerId,
      selectedChannelCatalogIds: [],
      updatedAt
    },
    noAnkiFrequentUserPrompt: {
      respondedAt: null,
      response: null
    },
    onboarding: {
      introSeenAt: '2026-08-20T00:00:00.000Z',
      levelUpGuidanceShownAt: null,
      recommendationsAppliedAt: null,
      setupCompleted: true,
      setupCompletedAt: '2026-08-20T00:00:00.000Z',
      walkthroughCompleted: true,
      walkthroughCompletedAt: '2026-08-20T00:00:00.000Z'
    },
    ownerId: sourceOwnerId,
    videos: {}
  }, { now: () => new Date(updatedAt) })
  return envelope
}

async function prepareImportPage(page, {
  interruptImport = false,
  staleImport = false,
  sourceOwnerId = USER_ID
} = {}) {
  const previousEnvelope = await createProfileEnvelope({
    language: 'french',
    locale: 'en',
    marker: 'current-owner-profile',
    sourceOwnerId: USER_ID,
    updatedAt: '2026-08-21T09:15:00.000Z'
  })
  const importedEnvelope = await createProfileEnvelope({
    activityLog: Array.from({ length: 500 }, (_, index) => ({
      actor: 'user',
      createdAt: new Date(Date.UTC(2026, 7, 22, 0, 0, index)).toISOString(),
      detail: `source-entry-${index}`,
      id: `source-entry-${index}`,
      status: 'info',
      title: `Source entry ${index}`,
      type: 'study'
    })),
    language: 'japanese',
    locale: 'fr',
    marker: 'portable-import',
    sourceOwnerId,
    updatedAt: '2026-08-22T02:15:00.000Z'
  })
  const importRequests = []
  const rollbackRequests = []
  let currentEnvelope = previousEnvelope
  let currentRevision = 4
  let protectedEnvelope = previousEnvelope
  let recoveryEnabled = !interruptImport

  await page.addInitScript(({
    accessKey,
    authKey,
    authenticated,
    profileId,
    stateKey,
    syncKey,
    previous
  }) => {
    const seededKey = `${stateKey}_profile_import_seeded`
    if (sessionStorage.getItem(seededKey) !== '1') {
      localStorage.setItem(authKey, JSON.stringify(authenticated))
      localStorage.setItem(stateKey, JSON.stringify(previous.profile))
      localStorage.setItem(accessKey, JSON.stringify({
        activatedAt: Date.parse(previous.exportedAt),
        activationId: null,
        generation: 2,
        onboardingFinalizationPending: false,
        ownerId: authenticated.user.id,
        profileId,
        revision: 4,
        version: 1
      }))
      localStorage.setItem(syncKey, JSON.stringify({
        acceptedRevision: 4,
        generation: 2,
        ownerId: authenticated.user.id,
        pending: null,
        profileId,
        queued: null,
        version: 1
      }))
      sessionStorage.setItem(seededKey, '1')
    }
    window.__failNextImportedProfileWrite = false
    const originalSetItem = Storage.prototype.setItem
    Storage.prototype.setItem = function (key, value) {
      if (key === stateKey && window.__failNextImportedProfileWrite) {
        window.__failNextImportedProfileWrite = false
        throw new DOMException('Forced profile write failure', 'QuotaExceededError')
      }
      return originalSetItem.call(this, key, value)
    }
  }, {
    accessKey: ACCESS_KEY,
    authKey: AUTH_KEY,
    authenticated: authenticatedSession(),
    previous: previousEnvelope,
    profileId: PROFILE_ID,
    stateKey: STATE_KEY,
    syncKey: SYNC_KEY
  })

  await useAccountReturnOrigin(page)
  await page.route('**/config.local.js', route => route.fulfill({
    body: runtimeConfig(),
    contentType: 'text/javascript',
    status: 200
  }))
  await page.route(`${SUPABASE_ORIGIN}/**`, async route => {
    const request = route.request()
    const pathname = new URL(request.url()).pathname
    if (pathname === '/auth/v1/token') {
      await route.fulfill({ json: authenticatedSession(), status: 200 })
      return
    }
    if (pathname === '/rest/v1/rpc/resolve_my_learner_profile') {
      await route.fulfill({
        json: [{
          created: false,
          envelope: currentEnvelope,
          generation: 2,
          profile_id: PROFILE_ID,
          revision: currentRevision,
          status: LEARNER_PROFILE_RESOLUTION_STATUSES.PROFILE_READY
        }],
        status: 200
      })
      return
    }
    if (pathname === '/rest/v1/rpc/commit_my_learner_profile') {
      const body = request.postDataJSON()
      currentEnvelope = body.p_envelope
      currentRevision = body.p_base_revision + 1
      await route.fulfill({
        json: [{
          base_revision: body.p_base_revision,
          generation: body.p_generation,
          payload_sha256: body.p_envelope.integrity.payloadSha256,
          profile_id: PROFILE_ID,
          revision: currentRevision,
          status: 'accepted'
        }],
        status: 200
      })
      return
    }
    if (pathname === '/rest/v1/rpc/import_my_learner_profile') {
      const body = request.postDataJSON()
      importRequests.push(body)
      if (staleImport) {
        await route.fulfill({
          json: [{
            base_revision: body.p_base_revision,
            generation: 2,
            payload_sha256: currentEnvelope.integrity.payloadSha256,
            profile_id: PROFILE_ID,
            protected_until: null,
            revision: body.p_base_revision + 1,
            status: 'stale_revision'
          }],
          status: 200
        })
        return
      }
      protectedEnvelope = currentEnvelope
      currentEnvelope = body.p_envelope
      currentRevision = body.p_base_revision + 1
      if (!recoveryEnabled) {
        await route.fulfill({ json: [], status: 200 })
        return
      }
      await route.fulfill({
        json: [{
          base_revision: body.p_base_revision,
          generation: 2,
          payload_sha256: body.p_envelope.integrity.payloadSha256,
          profile_id: PROFILE_ID,
          protected_until: PROTECTED_UNTIL,
          revision: currentRevision,
          status: 'replaced'
        }],
        status: 200
      })
      return
    }
    if (pathname === '/rest/v1/rpc/read_my_learner_profile_import_backup') {
      if (!recoveryEnabled) {
        await route.fulfill({ json: [], status: 200 })
        return
      }
      const imported = importRequests.at(-1)
      await route.fulfill({
        json: [{
          base_revision: imported.p_base_revision,
          generation: 2,
          imported_envelope: imported.p_envelope,
          imported_revision: imported.p_base_revision + 1,
          operation_id: imported.p_operation_id,
          previous_envelope: protectedEnvelope,
          profile_id: PROFILE_ID,
          protected_until: PROTECTED_UNTIL,
          status: 'protected'
        }],
        status: 200
      })
      return
    }
    if (pathname === '/rest/v1/rpc/rollback_my_learner_profile_import') {
      if (!recoveryEnabled) {
        await route.fulfill({ json: [], status: 200 })
        return
      }
      const body = request.postDataJSON()
      rollbackRequests.push(body)
      const imported = importRequests.at(-1)
      currentEnvelope = protectedEnvelope
      currentRevision = imported.p_base_revision + 2
      await route.fulfill({
        json: [{
          base_revision: imported.p_base_revision,
          generation: 2,
          profile_id: PROFILE_ID,
          revision: currentRevision,
          status: 'rolled_back'
        }],
        status: 200
      })
      return
    }
    await route.fulfill({ json: {}, status: 200 })
  })
  await page.goto(`${ACCOUNT_RETURN_ORIGIN}/?internal_test=1`)
  await expect(page.locator('html')).toHaveAttribute(
    'data-learner-profile-access-state',
    'active'
  )
  await expect(page.locator('#mainApp')).toBeVisible()
  await expect(page.locator('#learnerProfileSyncStatus')).toHaveText(
    'Up to date'
  )
  const beforeImport = await page.evaluate(({ stateKey, syncKey }) => ({
    state: JSON.parse(localStorage.getItem(stateKey)),
    sync: JSON.parse(localStorage.getItem(syncKey))
  }), { stateKey: STATE_KEY, syncKey: SYNC_KEY })
  return {
    enableRecovery() {
      recoveryEnabled = true
    },
    getCloudEnvelope: () => structuredClone(currentEnvelope),
    importedEnvelope,
    importRequests,
    previousStoredState: beforeImport.state,
    previousSync: beforeImport.sync,
    rollbackRequests
  }
}

async function selectImportFile(page, envelope, name) {
  await page.locator('#syncFileInput').setInputFiles({
    buffer: Buffer.from(JSON.stringify(envelope)),
    mimeType: 'application/json',
    name
  })
}

test('confirmed same- and cross-account imports replace only after protection', async ({
  page
}, testInfo) => {
  test.skip(!['desktop-standard', 'phone-small'].includes(testInfo.project.name))
  const crossAccount = testInfo.project.name === 'phone-small'
  const sourceOwnerId = crossAccount ? OTHER_USER_ID : USER_ID
  const {
    importedEnvelope,
    importRequests,
    rollbackRequests
  } = await prepareImportPage(page, { sourceOwnerId })

  expect(JSON.stringify(importedEnvelope)).not.toContain(sourceOwnerId)
  expect(JSON.stringify(importedEnvelope)).not.toContain('secret-')
  expect(JSON.stringify(importedEnvelope)).not.toContain('password-')

  await page.locator('[data-settings-shell-action="open"]').click()
  await selectImportFile(
    page,
    importedEnvelope,
    crossAccount ? 'another-account.json' : 'this-account.json'
  )

  const warning = page.getByRole('alertdialog')
  await expect(warning).toBeVisible()
  await expect(warning).toContainText('does not merge progress automatically')
  await expect(warning).toContainText(
    crossAccount ? 'another-account.json' : 'this-account.json'
  )
  await expect(page.getByRole('button', {
    name: 'Protect current progress and replace'
  })).toBeFocused()
  expect(importRequests).toHaveLength(0)
  const beforeConfirmation = await page.evaluate(stateKey => (
    JSON.parse(localStorage.getItem(stateKey)).config.locale
  ), STATE_KEY)
  expect(beforeConfirmation).toBe('en')

  const geometry = await warning.evaluate(element => {
    const rect = element.getBoundingClientRect()
    return {
      bottom: rect.bottom,
      documentWidth: document.documentElement.scrollWidth,
      left: rect.left,
      right: rect.right,
      top: rect.top,
      viewportHeight: window.innerHeight,
      viewportWidth: document.documentElement.clientWidth
    }
  })
  expect(geometry.documentWidth).toBeLessThanOrEqual(geometry.viewportWidth)
  expect(geometry.left).toBeGreaterThanOrEqual(0)
  expect(geometry.right).toBeLessThanOrEqual(geometry.viewportWidth)
  expect(geometry.top).toBeLessThan(geometry.viewportHeight)

  await page.getByRole('button', { name: 'Cancel', exact: true }).click()
  await expect(warning).toBeHidden()
  await expect(page.locator(
    '[data-settings-sync-action="choose-file"]'
  )).toBeFocused()
  expect(importRequests).toHaveLength(0)

  await selectImportFile(
    page,
    importedEnvelope,
    crossAccount ? 'another-account.json' : 'this-account.json'
  )
  await page.getByRole('button', {
    name: 'Protect current progress and replace'
  }).click()

  await expect.poll(() => importRequests.length).toBe(1)
  expect(rollbackRequests).toHaveLength(0)
  expect(JSON.stringify(importRequests[0].p_envelope)).not.toContain(
    sourceOwnerId
  )
  await expect(page.locator('html')).toHaveAttribute('lang', 'fr')
  const stored = await page.evaluate(({ stateKey, syncKey }) => ({
    state: JSON.parse(localStorage.getItem(stateKey)),
    sync: JSON.parse(localStorage.getItem(syncKey))
  }), { stateKey: STATE_KEY, syncKey: SYNC_KEY })
  expect(stored.state.config.locale).toBe('fr')
  expect(stored.state.learnerProfile.languages).toEqual(['japanese'])
  expect(stored.state.activityLog).toHaveLength(500)
  expect(new Set(stored.state.activityLog.map(entry => entry.id))).toEqual(
    new Set(importedEnvelope.profile.activityLog.map(entry => entry.id))
  )
  expect(stored.sync).toMatchObject({
    generation: 2,
    ownerId: USER_ID,
    pending: null,
    profileId: PROFILE_ID,
    queued: null
  })
  expect(stored.sync.acceptedRevision).toBeGreaterThanOrEqual(6)

  await page.reload()
  await expect(page.locator('html')).toHaveAttribute(
    'data-learner-profile-access-state',
    'active'
  )
  await expect(page.locator('html')).toHaveAttribute('lang', 'fr')
  const reloaded = await page.evaluate(stateKey => (
    JSON.parse(localStorage.getItem(stateKey))
  ), STATE_KEY)
  expect(reloaded.learnerProfile.languages).toEqual(['japanese'])
})

test('a stale cloud head leaves the current local profile untouched', async ({
  page
}, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-standard')
  const {
    importedEnvelope,
    importRequests,
    previousStoredState,
    previousSync,
    rollbackRequests
  } = await prepareImportPage(page, { staleImport: true })

  await page.locator('[data-settings-shell-action="open"]').click()
  await selectImportFile(page, importedEnvelope, 'stale-import.json')
  await page.getByRole('button', {
    name: 'Protect current progress and replace'
  }).click()

  await expect.poll(() => importRequests.length).toBe(1)
  await expect(page.locator('#toast')).toContainText(
    'Your cloud progress changed before import'
  )
  expect(rollbackRequests).toHaveLength(0)
  const stored = await page.evaluate(({ stateKey, syncKey }) => ({
    state: JSON.parse(localStorage.getItem(stateKey)),
    sync: JSON.parse(localStorage.getItem(syncKey))
  }), { stateKey: STATE_KEY, syncKey: SYNC_KEY })
  expect(stored.state).toEqual(previousStoredState)
  expect(stored.sync.acceptedRevision).toBe(previousSync.acceptedRevision)
})

test('a local persistence failure rolls the protected cloud import back', async ({
  page
}, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-standard')
  const {
    importedEnvelope,
    importRequests,
    previousStoredState,
    previousSync,
    rollbackRequests
  } = await prepareImportPage(page)

  await page.locator('[data-settings-shell-action="open"]').click()
  await selectImportFile(page, importedEnvelope, 'write-failure.json')
  await page.evaluate(() => {
    window.__failNextImportedProfileWrite = true
  })
  await page.getByRole('button', {
    name: 'Protect current progress and replace'
  }).click()

  await expect.poll(() => rollbackRequests.length).toBe(1)
  expect(importRequests).toHaveLength(1)
  await expect(page.locator('#toast')).toContainText(
    'Edenia restored your current progress'
  )
  await expect(page.locator('html')).toHaveAttribute(
    'data-learner-profile-access-state',
    'active'
  )
  const stored = await page.evaluate(({ stateKey, syncKey }) => ({
    state: JSON.parse(localStorage.getItem(stateKey)),
    sync: JSON.parse(localStorage.getItem(syncKey))
  }), { stateKey: STATE_KEY, syncKey: SYNC_KEY })
  expect(stored.state).toEqual(previousStoredState)
  expect(stored.sync.acceptedRevision).toBe(
    previousSync.acceptedRevision + 2
  )
})

test('reload rolls back a cloud import whose response was lost', async ({
  page
}, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-standard')
  const {
    enableRecovery,
    getCloudEnvelope,
    importedEnvelope,
    importRequests,
    previousStoredState,
    previousSync,
    rollbackRequests
  } = await prepareImportPage(page, { interruptImport: true })

  await page.locator('[data-settings-shell-action="open"]').click()
  await selectImportFile(page, importedEnvelope, 'interrupted-import.json')
  await page.getByRole('button', {
    name: 'Protect current progress and replace'
  }).click()

  await expect.poll(() => importRequests.length).toBe(1)
  await expect.poll(async () => page.evaluate(importKey => (
    localStorage.getItem(importKey) !== null
  ), IMPORT_KEY)).toBe(true)
  await expect(page.locator('#toast')).toContainText(
    'Could not import that sync file'
  )
  enableRecovery()
  await page.reload()

  await expect.poll(() => rollbackRequests.length).toBe(1)
  await expect(page.locator('html')).toHaveAttribute(
    'data-learner-profile-access-state',
    'active'
  )
  await expect(page.locator('html')).toHaveAttribute('lang', 'en')
  const stored = await page.evaluate(({ importKey, stateKey, syncKey }) => ({
    pendingImport: localStorage.getItem(importKey),
    state: JSON.parse(localStorage.getItem(stateKey)),
    sync: JSON.parse(localStorage.getItem(syncKey))
  }), { importKey: IMPORT_KEY, stateKey: STATE_KEY, syncKey: SYNC_KEY })
  expect(stored.pendingImport).toBeNull()
  expect(stored.state.config.locale).toBe(previousStoredState.config.locale)
  expect(stored.state.cityProgress).toEqual(previousStoredState.cityProgress)
  expect(stored.state.learnerProfile).toEqual(
    previousStoredState.learnerProfile
  )
  expect(getCloudEnvelope().profile.config.locale).toBe('en')
  expect(getCloudEnvelope().profile.learnerProfile.languages).toEqual([
    'french'
  ])
  expect(stored.sync.acceptedRevision).toBeGreaterThanOrEqual(
    previousSync.acceptedRevision
  )
})

test('invalid and cloud-oversized imports are rejected before confirmation', async ({
  page
}, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-standard')
  const {
    importedEnvelope,
    importRequests,
    previousStoredState
  } = await prepareImportPage(page)
  await page.locator('[data-settings-shell-action="open"]').click()

  const tampered = structuredClone(importedEnvelope)
  tampered.profile.config.locale = 'es'
  await selectImportFile(page, tampered, 'tampered.json')
  await expect(page.locator('#toast')).toHaveText(
    'That sync file is not valid'
  )
  await expect(page.getByRole('alertdialog')).toBeHidden()

  const oversized = JSON.stringify({
    ...importedEnvelope,
    padding: 'x'.repeat(LEARNER_PROFILE_CLOUD_ENVELOPE_MAX_BYTES)
  })
  await page.locator('#syncFileInput').setInputFiles({
    buffer: Buffer.from(oversized),
    mimeType: 'application/json',
    name: 'oversized.json'
  })
  await expect(page.locator('#toast')).toHaveText(
    'That sync file is not valid'
  )
  await expect(page.getByRole('alertdialog')).toBeHidden()
  expect(importRequests).toHaveLength(0)
  const stored = await page.evaluate(stateKey => (
    JSON.parse(localStorage.getItem(stateKey))
  ), STATE_KEY)
  expect(stored).toEqual(previousStoredState)
})
