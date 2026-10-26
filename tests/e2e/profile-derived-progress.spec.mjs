import { readFile } from 'node:fs/promises'
import { expect, test } from '../support/network-fixture.mjs'
import { createPortableLearnerProfileEnvelope } from '../../src/state/portable-learner-profile.js'
import { canonicalizeJson, sha256Base64UrlSync } from '../../src/state/portable-state.js'

const fixture = JSON.parse(await readFile(new URL('../fixtures/learner-profile/profile-ready-trial-smoke.json', import.meta.url)))
const key = 'edenia_v1_auth_trial_v1'
const ownerId = fixture.session.user.id
const profileId = '223e4567-e89b-42d3-a456-426614174001'
const origin = 'https://derived-progress-fixture.supabase.co'

async function openProfile(page, { recordSyncEnabled = true, quietSyncEnabled = true, activeAtStart = false, response = 'failure' } = {}) {
  await page.clock.install({ time: new Date('2026-10-08T12:00:00.000Z') })
  const state = structuredClone(fixture.resolution.envelope.profile)
  state.tinySwordsIsland = JSON.parse(await readFile(new URL('../fixtures/tiny-swords-populated-island.json', import.meta.url)))
  state.config.ankiEnabled = false
  state.anki = {}
  state.onboarding.walkthroughCompleted = true
  state.cityProgress = { maxLevelIndex: 0, experienceVersion: 1 }
  state.videos = { 'lesson-0': { id: 'lesson-0', title: 'Synthetic lesson', duration: 86400,
    manuallyAdded: true, status: 'partial', resumeAtSeconds: 10, watchProgressTracked: true,
    watchProgress: [{ seconds: 10, experienceSeconds: 10, watchedAt: '2026-10-08T12:00:00Z', studyDay: '2026-10-08' }] } }
  const envelope = (await createPortableLearnerProfileEnvelope(state)).envelope
  const identity = { user_id: ownerId, profile_id: profileId, generation: 1, revision: 1, last_replacement_revision: 0 }
  let releaseMetadata
  const heldMetadata = new Promise(resolve => { releaseMetadata = resolve })
  let metadataRequests = 0
  const commits = []
  await page.route('**/config.local.js*', route => route.fulfill({ contentType: 'application/javascript',
    body: `window.EDENIA_CONFIG=${JSON.stringify({ authTrialEnabled: true, accountFeaturesRollout: 'off',
      learnerProfileLifecycleEnabled: false, learnerProfileRecordSyncEnabled: recordSyncEnabled, tinySwordsQuietSyncEnabled: quietSyncEnabled, freePlusEnabled: false,
      indexedDbProfileEnabled: true, indexedDbBackupsEnabled: true, indexedDbBackupCleanupEnabled: true,
      tinySwordsEnabled: false, tinySwordsPublicEnabled: true, videoOrganizationEnabled: true,
      channelVideoFormatToggleEnabled: true, googleSignInMode: 'off', supabaseUrl: origin,
      supabasePublishableKey: 'fixture-key', youtubeApiKey: 'fixture-key' })}` }))
  await page.route('**/youtube/v3/videos?**', async route => {
    metadataRequests++
    await heldMetadata
    await route.fulfill(response === 'success' ? { json: { items: new URL(route.request().url()).searchParams.get('id').split(',').map(id => ({ id,
      snippet: { title: 'Updated provider lesson', channelTitle: 'Provider', publishedAt: '2026-10-08T00:00:00Z', thumbnails: {} },
      contentDetails: { duration: 'PT24H' }, player: { embedWidth: '1280', embedHeight: '720' } })) } }
      : response === 'quota' ? { status: 403, json: { error: { message: 'Synthetic quota', errors: [{ reason: 'quotaExceeded' }] } } }
        : { status: 500, json: { error: { message: 'Synthetic metadata outage' } } })
  })
  await page.route(origin + '/**', route => {
    const path = new URL(route.request().url()).pathname
    if (path === '/auth/v1/token') return route.fulfill({ json: fixture.session })
    if (path === '/auth/v1/user') return route.fulfill({ json: fixture.session.user })
    if (path === '/rest/v1/learner_profile_heads') return route.fulfill({ json: identity })
    if (path.endsWith('/open_my_learner_profile')) {
      const args = route.request().postDataJSON()
      const digest = sha256Base64UrlSync(canonicalizeJson(envelope.profile))
      const unchanged = args.p_cached_profile_id === profileId && args.p_cached_generation === 1
        && args.p_cached_revision === 1 && args.p_cached_profile_sha256 === digest
      return route.fulfill({ json: [{ status: unchanged ? 'profile_unchanged' : 'profile_ready', created: false,
        ...identity, envelope: unchanged ? null : envelope, profile_sha256: unchanged ? digest : null,
        reset_state: { status: 'none' } }] })
    }
    if (path.endsWith('/resolve_my_learner_profile')) return route.fulfill({ json: [{ status: 'profile_ready', created: false, ...identity, envelope }] })
    if (path.endsWith('/read_my_latest_learner_profile_reset')) return route.fulfill({ json: [{ status: 'none' }] })
    if (path.includes('/commit_my_learner_profile')) commits.push(path)
    return route.fulfill({ json: [] })
  })
  await page.addInitScript(({ key, ownerId, profileId, session, envelope, activeAtStart }) => {
    if (!localStorage.getItem(key + '_plus_auth_v1')) {
      localStorage.setItem(key, JSON.stringify(envelope.profile))
      localStorage.setItem(key + '_plus_auth_v1', JSON.stringify(session))
      localStorage.setItem(key + '_learner_profile_access_v1', JSON.stringify({ version: 1, ownerId, profileId,
        generation: 1, revision: 1, activatedAt: Date.now(), activationId: null, onboardingFinalizationPending: false }))
      localStorage.setItem(key + '_learner_profile_sync_v1', JSON.stringify({ version: 1, ownerId, profileId,
        generation: 1, acceptedRevision: 1, pending: null, queued: null }))
    }
    const add = window.addEventListener
    window.addEventListener = function (type, listener, ...args) {
      const result = add.call(this, type, listener, ...args)
      if (type === 'edenia-tiny-swords-activity') window.dispatchEvent(new CustomEvent(type, { detail: { visible: activeAtStart, active: activeAtStart } }))
      return result
    }
  }, { key, ownerId, profileId, session: fixture.session, envelope, activeAtStart })
  await page.goto('/?internal_test=1')
  await expect(page.locator('#mainApp')).toBeVisible()
  return { releaseMetadata, requests: () => metadataRequests, commits }
}

