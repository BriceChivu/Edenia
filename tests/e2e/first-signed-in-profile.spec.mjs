import { expect, test } from '../support/network-fixture.mjs'
import { readFile } from 'node:fs/promises'
import {
  LEARNER_PROFILE_RESOLUTION_STATUSES
} from '../../src/domain/learner-profile-resolution.js'
import {
  createPortableLearnerProfileEnvelope
} from '../../src/state/portable-learner-profile.js'

const SUPABASE_ORIGIN = 'https://first-profile-test.supabase.co'
const ACCOUNT_RETURN_ORIGIN = 'http://localhost:8000'
const SERVED_APPLICATION_ORIGIN = `http://localhost:${Number(
  process.env.EDENIA_TEST_NORMAL_PORT || 8000
)}`
const STATE_STORAGE_KEY = 'edenia_v1_internal_test'
const DRAFT_STORAGE_KEY =
  'edenia_v1_internal_test_onboarding_draft_v1'
const PROFILE_ACCESS_STORAGE_KEY =
  'edenia_v1_internal_test_learner_profile_access_v1'
const PROFILE_SYNC_STORAGE_KEY =
  'edenia_v1_internal_test_learner_profile_sync_v1'
const OWNER_VERIFICATION_STORAGE_KEY =
  'edenia_v1_internal_test_learner_profile_owner_verification_v1'
const AUTH_STORAGE_KEY = 'edenia_v1_internal_test_plus_auth_v1'
const AUTHENTICATED_USER_ID = '123e4567-e89b-42d3-a456-426614174000'
const CREATED_PROFILE_ID = '223e4567-e89b-42d3-a456-426614174001'
const START_OVER_RESET_ID = '323e4567-e89b-42d3-a456-426614174002'
const RETURNING_CHANNEL_NAME = 'RETURNING OWNER PRIVATE CHANNEL'

function fakeAccessToken(userId) {
  const encode = value => Buffer.from(JSON.stringify(value)).toString('base64url')
  return `${encode({ alg: 'HS256', typ: 'JWT' })}.${encode({
    aud: 'authenticated',
    exp: 1893456000,
    role: 'authenticated',
    sub: userId
  })}.test-signature`
}

