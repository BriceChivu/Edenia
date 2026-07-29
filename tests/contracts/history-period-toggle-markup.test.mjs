import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const source = await readFile(new URL('../../index.html', import.meta.url), 'utf8')
const buttonTags = [...source.matchAll(/<button\b[^>]*>/g)].map(match => match[0])

function getAttribute(tag, name) {
  return tag.match(new RegExp(`\\s${name}="([^"]*)"`))?.[1] ?? null
}

const expectedControls = {
  week: {
    ariaLabel: 'Select week',
    translationKey: 'history.selectWeek'
  },
  month: {
    ariaLabel: 'Select month',
    translationKey: 'history.selectMonth'
  }
}

test('Study History period toggles retain exact static markup without inline handlers', () => {
  Object.entries(expectedControls).forEach(([range, expected]) => {
    const controls = buttonTags.filter(tag => (
      getAttribute(tag, 'data-history-range') === range
    ))
    assert.equal(controls.length, 1)
    const [control] = controls
    assert.equal(getAttribute(control, 'type'), 'button')
    assert.equal(
      getAttribute(control, 'data-history-period-action'),
      'toggle'
    )
    assert.equal(getAttribute(control, 'aria-expanded'), 'false')
    assert.equal(getAttribute(control, 'aria-label'), expected.ariaLabel)
    assert.equal(
      getAttribute(control, 'data-i18n-aria-label'),
      expected.translationKey
    )
    assert.equal(getAttribute(control, 'onclick'), null)
    assert.equal(getAttribute(control, 'data-analytics-action'), null)
  })
})

test('Study History period toggle ownership remains limited to two controls', () => {
  const controls = buttonTags.filter(tag => (
    getAttribute(tag, 'data-history-period-action') === 'toggle'
  ))
  assert.deepEqual(
    controls.map(control => getAttribute(control, 'data-history-range')),
    ['week', 'month']
  )
})
