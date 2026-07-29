import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const appSource = await readFile(
  new URL('../../src/app.js', import.meta.url),
  'utf8'
)

function getOpeningTags(source, tagName) {
  return [...source.matchAll(new RegExp(`<${tagName}\\b[^>]*>`, 'g'))]
    .map(match => match[0])
}

function getAttribute(tag, name) {
  return tag.match(
    new RegExp(`\\s${name}=(["'])([\\s\\S]*?)\\1`)
  )?.[2] ?? null
}

function normalizeClickEventName(action) {
  return `${String(action || '')
    .trim()
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .replace(/[^a-zA-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .toLowerCase()
    .slice(0, 80)}_clicked`
}

test('Settings channel removal retains its analytics identity before migration', () => {
  const controls = getOpeningTags(appSource, 'button').filter(tag => (
    getAttribute(tag, 'class') === 'channel-remove'
  ))
  assert.equal(controls.length, 1)

  const [control] = controls
  assert.equal(getAttribute(control, 'data-channel-id'), '${escHtml(c.id)}')
  assert.equal(
    getAttribute(control, 'onclick'),
    'removeChannel(this.dataset.channelId)'
  )
  assert.equal(
    getAttribute(control, 'data-analytics-action'),
    'removeChannel'
  )
  assert.equal(
    normalizeClickEventName(
      getAttribute(control, 'data-analytics-action')
    ),
    'remove_channel_clicked'
  )
  assert.equal(
    getAttribute(control, 'title'),
    '${escHtml(t(\'settings.remove\'))}'
  )
})
