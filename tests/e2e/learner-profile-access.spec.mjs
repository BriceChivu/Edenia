import { expect, test } from '../support/network-fixture.mjs'
import { readFile } from 'node:fs/promises'
import {
  LEARNER_PROFILE_RESOLUTION_STATUSES
} from '../../src/domain/learner-profile-resolution.js'
import {
  createPortableLearnerProfileEnvelope
} from '../../src/state/portable-learner-profile.js'

const OWNER_ID = '123e4567-e89b-42d3-a456-426614174000'
const OTHER_OWNER_ID = '223e4567-e89b-42d3-a456-426614174001'
const ACCOUNT_RETURN_ORIGIN = 'http://localhost:8000'
const SERVED_APPLICATION_ORIGIN = `http://localhost:${Number(
  process.env.EDENIA_TEST_NORMAL_PORT || 8000
)}`
const SECRET_ACTIVITY_TITLE = 'PRIVATE LEARNER ACTIVITY'
const SECRET_CHANNEL_NAME = 'PRIVATE LEARNER CHANNEL'
const NEXT_OWNER_CHANNEL_NAME = 'NEXT OWNER PRIVATE CHANNEL'
const AUTH_STORAGE_KEY = 'edenia_v1_internal_test_plus_auth_v1'
const PROFILE_ACCESS_STORAGE_KEY =
  'edenia_v1_internal_test_learner_profile_access_v1'
const OWNER_VERIFICATION_STORAGE_KEY =
  'edenia_v1_internal_test_learner_profile_owner_verification_v1'
const ONBOARDING_DRAFT_STORAGE_KEY =
  'edenia_v1_internal_test_onboarding_draft_v1'
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
const youtubeFixtures = {
  channels: JSON.parse(await readFile(
    new URL('../fixtures/youtube/channels.json', import.meta.url),
    'utf8'
  )),
  playlistItems: JSON.parse(await readFile(
    new URL('../fixtures/youtube/playlist-items.json', import.meta.url),
    'utf8'
  )),
  videos: JSON.parse(await readFile(
    new URL('../fixtures/youtube/videos.json', import.meta.url),
    'utf8'
  ))
}
const GUARDED_AUTHENTICATION_COPY = Object.freeze({
  en: {
    back: 'Back to locked message',
    body: 'Use the account that owns this learner profile.',
    status: 'Your learner profile stays hidden until ownership checks succeed.',
    title: 'Sign in to unlock your profile'
  },
  'zh-Hant': {
    back: '返回鎖定提示',
    body: '請使用擁有此學習檔案的帳戶。',
    status: '在擁有權驗證成功前，你的學習檔案將保持隱藏。',
    title: '登入以解鎖你的學習檔案'
  },
  'zh-Hans': {
    back: '返回锁定提示',
    body: '请使用拥有此学习档案的账户。',
    status: '在所有权验证成功前，你的学习档案将保持隐藏。',
    title: '登录以解锁你的学习档案'
  },
  es: {
    back: 'Volver al mensaje de bloqueo',
    body: 'Usa la cuenta propietaria de este perfil de estudiante.',
    status: 'Tu perfil de estudiante permanecerá oculto hasta que se verifique la propiedad.',
    title: 'Inicia sesión para desbloquear tu perfil'
  },
  fr: {
    back: 'Revenir au message de verrouillage',
    body: 'Utilisez le compte propriétaire de ce profil d’apprentissage.',
    status: 'Votre profil d’apprentissage reste masqué jusqu’à la vérification de son propriétaire.',
    title: 'Connectez-vous pour déverrouiller votre profil'
  }
})

function runtimeConfig({
  accountFeaturesRollout = 'off',
  googleIdentityClientId = '',
  lifecycle = false,
  youtubeApiKey = ''
} = {}) {
  return `window.EDENIA_CONFIG = ${JSON.stringify({
    accountFeaturesRollout,
    freePlusEnabled: false,
    googleIdentityClientId,
    googleSignInMode: googleIdentityClientId ? 'id_token' : 'off',
    indexedDbBackupCleanupEnabled: false,
    indexedDbBackupsEnabled: false,
    learnerProfileLifecycleEnabled: lifecycle,
    plusCheckoutEnabled: false,
    studyGuidanceEnabled: false,
    supabasePublishableKey: 'test-publishable-key',
    supabaseUrl: 'https://profile-access-test.supabase.co',
    youtubeApiKey
  })}`
}

