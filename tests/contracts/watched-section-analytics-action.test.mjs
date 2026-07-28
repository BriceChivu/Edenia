import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const source = await readFile(new URL('../../index.html', import.meta.url), 'utf8')
const buttonTags = [...source.matchAll(/<button\b[^>]*>/g)].map(match => match[0])
const controls = buttonTags.filter(tag => tag.includes('id="watchedSectionToggle"'))

function getAttribute(tag, name) {
  return tag.match(new RegExp(`\\s${name}="([^"]*)"`))?.[1] ?? null
}

test('watched-section disclosure retains its identity without an inline handler', () => {
  assert.equal(controls.length, 1)
  const [control] = controls
  assert.equal(
    getAttribute(control, 'data-watched-section-action'),
    'toggle'
  )
  assert.equal(
    getAttribute(control, 'data-analytics-action'),
    'videos.watched.hide'
  )
  assert.equal(
    getAttribute(control, 'data-i18n-aria-label'),
    'videos.watched.hide'
  )
  assert.equal(getAttribute(control, 'onclick'), null)
})

test('watched-section disclosure retains its exact generic event name', () => {
  const eventName = 'videos.watched.hide'
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .replace(/[^a-zA-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .toLowerCase()
    .slice(0, 80)
  assert.equal(`${eventName}_clicked`, 'videos_watched_hide_clicked')
})
