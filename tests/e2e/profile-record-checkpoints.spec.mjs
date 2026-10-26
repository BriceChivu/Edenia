import { readFile } from 'node:fs/promises'
import { expect, test } from '../support/network-fixture.mjs'
import { createPortableLearnerProfileEnvelope } from '../../src/state/portable-learner-profile.js'
import { canonicalizeJson, sha256Base64UrlSync } from '../../src/state/portable-state.js'

const fixture = JSON.parse(await readFile(new URL('../fixtures/learner-profile/profile-ready-trial-smoke.json', import.meta.url)))
const key = 'edenia_v1_auth_trial_v1'
const ownerId = fixture.session.user.id
const profileId = '223e4567-e89b-42d3-a456-426614174001'
const origin = 'https://record-checkpoint-fixture.supabase.co'

test('real video and Anki checkpoints stay small during gameplay and survive reopening with transport disabled', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-standard')
  const state = structuredClone(fixture.resolution.envelope.profile)
  state.config.ankiEnabled = false
  state.onboarding.walkthroughCompleted = true
  state.onboarding.walkthroughCompletedAt = state.onboarding.setupCompletedAt
  state.videos = Object.fromEntries(Array.from({ length: 500 }, (_, i) => [`lesson-${i}`, {
    id: `lesson-${i}`, title: `Lesson ${i} ${'display metadata '.repeat(20)}`, duration: 300,
    manuallyAdded: true, status: 'partial', resumeAtSeconds: 10, watchProgressTracked: true,
    watchProgress: [{ seconds: 10, experienceSeconds: 10, watchedAt: '2026-10-08T12:00:00Z', studyDay: '2026-10-08' }]
  }]))
  const envelope = (await createPortableLearnerProfileEnvelope(state)).envelope
  const identity = { user_id: ownerId, profile_id: profileId, generation: 1, revision: 1 }
  let enabled = true
  const unexpected = []
  await page.route('**/config.local.js*', route => route.fulfill({ contentType: 'application/javascript',
    body: `window.EDENIA_CONFIG=${JSON.stringify({ authTrialEnabled: true, accountFeaturesRollout: 'off',
      learnerProfileLifecycleEnabled: false, learnerProfileRecordSyncEnabled: enabled,
      indexedDbProfileEnabled: true, indexedDbBackupsEnabled: false, tinySwordsEnabled: false,
      googleSignInMode: 'off', supabaseUrl: origin, supabasePublishableKey: 'fixture-key', youtubeApiKey: '' })}` }))
  await page.route(origin + '/**', async route => {
    const path = new URL(route.request().url()).pathname
    if (path === '/auth/v1/token') return route.fulfill({ json: fixture.session })
    if (path === '/auth/v1/user') return route.fulfill({ json: fixture.session.user })
    if (path === '/rest/v1/learner_profile_heads') return route.fulfill({ json: identity })
    if (path === '/rest/v1/rpc/resolve_my_learner_profile') return route.fulfill({ json: [{ status: 'profile_ready', created: false, ...identity, envelope }] })
    if (path === '/rest/v1/rpc/open_my_learner_profile') {
      const args = route.request().postDataJSON()
      const digest = sha256Base64UrlSync(canonicalizeJson(envelope.profile))
      const unchanged = args.p_cached_profile_id === profileId && args.p_cached_generation === 1
        && args.p_cached_revision === 1 && args.p_cached_profile_sha256 === digest
      return route.fulfill({ json: [{ status: unchanged ? 'profile_unchanged' : 'profile_ready', created: false,
        ...identity, envelope: unchanged ? null : envelope, profile_sha256: unchanged ? digest : null,
        reset_state: { status: 'none' } }] })
    }
    if (path === '/rest/v1/rpc/read_my_latest_learner_profile_reset') return route.fulfill({ json: [{ status: 'none' }] })
    if (path.startsWith('/rest/v1/') && !path.includes('learner_profile')) return route.fulfill({ json: [] })
    unexpected.push(path)
    return route.fulfill({ status: 500, json: { message: 'Unexpected checkpoint fixture request' } })
  })
  await page.addInitScript(({ key, ownerId, profileId, session, envelope }) => {
    if (!localStorage.getItem(key + '_plus_auth_v1')) {
      localStorage.setItem(key, JSON.stringify(envelope.profile))
      localStorage.setItem(key + '_plus_auth_v1', JSON.stringify(session))
      localStorage.setItem(key + '_learner_profile_access_v1', JSON.stringify({ version: 1, ownerId,
        profileId, generation: 1, revision: 1, activatedAt: Date.now(), activationId: null, onboardingFinalizationPending: false }))
      localStorage.setItem(key + '_learner_profile_sync_v1', JSON.stringify({ version: 1, ownerId,
        profileId, generation: 1, acceptedRevision: 1, pending: null, queued: null }))
    }
    // Report continuous gameplay as soon as the real opportunity listener is
    // installed. Opening keeps its normal owner verification; automatic work
    // has no quiet gap in which to prepare a candidate or compact the body.
    const add = window.addEventListener
    window.addEventListener = function (type, listener, ...args) {
      const result = add.call(this, type, listener, ...args)
      if (type === 'edenia-tiny-swords-activity') window.dispatchEvent(new CustomEvent(type, { detail: { visible: true, active: true } }))
      return result
    }
  }, { key, ownerId, profileId, session: fixture.session, envelope })
  await page.goto('/?internal_test=1')
  await expect(page.locator('#mainApp')).toBeVisible()
  await expect.poll(() => page.evaluate(() => recordCheckpointsEnabled())).toBe(true)
  const result = await page.evaluate(async () => {
    const now = Date.now()
    activeVideoShelfPlayer = { videoId: 'lesson-0', mode: 'study', isRewatch: false, watchCycleCoverage: [{ start: 0, end: 10 }],
      lastPlaybackSampleSeconds: 10, lastPlaybackSampleAt: now - 10_000, lastPersistedSeconds: 10, lastPersistedAt: now - 5000,
      progressSeconds: 10, playedSecondsTotal: 0, player: { getCurrentTime: () => 20, getPlayerState: () => 1, getPlaybackRate: () => 1 } }
    // The first checkpoint converts an old unsplit local body once. Subsequent
    // checkpoints must leave that immutable body untouched.
    const first = await syncActiveVideoShelfPlayer({ persist: true, syncAnalytics: false })
    activeVideoShelfPlayer.lastPlaybackSampleAt = Date.now() - 20_000
    activeVideoShelfPlayer.player.getCurrentTime = () => 40
    const forbidden = []
    const portable = getPortableProfileSnapshot, normalize = normalizeStateBeforeSave, streak = syncStreak
    const history = getStudyHistoryBetween, analytics = syncPersistedStateToAnalytics
    getPortableProfileSnapshot = () => { forbidden.push('portable'); throw new Error('Full portable scan during checkpoint') }
    normalizeStateBeforeSave = () => { forbidden.push('normalize'); throw new Error('Global normalization during checkpoint') }
    syncStreak = () => { forbidden.push('streak'); throw new Error('Full history scan during checkpoint') }
    getStudyHistoryBetween = () => { forbidden.push('history'); throw new Error('Full history aggregation during checkpoint') }
    syncPersistedStateToAnalytics = () => { forbidden.push('analytics'); throw new Error('Full analytics preparation during checkpoint') }
    const put = IDBObjectStore.prototype.put
    const writes = []
    IDBObjectStore.prototype.put = function (value, ...args) {
      if (this.name === 'profiles' && this.transaction.db.name.startsWith('edenia_v1_auth_trial')) writes.push(value.key)
      return put.call(this, value, ...args)
    }
    let video, anki, day
    try {
      video = await syncActiveVideoShelfPlayer({ persist: true, syncAnalytics: false })
      day = getCurrentAnkiDateKey()
      anki = await syncAnkiStatsToState({ ankiDateKey: day, fetchedAt: new Date().toISOString(), reviewedToday: 7, newToday: 2, dueCards: 0 }, { silent: true })
    } finally {
      getPortableProfileSnapshot = portable; normalizeStateBeforeSave = normalize; syncStreak = streak
      getStudyHistoryBetween = history; syncPersistedStateToAnalytics = analytics
      IDBObjectStore.prototype.put = put
      activeVideoShelfPlayer = null
    }
    const current = loadState()
    const dirty = await getProfileRepository().readDirtyUnits({ ownerId: learnerProfileLifecycleAuthority.getState().ownerId,
      profileId: learnerProfileLifecycleAuthority.getState().profileId, generation: 1, revision: 1 })
    return { first, video, anki, forbidden, writes, day, dirty,
      resume: current.videos['lesson-0'].resumeAtSeconds, reviews: current.anki[day].reviewed,
      marked: Boolean(localStorage.getItem('edenia_v1_auth_trial_v1_learner_profile_sync_v1_dirty')) }
  })
  expect(result).toMatchObject({ first: true, video: true, anki: true, forbidden: [], resume: 40, reviews: 7, marked: true })
  expect(result.writes.filter(key => key === 'active-body')).toEqual([])
  expect(result.writes.filter(key => key === 'active')).toHaveLength(2)
  expect(result.dirty).toEqual({ videos: ['lesson-0'], anki: [result.day], island: false })
  expect(unexpected).toEqual([])
  enabled = false
  await page.reload()
  await expect(page.locator('#mainApp')).toBeVisible()
  expect(await page.evaluate(day => ({ enabled: recordCheckpointsEnabled(), resume: loadState().videos['lesson-0'].resumeAtSeconds,
    reviews: loadState().anki[day]?.reviewed }), result.day)).toEqual({ enabled: false, resume: 40, reviews: 7 })
  expect(unexpected).toEqual([])
})
