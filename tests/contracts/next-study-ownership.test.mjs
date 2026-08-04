import assert from 'node:assert/strict'
import { readdir, readFile } from 'node:fs/promises'
import { extname } from 'node:path'
import test from 'node:test'
import {
  GLOBAL_ACTION_NAMES
} from '../../src/core/global-action-contract.js'

const appSource = await readFile(
  new URL('../../src/app.js', import.meta.url),
  'utf8'
)

const renderStart = appSource.indexOf('function renderNextStudy(')
const renderEnd = appSource.indexOf(
  '\nfunction renderAnkiStatus(',
  renderStart
)
assert.notEqual(renderStart, -1, 'Expected renderNextStudy')
assert.notEqual(renderEnd, -1, 'Expected the renderNextStudy boundary')
const renderSource = appSource.slice(renderStart, renderEnd)

const migratedActionNames = [
  'openNextStudyVideoPlayer',
  'focusNextStudyVideoCard',
  'toggleVideoFavorite'
]

function getElements(source, tagName) {
  return [...source.matchAll(
    new RegExp(`(<${tagName}\\b[^>]*>)([\\s\\S]*?)<\\/${tagName}>`, 'g')
  )].map(match => ({
    content: match[2],
    tag: match[1]
  }))
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

function getNextStudyBindings(source) {
  return [...source.matchAll(
    /bindNextStudyActions\((\w+),\s*\{([\s\S]*?)\}\)/g
  )].map(match => ({
    actions: Object.fromEntries(
      [...match[2].matchAll(/\b(\w+):\s*(\w+)/g)]
        .map(binding => [binding[1], binding[2]])
    ),
    root: match[1]
  }))
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

test('generated Next Study open and focus controls retain exact module hooks', () => {
  const controls = getElements(renderSource, 'button')
  const openControls = controls.filter(element => (
    getAttribute(element.tag, 'data-next-study-action') === 'open'
  ))
  assert.equal(openControls.length, 4)

  for (const control of openControls) {
    assert.equal(getAttribute(control.tag, 'type'), 'button')
    assert.equal(
      getAttribute(control.tag, 'data-video-id'),
      '${safeVideoId}'
    )
    assert.equal(
      getAttribute(control.tag, 'data-analytics-action'),
      'openNextStudyVideoPlayer'
    )
    assert.equal(getAttribute(control.tag, 'onclick'), null)
  }

  const focusControl = findSingle(
    controls,
    element => hasClass(element.tag, 'next-study-panel-focus'),
    'Next Study focus control'
  )
  assert.equal(
    getAttribute(focusControl.tag, 'data-next-study-action'),
    'focus'
  )
  assert.equal(
    getAttribute(focusControl.tag, 'data-video-id'),
    '${safeVideoId}'
  )
  assert.equal(
    getAttribute(focusControl.tag, 'data-analytics-action'),
    'focusNextStudyVideoCard'
  )
  assert.equal(getAttribute(focusControl.tag, 'onclick'), null)
})

test('More actions stays isolated while Remove favorite joins Next Study ownership', () => {
  const controls = getElements(renderSource, 'button')
  const moreControl = findSingle(
    controls,
    element => hasClass(element.tag, 'next-study-more'),
    'Next Study More actions control'
  )
  assert.equal(
    getAttribute(moreControl.tag, 'data-video-organization-action'),
    'menu'
  )
  assert.equal(
    getAttribute(moreControl.tag, 'data-video-organization-surface'),
    'continue_watching'
  )
  assert.equal(
    getAttribute(moreControl.tag, 'data-analytics-action'),
    'openVideoActions'
  )
  assert.equal(
    getAttribute(moreControl.tag, 'data-next-study-action'),
    null
  )
  assert.equal(getAttribute(moreControl.tag, 'onclick'), null)

  const favoriteControl = findSingle(
    controls,
    element => hasClass(element.tag, 'next-study-reset'),
    'Next Study Remove favorite control'
  )
  assert.equal(
    getAttribute(favoriteControl.tag, 'data-next-study-action'),
    'toggle-favorite'
  )
  assert.equal(
    getAttribute(favoriteControl.tag, 'data-next-study-surface'),
    'next_study'
  )
  assert.equal(
    getAttribute(favoriteControl.tag, 'data-video-id'),
    '${safeVideoId}'
  )
  assert.equal(
    getAttribute(favoriteControl.tag, 'data-analytics-action'),
    'toggleVideoFavorite'
  )
  assert.equal(getAttribute(favoriteControl.tag, 'onclick'), null)
})

test('app composition imports and immediately binds generated Next Study actions', () => {
  assert.match(
    appSource,
    /import\s*\{\s*bindNextStudyActions\s*\}\s*from '\.\/features\/videos\/next-study-actions\.js'/
  )

  const expectedActions = {
    open: 'openNextStudyVideoPlayer',
    focus: 'focusNextStudyVideoCard',
    toggleFavorite: 'toggleVideoFavorite'
  }
  assert.deepEqual(
    getNextStudyBindings(renderSource),
    [{
      actions: expectedActions,
      root: 'container'
    }]
  )

  assert.match(
    renderSource,
    /container\.innerHTML = `[\s\S]*?`\s*bindNextStudyActions\(container,\s*\{\s*open: openNextStudyVideoPlayer,\s*focus: focusNextStudyVideoCard,\s*toggleFavorite: toggleVideoFavorite\s*\}\)[\s\S]*?if \(!VIDEO_ORGANIZATION_ENABLED\) \{[\s\S]*?bindVideoSetAsideActions\(container,[\s\S]*?\}\s*return nextVideo/
  )

  const emptyClearIndex = renderSource.indexOf("container.innerHTML = ''")
  const emptyReturnIndex = renderSource.indexOf(
    'return null',
    emptyClearIndex
  )
  const bindingIndex = renderSource.indexOf(
    'bindNextStudyActions(container,'
  )
  const returnIndex = renderSource.lastIndexOf('return nextVideo')

  assert.notEqual(emptyClearIndex, -1)
  assert.ok(emptyReturnIndex > emptyClearIndex)
  assert.ok(
    bindingIndex > emptyReturnIndex,
    'Empty-state clearing must not bind generated Next Study actions'
  )
  assert.ok(returnIndex > bindingIndex)
})

test('open and focus leave the bridge while shared Favorite ownership remains', async () => {
  assert.match(
    appSource,
    /function openNextStudyVideoPlayer\(event, videoId\) \{/
  )
  assert.match(
    appSource,
    /function focusNextStudyVideoCard\(event, videoId\) \{/
  )

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

  for (const actionName of migratedActionNames) {
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

  const favoriteInlineHandlers = inlineHandlers.filter(handler => (
    /\btoggleVideoFavorite\s*\(/.test(handler)
  ))
  assert.deepEqual(favoriteInlineHandlers, [])
})