test('metadata completion defers derived city writes during play and fences stale profile callbacks', async ({ page, pageDiagnostics }, testInfo) => {
  test.skip(!['desktop-standard', 'webkit-trial-desktop'].includes(testInfo.project.name))
  const { releaseMetadata, requests, commits } = await openProfile(page)
  await expect.poll(requests).toBeGreaterThan(0)
  await page.evaluate(async () => {
    Object.defineProperty(navigator, 'onLine', { configurable: true, get: () => false })
    window.dispatchEvent(new Event('offline'))
    const now = Date.now()
    activeVideoShelfPlayer = { videoId: 'lesson-0', mode: 'study', isRewatch: false,
      watchCycleCoverage: [{ start: 0, end: 10 }], lastPlaybackSampleSeconds: 10,
      lastPlaybackSampleAt: now - 10_000, lastPersistedSeconds: 10, lastPersistedAt: now - 5000,
      progressSeconds: 10, playedSecondsTotal: 0,
      player: { getCurrentTime: () => 20, getPlayerState: () => 1, getPlaybackRate: () => 1 } }
    if (!await syncActiveVideoShelfPlayer({ persist: true, syncAnalytics: false })) throw new Error('Initial checkpoint failed')
    const profile = loadState()
    profile.cityProgress.pendingLevelIndex = null
    profile.cityProgress.scoringVersion = 1
    // Hold only the actual derived-render entry, after metadata's own durable
    // cleanup has finished. Every primary put after release is observed below.
    const original = renderCity
    renderCity = (score, current) => {
      if (maybeRefreshFeed._running) {
        window.releaseMetadataCity = () => original(score, current)
        window.heldMetadataScore = score
        return Promise.resolve()
      }
      return original(score, current)
    }
  })
  releaseMetadata()
  await expect.poll(() => page.evaluate(() => typeof window.releaseMetadataCity === 'function' && maybeRefreshFeed._running === false)).toBe(true)
  expect(pageDiagnostics.every(message => message === 'console: Failed to load resource: the server responded with a status of 500 (Internal Server Error)')).toBe(true)
  pageDiagnostics.length = 0
  await page.evaluate(() => window.dispatchEvent(new CustomEvent('edenia-tiny-swords-activity', { detail: { visible: true, active: true } })))
  await page.clock.pauseAt(new Date(await page.evaluate(() => Date.now()) + 20))
  const active = await page.evaluate(async () => {
    Object.defineProperty(navigator, 'onLine', { configurable: true, get: () => false })
    window.dispatchEvent(new Event('offline'))
    const before = structuredClone(loadState().cityProgress)
    const put = IDBObjectStore.prototype.put, writes = []
    IDBObjectStore.prototype.put = function (value, ...args) {
      if (this.name === 'profiles' && this.transaction.db.name.startsWith('edenia_v1_auth_trial')) writes.push(value.key)
      return put.call(this, value, ...args)
    }
    const resume = (CITY_LEVELS[1].threshold + 1) * 60
    let saved
    try {
      const rendering = [window.releaseMetadataCity(), window.releaseMetadataCity()]
      activeVideoShelfPlayer.lastPlaybackSampleAt = Date.now() - resume * 1000
      activeVideoShelfPlayer.player.getCurrentTime = () => resume
      saved = await syncActiveVideoShelfPlayer({ persist: true, syncAnalytics: false })
      await Promise.all(rendering)
    } finally { activeVideoShelfPlayer = null; IDBObjectStore.prototype.put = put }
    return { saved, writes, resume, before, after: structuredClone(loadState().cityProgress),
      quiet: learnerProfileSyncOpportunity.isQuiet(), heldEarned: getCityLevelIndex(window.heldMetadataScore),
      latestEarned: getCityLevelIndex(getCurrentCityScore(loadState())) }
  })
  expect(active.saved).toBe(true)
  expect(active.quiet).toBe(false)
  expect(active.heldEarned).toBe(0)
  expect(active.latestEarned).toBeGreaterThan(0)
  expect(active.writes).toEqual(['active'])
  expect(active.after).toEqual(active.before)
  const wood = await page.evaluate(async () => {
    const current = loadState().tinySwordsIsland
    const next = structuredClone(current)
    next.resources.wood += 1
    if (!await learnerProfileLifecycleAuthority.saveActiveIsland(next, JSON.stringify(current))) throw new Error('Island checkpoint failed')
    return next.resources.wood
  })
  await page.evaluate(() => window.dispatchEvent(new CustomEvent('edenia-tiny-swords-activity', { detail: { visible: false, active: false } })))
  await page.clock.fastForward(600)
  await expect.poll(() => page.evaluate(() => JSON.parse(getProfileRepository().readRaw()).cityProgress.pendingLevelIndex)).toBe(1)
  expect(await page.evaluate(() => JSON.parse(getProfileRepository().readRaw()).cityProgress.scoringVersion)).toBe(await page.evaluate(() => SCORING_RULES_VERSION))
  await page.addInitScript(() => Object.defineProperty(navigator, 'onLine', { configurable: true, get: () => false }))
  await page.clock.resume()
  await page.reload()
  await expect(page.locator('#mainApp')).toBeVisible()
  expect(await page.evaluate(() => ({ resume: loadState().videos['lesson-0'].resumeAtSeconds,
    wood: loadState().tinySwordsIsland.resources.wood, pending: loadState().cityProgress.pendingLevelIndex })))
    .toEqual({ resume: active.resume, wood, pending: 1 })
  await expect.poll(() => page.evaluate(() => maybeRefreshFeed._running !== true)).toBe(true)
  await page.evaluate(() => learnerProfileLifecycleAuthority.flushSessionBoundary({ allowNewUpload: false }))
  await page.evaluate(() => window.dispatchEvent(new CustomEvent('edenia-tiny-swords-activity', { detail: { visible: true, active: true } })))
  await page.clock.pauseAt(new Date(await page.evaluate(() => Date.now()) + 20))
  const replacement = await page.evaluate(async () => {
    const old = loadState()
    const next = structuredClone(old)
    next.config.weeklyGoalHours = 17
    next.videos = {}
    next.cityProgress = { maxLevelIndex: 0, pendingLevelIndex: null, scoringVersion: 1, experienceVersion: 1 }
    if (!(await learnerProfileLifecycleAuthority.replaceActiveProfile(next, { backup: false, syncAnalytics: false }))?.persisted) throw new Error('Replacement failed')
    await renderCity(getCurrentCityScore(next), next)
    // A later callback from the retired profile must not replace the current
    // profile's already queued derived refresh.
    await renderCity(getCurrentCityScore(old), old)
    return { same: loadState() === next, before: structuredClone(next.cityProgress) }
  })
  expect(replacement.same).toBe(true)
  expect(replacement.before.scoringVersion).toBe(1)
  await page.evaluate(() => window.dispatchEvent(new CustomEvent('edenia-tiny-swords-activity', { detail: { visible: false, active: false } })))
  await page.clock.fastForward(600)
  await expect.poll(() => page.evaluate(() => JSON.parse(getProfileRepository().readRaw()).cityProgress.scoringVersion)).toBe(await page.evaluate(() => SCORING_RULES_VERSION))
  expect(await page.evaluate(() => ({ goal: loadState().config.weeklyGoalHours,
    pending: loadState().cityProgress.pendingLevelIndex, videos: Object.keys(loadState().videos).length })))
    .toEqual({ goal: 17, pending: null, videos: 0 })
  expect(commits).toEqual([])
})

