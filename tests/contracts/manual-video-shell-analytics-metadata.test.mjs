import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const indexSource = await readFile(
  new URL('../../index.html', import.meta.url),
  'utf8'
)

function getButtonElements(source) {
  return [...source.matchAll(/<button\b[^>]*>[\s\S]*?<\/button>/g)]
    .map(match => match[0])
}

function getOpeningTag(element, tagName) {
  return element.match(new RegExp(`^<${tagName}\\b[^>]*>`))?.[0] ?? ''
}

function getAttribute(tag, name) {
  return tag.match(new RegExp(`\\s${name}="([^"]*)"`))?.[1] ?? null
}

function findSingle(items, predicate, description) {
  const matches = items.filter(predicate)
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

test('manual-video opener retains its stopped analytics identity and shell', () => {
  const element = findSingle(
    getButtonElements(indexSource),
    button => getAttribute(getOpeningTag(button, 'button'), 'id') === 'manualVideoBtn',
    '#manualVideoBtn'
  )
  const control = getOpeningTag(element, 'button')

  assert.equal(getAttribute(control, 'type'), 'button')
  assert.equal(
    getAttribute(control, 'class'),
    'btn-secondary manual-video-btn'
  )
  assert.equal(
    getAttribute(control, 'onclick'),
    'toggleManualVideoPopover(event)'
  )
  assert.equal(getAttribute(control, 'aria-haspopup'), 'true')
  assert.equal(getAttribute(control, 'aria-expanded'), 'false')
  assert.equal(getAttribute(control, 'data-i18n'), 'videos.manual.button')
  assert.equal(
    getAttribute(control, 'data-analytics-action'),
    'videos.manual.button'
  )
  assert.equal(
    normalizeClickEventName(getAttribute(control, 'data-analytics-action')),
    'videos_manual_button_clicked'
  )
  assert.equal(
    element.slice(control.length, -'</button>'.length).trim(),
    'Add'
  )
})

test('manual-video close retains its generic click identity and shell', () => {
  const element = findSingle(
    getButtonElements(indexSource),
    button => (
      getAttribute(getOpeningTag(button, 'button'), 'onclick')
        === 'closeManualVideoPopover(true)'
    ),
    'manual-video close control'
  )
  const control = getOpeningTag(element, 'button')

  assert.equal(getAttribute(control, 'class'), 'mobile-popover-close')
  assert.equal(getAttribute(control, 'type'), 'button')
  assert.equal(getAttribute(control, 'title'), 'Close')
  assert.equal(getAttribute(control, 'aria-label'), 'Close')
  assert.equal(getAttribute(control, 'data-i18n-title'), 'settings.close')
  assert.equal(
    getAttribute(control, 'data-i18n-aria-label'),
    'settings.close'
  )
  assert.equal(
    getAttribute(control, 'data-analytics-action'),
    'settings.close'
  )
  assert.equal(
    normalizeClickEventName(getAttribute(control, 'data-analytics-action')),
    'settings_close_clicked'
  )
  assert.equal(
    element.slice(control.length, -'</button>'.length).trim(),
    '×'
  )
})

test('manual-video query retains exact inline ownership without analytics metadata', () => {
  const input = findSingle(
    [...indexSource.matchAll(/<input\b[^>]*>/g)].map(match => match[0]),
    tag => getAttribute(tag, 'id') === 'manualVideoUrlInput',
    '#manualVideoUrlInput'
  )

  assert.equal(getAttribute(input, 'type'), 'text')
  assert.equal(
    getAttribute(input, 'placeholder'),
    'Search channels or paste a YouTube URL'
  )
  assert.equal(
    getAttribute(input, 'data-i18n-placeholder'),
    'videos.manual.searchPlaceholder'
  )
  assert.equal(getAttribute(input, 'autocomplete'), 'off')
  assert.equal(getAttribute(input, 'role'), 'combobox')
  assert.equal(getAttribute(input, 'aria-autocomplete'), 'list')
  assert.equal(
    getAttribute(input, 'aria-controls'),
    'manualChannelSuggestions'
  )
  assert.equal(getAttribute(input, 'aria-expanded'), 'false')
  assert.equal(
    getAttribute(input, 'oninput'),
    'renderManualChannelSuggestions()'
  )
  assert.equal(
    getAttribute(input, 'onkeydown'),
    'handleManualChannelSuggestionKeydown(event)'
  )
  assert.equal(getAttribute(input, 'data-analytics-action'), null)
})
