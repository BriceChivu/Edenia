import { expect, test } from '../support/network-fixture.mjs'
import {
  LEARNER_PROFILE_RESOLUTION_STATUSES
} from '../../src/domain/learner-profile-resolution.js'
import {
  createPortableLearnerProfileEnvelope
} from '../../src/state/portable-learner-profile.js'

const OWNER_ID = '123e4567-e89b-42d3-a456-426614174000'
const OTHER_OWNER_ID = '223e4567-e89b-42d3-a456-426614174001'
const SECRET_CHANNEL_NAME = 'PRIVATE LEARNER CHANNEL'
const NEXT_OWNER_CHANNEL_NAME = 'NEXT OWNER PRIVATE CHANNEL'
const AUTH_STORAGE_KEY = 'edenia_v1_internal_test_plus_auth_v1'
const PROFILE_ACCESS_STORAGE_KEY =
  'edenia_v1_internal_test_learner_profile_access_v1'
const OWNER_VERIFICATION_STORAGE_KEY =
  'edenia_v1_internal_test_learner_profile_owner_verification_v1'
const PROFILE_SYNC_STORAGE_KEY =
  'edenia_v1_internal_test_learner_profile_sync_v1'
const CHANNEL_CACHE_STORAGE_KEY =
  'edenia_v1_internal_test_youtube_channel_search_cache_v1'
const ACCOUNT_STUDY_OWNER_STORAGE_KEY =
  'edenia_v1_internal_test_account_study_sync_owner_v1'
const CONFIG_COOKIE_KEY = 'edenia_config_internal_test'
const STATE_STORAGE_KEY = 'edenia_v1_internal_test'
const OWNER_PROFILE_ID = '323e4567-e89b-42d3-a456-426614174002'
const OTHER_OWNER_PROFILE_ID = '423e4567-e89b-42d3-a456-426614174003'

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

function restoredSession(userId) {
  const encode = value => Buffer.from(JSON.stringify(value)).toString('base64url')
  return {
    access_token: `${encode({ alg: 'HS256', typ: 'JWT' })}.${encode({
      aud: 'authenticated',
      exp: 1893456000,
      role: 'authenticated',
      sub: userId
    })}.test-signature`,
    expires_at: 1893456000,
    expires_in: 31536000,
    refresh_token: 'test-refresh-token',
    token_type: 'bearer',
    user: {
      id: userId,
      email: 'other-private@example.com',
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
    state.streak = {
      current: 99,
      lastActivityDate: '2026-08-21',
      longest: 99
    }
    localStorage.setItem(storageKey, JSON.stringify(state))
    return localStorage.getItem(storageKey)
  }, {
    channelName: SECRET_CHANNEL_NAME,
    storageKey: STATE_STORAGE_KEY
  })
}

