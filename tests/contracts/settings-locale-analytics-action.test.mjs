import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const source = await readFile(new URL('../../index.html', import.meta.url), 'utf8')
const buttonTags = [...source.matchAll(/<button\b[^>]*>/g)].map(match => match[0])
const controls = buttonTags.filter(tag => (
  tag.includes('id="settingsLocaleBtn"')
))

function getAttribute(tag, name) {
  return tag.match(new RegExp(`\\s${name}="([^"]*)"`))?.[1] ?? null
}

test('Settings locale trigger locks its identity before listener migration', () => {
  assert.equal(controls.length, 1)
  const [control] = controls
  assert.equal(
    getAttribute(control, 'data-analytics-action'),
    'settingsLocaleBtn'
  )
  assert.equal(getAttribute(control, 'onclick'), 'toggleLocaleMenu(event)')
  assert.equal(getAttribute(control, 'type'), 'button')
  assert.equal(getAttribute(control, 'aria-haspopup'), 'true')
  assert.equal(getAttribute(control, 'aria-expanded'), 'false')
})

test('Settings locale trigger retains its exact latent generic event name', () => {
  const eventName = 'settingsLocaleBtn'
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .replace(/[^a-zA-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .toLowerCase()
    .slice(0, 80)
  assert.equal(`${eventName}_clicked`, 'settings_locale_btn_clicked')
})
