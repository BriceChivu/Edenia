import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import {
  LEGACY_ACTION_NAMES
} from '../../src/compat/legacy-actions.js'

const indexSource = await readFile(
  new URL('../../index.html', import.meta.url),
  'utf8'
)
const appSource = await readFile(
  new URL('../../src/app.js', import.meta.url),
  'utf8'
)
const analyticsSource = await readFile(
  new URL('../../analytics.js', import.meta.url),
  'utf8'
)

function getAttribute(tag, name) {
  return tag.match(
    new RegExp(`\\s${name}=(["'])([\\s\\S]*?)\\1`)
  )?.[2] ?? null
}

function getElements(source, tagName) {
  return [...source.matchAll(
    new RegExp(
      `(<${tagName}\\b[^>]*>)([\\s\\S]*?)<\\/${tagName}>`,
      'g'
    )
  )].map(match => ({
    content: match[2],
    tag: match[1]
  }))
}

function getOpeningTags(source, tagName) {
  return [...source.matchAll(
    new RegExp(`<${tagName}\\b[^>]*>`, 'g')
  )].map(match => match[0])
}

function hasClass(tag, className) {
  return String(getAttribute(tag, 'class') || '')
    .split(/\s+/)
    .includes(className)
}

function findSingle(items, predicate, description) {
  const matches = items.filter(predicate)
  assert.equal(matches.length, 1, `Expected one ${description}`)
  return matches[0]
}

function getFunctionSource(name, nextName) {
  const declaration = new RegExp(
    `(?:async\\s+)?function\\s+${name}\\s*\\(`
  ).exec(appSource)
  assert.ok(declaration, `Expected ${name}`)
  const nextDeclaration = new RegExp(
    `\\n(?:async\\s+)?function\\s+${nextName}\\s*\\(`
  ).exec(appSource.slice(declaration.index + declaration[0].length))
  assert.ok(nextDeclaration, `Expected boundary after ${name}`)
  const end = declaration.index
    + declaration[0].length
    + nextDeclaration.index
  return appSource.slice(declaration.index, end)
}

