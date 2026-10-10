import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import vm from 'node:vm'
import { historyExperience } from '../../src/domain/experience.js'

const source = await readFile(new URL('../../src/app.js', import.meta.url), 'utf8')
const formatter = source.match(/function formatHistoryPointNumber\(points\) \{[\s\S]*?\n\}/)?.[0]
const rendering = source.match(/setText\('historyAnkiCreated',[\s\S]*?(?=\n  if \(thirdStatLabel\))/)?.[0]
assert.ok(formatter)
assert.ok(rendering)

function renderSummary({ points, locale = 'zh-Hant', restricted = false, anki = false, created = 0 }) {
  const values = new Map()
  const context = vm.createContext({
    Intl,
    getCurrentLocale: () => locale,
    isHistoryRestricted: restricted,
    showAnkiColumns: anki,
    history: restricted ? null : { summary: { points, ankiCreated: created } },
    setText: (id, value) => values.set(id, String(value))
  })
  vm.runInContext(`${formatter}\n${rendering}`, context)
  return values.get('historyAnkiCreated')
}

test('XP summary formats fractional study XP without changing the earned value', () => {
  const points = historyExperience({ experienceSeconds: 12014, experienceReviews: 0 })
  assert.equal(renderSummary({ points }), '200')
  assert.equal(renderSummary({ points: 200.8 }), '201')
  assert.equal(renderSummary({ points: 0 }), '0')
  assert.equal(renderSummary({ points: 1234.2, locale: 'en' }), '1,234')
  assert.equal(points, 12014 / 60)
})

test('XP summary preserves restricted placeholders and Anki card counts', () => {
  assert.equal(renderSummary({ restricted: true }), '••')
  assert.equal(renderSummary({ points: 200.23, anki: true, created: 7 }), '7')
})
