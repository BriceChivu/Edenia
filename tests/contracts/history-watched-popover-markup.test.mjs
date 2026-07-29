import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const source = await readFile(
  new URL('../../src/app.js', import.meta.url),
  'utf8'
)
const cellTags = [...source.matchAll(
  /<span class="history-video-cell"[^>]*>/g
)].map(match => match[0])

function getAttribute(tag, name) {
  return tag.match(new RegExp(`\\s${name}="([^"]*)"`))?.[1] ?? null
}

test('only non-empty watched cells own popover actions without inline handlers', () => {
  assert.equal(cellTags.length, 2)
  const [emptyCell, interactiveCell] = cellTags
  assert.equal(
    getAttribute(emptyCell, 'data-history-watched-popover-action'),
    null
  )
  assert.equal(
    getAttribute(interactiveCell, 'data-history-watched-popover-action'),
    'toggle'
  )
  ;[
    'onmouseenter',
    'onmouseleave',
    'onfocusin',
    'onfocusout',
    'onclick'
  ].forEach(attribute => {
    assert.equal(getAttribute(interactiveCell, attribute), null)
  })
  assert.equal(getAttribute(interactiveCell, 'data-analytics-action'), null)
})

test('watched popover trigger retains its native and accessibility contract', () => {
  const trigger = source.match(
    /<button type="button" class="history-video-count"[^>]*>/
  )?.[0] || ''
  assert.notEqual(trigger, '')
  assert.equal(getAttribute(trigger, 'type'), 'button')
  assert.equal(getAttribute(trigger, 'aria-expanded'), 'false')
  assert.equal(
    getAttribute(trigger, 'aria-label'),
    '${escHtml(t(\'history.showWatched\', { count: row.videosWatched, date: formatHeatmapTitle(row) }))}'
  )
  assert.equal(getAttribute(trigger, 'onclick'), null)
  assert.equal(getAttribute(trigger, 'data-analytics-action'), null)
})
