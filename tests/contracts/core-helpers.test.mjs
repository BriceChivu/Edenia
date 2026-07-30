import assert from 'node:assert/strict'
import test from 'node:test'
import {
  addDays,
  ANKI_DAY_START_HOUR,
  dateKeyToLocalDate,
  daysBetweenDateKeys,
  getAnkiDateKey,
  getDaysBetweenDateKeys,
  getPreviousDateKey,
  getWeekStart,
  isValidTimestamp,
  setLocalTime,
  toDateKey
} from '../../src/core/date-keys.js'
import { escHtml, escapeSvgText } from '../../src/core/escaping.js'
import { clampNumber } from '../../src/core/numbers.js'

test('HTML escaping preserves the exact legacy character contract', () => {
  assert.equal(escHtml(null), '')
  assert.equal(escHtml(undefined), '')
  assert.equal(escHtml(42), '42')
  assert.equal(
    escHtml(`&<>"'`),
    `&amp;&lt;&gt;&quot;'`
  )
  assert.equal(escHtml('&amp;'), '&amp;amp;')
})

test('SVG text escaping preserves the exact narrower legacy contract', () => {
  assert.equal(escapeSvgText(null), '')
  assert.equal(escapeSvgText(undefined), '')
  assert.equal(escapeSvgText(42), '42')
  assert.equal(
    escapeSvgText(`&<>"'`),
    `&amp;&lt;&gt;"'`
  )
  assert.equal(escapeSvgText('&amp;'), '&amp;amp;')
})

test('date keys use local calendar components and Monday week starts', () => {
  const monday = new Date(2026, 6, 27, 15, 45)
  const sunday = new Date(2026, 7, 2, 23, 59)

  assert.equal(toDateKey(monday), '2026-07-27')
  assert.equal(toDateKey(new Date(2027, 0, 1)), '2027-01-01')
  assert.equal(toDateKey(getWeekStart(monday)), '2026-07-27')
  assert.equal(toDateKey(getWeekStart(sunday)), '2026-07-27')
  assert.equal(getWeekStart(sunday).getHours(), 0)
})

test('Anki date keys preserve the local 04:00 day boundary', () => {
  assert.equal(ANKI_DAY_START_HOUR, 4)
  assert.equal(getAnkiDateKey(new Date(2026, 6, 28, 3, 59)), '2026-07-27')
  assert.equal(getAnkiDateKey(new Date(2026, 6, 28, 4, 0)), '2026-07-28')
  assert.equal(getAnkiDateKey(new Date(2027, 0, 1, 0, 30)), '2026-12-31')
})

test('local date-key arithmetic preserves rollovers and signed differences', () => {
  const leapDay = dateKeyToLocalDate('2028-02-29')
  assert.equal(toDateKey(leapDay), '2028-02-29')
  assert.equal(getPreviousDateKey('2027-01-01'), '2026-12-31')
  assert.equal(toDateKey(addDays(new Date(2028, 1, 28), 1)), '2028-02-29')
  assert.equal(toDateKey(addDays(new Date(2028, 1, 29), 1)), '2028-03-01')

  for (const difference of [getDaysBetweenDateKeys, daysBetweenDateKeys]) {
    assert.equal(difference('2026-12-31', '2027-01-02'), 2)
    assert.equal(difference('2027-01-02', '2026-12-31'), -2)
    assert.equal(difference('2027-01-02', '2027-01-02'), 0)
  }
})

test('time setters clone inputs and timestamp validation remains permissive', () => {
  const original = new Date(2026, 6, 28, 9, 30, 15, 250)
  const adjusted = setLocalTime(original, 21, 7)

  assert.notEqual(adjusted, original)
  assert.equal(original.getHours(), 9)
  assert.equal(adjusted.getHours(), 21)
  assert.equal(adjusted.getMinutes(), 7)
  assert.equal(adjusted.getSeconds(), 0)
  assert.equal(adjusted.getMilliseconds(), 0)

  assert.equal(isValidTimestamp('2026-07-28T04:00:00.000Z'), true)
  assert.equal(isValidTimestamp(new Date('2026-07-28T04:00:00.000Z')), true)
  assert.equal(isValidTimestamp('not-a-date'), false)
  assert.equal(isValidTimestamp(''), false)
  assert.equal(isValidTimestamp(null), false)
  assert.equal(isValidTimestamp(0), false)
})

test('numeric clamping preserves coercion and boundary behavior', () => {
  assert.equal(clampNumber(5, 0, 10), 5)
  assert.equal(clampNumber(-1, 0, 10), 0)
  assert.equal(clampNumber(11, 0, 10), 10)
  assert.equal(clampNumber('7', 0, 10), 7)
  assert.equal(clampNumber(Infinity, 0, 10), 10)
  assert.equal(clampNumber(5, 10, 0), 10)
  assert.equal(Number.isNaN(clampNumber('invalid', 0, 10)), true)
})
