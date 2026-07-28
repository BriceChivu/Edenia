import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const source = await readFile(new URL('../../index.html', import.meta.url), 'utf8')
const buttonTags = [...source.matchAll(/<button\b[^>]*>/g)].map(match => match[0])
const divTags = [...source.matchAll(/<div\b[^>]*>/g)].map(match => match[0])

function findTag(tags, marker) {
  const matches = tags.filter(tag => tag.includes(marker))
  assert.equal(matches.length, 1, `Expected one Settings shell control for ${marker}`)
  return matches[0]
}

function getAttribute(tag, name) {
  return tag.match(new RegExp(`\\s${name}="([^"]*)"`))?.[1] ?? null
}

test('Settings shell controls lock tracked identities and retain inline handlers', () => {
  const opener = findTag(buttonTags, 'class="btn-icon gear-btn"')
  assert.equal(getAttribute(opener, 'data-analytics-action'), 'header.settings')
  assert.equal(getAttribute(opener, 'onclick'), 'openSettings()')

  const closeButton = findTag(buttonTags, 'id="settingsCloseBtn"')
  assert.equal(
    getAttribute(closeButton, 'data-analytics-action'),
    'settings.close'
  )
  assert.equal(getAttribute(closeButton, 'onclick'), 'closeSettings()')

  const overlay = findTag(divTags, 'class="settings-overlay"')
  assert.equal(getAttribute(overlay, 'data-analytics-action'), null)
  assert.equal(getAttribute(overlay, 'onclick'), 'closeSettings()')
})

test('Settings shell tracked controls retain exact generic event names', () => {
  const normalize = value => String(value || '')
    .trim()
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .replace(/[^a-zA-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .toLowerCase()
    .slice(0, 80)

  assert.deepEqual(
    ['header.settings', 'settings.close'].map(
      action => `${normalize(action)}_clicked`
    ),
    ['header_settings_clicked', 'settings_close_clicked']
  )
})
