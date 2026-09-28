import test from 'node:test'
import assert from 'node:assert/strict'
import { refreshSavedYoutubeMetadata, expireYoutubeMetadata } from '../../src/integrations/youtube-metadata-cache.js'
const now = Date.parse('2026-09-27T00:00:00Z')
function state() { return { config: { channels: [] }, videos: { v: { id: 'v', channelId: 'UCmanual', title: 'Old', duration: 600, channelImageUrl: 'old-image', metadataFetchedAt: '2026-08-01', resumeAtSeconds: 40, watchProgress: [{ seconds: 40 }], favorite: true, watchLater: true, status: 'partial' } } } }
test('unavailable saved metadata retries daily across reloads and recovery restores normal freshness', async () => {
  let saved = state()
  saved.videos.v.channelMetadataFetchedAt = new Date(now).toISOString()
  const learnerState = { id: 'v', channelId: 'UCmanual', favorite: true, watchLater: true, status: 'partial', resumeAtSeconds: 40, watchProgress: [{ seconds: 40 }] }
  const outcomes = []
  let requests = 0
  const recovered = { title: 'Recovered lesson', thumbnail: 'image', publishedAt: '2026-09-01', duration: 600, metadataUnavailable: false }
  const refresh = async time => refreshSavedYoutubeMetadata({
    state: structuredClone(saved), now: time, isCurrent: () => true,
    readCurrent: () => structuredClone(saved), onChange: value => { saved = structuredClone(value) },
    onOutcome: (_state, outcome) => outcomes.push(outcome),
    fetchVideos: async () => { requests++; return requests <= 2 ? {} : { v: recovered } },
    fetchChannels: async () => {}
  })
  await refresh(now)
  assert.equal(saved.videos.v.metadataUnavailable, true)
  await refresh(now)
  await refresh(now + 86_400_000 - 1)
  assert.equal(requests, 1)
  await refresh(now + 86_400_000)
  assert.equal(requests, 2)
  assert.equal(saved.videos.v.metadataUnavailable, true)
  assert.equal(saved.videos.v.metadataFetchedAt, '2026-09-28T00:00:00.000Z')
  await refresh(now + 2 * 86_400_000 - 1)
  assert.equal(requests, 2)
  await refresh(now + 2 * 86_400_000)
  assert.equal(requests, 3)
  for (const [key, value] of Object.entries({ ...learnerState, ...recovered })) assert.deepEqual(saved.videos.v[key], value)
  await refresh(now + 3 * 86_400_000)
  assert.equal(requests, 3)
  assert.ok(outcomes.every(outcome => outcome.status === 'complete' && outcome.failure === null))
})
test('manual-only libraries refresh metadata independently of upload checks', async () => {
  const s = state(); const calls = []
  await refreshSavedYoutubeMetadata({ state: s, now, isCurrent: () => true,
    fetchVideos: async ids => { calls.push(ids); return { v: { title: 'New', duration: 600 } } },
    fetchChannels: async channels => channels.forEach(c => Object.assign(c, { imageUrl: 'new-image', metadataFetchedAt: new Date(now).toISOString() })) })
  assert.deepEqual(calls, [['v']]); assert.equal(s.videos.v.title, 'New'); assert.equal(s.videos.v.channelImageUrl, 'new-image')
  assert.equal(s.videos.v.resumeAtSeconds, 40); assert.deepEqual(s.videos.v.watchProgress, [{ seconds: 40 }])
})
test('due unavailable metadata respects transient backoff and preserves error classifications', async () => {
  for (const kind of ['network', 'provider', 'daily-quota']) {
    const s = state()
    Object.assign(s.videos.v, { metadataUnavailable: true, metadataFetchedAt: '2026-09-26', title: '', duration: 0 })
    s.videos.v.channelMetadataFetchedAt = new Date(now).toISOString()
    let requests = 0
    const outcomes = []
    const options = { state: s, now, isCurrent: () => true,
      fetchVideos: async () => { requests++; throw Object.assign(Error('failure'), { kind }) },
      fetchChannels: async () => {}, onOutcome: (_state, outcome) => outcomes.push(outcome) }
    await refreshSavedYoutubeMetadata(options)
    assert.equal(s.videos.v.metadataFetchedAt, '2026-09-26')
    assert.equal(s.videos.v.metadataUnavailable, true)
    assert.deepEqual(outcomes[0].failure, { kind, phase: 'videos' })
    if (kind === 'daily-quota') {
      assert.equal(s.youtubeMetadataFailedAt, null) // The request gate owns the Pacific-midnight cooldown.
    } else {
      await refreshSavedYoutubeMetadata({ ...options, now: now + 30 * 60_000 - 1 })
      assert.equal(requests, 1)
      await refreshSavedYoutubeMetadata({ ...options, now: now + 30 * 60_000 })
      assert.equal(requests, 2)
    }
  }
})

