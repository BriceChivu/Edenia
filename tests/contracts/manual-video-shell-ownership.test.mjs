import assert from 'node:assert/strict'
import { readdir, readFile } from 'node:fs/promises'
import { extname } from 'node:path'
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

const migratedActionNames = [
  'toggleManualVideoPopover',
  'closeManualVideoPopover',
  'renderManualChannelSuggestions',
  'handleManualChannelSuggestionKeydown',
  'addYoutubeInput'
]
const retainedInlineActionNames = [
  'searchYoutubeChannels',
  'selectManualChannelSuggestion',
  'selectYoutubeChannelSearchResult'
]

function getElements(source, tagName) {
  return [...source.matchAll(
    new RegExp(`(<${tagName}\\b[^>]*>)([\\s\\S]*?)<\\/${tagName}>`, 'g')
  )].map(match => ({
    content: match[2],
    tag: match[1]
  }))
}

function getOpeningTags(source, tagName) {
  return [...source.matchAll(new RegExp(`<${tagName}\\b[^>]*>`, 'g'))]
    .map(match => match[0])
}

function getAttribute(tag, name) {
  return tag.match(
    new RegExp(`\\s${name}=(["'])([\\s\\S]*?)\\1`)
  )?.[2] ?? null
}

function findSingle(items, predicate, description) {
  const matches = items.filter(predicate)
  assert.equal(matches.length, 1, `Expected one ${description}`)
  return matches[0]
}

function getManualVideoBinding(source) {
  const match = source.match(
    /bindManualVideoShellActions\(document,\s*\{([\s\S]*?)\}\)/
  )
  assert.ok(match, 'Expected the manual-video shell binding')
  return Object.fromEntries(
    [...match[1].matchAll(/\b(\w+):\s*(\w+)/g)]
      .map(binding => [binding[1], binding[2]])
  )
}

async function getJavaScriptFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true })
  const nestedFiles = await Promise.all(entries.map(entry => {
    const url = new URL(
      `${entry.name}${entry.isDirectory() ? '/' : ''}`,
      directory
    )
    if (entry.isDirectory()) return getJavaScriptFiles(url)
    return extname(entry.name) === '.js' ? [url] : []
  }))
  return nestedFiles.flat()
}

test('manual-video opener retains its shell with module-owned toggle', () => {
  const control = findSingle(
    getElements(indexSource, 'button'),
    element => getAttribute(element.tag, 'id') === 'manualVideoBtn',
    '#manualVideoBtn control'
  )

  assert.equal(getAttribute(control.tag, 'id'), 'manualVideoBtn')
  assert.equal(getAttribute(control.tag, 'type'), 'button')
  assert.equal(
    getAttribute(control.tag, 'class'),
    'btn-secondary manual-video-btn'
  )
  assert.equal(
    getAttribute(control.tag, 'data-manual-video-action'),
    'toggle'
  )
  assert.equal(
    getAttribute(control.tag, 'data-analytics-action'),
    'videos.manual.button'
  )
  assert.equal(getAttribute(control.tag, 'data-i18n'), 'videos.manual.button')
  assert.equal(getAttribute(control.tag, 'aria-haspopup'), 'true')
  assert.equal(getAttribute(control.tag, 'aria-expanded'), 'false')
  assert.equal(getAttribute(control.tag, 'onclick'), null)
  assert.equal(control.content.trim(), 'Add')
})

test('manual-video close retains localized shell with module ownership', () => {
  const control = findSingle(
    getElements(indexSource, 'button'),
    element => (
      getAttribute(element.tag, 'data-manual-video-action') === 'close'
    ),
    'manual-video close control'
  )

  assert.equal(getAttribute(control.tag, 'class'), 'mobile-popover-close')
  assert.equal(getAttribute(control.tag, 'type'), 'button')
  assert.equal(
    getAttribute(control.tag, 'data-manual-video-action'),
    'close'
  )
  assert.equal(
    getAttribute(control.tag, 'data-analytics-action'),
    'settings.close'
  )
  assert.equal(getAttribute(control.tag, 'title'), 'Close')
  assert.equal(getAttribute(control.tag, 'aria-label'), 'Close')
  assert.equal(
    getAttribute(control.tag, 'data-i18n-title'),
    'settings.close'
  )
  assert.equal(
    getAttribute(control.tag, 'data-i18n-aria-label'),
    'settings.close'
  )
  assert.equal(getAttribute(control.tag, 'onclick'), null)
  assert.equal(control.content.trim(), '×')
})

