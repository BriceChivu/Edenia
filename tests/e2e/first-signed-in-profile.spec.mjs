import { expect, test } from '../support/network-fixture.mjs'
import {
  LEARNER_PROFILE_RESOLUTION_STATUSES
} from '../../src/domain/learner-profile-resolution.js'

const SUPABASE_ORIGIN = 'https://first-profile-test.supabase.co'
const STATE_STORAGE_KEY = 'edenia_v1_internal_test'
const DRAFT_STORAGE_KEY =
  'edenia_v1_internal_test_onboarding_draft_v1'
const PROFILE_ACCESS_STORAGE_KEY =
  'edenia_v1_internal_test_learner_profile_access_v1'
const AUTH_STORAGE_KEY = 'edenia_v1_internal_test_plus_auth_v1'
const AUTHENTICATED_USER_ID = '123e4567-e89b-42d3-a456-426614174000'
const CREATED_PROFILE_ID = '223e4567-e89b-42d3-a456-426614174001'

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
  await page.route('**/config.local.js', route => route.fulfill({
    body: runtimeConfig(),
    contentType: 'text/javascript',
    status: 200
  }))
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
  await page.goto('/?internal_test=1')
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
