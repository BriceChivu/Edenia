import assert from 'node:assert/strict'
import test from 'node:test'
import { rebaseProfileChanges } from '../../src/state/indexed-db-profile.js'

test('independent nested updates retain current owned facts and apply only the requested changes', () => {
  const base = { config: { theme: 'light', channels: ['a'] }, videos: { a: { favorite: false, watchProgress: [] } }, anki: {} }
  const desired = structuredClone(base)
  desired.config.theme = 'dark'
  const current = structuredClone(base)
  current.videos.a.favorite = true
  current.videos.a.watchProgress.push({ seconds: 90 })
  current.anki.day = { reviewed: 8 }
  const merged = rebaseProfileChanges(base, desired, current)
  assert.deepEqual(merged, { ...current, config: { ...current.config, theme: 'dark' } })
  assert.equal(current.config.theme, 'light')
})

test('conflicting scalar edits, array changes and deletions are rejected', () => {
  assert.equal(rebaseProfileChanges({ theme: 'light' }, { theme: 'dark' }, { theme: 'other' }), null)
  assert.equal(rebaseProfileChanges({ history: ['a'] }, { history: ['a', 'b'] }, { history: ['a', 'c'] }), null)
  assert.equal(rebaseProfileChanges({ video: { favorite: false } }, {}, { video: { favorite: true } }), null)
  assert.equal(rebaseProfileChanges({}, { video: { favorite: true } }, { video: { favorite: false } }), null)
})

test('same-value updates are idempotent and independent additions and removals retain current values', () => {
  assert.deepEqual(rebaseProfileChanges({ a: 1 }, { a: 2 }, { a: 2 }), { a: 2 })
  assert.deepEqual(rebaseProfileChanges({ removed: true, retained: 1 }, { retained: 1, added: true },
    { removed: true, retained: 2, remote: true }), { retained: 2, remote: true, added: true })
})

test('portable object keys remain data properties when rebasing', () => {
  const desired = JSON.parse('{"__proto__":{"fixture":true},"constructor":"fixture"}')
  const merged = rebaseProfileChanges({}, desired, { unrelated: true })
  assert.deepEqual(JSON.parse(JSON.stringify(merged)), { ...desired, unrelated: true })
  assert.equal(Object.getPrototypeOf(merged), Object.prototype)
})