async function installGoogleIdentityMock(page) {
  await page.addInitScript(() => {
    window.google = {
      accounts: {
        id: {
          initialize() {},
          renderButton(element) {
            const button = document.createElement('button')
            button.type = 'button'
            button.setAttribute('aria-label', 'Continue with Google')
            button.textContent = 'Continue with Google'
            element.replaceChildren(button)
          }
        }
      }
    }
  })
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

async function seedOwnedLearnerProfile(page) {
  const storedState = await seedPrivateLearnerProfile(page)
  await page.evaluate(({
    accessStorageKey,
    authStorageKey,
    ownerId,
    profileId,
    session
  }) => {
    localStorage.setItem(authStorageKey, JSON.stringify(session))
    localStorage.setItem(accessStorageKey, JSON.stringify({
      activatedAt: Date.now(),
      activationId: null,
      generation: 1,
      ownerId,
      profileId,
      revision: 3,
      version: 1
    }))
  }, {
    accessStorageKey: PROFILE_ACCESS_STORAGE_KEY,
    authStorageKey: AUTH_STORAGE_KEY,
    ownerId: OWNER_ID,
    profileId: OWNER_PROFILE_ID,
    session: restoredSession(OWNER_ID)
  })
  return storedState
}

test('a revoked activation fences an in-flight feed refresh completion', async ({
  page
}, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-standard')
  let releasePlaylist
  const playlistReleased = new Promise(resolve => {
    releasePlaylist = resolve
  })
  let playlistRequested
  const playlistStarted = new Promise(resolve => {
    playlistRequested = resolve
  })
  let profileEnvelope = null

  await page.route('**/config.local.js', route => route.fulfill({
    body: runtimeConfig({
      accountFeaturesRollout: 'internal',
      lifecycle: true,
      youtubeApiKey: 'fixture-key'
    }),
    contentType: 'text/javascript',
    status: 200
  }))
  await page.route('https://profile-access-test.supabase.co/**', route => {
    const pathname = new URL(route.request().url()).pathname
    if (pathname.endsWith('/rpc/resolve_my_learner_profile')) {
      return route.fulfill({
        json: [{
          created: false,
          envelope: profileEnvelope,
          generation: 1,
          profile_id: OWNER_PROFILE_ID,
          revision: 3,
          status: LEARNER_PROFILE_RESOLUTION_STATUSES.PROFILE_READY
        }],
        status: 200
      })
    }
    return route.fulfill({ json: {}, status: 200 })
  })
  await page.route('https://www.googleapis.com/youtube/v3/playlistItems?**', async route => {
    playlistRequested()
    await playlistReleased
    await route.fallback()
  })

  await page.goto('/?internal_test=1')
  await seedOwnedLearnerProfile(page)
  await page.evaluate(storageKey => {
    const state = JSON.parse(localStorage.getItem(storageKey))
    state.config.ankiEnabled = false
    state.config.ankiDisabledAt = '2026-08-27T00:00:00.000Z'
    state.config.channels[0].imageUrl = 'https://yt3.ggpht.com/fixture-channel.jpg'
    localStorage.setItem(storageKey, JSON.stringify(state))
  }, STATE_STORAGE_KEY)
  const seededProfile = await page.evaluate(
    storageKey => localStorage.getItem(storageKey),
    STATE_STORAGE_KEY
  )
  profileEnvelope = (
    await createPortableLearnerProfileEnvelope(JSON.parse(seededProfile))
  ).envelope

  await page.reload({ waitUntil: 'domcontentloaded' })
  await playlistStarted
  await expect(page.locator('html')).toHaveAttribute(
    'data-learner-profile-access-state',
    'active'
  )
  const activeProfile = await page.evaluate(
    storageKey => localStorage.getItem(storageKey),
    STATE_STORAGE_KEY
  )
  await page.evaluate(() => {
    window.__staleRefreshEvents = []
    window.EDENIA_ANALYTICS_ENABLED = true
    window.posthog = {
      capture(eventName, properties) {
        window.__staleRefreshEvents.push({ eventName, properties })
      },
      get_distinct_id() {
        return 'stale-refresh-regression'
      },
      setPersonProperties() {}
    }
    document.getElementById('accountSignOutBtn').click()
  })

  await expect(page.locator('html')).toHaveAttribute(
    'data-learner-profile-access-state',
    'locked'
  )
  await expect(page.getByText(SECRET_CHANNEL_NAME, { exact: true })).toHaveCount(0)
  const playlistResponse = page.waitForResponse(response => (
    response.url().includes('/youtube/v3/playlistItems?')
  ))
  releasePlaylist()
  await playlistResponse
  await page.evaluate(() => new Promise(resolve => {
    window.requestAnimationFrame(() => window.requestAnimationFrame(resolve))
  }))
  await expect(page.locator('html')).toHaveAttribute(
    'data-learner-profile-access-state',
    'locked'
  )
  await expect(page.getByText(SECRET_CHANNEL_NAME, { exact: true })).toHaveCount(0)
  await expect(page.locator('#toast')).not.toHaveClass(/\bshow\b/)
  expect(await page.evaluate(storageKey => (
    localStorage.getItem(storageKey)
  ), STATE_STORAGE_KEY)).toBe(activeProfile)
  expect(await page.evaluate(() => (
    window.__staleRefreshEvents.filter(event => (
      event.eventName === 'refresh_completed'
    ))
  ))).toEqual([])
})

test('a revoked activation fences an in-flight added-channel refresh completion', async ({
  page
}, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-standard')
  let releasePlaylist
  const playlistReleased = new Promise(resolve => {
    releasePlaylist = resolve
  })
  let playlistRequested
  const playlistStarted = new Promise(resolve => {
    playlistRequested = resolve
  })
  let profileEnvelope = null

  await page.route('**/config.local.js', route => route.fulfill({
    body: runtimeConfig({
      accountFeaturesRollout: 'internal',
      lifecycle: true,
      youtubeApiKey: 'fixture-key'
    }),
    contentType: 'text/javascript',
    status: 200
  }))
  await page.route('https://profile-access-test.supabase.co/**', route => {
    const pathname = new URL(route.request().url()).pathname
    if (pathname.endsWith('/rpc/resolve_my_learner_profile')) {
      return route.fulfill({
        json: [{
          created: false,
          envelope: profileEnvelope,
          generation: 1,
          profile_id: OWNER_PROFILE_ID,
          revision: 3,
          status: LEARNER_PROFILE_RESOLUTION_STATUSES.PROFILE_READY
        }],
        status: 200
      })
    }
    return route.fulfill({ json: {}, status: 200 })
  })
  await page.route('https://www.googleapis.com/youtube/v3/playlistItems?**', async route => {
    playlistRequested()
    await playlistReleased
    await route.fallback()
  })

  await page.goto('/?internal_test=1')
  await seedOwnedLearnerProfile(page)
  await page.evaluate(storageKey => {
    const state = JSON.parse(localStorage.getItem(storageKey))
    state.config.ankiEnabled = false
    state.config.ankiDisabledAt = '2026-08-27T00:00:00.000Z'
    state.config.channels = []
    localStorage.setItem(storageKey, JSON.stringify(state))
  }, STATE_STORAGE_KEY)
  const seededProfile = await page.evaluate(
    storageKey => localStorage.getItem(storageKey),
    STATE_STORAGE_KEY
  )
  profileEnvelope = (
    await createPortableLearnerProfileEnvelope(JSON.parse(seededProfile))
  ).envelope

  await page.reload({ waitUntil: 'domcontentloaded' })
  await expect(page.locator('html')).toHaveAttribute(
    'data-learner-profile-access-state',
    'active'
  )
  await page.evaluate(() => {
    window.__staleAddedChannelEvents = []
    window.EDENIA_ANALYTICS_ENABLED = true
    window.posthog = {
      capture(eventName, properties) {
        window.__staleAddedChannelEvents.push({ eventName, properties })
      },
      get_distinct_id() {
        return 'stale-added-channel-regression'
      },
      setPersonProperties() {}
    }
  })
  await page.locator('#manualVideoBtn').click()
  await page.locator('#manualVideoUrlInput').fill(
    'https://www.youtube.com/watch?v=fixture0001'
  )
  await page.locator('#manualVideoUrlInput').press('Enter')
  await playlistStarted
  const activeProfile = await page.evaluate(
    storageKey => localStorage.getItem(storageKey),
    STATE_STORAGE_KEY
  )
  await page.evaluate(() => {
    window.__staleAddedChannelEvents.length = 0
    document.getElementById('accountSignOutBtn').click()
  })

  await expect(page.locator('html')).toHaveAttribute(
    'data-learner-profile-access-state',
    'locked'
  )
  const playlistResponse = page.waitForResponse(response => (
    response.url().includes('/youtube/v3/playlistItems?')
  ))
  releasePlaylist()
  await playlistResponse
  await page.waitForTimeout(2_500)

  await expect(page.locator('html')).toHaveAttribute(
    'data-learner-profile-access-state',
    'locked'
  )
  await expect(page.locator('#mainApp')).toBeHidden()
  await expect(page.locator('#toast')).not.toHaveClass(/\bshow\b/)
  expect(await page.evaluate(storageKey => (
    localStorage.getItem(storageKey)
  ), STATE_STORAGE_KEY)).toBe(activeProfile)
  expect(await page.evaluate(() => (
    window.__staleAddedChannelEvents.filter(event => (
      event.eventName === 'refresh_completed'
      && event.properties.trigger === 'channel_added'
    ))
  ))).toEqual([])
})

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

test('matching restored progress repairs reset bookkeeping without asking the learner', async ({
  page
}, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-standard')
  let lifecycleEnabled = false
  let profileEnvelope = null
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
        json: [{
          created: false,
          envelope: profileEnvelope,
          generation: 2,
          profile_id: OWNER_PROFILE_ID,
          revision: 4,
          status: LEARNER_PROFILE_RESOLUTION_STATUSES.PROFILE_READY
        }],
        status: 200
      })
    }
    if (pathname.endsWith('/rpc/read_my_latest_learner_profile_reset')) {
      return route.fulfill({
        json: [{
          prior_envelope: null,
          prior_generation: 1,
          prior_revision: 3,
          profile_id: OWNER_PROFILE_ID,
          protected_until: '2026-09-21T00:00:00.000Z',
          reset_generation: 2,
          reset_id: '523e4567-e89b-42d3-a456-426614174004',
          status: 'undone'
        }],
        status: 200
      })
    }
    return route.fulfill({ json: {}, status: 200 })
  })

  await page.goto('/?internal_test=1')
  await seedOwnedLearnerProfile(page)
  const storedState = await page.evaluate(stateStorageKey => {
    const state = JSON.parse(localStorage.getItem(stateStorageKey))
    state.config.ankiEnabled = false
    state.config.ankiDisabledAt = '2026-08-27T00:00:00.000Z'
    const serialized = JSON.stringify(state)
    localStorage.setItem(stateStorageKey, serialized)
    return serialized
  }, STATE_STORAGE_KEY)
  profileEnvelope = (
    await createPortableLearnerProfileEnvelope(JSON.parse(storedState))
  ).envelope
  await page.evaluate(({
    accessStorageKey,
    dirtyStorageKey,
    ownerId,
    profileId,
    syncStorageKey
  }) => {
    const access = JSON.parse(localStorage.getItem(accessStorageKey))
    access.generation = 2
    access.revision = 4
    localStorage.setItem(accessStorageKey, JSON.stringify(access))
    localStorage.setItem(syncStorageKey, JSON.stringify({
      acceptedRevision: 3,
      generation: 1,
      ownerId,
      pending: null,
      profileId,
      queued: null,
      version: 1
    }))
    localStorage.setItem(dirtyStorageKey, JSON.stringify({
      generation: 2,
      ownerId,
      profileId,
      version: 1
    }))
  }, {
    accessStorageKey: PROFILE_ACCESS_STORAGE_KEY,
    dirtyStorageKey: `${PROFILE_SYNC_STORAGE_KEY}_dirty`,
    ownerId: OWNER_ID,
    profileId: OWNER_PROFILE_ID,
    syncStorageKey: PROFILE_SYNC_STORAGE_KEY
  })
  lifecycleEnabled = true
  await page.reload({ waitUntil: 'domcontentloaded' })

  await expect(page.locator('html')).toHaveAttribute(
    'data-learner-profile-access-state',
    'active'
  )
  await expect(page.locator('#mainApp')).toBeVisible()
  await expect(page.locator('#learnerProfileAccessGate')).toBeHidden()
  expect(await page.evaluate(({
    dirtyStorageKey,
    stateStorageKey,
    syncStorageKey
  }) => ({
    channels: JSON.parse(localStorage.getItem(stateStorageKey))
      .config.channels.map(channel => channel.name),
    dirty: localStorage.getItem(dirtyStorageKey),
    sync: JSON.parse(localStorage.getItem(syncStorageKey))
  }), {
    dirtyStorageKey: `${PROFILE_SYNC_STORAGE_KEY}_dirty`,
    stateStorageKey: STATE_STORAGE_KEY,
    syncStorageKey: PROFILE_SYNC_STORAGE_KEY
  })).toEqual({
    channels: [SECRET_CHANNEL_NAME],
    dirty: null,
    sync: {
      acceptedRevision: 4,
      generation: 2,
      ownerId: OWNER_ID,
      pending: null,
      profileId: OWNER_PROFILE_ID,
      queued: null,
      version: 1
    }
  })
})

