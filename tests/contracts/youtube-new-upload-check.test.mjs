import test from 'node:test'
import assert from 'node:assert/strict'
import { checkNewUploads } from '../../src/integrations/youtube-upload-check.js'
const ids = (n, prefix = 'old') => Array.from({ length: n }, (_, i) => `${prefix}-${i}`)
function fixture(initial) {
  let uploads = initial
  const requests = []
  return {
    requests,
    set: value => { uploads = value },
    fetchPage: async (token = '') => {
      requests.push(token)
      const start = Number(token)
      return { videos: uploads.slice(start, start + 50).map(id => ({ id })), nextPageToken: start + 50 < uploads.length ? String(start + 50) : null }
    }
  }
}
test('unchanged 7000-video history takes one request and never expands', async () => {
  const f = fixture(ids(7100))
  const result = await checkNewUploads({ ...f, coverage: { headIds: ids(50) } })
  assert.equal(f.requests.length, 1)
  assert.deepEqual(result.videos, [])
})
test('initial usable batch does not treat an individually saved video as coverage', async () => {
  const f = fixture(ids(120))
  const result = await checkNewUploads(f)
  assert.equal(result.videos.length, 50)
  assert.equal(f.requests.length, 1)
  assert.equal(result.coverage.history.nextPageToken, '50')
})
test('bounded catch-up survives reload and playlist shifts without gaps', async () => {
  const old = ids(7000)
  const fresh = ids(370, 'new')
  const f = fixture([...fresh, ...old])
  let coverage = { headIds: old.slice(0, 50) }
  const saved = new Set()
  for (let turn = 0; turn < 6; turn++) {
    const before = f.requests.length
    const result = await checkNewUploads({ ...f, coverage: JSON.parse(JSON.stringify(coverage)) })
    result.videos.forEach(v => saved.add(v.id))
    coverage = result.coverage
    assert.ok(f.requests.length - before <= 3)
    if (turn === 0) f.set(['later', ...fresh, ...old])
    if (!coverage.pending) break
  }
  assert.deepEqual([...saved].sort(), fresh.sort())
  const next = await checkNewUploads({ ...f, coverage })
  assert.deepEqual(next.videos.map(v => v.id), ['later'])
})
test('deletions invalidating a continuation restart within the request allowance', async () => {
  const fresh = ids(400, 'new')
  const f = fixture([...fresh, ...ids(100)])
  const first = await checkNewUploads({ ...f, coverage: { headIds: ids(50) } })
  f.set([...fresh.slice(170), ...ids(100)])
  const result = await checkNewUploads({ ...f, coverage: first.coverage })
  assert.ok(f.requests.length <= 6)
  assert.deepEqual(result.videos.map(v => v.id), fresh.slice(170, 270))
})
test('duplicates are merged once and transient failures do not advance saved coverage', async () => {
  const coverage = { headIds: ids(50) }
  const before = structuredClone(coverage)
  const f = fixture([...ids(70, 'new'), ...ids(70, 'new'), ...ids(100)])
  const result = await checkNewUploads({ ...f, coverage })
  assert.equal(new Set(result.videos.map(v => v.id)).size, result.videos.length)
  await assert.rejects(checkNewUploads({ coverage, fetchPage: async () => { throw Error('Network failure') } }))
  assert.deepEqual(coverage, before)
})
test('structured invalid-cursor errors restart within the bounded allowance', async () => {
  const f = fixture([...ids(100, 'new'), ...ids(100)])
  const fetchPage = async token => {
    if (token === 'retired') throw Object.assign(Error('The page token is invalid.'), { reasons: ['invalidPageToken'] })
    return f.fetchPage(token)
  }
  const result = await checkNewUploads({ fetchPage, coverage: { headIds: ids(50), pending: { pageToken: 'retired', anchorIds: ['gone'], headIds: ['head'] } } })
  assert.equal(result.videos.length, 100)
  assert.ok(result.coverage.pending)
  assert.equal(f.requests.length, 2)
})
