import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const source = await readFile(
  new URL('../../src/app.js', import.meta.url),
  'utf8'
)
const cell = source.match(
  /<span class="history-points-cell"[^>]*>/
)?.[0] || ''

function getAttribute(tag, name) {
  return tag.match(new RegExp(`\\s${name}="([^"]*)"`))?.[1] ?? null
}

test('History points cell owns its popover without inline handlers', () => {
  assert.notEqual(cell, '')
  assert.equal(
    getAttribute(cell, 'data-history-points-popover-action'),
    'toggle'
  )
  ;[
    'onmouseenter',
    'onmouseleave',
    'onfocusin',
    'onfocusout',
    'onclick'
  ].forEach(attribute => {
    assert.equal(getAttribute(cell, attribute), null)
  })
  assert.equal(getAttribute(cell, 'data-analytics-action'), null)
})

test('History points trigger retains its native and accessibility contract', () => {
  const trigger = source.match(
    /<button type="button" class="history-points-trigger"[^>]*>/
  )?.[0] || ''
  assert.notEqual(trigger, '')
  assert.equal(getAttribute(trigger, 'type'), 'button')
  assert.equal(getAttribute(trigger, 'aria-expanded'), 'false')
  assert.equal(
    getAttribute(trigger, 'aria-label'),
    '${escHtml(t(\'history.showPoints\', { date: formatHeatmapTitle(row) }))}'
  )
  assert.equal(getAttribute(trigger, 'onclick'), null)
  assert.equal(getAttribute(trigger, 'data-analytics-action'), null)
})
