import { readFile } from 'node:fs/promises'
import { expect, test } from '../support/network-fixture.mjs'
import {
  LEARNER_PROFILE_RESOLUTION_STATUSES
} from '../../src/domain/learner-profile-resolution.js'
import {
  createPortableLearnerProfileEnvelope,
  preparePortableLearnerProfileEnvelope,
  verifyPortableLearnerProfileEnvelope
} from '../../src/state/portable-learner-profile.js'

const SUPABASE_ORIGIN = 'https://profile-conflict-test.supabase.co'
const USER_ID = '123e4567-e89b-42d3-a456-426614174000'
const PROFILE_ID = '223e4567-e89b-42d3-a456-426614174001'
const CONFLICT_ID = '323e4567-e89b-42d3-a456-426614174002'
const OPERATION_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const STATE_KEY = 'edenia_v1'
const ACCESS_KEY = 'edenia_v1_learner_profile_access_v1'
const SYNC_KEY = 'edenia_v1_learner_profile_sync_v1'
const AUTH_KEY = 'edenia_v1_plus_auth_v1'
const ACCOUNT_RETURN_ORIGIN = 'http://localhost:8000'
const SERVED_ORIGIN = `http://localhost:${Number(
  process.env.EDENIA_TEST_NORMAL_PORT || 8000
)}`
const PROTECTED_UNTIL = '2026-10-01T00:00:00.000Z'

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
    refresh_token: 'conflict-refresh-token',
    token_type: 'bearer',
    user: {
      app_metadata: { provider: 'email', providers: ['email'] },
      aud: 'authenticated',
      created_at: '2026-08-20T00:00:00.000Z',
      email: 'conflict@example.test',
      id: USER_ID,
      identities: [],
      role: 'authenticated',
      user_metadata: {}
    }
  }
}