test('matching cloud progress repairs an obsolete profile identity without asking the learner', async ({
  page
}, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-standard')
  let lifecycleEnabled = false
  let profileEnvelope = null
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
        json: [{
          created: false,
          envelope: profileEnvelope,
          generation: 1,
          profile_id: OTHER_OWNER_PROFILE_ID,
          revision: 5,
          status: LEARNER_PROFILE_RESOLUTION_STATUSES.PROFILE_READY
        }],
        status: 200
      })
    }
    return route.fulfill({ json: {}, status: 200 })
  })

  await page.goto('/?internal_test=1')
  const storedState = await seedOwnedLearnerProfile(page)
  profileEnvelope = (
    await createPortableLearnerProfileEnvelope(JSON.parse(storedState))
  ).envelope
  await page.evaluate(({
    accessStorageKey,
    dirtyStorageKey,
    nextProfileId,
    ownerId,
    previousProfileId,
    syncStorageKey
  }) => {
    const access = JSON.parse(localStorage.getItem(accessStorageKey))
    access.profileId = nextProfileId
    access.revision = 5
    localStorage.setItem(accessStorageKey, JSON.stringify(access))
    localStorage.setItem(syncStorageKey, JSON.stringify({
      acceptedRevision: 18,
      generation: 6,
      ownerId,
      pending: null,
      profileId: previousProfileId,
      queued: null,
      version: 1
    }))
    localStorage.setItem(dirtyStorageKey, JSON.stringify({
      generation: 6,
      ownerId,
      profileId: previousProfileId,
      version: 1
    }))
  }, {
    accessStorageKey: PROFILE_ACCESS_STORAGE_KEY,
    dirtyStorageKey: `${PROFILE_SYNC_STORAGE_KEY}_dirty`,
    nextProfileId: OTHER_OWNER_PROFILE_ID,
    ownerId: OWNER_ID,
    previousProfileId: OWNER_PROFILE_ID,
    syncStorageKey: PROFILE_SYNC_STORAGE_KEY
  })
  lifecycleEnabled = true
  await page.reload({ waitUntil: 'domcontentloaded' })

  await expect(page.locator('html')).toHaveAttribute(
    'data-learner-profile-access-state',
    'active'
  )
  await expect(page.locator('#mainApp')).toBeVisible()
  await expect(page.locator('#learnerProfileAccessGate')).toBeHidden()
  expect(await page.evaluate(({
    dirtyStorageKey,
    syncStorageKey
  }) => ({
    dirty: localStorage.getItem(dirtyStorageKey),
    sync: (({
      acceptedRevision,
      generation,
      ownerId,
      profileId,
      version
    }) => ({
      acceptedRevision,
      generation,
      ownerId,
      profileId,
      version
    }))(JSON.parse(localStorage.getItem(syncStorageKey)))
  }), {
    dirtyStorageKey: `${PROFILE_SYNC_STORAGE_KEY}_dirty`,
    syncStorageKey: PROFILE_SYNC_STORAGE_KEY
  })).toEqual({
    dirty: null,
    sync: {
      acceptedRevision: 5,
      generation: 1,
      ownerId: OWNER_ID,
      profileId: OTHER_OWNER_PROFILE_ID,
      version: 1
    }
  })
})

