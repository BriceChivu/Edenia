import test from 'node:test'
import assert from 'node:assert/strict'
import { createYoutubeMetadataBudget } from '../../src/integrations/youtube-metadata-budget.js'
const time = Date.parse('2026-09-28T08:00:00Z')
function storage() { const data = new Map(); return { getItem: key => data.get(key) || null, setItem: (key, value) => data.set(key, value) } }
function locks() { let pending = Promise.resolve(); return { request: (_key, fn) => { const next = pending.then(fn); pending = next.catch(() => {}); return next } } }
const details = ids => Object.fromEntries(ids.map(id => [id, { title: id, thumbnail: 'image', metadataUnavailable: false, metadataFetchedAt: new Date(time).toISOString() }]))
test('five network batches per run, twenty per Pacific day, persisted across reloads', async () => {
  const disk = storage(); let now = time; let calls = 0
  const make = () => createYoutubeMetadataBudget({ storage: disk, locks: locks(), now: () => now })
  let budget = make()
  for (let run = 0; run < 4; run++) {
    const fetch = budget.createRun()
    for (let i = 0; i < 5; i++) await fetch('videos', [`${run}-${i}`], async ids => { calls++; return details(ids) })
    await assert.rejects(fetch('videos', ['over'], async () => { calls++; }), error => error.kind === 'recovery-budget')
    budget = make()
    now += 30 * 60_000
  }
  await assert.rejects(budget.createRun()('channels', ['c'], async () => { calls++; }), error => error.kind === 'recovery-budget')
  assert.equal(calls, 20)
  now = Date.parse('2026-09-29T07:00:00Z')
  await budget.createRun()('videos', ['new-day'], async ids => { calls++; return details(ids) })
  assert.equal(calls, 21)
})
test('two tabs share successful metadata without repeating provider requests', async () => {
  const disk = storage(), lock = locks(); let calls = 0; const requested = []
  const run = () => createYoutubeMetadataBudget({ storage: disk, locks: lock, now: () => time }).createRun()
  const provider = async ids => { calls++; requested.push(ids); return details(ids) }
  const [a,b] = await Promise.all([run()('videos', ['a','b'], provider),run()('videos', ['b','c'], provider)])
  assert.equal(calls, 2)
  assert.deepEqual(requested, [['a','b'], ['c']])
  assert.deepEqual(a, details(['a','b'])); assert.deepEqual(b, details(['b','c']))
  await run()('videos', ['a','b','c'], provider)
  assert.equal(calls, 2)
})
test('failures consume budget and share backoff without caching unavailable results', async () => {
  const disk = storage(), lock = locks(); let now = time; let calls = 0
  const make = () => createYoutubeMetadataBudget({ storage: disk, locks: lock, now: () => now })
  await assert.rejects(make().createRun()('videos', ['a'], async () => { calls++; throw Error('offline') }))
  await assert.rejects(make().createRun()('videos', ['a'], async () => { calls++; }), e => e.kind === 'recovery-budget')
  assert.equal(calls, 1)
  now += 30 * 60_000
  assert.deepEqual(await make().createRun()('videos', ['a'], async ids => { calls++; return details(ids) }), details(['a']))
  assert.equal(calls, 2)
})

test('failed reservation persistence prevents a provider call', async () => {
  let calls = 0
  const budget = createYoutubeMetadataBudget({ storage: { getItem: () => null, setItem: () => { throw Error('full') } }, now: () => time })
  await assert.rejects(budget.createRun()('videos', ['a'], async () => { calls++ }), e => e.kind === 'recovery-budget')
  assert.equal(calls, 0)
})
