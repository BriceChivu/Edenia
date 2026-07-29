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
  'requestVideoSetAside',
  'cancelVideoSetAsidePrompt',
  'confirmVideoSetAsidePrompt',
  'handleVideoSetAsidePromptKeydown'
]
const retainedNeighborActionNames = [
  'addYoutubeInput',
  'closeVideoShelfPreviewAfterFocus',
  'handleChannelFilterSelectAllClick',
  'handleVideoThumbnailClick',
  'removeChannelFromFilter'
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

function getVideoSetAsideBindings(source, rootName) {
  return [...source.matchAll(
    new RegExp(
      `bindVideoSetAsideActions\\(${rootName},\\s*\\{([\\s\\S]*?)\\}\\)`,
      'g'
    )
  )].map(match => Object.fromEntries(
    [...match[1].matchAll(/\b(\w+):\s*(\w+)/g)]
      .map(binding => [binding[1], binding[2]])
  ))
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

test('static Set aside prompt retains its dialog shell with module-owned keydown', () => {
  const overlay = findSingle(
    getOpeningTags(indexSource, 'div'),
    tag => getAttribute(tag, 'id') === 'setAsidePrompt',
    '#setAsidePrompt overlay'
  )

  assert.equal(
    getAttribute(overlay, 'class'),
    'set-aside-prompt-overlay hidden'
  )
  assert.equal(
    getAttribute(overlay, 'data-video-set-aside-action'),
    'prompt'
  )
  assert.equal(getAttribute(overlay, 'aria-hidden'), 'true')
  assert.equal(getAttribute(overlay, 'onkeydown'), null)
  assert.equal(getAttribute(overlay, 'data-analytics-action'), null)

  const dialog = findSingle(
    getOpeningTags(indexSource, 'section'),
    tag => hasClass(tag, 'set-aside-prompt'),
    'Set aside prompt dialog'
  )
  assert.equal(getAttribute(dialog, 'class'), 'set-aside-prompt')
  assert.equal(getAttribute(dialog, 'role'), 'dialog')
  assert.equal(getAttribute(dialog, 'aria-modal'), 'true')
  assert.equal(
    getAttribute(dialog, 'aria-labelledby'),
    'setAsidePromptTitle'
  )
  assert.equal(
    getAttribute(dialog, 'aria-describedby'),
    'setAsidePromptMessage'
  )
})

test('static Set aside prompt actions retain exact markup under module ownership', () => {
  const expectedControls = [
    {
      action: 'cancel',
      analyticsAction: 'setAsidePrompt.cancel',
      className: 'btn-ghost',
      label: 'Cancel',
      translationKey: 'setAsidePrompt.cancel'
    },
    {
      action: 'confirm',
      analyticsAction: 'setAsidePrompt.confirm',
      className: 'btn-primary',
      label: 'Set aside',
      translationKey: 'setAsidePrompt.confirm'
    }
  ]

  for (const expected of expectedControls) {
    const control = findSingle(
      getElements(indexSource, 'button'),
      element => (
        getAttribute(element.tag, 'data-video-set-aside-action')
          === expected.action
      ),
      `Set aside prompt ${expected.action} control`
    )

    assert.equal(getAttribute(control.tag, 'class'), expected.className)
    assert.equal(getAttribute(control.tag, 'type'), 'button')
    assert.equal(
      getAttribute(control.tag, 'data-video-set-aside-action'),
      expected.action
    )
    assert.equal(
      getAttribute(control.tag, 'data-analytics-action'),
      expected.analyticsAction
    )
    assert.equal(
      getAttribute(control.tag, 'data-i18n'),
      expected.translationKey
    )
    assert.equal(getAttribute(control.tag, 'onclick'), null)
    assert.equal(control.content.trim(), expected.label)
  }
})

test('generated Set aside request controls retain exact surfaces and markup', () => {
  const localizedLabel = "${escHtml(t('videos.card.setAside'))}"
  const expectedControls = [
    {
      className: 'next-study-cta next-study-set-aside',
      content: localizedLabel,
      label: null,
      surface: 'continue_watching',
      title: null,
      type: 'button'
    },
    {
      className: 'action-btn set-aside-btn',
      content: "${renderVideoActionIcon('set-aside')}",
      label: localizedLabel,
      surface: 'video_card',
      title: localizedLabel,
      type: null
    }
  ]

  for (const expected of expectedControls) {
    const control = findSingle(
      getElements(appSource, 'button'),
      element => (
        getAttribute(element.tag, 'data-video-set-aside-surface')
          === expected.surface
      ),
      `${expected.surface} Set aside request control`
    )

    assert.equal(getAttribute(control.tag, 'class'), expected.className)
    assert.equal(getAttribute(control.tag, 'type'), expected.type)
    assert.equal(
      getAttribute(control.tag, 'data-video-set-aside-action'),
      'request'
    )
    assert.equal(
      getAttribute(control.tag, 'data-video-set-aside-surface'),
      expected.surface
    )
    assert.equal(
      getAttribute(control.tag, 'data-video-id'),
      '${safeVideoId}'
    )
    assert.equal(
      getAttribute(control.tag, 'data-analytics-action'),
      'requestVideoSetAside'
    )
    assert.equal(getAttribute(control.tag, 'aria-label'), expected.label)
    assert.equal(getAttribute(control.tag, 'title'), expected.title)
    assert.equal(getAttribute(control.tag, 'onclick'), null)
    assert.ok(
      control.content.includes(expected.content),
      `Expected preserved content on the ${expected.surface} control`
    )
  }
})

test('app composition imports and binds static Set aside actions before the bridge', () => {
  assert.match(
    appSource,
    /import\s*\{\s*bindVideoSetAsideActions\s*\}\s*from '\.\/features\/videos\/set-aside-actions\.js'/
  )

  const expectedActions = {
    request: 'requestVideoSetAside',
    cancel: 'cancelVideoSetAsidePrompt',
    confirm: 'confirmVideoSetAsidePrompt',
    handlePromptKeydown: 'handleVideoSetAsidePromptKeydown'
  }
  assert.deepEqual(
    getVideoSetAsideBindings(appSource, 'document'),
    [expectedActions]
  )

  const bindingIndex = appSource.indexOf(
    'bindVideoSetAsideActions(document,'
  )
  const bridgeIndex = appSource.indexOf('installLegacyActions(window,')
  assert.notEqual(bindingIndex, -1)
  assert.ok(
    bridgeIndex > bindingIndex,
    'Static Set aside actions must bind before legacy actions install'
  )
})

test('Next Study rebinds generated Set aside requests after replacement', () => {
  const renderStart = appSource.indexOf('function renderNextStudy(')
  const renderEnd = appSource.indexOf(
    '\nfunction renderAnkiStatus(',
    renderStart
  )
  assert.notEqual(renderStart, -1)
  assert.notEqual(renderEnd, -1)
  const renderSource = appSource.slice(renderStart, renderEnd)
  const replacementIndex = renderSource.lastIndexOf(
    'container.innerHTML ='
  )
  const bindingIndex = renderSource.indexOf(
    'bindVideoSetAsideActions(container,'
  )
  const returnIndex = renderSource.lastIndexOf('return nextVideo')

  assert.notEqual(replacementIndex, -1)
  assert.ok(bindingIndex > replacementIndex)
  assert.ok(returnIndex > bindingIndex)
  assert.deepEqual(
    getVideoSetAsideBindings(renderSource, 'container'),
    [{
      request: 'requestVideoSetAside',
      cancel: 'cancelVideoSetAsidePrompt',
      confirm: 'confirmVideoSetAsidePrompt',
      handlePromptKeydown: 'handleVideoSetAsidePromptKeydown'
    }]
  )
})

test('video grid rebinds generated Set aside requests after replacement', () => {
  const renderStart = appSource.indexOf('function renderFeed(')
  const renderEnd = appSource.indexOf(
    '\nfunction toggleWatchedSection(',
    renderStart
  )
  assert.notEqual(renderStart, -1)
  assert.notEqual(renderEnd, -1)
  const renderSource = appSource.slice(renderStart, renderEnd)
  const replacementIndex = renderSource.lastIndexOf('grid.innerHTML =')
  const bindingIndex = renderSource.indexOf(
    'bindVideoSetAsideActions(grid,'
  )

  assert.notEqual(replacementIndex, -1)
  assert.ok(bindingIndex > replacementIndex)
  assert.deepEqual(
    getVideoSetAsideBindings(renderSource, 'grid'),
    [{
      request: 'requestVideoSetAside',
      cancel: 'cancelVideoSetAsidePrompt',
      confirm: 'confirmVideoSetAsidePrompt',
      handlePromptKeydown: 'handleVideoSetAsidePromptKeydown'
    }]
  )
})

test('only Set aside event owners leave inline and legacy ownership', async () => {
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

  for (const actionName of migratedActionNames) {
    const actionPattern = new RegExp(`\\b${actionName}\\b`)
    assert.equal(
      inlineHandlers.some(handler => actionPattern.test(handler)),
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
      actionPattern,
      `${actionName} must not remain in the legacy install map`
    )
  }

  for (const actionName of retainedNeighborActionNames) {
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
  }
})
