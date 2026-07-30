import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const indexSource = await readFile(
  new URL('../../index.html', import.meta.url),
  'utf8'
)
const appSource = await readFile(
  new URL('../../src/app.js', import.meta.url),
  'utf8'
)

function getButtonElements(source) {
  return [...source.matchAll(/<button\b[^>]*>[\s\S]*?<\/button>/g)]
    .map(match => match[0])
}

function getOpeningTag(element) {
  return element.match(/^<button\b[^>]*>/)?.[0] ?? ''
}

function getInputTags(source) {
  return [...source.matchAll(/<input\b[^>]*>/g)].map(match => match[0])
}

function getAttribute(tag, name) {
  return tag.match(new RegExp(`\\s${name}="([^"]*)"`))?.[1] ?? null
}

function findSingleButton(elements, predicate, description) {
  const matches = elements.filter(element => predicate(getOpeningTag(element)))
  assert.equal(matches.length, 1, `Expected one ${description}`)
  return matches[0]
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

test('static status tabs retain translated analytics identities without inline handlers', () => {
  const buttonElements = getButtonElements(indexSource)
  const expectedTabs = [
    {
      status: 'all',
      action: 'videos.status.all'
    },
    {
      status: 'unwatched',
      action: 'videos.status.unwatched'
    },
    {
      status: 'partial',
      action: 'videos.status.partial'
    },
    {
      status: 'watch-later',
      action: 'videos.status.watchLater'
    },
    {
      status: 'favorite',
      action: 'videos.status.favorite'
    }
  ]

  for (const expected of expectedTabs) {
    const element = findSingleButton(
      buttonElements,
      tag => getAttribute(tag, 'data-status-tab') === expected.status,
      `${expected.status} status tab`
    )
    const tag = getOpeningTag(element)
    assert.equal(
      getAttribute(tag, 'data-analytics-action'),
      expected.action
    )
    assert.equal(getAttribute(tag, 'onclick'), null)
    assert.match(
      element,
      new RegExp(`<span data-i18n="${expected.action}">`)
    )
  }
})

test('status controls retain exact generic click event names', () => {
  const indexButtons = getButtonElements(indexSource)
  const appButtons = getButtonElements(appSource)
  const expectedTabs = [
    ['all', 'videos_status_all_clicked'],
    ['unwatched', 'videos_status_unwatched_clicked'],
    ['partial', 'videos_status_partial_clicked'],
    ['watch-later', 'videos_status_watch_later_clicked'],
    ['favorite', 'videos_status_favorite_clicked']
  ]

  for (const [status, eventName] of expectedTabs) {
    const element = findSingleButton(
      indexButtons,
      tag => getAttribute(tag, 'data-status-tab') === status,
      `${status} status tab`
    )
    const action = getAttribute(getOpeningTag(element), 'data-analytics-action')
    assert.equal(normalizeClickEventName(action), eventName)
  }

  const toggleElement = findSingleButton(
    indexButtons,
    tag => getAttribute(tag, 'id') === 'statusFilterBtn',
    '#statusFilterBtn'
  )
  const toggle = getOpeningTag(toggleElement)
  assert.equal(getAttribute(toggle, 'data-analytics-action'), 'statusFilterBtn')
  assert.equal(getAttribute(toggle, 'onclick'), null)
  assert.equal(
    normalizeClickEventName(getAttribute(toggle, 'data-analytics-action')),
    'status_filter_btn_clicked'
  )

  const closeElement = findSingleButton(
    appButtons,
    tag => getAttribute(tag, 'data-status-filter-action') === 'close',
    'generated status-filter close control'
  )
  const close = getOpeningTag(closeElement)
  assert.equal(
    getAttribute(close, 'data-analytics-action'),
    'closeStatusFilterMenu'
  )
  assert.equal(getAttribute(close, 'onclick'), null)
  assert.equal(
    normalizeClickEventName(getAttribute(close, 'data-analytics-action')),
    'close_status_filter_menu_clicked'
  )
})

test('generated status radios retain behavior hooks without analytics metadata', () => {
  const statusRadios = getInputTags(appSource).filter(tag => (
    getAttribute(tag, 'name') === 'statusFilter'
  ))
  assert.equal(statusRadios.length, 1)

  const [radio] = statusRadios
  assert.equal(getAttribute(radio, 'type'), 'radio')
  assert.equal(getAttribute(radio, 'data-status'), '${value}')
  assert.equal(getAttribute(radio, 'onchange'), null)
  assert.equal(getAttribute(radio, 'data-analytics-action'), null)
})
