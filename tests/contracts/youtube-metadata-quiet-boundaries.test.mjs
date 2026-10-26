import test from 'node:test'
import assert from 'node:assert/strict'
import { refreshSavedYoutubeMetadata } from '../../src/integrations/youtube-metadata-cache.js'

const now = Date.parse('2026-10-27T00:00:00.000Z')
const freshAt = new Date(now).toISOString()
const expiredAt = new Date(now - 31 * 86_400_000).toISOString()
const clone = value => structuredClone(value)

function deferred() {
  let resolve, reject
  const promise = new Promise((yes, no) => { resolve = yes; reject = no })
  return { promise, resolve, reject }
}

function quietGate() {
  let held = null
  return {
    beforeApply() {
      if (!held) return true
      held.entered.resolve()
      return held.permission.promise
    },
    hold() {
      assert.equal(held, null)
      const waiting = { entered: deferred(), permission: deferred() }
      held = waiting
      return {
        entered: waiting.entered.promise,
        release(value = true) { held = null; waiting.permission.resolve(value) }
      }
    }
  }
}

async function expectHeld(waiting, work) {
  const boundary = await Promise.race([
    waiting.entered.then(() => 'waiting-for-quiet'),
    work.then(() => 'completed-without-gate')
  ])
  assert.equal(boundary, 'waiting-for-quiet', 'The operation must wait at the activity boundary')
}

function profile({ channel = false, expired = false } = {}) {
  return {
    config: { channels: channel ? [{ id: 'UCsynthetic', name: 'Retained channel', imageUrl: 'retained-channel-image' }] : [] },
    videos: { video: { id: 'video', title: 'Retained title', thumbnail: 'retained-thumbnail', duration: 300,
      status: 'partial', favorite: false, watchProgress: [{ seconds: 10 }],
      ...(channel ? { channelId: 'UCsynthetic', channelImageUrl: 'retained-channel-image',
        channelMetadataFetchedAt: freshAt, metadataFetchedAt: freshAt } : {}),
      ...(expired ? { metadataFetchedAt: expiredAt } : {}) } }
  }
}

test('the entry activity gate precedes reading, expiring and changing the saved profile', { timeout: 2000 }, async () => {
  const state = profile({ expired: true }), original = clone(state)
  const gate = quietGate(), waiting = gate.hold()
  let reads = 0, providers = 0, changes = 0
  const work = refreshSavedYoutubeMetadata({ state, now, isCurrent: () => true,
    beforeApply: gate.beforeApply, readCurrent: () => { reads++; return state },
    fetchVideos: async () => { providers++; return {} }, fetchChannels: async () => { providers++ },
    onChange: () => { changes++; return true } })
  await expectHeld(waiting, work)
  assert.equal(reads, 0)
  assert.equal(providers, 0)
  assert.equal(changes, 0)
  assert.deepEqual(state, original)
  waiting.release(false)
  assert.equal(await work, false)
  assert.deepEqual(state, original)
})

