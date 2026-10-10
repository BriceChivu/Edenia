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

test('automatic insight recording times do not create a progress conflict between compatible edits', () => {
  const entry = { key: 'weekly', type: 'weekly-summary', reviewedCards: 1,
    firstRecordedAt: '2026-10-10T10:00:00.000Z', recordedAt: '2026-10-10T10:00:00.000Z' }
  const base = { config: { theme: 'light', studyInsights: { history: [entry] } }, anki: { day: { reviewed: 1 } } }
  const desired = structuredClone(base)
  desired.config.theme = 'dark'
  desired.config.studyInsights.history[0].recordedAt = '2026-10-10T10:01:00.000Z'
  const current = structuredClone(base)
  current.anki.day.reviewed = 9
  current.config.studyInsights.history[0] = { ...entry, reviewedCards: 9, recordedAt: '2026-10-10T10:02:00.000Z' }
  const merged = rebaseProfileChanges(base, desired, current)
  assert.equal(merged?.config.theme, 'dark')
  assert.equal(merged?.anki.day.reviewed, 9)
  assert.deepEqual(merged?.config.studyInsights.history, current.config.studyInsights.history)
  desired.anki.day.reviewed = 7
  assert.equal(rebaseProfileChanges(base, desired, current), null)
})

test('independently recorded insights retain both entries while a concurrent deletion remains a conflict', () => {
  const entry = { key: 'weekly', type: 'weekly-summary', recordedAt: '2026-10-10T10:00:00.000Z' }
  const profile = history => ({ config: { studyInsights: { history } } })
  const desired = { ...entry, key: 'morning', recordedAt: '2026-10-10T10:01:00.000Z' }
  const current = { ...entry, key: 'evening', recordedAt: '2026-10-10T10:02:00.000Z' }
  const merged = rebaseProfileChanges(profile([entry]), profile([entry, desired]), profile([entry, current]))
  assert.deepEqual(merged?.config.studyInsights.history.map(item => item.key), ['evening', 'morning', 'weekly'])
  assert.equal(rebaseProfileChanges(profile([entry]), profile([]), profile([{ ...entry, reviewedCards: 9 }])), null)
})