test('unavailable recovery cannot write after the active profile changes', async () => {
  const s = state()
  Object.assign(s.videos.v, { metadataUnavailable: true, metadataFetchedAt: '2026-09-26', title: '', duration: 0 })
  let active = true
  let requests = 0
  const writes = []
  await refreshSavedYoutubeMetadata({ state: s, now, isCurrent: () => active,
    fetchVideos: async () => { requests++; active = false; return { v: { title: 'Recovered', metadataUnavailable: false } } },
    fetchChannels: async () => {}, onChange: value => writes.push(value) })
  assert.equal(requests, 1)
  assert.equal(writes.length, 0)
  assert.equal(s.videos.v.title, '')
  assert.equal(s.videos.v.metadataUnavailable, true)
})
test('expired metadata is removed on failure and retries back off without losing study facts', async () => {
  const s = state(); let requests = 0
  const options = { state: s, now, isCurrent: () => true, fetchVideos: async () => { requests++; throw Error('offline') }, fetchChannels: async () => {} }
  await refreshSavedYoutubeMetadata(options); await refreshSavedYoutubeMetadata(options)
  assert.equal(requests, 1); assert.equal(s.videos.v.title, ''); assert.equal(s.videos.v.duration, 0)
  assert.equal(s.videos.v.resumeAtSeconds, 40); assert.equal(s.videos.v.favorite, true)
  assert.equal(s.videos.v.watchLater, true); assert.equal(s.videos.v.status, 'partial')
})
test('metadata completing after profile deactivation cannot merge', async () => {
  const s = state(); s.videos.v.metadataFetchedAt = '2026-09-01'
  let active = true
  await refreshSavedYoutubeMetadata({ state: s, now, isCurrent: () => active, fetchVideos: async () => { active = false; return { v: { title: 'Wrong' } } }, fetchChannels: async () => {} })
  assert.equal(s.videos.v.title, 'Old')
})
test('opening an expired cache clears provider fields while retaining identity and progress', () => {
  const s = state(); assert.equal(expireYoutubeMetadata(s, now), true)
  assert.equal(s.videos.v.id, 'v'); assert.equal(s.videos.v.channelImageUrl, ''); assert.equal(s.videos.v.resumeAtSeconds, 40)
})
test('metadata renewed after expiration can expire again on a later offline opening', () => {
  const s = state()
  expireYoutubeMetadata(s, now)
  Object.assign(s.videos.v, { title: 'Renewed', metadataFetchedAt: new Date(now).toISOString() })
  assert.equal(expireYoutubeMetadata(s, now + 45 * 86400000), true)
  assert.equal(s.videos.v.title, '')
})
test('maintenance preserves learner edits saved while provider requests are in flight', async () => {
  const snapshot = state()
  const latest = structuredClone(snapshot)
  await refreshSavedYoutubeMetadata({ state: snapshot, now, isCurrent: () => true, readCurrent: () => latest,
    fetchVideos: async () => { latest.videos.v.favorite = false; latest.videos.v.status = 'watched'; latest.videos.v.resumeAtSeconds = 95; return { v: { title: 'Updated', duration: 600 } } },
    fetchChannels: async () => {} })
  assert.equal(snapshot.videos.v.favorite, false)
  assert.equal(snapshot.videos.v.status, 'watched')
  assert.equal(snapshot.videos.v.resumeAtSeconds, 95)
})