function runtimeConfig(trial = false) {
  return `window.EDENIA_CONFIG = ${JSON.stringify({
    accountFeaturesRollout: 'public',
    authTrialEnabled: trial,
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
      `${requested.pathname.slice(1)}${requested.search}`,
      `${SERVED_ORIGIN}${process.env.EDENIA_TEST_BASE_PATH || '/'}`
    )
    const response = await route.fetch({ url: served.href })
    await route.fulfill({ response })
  })
}

async function createConflictEnvelope({
  channelId,
  channelName,
  language,
  level,
  island = null,
  currentXp = false,
  locale,
  maxLevelIndex,
  reviewed,
  selectedChannelCatalogIds = [channelId],
  setupCompleted = true,
  updatedAt
}) {
  const { envelope } = await createPortableLearnerProfileEnvelope({
    activityLog: [{
      actor: 'user',
      createdAt: updatedAt,
      detail: channelName,
      id: `${channelId}-activity`,
      status: 'success',
      title: `Studied with ${channelName}`,
      type: 'study'
    }],
    anki: {
      '2026-08-21': {
        created: Math.floor(reviewed / 4),
        observedAt: updatedAt,
        reviewed,
        ...(currentXp ? { experienceReviews: reviewed } : {})
      }
    },
    cityProgress: { maxLevelIndex },
    config: {
      ankiEnabled: true,
      channelShelfOrder: [channelId],
      channelVideoFormats: {},
      channels: [{
        catalogId: null,
        id: channelId,
        imageUrl: '',
        name: channelName
      }],
      includeShorts: true,
      locale,
      removedChannelIds: [],
      removedDefaultChannelIds: [],
      weeklyGoalHours: 4
    },
    learnerProfile: {
      createdAt: '2026-08-20T00:00:00.000Z',
      languages: [language],
      level,
      selectedChannelCatalogIds,
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
      setupCompleted,
      setupCompletedAt: setupCompleted
        ? '2026-08-20T00:00:00.000Z'
        : null,
      walkthroughCompleted: setupCompleted,
      walkthroughCompletedAt: setupCompleted
        ? '2026-08-20T00:00:00.000Z'
        : null
    },
    videos: {},
    ...(island ? { tinySwordsIsland: island } : {})
  }, { now: () => new Date(updatedAt) })
  return envelope
}

async function prepareConflictPage(page, {
  acceptPostChoiceCommits = false,
  cloudSetupCompleted = true,
  failChoice = false,
  identicalProfiles = false,
  preserveStateOnReload = false,
  trial = false,
  expiredChoice = false,
  queuedLatest = false,
  previousExpired = true,
  previousResolved = false,
  withIslands = false
} = {}) {
  // Keep the mocked protected-copy deadline valid regardless of the CI date.
  await page.clock.setFixedTime(new Date('2026-08-25T12:00:00.000Z'))
  const island = withIslands ? JSON.parse(await readFile('tests/fixtures/tiny-swords-populated-island.json', 'utf8')) : null
  const cloudIsland = structuredClone(island)
  if (cloudIsland) cloudIsland.decorations = []
  const deviceEnvelope = await createConflictEnvelope({
    currentXp: trial,
    island,
    channelId: 'device-channel',
    channelName: 'Device channel',
    language: 'spanish',
    level: 'intermediate',
    locale: 'es',
    maxLevelIndex: 4,
    reviewed: 24,
    updatedAt: '2026-08-21T09:15:00.000Z'
  })
  const cloudEnvelope = identicalProfiles ? structuredClone(deviceEnvelope) : await createConflictEnvelope({
    currentXp: trial,
    island: cloudIsland,
    channelId: 'cloud-channel',
    channelName: 'Cloud channel',
    language: 'french',
    level: 'beginner',
    locale: 'fr',
    maxLevelIndex: 2,
    reviewed: 8,
    selectedChannelCatalogIds: cloudSetupCompleted
      ? ['cloud-channel']
      : [
          'french-nlf',
          'french-alexa',
          'french-piece',
          'french-elisabeth',
          'french-facile'
        ],
    setupCompleted: cloudSetupCompleted,
    updatedAt: '2026-08-21T10:15:00.000Z'
  })
  const choiceRequests = []
  const commitRequests = []
  const resolutionRequests = []
  const acceptedCommitOperations = new Map()
  let failedResolvedRead = false
  let resolvedEnvelope = cloudEnvelope
  let resolvedRevision = 14
  let selectedSide = null
  let activeConflictId = CONFLICT_ID
  let activeOperationId = OPERATION_ID
  const freshConflictId = '423e4567-e89b-42d3-a456-426614174003'
  const storageKey = trial ? 'edenia_v1_auth_trial_v1' : STATE_KEY
  const pendingEnvelope = queuedLatest
    ? (await createPortableLearnerProfileEnvelope({ ...deviceEnvelope.profile,
        anki: { '2026-08-21': { created: 0, reviewed: 1, observedAt: deviceEnvelope.exportedAt } }
      }, { now: () => new Date(deviceEnvelope.exportedAt) })).envelope
    : deviceEnvelope

  await page.addInitScript(({
    accessKey,
    authKey,
    authenticated,
    device,
    pending,
    preserveReloadState,
    queuedLatest,
    stateKey,
    syncKey
  }) => {
    if (preserveReloadState && localStorage.getItem(stateKey) !== null) return
    localStorage.setItem(authKey, JSON.stringify(authenticated))
    localStorage.setItem(stateKey, JSON.stringify(device.profile))
    localStorage.setItem(accessKey, JSON.stringify({
      activatedAt: Date.parse(device.exportedAt),
      activationId: null,
      generation: 4,
      onboardingFinalizationPending: false,
      ownerId: authenticated.user.id,
      profileId: '223e4567-e89b-42d3-a456-426614174001',
      revision: 12,
      version: 1
    }))
    localStorage.setItem(syncKey, JSON.stringify({
      acceptedRevision: 12,
      generation: 4,
      ownerId: authenticated.user.id,
      pending: {
        activationId: 'activation-before-conflict',
        baseRevision: 12,
        envelope: null,
        generation: 4,
        integrity: pending.integrity,
        nextRetryAt: 0,
        operationId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        ownerId: authenticated.user.id,
        prepared: pending,
        profileId: '223e4567-e89b-42d3-a456-426614174001',
        retryCount: 0,
        revision: 13
      },
      profileId: '223e4567-e89b-42d3-a456-426614174001',
      queued: queuedLatest ? {
        activationId: 'activation-after-lost-request', baseRevision: 13,
        envelope: null, generation: 4, integrity: device.integrity,
        nextRetryAt: 0, operationId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
        ownerId: authenticated.user.id, prepared: device,
        profileId: '223e4567-e89b-42d3-a456-426614174001', retryCount: 0, revision: 14
      } : null,
      version: 1
    }))
  }, {
    accessKey: trial ? `${storageKey}_learner_profile_access_v1` : ACCESS_KEY,
    authKey: trial ? `${storageKey}_plus_auth_v1` : AUTH_KEY,
    authenticated: authenticatedSession(),
    device: deviceEnvelope,
    pending: pendingEnvelope,
    preserveReloadState: preserveStateOnReload,
    queuedLatest,
    stateKey: storageKey,
    syncKey: trial ? `${storageKey}_learner_profile_sync_v1` : SYNC_KEY
  })

  await useAccountReturnOrigin(page)
  await page.route('**/config.local.js', route => route.fulfill({
    body: runtimeConfig(trial),
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
      resolutionRequests.push(true)
      await route.fulfill({
        json: [{
          created: false,
          envelope: resolvedEnvelope,
          generation: 4,
          profile_id: PROFILE_ID,
          revision: resolvedRevision,
          status: LEARNER_PROFILE_RESOLUTION_STATUSES.PROFILE_READY
        }],
        status: 200
      })
      return
    }
    if (pathname === '/rest/v1/rpc/read_my_latest_learner_profile_reset') {
      await route.fulfill({ json: [{ status: 'none' }], status: 200 })
      return
    }
    if (pathname === '/rest/v1/rpc/commit_my_learner_profile') {
      const body = request.postDataJSON()
      commitRequests.push(body)
      if (expiredChoice && body.p_operation_id !== OPERATION_ID) {
        activeConflictId = freshConflictId
        activeOperationId = body.p_operation_id
      }
      if (selectedSide && acceptPostChoiceCommits) {
        const acceptedOperation = acceptedCommitOperations.get(
          body.p_operation_id
        )
        if (acceptedOperation) {
          await route.fulfill({
            json: [{ ...acceptedOperation, status: 'already_accepted' }],
            status: 200
          })
          return
        }
        resolvedEnvelope = body.p_envelope
        resolvedRevision = body.p_base_revision + 1
        const acceptedOperationReceipt = {
          base_revision: body.p_base_revision,
          generation: body.p_generation,
          payload_sha256: body.p_envelope.integrity.payloadSha256,
          profile_id: body.p_profile_id,
          revision: resolvedRevision
        }
        acceptedCommitOperations.set(
          body.p_operation_id,
          acceptedOperationReceipt
        )
        await route.fulfill({
          json: [{ ...acceptedOperationReceipt, status: 'accepted' }],
          status: 200
        })
        return
      }
      await route.fulfill({
        json: [{
          base_revision: 12,
          conflict_id: activeConflictId,
          generation: 4,
          payload_sha256: cloudEnvelope.integrity.payloadSha256,
          profile_id: PROFILE_ID,
          revision: 14,
          status: 'conflict'
        }],
        status: 200
      })
      return
    }
    if (pathname === '/rest/v1/rpc/read_my_learner_profile_conflict') {
      if (expiredChoice && previousExpired && request.postDataJSON().p_conflict_id === CONFLICT_ID) {
        await route.fulfill({ json: [{ status: 'expired', conflict_id: CONFLICT_ID,
          operation_id: OPERATION_ID, profile_id: PROFILE_ID }], status: 200 })
        return
      }
      if (failChoice && selectedSide && !failedResolvedRead) {
        failedResolvedRead = true
        await route.fulfill({ json: [], status: 200 })
        return
      }
      await route.fulfill({
        json: [{
          cloud_envelope: cloudEnvelope,
          cloud_generation: 4,
          cloud_revision: 14,
          conflict_id: activeConflictId,
          device_envelope: expiredChoice && activeConflictId === CONFLICT_ID
            ? pendingEnvelope : deviceEnvelope,
          device_generation: 4,
          device_revision: 13,
          operation_id: activeOperationId,
          profile_id: PROFILE_ID,
          protected_until: selectedSide || (previousResolved && activeConflictId === CONFLICT_ID) ? PROTECTED_UNTIL : null,
          selected_side: previousResolved && activeConflictId === CONFLICT_ID ? 'cloud' : selectedSide,
          status: selectedSide || (previousResolved && activeConflictId === CONFLICT_ID) ? 'resolved' : 'open'
        }],
        status: 200
      })
      return
    }
    if (pathname === '/rest/v1/rpc/choose_my_learner_profile_conflict') {
      const body = request.postDataJSON()
      choiceRequests.push(body)
      selectedSide = body.p_selected_side
      const selectedEnvelope = selectedSide === 'device'
        ? deviceEnvelope
        : cloudEnvelope
      resolvedEnvelope = selectedEnvelope
      resolvedRevision = 15
      await route.fulfill({
        json: [{
          conflict_id: activeConflictId,
          envelope: selectedEnvelope,
          generation: 4,
          profile_id: PROFILE_ID,
          protected_until: PROTECTED_UNTIL,
          revision: 15,
          selected_side: selectedSide,
          status: 'chosen'
        }],
        status: 200
      })
      return
    }
    await route.fulfill({ json: {}, status: 200 })
  })
  await page.goto(`${ACCOUNT_RETURN_ORIGIN}/${trial ? '?internal_test=1' : ''}`)
  return {
    choiceRequests,
    cloudEnvelope,
    commitRequests,
    deviceEnvelope,
    resolutionRequests
  }
}

test('equal conflict profiles explain the empty comparison', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-standard')
  await prepareConflictPage(page, { identicalProfiles: true })
  await expect(page.locator('#learnerProfileConflictEmpty')).toBeVisible()
  await expect(page.locator('#learnerProfileConflictRows tr')).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Use Cloud', exact: true })).toBeVisible()
  await page.screenshot({ path: testInfo.outputPath('equal-conflict-explanation.png') })
})

test('divergent profiles require confirmed choices at every width', async ({
  page
}, testInfo) => {
  test.skip(![
    'desktop-standard',
    'tablet-portrait',
    'phone-small'
  ].includes(testInfo.project.name))
  const selectedSide = testInfo.project.name === 'desktop-standard'
    ? 'cloud'
    : 'device'
  const unchosenSide = selectedSide === 'device' ? 'cloud' : 'device'
  const protectedToastCopy = selectedSide === 'device'
    ? 'La versión protegida está disponible hasta'
    : 'La version protégée est disponible jusqu’au'
  const viewInSettingsCopy = selectedSide === 'device'
    ? 'Ver en Ajustes'
    : 'Voir dans les paramètres'
  const protectedDownloadStartedCopy = selectedSide === 'device'
    ? 'Se inició la descarga de la versión protegida.'
    : 'Le téléchargement de la version protégée a commencé.'
  const { choiceRequests } = await prepareConflictPage(page)

  const gate = page.locator('#learnerProfileAccessGate')
  await expect(gate).toBeVisible()
  await expect(page.locator('#mainApp')).toBeHidden()
  await expect(page.locator('#learnerProfileConflictTitle'))
    .toBeVisible()
  await expect(page.getByRole('columnheader', { name: 'This device' }))
    .toBeAttached()
  await expect(page.getByRole('columnheader', { name: 'Cloud' })).toBeAttached()
  await expect(page.locator('#learnerProfileConflictTitle')).toHaveText('Your device version differs from the Cloud version. Choose which one to use.')
  await expect(page.locator('#learnerProfileAccessRetry')).toBeHidden()
  await expect(page.getByRole('button', { name: /Combine/i })).toHaveCount(0)
  await expect(page.getByRole('row')).toHaveCount(7)
  const geometry = await gate.evaluate(element => ({
    cardWidth: element.querySelector('.learner-profile-access-card').scrollWidth,
    documentWidth: document.documentElement.scrollWidth,
    viewportWidth: document.documentElement.clientWidth
  }))
  expect(geometry.documentWidth).toBeLessThanOrEqual(geometry.viewportWidth)
  expect(geometry.cardWidth).toBeLessThanOrEqual(geometry.viewportWidth)

  await expect(page.getByRole('button', { name: 'Export both' })).toHaveCount(0)
  const downloads = []
  page.on('download', download => downloads.push(download.suggestedFilename()))

  await page.getByRole('button', {
    name: selectedSide === 'device' ? 'Use This device' : 'Use Cloud'
  }).click()
  expect(choiceRequests).toHaveLength(0)
  await expect(page.locator('#learnerProfileConflictConfirmation')).toBeVisible()
  await page.getByRole('button', { name: 'Confirm this choice' }).click()

  await expect.poll(() => choiceRequests.length).toBe(1)
  expect(choiceRequests[0]).toEqual({
    p_confirmed: true,
    p_conflict_id: CONFLICT_ID,
    p_selected_side: selectedSide
  })
  await expect(page.locator('#mainApp')).toBeVisible()
  await expect(page.locator('#learnerProfileConflictRecovery')).toBeHidden()
  await expect(page.locator('#toast')).toContainText(protectedToastCopy)
  await page.getByRole('button', { name: viewInSettingsCopy }).click()
  await expect(page.locator('#settingsPanel')).toBeVisible()
  await expect(page.locator('#learnerProfileConflictRecovery')).toBeVisible()
  await expect(page.locator('#learnerProfileConflictRecovery')).toBeFocused()
  const settingsGeometry = await page.locator(
    '#learnerProfileConflictRecovery'
  ).evaluate(card => ({
    clientWidth: card.clientWidth,
    documentWidth: document.documentElement.scrollWidth,
    scrollWidth: card.scrollWidth,
    viewportWidth: document.documentElement.clientWidth
  }))
  expect(settingsGeometry.scrollWidth).toBeLessThanOrEqual(
    settingsGeometry.clientWidth
  )
  expect(settingsGeometry.documentWidth).toBeLessThanOrEqual(
    settingsGeometry.viewportWidth
  )
  await expect(page.locator(
    '[data-profile-conflict-action="export-protected"]'
  ))
    .toHaveAttribute('data-conflict-side', unchosenSide)
  const stored = await page.evaluate(({ stateKey, syncKey }) => ({
    state: JSON.parse(localStorage.getItem(stateKey)),
    sync: JSON.parse(localStorage.getItem(syncKey))
  }), { stateKey: STATE_KEY, syncKey: SYNC_KEY })
  expect(stored.state.config.locale).toBe(
    selectedSide === 'device' ? 'es' : 'fr'
  )
  expect(stored.sync).toMatchObject({
    acceptedRevision: 15,
    protectedConflictIds: [CONFLICT_ID]
  })
  expect(stored.sync.pending?.operationId).not.toBe(OPERATION_ID)
  expect(stored.sync.queued?.operationId).not.toBe(OPERATION_ID)

  await page.reload()
  await expect(page.locator('#mainApp')).toBeVisible()
  await expect(page.locator('#learnerProfileConflictRecovery')).toBeHidden()
  await expect(page.getByRole('button', { name: viewInSettingsCopy }))
    .toHaveCount(0)
  await page.locator('.gear-btn[data-settings-shell-action="open"]').click()
  await expect(page.locator('#learnerProfileConflictRecovery')).toBeVisible()
  await page.locator(
    '[data-profile-conflict-action="export-protected"]'
  ).click()
  await expect.poll(() => downloads.length).toBe(1)
  expect(downloads.at(-1)).toContain(unchosenSide === 'device'
    ? 'this-device'
    : 'cloud')
  await expect(page.locator('#toast')).toContainText(
    protectedDownloadStartedCopy
  )
  await page.locator(
    '[data-profile-conflict-action="export-protected"]'
  ).click()
  await expect.poll(() => downloads.length).toBe(2)
  await expect(page.locator('#learnerProfileConflictRecovery')).toBeVisible()
})

test('a protected-backup verification failure activates neither input', async ({
  page
}, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-standard')
  const { choiceRequests, deviceEnvelope } = await prepareConflictPage(page, {
    failChoice: true
  })

  await expect(page.locator('#learnerProfileConflict')).toBeVisible()
  await page.getByRole('button', { name: 'Use This device' }).click()
  await page.getByRole('button', { name: 'Confirm this choice' }).click()

  await expect.poll(() => choiceRequests.length).toBe(1)
  await expect(page.locator('html')).toHaveAttribute(
    'data-learner-profile-access-state',
    'recovering'
  )
  await expect(page.locator('#mainApp')).toBeHidden()
  const stored = await page.evaluate(({ stateKey, syncKey }) => ({
    state: JSON.parse(localStorage.getItem(stateKey)),
    sync: JSON.parse(localStorage.getItem(syncKey))
  }), { stateKey: STATE_KEY, syncKey: SYNC_KEY })
  expect(stored.state).toEqual(deviceEnvelope.profile)
  expect(stored.sync).toMatchObject({
    acceptedRevision: 12,
    pending: { operationId: OPERATION_ID }
  })

  await page.getByRole('button', { name: 'Try again' }).click()
  await expect(page.locator('#mainApp')).toBeVisible()
  await expect(page.locator('#learnerProfileConflictRecovery')).toBeHidden()
  await page.getByRole('button', { name: 'Ver en Ajustes' }).click()
  await expect(page.locator('#learnerProfileConflictRecovery')).toBeVisible()
  await expect.poll(() => choiceRequests.length).toBe(2)
})

test('choosing an unfinished Cloud profile opens onboarding without exposing the town', async ({
  page
}, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-standard')
  let captureProfileSurface = false
  const profileSurfaceSnapshots = []
  await page.exposeFunction('recordProfileSurfaceSnapshot', snapshot => {
    if (captureProfileSurface) profileSurfaceSnapshots.push(snapshot)
  })
  await page.addInitScript(() => {
    let lastSnapshot = ''
    const capture = () => {
      const mainApp = document.getElementById('mainApp')
      const onboardingPanel = document.getElementById('onboardingPanel')
      const snapshot = {
        access: document.documentElement?.dataset
          .learnerProfileAccessState || '',
        mainVisible: mainApp?.classList.contains('hidden') === false,
        onboardingVisible:
          onboardingPanel?.classList.contains('hidden') === false
      }
      const serialized = JSON.stringify(snapshot)
      if (serialized === lastSnapshot) return
      lastSnapshot = serialized
      Promise.resolve(window.recordProfileSurfaceSnapshot?.(snapshot))
        .catch(() => {})
    }
    new MutationObserver(capture).observe(document, {
      attributeFilter: ['class', 'data-learner-profile-access-state'],
      attributes: true,
      childList: true,
      subtree: true
    })
    capture()
  })
  const { choiceRequests, resolutionRequests } = await prepareConflictPage(page, {
    acceptPostChoiceCommits: true,
    cloudSetupCompleted: false,
    preserveStateOnReload: true
  })

  await page.getByRole('button', { name: 'Use Cloud' }).click()
  await expect(page.locator('#learnerProfileConflictConfirmation')).toBeVisible()
  captureProfileSurface = true
  await page.getByRole('button', { name: 'Confirm this choice' }).click()

  await expect.poll(() => choiceRequests.length).toBe(1)
  await expect(page.locator('#onboardingPanel')).toBeVisible()
  await expect.poll(() => profileSurfaceSnapshots.some(
    snapshot => snapshot.onboardingVisible
  )).toBe(true)
  expect(profileSurfaceSnapshots.some(snapshot => (
    snapshot.mainVisible && !snapshot.onboardingVisible
  ))).toBe(false)

  const resolutionCountBeforeFocus = resolutionRequests.length
  await page.evaluate(() => window.dispatchEvent(new Event('focus')))
  await expect.poll(() => resolutionRequests.length).toBeGreaterThan(
    resolutionCountBeforeFocus
  )
  await expect(page.locator('html')).toHaveAttribute(
    'data-learner-profile-access-state',
    'active'
  )
  await expect(page.locator('#onboardingPanel')).toBeVisible()
  await expect(page.locator('#mainApp')).toBeHidden()

  profileSurfaceSnapshots.length = 0
  await page.reload()
  await expect(page.locator('#onboardingPanel')).toBeVisible()
  await expect.poll(() => profileSurfaceSnapshots.some(
    snapshot => snapshot.onboardingVisible
  )).toBe(true)
  expect(profileSurfaceSnapshots.some(snapshot => (
    snapshot.mainVisible && !snapshot.onboardingVisible
  ))).toBe(false)

  await page.locator(
    '[data-personalized-onboarding-action="set-step"]'
    + '[data-personalized-onboarding-step="account"]'
  ).click()
  const finishButton = page.locator(
    '[data-personalized-onboarding-action="finish"]'
  )
  await expect(finishButton).toBeVisible()
  await expect(finishButton).toBeEnabled()
  await finishButton.click()
  await expect(page.locator('#onboardingPanel')).toBeHidden()
  await expect(page.locator('#mainApp')).toBeVisible()
})

test('reloading an unchanged unfinished Cloud profile creates no cloud revision', async ({
  page
}, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-standard')
  const { commitRequests } = await prepareConflictPage(page, {
    acceptPostChoiceCommits: true,
    cloudSetupCompleted: false,
    preserveStateOnReload: true
  })

  await page.getByRole('button', { name: 'Use Cloud' }).click()
  await page.getByRole('button', { name: 'Confirm this choice' }).click()
  await expect(page.locator('#onboardingPanel')).toBeVisible()
  await expect(page.locator('#learnerProfileSyncStatus')).toHaveAttribute(
    'data-sync-status',
    'up-to-date'
  )
  commitRequests.length = 0

  await page.reload()

  await expect(page.locator('html')).toHaveAttribute(
    'data-learner-profile-access-state',
    'active'
  )
  await expect(page.locator('#onboardingPanel')).toBeVisible()
  await expect(page.locator('#learnerProfileSyncStatus')).toHaveAttribute(
    'data-sync-status',
    'up-to-date'
  )
  expect(commitRequests).toHaveLength(0)
})

for (const { queuedLatest, previousExpired, previousResolved = false } of [
  { queuedLatest: false, previousExpired: true },
  { queuedLatest: true, previousExpired: true },
  { queuedLatest: true, previousExpired: false },
  { queuedLatest: true, previousExpired: false, previousResolved: true }
]) {
test(`trial reopens a lost-choice acknowledgment as a fresh comparison (queued ${queuedLatest}, expired ${previousExpired}, resolved ${previousResolved})`, async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-standard')
  const { commitRequests, choiceRequests, deviceEnvelope } = await prepareConflictPage(page, {
    trial: true, expiredChoice: true, queuedLatest, previousExpired, previousResolved
  })
  await expect(page.locator('#learnerProfileConflictTitle')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Export both', exact: true })).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Use Cloud', exact: true })).toBeVisible()
  await expect(page.locator('#mainApp')).toBeHidden()
  expect(choiceRequests).toEqual([])
  expect(commitRequests).toHaveLength(2)
  expect(commitRequests[1].p_operation_id).not.toBe(OPERATION_ID)
  expect(commitRequests[1].p_envelope).toEqual(deviceEnvelope)
  if (queuedLatest) expect(commitRequests[0].p_envelope).not.toEqual(deviceEnvelope)
  const sync = await page.evaluate(() => JSON.parse(localStorage.getItem('edenia_v1_auth_trial_v1_learner_profile_sync_v1')))
  expect(sync.acceptedRevision).toBe(12)
  expect(sync.pending.operationId).toBe(commitRequests[1].p_operation_id)
  expect(sync.queued).toBeNull()
})
}


test('trial comparison keeps saves untouched until confirmation and retains protected downloads', async ({ page }, testInfo) => {
  test.skip(!['desktop-standard', 'tablet-portrait', 'phone-small'].includes(testInfo.project.name))
  const { choiceRequests } = await prepareConflictPage(page, { trial: true, acceptPostChoiceCommits: true, preserveStateOnReload: true })
  const gate = page.locator('#learnerProfileAccessGate')
  await expect(page.locator('#learnerProfileConflictTitle')).toBeVisible()
  const candidates = await page.evaluate(() => {
    const conflict = learnerProfileLifecycleAuthority.getState().conflict
    return { device: conflict.device.profile, cloud: conflict.cloud.profile }
  })
  const deviceProfile = preparePortableLearnerProfileEnvelope(candidates.device).profile
  const syncBefore = await page.evaluate(() => {
    const key = 'edenia_v1_auth_trial_v1_learner_profile_sync_v1'
    const raw = localStorage.getItem(key)
    const { ownerId, profileId, generation } = JSON.parse(raw)
    localStorage.setItem(key + '_dirty', JSON.stringify({ ownerId, profileId, generation, version: 1 }))
    return raw
  })
  await expect(page.getByRole('button', { name: /^Export/ })).toHaveCount(0)
  expect(choiceRequests).toHaveLength(0)
  expect(await page.evaluate(() => localStorage.getItem('edenia_v1_auth_trial_v1_learner_profile_sync_v1'))).toBe(syncBefore)
  await expect(gate).toBeVisible()
  await expect(page.locator('#mainApp')).toBeHidden()
  await page.getByRole('button', { name: 'Use Cloud', exact: true }).click()
  await page.getByRole('button', { name: 'Confirm this choice' }).click()
  await expect(page.locator('#mainApp')).toBeVisible()
  expect(choiceRequests).toHaveLength(1)
  await expect(page.locator('#learnerProfileSyncStatus')).toHaveAttribute('data-sync-status', 'up-to-date')
  expect(await page.evaluate(() => localStorage.getItem('edenia_v1_auth_trial_v1_learner_profile_sync_v1_dirty'))).toBeNull()
  await page.reload()
  await expect(page.locator('#mainApp')).toBeVisible()
  await page.locator('.gear-btn[data-settings-shell-action="open"]').click()
  const protectedDownload = page.waitForEvent('download')
  await page.locator('[data-profile-conflict-action="export-protected"]').click()
  const retainedDevice = await protectedDownload
  expect(retainedDevice.suggestedFilename()).toMatch(/this-device.*\.json$/)
  expect((await verifyPortableLearnerProfileEnvelope(await readFile(await retainedDevice.path(), 'utf8')))?.profile).toEqual(deviceProfile)
  expect(choiceRequests).toHaveLength(1)
})


test('real Godot conflict previews render both exact saves without modifying them', async ({ page }, testInfo) => {
  test.skip(process.env.EDENIA_TEST_TINY_SWORDS !== 'true' || !['desktop-standard', 'phone-standard', 'phone-small'].includes(testInfo.project.name))
  test.setTimeout(90000)
  const { choiceRequests } = await prepareConflictPage(page, { trial: true, withIslands: true })
  await expect(page.locator('#learnerProfileConflict')).toBeVisible()
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('edenia_v1_auth_trial_v1_learner_profile_sync_v1'))?.pending?.revision)).toBe(13)
  const before = await page.evaluate(() => ({
    saved: localStorage.getItem('edenia_v1_auth_trial_v1'),
    sync: localStorage.getItem('edenia_v1_auth_trial_v1_learner_profile_sync_v1'),
    conflict: structuredClone(learnerProfileLifecycleAuthority.getState().conflict)
  }))
  const images = page.locator('#learnerProfileConflictIslands img')
  await expect(images).toHaveCount(2)
  await expect(images.nth(0)).toBeVisible({ timeout: 60000 })
  await expect(images.nth(1)).toBeVisible({ timeout: 60000 })
  await expect.poll(() => images.evaluateAll(nodes => nodes.every(img => img.complete && img.naturalWidth === 800 && img.naturalHeight === 480))).toBe(true)
  expect(await images.evaluateAll(nodes => nodes[0].src !== nodes[1].src)).toBe(true)
  await expect(page.locator('iframe[title="Saved island preview renderer"]')).toHaveCount(0)
  await expect(page.locator('#learnerProfileConflictRows')).toContainText('24 total current XP')
  await expect(page.locator('#learnerProfileConflictRows')).toContainText('8 total current XP')
  await page.locator('#learnerProfileConflictEnlarge').click()
  await expect(page.locator('#learnerProfileConflictEnlarge')).toHaveAttribute('aria-expanded', 'true')
  expect(await page.evaluate(() => ({
    saved: localStorage.getItem('edenia_v1_auth_trial_v1'),
    sync: localStorage.getItem('edenia_v1_auth_trial_v1_learner_profile_sync_v1'),
    conflict: structuredClone(learnerProfileLifecycleAuthority.getState().conflict)
  }))).toEqual(before)
  expect(choiceRequests).toHaveLength(0)
  await page.locator('#learnerProfileConflictEnlarge').click()
  await page.locator('#learnerProfileAccessGate').evaluate(node => { node.scrollTop = 0 })
  expect(await page.locator('#learnerProfileConflictTitle').evaluate(node => node.getBoundingClientRect().top)).toBeGreaterThanOrEqual(0)
  await page.screenshot({ path: testInfo.outputPath('saved-island-comparison.png'), fullPage: true })
})