async function observeActiveWork(page) {
  await page.evaluate(() => {
    Object.defineProperty(navigator, 'onLine', { configurable: true, get: () => false })
    window.dispatchEvent(new Event('offline'))
    window.activeWork = { writes: [], snapshots: 0, analytics: 0 }
    const put = IDBObjectStore.prototype.put
    IDBObjectStore.prototype.put = function (value, ...args) {
      if (this.name === 'profiles' && this.transaction.db.name.startsWith('edenia_v1_auth_trial')
        && !learnerProfileSyncOpportunity.isQuiet()) window.activeWork.writes.push(value.key)
      return put.call(this, value, ...args)
    }
    const snapshot = getPortableProfileSnapshot
    getPortableProfileSnapshot = (...args) => {
      if (!learnerProfileSyncOpportunity.isQuiet()) window.activeWork.snapshots++
      return snapshot(...args)
    }
    const analytics = getAccountStudySnapshot
    getAccountStudySnapshot = (...args) => {
      if (!learnerProfileSyncOpportunity.isQuiet()) window.activeWork.analytics++
      return analytics(...args)
    }
  })
}

async function activity(page, active) {
  await page.evaluate(active => window.dispatchEvent(new CustomEvent('edenia-tiny-swords-activity',
    { detail: { visible: active, active } })), active)
}

