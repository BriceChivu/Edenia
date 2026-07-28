import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const source = await readFile(new URL('../../index.html', import.meta.url), 'utf8')
const buttonTags = [...source.matchAll(/<button\b[^>]*>/g)].map(match => match[0])

function findButton(translationKey) {
  const matches = buttonTags.filter(tag => (
    tag.includes(`data-i18n-aria-label="${translationKey}"`)
  ))
  assert.equal(matches.length, 1, `Expected one city zoom control for ${translationKey}`)
  return matches[0]
}

function getAttribute(tag, name) {
  return tag.match(new RegExp(`\\s${name}="([^"]*)"`))?.[1] ?? null
}

test('city zoom controls retain analytics identities without inline handlers', () => {
  const controls = [
    {
      key: 'city.zoom.out',
      action: 'out'
    },
    {
      key: 'city.zoom.reset',
      action: 'reset'
    },
    {
      key: 'city.zoom.in',
      action: 'in'
    }
  ]

  for (const expected of controls) {
    const tag = findButton(expected.key)
    assert.equal(getAttribute(tag, 'data-analytics-action'), expected.key)
    assert.equal(getAttribute(tag, 'data-city-zoom-action'), expected.action)
    assert.equal(getAttribute(tag, 'onclick'), null)
  }
})

test('city zoom controls retain exact generic click event names', () => {
  const normalize = value => String(value || '')
    .trim()
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .replace(/[^a-zA-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .toLowerCase()
    .slice(0, 80)

  assert.deepEqual(
    ['city.zoom.out', 'city.zoom.reset', 'city.zoom.in'].map(
      action => `${normalize(action)}_clicked`
    ),
    ['city_zoom_out_clicked', 'city_zoom_reset_clicked', 'city_zoom_in_clicked']
  )
})
