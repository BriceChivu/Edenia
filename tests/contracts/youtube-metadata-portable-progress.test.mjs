import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import vm from 'node:vm'
import { refreshSavedYoutubeMetadata } from '../../src/integrations/youtube-metadata-cache.js'
import { preparePortableLearnerProfileEnvelope } from '../../src/state/portable-learner-profile.js'

const source = await readFile(new URL('../../src/app.js', import.meta.url), 'utf8')
const start = source.indexOf('async function maybeRefreshFeed(')
const end = source.indexOf('\nfunction startYoutubeAutoRefresh(', start)
const snapshot = state => JSON.stringify(preparePortableLearnerProfileEnvelope(state).profile)
function harness({ signedIn = true, change = false, fail = false, retire = false, concurrent = false, unavailableSnapshot = false } = {}) {
  let current = { config: { channels: [] }, anki: {}, activityLog: [], videos: {
    v: { id: 'v', title: 'Lesson', thumbnail: 'image', duration: 600,
      metadataFetchedAt: new Date(Date.now() - 29.5 * 86400000).toISOString(),
      favorite: true, status: 'partial', resumeAtSeconds: 40, watchProgress: [{ seconds: 40 }] }
  } }
  let active = true
  const saves = []
  const before = snapshot(current)
  const context = vm.createContext({
    IS_SANDBOX: false, STORAGE_KEY: 'test', youtubeMetadataBudget: null,
    learnerProfileLifecycleAuthority: signedIn ? {} : null,
    getPortableProfileSnapshot: unavailableSnapshot ? () => null : snapshot,
    loadState: () => structuredClone(current),
    hasYoutubeApiKey: () => true, visibleYoutubeMetadataIds: () => ['v'],
    createYoutubeMetadataBudget: () => ({ createRun: () => (_phase, ids, fetch) => fetch(ids) }),
    refreshSavedYoutubeMetadata,
    fetchVideoDetails: async () => {
      if (concurrent) current.videos.v.favorite = false
      if (retire) active = false
      if (fail) throw Object.assign(Error('quota'), { kind: 'daily-quota' })
      return { v: { title: change ? 'New lesson' : 'Lesson', thumbnail: 'image', duration: 600 } }
    },
    hydrateYoutubeChannelProfiles: async () => {},
    isCurrentLearnerProfileOperation: () => active,
    primaryProfileRepository: { inheritRevision() {} },
    saveState: (state, options = {}) => {
      assert.equal(active, true)
      current = structuredClone(state)
      saves.push({ profile: snapshot(state), options: { ...options } })
      return true
    },
    appendActivityLog: (state, entry) => state.activityLog.push(entry),
    t: key => key, renderAll() {}, shouldRefreshYoutubeFeed: () => false,
    scheduleYoutubeAutoRefresh() {}
  })
  vm.runInContext(source.slice(start, end), context)
  return { run: () => context.maybeRefreshFeed(), saves, before, current: () => current }
}

test('signed-in cached metadata renewal persists freshness locally without cloud writes or history', async () => {
  const h = harness()
  await h.run()
  assert.ok(h.saves.length > 0)
  assert.ok(h.saves.every(save => save.options.cloud === false))
  assert.ok(h.saves.every(save => save.profile === h.before))
  assert.ok(Date.parse(h.current().videos.v.metadataFetchedAt) > Date.now() - 10000)
})
test('signed-in unchanged metadata quota failure records local cooldown without a cloud diagnostic', async () => {
  const h = harness({ fail: true })
  await h.run()
  assert.ok(h.saves.length > 0)
  assert.ok(h.saves.every(save => save.options.cloud === false))
  assert.equal(snapshot(h.current()), h.before)
})
test('real recovered catalog changes remain eligible for cloud persistence and diagnostics', async () => {
  const h = harness({ change: true })
  await h.run()
  assert.ok(h.saves.some(save => save.options.cloud !== false))
  assert.equal(h.current().videos.v.title, 'New lesson')
  assert.equal(h.current().videos.v.resumeAtSeconds, 40)
  assert.equal(h.current().activityLog.at(-1).type, 'youtube-metadata')
})
test('unchanged metadata renewal preserves concurrent learner edits without claiming them as metadata changes', async () => {
  const h = harness({ concurrent: true })
  await h.run()
  assert.equal(h.current().videos.v.favorite, false)
  assert.equal(h.current().activityLog.length, 0)
  assert.ok(h.saves.every(save => save.options.cloud === false))
})
test('metadata completion after profile retirement cannot save', async () => {
  const h = harness({ retire: true })
  await h.run()
  assert.equal(h.saves.length, 0)
})
test('accountless cached metadata retains its existing diagnostic behavior', async () => {
  const h = harness({ signedIn: false })
  await h.run()
  assert.equal(h.current().activityLog.at(-1).type, 'youtube-metadata')
  assert.ok(h.saves.every(save => save.options.cloud !== false))
})

test('failed portable normalization cannot suppress an otherwise durable save', async () => {
  const h = harness({ unavailableSnapshot: true })
  await h.run()
  assert.ok(h.saves.every(save => save.options.cloud !== false))
  assert.equal(h.current().activityLog.at(-1).type, 'youtube-metadata')
})