function authenticatedSession() {
  return {
    access_token: fakeAccessToken(AUTHENTICATED_USER_ID),
    expires_at: 1893456000,
    expires_in: 31536000,
    refresh_token: 'test-refresh-token',
    token_type: 'bearer',
    user: {
      app_metadata: { provider: 'email', providers: ['email'] },
      aud: 'authenticated',
      created_at: '2026-08-21T00:00:00.000Z',
      email: 'learner@example.com',
      id: AUTHENTICATED_USER_ID,
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

async function installRuntimeConfig(page) {
  await useAccountReturnOrigin(page)
  await page.route('**/config.local.js*', route => route.fulfill({
    body: runtimeConfig(),
    contentType: 'text/javascript',
    status: 200
  }))
}

async function useAccountReturnOrigin(page) {
  if (SERVED_APPLICATION_ORIGIN === ACCOUNT_RETURN_ORIGIN) return

  await page.route(`${ACCOUNT_RETURN_ORIGIN}/**`, async route => {
    const requestedUrl = new URL(route.request().url())
    const servedUrl = new URL(
      `${requestedUrl.pathname}${requestedUrl.search}`,
      `${SERVED_APPLICATION_ORIGIN}/`
    )
    const response = await route.fetch({ url: servedUrl.href })
    await route.fulfill({ response })
  })
}

async function installEmptySupabase(page) {
  await page.route(`${SUPABASE_ORIGIN}/**`, route => route.fulfill({
    json: [],
    status: 200
  }))
}

function resolutionRow(status, overrides = {}) {
  return {
    created: false,
    envelope: null,
    generation: null,
    profile_id: null,
    revision: null,
    status,
    ...overrides
  }
}

function returningOwnerResolutionRow(envelope, revision = 12) {
  return resolutionRow(
    LEARNER_PROFILE_RESOLUTION_STATUSES.PROFILE_READY,
    {
      envelope,
      generation: 4,
      profile_id: CREATED_PROFILE_ID,
      revision
    }
  )
}

async function createReturningOwnerEnvelope() {
  const completedAt = '2026-08-20T21:00:00.000Z'
  const { envelope } = await createPortableLearnerProfileEnvelope({
    activityLog: [],
    anki: {},
    cityProgress: { maxLevelIndex: 2 },
    config: {
      ankiEnabled: true,
      channelShelfOrder: ['returning-owner-channel'],
      channelVideoFormats: {},
      channels: [{
        id: 'returning-owner-channel',
        imageUrl: '',
        name: RETURNING_CHANNEL_NAME
      }],
      includeShorts: true,
      locale: 'en',
      removedChannelIds: [],
      removedDefaultChannelIds: [],
      weeklyGoalHours: 4
    },
    learnerProfile: {
      createdAt: completedAt,
      languages: ['french'],
      level: 'beginner',
      selectedChannelCatalogIds: [],
      updatedAt: completedAt
    },
    noAnkiFrequentUserPrompt: {
      respondedAt: null,
      response: null
    },
    onboarding: {
      introSeenAt: completedAt,
      levelUpGuidanceShownAt: null,
      recommendationsAppliedAt: null,
      setupCompleted: true,
      setupCompletedAt: completedAt,
      walkthroughCompleted: true,
      walkthroughCompletedAt: completedAt
    },
    videos: {}
  }, { now: () => new Date(completedAt) })
  return envelope
}

async function fulfillEmailAuthentication(route) {
  const pathname = new URL(route.request().url()).pathname
  if (pathname === '/auth/v1/otp') {
    await route.fulfill({ json: {}, status: 200 })
    return true
  }
  if (pathname === '/auth/v1/verify') {
    await route.fulfill({ json: authenticatedSession(), status: 200 })
    return true
  }
  return false
}

async function reachAccountStep(page) {
  await page.goto(`${ACCOUNT_RETURN_ORIGIN}/?internal_test=1`)
  await page.getByRole('button', { name: 'Skip intro' }).click()
  await page.locator('[data-language-id="mandarin"]').click()
  await page.locator(
    '[data-personalized-onboarding-action="continue-language"]'
  ).click()
  await page.locator('[data-level-id="starting"]').click()
  await page.locator(
    '[data-personalized-onboarding-step="channels"]'
  ).click()
  await expect(
    page.locator('.onboarding-channel[aria-pressed="true"]')
  ).toHaveCount(5)
  await page.locator(
    '[data-personalized-onboarding-step="account"]'
  ).click()
}

async function signInWithEmailCode(page) {
  const panel = page.locator('#onboardingPanel')
  await page.locator('#onboardingAccountEmail').fill('learner@example.com')
  await panel.getByRole('button', { name: 'Email me a code' }).click()
  await page.locator('#onboardingAccountEmailCode').fill('123456')
  await panel.getByRole('button', { name: 'Verify code' }).click()
}

test('public onboarding uses a temporary draft without creating a learner profile', async ({
  page
}, testInfo) => {
  test.skip(!['desktop-standard', 'phone-small'].includes(testInfo.project.name))
  await installRuntimeConfig(page)
  await installEmptySupabase(page)

  await page.goto('/?internal_test=1')

  await expect(page.locator('#introTrailer')).toBeVisible()
  await expect(page.locator('#mainApp')).toBeHidden()
  await expect(page.locator('#learnerProfileAccessGate')).toBeHidden()
  const storage = await page.evaluate(({ draftKey, stateKey }) => ({
    draft: localStorage.getItem(draftKey),
    state: localStorage.getItem(stateKey)
  }), {
    draftKey: DRAFT_STORAGE_KEY,
    stateKey: STATE_STORAGE_KEY
  })
  expect(storage.state).toBeNull()
  expect(JSON.parse(storage.draft)).toMatchObject({
    languageId: null,
    levelId: null,
    selectedChannelCatalogIds: [],
    version: 1
  })
})

test('a returning owner activates online, rechecks within bounds, and can sign out everywhere', async ({
  page
}, testInfo) => {
  test.skip(!['desktop-standard', 'phone-small'].includes(testInfo.project.name))
  const session = authenticatedSession()
  const returningEnvelope = await createReturningOwnerEnvelope()
  await page.addInitScript(({
    authKey,
    authenticated,
    draftKey
  }) => {
    localStorage.setItem(authKey, JSON.stringify(authenticated))
    localStorage.setItem(draftKey, JSON.stringify({
      accountStepReachedAt: '2026-08-21T00:00:00.000Z',
      createdAt: '2026-08-21T00:00:00.000Z',
      introSeenAt: '2026-08-21T00:00:00.000Z',
      languageId: 'mandarin',
      levelId: 'starting',
      locale: 'en',
      selectedChannelCatalogIds: ['mandarin-daily'],
      updatedAt: '2026-08-21T00:00:00.000Z',
      version: 1
    }))
  }, {
    authKey: AUTH_STORAGE_KEY,
    authenticated: session,
    draftKey: DRAFT_STORAGE_KEY
  })
  await installRuntimeConfig(page)
  let releaseResolution
  let resolutionCount = 0
  let refreshCount = 0
  const signOutScopes = []
  const resolutionBarrier = new Promise(resolve => {
    releaseResolution = resolve
  })
  await page.route(`${SUPABASE_ORIGIN}/**`, async route => {
    const url = new URL(route.request().url())
    if (url.pathname === '/rest/v1/rpc/resolve_my_learner_profile') {
      resolutionCount += 1
      if (resolutionCount === 1) await resolutionBarrier
      await route.fulfill({
        json: [returningOwnerResolutionRow(returningEnvelope)],
        status: 200
      })
      return
    }
    if (url.pathname === '/auth/v1/token') {
      refreshCount += 1
      await route.fulfill({ json: authenticatedSession(), status: 200 })
      return
    }
    if (url.pathname === '/auth/v1/logout') {
      signOutScopes.push(url.searchParams.get('scope'))
      await route.fulfill({ json: {}, status: 200 })
      return
    }
    await route.fulfill({ json: {}, status: 200 })
  })

  try {
    await page.goto(`${ACCOUNT_RETURN_ORIGIN}/?internal_test=1`)
    await expect.poll(() => resolutionCount).toBe(1)

    await expect(page.locator('#learnerProfileAccessGate')).toBeVisible()
    await expect(page.locator('html')).toHaveAttribute(
      'data-learner-profile-access-state',
      'waiting-cloud'
    )
    await expect(page.locator('#mainApp')).toBeHidden()
    await expect(page.locator('#introTrailer')).toBeHidden()
    await expect(page.locator('#onboardingPanel')).toBeHidden()
    await expect(page.locator('body')).not.toContainText(RETURNING_CHANNEL_NAME)
    const waitingStorage = await page.evaluate(({
      draftKey,
      stateKey
    }) => ({
      draft: localStorage.getItem(draftKey),
      state: localStorage.getItem(stateKey)
    }), { draftKey: DRAFT_STORAGE_KEY, stateKey: STATE_STORAGE_KEY })
    expect(waitingStorage.draft).not.toBeNull()
    expect(waitingStorage.state).toBeNull()

    releaseResolution()
    await expect(page.locator('#mainApp')).toBeVisible()
    await expect.poll(() => page.evaluate(stateKey => (
      JSON.parse(localStorage.getItem(stateKey))
        .config.trackedChannelPolicy.lastConfirmedTier
    ), STATE_STORAGE_KEY)).toBe('free')
    const activated = await page.evaluate(({
      accessKey,
      draftKey,
      stateKey,
      verificationKey
    }) => ({
      access: JSON.parse(localStorage.getItem(accessKey)),
      draft: localStorage.getItem(draftKey),
      state: JSON.parse(localStorage.getItem(stateKey)),
      stateSerialized: localStorage.getItem(stateKey),
      verification: JSON.parse(localStorage.getItem(verificationKey))
    }), {
      accessKey: PROFILE_ACCESS_STORAGE_KEY,
      draftKey: DRAFT_STORAGE_KEY,
      stateKey: STATE_STORAGE_KEY,
      verificationKey: OWNER_VERIFICATION_STORAGE_KEY
    })
    expect(activated.draft).toBeNull()
    expect(activated.access).toMatchObject({
      ownerId: AUTHENTICATED_USER_ID,
      profileId: CREATED_PROFILE_ID
    })
    expect(activated.state.learnerProfile.languages).toEqual(['french'])
    expect(activated.state.config.channels).toEqual([
      expect.objectContaining({ name: RETURNING_CHANNEL_NAME })
    ])
    expect(Object.keys(activated.verification).sort()).toEqual([
      'ownerId',
      'verifiedAt'
    ])
    expect(activated.verification.ownerId).toBe(AUTHENTICATED_USER_ID)

    const resolutionAfterActivation = resolutionCount
    await page.evaluate(() => {
      window.dispatchEvent(new Event('focus'))
      window.dispatchEvent(new Event('focus'))
    })
    await expect.poll(() => refreshCount).toBe(1)
    await expect.poll(() => resolutionCount).toBe(
      resolutionAfterActivation + 1
    )
    await page.waitForTimeout(100)
    expect(refreshCount).toBe(1)

    const resolutionAfterFocus = resolutionCount
    await page.evaluate(() => {
      window.dispatchEvent(new Event('offline'))
      window.dispatchEvent(new Event('online'))
      window.dispatchEvent(new Event('online'))
    })
    await expect.poll(() => refreshCount).toBe(2)
    await expect.poll(() => resolutionCount).toBe(resolutionAfterFocus + 1)

    await page.locator('.gear-btn').click()
    await page.getByRole('button', { name: 'Account' }).click()
    await page.getByRole('button', { name: 'Sign out everywhere' }).click()
    await expect(page.locator('html')).toHaveAttribute(
      'data-learner-profile-access-state',
      'locked'
    )
    await expect(page.locator('#learnerProfileAccessTitle')).toHaveText(
      'Welcome back — sign in to continue your town.'
    )
    await expect(page.locator('body')).not.toContainText(RETURNING_CHANNEL_NAME)
    await expect.poll(() => signOutScopes).toEqual(['global'])
    const signedOutStorage = await page.evaluate(({
      stateKey,
      verificationKey
    }) => ({
      state: localStorage.getItem(stateKey),
      verification: localStorage.getItem(verificationKey)
    }), {
      stateKey: STATE_STORAGE_KEY,
      verificationKey: OWNER_VERIFICATION_STORAGE_KEY
    })
    expect(signedOutStorage).toEqual({
      state: activated.stateSerialized,
      verification: null
    })
  } finally {
    releaseResolution()
  }
})

test('Start over keeps the account and analytics identity while Undo restores progress', async ({
  page
}, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-standard')
  const returningEnvelope = await createReturningOwnerEnvelope()
  const protectedUntil = '2026-09-21T00:00:00.000Z'
  let cloudEnvelope = returningEnvelope
  let protectedEnvelope = returningEnvelope
  let protectedPriorRevision = 12
  let generation = 4
  let revision = 12
  let resetAvailable = false
  let startOverRequests = 0
  let undoRequests = 0
  const logoutRequests = []

  await page.addInitScript(({
    authKey,
    authenticated
  }) => {
    localStorage.setItem(authKey, JSON.stringify(authenticated))
    const calls = JSON.parse(
      sessionStorage.getItem('__startOverAnalyticsCalls') || '[]'
    )
    const save = (method, args) => {
      calls.push({ method, args })
      sessionStorage.setItem(
        '__startOverAnalyticsCalls',
        JSON.stringify(calls)
      )
    }
    window.posthog = {
      __loaded: true,
      capture(...args) {
        save('capture', args)
      },
      get_distinct_id() {
        return 'stable-analytics-identity'
      },
      identify(...args) {
        save('identify', args)
      },
      reset(...args) {
        save('reset', args)
      },
      setPersonProperties(...args) {
        save('setPersonProperties', args)
      }
    }
  }, {
    authKey: AUTH_STORAGE_KEY,
    authenticated: authenticatedSession()
  })
  await installRuntimeConfig(page)
  await page.route(`${SUPABASE_ORIGIN}/**`, async route => {
    const request = route.request()
    const pathname = new URL(request.url()).pathname
    if (pathname === '/auth/v1/token') {
      await route.fulfill({ json: authenticatedSession(), status: 200 })
      return
    }
    if (pathname === '/auth/v1/logout') {
      logoutRequests.push(request.url())
      await route.fulfill({ json: {}, status: 200 })
      return
    }
    if (pathname === '/rest/v1/rpc/resolve_my_learner_profile') {
      await route.fulfill({
        json: [resolutionRow(
          LEARNER_PROFILE_RESOLUTION_STATUSES.PROFILE_READY,
          {
            envelope: cloudEnvelope,
            generation,
            profile_id: CREATED_PROFILE_ID,
            revision
          }
        )],
        status: 200
      })
      return
    }
    if (pathname === '/rest/v1/rpc/read_my_latest_learner_profile_reset') {
      await route.fulfill({
        json: [resetAvailable
          ? {
              envelope: protectedEnvelope,
              prior_generation: 4,
              prior_revision: protectedPriorRevision,
              profile_id: CREATED_PROFILE_ID,
              protected_until: protectedUntil,
              reset_generation: 5,
              reset_id: START_OVER_RESET_ID,
              status: 'available'
            }
          : { status: 'none' }],
        status: 200
      })
      return
    }
    if (pathname === '/rest/v1/rpc/commit_my_learner_profile') {
      const body = request.postDataJSON()
      expect(body).toMatchObject({
        p_base_revision: revision,
        p_generation: generation,
        p_profile_id: CREATED_PROFILE_ID
      })
      cloudEnvelope = body.p_envelope
      revision += 1
      await route.fulfill({
        json: [{
          base_revision: body.p_base_revision,
          generation,
          payload_sha256: body.p_envelope.integrity.payloadSha256,
          profile_id: CREATED_PROFILE_ID,
          revision,
          status: 'accepted'
        }],
        status: 200
      })
      return
    }
    if (pathname === '/rest/v1/rpc/start_over_my_learner_profile') {
      startOverRequests += 1
      const body = request.postDataJSON()
      expect(body).toMatchObject({
        p_base_revision: revision,
        p_confirmed: true,
        p_generation: 4,
        p_profile_id: CREATED_PROFILE_ID
      })
      expect(body.p_envelope.profile.learnerProfile.languages).toEqual([])
      expect(body.p_envelope.profile.config.channels).toEqual([])
      expect(body.p_envelope.profile.onboarding.setupCompleted).toBe(false)
      protectedEnvelope = cloudEnvelope
      protectedPriorRevision = revision
      cloudEnvelope = body.p_envelope
      generation = 5
      revision = 1
      resetAvailable = true
      await route.fulfill({
        json: [{
          envelope: cloudEnvelope,
          generation,
          profile_id: CREATED_PROFILE_ID,
          protected_until: protectedUntil,
          reset_id: START_OVER_RESET_ID,
          revision,
          status: 'started_over'
        }],
        status: 200
      })
      return
    }
    if (pathname === '/rest/v1/rpc/undo_my_learner_profile_start_over') {
      undoRequests += 1
      expect(request.postDataJSON()).toMatchObject({
        p_confirmed: true,
        p_reset_id: START_OVER_RESET_ID
      })
      cloudEnvelope = protectedEnvelope
      revision = 2
      resetAvailable = false
      await route.fulfill({
        json: [{
          envelope: cloudEnvelope,
          generation,
          profile_id: CREATED_PROFILE_ID,
          reset_id: START_OVER_RESET_ID,
          revision,
          status: 'undone'
        }],
        status: 200
      })
      return
    }
    await route.fulfill({ json: {}, status: 200 })
  })

  await page.goto(`${ACCOUNT_RETURN_ORIGIN}/?internal_test=1`)
  await expect(page.locator('#mainApp')).toBeVisible()
  await expect.poll(() => page.evaluate(stateKey => (
    JSON.parse(localStorage.getItem(stateKey))
      .config.channels[0]?.name
  ), STATE_STORAGE_KEY)).toBe(RETURNING_CHANNEL_NAME)
  await expect(page.locator('#learnerProfileSyncStatus')).toHaveText(
    'Up to date'
  )
  await page.evaluate(() => {
    window.EDENIA_ANALYTICS_ENABLED = true
  })
  const identityBefore = await page.evaluate(
    () => window.posthog.get_distinct_id()
  )

  await page.locator('.gear-btn').click()
  const open = page.getByRole('button', { name: 'Start over', exact: true })
  await open.click()
  expect(startOverRequests).toBe(0)
  await expect(page.locator('#resetConfirm')).toBeVisible()
  await expect(page.locator('#startOverWarning')).toContainText('across devices')
  await expect(page.locator('#startOverWarning')).toContainText('30 days')
  await expect(page.getByRole('button', { name: 'Delete data' })).toHaveCount(0)

  await page.locator('[data-settings-reset-confirm-action="confirm"]').click()
  await expect.poll(() => startOverRequests).toBe(1)
  await expect(page.locator('#startOverUndo')).toBeVisible()
  await expect(page.locator('#startOverUndoDeadline')).not.toBeEmpty()
  await expect(page.getByRole('button', { name: 'Undo Start over' })).toBeFocused()
  await expect(page.locator('body')).not.toContainText(RETURNING_CHANNEL_NAME)
  const afterStartOver = await page.evaluate(({
    accessKey,
    authKey,
    stateKey
  }) => ({
    access: JSON.parse(localStorage.getItem(accessKey)),
    analyticsCalls: JSON.parse(
      sessionStorage.getItem('__startOverAnalyticsCalls') || '[]'
    ),
    auth: JSON.parse(localStorage.getItem(authKey)),
    distinctId: window.posthog.get_distinct_id(),
    state: JSON.parse(localStorage.getItem(stateKey))
  }), {
    accessKey: PROFILE_ACCESS_STORAGE_KEY,
    authKey: AUTH_STORAGE_KEY,
    stateKey: STATE_STORAGE_KEY
  })
  expect(afterStartOver.access).toMatchObject({ generation: 5, revision: 1 })
  expect(afterStartOver.auth.user.id).toBe(AUTHENTICATED_USER_ID)
  expect(afterStartOver.distinctId).toBe(identityBefore)
  expect(afterStartOver.state.learnerProfile.languages).toEqual([])
  expect(afterStartOver.state.config.channels).toEqual([])
  expect(afterStartOver.analyticsCalls.filter(call => (
    call.method === 'capture'
    && call.args[0] === 'profile_started_over'
  ))).toEqual([{
    args: ['profile_started_over', null],
    method: 'capture'
  }])
  expect(afterStartOver.analyticsCalls.filter(call => (
    call.method === 'reset'
  ))).toEqual([])
  expect(logoutRequests).toEqual([])

  await page.getByRole('button', { name: 'Undo Start over' }).click()
  await expect.poll(() => undoRequests).toBe(1)
  await expect(page.locator('#startOverUndo')).toBeHidden()
  await expect(open).toBeFocused()
  const restored = await page.evaluate(({ accessKey, stateKey }) => ({
    access: JSON.parse(localStorage.getItem(accessKey)),
    state: JSON.parse(localStorage.getItem(stateKey))
  }), {
    accessKey: PROFILE_ACCESS_STORAGE_KEY,
    stateKey: STATE_STORAGE_KEY
  })
  expect(restored.access).toMatchObject({ generation: 5, revision: 2 })
  expect(restored.state.learnerProfile.languages).toEqual(['french'])
  expect(logoutRequests).toEqual([])
})

test('a returning owner can retry an unresolved cloud-head check', async ({
  page
}, testInfo) => {
  test.skip(!['desktop-standard', 'phone-small'].includes(testInfo.project.name))
  const returningEnvelope = await createReturningOwnerEnvelope()
  await page.addInitScript(({ authKey, authenticated }) => {
    localStorage.setItem(authKey, JSON.stringify(authenticated))
  }, {
    authKey: AUTH_STORAGE_KEY,
    authenticated: authenticatedSession()
  })
  await installRuntimeConfig(page)
  let resolutionCount = 0
  await page.route(`${SUPABASE_ORIGIN}/**`, async route => {
    const url = new URL(route.request().url())
    if (url.pathname === '/rest/v1/rpc/resolve_my_learner_profile') {
      resolutionCount += 1
      if (resolutionCount === 1) {
        await route.fulfill({
          json: [resolutionRow(
            LEARNER_PROFILE_RESOLUTION_STATUSES.RECOVERY_REQUIRED
          )],
          status: 200
        })
        return
      }
      await route.fulfill({
        json: [returningOwnerResolutionRow(returningEnvelope)],
        status: 200
      })
      return
    }
    await route.fulfill({ json: {}, status: 200 })
  })

  await page.goto(`${ACCOUNT_RETURN_ORIGIN}/?internal_test=1`)
  await expect.poll(() => resolutionCount).toBe(1)
  await expect(page.locator('html')).toHaveAttribute(
    'data-learner-profile-access-state',
    'recovering'
  )
  await expect(page.locator('#mainApp')).toBeHidden()
  await expect(page.getByRole('button', { name: 'Try again' })).toBeVisible()
  const waitingStorage = await page.evaluate(({
    accessKey,
    stateKey
  }) => ({
    access: localStorage.getItem(accessKey),
    state: localStorage.getItem(stateKey)
  }), {
    accessKey: PROFILE_ACCESS_STORAGE_KEY,
    stateKey: STATE_STORAGE_KEY
  })
  expect(waitingStorage).toEqual({ access: null, state: null })

  await page.getByRole('button', { name: 'Try again' }).click()
  await expect.poll(() => resolutionCount).toBe(2)
  await expect(page.locator('#mainApp')).toBeVisible()
  const activated = await page.evaluate(({
    accessKey,
    stateKey
  }) => ({
    access: JSON.parse(localStorage.getItem(accessKey)),
    state: JSON.parse(localStorage.getItem(stateKey))
  }), {
    accessKey: PROFILE_ACCESS_STORAGE_KEY,
    stateKey: STATE_STORAGE_KEY
  })
  expect(activated.access).toMatchObject({
    ownerId: AUTHENTICATED_USER_ID,
    profileId: CREATED_PROFILE_ID
  })
  expect(activated.state.learnerProfile.languages).toEqual(['french'])
})

test('pre-authentication choices survive reload before authentication', async ({
  page
}, testInfo) => {
  test.skip(!['desktop-standard', 'phone-small'].includes(testInfo.project.name))
  await installRuntimeConfig(page)
  await installEmptySupabase(page)

  await page.goto('/?internal_test=1')
  await page.getByRole('button', { name: 'Skip intro' }).click()
  await page.locator('[data-language-id="mandarin"]').click()
  await page.reload()

  await expect(page.locator(
    '[data-personalized-onboarding-step="channels"]'
  )).toBeVisible()
  await page.locator('[data-level-id="starting"]').click()
  await page.reload()

  await expect(
    page.locator('.onboarding-channel[aria-pressed="true"]')
  ).toHaveCount(5)
  const draft = await page.evaluate(key => (
    JSON.parse(localStorage.getItem(key))
  ), DRAFT_STORAGE_KEY)
  expect(draft).toMatchObject({
    languageId: 'mandarin',
    levelId: 'starting',
    selectedChannelCatalogIds: expect.arrayContaining([expect.any(String)])
  })
})

test('authentication creates and activates exactly one signed-in learner profile', async ({
  page
}, testInfo) => {
  test.skip(!['desktop-standard', 'phone-small'].includes(testInfo.project.name))
  await installRuntimeConfig(page)

  const resolutionRequests = []
  let releaseResolution
  const resolutionBarrier = new Promise(resolve => {
    releaseResolution = resolve
  })
  await page.route(`${SUPABASE_ORIGIN}/**`, async route => {
    if (await fulfillEmailAuthentication(route)) return
    const request = route.request()
    const url = new URL(request.url())
    if (url.pathname === '/rest/v1/rpc/resolve_my_learner_profile') {
      const body = request.postDataJSON()
      resolutionRequests.push(body)
      await resolutionBarrier
      await route.fulfill({
        json: [resolutionRow(
          LEARNER_PROFILE_RESOLUTION_STATUSES.PROFILE_READY,
          {
          created: true,
          envelope: body.p_onboarding_profile,
          generation: 1,
          profile_id: CREATED_PROFILE_ID,
          revision: 1
          }
        )],
        status: 200
      })
      return
    }
    await route.fulfill({ json: [], status: 200 })
  })

  try {
    await reachAccountStep(page)

    const panel = page.locator('#onboardingPanel')
    await expect(panel.getByRole('button', { name: 'Skip for now' }))
      .toHaveCount(0)
    const geometry = await panel.evaluate(element => ({
      documentWidth: document.documentElement.scrollWidth,
      panelWidth: element.scrollWidth,
      viewportWidth: document.documentElement.clientWidth
    }))
    expect(geometry.documentWidth).toBeLessThanOrEqual(geometry.viewportWidth)
    expect(geometry.panelWidth).toBeLessThanOrEqual(geometry.viewportWidth)
    const draftBeforeSignIn = await page.evaluate(key => (
      JSON.parse(localStorage.getItem(key))
    ), DRAFT_STORAGE_KEY)
    expect(draftBeforeSignIn).toMatchObject({
      languageId: 'mandarin',
      levelId: 'starting',
      selectedChannelCatalogIds: expect.arrayContaining([
        expect.any(String)
      ])
    })

    await signInWithEmailCode(page)

    await expect.poll(() => resolutionRequests.length).toBe(1)
    await expect(panel).toBeVisible()
    await expect(panel.getByRole('button', { name: 'Start my journey' }))
      .toHaveCount(0)
    const waitingStorage = await page.evaluate(({ draftKey, stateKey }) => ({
      draft: localStorage.getItem(draftKey),
      state: localStorage.getItem(stateKey)
    }), { draftKey: DRAFT_STORAGE_KEY, stateKey: STATE_STORAGE_KEY })
    expect(waitingStorage.draft).not.toBeNull()
    expect(waitingStorage.state).toBeNull()

    const request = resolutionRequests[0]
    expect(Object.keys(request)).toEqual(['p_onboarding_profile'])
    expect(JSON.stringify(request)).not.toContain(AUTHENTICATED_USER_ID)
    expect(JSON.stringify(request)).not.toContain('learner@example.com')
    expect(request.p_onboarding_profile.profile.learnerProfile).toMatchObject({
      languages: ['mandarin'],
      level: 'starting',
      selectedChannelCatalogIds: draftBeforeSignIn.selectedChannelCatalogIds
        .slice()
        .sort()
    })

    releaseResolution()
    await expect(page.locator('#mainApp')).toBeVisible()
    await expect(panel).toBeHidden()
    const activated = await page.evaluate(({
      accessKey,
      draftKey,
      stateKey
    }) => ({
      access: JSON.parse(localStorage.getItem(accessKey)),
      draft: localStorage.getItem(draftKey),
      state: JSON.parse(localStorage.getItem(stateKey))
    }), {
      accessKey: PROFILE_ACCESS_STORAGE_KEY,
      draftKey: DRAFT_STORAGE_KEY,
      stateKey: STATE_STORAGE_KEY
    })
    expect(activated.draft).toBeNull()
    expect(activated.access).toMatchObject({
      ownerId: AUTHENTICATED_USER_ID,
      profileId: CREATED_PROFILE_ID,
      version: 1
    })
    expect(activated.state.learnerProfile).toMatchObject({
      languages: ['mandarin'],
      level: 'starting',
      selectedChannelCatalogIds:
        draftBeforeSignIn.selectedChannelCatalogIds.slice().sort()
    })
  } finally {
    releaseResolution()
  }
})

test('Start over explicitly discards the onboarding draft', async ({
  page
}, testInfo) => {
  test.skip(!['desktop-standard', 'phone-small'].includes(testInfo.project.name))
  await installRuntimeConfig(page)
  await installEmptySupabase(page)

  await reachAccountStep(page)
  const previousDraft = await page.evaluate(key => (
    localStorage.getItem(key)
  ), DRAFT_STORAGE_KEY)
  await page.getByRole('button', { name: 'Start over' }).click()

  await expect(page.locator('#introTrailer')).toBeVisible()
  const reset = await page.evaluate(({ draftKey, stateKey }) => ({
    draft: JSON.parse(localStorage.getItem(draftKey)),
    state: localStorage.getItem(stateKey)
  }), { draftKey: DRAFT_STORAGE_KEY, stateKey: STATE_STORAGE_KEY })
  expect(JSON.stringify(reset.draft)).not.toBe(previousDraft)
  expect(reset.draft).toMatchObject({
    accountStepReachedAt: null,
    languageId: null,
    levelId: null,
    selectedChannelCatalogIds: [],
    version: 1
  })
  expect(reset.state).toBeNull()
})

test('server gate denial keeps the draft recoverable and writes no profile', async ({
  page
}, testInfo) => {
  test.skip(!['desktop-standard', 'phone-small'].includes(testInfo.project.name))
  await installRuntimeConfig(page)
  let resolutionCount = 0
  await page.route(`${SUPABASE_ORIGIN}/**`, async route => {
    if (await fulfillEmailAuthentication(route)) return
    const url = new URL(route.request().url())
    if (url.pathname === '/rest/v1/rpc/resolve_my_learner_profile') {
      resolutionCount += 1
      await route.fulfill({
        json: [resolutionRow(
          LEARNER_PROFILE_RESOLUTION_STATUSES.ACCESS_DISABLED
        )],
        status: 200
      })
      return
    }
    await route.fulfill({ json: [], status: 200 })
  })

  await reachAccountStep(page)
  const draftBeforeSignIn = await page.evaluate(key => (
    localStorage.getItem(key)
  ), DRAFT_STORAGE_KEY)
  await signInWithEmailCode(page)

  await expect.poll(() => resolutionCount).toBe(1)
  await expect(page.locator('html')).toHaveAttribute(
    'data-learner-profile-access-state',
    'locked'
  )
  await expect(page.locator('#mainApp')).toBeHidden()
  const failed = await page.evaluate(({ accessKey, draftKey, stateKey }) => ({
    access: localStorage.getItem(accessKey),
    draft: localStorage.getItem(draftKey),
    state: localStorage.getItem(stateKey)
  }), {
    accessKey: PROFILE_ACCESS_STORAGE_KEY,
    draftKey: DRAFT_STORAGE_KEY,
    stateKey: STATE_STORAGE_KEY
  })
  expect(failed).toEqual({
    access: null,
    draft: draftBeforeSignIn,
    state: null
  })
})

test('offline progress survives reload and activates on a second device after sync', async ({
  browser,
  page
}, testInfo) => {
  test.skip(!['desktop-standard', 'phone-small'].includes(testInfo.project.name))
  const usesPhoneLocaleChange = testInfo.project.name === 'phone-small'
  let cloudEnvelope = await createReturningOwnerEnvelope()
  let cloudRevision = 12
  const commitRequests = []
  const acceptedOperations = new Map()

  const installCloud = async targetPage => {
    await targetPage.route(`${SUPABASE_ORIGIN}/**`, async route => {
      const request = route.request()
      const pathname = new URL(request.url()).pathname
      if (pathname === '/auth/v1/token') {
        await route.fulfill({ json: authenticatedSession(), status: 200 })
        return
      }
      if (pathname === '/rest/v1/rpc/resolve_my_learner_profile') {
        await route.fulfill({
          json: [returningOwnerResolutionRow(cloudEnvelope, cloudRevision)],
          status: 200
        })
        return
      }
      if (pathname === '/rest/v1/rpc/commit_my_learner_profile') {
        const operation = request.postDataJSON()
        commitRequests.push(operation)
        const priorReceipt = acceptedOperations.get(operation.p_operation_id)
        if (priorReceipt) {
          expect(operation).toEqual(priorReceipt.operation)
          await route.fulfill({
            json: [{ ...priorReceipt.row, status: 'already_accepted' }],
            status: 200
          })
          return
        }
        expect(operation.p_base_revision).toBe(cloudRevision)
        cloudEnvelope = operation.p_envelope
        cloudRevision += 1
        const row = {
          base_revision: operation.p_base_revision,
          generation: operation.p_generation,
          payload_sha256: operation.p_envelope.integrity.payloadSha256,
          profile_id: operation.p_profile_id,
          revision: cloudRevision,
          status: 'accepted'
        }
        acceptedOperations.set(operation.p_operation_id, { operation, row })
        await route.fulfill({
          json: [row],
          status: 200
        })
        return
      }
      await route.fulfill({ json: {}, status: 200 })
    })
  }

  await page.addInitScript(({ authKey, authenticated }) => {
    localStorage.setItem(authKey, JSON.stringify(authenticated))
    Object.defineProperty(window.navigator, 'onLine', {
      configurable: true,
      get: () => localStorage.getItem('edenia-test-offline') !== '1'
    })
  }, {
    authKey: AUTH_STORAGE_KEY,
    authenticated: authenticatedSession()
  })
  await installRuntimeConfig(page)
  await installCloud(page)
  await page.goto(`${ACCOUNT_RETURN_ORIGIN}/?internal_test=1`)
  await expect(page.locator('#mainApp')).toBeVisible()
  await expect(page.locator('#learnerProfileSyncStatus')).toHaveText('Up to date')
  const startingRevision = cloudRevision
  commitRequests.length = 0

  await page.evaluate(() => {
    localStorage.setItem('edenia-test-offline', '1')
    window.dispatchEvent(new Event('offline'))
  })
  await page.locator('.gear-btn').click()
  if (usesPhoneLocaleChange) {
    await page.locator('#settingsLocaleBtn').click()
    await page.locator(
      'input[name="settingsLocale"][value="fr"]'
    ).check()
  } else {
    await page.locator('.settings-howto-toggle').click()
    await page.locator('#settingsAnkiEnabled').uncheck()
  }

  await expect.poll(() => page.evaluate(key => (
    JSON.parse(localStorage.getItem(key)).config
  ), STATE_STORAGE_KEY)).toMatchObject(
    usesPhoneLocaleChange ? { locale: 'fr' } : { ankiEnabled: false }
  )
  await expect(page.locator('#learnerProfileSyncStatus')).toHaveText(
    usesPhoneLocaleChange
      ? 'Enregistré sur cet appareil — en attente de synchronisation.'
      : 'Saved on this device — waiting to sync.'
  )
  let pending = await page.evaluate(key => (
    JSON.parse(localStorage.getItem(key))
  ), PROFILE_SYNC_STORAGE_KEY)
  expect(pending).toMatchObject({
    acceptedRevision: startingRevision,
    generation: 4,
    ownerId: AUTHENTICATED_USER_ID,
    pending: {
      baseRevision: startingRevision,
      generation: 4,
      ownerId: AUTHENTICATED_USER_ID,
      profileId: CREATED_PROFILE_ID
    },
    profileId: CREATED_PROFILE_ID
  })
  expect(commitRequests).toHaveLength(0)

  await page.reload()
  await expect(page.locator('html')).toHaveAttribute(
    'data-learner-profile-access-state',
    'active'
  )
  await expect(page.locator('#mainApp')).toBeVisible()
  await expect(page.locator('#learnerProfileSyncStatus')).toHaveText(
    usesPhoneLocaleChange
      ? 'Enregistré sur cet appareil — en attente de synchronisation.'
      : 'Saved on this device — waiting to sync.'
  )
  pending = await page.evaluate(key => (
    JSON.parse(localStorage.getItem(key))
  ), PROFILE_SYNC_STORAGE_KEY)
  expect(pending.pending.operationId).toEqual(expect.any(String))
  expect(pending.pending.prepared.profile.config).toMatchObject(
    usesPhoneLocaleChange ? { locale: 'fr' } : { ankiEnabled: false }
  )

  await page.evaluate(() => {
    localStorage.removeItem('edenia-test-offline')
    window.dispatchEvent(new Event('online'))
  })
  await expect(page.locator('#mainApp')).toBeVisible()
  await expect.poll(() => (
    commitRequests.at(-1)?.p_envelope.profile.config
  )).toMatchObject(
    usesPhoneLocaleChange ? { locale: 'fr' } : { ankiEnabled: false }
  )
  await expect(page.locator('#learnerProfileSyncStatus')).toHaveText(
    usesPhoneLocaleChange ? 'À jour' : 'Up to date'
  )
  expect(commitRequests.at(-1).p_envelope.profile.config).toMatchObject(
    usesPhoneLocaleChange ? { locale: 'fr' } : { ankiEnabled: false }
  )
  const firstDeviceRevision = cloudRevision

  const secondContext = await browser.newContext()
  const secondPage = await secondContext.newPage()
  try {
    await secondPage.addInitScript(({ authKey, authenticated }) => {
      localStorage.setItem(authKey, JSON.stringify(authenticated))
    }, {
      authKey: AUTH_STORAGE_KEY,
      authenticated: authenticatedSession()
    })
    await installRuntimeConfig(secondPage)
    await installCloud(secondPage)
    await secondPage.goto(`${ACCOUNT_RETURN_ORIGIN}/?internal_test=1`)
    await expect(secondPage.locator('#mainApp')).toBeVisible()
    const secondDevice = await secondPage.evaluate(({
      accessKey,
      stateKey
    }) => ({
      access: JSON.parse(localStorage.getItem(accessKey)),
      state: JSON.parse(localStorage.getItem(stateKey))
    }), {
      accessKey: PROFILE_ACCESS_STORAGE_KEY,
      stateKey: STATE_STORAGE_KEY
    })
    expect(secondDevice.state.config).toMatchObject(
      usesPhoneLocaleChange ? { locale: 'fr' } : { ankiEnabled: false }
    )
    expect(secondDevice.access).toMatchObject({
      generation: 4,
      revision: firstDeviceRevision
    })
    await expect.poll(() => secondPage.evaluate(syncKey => {
      const sync = JSON.parse(localStorage.getItem(syncKey))
      return {
        acceptedRevision: sync.acceptedRevision,
        pending: sync.pending,
        queued: sync.queued
      }
    }, PROFILE_SYNC_STORAGE_KEY)).toMatchObject({
      acceptedRevision: cloudRevision,
      pending: null,
      queued: null
    })
  } finally {
    await secondContext.close()
  }
})

test('rejected cloud backup preserves continued local study, recovery export, and retry', async ({
  page
}, testInfo) => {
  test.skip(!['desktop-standard', 'phone-small'].includes(testInfo.project.name))
  let cloudEnvelope = await createReturningOwnerEnvelope()
  let cloudRevision = 12
  let acceptCommits = true
  const commitRequests = []

  await page.addInitScript(({ authKey, authenticated }) => {
    localStorage.setItem(authKey, JSON.stringify(authenticated))
  }, {
    authKey: AUTH_STORAGE_KEY,
    authenticated: authenticatedSession()
  })
  await installRuntimeConfig(page)
  await page.route(`${SUPABASE_ORIGIN}/**`, async route => {
    const request = route.request()
    const pathname = new URL(request.url()).pathname
    if (pathname === '/auth/v1/token') {
      await route.fulfill({ json: authenticatedSession(), status: 200 })
      return
    }
    if (pathname === '/rest/v1/rpc/resolve_my_learner_profile') {
      await route.fulfill({
        json: [returningOwnerResolutionRow(cloudEnvelope, cloudRevision)],
        status: 200
      })
      return
    }
    if (pathname === '/rest/v1/rpc/commit_my_learner_profile') {
      const operation = request.postDataJSON()
      commitRequests.push(operation)
      if (!acceptCommits) {
        await route.fulfill({
          json: [{ status: 'rejected' }],
          status: 200
        })
        return
      }
      expect(operation.p_base_revision).toBe(cloudRevision)
      cloudEnvelope = operation.p_envelope
      cloudRevision += 1
      await route.fulfill({
        json: [{
          base_revision: operation.p_base_revision,
          generation: operation.p_generation,
          payload_sha256: operation.p_envelope.integrity.payloadSha256,
          profile_id: operation.p_profile_id,
          revision: cloudRevision,
          status: 'accepted'
        }],
        status: 200
      })
      return
    }
    await route.fulfill({ json: {}, status: 200 })
  })

  await page.goto(`${ACCOUNT_RETURN_ORIGIN}/?internal_test=1`)
  await expect(page.locator('#mainApp')).toBeVisible()
  await expect(page.locator('#learnerProfileSyncStatus')).toHaveText('Up to date')
  const startingRevision = cloudRevision
  acceptCommits = false
  commitRequests.length = 0
  await page.locator('.gear-btn').click()
  if (testInfo.project.name === 'phone-small') {
    await page.locator('#settingsLocaleBtn').click()
    await page.locator('input[name="settingsLocale"][value="fr"]').check()
  } else {
    await page.locator('.settings-howto-toggle').click()
    await page.locator('#settingsAnkiEnabled').uncheck()
  }

  await expect(page.locator('#learnerProfileSyncSettingsStatus')).toHaveAttribute(
    'data-sync-status',
    'not-backed-up'
  )
  const accountToggle = page.locator('.settings-account-toggle')
  if (await accountToggle.getAttribute('aria-expanded') === 'false') {
    await accountToggle.click()
  }
  await expect(page.locator('#learnerProfileSyncActions')).toBeVisible()
  await expect(page.locator('#learnerProfileSyncGuidance')).not.toBeEmpty()
  await expect(page.locator(
    '[data-profile-sync-action="retry"]'
  )).toBeVisible()
  await expect(page.locator(
    '[data-profile-sync-action="export-recovery"]'
  )).toBeVisible()
  expect(cloudRevision).toBe(startingRevision)
  expect(cloudEnvelope.profile.config.ankiEnabled).toBe(true)

  await page.locator('#settingsLocaleBtn').click()
  const continuedLocale = testInfo.project.name === 'phone-small' ? 'es' : 'fr'
  await page.locator(
    `input[name="settingsLocale"][value="${continuedLocale}"]`
  ).check()
  await expect.poll(() => page.evaluate(key => (
    JSON.parse(localStorage.getItem(key)).config
  ), STATE_STORAGE_KEY)).toMatchObject({
    ankiEnabled: testInfo.project.name === 'phone-small',
    locale: continuedLocale
  })
  await expect(page.locator('#learnerProfileSyncSettingsStatus')).toHaveAttribute(
    'data-sync-status',
    'not-backed-up'
  )
  const pending = await page.evaluate(key => (
    JSON.parse(localStorage.getItem(key))
  ), PROFILE_SYNC_STORAGE_KEY)
  expect(pending).toMatchObject({
    acceptedRevision: startingRevision,
    pending: {
      baseRevision: startingRevision,
      envelope: {
        profile: {
          config: {
            ankiEnabled: testInfo.project.name === 'phone-small',
            locale: testInfo.project.name === 'phone-small' ? 'fr' : 'en'
          }
        }
      },
      prepared: null
    },
    queued: {
      baseRevision: startingRevision + 1,
      prepared: {
        profile: {
          config: {
            ankiEnabled: testInfo.project.name === 'phone-small',
            locale: continuedLocale
          }
        }
      }
    }
  })
  expect(cloudRevision).toBe(startingRevision)

  const downloadPromise = page.waitForEvent('download')
  await page.locator(
    '[data-profile-sync-action="export-recovery"]'
  ).click()
  const download = await downloadPromise
  const downloadPath = await download.path()
  const serialized = await readFile(downloadPath, 'utf8')
  const recoveryEnvelope = JSON.parse(serialized)
  expect(recoveryEnvelope.profile.config).toMatchObject({
    ankiEnabled: testInfo.project.name === 'phone-small',
    locale: continuedLocale
  })
  expect(Buffer.byteLength(serialized, 'utf8')).toBe(
    recoveryEnvelope.integrity.byteLength
  )

  acceptCommits = true
  await page.locator('[data-profile-sync-action="retry"]').click()
  await expect(page.locator('#learnerProfileSyncStatus')).toHaveAttribute(
    'data-sync-status',
    'up-to-date'
  )
  expect(cloudRevision).toBe(startingRevision + 2)
  expect(cloudEnvelope.profile.config).toMatchObject({
    ankiEnabled: testInfo.project.name === 'phone-small',
    locale: continuedLocale
  })
  expect(commitRequests).toHaveLength(3)
})

test('an already signed-in new learner resolves again when onboarding reaches its final step', async ({
  page
}, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-standard')
  const session = authenticatedSession()
  await page.addInitScript(({ authKey, authenticated }) => {
    localStorage.setItem(authKey, JSON.stringify(authenticated))
  }, { authKey: AUTH_STORAGE_KEY, authenticated: session })
  await installRuntimeConfig(page)
  const resolutionRequests = []
  await page.route(`${SUPABASE_ORIGIN}/**`, async route => {
    const request = route.request()
    const url = new URL(request.url())
    if (url.pathname === '/rest/v1/rpc/resolve_my_learner_profile') {
      const body = request.postDataJSON()
      resolutionRequests.push(body)
      if (!body.p_onboarding_profile) {
        await route.fulfill({
          json: [resolutionRow(
            LEARNER_PROFILE_RESOLUTION_STATUSES.ONBOARDING_REQUIRED
          )],
          status: 200
        })
        return
      }
      await route.fulfill({
        json: [resolutionRow(
          LEARNER_PROFILE_RESOLUTION_STATUSES.PROFILE_READY,
          {
            created: true,
            envelope: body.p_onboarding_profile,
            generation: 1,
            profile_id: CREATED_PROFILE_ID,
            revision: 1
          }
        )],
        status: 200
      })
      return
    }
    await route.fulfill({ json: [], status: 200 })
  })

  await reachAccountStep(page)

  await expect.poll(() => resolutionRequests.length).toBe(2)
  expect(resolutionRequests[0]).toEqual({ p_onboarding_profile: null })
  expect(resolutionRequests[1].p_onboarding_profile.profile.learnerProfile)
    .toMatchObject({ languages: ['mandarin'], level: 'starting' })
  await expect(page.locator('#mainApp')).toBeVisible()
  expect(await page.evaluate(key => localStorage.getItem(key), DRAFT_STORAGE_KEY))
    .toBeNull()
})