test('a signed-out owner can authenticate from locked access before cloud activation', async ({
  page
}, testInfo) => {
  test.skip(![
    'desktop-standard',
    'tablet-portrait',
    'phone-small'
  ].includes(testInfo.project.name))
  let lifecycleEnabled = false
  let profileEnvelope = null
  let releaseResolution = null
  let resolutionCount = 0
  const resolutionBarrier = new Promise(resolve => {
    releaseResolution = resolve
  })
  await installGoogleIdentityMock(page)
  await useAccountReturnOrigin(page)
  await page.route('**/config.local.js', route => route.fulfill({
    body: runtimeConfig({
      accountFeaturesRollout: lifecycleEnabled ? 'internal' : 'off',
      googleIdentityClientId: '1234567890-test.apps.googleusercontent.com',
      lifecycle: lifecycleEnabled
    }),
    contentType: 'text/javascript',
    status: 200
  }))
  await page.route('https://profile-access-test.supabase.co/**', async route => {
    const pathname = new URL(route.request().url()).pathname
    if (pathname === '/auth/v1/otp') {
      await route.fulfill({ json: {}, status: 200 })
      return
    }
    if (pathname === '/auth/v1/verify') {
      await route.fulfill({ json: restoredSession(OWNER_ID), status: 200 })
      return
    }
    if (pathname.endsWith('/rpc/resolve_my_learner_profile')) {
      resolutionCount += 1
      await resolutionBarrier
      await route.fulfill({
        json: [{
          created: false,
          envelope: profileEnvelope,
          generation: 1,
          profile_id: OWNER_PROFILE_ID,
          revision: 3,
          status: LEARNER_PROFILE_RESOLUTION_STATUSES.PROFILE_READY
        }],
        status: 200
      })
      return
    }
    await route.fulfill({ json: {}, status: 200 })
  })

  await page.goto(`${ACCOUNT_RETURN_ORIGIN}/?internal_test=1`)
  const storedState = await seedOwnedLearnerProfile(page)
  profileEnvelope = (
    await createPortableLearnerProfileEnvelope(JSON.parse(storedState))
  ).envelope
  await page.evaluate(authStorageKey => {
    localStorage.removeItem(authStorageKey)
  }, AUTH_STORAGE_KEY)
  lifecycleEnabled = true
  await page.reload({ waitUntil: 'domcontentloaded' })

  try {
    await expectNeutralProfileGate(page, 'locked', storedState)
    await expect(page.locator('#learnerProfileAccessTitle')).toHaveText(
      'Welcome back — sign in to continue your town.'
    )

    if (testInfo.project.name === 'desktop-standard') {
      for (const [locale, copy] of Object.entries(
        GUARDED_AUTHENTICATION_COPY
      )) {
        await page.evaluate(({ configCookieKey, locale }) => {
          document.cookie = `${configCookieKey}=${encodeURIComponent(
            JSON.stringify({ locale })
          )}; path=/`
        }, { configCookieKey: CONFIG_COOKIE_KEY, locale })
        await page.reload({ waitUntil: 'domcontentloaded' })
        await expectNeutralProfileGate(page, 'locked', storedState)
        await page.locator('#learnerProfileAccessOpenSignIn').click()
        const localizedAuthentication = page.locator(
          '#learnerProfileAccessAuthentication'
        )
        await expect(localizedAuthentication).toBeVisible()
        await expect(page.locator(
          '#learnerProfileAccessAuthenticationTitle'
        )).toHaveText(copy.title)
        await expect(page.locator(
          '#learnerProfileAccessAuthenticationBody'
        )).toHaveText(copy.body)
        await expect(page.locator(
          '#learnerProfileAccessAuthenticationStatus'
        )).toHaveText(copy.status)
        await expect(localizedAuthentication.locator(
          '[data-profile-access-action="close-sign-in"]'
        )).toHaveText(copy.back)
        expect(await page.evaluate(() => ({
          card: document.querySelector('.learner-profile-access-card')
            ?.scrollWidth > document.querySelector('.learner-profile-access-card')
              ?.clientWidth,
          document: document.documentElement.scrollWidth
            > document.documentElement.clientWidth
        }))).toEqual({ card: false, document: false })
        await localizedAuthentication.locator(
          '[data-profile-access-action="close-sign-in"]'
        ).click()
      }
      await page.evaluate(configCookieKey => {
        document.cookie = `${configCookieKey}=${encodeURIComponent(
          JSON.stringify({ locale: 'en' })
        )}; path=/`
      }, CONFIG_COOKIE_KEY)
      await page.reload({ waitUntil: 'domcontentloaded' })
      await expectNeutralProfileGate(page, 'locked', storedState)
    }

    const openSignIn = page.getByRole('button', { name: 'Open sign-in' })
    await expect(openSignIn).toBeVisible()
    await openSignIn.focus()
    await expect(openSignIn).toBeFocused()
    await openSignIn.press('Enter')

    await expect(page.locator('#learnerProfileAccessGate')).toBeVisible()
    await expect(page.locator('#settingsPanel')).toBeHidden()
    const guardedSignIn = page.locator('#learnerProfileAccessAuthentication')
    await expect(guardedSignIn).toBeVisible()
    await expect(guardedSignIn.getByRole('heading', {
      name: 'Sign in to unlock your profile'
    })).toBeVisible()
    await expect(guardedSignIn).toContainText(
      'Use the account that owns this learner profile.'
    )
    await expect(page.locator(
      '#learnerProfileAccessAuthenticationStatus'
    )).toHaveText(
      'Your learner profile stays hidden until ownership checks succeed.'
    )
    await expect(page.locator(
      '.learner-profile-access-card > .legacy-progress-migration-brand'
    )).toHaveCSS('text-align', 'center')
    expect(await page.evaluate(() => ({
      card: document.querySelector('.learner-profile-access-card')
        ?.scrollWidth > document.querySelector('.learner-profile-access-card')
          ?.clientWidth,
      document: document.documentElement.scrollWidth
        > document.documentElement.clientWidth
    }))).toEqual({ card: false, document: false })
    const googleSignIn = page.locator('#accountGoogleIdentityButton button')
    await expect(googleSignIn).toBeVisible()
    await expect(googleSignIn).toHaveAccessibleName(
      'Continue with Google'
    )
    await expect(page.locator('#accountEmail')).toBeFocused()

    await guardedSignIn.getByRole('button', {
      name: 'Back to locked message'
    }).click()
    await expect(guardedSignIn).toBeHidden()
    await expect(page.locator('#learnerProfileAccessTitle')).toBeVisible()
    await expect(openSignIn).toBeFocused()
    await openSignIn.press('Enter')
    await expect(page.locator('#accountEmail')).toBeFocused()

    await page.locator('#accountEmail').fill('owner@example.com')
    await page.getByRole('button', { name: 'Email me a code' }).click()
    await page.locator('#accountEmailCode').fill('123456')
    await page.getByRole('button', { name: 'Verify code' }).click()

    await expect.poll(() => resolutionCount).toBe(1)
    await expect(page.locator('#settingsPanel')).toBeHidden()
    await expectNeutralProfileGate(page, 'waiting-cloud', storedState)
    await expect(page.locator('#learnerProfileAccessTitle')).toHaveText(
      'Opening your progress…'
    )
    await expect(page.locator('#learnerProfileAccessBody')).toBeHidden()
    await expect(page.locator('#learnerProfileAccessStatus')).toBeHidden()
    await expect(page.locator('#learnerProfileAccessRetry')).toBeHidden()
    await expect(page.locator('#learnerProfileAccessSignOut')).toBeHidden()
    await expect(page.locator('#learnerProfileAccessGate')).toBeFocused()

    releaseResolution()
    await expect(page.locator('#mainApp')).toBeVisible()
    await expect(page.locator('#learnerProfileAccessGate')).toBeHidden()
    await expect(page.locator('#mainApp')).toBeFocused()
    await expect(page.locator('html')).toHaveAttribute(
      'data-learner-profile-access-state',
      'active'
    )
    await expect.poll(() => page.evaluate(key => (
      JSON.parse(localStorage.getItem(key)).config.channels.map(
        channel => channel.name
      )
    ), STATE_STORAGE_KEY)).toContain(SECRET_CHANNEL_NAME)
  } finally {
    releaseResolution()
  }
})

