import { expect, test } from '../support/network-fixture.mjs'

const OWNER_ID = '123e4567-e89b-42d3-a456-426614174000'
const SECRET_CHANNEL_NAME = 'PRIVATE LEARNER CHANNEL'
const AUTH_STORAGE_KEY = 'edenia_v1_internal_test_plus_auth_v1'
const PROFILE_ACCESS_STORAGE_KEY =
  'edenia_v1_internal_test_learner_profile_access_v1'
const STATE_STORAGE_KEY = 'edenia_v1_internal_test'

function runtimeConfig({ accountFeaturesRollout = 'off', lifecycle = false } = {}) {
  return `window.EDENIA_CONFIG = {
    youtubeApiKey: '',
    freePlusEnabled: false,
    plusCheckoutEnabled: false,
    accountFeaturesRollout: '${accountFeaturesRollout}',
    learnerProfileLifecycleEnabled: ${lifecycle},
    studyGuidanceEnabled: false,
    indexedDbBackupsEnabled: false,
    indexedDbBackupCleanupEnabled: false,
    supabaseUrl: 'https://profile-access-test.supabase.co',
    supabasePublishableKey: 'test-publishable-key'
  }`
}

function expiredSession() {
  const encode = value => Buffer.from(JSON.stringify(value)).toString('base64url')
  return {
    access_token: `${encode({ alg: 'HS256', typ: 'JWT' })}.${encode({
      aud: 'authenticated',
      email: 'private@example.com',
      exp: 1,
      role: 'authenticated',
      sub: OWNER_ID
    })}.test-signature`,
    expires_at: 1,
    expires_in: 1,
    refresh_token: 'pending-refresh-token',
    token_type: 'bearer',
    user: {
      id: OWNER_ID,
      email: 'private@example.com',
      app_metadata: { provider: 'email', providers: ['email'] },
      user_metadata: {}
    }
  }
}

async function seedPrivateLearnerProfile(page) {
  return page.evaluate(({ channelName, storageKey }) => {
    const state = window.defaultState(4, [], 'light', [], 'en')
    const completedAt = '2026-08-18T00:00:00.000Z'
    state.onboarding.introSeenAt = completedAt
    state.onboarding.setupCompleted = true
    state.onboarding.setupCompletedAt = completedAt
    state.onboarding.walkthroughCompleted = true
    state.onboarding.walkthroughCompletedAt = completedAt
    state.config.channels = [{
      id: 'private-channel',
      name: channelName,
      image: '',
      language: 'French'
    }]
    localStorage.setItem(storageKey, JSON.stringify(state))
    return localStorage.getItem(storageKey)
  }, {
    channelName: SECRET_CHANNEL_NAME,
    storageKey: STATE_STORAGE_KEY
  })
}

async function expectNeutralProfileGate(page, expectedState, storedState) {
  await expect(page.locator('#learnerProfileAccessGate')).toBeVisible()
  await expect(page.locator('html')).toHaveAttribute(
    'data-learner-profile-access-state',
    expectedState
  )
  await expect(page.locator('#mainApp')).toBeHidden()
  await expect(page.locator('#introTrailer')).toBeHidden()
  await expect(page.locator('#onboardingPanel')).toBeHidden()
  await expect(page.getByText(SECRET_CHANNEL_NAME)).toHaveCount(0)
  await expect(page.locator('body')).not.toContainText(SECRET_CHANNEL_NAME)
  expect(await page.evaluate(key => localStorage.getItem(key), STATE_STORAGE_KEY))
    .toBe(storedState)
}

test('resolving profile access exposes no learner content and performs no autosave', async ({
  page
}, testInfo) => {
  test.skip(!['desktop-standard', 'phone-small'].includes(testInfo.project.name))
  let lifecycleEnabled = false
  let releaseAuthRequest = null
  await page.route('**/config.local.js', route => route.fulfill({
    body: runtimeConfig({
      accountFeaturesRollout: lifecycleEnabled ? 'internal' : 'off',
      lifecycle: lifecycleEnabled
    }),
    contentType: 'text/javascript',
    status: 200
  }))
  await page.route('https://profile-access-test.supabase.co/auth/v1/**', async route => {
    await new Promise(resolve => { releaseAuthRequest = resolve })
    await route.fulfill({ json: { message: 'temporarily unavailable' }, status: 503 })
  })

  await page.goto('/?internal_test=1')
  const storedState = await seedPrivateLearnerProfile(page)
  await page.evaluate(({ authStorageKey, session }) => {
    localStorage.setItem(authStorageKey, JSON.stringify(session))
  }, { authStorageKey: AUTH_STORAGE_KEY, session: expiredSession() })
  lifecycleEnabled = true
  await page.reload({ waitUntil: 'domcontentloaded' })

  await expectNeutralProfileGate(page, 'resolving', storedState)
  releaseAuthRequest?.()
})

test('locked profile access exposes no learner content and performs no autosave', async ({
  page
}, testInfo) => {
  test.skip(!['desktop-standard', 'phone-small'].includes(testInfo.project.name))
  let lifecycleEnabled = false
  await page.route('**/config.local.js', route => route.fulfill({
    body: runtimeConfig({ lifecycle: lifecycleEnabled }),
    contentType: 'text/javascript',
    status: 200
  }))

  await page.goto('/?internal_test=1')
  const storedState = await seedPrivateLearnerProfile(page)
  await page.evaluate(({ accessStorageKey, ownerId }) => {
    localStorage.setItem(accessStorageKey, JSON.stringify({
      activatedAt: 1_786_982_400_000,
      activationId: null,
      ownerId,
      profileId: `owner:${ownerId}`,
      version: 1
    }))
  }, { accessStorageKey: PROFILE_ACCESS_STORAGE_KEY, ownerId: OWNER_ID })
  lifecycleEnabled = true
  await page.reload({ waitUntil: 'domcontentloaded' })

  await expectNeutralProfileGate(page, 'locked', storedState)
  await expect(page.locator('#learnerProfileAccessTitle')).toHaveText(
    'Your learner profile is locked'
  )
})