test('manual-video query retains exact semantics with module ownership', () => {
  const input = findSingle(
    getOpeningTags(indexSource, 'input'),
    tag => getAttribute(tag, 'id') === 'manualVideoUrlInput',
    '#manualVideoUrlInput'
  )

  assert.equal(getAttribute(input, 'id'), 'manualVideoUrlInput')
  assert.equal(getAttribute(input, 'type'), 'text')
  assert.equal(
    getAttribute(input, 'data-manual-video-action'),
    'query'
  )
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
  assert.equal(getAttribute(input, 'oninput'), null)
  assert.equal(getAttribute(input, 'onkeydown'), null)
  assert.equal(getAttribute(input, 'data-analytics-action'), null)
})

test('manual-video form is module-owned while generated result handlers remain legacy-owned', () => {
  const form = findSingle(
    getOpeningTags(indexSource, 'form'),
    tag => getAttribute(tag, 'class') === 'manual-video-form',
    'manual-video form'
  )
  assert.equal(getAttribute(form, 'data-manual-video-action'), 'submit')
  assert.equal(getAttribute(form, 'data-analytics-action'), 'addYoutubeInput')
  assert.equal(getAttribute(form, 'onsubmit'), null)

  const expectedInlineHandlers = [
    'onclick="searchYoutubeChannels(event)"',
    'onclick="selectManualChannelSuggestion(event, this.dataset.catalogId)"',
    'onclick="selectYoutubeChannelSearchResult(event, this.dataset.channelId)"'
  ]
  expectedInlineHandlers.forEach(handler => {
    assert.match(appSource, new RegExp(handler.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))
  })

  const installMap = appSource.match(
    /installLegacyActions\(window,\s*\{([\s\S]*?)\}\)/
  )?.[1]
  assert.ok(installMap, 'Expected the legacy action install map')

  retainedInlineActionNames.forEach(actionName => {
    assert.equal(
      LEGACY_ACTION_NAMES.includes(actionName),
      true,
      `${actionName} must remain in the legacy manifest`
    )
    assert.match(
      installMap,
      new RegExp(`\\b${actionName}\\s*,`),
      `${actionName} must remain in the legacy install map`
    )
  })
})

test('app composition imports and binds manual-video shell actions before the bridge', () => {
  assert.match(
    appSource,
    /import\s*\{\s*bindManualVideoShellActions\s*\}\s*from '\.\/features\/videos\/manual-video-shell-actions\.js'/
  )
  assert.deepEqual(getManualVideoBinding(appSource), {
    toggle: 'toggleManualVideoPopover',
    close: 'closeManualVideoPopover',
    renderSuggestions: 'renderManualChannelSuggestions',
    handleInputKey: 'handleManualChannelSuggestionKeydown',
    submit: 'addYoutubeInput'
  })

  const bindingIndex = appSource.indexOf(
    'bindManualVideoShellActions(document,'
  )
  const bridgeIndex = appSource.indexOf('installLegacyActions(window,')
  assert.notEqual(bindingIndex, -1)
  assert.ok(
    bridgeIndex > bindingIndex,
    'Manual-video shell actions must bind before legacy actions install'
  )
})

test('only migrated manual-video shell handlers leave inline and legacy ownership', async () => {
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

  const installMap = appSource.match(
    /installLegacyActions\(window,\s*\{([\s\S]*?)\}\)/
  )?.[1]
  assert.ok(installMap, 'Expected the legacy action install map')

  migratedActionNames.forEach(actionName => {
    const callPattern = new RegExp(`\\b${actionName}\\s*\\(`)
    const mapPattern = new RegExp(`\\b${actionName}\\s*,`)
    assert.equal(
      inlineHandlers.some(handler => callPattern.test(handler)),
      false,
      `${actionName} must not remain in an inline attribute`
    )
    assert.equal(
      LEGACY_ACTION_NAMES.includes(actionName),
      false,
      `${actionName} must not remain in the legacy manifest`
    )
    assert.doesNotMatch(
      installMap,
      mapPattern,
      `${actionName} must not remain in the legacy install map`
    )
  })
})

test('manual-video shell retains no submit-button element', () => {
  for (const source of [indexSource, appSource]) {
    assert.doesNotMatch(
      source,
      /<[a-z][^>]*\bid=(["'])manualVideoAddBtn\1/i
    )
  }
})
