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

const removedHandlerNames = [
  'closeStatusFilterMenu',
  'setStatusFilter',
  'toggleStatusFilterMenu'
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

function getStatusFilterBinding(source, rootName) {
  const match = source.match(
    new RegExp(
      `bindStatusFilterActions\\(${rootName},\\s*\\{([\\s\\S]*?)\\}\\)`
    )
  )
  assert.ok(match, `Expected status-filter binding for ${rootName}`)
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

test('static status tabs retain markup with module-owned selection', () => {
  const controls = getElements(indexSource, 'button').filter(element => (
    getAttribute(element.tag, 'data-status-tab') !== null
  ))
  const expectedControls = [
    {
      analyticsAction: 'videos.status.all',
      className: 'status-tab active',
      label: 'All',
      selected: 'true',
      status: 'all',
      translationKey: 'videos.status.all'
    },
    {
      analyticsAction: 'videos.status.unwatched',
      className: 'status-tab',
      label: 'Unwatched',
      selected: 'false',
      status: 'unwatched',
      translationKey: 'videos.status.unwatched'
    },
    {
      analyticsAction: 'videos.status.partial',
      className: 'status-tab',
      label: 'In progress',
      selected: 'false',
      status: 'partial',
      translationKey: 'videos.status.partial'
    },
    {
      analyticsAction: 'videos.status.watchLater',
      className: 'status-tab',
      label: 'Watch later',
      selected: 'false',
      status: 'watch-later',
      translationKey: 'videos.status.watchLater'
    },
    {
      analyticsAction: 'videos.status.favorite',
      className: 'status-tab',
      label: 'Favorite',
      selected: 'false',
      status: 'favorite',
      translationKey: 'videos.status.favorite'
    }
  ]

  assert.equal(controls.length, expectedControls.length)
  expectedControls.forEach((expected, index) => {
    const control = controls[index]
    assert.equal(getAttribute(control.tag, 'type'), 'button')
    assert.equal(getAttribute(control.tag, 'class'), expected.className)
    assert.equal(
      getAttribute(control.tag, 'data-status-filter-action'),
      'select-tab'
    )
    assert.equal(
      getAttribute(control.tag, 'data-status-tab'),
      expected.status
    )
    assert.equal(
      getAttribute(control.tag, 'data-analytics-action'),
      expected.analyticsAction
    )
    assert.equal(getAttribute(control.tag, 'role'), 'tab')
    assert.equal(
      getAttribute(control.tag, 'aria-selected'),
      expected.selected
    )
    assert.equal(getAttribute(control.tag, 'onclick'), null)
    assert.match(
      control.content,
      new RegExp(
        `<span data-i18n="${expected.translationKey}">`
          + `${expected.label}<\\/span>`
      )
    )
    assert.match(
      control.content,
      /<span class="status-tab-count">0<\/span>/
    )
  })
})

test('dormant status-filter toggle retains markup with module ownership', () => {
  const control = findSingle(
    getElements(indexSource, 'button'),
    element => getAttribute(element.tag, 'id') === 'statusFilterBtn',
    '#statusFilterBtn control'
  )

  assert.equal(getAttribute(control.tag, 'type'), 'button')
  assert.equal(
    getAttribute(control.tag, 'class'),
    'btn-secondary channel-filter-btn status-filter-btn'
  )
  assert.equal(
    getAttribute(control.tag, 'data-status-filter-action'),
    'toggle'
  )
  assert.equal(
    getAttribute(control.tag, 'data-analytics-action'),
    'statusFilterBtn'
  )
  assert.equal(getAttribute(control.tag, 'aria-haspopup'), 'true')
  assert.equal(getAttribute(control.tag, 'aria-expanded'), 'false')
  assert.equal(getAttribute(control.tag, 'onclick'), null)
  assert.equal(control.content.trim(), 'All videos')
})

test('generated status-filter controls retain markup with scoped ownership', () => {
  const closeControl = findSingle(
    getElements(appSource, 'button'),
    element => (
      getAttribute(element.tag, 'data-status-filter-action') === 'close'
    ),
    'generated status-filter close control'
  )
  assert.equal(getAttribute(closeControl.tag, 'type'), 'button')
  assert.equal(
    getAttribute(closeControl.tag, 'class'),
    'mobile-popover-close'
  )
  assert.equal(
    getAttribute(closeControl.tag, 'data-analytics-action'),
    'closeStatusFilterMenu'
  )
  assert.equal(
    getAttribute(closeControl.tag, 'title'),
    '${escHtml(t(\'settings.close\'))}'
  )
  assert.equal(
    getAttribute(closeControl.tag, 'aria-label'),
    '${escHtml(t(\'settings.close\'))}'
  )
  assert.equal(getAttribute(closeControl.tag, 'onclick'), null)
  assert.equal(closeControl.content.trim(), '×')

  const radio = findSingle(
    getOpeningTags(appSource, 'input'),
    tag => getAttribute(tag, 'name') === 'statusFilter',
    'generated status-filter radio template'
  )
  assert.equal(getAttribute(radio, 'type'), 'radio')
  assert.equal(
    getAttribute(radio, 'data-status-filter-action'),
    'select-option'
  )
  assert.equal(getAttribute(radio, 'data-status'), '${value}')
  assert.match(
    radio,
    /\$\{selectedStatusFilter === value \? 'checked' : ''\}/
  )
  assert.equal(getAttribute(radio, 'onchange'), null)
  assert.equal(getAttribute(radio, 'data-analytics-action'), null)
})

test('app composition imports and binds static and generated status actions', () => {
  assert.match(
    appSource,
    /import\s*\{\s*bindStatusFilterActions\s*\}\s*from '\.\/features\/videos\/status-filter-actions\.js'/
  )

  const expectedActions = {
    select: 'setStatusFilter',
    toggle: 'toggleStatusFilterMenu',
    close: 'closeStatusFilterMenu'
  }
  assert.deepEqual(
    getStatusFilterBinding(appSource, 'document'),
    expectedActions
  )

  const renderStart = appSource.indexOf(
    'function renderStatusFilterOptions('
  )
  const renderEnd = appSource.indexOf(
    '\nfunction getStatusFilterCounts(',
    renderStart
  )
  assert.notEqual(renderStart, -1)
  assert.notEqual(renderEnd, -1)
  const renderSource = appSource.slice(renderStart, renderEnd)
  assert.deepEqual(
    getStatusFilterBinding(renderSource, 'menu'),
    expectedActions
  )
})

test('migrated status-filter handlers have no inline or legacy ownership', async () => {
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

  for (const handlerName of removedHandlerNames) {
    const handlerPattern = new RegExp(`\\b${handlerName}\\b`)
    assert.equal(
      inlineHandlers.some(handler => handlerPattern.test(handler)),
      false,
      `${handlerName} must not remain in an inline attribute`
    )
    assert.equal(
      LEGACY_ACTION_NAMES.includes(handlerName),
      false,
      `${handlerName} must not remain in the legacy manifest`
    )
    assert.doesNotMatch(
      installMap,
      handlerPattern,
      `${handlerName} must not remain in the legacy install map`
    )
  }
})