for (const options of [
  { recordSyncEnabled: true, response: 'success' },
  { recordSyncEnabled: false, response: 'success' },
  { recordSyncEnabled: true, response: 'failure' },
  { recordSyncEnabled: true, response: 'quota' }
]) test(`automatic metadata ${options.response} waits through active play with record transport ${options.recordSyncEnabled}`, async ({ page, pageDiagnostics }, testInfo) => {
  test.skip(!['desktop-standard', 'webkit-trial-desktop'].includes(testInfo.project.name))
  const h = await openProfile(page, options)
  await expect.poll(h.requests).toBe(1)
  // The provider is already in flight. Start gameplay before its response.
  await activity(page, true)
  await page.clock.pauseAt(new Date(await page.evaluate(() => Date.now()) + 20))
  await observeActiveWork(page)
  h.releaseMetadata()
  await page.clock.fastForward(600)
  const held = await page.evaluate(() => ({ title: loadState().videos['lesson-0'].title,
    work: window.activeWork, running: maybeRefreshFeed._running,
    quota: Object.keys(localStorage).some(key => key.includes('youtube_quota') && localStorage.getItem(key).includes('retryAt')) }))
  expect(held.work).toEqual({ writes: [], snapshots: 0, analytics: 0 })
  expect(held.running).toBe(true)
  expect(held.title).toBe('Synthetic lesson')
  if (options.response === 'quota') expect(held.quota).toBe(true)
  // New durable study/island facts must survive the later metadata apply.
  const facts = await page.evaluate(async ({ fast }) => {
    const state = loadState()
    state.videos['lesson-0'].resumeAtSeconds = 42
    if (fast && !await saveRecordCheckpoint(state, { videos: ['lesson-0'] }, { syncAnalytics: false })) throw Error('Video checkpoint failed')
    if (!fast && !await saveState(state, { syncCloud: false, syncAnalytics: false })) throw Error('Legacy save failed')
    const island = structuredClone(state.tinySwordsIsland)
    island.resources.wood++
    if (!await learnerProfileLifecycleAuthority.saveActiveIsland(island, JSON.stringify(state.tinySwordsIsland))) throw Error('Island checkpoint failed')
    return { resume: 42, wood: island.resources.wood }
  }, { fast: options.recordSyncEnabled })
  await activity(page, false)
  await page.clock.fastForward(700)
  await expect.poll(() => page.evaluate(() => maybeRefreshFeed._running)).toBe(false)
  const saved = await page.evaluate(() => {
    const s = JSON.parse(getProfileRepository().readRaw())
    return { title: s.videos['lesson-0'].title, resume: s.videos['lesson-0'].resumeAtSeconds,
      wood: s.tinySwordsIsland.resources.wood, failure: s.youtubeMetadataFailedAt }
  })
  expect(saved.resume).toBe(facts.resume)
  expect(saved.wood).toBe(facts.wood)
  if (options.response === 'success') expect(saved.title).toBe('Updated provider lesson')
  if (options.response === 'failure') expect(saved.failure).toBeTruthy()
  if (options.response === 'quota') expect(saved.failure).toBeNull()
  await page.addInitScript(() => Object.defineProperty(navigator, 'onLine', { configurable: true, get: () => false }))
  await page.clock.resume()
  await page.reload()
  await expect(page.locator('#mainApp')).toBeVisible()
  expect(await page.evaluate(() => ({ resume: loadState().videos['lesson-0'].resumeAtSeconds,
    wood: loadState().tinySwordsIsland.resources.wood }))).toEqual(facts)
  expect(pageDiagnostics.every(message => /server responded with a status of (500|403)/.test(message))).toBe(true)
  pageDiagnostics.length = 0
  expect(h.commits).toEqual([])
})

