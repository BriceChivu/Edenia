import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const indexSource = await readFile(
  new URL('../../index.html', import.meta.url),
  'utf8'
)

function getButtonTags(source) {
  return [...source.matchAll(/<button\b[^>]*>/g)].map(match => match[0])
}

function getAttribute(tag, name) {
  return tag.match(new RegExp(`\\s${name}="([^"]*)"`))?.[1] ?? null
}

function findSingleButton(predicate, description) {
  const matches = getButtonTags(indexSource).filter(predicate)
  assert.equal(matches.length, 1, `Expected one ${description}`)
  return matches[0]
}

function normalizeClickEventName(action) {
  return String(action || '')
    .trim()
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .replace(/[^a-zA-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .toLowerCase()
    .slice(0, 80)
}

test('saved-video search opener retains its stopped analytics identity', () => {
  const control = findSingleButton(
    tag => getAttribute(tag, 'id') === 'videoSearchBtn',
    '#videoSearchBtn'
  )
  assert.equal(
    getAttribute(control, 'data-analytics-action'),
    'header.search.title'
  )
  assert.equal(
    normalizeClickEventName(getAttribute(control, 'data-analytics-action')),
    'header_search_title'
  )
})

test('saved-video search close control retains its generic click identity', () => {
  const control = findSingleButton(
    tag => (
      getAttribute(tag, 'data-video-search-action') === 'close'
    ),
    'saved-video search close control'
  )
  assert.equal(
    getAttribute(control, 'data-analytics-action'),
    'settings.close'
  )
  assert.equal(
    normalizeClickEventName(getAttribute(control, 'data-analytics-action')),
    'settings_close'
  )
})
