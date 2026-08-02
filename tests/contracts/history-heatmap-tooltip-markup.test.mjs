import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const source = await readFile(
  new URL('../../src/app.js', import.meta.url),
  'utf8'
)
const day = source.match(
  /<button type="button" class="heatmap-day[^>]*data-history-heatmap-action="tooltip"[^>]*>/
)?.[0] || ''

function getAttribute(tag, name) {
  return tag.match(new RegExp(`\\s${name}="([^"]*)"`))?.[1] ?? null
}

test('heatmap day retains its complete live data and accessibility contract', () => {
  assert.notEqual(day, '')
  assert.equal(getAttribute(day, 'type'), 'button')
  assert.equal(
    getAttribute(day, 'data-history-heatmap-action'),
    'tooltip'
  )
  assert.equal(
    getAttribute(day, 'data-date'),
    '${escHtml(formatHeatmapTitle(row))}'
  )
  assert.equal(getAttribute(day, 'data-points'), '${getHistoryDayPoints(row)}')
  assert.equal(
    getAttribute(day, 'data-streak-days'),
    '${streakDayCount || \'\'}'
  )
  assert.equal(
    getAttribute(day, 'data-time'),
    '${escHtml(formatHistoryTime(row.secondsWatched))}'
  )
  assert.equal(getAttribute(day, 'data-videos'), '${row.videosWatched}')
  assert.equal(
    getAttribute(day, 'data-anki-enabled'),
    '${showAnkiForRow ? \'true\' : \'false\'}'
  )
  assert.equal(getAttribute(day, 'data-reviewed'), '${row.ankiReviewed}')
  assert.equal(getAttribute(day, 'data-created'), '${row.ankiCreated}')
  assert.equal(
    getAttribute(day, 'aria-label'),
    '${escHtml(formatHeatmapAriaLabel(row, showAnkiForRow))}'
  )
})

test('heatmap day has scoped ownership without analytics or inline handlers', () => {
  ;[
    'onmouseenter',
    'onmousemove',
    'onmouseleave',
    'onclick',
    'onfocus',
    'onblur'
  ].forEach(attribute => {
    assert.equal(getAttribute(day, attribute), null)
  })
  assert.equal(getAttribute(day, 'data-analytics-action'), null)
})