test('a missing cloud head offers neutral local and protected recovery copies', async ({
  page
}, testInfo) => {
  test.skip(!['desktop-standard', 'phone-small'].includes(testInfo.project.name))
  let lifecycleEnabled = false
  let protectedEnvelope = null
  let restored = false
  const protectedCandidateId = '523e4567-e89b-42d3-a456-426614174004'
  const protectedUntil = '2026-09-21T00:00:00.000Z'
  const restoreRequests = []
  let protectedReads = 0
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
        json: [restored ? {
          created: false,
          envelope: protectedEnvelope,
          generation: 1,
          profile_id: OWNER_PROFILE_ID,
          revision: 8,
          status: LEARNER_PROFILE_RESOLUTION_STATUSES.PROFILE_READY
        } : {
          created: false,
          envelope: null,
          generation: null,
          profile_id: null,
          revision: null,
          status: LEARNER_PROFILE_RESOLUTION_STATUSES.CURRENT_HEAD_MISSING
        }],
        status: 200
      })
    }
    if (pathname.endsWith('/rpc/list_my_learner_profile_recovery_candidates')) {
      return route.fulfill({
        json: [{
          candidate_id: protectedCandidateId,
          protected_until: protectedUntil,
          source: 'protected'
        }],
        status: 200
      })
    }
    if (pathname.endsWith('/rpc/read_my_learner_profile_recovery_candidate')) {
      protectedReads += 1
      return route.fulfill({
        json: [{
          candidate_id: protectedCandidateId,
          envelope: protectedEnvelope,
          protected_until: protectedUntil,
          status: 'available'
        }],
        status: 200
      })
    }
    if (pathname.endsWith('/rpc/restore_my_learner_profile')) {
      restoreRequests.push(route.request().postDataJSON())
      restored = true
      return route.fulfill({
        json: [{
          envelope: protectedEnvelope,
          generation: 1,
          profile_id: OWNER_PROFILE_ID,
          protected_until: protectedUntil,
          revision: 8,
          status: 'restored'
        }],
        status: 200
      })
    }
    return route.fulfill({ json: {}, status: 200 })
  })

  await page.goto('/?internal_test=1')
  const storedState = await seedOwnedLearnerProfile(page)
  const protectedProfile = structuredClone(JSON.parse(storedState))
  protectedProfile.config.channels = [{
    id: 'protected-channel',
    image: '',
    language: 'Mandarin',
    name: NEXT_OWNER_CHANNEL_NAME
  }]
  protectedEnvelope = (
    await createPortableLearnerProfileEnvelope(protectedProfile)
  ).envelope
  lifecycleEnabled = true
  await page.reload({ waitUntil: 'domcontentloaded' })

  await expectNeutralProfileGate(page, 'recovering', storedState)
  await expect(page.locator('#learnerProfileAccessTitle')).toHaveText(
    'Choose a recovery copy'
  )
  const recoveryItems = page.locator('#learnerProfileRecoveryList li')
  await expect(recoveryItems).toHaveCount(2)
  const localItem = recoveryItems.filter({
    hasText: 'This device has a learner profile verified for the signed-in account.'
  })
  const protectedItem = recoveryItems.filter({
    hasText: 'A protected cloud progress snapshot is available until'
  })
  await expect(localItem).toHaveCount(1)
  await expect(protectedItem).toHaveCount(1)
  await expect(page.locator('body')).not.toContainText(OWNER_ID)
  await expect(page.locator('body')).not.toContainText(OTHER_OWNER_ID)
  await expect(page.locator('body')).not.toContainText(NEXT_OWNER_CHANNEL_NAME)
  expect(await page.evaluate(() => (
    document.documentElement.scrollWidth
      <= document.documentElement.clientWidth
  ))).toBe(true)

  const localDownloadPromise = page.waitForEvent('download')
  await localItem.getByRole('button', { name: 'Export this copy' }).click()
  const localDownload = await localDownloadPromise
  expect(localDownload.suggestedFilename()).toMatch(
    /^edenia-sync-this-device-\d{4}-\d{2}-\d{2}\.json$/
  )

  const protectedDownloadPromise = page.waitForEvent('download')
  await protectedItem.getByRole('button', { name: 'Export this copy' }).click()
  const protectedDownload = await protectedDownloadPromise
  expect(protectedDownload.suggestedFilename()).toMatch(
    /^edenia-sync-cloud-\d{4}-\d{2}-\d{2}\.json$/
  )
  expect(protectedReads).toBe(1)

  await protectedItem.getByRole('button', {
    name: 'Restore this copy'
  }).click()
  await expect(page.locator('#mainApp')).toBeVisible()
  await expect.poll(() => page.evaluate(key => (
    JSON.parse(localStorage.getItem(key)).config.channels.map(
      channel => channel.name
    )
  ), STATE_STORAGE_KEY)).toContain(NEXT_OWNER_CHANNEL_NAME)
  expect(restoreRequests).toHaveLength(2)
  expect(restoreRequests[1]).toEqual(restoreRequests[0])
  expect(restoreRequests[0]).toMatchObject({
    p_candidate_id: protectedCandidateId,
    p_confirmed: true,
    p_envelope: null,
    p_generation: null,
    p_profile_id: null,
    p_revision: null,
    p_source: 'protected'
  })
})

