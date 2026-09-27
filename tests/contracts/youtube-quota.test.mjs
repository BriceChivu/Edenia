import test from 'node:test'
import assert from 'node:assert/strict'
import { createYoutubeRequestGate } from '../../src/integrations/youtube-quota.js'

const url = endpoint => `https://www.googleapis.com/youtube/v3/${endpoint}?key=test`
const quota = () => new Response(JSON.stringify({ error: { message: 'Quota exhausted', errors: [{ reason: 'quotaExceeded' }] } }), { status: 403 })

test('daily exhaustion stops queued requests in its bucket until Pacific reset, including reload', async () => {
  let now = Date.parse('2026-03-08T08:00:00Z')
  let requests = 0
  const values = new Map()
  const options = {
    now: () => now,
    storage: { getItem: key => values.get(key), setItem: (key, value) => values.set(key, value) },
    fetch: async () => { requests++; return requests === 1 ? quota() : new Response('{"items":[]}') }
  }
  const gate = createYoutubeRequestGate(options)
  const results = await Promise.allSettled([gate(url('videos')), gate(url('channels')), gate(url('playlistItems'))])
  assert.equal(requests, 1)
  assert.ok(results.every(result => result.status === 'rejected'))
  assert.equal(results[0].reason.retryAt, Date.parse('2026-03-09T07:00:00Z'))
  assert.deepEqual(results[0].reason.reasons, ['quotaExceeded'])
  const reloaded = createYoutubeRequestGate(options)
  await assert.rejects(reloaded(url('videos')), { kind: 'daily-quota' })
  await reloaded(url('search'))
  assert.equal(requests, 2)
  now = Date.parse('2026-03-09T07:00:00Z')
  await reloaded(url('videos'))
  assert.equal(requests, 3)
})

test('fall-back reset and non-quota failures retain structured reasons without daily blocking', async () => {
  for (const [status, reason, kind] of [[403, 'userRateLimitExceeded', 'rate-limit'], [400, 'keyInvalid', 'credentials'], [404, 'videoNotFound', 'unavailable'], [503, 'backendError', 'provider']]) {
    let calls = 0
    const request = createYoutubeRequestGate({ storage: null, fetch: async () => {
      calls++
      return calls === 1 ? new Response(JSON.stringify({ error: { errors: [{ reason }] } }), { status }) : new Response('{}')
    } })
    await assert.rejects(request(url('videos')), error => error.kind === kind && error.reasons[0] === reason && error.status === status)
    await request(url('videos'))
    assert.equal(calls, 2)
  }
  const request = createYoutubeRequestGate({ storage: null, now: () => Date.parse('2026-11-01T07:00:00Z'), fetch: async () => quota() })
  await assert.rejects(request(url('search')), error => error.retryAt === Date.parse('2026-11-02T08:00:00Z'))
})

test('network failure permits recovery and storage failure still protects concurrent callers', async () => {
  let calls = 0
  const request = createYoutubeRequestGate({ storage: { getItem() { throw Error('disabled') }, setItem() { throw Error('disabled') } }, fetch: async () => {
    if (++calls === 1) throw new TypeError('Network unavailable')
    return quota()
  } })
  await assert.rejects(request(url('videos')), /Network unavailable/)
  await Promise.allSettled([request(url('videos')), request(url('channels'))])
  assert.equal(calls, 2)
})

test('quota failure leaves undated saved metadata and study records intact', async () => {
  const { refreshSavedYoutubeMetadata } = await import('../../src/integrations/youtube-metadata-cache.js')
  const state = { videos: { saved: { id: 'saved', title: 'Saved lesson', duration: 600, favorite: true, resumeAtSeconds: 42 } }, config: { channels: [] } }
  const before = structuredClone(state.videos)
  await refreshSavedYoutubeMetadata({ state, isCurrent: () => true, fetchVideos: async () => { throw Object.assign(new Error('Quota'), { kind: 'daily-quota' }) }, fetchChannels: async () => {} })
  assert.deepEqual(state.videos, before)
})
