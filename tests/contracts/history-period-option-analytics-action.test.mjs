import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const source = await readFile(new URL('../../src/app.js', import.meta.url), 'utf8')
const buttonTags = [...source.matchAll(/<button\b[^>]*>/g)].map(match => match[0])
const controls = buttonTags.filter(tag => (
  tag.match(/\sclass="([^"]*)"/)?.[1]
    .split(/\s+/)
    .includes('history-period-option')
))

function getAttribute(tag, name) {
  return tag.match(new RegExp(`\\s${name}="([^"]*)"`))?.[1] ?? null
}

test('history-period option retains its identity without an inline handler', () => {
  assert.equal(controls.length, 1)
  const [control] = controls
  assert.equal(
    getAttribute(control, 'data-analytics-action'),
    'setHistoryPeriodForRange'
  )
  assert.equal(
    getAttribute(control, 'data-history-period-action'),
    'select'
  )
  assert.equal(getAttribute(control, 'data-history-range'), '${range}')
  assert.equal(
    getAttribute(control, 'data-history-period-key'),
    '${escHtml(option.key)}'
  )
  assert.equal(getAttribute(control, 'onclick'), null)
  assert.equal(getAttribute(control, 'type'), 'button')
})

test('history-period option retains its exact generic event name', () => {
  const eventName = 'setHistoryPeriodForRange'
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .replace(/[^a-zA-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .toLowerCase()
    .slice(0, 80)
  assert.equal(
    `${eventName}_clicked`,
    'set_history_period_for_range_clicked'
  )
})