test('failed unusable-head restoration keeps recovery export and retry available', async ({
  page
}, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-standard')
  let lifecycleEnabled = false
  let restoreAttempts = 0
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
        json: [{
          created: false,
          envelope: null,
          generation: null,
          profile_id: null,
          revision: null,
          status: LEARNER_PROFILE_RESOLUTION_STATUSES.CURRENT_HEAD_UNUSABLE
        }],
        status: 200
      })
    }
    if (pathname.endsWith('/rpc/list_my_learner_profile_recovery_candidates')) {
      return route.fulfill({ json: [], status: 200 })
    }
    if (pathname.endsWith('/rpc/restore_my_learner_profile')) {
      restoreAttempts += 1
      return route.fulfill({
        json: [{
          envelope: null,
          generation: null,
          profile_id: null,
          protected_until: null,
          revision: null,
          status: 'recovery_required'
        }],
        status: 200
      })
    }
    return route.fulfill({ json: {}, status: 200 })
  })

  await page.goto('/?internal_test=1')
  const storedState = await seedOwnedLearnerProfile(page)
  lifecycleEnabled = true
  await page.reload({ waitUntil: 'domcontentloaded' })

  await expectNeutralProfileGate(page, 'recovering', storedState)
  await expect(page.locator('#learnerProfileAccessBody')).toHaveText(
    'Edenia could not safely read the current cloud progress snapshot. Restore or export one of the trusted copies below.'
  )
  const localItem = page.locator('#learnerProfileRecoveryList li').filter({
    hasText: 'This device has a learner profile verified for the signed-in account.'
  })
  const restore = localItem.getByRole('button', { name: 'Restore this copy' })
  await restore.click()
  await expect(page.locator('#learnerProfileRecoveryFeedback')).toHaveText(
    'Edenia could not restore that copy. Nothing was replaced, and the recovery copies remain available.'
  )
  await expect(localItem.getByRole('button', {
    name: 'Export this copy'
  })).toBeVisible()
  await expect(restore).toBeVisible()
  expect(await page.evaluate(key => localStorage.getItem(key), STATE_STORAGE_KEY))
    .toBe(storedState)

  await restore.click()
  await expect.poll(() => restoreAttempts).toBe(2)
})