test('successful batches are persisted before later failure and only unfinished records retry', async () => {
  let saved = { config: { channels: [] }, videos: Object.fromEntries(Array.from({ length: 51 }, (_, i) => [`v${i}`, { id: `v${i}`, title: 'Old', favorite: true }])) }
  const outcomes = []
  let fail = true
  const requests = []
  const options = {
    state: structuredClone(saved), now, isCurrent: () => true,
    readCurrent: () => structuredClone(saved),
    onChange: value => { saved = structuredClone(value); return true },
    onOutcome: (_value, outcome) => outcomes.push(outcome),
    fetchVideos: async ids => {
      requests.push(ids)
      if (ids.includes('v50') && fail) {
        assert.equal(saved.videos.v0.title, 'Recovered')
        saved.videos.v0.favorite = false
        throw Object.assign(Error('secret-key must not be logged'), { kind: 'provider', status: 503 })
      }
      return Object.fromEntries(ids.map(id => [id, { title: 'Recovered', duration: 600 }]))
    }, fetchChannels: async () => {}
  }
  await refreshSavedYoutubeMetadata(options)
  assert.equal(saved.videos.v0.title, 'Recovered')
  assert.equal(saved.videos.v0.favorite, false)
  assert.equal(saved.videos.v50.metadataFetchedAt, undefined)
  assert.equal(outcomes[0].status, 'partial')
  assert.equal(outcomes[0].videos, 50)
  assert.equal(outcomes[0].failure.kind, 'provider')
  assert.ok(!JSON.stringify(outcomes).includes('secret-key'))
  await refreshSavedYoutubeMetadata(options)
  assert.equal(requests.length, 2)
  fail = false
  await refreshSavedYoutubeMetadata({ ...options, now: now + 30 * 60_000 })
  assert.deepEqual(requests[2], ['v50'])
  assert.equal(saved.videos.v50.title, 'Recovered')
  assert.equal(outcomes[1].status, 'complete')
})

test('channel failure retains recovered videos and retries channel metadata without refetching videos', async () => {
  const s = state(); const outcomes = []; let videos = 0; let fail = true
  const options = { state: s, now, isCurrent: () => true,
    onOutcome: (_state, outcome) => outcomes.push(outcome),
    fetchVideos: async () => { videos++; return { v: { title: 'Recovered', duration: 600 } } },
    fetchChannels: async channels => {
      if (fail) throw Object.assign(Error('private provider text'), { kind: 'credentials' })
      channels.forEach(c => Object.assign(c, { imageUrl: 'Recovered image', metadataFetchedAt: new Date(now).toISOString() }))
    } }
  await refreshSavedYoutubeMetadata(options)
  assert.equal(s.videos.v.title, 'Recovered')
  assert.deepEqual(outcomes[0].failure, { kind: 'credentials', phase: 'channels' })
  assert.equal(outcomes[0].status, 'partial')
  fail = false
  await refreshSavedYoutubeMetadata({ ...options, now: now + 30 * 60_000 })
  assert.equal(videos, 1)
  assert.equal(s.videos.v.channelImageUrl, 'Recovered image')
})

test('retention runs during retry backoff and quota failures still expire dated provider data', async () => {
  for (const cooldown of [true, false]) {
    const s = state()
    s.youtubeMetadataFailedAt = cooldown ? new Date(now).toISOString() : null
    await refreshSavedYoutubeMetadata({ state: s, now, isCurrent: () => true,
      fetchVideos: async () => { throw Object.assign(Error('quota'), { kind: 'daily-quota' }) }, fetchChannels: async () => {} })
    assert.equal(s.videos.v.title, '')
    assert.equal(s.videos.v.favorite, true)
    assert.equal(s.videos.v.resumeAtSeconds, 40)
  }
})

test('each saved batch merges current learner state and stops when the active profile changes', async () => {
  let current = { config: { channels: [] }, videos: Object.fromEntries(Array.from({ length: 101 }, (_, i) => [`v${i}`, { id: `v${i}` }])) }
  let active = true; let calls = 0; const saved = []; const outcomes = []
  await refreshSavedYoutubeMetadata({ state: structuredClone(current), now,
    isCurrent: () => active, readCurrent: () => structuredClone(current),
    onChange: state => { current = structuredClone(state); saved.push(current) },
    onOutcome: (_state, outcome) => outcomes.push(outcome),
    fetchVideos: async ids => {
      calls++
      if (calls === 2) active = false
      current.study = { minutes: 23 }
      Object.assign(current.videos.v0, { favorite: false, watchLater: true, status: 'watched', resumeAtSeconds: 95, watchProgress: [{ seconds: 95 }] })
      delete current.videos.v1
      return Object.fromEntries(ids.map(id => [id, { title: 'Recovered' }]))
    }, fetchChannels: async () => {} })
  assert.equal(calls, 2)
  assert.equal(saved.length, 1)
  assert.equal(saved[0].videos.v1, undefined)
  assert.deepEqual(saved[0].study, { minutes: 23 })
  assert.deepEqual(saved[0].videos.v0, { id: 'v0', title: 'Recovered', metadataFetchedAt: new Date(now).toISOString(), favorite: false, watchLater: true, status: 'watched', resumeAtSeconds: 95, watchProgress: [{ seconds: 95 }] })
  assert.equal(current.videos.v50.title, undefined)
  assert.equal(outcomes.length, 0)
})