test('automatic metadata waits before starting and the existing quiet-policy override remains immediate', async ({ page }, testInfo) => {
  test.skip(!['desktop-standard', 'webkit-trial-desktop'].includes(testInfo.project.name))
  const h = await openProfile(page, { activeAtStart: true, response: 'success' })
  await observeActiveWork(page)
  await page.clock.fastForward(1000)
  expect(h.requests()).toBe(0)
  expect(await page.evaluate(() => window.activeWork)).toEqual({ writes: [], snapshots: 0, analytics: 0 })
  await page.evaluate(() => { window.EDENIA_CONFIG.tinySwordsQuietSyncEnabled = false })
  await page.clock.fastForward(600)
  await expect.poll(h.requests).toBe(1)
  h.releaseMetadata()
  await expect.poll(() => page.evaluate(() => loadState().videos['lesson-0'].title)).toBe('Updated provider lesson')
})

test('retired held metadata is canceled and the replacement profile resumes automatic refresh', async ({ page }, testInfo) => {
  test.skip(!['desktop-standard', 'webkit-trial-desktop'].includes(testInfo.project.name))
  const h = await openProfile(page, { response: 'success' })
  await expect.poll(h.requests).toBe(1)
  await activity(page, true)
  await page.clock.pauseAt(new Date(await page.evaluate(() => Date.now()) + 20))
  await page.evaluate(async () => {
    Object.defineProperty(navigator, 'onLine', { configurable: true, get: () => false })
    const next = structuredClone(loadState())
    next.config.weeklyGoalHours = 17
    next.videos = { 'replacement-lesson': { ...next.videos['lesson-0'], id: 'replacement-lesson', title: 'Replacement lesson' } }
    if (!(await learnerProfileLifecycleAuthority.replaceActiveProfile(next, { backup: false, syncAnalytics: false }))?.persisted) throw Error('Replacement failed')
  })
  await observeActiveWork(page)
  h.releaseMetadata()
  await page.clock.fastForward(600)
  expect(await page.evaluate(() => loadState().videos['replacement-lesson'].title)).toBe('Replacement lesson')
  expect(await page.evaluate(() => window.activeWork)).toEqual({ writes: [], snapshots: 0, analytics: 0 })
  await activity(page, false)
  await page.clock.fastForward(700)
  await expect.poll(async () => {
    // Cancellation schedules a fresh activation on the existing zero-delay
    // timer, after the provider promise's microtasks have settled.
    await page.clock.runFor(1)
    return h.requests()
  }).toBe(2)
  await expect.poll(() => page.evaluate(() => maybeRefreshFeed._running)).toBe(false)
  expect(await page.evaluate(() => ({ title: loadState().videos['replacement-lesson'].title,
    oldVideo: Boolean(loadState().videos['lesson-0']), goal: JSON.parse(getProfileRepository().readRaw()).config.weeklyGoalHours })))
    .toEqual({ title: 'Updated provider lesson', oldVideo: false, goal: 17 })
})