test('missing-head history with no usable copy stays guarded', async ({
  page
}, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-standard')
  let lifecycleEnabled = false
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
        json: [{
          created: false,
          envelope: null,
          generation: null,
          profile_id: null,
          revision: null,
          status: LEARNER_PROFILE_RESOLUTION_STATUSES.CURRENT_HEAD_MISSING
        }],
        status: 200
      })
    }
    if (pathname.endsWith('/rpc/list_my_learner_profile_recovery_candidates')) {
      return route.fulfill({ json: [], status: 200 })
    }
    return route.fulfill({ json: {}, status: 200 })
  })

  await page.goto('/?internal_test=1')
  await page.evaluate(({
    accessStorageKey,
    authStorageKey,
    session,
    stateStorageKey
  }) => {
    localStorage.removeItem(accessStorageKey)
    localStorage.removeItem(stateStorageKey)
    localStorage.setItem(authStorageKey, JSON.stringify(session))
  }, {
    accessStorageKey: PROFILE_ACCESS_STORAGE_KEY,
    authStorageKey: AUTH_STORAGE_KEY,
    session: restoredSession(OWNER_ID),
    stateStorageKey: STATE_STORAGE_KEY
  })
  lifecycleEnabled = true
  await page.reload({ waitUntil: 'domcontentloaded' })

  await expect(page.locator('html')).toHaveAttribute(
    'data-learner-profile-access-state',
    'recovering'
  )
  await expect(page.locator('#mainApp')).toBeHidden()
  await expect(page.locator('#learnerProfileRecoveryList li')).toHaveCount(0)
  await expect(page.locator('#learnerProfileRecoveryEmpty')).toHaveText(
    'No trusted recovery copy is available yet. Try again or sign out.'
  )
  await expect(page.getByRole('button', { name: 'Try again' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Sign out' })).toBeVisible()
})

test('generic recovery gives the learner a retry and sign-out path', async ({
  page
}, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-standard')
  let lifecycleEnabled = false
  let resolutionCount = 0
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
        json: [],
        status: 200
      })
    }
    return route.fulfill({ json: {}, status: 200 })
  })

  await page.goto('/?internal_test=1')
  const storedState = await seedOwnedLearnerProfile(page)
  lifecycleEnabled = true
  await page.reload({ waitUntil: 'domcontentloaded' })

  await expectNeutralProfileGate(page, 'recovering', storedState)
  await expect(page.locator('#learnerProfileAccessTitle')).toHaveText(
    'We need to check your progress'
  )
  await expect(page.locator('#learnerProfileAccessBody')).toHaveText(
    'Edenia could not open your progress yet. Your saved copies are safe. Try again or sign out.'
  )
  await expect(page.getByRole('button', { name: 'Try again' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Sign out' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Continue' })).toHaveCount(0)
  expect(resolutionCount).toBeGreaterThan(0)

  await page.getByRole('button', { name: 'Sign out' }).click()
  await expect(page.locator('html')).toHaveAttribute(
    'data-learner-profile-access-state',
    'locked'
  )
  expect(await page.evaluate(key => localStorage.getItem(key), STATE_STORAGE_KEY))
    .toBe(storedState)
})

