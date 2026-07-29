import assert from 'node:assert/strict'
import { readdir, readFile } from 'node:fs/promises'
import { extname } from 'node:path'
import test from 'node:test'
import {
  GLOBAL_ACTION_NAMES
} from '../../src/core/global-action-contract.js'

const indexSource = await readFile(
  new URL('../../index.html', import.meta.url),
  'utf8'
)
const appSource = await readFile(
  new URL('../../src/app.js', import.meta.url),
  'utf8'
)

function getAttribute(tag, name) {
  return tag.match(new RegExp(`\\s${name}="([^"]*)"`))?.[1] ?? null
}

function getButtonElements(source) {
  return [...source.matchAll(/<button\b[^>]*>[\s\S]*?<\/button>/g)]
    .map(match => match[0])
}

function getOpeningTag(element) {
  return element.match(/^<button\b[^>]*>/)?.[0] ?? ''
}

function findSingle(elements, predicate, description) {
  const matches = elements.filter(predicate)
  assert.equal(matches.length, 1, `Expected one ${description}`)
  return matches[0]
}

async function getJavaScriptFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true })
  const nestedFiles = await Promise.all(entries.map(entry => {
    const url = new URL(`${entry.name}${entry.isDirectory() ? '/' : ''}`, directory)
    if (entry.isDirectory()) return getJavaScriptFiles(url)
    return extname(entry.name) === '.js' ? [url] : []
  }))
  return nestedFiles.flat()
}

test('saved-video search opener preserves its shell without inline ownership', () => {
  const control = findSingle(
    getButtonElements(indexSource),
    element => getAttribute(getOpeningTag(element), 'id') === 'videoSearchBtn',
    '#videoSearchBtn'
  )
  const tag = getOpeningTag(control)

  assert.equal(getAttribute(tag, 'class'), 'btn-icon search-btn')
  assert.equal(getAttribute(tag, 'id'), 'videoSearchBtn')
  assert.equal(getAttribute(tag, 'type'), 'button')
  assert.equal(getAttribute(tag, 'data-video-search-action'), 'toggle')
  assert.equal(
    getAttribute(tag, 'data-analytics-action'),
    'header.search.title'
  )
  assert.equal(getAttribute(tag, 'title'), 'Search videos')
  assert.equal(getAttribute(tag, 'aria-label'), 'Search videos')
  assert.equal(getAttribute(tag, 'data-i18n-title'), 'header.search.title')
  assert.equal(
    getAttribute(tag, 'data-i18n-aria-label'),
    'header.search.title'
  )
  assert.equal(getAttribute(tag, 'aria-haspopup'), 'true')
  assert.equal(getAttribute(tag, 'aria-expanded'), 'false')
  assert.equal(getAttribute(tag, 'onclick'), null)

  const svg = control.match(/<svg\b[^>]*>[\s\S]*?<\/svg>/)?.[0] ?? ''
  assert.equal(
    svg.replace(/\s+/g, ' ').trim(),
    '<svg class="search-icon" viewBox="0 0 24 24" aria-hidden="true"> '
      + '<circle cx="11" cy="11" r="6"></circle> '
      + '<path d="M16 16l4 4"></path> </svg>'
  )
})

test('saved-video search mobile close preserves its shell without inline ownership', () => {
  const control = findSingle(
    getButtonElements(indexSource),
    element => {
      const tag = getOpeningTag(element)
      return getAttribute(tag, 'class') === 'mobile-popover-close'
        && element.includes('data-video-search-action="close"')
    },
    'saved-video search mobile close control'
  )
  const tag = getOpeningTag(control)

  assert.equal(getAttribute(tag, 'class'), 'mobile-popover-close')
  assert.equal(getAttribute(tag, 'type'), 'button')
  assert.equal(getAttribute(tag, 'data-video-search-action'), 'close')
  assert.equal(getAttribute(tag, 'data-analytics-action'), 'settings.close')
  assert.equal(getAttribute(tag, 'title'), 'Close')
  assert.equal(getAttribute(tag, 'aria-label'), 'Close')
  assert.equal(getAttribute(tag, 'data-i18n-title'), 'settings.close')
  assert.equal(getAttribute(tag, 'data-i18n-aria-label'), 'settings.close')
  assert.equal(getAttribute(tag, 'onclick'), null)
  assert.equal(
    control.slice(tag.length, -'</button>'.length).trim(),
    '×'
  )
})