test('a quiet full save completing after input keeps durability and defers optional scans', async ({ page }, testInfo) => {
  test.skip(!['desktop-standard', 'webkit-trial-desktop'].includes(testInfo.project.name))
  const h = await openProfile(page, { response: 'success' })
  await expect.poll(h.requests).toBe(1)
  await page.evaluate(() => {
    Object.defineProperty(navigator, 'onLine', { configurable: true, get: () => false })
    window.dispatchEvent(new Event('offline'))
  })
  h.releaseMetadata()
  await expect.poll(() => page.evaluate(() => maybeRefreshFeed._running)).toBe(false)
  await observeActiveWork(page)
  const result = await page.evaluate(async () => {
    const put = IDBObjectStore.prototype.put
    let activated = false
    IDBObjectStore.prototype.put = function (value, ...args) {
      const request = put.call(this, value, ...args)
      if (!activated && this.name === 'profiles' && value.key === 'active') {
        request.addEventListener('success', () => {
          activated = true
          window.dispatchEvent(new CustomEvent('edenia-tiny-swords-activity', { detail: { visible: true, active: true } }))
        })
      }
      return request
    }
    const s = loadState()
    s.config.weeklyGoalHours = 19
    let saved
    try { saved = await saveState(s, { syncCloud: false }) }
    finally { IDBObjectStore.prototype.put = put }
    return { saved, activated, quiet: learnerProfileSyncOpportunity.isQuiet(),
      goal: JSON.parse(getProfileRepository().readRaw()).config.weeklyGoalHours,
      work: window.activeWork, queued: studyDerivedRefreshProfile === s }
  })
  expect(result.saved).toBe(true)
  expect(result.activated).toBe(true)
  expect(result.quiet).toBe(false)
  expect(result.goal).toBe(19)
  expect(result.work.snapshots).toBe(0)
  expect(result.work.analytics).toBe(0)
  expect(result.queued).toBe(true)
  await activity(page, false)
  await page.clock.fastForward(600)
  await expect.poll(() => page.evaluate(() => studyDerivedRefreshProfile === null)).toBe(true)
  const localOnly = await page.evaluate(async () => {
    const s = loadState()
    const cacheInvalidated = !persistedPortableProfileSnapshots.has(s)
    const save = saveState
    const set = Storage.prototype.setItem
    const cloudOptions = [], dirtyWrites = []
    saveState = function (state, options = {}) {
      cloudOptions.push(options.syncCloud)
      return save(state, options)
    }
    Storage.prototype.setItem = function (key, ...args) {
      if (key.endsWith('_learner_profile_sync_v1_dirty')) dirtyWrites.push(key)
      return set.call(this, key, ...args)
    }
    try {
      // Only freshness is missing; the recovered provider metadata is identical.
      delete s.videos['lesson-0'].metadataFetchedAt
      await maybeRefreshFeed()
      await recordYoutubeQuotaError({ kind: 'daily-quota', bucket: 'general',
        retryAt: Date.now() + 60_000, reasons: ['quotaExceeded'], message: 'Synthetic quota diagnostic' }, s)
    } finally {
      saveState = save
      Storage.prototype.setItem = set
    }
    return { cacheInvalidated, cloudOptions, dirtyWrites,
      diagnostic: loadState().activityLog.some(entry => entry.meta?.youtubeQuotaId) }
  })
  expect(localOnly.cacheInvalidated).toBe(true)
  expect(localOnly.cloudOptions.length).toBeGreaterThan(0)
  expect(localOnly.cloudOptions.every(value => value === false)).toBe(true)
  expect(localOnly.dirtyWrites).toEqual([])
  expect(localOnly.diagnostic).toBe(true)
  expect(h.commits).toEqual([])
})