test('localhost visual recovery switch opens the generic recovery gate', async ({
  page
}, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-standard')
  await page.route('**/config.local.js', route => route.fulfill({
    body: runtimeConfig({
      accountFeaturesRollout: 'internal',
      lifecycle: true
    }),
    contentType: 'text/javascript',
    status: 200
  }))
  await page.route('https://profile-access-test.supabase.co/**', route => (
    route.fulfill({ json: {}, status: 200 })
  ))

  await page.goto('/?internal_test=1&profile_access_test=recovering')

  await expectNeutralProfileGate(page, 'recovering', null)
  await expect(page.locator('#learnerProfileAccessTitle')).toHaveText(
    'We need to check your progress'
  )
  await expect(page.locator('#learnerProfileAccessBody')).toHaveText(
    'Edenia could not open your progress yet. Your saved copies are safe. Try again or sign out.'
  )
  await expect(page.getByRole('button', { name: 'Try again' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Sign out' })).toBeVisible()
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

test('same-page sign-out removes rendered learner content before locking access', async ({
  page
}, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-standard')
  let lifecycleEnabled = false
  await page.route('**/config.local.js', route => route.fulfill({
    body: runtimeConfig({
      accountFeaturesRollout: lifecycleEnabled ? 'internal' : 'off',
      lifecycle: lifecycleEnabled
    }),
    contentType: 'text/javascript',
    status: 200
  }))

  await page.goto('/?internal_test=1')
  const privateProfile = JSON.parse(await seedPrivateLearnerProfile(page))
  privateProfile.activityLog = [{
    actor: 'user',
    createdAt: '2026-08-27T00:00:00.000Z',
    detail: '',
    id: 'private-learner-activity',
    status: 'info',
    title: SECRET_ACTIVITY_TITLE,
    type: 'general'
  }]
  const storedState = JSON.stringify(privateProfile)
  await page.goto('about:blank')

  await page.addInitScript(() => {
    Object.defineProperty(window.navigator, 'onLine', {
      configurable: true,
      get: () => false
    })
  })
  await page.addInitScript(({
    accessStorageKey,
    authStorageKey,
    ownerId,
    session,
    stateStorageKey,
    storedState
  }) => {
    localStorage.setItem(stateStorageKey, storedState)
    localStorage.setItem(authStorageKey, JSON.stringify(session))
    localStorage.setItem(accessStorageKey, JSON.stringify({
      activatedAt: Date.now(),
      activationId: null,
      ownerId,
      profileId: `owner:${ownerId}`,
      version: 1
    }))
  }, {
    accessStorageKey: PROFILE_ACCESS_STORAGE_KEY,
    authStorageKey: AUTH_STORAGE_KEY,
    ownerId: OWNER_ID,
    session: restoredSession(OWNER_ID),
    stateStorageKey: STATE_STORAGE_KEY,
    storedState
  })
  await page.route(
    'https://profile-access-test.supabase.co/**',
    route => route.fulfill({ json: {}, status: 200 })
  )
  lifecycleEnabled = true
  await page.goto('/?internal_test=1', { waitUntil: 'domcontentloaded' })

  await expect(page.locator('html')).toHaveAttribute(
    'data-learner-profile-access-state',
    'active'
  )
  await expect(page.locator('#mainApp')).toBeVisible()
  await page.locator('.gear-btn').click()
  await expect(page.locator('#settingsPanel')).toBeVisible()
  await expect(page.locator('body')).toContainText(SECRET_ACTIVITY_TITLE)
  const accountToggle = page.locator('.settings-account-toggle')
  if (await accountToggle.getAttribute('aria-expanded') === 'false') {
    await accountToggle.click()
  }
  const storedStateBeforeSignOut = await page.evaluate(
    stateStorageKey => localStorage.getItem(stateStorageKey),
    STATE_STORAGE_KEY
  )
  await page.locator('#accountSignOutBtn').click()

  await expectNeutralProfileGate(page, 'locked', storedStateBeforeSignOut)
  await expect(page.locator('body')).not.toContainText(SECRET_ACTIVITY_TITLE)
  await expect(page.locator('#settingsPanel')).toBeHidden()
  await expect(page.locator('#accountSignOutBtn')).toBeHidden()
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

test('a different new account starts onboarding without exposing or replacing the synchronized browser copy', async ({
  page
}, testInfo) => {
  test.skip(!['desktop-standard', 'phone-small'].includes(testInfo.project.name))
  let lifecycleEnabled = false
  let newOwnerEnvelope = null
  let resolutionCount = 0
  await page.route('**/config.local.js', route => route.fulfill({
    body: runtimeConfig({
      accountFeaturesRollout: lifecycleEnabled ? 'internal' : 'off',
      lifecycle: lifecycleEnabled,
      youtubeApiKey: 'fixture-key'
    }),
    contentType: 'text/javascript',
    status: 200
  }))
  await page.route('https://www.googleapis.com/youtube/v3/**', route => {
    const endpoint = new URL(route.request().url()).pathname.split('/').at(-1)
    return route.fulfill({
      json: youtubeFixtures[endpoint],
      status: 200
    })
  })
  await page.route('https://profile-access-test.supabase.co/**', route => {
    const pathname = new URL(route.request().url()).pathname
    if (pathname.endsWith('/rpc/resolve_my_learner_profile')) {
      resolutionCount += 1
      const onboardingEnvelope = route.request().postDataJSON()
        ?.p_onboarding_profile || null
      if (onboardingEnvelope) newOwnerEnvelope = onboardingEnvelope
      if (newOwnerEnvelope) {
        return route.fulfill({
          json: [{
            created: Boolean(onboardingEnvelope),
            envelope: newOwnerEnvelope,
            generation: 1,
            profile_id: OTHER_OWNER_PROFILE_ID,
            revision: 1,
            status: LEARNER_PROFILE_RESOLUTION_STATUSES.PROFILE_READY
          }],
          status: 200
        })
      }
      return route.fulfill({
        json: [{
          created: false,
          envelope: null,
          generation: null,
          profile_id: null,
          revision: null,
          status: LEARNER_PROFILE_RESOLUTION_STATUSES.ONBOARDING_REQUIRED
        }],
        status: 200
      })
    }
    return route.fulfill({ json: {}, status: 200 })
  })

  await page.goto('/?internal_test=1')
  const storedState = await seedOwnerChangeStorage(page, {
    accountStudyOwner: false,
    pending: false
  })
  lifecycleEnabled = true
  await page.reload({ waitUntil: 'domcontentloaded' })

  await expect(page.locator('html')).toHaveAttribute(
    'data-learner-profile-access-state',
    'account-change'
  )
  await page.getByRole('button', {
    name: 'Continue with this account'
  }).click()

  await expect(page.locator('html')).toHaveAttribute(
    'data-learner-profile-access-state',
    'onboarding-required'
  )
  await expect(page.locator('#learnerProfileAccessGate')).toBeHidden()
  await expect(page.locator('#introTrailer')).toBeVisible()
  await expect(page.locator('#mainApp')).toBeHidden()
  await expect(page.locator('body')).not.toContainText(SECRET_CHANNEL_NAME)
  const storage = await page.evaluate(({
    draftKey,
    stateKey
  }) => ({
    draft: JSON.parse(localStorage.getItem(draftKey)),
    state: localStorage.getItem(stateKey)
  }), {
    draftKey: ONBOARDING_DRAFT_STORAGE_KEY,
    stateKey: STATE_STORAGE_KEY
  })
  expect(storage.state).toBe(storedState)
  expect(storage.draft).toMatchObject({
    languageId: null,
    levelId: null,
    selectedChannelCatalogIds: [],
    version: 1
  })
  expect(resolutionCount).toBe(1)

  await page.getByRole('button', { name: 'Skip intro' }).click()
  await page.locator('[data-language-id="mandarin"]').click()
  await page.locator(
    '[data-personalized-onboarding-action="continue-language"]'
  ).click()
  await page.locator('[data-level-id="starting"]').click()
  await page.locator(
    '[data-personalized-onboarding-step="channels"]'
  ).click()
  await page.locator(
    '[data-personalized-onboarding-step="account"]'
  ).click()

  await expect(page.locator('#mainApp')).toBeVisible()
  await expect(page.locator('html')).toHaveAttribute(
    'data-learner-profile-access-state',
    'active'
  )
  await expect(page.locator('body')).not.toContainText(SECRET_CHANNEL_NAME)
  const replacement = await page.evaluate(({
    accessKey,
    draftKey,
    stateKey
  }) => ({
    access: JSON.parse(localStorage.getItem(accessKey)),
    draft: localStorage.getItem(draftKey),
    state: JSON.parse(localStorage.getItem(stateKey))
  }), {
    accessKey: PROFILE_ACCESS_STORAGE_KEY,
    draftKey: ONBOARDING_DRAFT_STORAGE_KEY,
    stateKey: STATE_STORAGE_KEY
  })
  expect(replacement.access).toMatchObject({
    ownerId: OTHER_OWNER_ID,
    profileId: OTHER_OWNER_PROFILE_ID
  })
  expect(replacement.draft).toBeNull()
  expect(replacement.state.learnerProfile).toMatchObject({
    languages: ['mandarin'],
    level: 'starting',
    selectedChannelCatalogIds: expect.arrayContaining([
      expect.any(String)
    ])
  })
  expect(replacement.state.onboarding.starterFeed.catalogIds).toEqual(
    replacement.state.learnerProfile.selectedChannelCatalogIds
  )
  await expect(page.getByText('Fixture Study Video', { exact: true }))
    .toBeVisible()
  expect(resolutionCount).toBeGreaterThanOrEqual(3)
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