async function createNextOwnerEnvelope() {
  const completedAt = '2026-08-22T00:00:00.000Z'
  const { envelope } = await createPortableLearnerProfileEnvelope({
    activityLog: [],
    anki: {},
    cityProgress: { maxLevelIndex: 3 },
    config: {
      ankiEnabled: true,
      channelShelfOrder: ['next-owner-channel'],
      channelVideoFormats: {},
      channels: [{
        id: 'next-owner-channel',
        imageUrl: '',
        name: NEXT_OWNER_CHANNEL_NAME
      }],
      includeShorts: true,
      locale: 'en',
      removedChannelIds: [],
      removedDefaultChannelIds: [],
      weeklyGoalHours: 5
    },
    learnerProfile: {
      createdAt: completedAt,
      languages: ['mandarin'],
      level: 'starting',
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

function nextOwnerResolutionRow(envelope) {
  return {
    created: false,
    envelope,
    generation: 2,
    profile_id: OTHER_OWNER_PROFILE_ID,
    revision: 7,
    status: LEARNER_PROFILE_RESOLUTION_STATUSES.PROFILE_READY
  }
}

async function seedOwnerChangeStorage(page, {
  accountStudyOwner = true,
  pending
}) {
  const storedState = await seedPrivateLearnerProfile(page)
  await page.evaluate(({
    accessStorageKey,
    accountStudyOwnerKey,
    authStorageKey,
    cacheStorageKey,
    configCookieKey,
    hasAccountStudyOwner,
    ownerId,
    profileId,
    session,
    syncStorageKey,
    withPending
  }) => {
    localStorage.setItem(authStorageKey, JSON.stringify(session))
    localStorage.setItem(accessStorageKey, JSON.stringify({
      activatedAt: 1_787_068_800_000,
      activationId: null,
      generation: 1,
      ownerId,
      profileId,
      revision: 4,
      version: 1
    }))
    const pendingOperation = withPending ? {
      activationId: 'previous-owner-activation',
      baseRevision: 4,
      envelope: null,
      generation: 1,
      integrity: {
        algorithm: 'SHA-256',
        byteLength: 100,
        payloadSha256: 'A'.repeat(43)
      },
      nextRetryAt: 0,
      operationId: '523e4567-e89b-42d3-a456-426614174004',
      ownerId,
      prepared: {
        exportedAt: '2026-08-22T00:00:00.000Z',
        integrity: {
          algorithm: 'SHA-256',
          byteLength: 100,
          payloadSha256: 'A'.repeat(43)
        },
        profile: { learnerProfile: {} },
        schema: 'edenia-portable-learner-profile',
        version: 1
      },
      profileId,
      retryCount: 0,
      revision: 5
    } : null
    localStorage.setItem(syncStorageKey, JSON.stringify({
      acceptedRevision: 4,
      generation: 1,
      ownerId,
      pending: pendingOperation,
      profileId,
      queued: null,
      version: 1
    }))
    localStorage.setItem(cacheStorageKey, JSON.stringify({
      previousLearnerQuery: { name: 'PRIVATE SEARCH RESULT' }
    }))
    if (hasAccountStudyOwner) localStorage.setItem(accountStudyOwnerKey, ownerId)
    else localStorage.removeItem(accountStudyOwnerKey)
    document.cookie = `${configCookieKey}=${encodeURIComponent(JSON.stringify({
      channels: [{ id: 'private-channel', name: 'PRIVATE LEARNER CHANNEL' }]
    }))}; path=/`
  }, {
    accessStorageKey: PROFILE_ACCESS_STORAGE_KEY,
    accountStudyOwnerKey: ACCOUNT_STUDY_OWNER_STORAGE_KEY,
    authStorageKey: AUTH_STORAGE_KEY,
    cacheStorageKey: CHANNEL_CACHE_STORAGE_KEY,
    configCookieKey: CONFIG_COOKIE_KEY,
    hasAccountStudyOwner: accountStudyOwner,
    ownerId: OWNER_ID,
    profileId: OWNER_PROFILE_ID,
    session: restoredSession(OTHER_OWNER_ID),
    syncStorageKey: PROFILE_SYNC_STORAGE_KEY,
    withPending: pending
  })
  return storedState
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
    'Welcome back — sign in to continue your town.'
  )
})

test('a signed-in owner can reopen and save the matching local profile while the cloud head is unavailable', async ({
  page
}, testInfo) => {
  test.skip(!['desktop-standard', 'phone-small'].includes(testInfo.project.name))
  let lifecycleEnabled = false
  let resolutionCount = 0
  let commitCount = 0
  let cloudEnvelope = null
  let committedEnvelope = null
  await page.addInitScript(() => {
    window.__profileAccessCloudOnline = false
    Object.defineProperty(window.navigator, 'onLine', {
      configurable: true,
      get: () => window.__profileAccessCloudOnline === true
    })
  })
  await page.route('**/config.local.js', route => route.fulfill({
    body: runtimeConfig({
      accountFeaturesRollout: lifecycleEnabled ? 'internal' : 'off',
      lifecycle: lifecycleEnabled
    }),
    contentType: 'text/javascript',
    status: 200
  }))
  await page.route('https://profile-access-test.supabase.co/**', route => {
    const pathname = new URL(route.request().url()).pathname
    if (pathname.endsWith('/rpc/resolve_my_learner_profile')) {
      resolutionCount += 1
      return route.fulfill({
        json: [{
          created: false,
          envelope: cloudEnvelope,
          generation: 1,
          profile_id: '323e4567-e89b-42d3-a456-426614174002',
          revision: 3,
          status: LEARNER_PROFILE_RESOLUTION_STATUSES.PROFILE_READY
        }],
        status: 200
      })
    }
    if (pathname.endsWith('/rpc/commit_my_learner_profile')) {
      commitCount += 1
      const operation = route.request().postDataJSON()
      committedEnvelope = operation.p_envelope
      return route.fulfill({
        json: [{
          base_revision: operation.p_base_revision,
          generation: operation.p_generation,
          payload_sha256: operation.p_envelope.integrity.payloadSha256,
          profile_id: operation.p_profile_id,
          revision: 4,
          status: 'accepted'
        }],
        status: 200
      })
    }
    return route.fulfill({ json: {}, status: 200 })
  })

  await page.goto('/?internal_test=1')
  const privateProfile = JSON.parse(await seedPrivateLearnerProfile(page))
  const olderCloudProfile = structuredClone(privateProfile)
  olderCloudProfile.config.channels = []
  olderCloudProfile.config.locale = 'en'
  const cloudExport = await createPortableLearnerProfileEnvelope(
    olderCloudProfile
  )
  cloudEnvelope = cloudExport.envelope
  await page.evaluate(({
    accessStorageKey,
    authStorageKey,
    ownerId,
    session,
    verificationStorageKey
  }) => {
    localStorage.setItem(authStorageKey, JSON.stringify(session))
    localStorage.setItem(accessStorageKey, JSON.stringify({
      activatedAt: Date.now(),
      activationId: null,
      ownerId,
      profileId: `owner:${ownerId}`,
      version: 1
    }))
    localStorage.removeItem(verificationStorageKey)
  }, {
    accessStorageKey: PROFILE_ACCESS_STORAGE_KEY,
    authStorageKey: AUTH_STORAGE_KEY,
    ownerId: OWNER_ID,
    session: restoredSession(OWNER_ID),
    verificationStorageKey: OWNER_VERIFICATION_STORAGE_KEY
  })
  lifecycleEnabled = true
  await page.reload({ waitUntil: 'domcontentloaded' })

  await expect(page.locator('#mainApp')).toBeVisible()
  await expect(page.locator('#learnerProfileAccessGate')).toBeHidden()
  await expect(page.locator('#learnerProfileSyncStatus')).toHaveText(
    'Not yet backed up'
  )
  const reopenedState = await page.evaluate(key => (
    JSON.parse(localStorage.getItem(key))
  ), STATE_STORAGE_KEY)
  expect(reopenedState.config.channels).toEqual([
    expect.objectContaining({ name: SECRET_CHANNEL_NAME })
  ])
  expect(resolutionCount).toBe(0)
  expect(await page.evaluate(key => (
    localStorage.getItem(key)
  ), OWNER_VERIFICATION_STORAGE_KEY)).toBeNull()

  await page.locator('.gear-btn').click()
  if (testInfo.project.name === 'phone-small') {
    await page.locator('#settingsLocaleBtn').click()
    await page.locator('input[name="settingsLocale"][value="fr"]').check()
    await expect.poll(() => page.evaluate(key => (
      JSON.parse(localStorage.getItem(key)).config.locale
    ), STATE_STORAGE_KEY)).toBe('fr')
  } else {
    await page.locator('.settings-howto-toggle').click()
    await page.locator('#settingsAnkiEnabled').uncheck()
    await expect.poll(() => page.evaluate(key => (
      JSON.parse(localStorage.getItem(key)).config.ankiEnabled
    ), STATE_STORAGE_KEY)).toBe(false)
  }

  const accountToggle = page.locator('.settings-account-toggle')
  if (await accountToggle.getAttribute('aria-expanded') === 'false') {
    await accountToggle.click()
  }
  await page.evaluate(() => { window.__profileAccessCloudOnline = true })
  await page.locator('[data-profile-sync-action="retry"]').click()

  await expect.poll(() => resolutionCount).toBe(1)
  await expect.poll(() => commitCount).toBe(1)
  await expect(page.locator('#learnerProfileSyncStatus')).toHaveAttribute(
    'data-sync-status',
    'up-to-date'
  )
  const synchronizedState = await page.evaluate(key => (
    JSON.parse(localStorage.getItem(key))
  ), STATE_STORAGE_KEY)
  expect(synchronizedState.config.channels).toEqual([
    expect.objectContaining({ name: SECRET_CHANNEL_NAME })
  ])
  expect(committedEnvelope.profile.config.channels).toEqual([
    expect.objectContaining({ name: SECRET_CHANNEL_NAME })
  ])
  if (testInfo.project.name === 'phone-small') {
    expect(synchronizedState.config.locale).toBe('fr')
    expect(committedEnvelope.profile.config.locale).toBe('fr')
  } else {
    expect(synchronizedState.config.ankiEnabled).toBe(false)
    expect(committedEnvelope.profile.config.ankiEnabled).toBe(false)
  }
})

test('an unverified owner replacement stays blocked and local sign-out changes no profile', async ({
  page
}, testInfo) => {
  test.skip(!['desktop-standard', 'phone-small'].includes(testInfo.project.name))
  let lifecycleEnabled = false
  let resolutionCount = 0
  const signOutScopes = []
  await page.route('**/config.local.js', route => route.fulfill({
    body: runtimeConfig({
      accountFeaturesRollout: lifecycleEnabled ? 'internal' : 'off',
      lifecycle: lifecycleEnabled
    }),
    contentType: 'text/javascript',
    status: 200
  }))
  await page.route('https://profile-access-test.supabase.co/**', route => {
    const url = new URL(route.request().url())
    if (url.pathname.includes('/rpc/')) {
      resolutionCount += 1
    }
    if (url.pathname === '/auth/v1/logout') {
      signOutScopes.push(url.searchParams.get('scope'))
    }
    return route.fulfill({ json: {}, status: 200 })
  })

  await page.goto('/?internal_test=1')
  const storedState = await seedPrivateLearnerProfile(page)
  await page.evaluate(({
    accessStorageKey,
    authStorageKey,
    ownerId,
    session
  }) => {
    localStorage.setItem(authStorageKey, JSON.stringify(session))
    localStorage.setItem(accessStorageKey, JSON.stringify({
      activatedAt: 1_786_982_400_000,
      activationId: null,
      ownerId,
      profileId: `owner:${ownerId}`,
      version: 1
    }))
  }, {
    accessStorageKey: PROFILE_ACCESS_STORAGE_KEY,
    authStorageKey: AUTH_STORAGE_KEY,
    ownerId: OWNER_ID,
    session: restoredSession(OTHER_OWNER_ID)
  })
  const storedAccess = await page.evaluate(
    key => localStorage.getItem(key),
    PROFILE_ACCESS_STORAGE_KEY
  )
  lifecycleEnabled = true
  await page.reload({ waitUntil: 'domcontentloaded' })

  await expectNeutralProfileGate(page, 'account-change', storedState)
  await expect(page.locator('#learnerProfileAccessBody')).toHaveText(
    'Edenia cannot verify that this browser’s progress is synchronized. Export it or explicitly discard it before continuing.'
  )
  await expect(page.getByRole('button', {
    name: 'Continue with this account'
  })).toBeHidden()
  await expect(page.getByRole('button', {
    name: 'Export progress and continue'
  })).toBeVisible()
  await expect(page.getByRole('button', {
    name: 'Discard progress and continue'
  })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Sign out' })).toBeVisible()
  expect(resolutionCount).toBe(0)

  await page.getByRole('button', { name: 'Sign out' }).click()
  await expect(page.locator('html')).toHaveAttribute(
    'data-learner-profile-access-state',
    'locked'
  )
  const afterSignOut = await page.evaluate(({
    accessKey,
    stateKey
  }) => ({
    access: localStorage.getItem(accessKey),
    state: localStorage.getItem(stateKey)
  }), {
    accessKey: PROFILE_ACCESS_STORAGE_KEY,
    stateKey: STATE_STORAGE_KEY
  })
  expect(afterSignOut).toEqual({
    access: storedAccess,
    state: storedState
  })
  await expect.poll(() => signOutScopes).toEqual(['local'])
  expect(resolutionCount).toBe(0)
})

test('a synchronized browser copy is replaced only after the learner continues', async ({
  page
}, testInfo) => {
  test.skip(!['desktop-standard', 'phone-small'].includes(testInfo.project.name))
  let lifecycleEnabled = false
  let resolutionCount = 0
  const studySnapshots = []
  const nextOwnerEnvelope = await createNextOwnerEnvelope()
  await page.route('**/config.local.js', route => route.fulfill({
    body: runtimeConfig({
      accountFeaturesRollout: lifecycleEnabled ? 'internal' : 'off',
      lifecycle: lifecycleEnabled
    }),
    contentType: 'text/javascript',
    status: 200
  }))
  await page.route('https://profile-access-test.supabase.co/**', route => {
    const pathname = new URL(route.request().url()).pathname
    if (pathname.endsWith('/rpc/sync_my_reminder_eligibility_snapshot')) {
      studySnapshots.push(route.request().postDataJSON().payload)
      return route.fulfill({ json: '2026-08-22T00:00:00.000Z', status: 200 })
    }
    if (pathname.endsWith('/rpc/resolve_my_learner_profile')) {
      resolutionCount += 1
      return route.fulfill({
        json: [nextOwnerResolutionRow(nextOwnerEnvelope)],
        status: 200
      })
    }
    return route.fulfill({ json: {}, status: 200 })
  })

  await page.goto('/?internal_test=1')
  await seedOwnerChangeStorage(page, {
    accountStudyOwner: false,
    pending: false
  })
  lifecycleEnabled = true
  await page.reload({ waitUntil: 'domcontentloaded' })

  await expectNeutralProfileGate(
    page,
    'account-change',
    await page.evaluate(key => localStorage.getItem(key), STATE_STORAGE_KEY)
  )
  await expect(page.locator('#learnerProfileAccessBody')).toHaveText(
    'The previous learner’s progress is synchronized. Continue to replace this browser’s locked copy with the signed-in account.'
  )
  await expect(page.getByRole('button', {
    name: 'Continue with this account'
  })).toBeVisible()
  expect(resolutionCount).toBe(0)
  expect(studySnapshots).toHaveLength(0)

  await page.getByRole('button', {
    name: 'Continue with this account'
  }).click()
  await expect(page.locator('#mainApp')).toBeVisible()
  await expect(page.getByText(SECRET_CHANNEL_NAME)).toHaveCount(0)
  await expect(page.locator('body')).not.toContainText(SECRET_CHANNEL_NAME)
  await expect.poll(() => resolutionCount).toBeGreaterThanOrEqual(2)

  const replacement = await page.evaluate(({
    accessKey,
    accountStudyOwnerKey,
    cacheKey,
    stateKey,
    syncKey,
    configCookieKey
  }) => ({
    access: JSON.parse(localStorage.getItem(accessKey)),
    accountStudyOwner: localStorage.getItem(accountStudyOwnerKey),
    cache: localStorage.getItem(cacheKey),
    configCookie: document.cookie.split('; ').find(value => (
      value.startsWith(`${configCookieKey}=`)
    )) || null,
    state: JSON.parse(localStorage.getItem(stateKey)),
    sync: JSON.parse(localStorage.getItem(syncKey))
  }), {
    accessKey: PROFILE_ACCESS_STORAGE_KEY,
    accountStudyOwnerKey: ACCOUNT_STUDY_OWNER_STORAGE_KEY,
    cacheKey: CHANNEL_CACHE_STORAGE_KEY,
    configCookieKey: CONFIG_COOKIE_KEY,
    stateKey: STATE_STORAGE_KEY,
    syncKey: PROFILE_SYNC_STORAGE_KEY
  })
  expect(replacement.access).toMatchObject({
    ownerId: OTHER_OWNER_ID,
    profileId: OTHER_OWNER_PROFILE_ID
  })
  expect(replacement.sync).toMatchObject({
    ownerId: OTHER_OWNER_ID,
    profileId: OTHER_OWNER_PROFILE_ID
  })
  expect(JSON.stringify(replacement.sync)).not.toContain(OWNER_ID)
  if (replacement.sync.pending) {
    expect(replacement.sync.pending).toMatchObject({
      ownerId: OTHER_OWNER_ID,
      profileId: OTHER_OWNER_PROFILE_ID
    })
  }
  expect(replacement.state.config.channels).toEqual([
    expect.objectContaining({ name: NEXT_OWNER_CHANNEL_NAME })
  ])
  expect(replacement.cache).toBeNull()
  expect(replacement.configCookie || '').not.toContain(SECRET_CHANNEL_NAME)
  expect(replacement.accountStudyOwner).toBe(OTHER_OWNER_ID)
  await expect.poll(() => studySnapshots.length).toBeGreaterThan(0)
  expect(studySnapshots.every(snapshot => (
    snapshot.currentStreakDays !== 99
  ))).toBe(true)
  expect(studySnapshots.at(-1).learningLanguage).toBe('mandarin')
})

test('unverifiable progress downloads before the browser replaces its owner', async ({
  page
}, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-standard')
  let lifecycleEnabled = false
  const nextOwnerEnvelope = await createNextOwnerEnvelope()
  await page.route('**/config.local.js', route => route.fulfill({
    body: runtimeConfig({
      accountFeaturesRollout: lifecycleEnabled ? 'internal' : 'off',
      lifecycle: lifecycleEnabled
    }),
    contentType: 'text/javascript',
    status: 200
  }))
  await page.route('https://profile-access-test.supabase.co/**', route => {
    const pathname = new URL(route.request().url()).pathname
    if (pathname.endsWith('/rpc/resolve_my_learner_profile')) {
      return route.fulfill({
        json: [nextOwnerResolutionRow(nextOwnerEnvelope)],
        status: 200
      })
    }
    return route.fulfill({ json: {}, status: 200 })
  })

  await page.goto('/?internal_test=1')
  await seedOwnerChangeStorage(page, { pending: false })
  await page.evaluate(key => localStorage.removeItem(key), PROFILE_SYNC_STORAGE_KEY)
  lifecycleEnabled = true
  await page.reload({ waitUntil: 'domcontentloaded' })

  await expect(page.locator('html')).toHaveAttribute(
    'data-learner-profile-access-state',
    'account-change'
  )
  await expect(page.locator('#learnerProfileAccessBody')).toHaveText(
    'Edenia cannot verify that this browser’s progress is synchronized. Export it or explicitly discard it before continuing.'
  )
  await expect(page.getByRole('button', {
    name: 'Continue with this account'
  })).toBeHidden()

  const downloadPromise = page.waitForEvent('download')
  await page.getByRole('button', {
    name: 'Export progress and continue'
  }).click()
  const download = await downloadPromise
  expect(download.suggestedFilename()).toMatch(/^edenia-sync-\d{4}-\d{2}-\d{2}\.json$/)
  await expect(page.locator('#mainApp')).toBeVisible()
  await expect(page.getByText(SECRET_CHANNEL_NAME)).toHaveCount(0)
  const replacement = await page.evaluate(({
    accessKey,
    stateKey
  }) => ({
    access: JSON.parse(localStorage.getItem(accessKey)),
    state: JSON.parse(localStorage.getItem(stateKey))
  }), {
    accessKey: PROFILE_ACCESS_STORAGE_KEY,
    stateKey: STATE_STORAGE_KEY
  })
  expect(replacement.access).toMatchObject({
    ownerId: OTHER_OWNER_ID,
    profileId: OTHER_OWNER_PROFILE_ID
  })
  expect(replacement.state.config.channels).toEqual([
    expect.objectContaining({ name: NEXT_OWNER_CHANNEL_NAME })
  ])
})

test('discarding pending progress requires irreversible confirmation', async ({
  page
}, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-standard')
  let lifecycleEnabled = false
  const nextOwnerEnvelope = await createNextOwnerEnvelope()
  await page.route('**/config.local.js', route => route.fulfill({
    body: runtimeConfig({
      accountFeaturesRollout: lifecycleEnabled ? 'internal' : 'off',
      lifecycle: lifecycleEnabled
    }),
    contentType: 'text/javascript',
    status: 200
  }))
  await page.route('https://profile-access-test.supabase.co/**', route => {
    const pathname = new URL(route.request().url()).pathname
    if (pathname.endsWith('/rpc/resolve_my_learner_profile')) {
      return route.fulfill({
        json: [nextOwnerResolutionRow(nextOwnerEnvelope)],
        status: 200
      })
    }
    return route.fulfill({ json: {}, status: 200 })
  })

  await page.goto('/?internal_test=1')
  const storedState = await seedOwnerChangeStorage(page, { pending: true })
  lifecycleEnabled = true
  await page.reload({ waitUntil: 'domcontentloaded' })

  page.once('dialog', async dialog => {
    expect(dialog.message()).toBe(
      'Discard this browser’s previous progress? It has not been synchronized or exported, and this action cannot be undone.'
    )
    await dialog.dismiss()
  })
  await page.getByRole('button', {
    name: 'Discard progress and continue'
  }).click()
  await expect(page.locator('html')).toHaveAttribute(
    'data-learner-profile-access-state',
    'account-change'
  )
  expect(await page.evaluate(key => localStorage.getItem(key), STATE_STORAGE_KEY))
    .toBe(storedState)

  page.once('dialog', dialog => dialog.accept())
  await page.getByRole('button', {
    name: 'Discard progress and continue'
  }).click()
  await expect(page.locator('#mainApp')).toBeVisible()
  await expect(page.getByText(SECRET_CHANNEL_NAME)).toHaveCount(0)
  const replacement = await page.evaluate(({
    accessKey,
    stateKey
  }) => ({
    access: JSON.parse(localStorage.getItem(accessKey)),
    state: JSON.parse(localStorage.getItem(stateKey))
  }), {
    accessKey: PROFILE_ACCESS_STORAGE_KEY,
    stateKey: STATE_STORAGE_KEY
  })
  expect(replacement.access).toMatchObject({
    ownerId: OTHER_OWNER_ID,
    profileId: OTHER_OWNER_PROFILE_ID
  })
  expect(replacement.state.config.channels).toEqual([
    expect.objectContaining({ name: NEXT_OWNER_CHANNEL_NAME })
  ])
})

test('discarding progress recovers from malformed sync metadata', async ({
  page
}, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-standard')
  let lifecycleEnabled = false
  const nextOwnerEnvelope = await createNextOwnerEnvelope()
  await page.route('**/config.local.js', route => route.fulfill({
    body: runtimeConfig({
      accountFeaturesRollout: lifecycleEnabled ? 'internal' : 'off',
      lifecycle: lifecycleEnabled
    }),
    contentType: 'text/javascript',
    status: 200
  }))
  await page.route('https://profile-access-test.supabase.co/**', route => {
    const pathname = new URL(route.request().url()).pathname
    if (pathname.endsWith('/rpc/resolve_my_learner_profile')) {
      return route.fulfill({
        json: [nextOwnerResolutionRow(nextOwnerEnvelope)],
        status: 200
      })
    }
    return route.fulfill({ json: {}, status: 200 })
  })

  await page.goto('/?internal_test=1')
  await seedOwnerChangeStorage(page, { pending: false })
  await page.evaluate(({
    dirtyKey,
    syncKey
  }) => {
    localStorage.setItem(dirtyKey, '{"broken":')
    localStorage.setItem(syncKey, '{"broken":')
  }, {
    dirtyKey: `${PROFILE_SYNC_STORAGE_KEY}_dirty`,
    syncKey: PROFILE_SYNC_STORAGE_KEY
  })
  lifecycleEnabled = true
  await page.reload({ waitUntil: 'domcontentloaded' })

  await expect(page.locator('#learnerProfileAccessBody')).toHaveText(
    'Edenia cannot verify that this browser’s progress is synchronized. Export it or explicitly discard it before continuing.'
  )
  page.once('dialog', dialog => dialog.accept())
  await page.getByRole('button', {
    name: 'Discard progress and continue'
  }).click()

  await expect(page.locator('#mainApp')).toBeVisible()
  await expect(page.getByText(SECRET_CHANNEL_NAME)).toHaveCount(0)
  const replacement = await page.evaluate(({
    accessKey,
    dirtyKey,
    syncKey
  }) => ({
    access: JSON.parse(localStorage.getItem(accessKey)),
    dirty: localStorage.getItem(dirtyKey),
    sync: JSON.parse(localStorage.getItem(syncKey))
  }), {
    accessKey: PROFILE_ACCESS_STORAGE_KEY,
    dirtyKey: `${PROFILE_SYNC_STORAGE_KEY}_dirty`,
    syncKey: PROFILE_SYNC_STORAGE_KEY
  })
  expect(replacement.access).toMatchObject({
    ownerId: OTHER_OWNER_ID,
    profileId: OTHER_OWNER_PROFILE_ID
  })
  expect(replacement.sync).toMatchObject({
    ownerId: OTHER_OWNER_ID,
    profileId: OTHER_OWNER_PROFILE_ID
  })
  expect(replacement.dirty).toBeNull()
})