test('automatic channel refresh holds private provider results until quiet and keeps newer study facts', async ({ page }, testInfo) => {
  test.skip(!['desktop-standard', 'webkit-trial-desktop'].includes(testInfo.project.name))
  const h = await openProfile(page, { response: 'success' })
  await expect.poll(h.requests).toBe(1)
  h.releaseMetadata()
  await expect.poll(() => page.evaluate(() => maybeRefreshFeed._running)).toBe(false)
  await page.evaluate(async () => {
    Object.defineProperty(navigator, 'onLine', { configurable: true, get: () => false })
    window.dispatchEvent(new Event('offline'))
    const s = loadState()
    s.config.channels = [{ id: 'UCfixture', name: 'Original channel' }]
    s.channelRefreshes = {}
    if (!await saveState(s, { syncCloud: false, syncAnalytics: false })) throw Error('Channel setup failed')
    hydrateYoutubeChannelProfiles = channels => new Promise(resolve => {
      window.releaseChannelProvider = () => {
        // The actual provider helper mutates its supplied channel records.
        Object.assign(channels[0], { name: 'Provider channel', imageUrl: 'https://i.ytimg.com/vi/synthetic/default.jpg', metadataFetchedAt: new Date().toISOString() })
        resolve()
      }
    })
    fetchChannelVideos = async () => ({ videos: [{ id: 'lesson-0', channelId: 'UCfixture',
      channelTitle: 'Provider channel', title: 'Provider feed lesson', duration: 86400 }], filteredShorts: 0 })
    getFetchedVideoDetails = async () => ({})
    window.channelRefreshResult = refreshFeed({ silent: true, trigger: 'automatic' })
  })
  await expect.poll(() => page.evaluate(() => typeof window.releaseChannelProvider)).toBe('function')
  await activity(page, true)
  await page.clock.pauseAt(new Date(await page.evaluate(() => Date.now()) + 20))
  await observeActiveWork(page)
  await page.evaluate(() => window.releaseChannelProvider())
  await page.clock.fastForward(600)
  expect(await page.evaluate(() => loadState().config.channels[0].name)).toBe('Original channel')
  expect(await page.evaluate(() => window.activeWork)).toEqual({ writes: [], snapshots: 0, analytics: 0 })
  const wood = await page.evaluate(async () => {
    const s = loadState()
    s.videos['lesson-0'].resumeAtSeconds = 51
    if (!await saveRecordCheckpoint(s, { videos: ['lesson-0'] }, { syncAnalytics: false })) throw Error('Video checkpoint failed')
    const island = structuredClone(s.tinySwordsIsland)
    island.resources.wood++
    if (!await learnerProfileLifecycleAuthority.saveActiveIsland(island, JSON.stringify(s.tinySwordsIsland))) throw Error('Island checkpoint failed')
    return island.resources.wood
  })
  await activity(page, false)
  await page.clock.fastForward(700)
  expect((await page.evaluate(() => window.channelRefreshResult)).ok).toBe(true)
  expect(await page.evaluate(() => {
    const s = JSON.parse(getProfileRepository().readRaw())
    return { channel: s.config.channels[0].name, title: s.videos['lesson-0'].title,
      resume: s.videos['lesson-0'].resumeAtSeconds, wood: s.tinySwordsIsland.resources.wood }
  })).toEqual({ channel: 'Provider channel', title: 'Provider feed lesson', resume: 51, wood })
})
