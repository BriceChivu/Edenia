import { expect, test } from '../support/network-fixture.mjs'
import {
  LEARNER_PROFILE_RESOLUTION_STATUSES
} from '../../src/domain/learner-profile-resolution.js'
import {
  createPortableLearnerProfileEnvelope
} from '../../src/state/portable-learner-profile.js'

const SUPABASE_ORIGIN = 'https://profile-conflict-test.supabase.co'
const USER_ID = '123e4567-e89b-42d3-a456-426614174000'
const PROFILE_ID = '223e4567-e89b-42d3-a456-426614174001'
const CONFLICT_ID = '323e4567-e89b-42d3-a456-426614174002'
const OPERATION_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const STATE_KEY = 'edenia_v1_internal_test'
const ACCESS_KEY = 'edenia_v1_internal_test_learner_profile_access_v1'
const SYNC_KEY = 'edenia_v1_internal_test_learner_profile_sync_v1'
const AUTH_KEY = 'edenia_v1_internal_test_plus_auth_v1'
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

async function createConflictEnvelope({
  channelId,
  channelName,
  language,
  level,
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
        reviewed
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
    videos: {}
  }, { now: () => new Date(updatedAt) })
  return envelope
}

async function prepareConflictPage(page, {
  acceptPostChoiceCommits = false,
  cloudSetupCompleted = true,
  failChoice = false,
  preserveStateOnReload = false
} = {}) {
  const deviceEnvelope = await createConflictEnvelope({
    channelId: 'device-channel',
    channelName: 'Device channel',
    language: 'spanish',
    level: 'intermediate',
    locale: 'es',
    maxLevelIndex: 4,
    reviewed: 24,
    updatedAt: '2026-08-21T09:15:00.000Z'
  })
  const cloudEnvelope = await createConflictEnvelope({
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

  await page.addInitScript(({
    accessKey,
    authKey,
    authenticated,
    device,
    preserveReloadState,
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
        integrity: device.integrity,
        nextRetryAt: 0,
        operationId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        ownerId: authenticated.user.id,
        prepared: device,
        profileId: '223e4567-e89b-42d3-a456-426614174001',
        retryCount: 0,
        revision: 13
      },
      profileId: '223e4567-e89b-42d3-a456-426614174001',
      queued: null,
      version: 1
    }))
  }, {
    accessKey: ACCESS_KEY,
    authKey: AUTH_KEY,
    authenticated: authenticatedSession(),
    device: deviceEnvelope,
    preserveReloadState: preserveStateOnReload,
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
    if (pathname === '/rest/v1/rpc/commit_my_learner_profile') {
      const body = request.postDataJSON()
      commitRequests.push(body)
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
          conflict_id: CONFLICT_ID,
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
          conflict_id: CONFLICT_ID,
          device_envelope: deviceEnvelope,
          device_generation: 4,
          device_revision: 13,
          operation_id: OPERATION_ID,
          profile_id: PROFILE_ID,
          protected_until: selectedSide ? PROTECTED_UNTIL : null,
          selected_side: selectedSide,
          status: selectedSide ? 'resolved' : 'open'
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
          conflict_id: CONFLICT_ID,
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
  await page.goto(`${ACCOUNT_RETURN_ORIGIN}/?internal_test=1`)
  return {
    choiceRequests,
    cloudEnvelope,
    commitRequests,
    deviceEnvelope,
    resolutionRequests
  }
}

test('divergent profiles require exportable, confirmed choices at every width', async ({
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
  await expect(page.getByRole('heading', { name: 'Compare your profiles' }))
    .toBeVisible()
  await expect(page.getByRole('columnheader', { name: 'This device' }))
    .toBeAttached()
  await expect(page.getByRole('columnheader', { name: 'Cloud' })).toBeAttached()
  await expect(page.getByText(
    'Edenia does not recommend a version because it is newer.',
    { exact: false }
  )).toBeVisible()
  await expect(page.getByRole('button', { name: /Combine/i })).toHaveCount(0)
  await expect(page.getByRole('row')).toHaveCount(7)
  const geometry = await gate.evaluate(element => ({
    cardWidth: element.querySelector('.learner-profile-access-card').scrollWidth,
    documentWidth: document.documentElement.scrollWidth,
    viewportWidth: document.documentElement.clientWidth
  }))
  expect(geometry.documentWidth).toBeLessThanOrEqual(geometry.viewportWidth)
  expect(geometry.cardWidth).toBeLessThanOrEqual(geometry.viewportWidth)

  const downloads = []
  page.on('download', download => downloads.push(download.suggestedFilename()))
  await page.getByRole('button', { name: 'Export both' }).click()
  await expect.poll(() => downloads.length).toBe(2)
  expect(downloads).toEqual(expect.arrayContaining([
    expect.stringContaining('this-device'),
    expect.stringContaining('cloud')
  ]))

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
  await expect.poll(() => downloads.length).toBe(3)
  expect(downloads.at(-1)).toContain(unchosenSide === 'device'
    ? 'this-device'
    : 'cloud')
  await expect(page.locator('#toast')).toContainText(
    protectedDownloadStartedCopy
  )
  await page.locator(
    '[data-profile-conflict-action="export-protected"]'
  ).click()
  await expect.poll(() => downloads.length).toBe(4)
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
