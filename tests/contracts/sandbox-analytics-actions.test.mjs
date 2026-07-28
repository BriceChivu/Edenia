import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const source = await readFile(new URL('../../index.html', import.meta.url), 'utf8')
const buttonTags = [...source.matchAll(/<button\b[^>]*>/g)].map(match => match[0])

function findButton(translationKey) {
  const matches = buttonTags.filter(tag => (
    tag.includes(`data-i18n="${translationKey}"`)
  ))
  assert.equal(matches.length, 1, `Expected one sandbox control for ${translationKey}`)
  return matches[0]
}

function getAttribute(tag, name) {
  return tag.match(new RegExp(`\\s${name}="([^"]*)"`))?.[1] ?? null
}

test('sandbox controls lock pre-migration analytics identities', () => {
  const controls = [
    {
      key: 'sandbox.addDay',
      handler: 'addSandboxDay()'
    },
    {
      key: 'sandbox.reset',
      handler: 'resetSandboxState()'
    }
  ]

  for (const expected of controls) {
    const tag = findButton(expected.key)
    assert.equal(getAttribute(tag, 'data-analytics-action'), expected.key)
    assert.equal(getAttribute(tag, 'onclick'), expected.handler)
  }
})

test('sandbox controls retain exact generic click event names', () => {
  const normalize = value => String(value || '')
    .trim()
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .replace(/[^a-zA-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .toLowerCase()
    .slice(0, 80)

  assert.deepEqual(
    ['sandbox.addDay', 'sandbox.reset'].map(
      action => `${normalize(action)}_clicked`
    ),
    ['sandbox_add_day_clicked', 'sandbox_reset_clicked']
  )
})