test('saved-video search query and generated results retain exact ownership', () => {
  const inputTags = [...indexSource.matchAll(/<input\b[^>]*>/g)]
    .map(match => match[0])
  const input = findSingle(
    inputTags,
    tag => getAttribute(tag, 'id') === 'videoSearchInput',
    '#videoSearchInput'
  )

  assert.equal(getAttribute(input, 'type'), 'search')
  assert.equal(getAttribute(input, 'class'), 'video-search-input')
  assert.equal(getAttribute(input, 'id'), 'videoSearchInput')
  assert.equal(getAttribute(input, 'data-video-search-action'), 'query')
  assert.equal(getAttribute(input, 'placeholder'), 'Search videos...')
  assert.equal(
    getAttribute(input, 'data-i18n-placeholder'),
    'header.search.placeholder'
  )
  assert.equal(getAttribute(input, 'autocomplete'), 'off')
  assert.equal(getAttribute(input, 'oninput'), null)
  assert.equal(getAttribute(input, 'onkeydown'), null)

  const result = findSingle(
    getButtonElements(appSource),
    element => (
      getAttribute(getOpeningTag(element), 'class') === 'video-search-result'
    ),
    'generated saved-video search result'
  )
  const resultTag = getOpeningTag(result)
  assert.equal(getAttribute(resultTag, 'type'), 'button')
  assert.equal(getAttribute(resultTag, 'class'), 'video-search-result')
  assert.equal(
    getAttribute(resultTag, 'data-video-search-action'),
    'select-result'
  )
  assert.equal(
    getAttribute(resultTag, 'data-video-id'),
    '${escHtml(video.id)}'
  )
  assert.equal(
    getAttribute(resultTag, 'data-analytics-action'),
    'jumpToVideoFromSearch'
  )
  assert.equal(getAttribute(resultTag, 'onclick'), null)
})

test('saved-video search shell actions leave inline attributes and the global-action bridge', async () => {
  const removedActions = [
    'toggleVideoSearchPopover',
    'closeVideoSearchPopover',
    'renderVideoSearchResults',
    'handleVideoSearchInputKey'
  ]
  const sourceFiles = [
    new URL('../../index.html', import.meta.url),
    ...await getJavaScriptFiles(new URL('../../src/', import.meta.url))
  ]
  const inlineHandlerPattern =
    /(?<![.\w])\bon[a-z]+\s*=\s*(["'])([\s\S]*?)\1/g
  const inlineHandlers = []

  for (const sourceFile of sourceFiles) {
    const source = await readFile(sourceFile, 'utf8')
    for (const match of source.matchAll(inlineHandlerPattern)) {
      inlineHandlers.push(match[2])
    }
  }

  const globalActionAudit =
    GLOBAL_ACTION_NAMES.join('\n') || 'global action bridge removed'
  assert.ok(globalActionAudit, 'Expected the empty global-action audit')

  for (const actionName of removedActions) {
    const callPattern = new RegExp(`\\b${actionName}\\s*\\(`)
    const mapPattern = new RegExp(`\\b${actionName}\\s*,`)
    assert.equal(
      inlineHandlers.some(handler => callPattern.test(handler)),
      false,
      `${actionName} must not remain in an inline attribute`
    )
    assert.equal(
      GLOBAL_ACTION_NAMES.includes(actionName),
      false,
      `${actionName} must not remain in the legacy manifest`
    )
    assert.doesNotMatch(
      globalActionAudit,
      mapPattern,
      `${actionName} must not remain in the legacy install map`
    )
  }
})