for (const channel of [false, true]) {
  for (const rejected of [false, true]) {
    test(`${channel ? 'channel' : 'video'} provider ${rejected ? 'rejection' : 'success'} waits for quiet before reading and applying to the latest profile`, { timeout: 2000 }, async () => {
      const state = profile({ channel }), original = clone(state)
      const gate = quietGate(), requested = deferred(), provider = deferred()
      let current = state, reads = 0, changes = 0, outcome
      const work = refreshSavedYoutubeMetadata({ state, now, isCurrent: () => true,
        beforeApply: gate.beforeApply,
        readCurrent: () => { reads++; return current },
        fetchVideos: async ids => {
          assert.equal(channel, false)
          assert.deepEqual(ids, ['video'])
          requested.resolve()
          await provider.promise
          return { video: { title: 'Provider title', thumbnail: 'provider-thumbnail', metadataFetchedAt: freshAt } }
        },
        fetchChannels: async channels => {
          assert.equal(channel, true)
          assert.equal(channels[0].id, 'UCsynthetic')
          requested.resolve()
          await provider.promise
          Object.assign(channels[0], { name: 'Provider channel', imageUrl: 'provider-channel-image', metadataFetchedAt: freshAt })
        },
        onChange: () => { changes++; return true }, onOutcome: (_, value) => { outcome = value } })
      await requested.promise
      const readsBeforeResponse = reads
      const waiting = gate.hold()
      if (rejected) provider.reject(new TypeError('Synthetic provider failure'))
      else provider.resolve()
      await expectHeld(waiting, work)
      assert.equal(reads, readsBeforeResponse, 'A held response must not read a newer profile yet')
      assert.equal(changes, 0)
      assert.equal(outcome, undefined)
      assert.deepEqual(state, original)
      current = clone(original)
      current.videos.video.favorite = true
      if (channel) current.config.channels[0].localMarker = 'newer-local-edit'
      waiting.release()
      assert.equal(await work, true)
      assert.equal(state.videos.video.favorite, true, 'The latest personal edit survives provider completion')
      assert.ok(changes > 0)
      if (rejected) {
        assert.equal(state.youtubeMetadataFailedAt, freshAt)
        assert.deepEqual(outcome.failure, { kind: 'network', phase: channel ? 'channels' : 'videos' })
        if (channel) {
          assert.equal(state.config.channels[0].name, 'UCsynthetic')
          assert.equal(state.config.channels[0].imageUrl, '')
        } else assert.equal(state.videos.video.title, '')
      } else if (channel) {
        assert.equal(state.config.channels[0].name, 'Provider channel')
        assert.equal(state.videos.video.channelImageUrl, 'provider-channel-image')
      } else assert.equal(state.videos.video.title, 'Provider title')
      if (channel) assert.equal(state.config.channels[0].localMarker, 'newer-local-edit')
    })
  }
}

for (const afterProvider of [false, true]) {
  test(`profile retirement while the ${afterProvider ? 'provider response' : 'entry'} gate waits cancels without applying work`, { timeout: 2000 }, async () => {
    const state = profile(), original = clone(state)
    const gate = quietGate(), requested = deferred(), provider = deferred()
    let current = true, reads = 0, changes = 0, outcomes = 0
    let waiting = afterProvider ? null : gate.hold()
    const work = refreshSavedYoutubeMetadata({ state, now, isCurrent: () => current,
      beforeApply: gate.beforeApply, readCurrent: () => { reads++; return state },
      fetchVideos: async () => {
        requested.resolve()
        if (afterProvider) await provider.promise
        return { video: { title: 'Must not apply' } }
      },
      fetchChannels: async () => assert.fail('No channel lookup expected'),
      onChange: () => { changes++; return true }, onOutcome: () => { outcomes++ } })
    if (afterProvider) {
      await requested.promise
      waiting = gate.hold()
      provider.resolve()
    }
    await expectHeld(waiting, work)
    const readsAtRetirement = reads
    current = false
    waiting.release()
    assert.equal(await work, false)
    assert.equal(reads, readsAtRetirement)
    assert.equal(changes, 0)
    assert.equal(outcomes, 0)
    assert.deepEqual(state, original)
  })
}

test('activity beginning during the initial expiry save gates the next read and stale scan', { timeout: 2000 }, async () => {
  const state = profile({ expired: true })
  const gate = quietGate(), saving = deferred(), persisted = deferred()
  let reads = 0, scans = 0, providers = 0, current = state
  state.videos = new Proxy(state.videos, { ownKeys(target) { scans++; return Reflect.ownKeys(target) } })
  const work = refreshSavedYoutubeMetadata({ state, now, isCurrent: () => true,
    beforeApply: gate.beforeApply, readCurrent: () => { reads++; return current },
    fetchVideos: async () => { providers++; return {} }, fetchChannels: async () => { providers++ },
    onChange: () => { saving.resolve(); return persisted.promise } })
  await saving.promise
  assert.equal(state.videos.video.title, '', 'Initial expiry was saved while quiet')
  const scansBeforeActivity = scans, readsBeforeActivity = reads
  const waiting = gate.hold()
  persisted.resolve(true)
  await expectHeld(waiting, work)
  assert.equal(reads, readsBeforeActivity)
  assert.equal(scans, scansBeforeActivity, 'No stale-library scan begins during new activity')
  assert.equal(providers, 0)
  current = profile()
  Object.assign(current.videos.video, { title: 'Fresh metadata from the newer profile', metadataFetchedAt: freshAt })
  waiting.release()
  assert.equal(await work, true)
  assert.equal(providers, 0, 'Resuming uses the latest fresh profile instead of starting an obsolete request')
  assert.equal(state.videos.video.title, 'Fresh metadata from the newer profile')
})