function getInlineHandlerName(expression) {
  return expression?.match(
    /^\s*([a-zA-Z_$][\w$]*)\s*\(/
  )?.[1] ?? null
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

function assertSourceOrder(source, values, label) {
  let previousIndex = -1
  for (const value of values) {
    const index = source.indexOf(value, previousIndex + 1)
    assert.ok(index > previousIndex, `${label}: ${value}`)
    previousIndex = index
  }
}

const manualSearchActionSource = getFunctionSource(
  'renderManualYoutubeSearchAction',
  'closeManualChannelSuggestions'
)
const localSuggestionsSource = getFunctionSource(
  'renderManualChannelSuggestions',
  'getYoutubeChannelSearchDateKey'
)
const youtubeResultsSource = getFunctionSource(
  'renderYoutubeChannelSearchResults',
  'renderYoutubeChannelSearchMessage'
)

test('static manual-entry shell retains exact metadata boundaries', () => {
  const opener = findSingle(
    getElements(indexSource, 'button'),
    element => getAttribute(element.tag, 'id') === 'manualVideoBtn',
    'manual-video opener'
  )
  assert.equal(
    getAttribute(opener.tag, 'class'),
    'btn-secondary manual-video-btn'
  )
  assert.equal(
    getAttribute(opener.tag, 'data-manual-video-action'),
    'toggle'
  )
  assert.equal(
    getAttribute(opener.tag, 'data-analytics-action'),
    'videos.manual.button'
  )
  assert.equal(getAttribute(opener.tag, 'onclick'), null)
  assert.equal(opener.content.trim(), 'Add')

  const close = findSingle(
    getElements(indexSource, 'button'),
    element => (
      getAttribute(element.tag, 'data-manual-video-action') === 'close'
    ),
    'manual-video close control'
  )
  assert.equal(
    getAttribute(close.tag, 'data-analytics-action'),
    'settings.close'
  )
  assert.equal(getAttribute(close.tag, 'onclick'), null)
  assert.equal(close.content.trim(), '×')

  const form = findSingle(
    getOpeningTags(indexSource, 'form'),
    tag => getAttribute(tag, 'class') === 'manual-video-form',
    'manual-video form'
  )
  assert.equal(
    getAttribute(form, 'onsubmit'),
    'addYoutubeInput(event)'
  )
  assert.equal(
    getAttribute(form, 'data-analytics-action'),
    'addYoutubeInput'
  )

  const input = findSingle(
    getOpeningTags(indexSource, 'input'),
    tag => getAttribute(tag, 'id') === 'manualVideoUrlInput',
    '#manualVideoUrlInput'
  )
  assert.equal(getAttribute(input, 'type'), 'text')
  assert.equal(
    getAttribute(input, 'data-manual-video-action'),
    'query'
  )
  assert.equal(getAttribute(input, 'role'), 'combobox')
  assert.equal(getAttribute(input, 'aria-autocomplete'), 'list')
  assert.equal(
    getAttribute(input, 'aria-controls'),
    'manualChannelSuggestions'
  )
  assert.equal(getAttribute(input, 'aria-expanded'), 'false')
  assert.equal(getAttribute(input, 'oninput'), null)
  assert.equal(getAttribute(input, 'onkeydown'), null)
  assert.equal(getAttribute(input, 'data-analytics-action'), null)

  const suggestions = findSingle(
    getOpeningTags(indexSource, 'div'),
    tag => getAttribute(tag, 'id') === 'manualChannelSuggestions',
    '#manualChannelSuggestions'
  )
  assert.equal(getAttribute(suggestions, 'role'), 'listbox')
  assert.equal(
    getAttribute(suggestions, 'data-analytics-action'),
    null
  )

  for (const source of [indexSource, appSource]) {
    assert.doesNotMatch(
      source,
      /<[a-z][^>]*\bid=(["'])manualVideoAddBtn\1/i
    )
  }
})

test('generated manual-entry controls retain exact metadata and inline arguments', () => {
  const searchControl = findSingle(
    getElements(manualSearchActionSource, 'button'),
    element => hasClass(element.tag, 'manual-youtube-search-btn'),
    'YouTube channel search control'
  )
  assert.equal(getAttribute(searchControl.tag, 'type'), 'button')
  assert.equal(
    getAttribute(searchControl.tag, 'class'),
    'manual-youtube-search-btn'
  )
  assert.equal(
    getAttribute(searchControl.tag, 'data-analytics-action'),
    'searchYoutubeChannels'
  )
  assert.equal(
    getAttribute(searchControl.tag, 'onclick'),
    'searchYoutubeChannels(event)'
  )
  assert.ok(
    searchControl.content.includes(
      "${escHtml(t('videos.manual.searchYoutubeFor', { query }))}"
    )
  )

  const localControl = findSingle(
    getElements(localSuggestionsSource, 'button'),
    element => hasClass(element.tag, 'manual-channel-suggestion'),
    'curated channel suggestion control'
  )
  assert.equal(getAttribute(localControl.tag, 'type'), 'button')
  assert.equal(
    getAttribute(localControl.tag, 'class'),
    "manual-channel-suggestion ${alreadyAdded ? 'is-added' : ''}"
  )
  assert.equal(
    getAttribute(localControl.tag, 'id'),
    'manualChannelSuggestion-${escHtml(channel.id)}'
  )
  assert.equal(
    getAttribute(localControl.tag, 'data-catalog-id'),
    '${escHtml(channel.id)}'
  )
  assert.equal(
    getAttribute(localControl.tag, 'data-added'),
    "${alreadyAdded ? 'true' : 'false'}"
  )
  assert.equal(
    getAttribute(localControl.tag, 'data-suggestion-source'),
    null
  )
  assert.equal(
    getAttribute(localControl.tag, 'data-analytics-action'),
    'selectManualChannelSuggestion'
  )
  assert.equal(getAttribute(localControl.tag, 'role'), 'option')
  assert.equal(getAttribute(localControl.tag, 'aria-selected'), 'false')
  assert.equal(
    getAttribute(localControl.tag, 'onclick'),
    'selectManualChannelSuggestion(event, this.dataset.catalogId)'
  )
  assertSourceOrder(
    localControl.content,
    [
      '<span class="manual-channel-suggestion-avatar"',
      '<span>${escHtml(getCuratedChannelInitials(channel))}</span>',
      '<span class="manual-channel-suggestion-copy">',
      '<span class="manual-channel-suggestion-name">${escHtml(channel.name)}</span>',
      '<span class="manual-channel-suggestion-meta">${escHtml(meta)}</span>'
    ],
    'curated suggestion content'
  )

  const youtubeControl = findSingle(
    getElements(youtubeResultsSource, 'button'),
    element => hasClass(element.tag, 'manual-channel-suggestion'),
    'YouTube channel result control'
  )
  assert.equal(getAttribute(youtubeControl.tag, 'type'), 'button')
  assert.equal(
    getAttribute(youtubeControl.tag, 'class'),
    "manual-channel-suggestion ${alreadyAdded ? 'is-added' : ''}"
  )
  assert.equal(
    getAttribute(youtubeControl.tag, 'id'),
    'manualYoutubeSuggestion-${escHtml(result.id)}'
  )
  assert.equal(
    getAttribute(youtubeControl.tag, 'data-channel-id'),
    '${escHtml(result.id)}'
  )
  assert.equal(
    getAttribute(youtubeControl.tag, 'data-added'),
    "${alreadyAdded ? 'true' : 'false'}"
  )
  assert.equal(
    getAttribute(youtubeControl.tag, 'data-suggestion-source'),
    'youtube'
  )
  assert.equal(
    getAttribute(youtubeControl.tag, 'data-analytics-action'),
    'selectYoutubeChannelSearchResult'
  )
  assert.equal(getAttribute(youtubeControl.tag, 'role'), 'option')
  assert.equal(getAttribute(youtubeControl.tag, 'aria-selected'), 'false')
  assert.equal(
    getAttribute(youtubeControl.tag, 'onclick'),
    'selectYoutubeChannelSearchResult(event, this.dataset.channelId)'
  )
  assertSourceOrder(
    youtubeControl.content,
    [
      '<span class="manual-channel-suggestion-avatar"',
      '<span>${escHtml(getCuratedChannelInitials(result))}</span>',
      '<span class="manual-channel-suggestion-copy">',
      '<span class="manual-channel-suggestion-name">${escHtml(result.name)}</span>',
      '<span class="manual-channel-suggestion-meta">${escHtml(meta)}</span>'
    ],
    'YouTube suggestion content'
  )
})

test('explicit actions preserve fallback identities without changing collection', () => {
  const expectedEvents = {
    addYoutubeInput: 'add_youtube_input_clicked',
    searchYoutubeChannels: 'search_youtube_channels_clicked',
    selectManualChannelSuggestion:
      'select_manual_channel_suggestion_clicked',
    selectYoutubeChannelSearchResult:
      'select_youtube_channel_search_result_clicked',
    'videos.manual.button': 'videos_manual_button_clicked',
    'settings.close': 'settings_close_clicked'
  }
  for (const [action, eventName] of Object.entries(expectedEvents)) {
    assert.equal(normalizeClickEventName(action), eventName)
  }

  const generatedControls = [
    findSingle(
      getElements(manualSearchActionSource, 'button'),
      element => hasClass(element.tag, 'manual-youtube-search-btn'),
      'YouTube channel search control'
    ),
    findSingle(
      getElements(localSuggestionsSource, 'button'),
      element => hasClass(element.tag, 'manual-channel-suggestion'),
      'curated channel suggestion control'
    ),
    findSingle(
      getElements(youtubeResultsSource, 'button'),
      element => hasClass(element.tag, 'manual-channel-suggestion'),
      'YouTube channel result control'
    )
  ]
  for (const control of generatedControls) {
    assert.equal(
      getAttribute(control.tag, 'data-analytics-action'),
      getInlineHandlerName(getAttribute(control.tag, 'onclick'))
    )
  }

  const form = findSingle(
    getOpeningTags(indexSource, 'form'),
    tag => getAttribute(tag, 'class') === 'manual-video-form',
    'manual-video form'
  )
  assert.equal(
    getAttribute(form, 'data-analytics-action'),
    getInlineHandlerName(getAttribute(form, 'onsubmit'))
  )

  assert.match(
    analyticsSource,
    /const inlineHandler = control\.getAttribute\('onclick'\) \|\| '';/
  )
  assert.match(
    analyticsSource,
    /const action = control\.dataset\.analyticsAction\s*\|\| control\.dataset\.i18n/
  )
  assert.match(
    analyticsSource,
    /const control = event\.target\.closest\('button, a'\);\s*if \(!control \|\| control\.disabled\) return;/
  )
  assert.equal(form.startsWith('<button'), false)
  assert.equal(form.startsWith('<a'), false)
  assert.doesNotMatch(
    analyticsSource,
    /document\.addEventListener\(['"]submit['"]/
  )
})

test('search and selection clicks retain propagation suppression before work', () => {
  const searchSource = getFunctionSource(
    'searchYoutubeChannels',
    'setActiveManualChannelSuggestion'
  )
  assert.match(
    searchSource,
    /^async function searchYoutubeChannels\(event\) \{\s*event\?\.preventDefault\(\)\s*event\?\.stopPropagation\(\)/
  )

  const localSelectSource = getFunctionSource(
    'selectManualChannelSuggestion',
    'selectYoutubeChannelSearchResult'
  )
  assert.match(
    localSelectSource,
    /^function selectManualChannelSuggestion\(event, catalogId\) \{\s*event\?\.preventDefault\(\)\s*event\?\.stopPropagation\(\)/
  )

  const youtubeSelectSource = getFunctionSource(
    'selectYoutubeChannelSearchResult',
    'addYoutubeInput'
  )
  assert.match(
    youtubeSelectSource,
    /^async function selectYoutubeChannelSearchResult\(event, channelId\) \{\s*event\?\.preventDefault\(\)\s*event\?\.stopPropagation\(\)/
  )
})

test('keyboard navigation retains lexical selection and live option IDs', () => {
  const activeSource = getFunctionSource(
    'setActiveManualChannelSuggestion',
    'handleManualChannelSuggestionKeydown'
  )
  assertSourceOrder(
    activeSource,
    [
      "'#manualChannelSuggestions .manual-channel-suggestion:not(.is-added)'",
      'const normalizedIndex = (index + options.length) % options.length',
      'renderManualChannelSuggestions.activeIndex = normalizedIndex',
      "option.classList.toggle('is-active', isActive)",
      "option.setAttribute('aria-selected', String(isActive))",
      'const activeOption = options[normalizedIndex]',
      "input.setAttribute('aria-activedescendant', activeOption.id)",
      "activeOption.scrollIntoView({ block: 'nearest' })"
    ],
    'active manual suggestion'
  )

  const keySource = getFunctionSource(
    'handleManualChannelSuggestionKeydown',
    'addCuratedChannelSuggestion'
  )
  assert.match(
    keySource,
    /const options = Array\.from\(list\.querySelectorAll\('\.manual-channel-suggestion:not\(\.is-added\)'\)\)/
  )
  assert.match(
    keySource,
    /if \(event\.key === 'Escape'\) \{\s*event\.preventDefault\(\)\s*event\.stopPropagation\(\)\s*closeManualChannelSuggestions\(\)\s*return\s*\}/
  )
  assert.match(
    keySource,
    /if \(event\.key === 'ArrowDown'\) \{\s*event\.preventDefault\(\)\s*setActiveManualChannelSuggestion\(activeIndex \+ 1\)/
  )
  assert.match(
    keySource,
    /else if \(event\.key === 'ArrowUp'\) \{\s*event\.preventDefault\(\)\s*setActiveManualChannelSuggestion\(activeIndex <= 0 \? options\.length - 1 : activeIndex - 1\)/
  )
  assert.match(
    keySource,
    /else if \(event\.key === 'Enter' && activeIndex >= 0\) \{\s*event\.preventDefault\(\)\s*const activeOption = options\[activeIndex\]\s*if \(activeOption\.dataset\.suggestionSource === 'youtube'\) \{\s*selectYoutubeChannelSearchResult\(event, activeOption\.dataset\.channelId\)\s*\} else \{\s*selectManualChannelSuggestion\(event, activeOption\.dataset\.catalogId\)\s*\}/
  )
})

test('selection callbacks retain currentTarget analytics and duplicate guards', () => {
  const localSelectSource = getFunctionSource(
    'selectManualChannelSuggestion',
    'selectYoutubeChannelSearchResult'
  )
  assertSourceOrder(
    localSelectSource,
    [
      'const option = event?.currentTarget',
      "const query = document.getElementById('manualVideoUrlInput')?.value?.trim() || ''",
      "trackEdeniaEvent('search_result_selected', {",
      "search_source: option?.dataset?.suggestionSource === 'discovery'",
      'catalog_id: catalogId || null',
      "already_added: option?.dataset?.added === 'true'",
      "if (option?.dataset?.added === 'true')",
      "showToast(t('toast.channelDuplicate'), 'warn')",
      'addCuratedChannelSuggestion(catalogId)'
    ],
    'curated suggestion selection'
  )

  const youtubeSelectSource = getFunctionSource(
    'selectYoutubeChannelSearchResult',
    'addYoutubeInput'
  )
  assertSourceOrder(
    youtubeSelectSource,
    [
      'const result = (searchYoutubeChannels.results || []).find(channel => channel.id === channelId)',
      "const input = document.getElementById('manualVideoUrlInput')",
      'if (!result || !input) return',
      'const alreadyAdded = (loadState()?.config?.channels || []).some(channel => channel.id === result.id)',
      "trackEdeniaEvent('search_result_selected', {",
      "search_source: 'youtube_channels'",
      'channel_id: result.id',
      'result_position: (searchYoutubeChannels.results || []).findIndex(channel => channel.id === result.id) + 1',
      'already_added: alreadyAdded',
      'if (alreadyAdded)',
      'closeManualChannelSuggestions()',
      'await addChannel({',
      'resolvedChannel: result',
      "source: 'youtube_search'"
    ],
    'YouTube suggestion selection'
  )
})

test('form submission retains video, direct-channel, and catalog routing', () => {
  const submitSource = getFunctionSource(
    'addYoutubeInput',
    'openNextStudyVideoPlayer'
  )
  assertSourceOrder(
    submitSource,
    [
      'event.preventDefault()',
      "const input = document.getElementById('manualVideoUrlInput')",
      "const rawUrl = input?.value?.trim() || ''",
      'if (parseYoutubeVideoId(rawUrl))',
      'await addVideoFromUrl(event)',
      'if (parseYoutubeChannelInput(rawUrl))',
      'await addChannel({',
      'input,',
      'button: btn,',
      "idleButtonText: t('videos.manual.add')",
      'closePopover: true',
      'const catalogMatch = getCuratedChannelSearchMatches(rawUrl, 1)[0]',
      'if (catalogMatch)',
      'await addCuratedChannelSuggestion(catalogMatch.id)',
      "showToast(t('videos.manual.noMatches'), 'warn')",
      'input?.focus()'
    ],
    'manual entry submit routing'
  )

  const addVideoSource = getFunctionSource(
    'addVideoFromUrl',
    'normalizeCuratedChannelSearchText'
  )
  assert.match(
    addVideoSource,
    /^async function addVideoFromUrl\(event\) \{\s*event\.preventDefault\(\)\s*const input = document\.getElementById\('manualVideoUrlInput'\)/
  )
})

test('generated replacement paths retain all three metadata-bearing controls', () => {
  assert.match(
    localSuggestionsSource,
    /if \(!matches\.length\) \{\s*list\.innerHTML = `[\s\S]*?\$\{renderManualYoutubeSearchAction\(value\)\}/
  )
  assert.match(
    localSuggestionsSource,
    /const localSuggestions = matches\.map\(channel => \{[\s\S]*?data-analytics-action="selectManualChannelSuggestion"[\s\S]*?\}\)\.join\(''\)/
  )
  assert.match(
    localSuggestionsSource,
    /list\.innerHTML = `\$\{localSuggestions\}\$\{renderManualYoutubeSearchAction\(value\)\}`/
  )
  assert.match(
    youtubeResultsSource,
    /const resultRows = results\.map\(result => \{[\s\S]*?data-analytics-action="selectYoutubeChannelSearchResult"[\s\S]*?\}\)\.join\(''\)/
  )
  assert.match(
    youtubeResultsSource,
    /list\.innerHTML = `\s*<div class="manual-youtube-results-label">[\s\S]*?\$\{resultRows\}\s*`/
  )
})

test('YouTube search retains shared result and cooldown function state', () => {
  assertSourceOrder(
    youtubeResultsSource,
    [
      'if (normalizeCuratedChannelSearchText(input.value) !== normalizeCuratedChannelSearchText(query)) return',
      'searchYoutubeChannels.results = results',
      'renderManualChannelSuggestions.activeIndex = -1',
      "input.setAttribute('aria-expanded', 'true')",
      "list.classList.remove('hidden')"
    ],
    'YouTube result state'
  )

  const searchSource = getFunctionSource(
    'searchYoutubeChannels',
    'setActiveManualChannelSuggestion'
  )
  assertSourceOrder(
    searchSource,
    [
      'const cachedResults = getCachedYoutubeChannelSearch(query)',
      'if (cachedResults)',
      'renderYoutubeChannelSearchResults(query, cachedResults, { cacheHit: true })',
      'const now = Date.now()',
      'const lastRequestAt = Number(searchYoutubeChannels.lastRequestAt || 0)',
      'if (now - lastRequestAt < YOUTUBE_CHANNEL_SEARCH_COOLDOWN_MS)',
      'searchYoutubeChannels.lastRequestAt = now',
      'incrementYoutubeChannelSearchUsage()',
      "list.setAttribute('aria-busy', 'true')",
      'const results = await fetchYoutubeChannelSearchResults(query)',
      'cacheYoutubeChannelSearch(query, results)',
      'renderYoutubeChannelSearchResults(query, results, { cacheHit: false })'
    ],
    'YouTube search function state'
  )
})

test('manual-entry inline handlers remain available through the bridge', () => {
  const expectedActions = [
    'addYoutubeInput',
    'searchYoutubeChannels',
    'selectManualChannelSuggestion',
    'selectYoutubeChannelSearchResult'
  ]
  const installMap = appSource.match(
    /installLegacyActions\(window,\s*\{([\s\S]*?)\}\)/
  )?.[1]
  assert.ok(installMap)

  for (const actionName of expectedActions) {
    assert.equal(LEGACY_ACTION_NAMES.includes(actionName), true)
    assert.match(
      installMap,
      new RegExp(`(?:^|[\\s,])${actionName}(?:[\\s,]|$)`)
    )
  }
})
