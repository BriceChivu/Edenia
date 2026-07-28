import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const source = await readFile(new URL('../../index.html', import.meta.url), 'utf8')
const buttonTags = [...source.matchAll(/<button\b[^>]*>/g)].map(match => match[0])

function findButton(translationKey) {
  const matches = buttonTags.filter(tag => (
    tag.includes(`data-i18n="${translationKey}"`)
  ))
  assert.equal(matches.length, 1, `Expected one reset control for ${translationKey}`)
  return matches[0]
}

function getAttribute(tag, name) {
  return tag.match(new RegExp(`\\s${name}="([^"]*)"`))?.[1] ?? null
}

test('Settings reset-confirm controls retain analytics identities without inline handlers', () => {
  const controls = [
    {
      key: 'settings.reset.open',
      action: 'show'
    },
    {
      key: 'settings.reset.cancel',
      action: 'hide'
    }
  ]

  for (const expected of controls) {
    const tag = findButton(expected.key)
    assert.equal(getAttribute(tag, 'data-analytics-action'), expected.key)
    assert.equal(
      getAttribute(tag, 'data-settings-reset-confirm-action'),
      expected.action
    )
    assert.equal(getAttribute(tag, 'onclick'), null)
  }

  assert.equal(
    getAttribute(findButton('settings.reset.delete'), 'onclick'),
    'resetApp()'
  )
})

test('Settings reset-confirm controls retain exact generic click event names', () => {
  const normalize = value => String(value || '')
    .trim()
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .replace(/[^a-zA-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .toLowerCase()
    .slice(0, 80)

  assert.deepEqual(
    ['settings.reset.open', 'settings.reset.cancel'].map(
      action => `${normalize(action)}_clicked`
    ),
    ['settings_reset_open_clicked', 'settings_reset_cancel_clicked']
  )
})
