import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const source = await readFile(new URL('../../index.html', import.meta.url), 'utf8')
const buttonTags = [...source.matchAll(/<button\b[^>]*>/g)].map(match => match[0])
const buttonElements = [...source.matchAll(/<button\b[^>]*>[\s\S]*?<\/button>/g)]
  .map(match => match[0])

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

test('city zoom controls use platform-independent SVG icons', () => {
  const controls = [
    {
      key: 'city.zoom.out',
      path: 'M5 12h14'
    },
    {
      key: 'city.zoom.reset',
      path: 'm4 10 8-6 8 6v9a1 1 0 0 1-1 1h-5v-6h-4v6H5a1 1 0 0 1-1-1Z'
    },
    {
      key: 'city.zoom.in',
      path: 'M5 12h14M12 5v14'
    }
  ]

  for (const expected of controls) {
    const matches = buttonElements.filter(element => (
      element.includes(`data-i18n-aria-label="${expected.key}"`)
    ))
    assert.equal(matches.length, 1, `Expected one city zoom control for ${expected.key}`)
    const icon = matches[0].match(/<svg\b[^>]*>[\s\S]*?<\/svg>/)?.[0] ?? ''
    assert.equal(
      icon.replace(/\s+/g, ' ').trim(),
      `<svg class="city-image-icon" viewBox="0 0 24 24" aria-hidden="true"> `
        + `<path d="${expected.path}"></path> </svg>`
    )
  }
})

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
