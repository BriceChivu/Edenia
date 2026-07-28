import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const source = await readFile(new URL('../../index.html', import.meta.url), 'utf8')
const inputTags = [...source.matchAll(/<input\b[^>]*>/g)].map(match => match[0])

function getAttribute(tag, name) {
  return tag.match(new RegExp(`\\s${name}="([^"]*)"`))?.[1] ?? null
}

const expectedControls = {
  settingsIncludeShorts: 'settings.shorts.label',
  settingsAnkiEnabled: 'settings.anki.enabled',
  settingsInsightsEnabled: 'settings.insights.enabled'
}

test('Settings preference controls retain exact checkbox and label contracts', () => {
  Object.entries(expectedControls).forEach(([id, translationKey]) => {
    const controls = inputTags.filter(tag => getAttribute(tag, 'id') === id)
    assert.equal(controls.length, 1)
    const [control] = controls
    assert.equal(getAttribute(control, 'type'), 'checkbox')
    assert.equal(
      getAttribute(control, 'data-settings-preference-action'),
      'save'
    )
    assert.equal(getAttribute(control, 'onchange'), null)
    assert.match(
      source,
      new RegExp(
        `<label class="settings-check">\\s*${control.replace(
          /[.*+?^${}()|[\]\\]/g,
          '\\$&'
        )}\\s*<span data-i18n="${translationKey}">`
      )
    )
  })
})

test('Settings preference controls do not invent generic analytics actions', () => {
  Object.keys(expectedControls).forEach(id => {
    const control = inputTags.find(tag => getAttribute(tag, 'id') === id)
    assert.equal(getAttribute(control, 'data-analytics-action'), null)
  })
})
