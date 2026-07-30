import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const source = await readFile(
  new URL('../../src/app.js', import.meta.url),
  'utf8'
)
const control = source.match(
  /<button type="button" class="history-video-popover-item"[^>]*>/
)?.[0] || ''

function getAttribute(tag, name) {
  return tag.match(new RegExp(`\\s${name}="([^"]*)"`))?.[1] ?? null
}

test('watched video item retains live identity without inline ownership', () => {
  assert.notEqual(control, '')
  assert.equal(getAttribute(control, 'type'), 'button')
  assert.equal(
    getAttribute(control, 'data-history-watched-video-action'),
    'jump'
  )
  assert.equal(
    getAttribute(control, 'data-video-id'),
    '${escHtml(video.id)}'
  )
  assert.equal(getAttribute(control, 'onclick'), null)
  assert.equal(getAttribute(control, 'data-analytics-action'), null)
})

test('watched video item retains its localized visible content contract', () => {
  assert.match(
    source,
    /<span class="history-video-title">\$\{escHtml\(video\.title\)\}<\/span>/
  )
  assert.match(
    source,
    /<span class="history-video-duration">\$\{formatDuration\(video\.duration\)\}<\/span>/
  )
})
