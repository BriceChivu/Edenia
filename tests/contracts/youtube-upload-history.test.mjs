import test from 'node:test'
import assert from 'node:assert/strict'
import { fetchOlderUploads } from '../../src/integrations/youtube-upload-history.js'

const ids = Array.from({ length: 260 }, (_, i) => `video-${i}`)
function fixture(uploads = ids) {
  const requests = []
  return { requests, fetchPage: async (token = '') => {
    requests.push(token)
    const offset = Number(token)
    return { videos: uploads.slice(offset, offset + 50).map(id => ({ id })), nextPageToken: offset + 50 < uploads.length ? String(offset + 50) : null }
  } }
}
const history = { pageToken: '50', anchorIds: ids.slice(50, 100), nextPageToken: '100' }
test('history resumes from its retained boundary with a bounded batch and unique identities', async () => {
  const f = fixture()
  const result = await fetchOlderUploads({ ...f, history })
  assert.deepEqual(f.requests, ['50', '100', '150'])
  assert.deepEqual(result.videos.map(v => v.id), ids.slice(50, 200))
  assert.equal(result.history.nextPageToken, '200')
  assert.equal(result.exhausted, false)
  const end = await fetchOlderUploads({ ...f, history: JSON.parse(JSON.stringify(result.history)) })
  assert.deepEqual(end.videos.map(v => v.id), ids.slice(150))
  assert.equal(end.exhausted, true)
})

test('changed and retired cursors recover across bounded attempts without losing surviving uploads', async () => {
  for (const changed of [ids.slice(80), [...Array.from({ length: 160 }, (_, i) => `new-${i}`), ...ids]]) {
    const f = fixture(changed)
    let cursor = history
    const saved = new Set(ids.slice(0, 100))
    for (let attempt = 0; attempt < 10; attempt++) {
      const before = f.requests.length
      const result = await fetchOlderUploads({ ...f, history: cursor })
      result.videos.forEach(v => saved.add(v.id))
      cursor = JSON.parse(JSON.stringify(result.history))
      assert.ok(f.requests.length - before <= 3)
      if (result.exhausted) break
    }
    assert.ok(changed.every(id => saved.has(id)))
    assert.equal(cursor.exhausted, true)
  }
  const f = fixture()
  const result = await fetchOlderUploads({ history: { ...history, pageToken: 'retired' }, fetchPage: token => {
    if (token === 'retired') throw Object.assign(Error('invalid'), { reasons: ['invalidPageToken'] })
    return f.fetchPage(token)
  } })
  assert.deepEqual(result.videos.map(v => v.id), ids.slice(0, 100))
})

test('duplicates, exhausted history, and failures never lose or falsely finish coverage', async () => {
  const f = fixture([...ids.slice(0, 50), ...ids.slice(30, 100)])
  const result = await fetchOlderUploads(f)
  assert.deepEqual(result.videos.map(v => v.id), ids.slice(0, 100))
  assert.equal(result.exhausted, true)
  const before = f.requests.length
  await fetchOlderUploads({ ...f, history: result.history })
  assert.equal(f.requests.length, before)
  const original = structuredClone(history)
  await assert.rejects(fetchOlderUploads({ history, fetchPage: async () => { throw Error('network failure') } }), /network failure/)
  assert.deepEqual(history, original)
  await assert.rejects(fetchOlderUploads({ fetchPage: async () => ({ videos: [{ id: 'a' }], nextPageToken: 'loop' }) }), /repeated/)
})

test('small playlist shifts retain overlap and leave no gaps in older uploads', async () => {
  for (const uploads of [['fresh', ...ids], ids.slice(7)]) {
    const f = fixture(uploads)
    const result = await fetchOlderUploads({ ...f, history })
    const saved = new Set([...ids.slice(0, 100), ...result.videos.map(video => video.id)])
    assert.ok(ids.slice(0, 190).every(id => saved.has(id)))
    assert.equal(f.requests.length, 3)
    assert.equal(f.requests[0], '50')
  }
})

test('a repeated next cursor at the allowance boundary is a retryable failure', async () => {
  await assert.rejects(fetchOlderUploads({ fetchPage: async token => ({
    videos: [{ id: token || 'head' }],
    nextPageToken: token === 'second' ? 'third' : token === 'third' ? 'second' : 'second'
  }) }), /repeated/)
})

test('a successful initial upload check with no next page already proves exhaustion', async () => {
  const result = await fetchOlderUploads({
    history: { pageToken: '', anchorIds: ['only'], nextPageToken: null },
    fetchPage: () => { throw Error('An exhausted initial batch must not be requested again') }
  })
  assert.equal(result.exhausted, true)
  assert.deepEqual(result.videos, [])
})

test('malformed retained cursors cannot falsely report an exhausted channel', async () => {
  const f = fixture(ids.slice(0, 75))
  const result = await fetchOlderUploads({ ...f, history: { pageToken: 123, anchorIds: 'video', exhausted: 'yes' } })
  assert.deepEqual(result.videos.map(video => video.id), ids.slice(0, 75))
  assert.deepEqual(f.requests, ['', '50'])
})
