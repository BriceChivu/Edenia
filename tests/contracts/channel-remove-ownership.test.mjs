import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import {
  LEGACY_ACTION_NAMES
} from '../../src/compat/legacy-actions.js'
import {
  bindChannelRemoveActions
} from '../../src/features/channels/remove-actions.js'

const appSource = await readFile(
  new URL('../../src/app.js', import.meta.url),
  'utf8'
)
const analyticsSource = await readFile(
  new URL('../../analytics.js', import.meta.url),
  'utf8'
)

const controlSelector = '[data-channel-remove-action="remove"]'

function createControl(channelId) {
  const control = new EventTarget()
  control.dataset = {
    channelId,
    channelRemoveAction: 'remove'
  }
  return control
}

function createHarness(initialControls = []) {
  let controls = initialControls
  return {
    root: {
      querySelectorAll(selector) {
        assert.equal(selector, controlSelector)
        return controls
      }
    },
    replaceControls(nextControls) {
      controls = nextControls
    }
  }
}

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
  const end = appSource.indexOf(`\nfunction ${nextName}(`, declaration.index)
  assert.notEqual(end, -1, `Expected boundary after ${name}`)
  return appSource.slice(declaration.index, end)
}

function assertSourceOrder(source, values, label) {
  let previousIndex = -1
  for (const value of values) {
    const index = source.indexOf(value, previousIndex + 1)
    assert.ok(index > previousIndex, `${label}: ${value}`)
    previousIndex = index
  }
}

function assertAttributeOrder(tag, attributes, label) {
  assertSourceOrder(
    tag,
    attributes.map(([name, value]) => `${name}="${value}"`),
    label
  )
}

test('channel removal forwards the exact event and live channel ID', () => {
  const filterControl = createControl('filter-original')
  const shelfControl = createControl('shelf-original')
  const { root } = createHarness([filterControl, shelfControl])
  const calls = []

  assert.equal(bindChannelRemoveActions(root, {
    remove(event, channelId) {
      calls.push([event, channelId])
      event.preventDefault()
      event.stopPropagation()
    }
  }), 2)

  filterControl.dataset.channelId = 'filter-live'
  shelfControl.dataset.channelId = 'shelf-live'
  const filterEvent = new Event('click', {
    bubbles: true,
    cancelable: true
  })
  const shelfEvent = new Event('click', {
    bubbles: true,
    cancelable: true
  })

  assert.equal(filterControl.dispatchEvent(filterEvent), false)
  assert.equal(shelfControl.dispatchEvent(shelfEvent), false)
  assert.deepEqual(calls, [
    [filterEvent, 'filter-live'],
    [shelfEvent, 'shelf-live']
  ])
  assert.equal(filterEvent.defaultPrevented, true)
  assert.equal(shelfEvent.defaultPrevented, true)
})

test('channel removal is idempotent and binds both replacement paths', () => {
  const originalFilter = createControl('filter-original')
  const originalShelf = createControl('shelf-original')
  const filterHarness = createHarness([originalFilter])
  const shelfHarness = createHarness([originalShelf])
  const calls = []
  const actions = {
    remove(event, channelId) {
      calls.push([event.type, channelId])
    }
  }

  assert.equal(
    bindChannelRemoveActions(filterHarness.root, actions),
    1
  )
  assert.equal(
    bindChannelRemoveActions(filterHarness.root, actions),
    0
  )
  assert.equal(
    bindChannelRemoveActions(shelfHarness.root, actions),
    1
  )
  originalFilter.dispatchEvent(new Event('click'))
  originalShelf.dispatchEvent(new Event('click'))

  const replacementFilter = createControl('filter-replacement')
  const replacementShelf = createControl('shelf-replacement')
  filterHarness.replaceControls([replacementFilter])
  shelfHarness.replaceControls([replacementShelf])
  assert.equal(
    bindChannelRemoveActions(filterHarness.root, actions),
    1
  )
  assert.equal(
    bindChannelRemoveActions(shelfHarness.root, actions),
    1
  )
  replacementFilter.dispatchEvent(new Event('click'))
  replacementShelf.dispatchEvent(new Event('click'))

  assert.deepEqual(calls, [
    ['click', 'filter-original'],
    ['click', 'shelf-original'],
    ['click', 'filter-replacement'],
    ['click', 'shelf-replacement']
  ])

  filterHarness.replaceControls([])
  shelfHarness.replaceControls([])
  assert.equal(
    bindChannelRemoveActions(filterHarness.root, actions),
    0
  )
  assert.equal(
    bindChannelRemoveActions(shelfHarness.root, actions),
    0
  )
})

test('channel removal validates its root and callback boundary', () => {
  const { root } = createHarness()
  const actions = { remove() {} }

  assert.equal(bindChannelRemoveActions(root, actions), 0)
  assert.throws(
    () => bindChannelRemoveActions(null, actions),
    /queryable root/
  )
  assert.throws(
    () => bindChannelRemoveActions({}, actions),
    /queryable root/
  )
  assert.throws(
    () => bindChannelRemoveActions(root, null),
    /remove callback/
  )
  assert.throws(
    () => bindChannelRemoveActions(root, {}),
    /remove callback/
  )
})

test('filter and shelf removal retain exact generated markup and order', () => {
  const filterSource = getFunctionSource(
    'renderChannelFilterOptions',
    'refreshOpenChannelFilterTimestamps'
  )
  const shelfSource = getFunctionSource(
    'renderChannelVideoGroups',
    'renderChannelShelfAvatar'
  )
  const filterControl = findSingle(
    getElements(filterSource, 'button'),
    element => hasClass(element.tag, 'channel-filter-remove'),
    'filter removal control'
  )
  const shelfControl = findSingle(
    getElements(shelfSource, 'button'),
    element => hasClass(element.tag, 'channel-shelf-remove'),
    'shelf removal control'
  )

  const expectedControls = [
    {
      attributes: [
        ['type', 'button'],
        ['class', 'channel-filter-remove'],
        ['data-channel-id', '${escHtml(id)}'],
        ['data-channel-remove-action', 'remove'],
        ['data-analytics-action', 'removeChannelFromFilter'],
        ['title', "${escHtml(t('settings.remove'))}"],
        ['aria-label', "${escHtml(t('settings.remove'))}"]
      ],
      content: '×',
      control: filterControl,
      label: 'filter removal'
    },
    {
      attributes: [
        ['type', 'button'],
        ['class', 'channel-shelf-remove'],
        ['data-channel-id', '${escHtml(group.key)}'],
        ['data-channel-remove-action', 'remove'],
        ['data-analytics-action', 'removeChannelFromFilter'],
        ['title', "${escHtml(t('settings.remove'))}"],
        ['aria-label', "${escHtml(t('settings.remove'))}"]
      ],
      control: shelfControl,
      label: 'shelf removal'
    }
  ]

  for (const expected of expectedControls) {
    assertAttributeOrder(
      expected.control.tag,
      expected.attributes,
      expected.label
    )
    for (const [name, value] of expected.attributes) {
      assert.equal(getAttribute(expected.control.tag, name), value)
    }
    assert.equal(getAttribute(expected.control.tag, 'onclick'), null)
  }
  assert.equal(filterControl.content.trim(), '×')
  assert.match(
    shelfControl.content,
    /^\s*<svg class="channel-shelf-remove-icon" viewBox="0 0 16 16" aria-hidden="true">\s*<path d="M4 4l8 8M12 4l-8 8"><\/path>\s*<\/svg>\s*$/
  )

  assert.match(
    filterSource,
    /\$\{canRemove \? `<button[\s\S]*?data-channel-remove-action="remove"[\s\S]*?>×<\/button>` : ''\}/
  )
  assertSourceOrder(
    filterSource,
    [
      '<span class="channel-filter-label">',
      '<span class="channel-filter-refresh"',
      filterControl.tag
    ],
    'filter option content'
  )
  assert.match(
    shelfSource,
    /\$\{isRemovedChannel \? '' : `<button[\s\S]*?data-channel-remove-action="remove"[\s\S]*?<\/button>`\}/
  )
  assertSourceOrder(
    shelfSource,
    [
      '<strong>${escHtml(group.title)}</strong>',
      shelfControl.tag,
      '<span>${escHtml(countLabel)}</span>'
    ],
    'shelf heading content'
  )
})

test('filter replacement binds channel removal before filter controls', () => {
  assert.match(
    appSource,
    /import\s*\{\s*bindChannelRemoveActions\s*\}\s*from '\.\/features\/channels\/remove-actions\.js'/
  )
  const filterSource = getFunctionSource(
    'renderChannelFilterOptions',
    'refreshOpenChannelFilterTimestamps'
  )
  const replacementIndex = filterSource.indexOf(
    'optionsWrap.innerHTML = `'
  )
  const removeBindingIndex = filterSource.indexOf(
    'bindChannelRemoveActions(optionsWrap, {'
  )
  const filterBindingIndex = filterSource.indexOf(
    'bindChannelFilterActions(optionsWrap, {'
  )
  assert.notEqual(replacementIndex, -1)
  assert.ok(removeBindingIndex > replacementIndex)
  assert.ok(filterBindingIndex > removeBindingIndex)
  assert.match(
    filterSource.slice(replacementIndex, removeBindingIndex),
    /optionsWrap\.innerHTML = `[\s\S]*?`\s*$/
  )
  assert.match(
    filterSource.slice(removeBindingIndex, filterBindingIndex),
    /bindChannelRemoveActions\(optionsWrap,\s*\{\s*remove:\s*removeChannelFromFilter\s*\}\)\s*$/
  )
})

test('active grid replacement binds channel removal before later features', () => {
  const feedSource = getFunctionSource('renderFeed', 'toggleWatchedSection')
  const groupReplacementIndex = feedSource.indexOf(
    'grid.innerHTML = renderChannelVideoGroups('
  )
  const removeBindingIndex = feedSource.indexOf(
    'bindChannelRemoveActions(grid, {'
  )
  const setAsideBindingIndex = feedSource.indexOf(
    'bindVideoSetAsideActions(grid, {'
  )
  assert.notEqual(groupReplacementIndex, -1)
  assert.ok(removeBindingIndex > groupReplacementIndex)
  assert.ok(setAsideBindingIndex > removeBindingIndex)
  assert.match(
    feedSource.slice(groupReplacementIndex, removeBindingIndex),
    /grid\.innerHTML = renderChannelVideoGroups\([\s\S]*?\)\s*\}\s*$/
  )
  assert.match(
    feedSource.slice(removeBindingIndex, setAsideBindingIndex),
    /bindChannelRemoveActions\(grid,\s*\{\s*remove:\s*removeChannelFromFilter\s*\}\)\s*$/
  )
})

test('removal prevents default and propagation before mutating state', () => {
  const removeFromFilterSource = getFunctionSource(
    'removeChannelFromFilter',
    'removeChannel'
  )
  assert.match(
    removeFromFilterSource,
    /^function removeChannelFromFilter\(event, channelId\) \{\s*event\?\.preventDefault\(\)\s*event\?\.stopPropagation\(\)\s*removeChannel\(channelId\)\s*\}/
  )

  const optionSource = getFunctionSource(
    'handleChannelFilterOptionClick',
    'selectOnlyChannelFilter'
  )
  assert.match(
    optionSource,
    /if \(event\?\.target\?\.closest\?\.\('\.channel-filter-remove'\)\) return/
  )

  const shelfSource = getFunctionSource(
    'renderChannelVideoGroups',
    'renderChannelShelfAvatar'
  )
  const shelf = findSingle(
    getOpeningTags(shelfSource, 'section'),
    tag => hasClass(tag, 'channel-shelf'),
    'channel shelf'
  )
  assert.equal(getAttribute(shelf, 'onclick'), null)

  assert.match(
    analyticsSource,
    /document\.addEventListener\('click', event => \{\s*const control = event\.target\.closest\('button, a'\);/
  )
  assert.doesNotMatch(
    analyticsSource,
    /document\.addEventListener\('click',[\s\S]*?\},\s*true\)/
  )
})

test('removal retains snapshots, Undo, activity, save, and render ordering', () => {
  const removeSource = getFunctionSource(
    'removeChannel',
    'applyChannelRemoval'
  )
  assertSourceOrder(
    removeSource,
    [
      'const s = loadState()',
      'const channel = s.config.channels.find(c => c.id === id) || getInferredChannelEntry(s, id)',
      'if (!channel) return',
      'const before = getChannelRemoveSnapshot(s, id, channel)',
      'applyChannelRemoval(s, id)',
      'const after = getChannelRemoveSnapshot(s, id)',
      'pushUndoAction(s, {',
      "type: 'channel-remove'",
      'before,',
      'after',
      'appendActivityLog(s, {',
      "type: 'channel-remove'",
      "status: 'success'",
      'saveState(s)',
      'renderAll(s)',
      'renderActivityLog(s)'
    ],
    'channel removal transaction'
  )

  const applySource = getFunctionSource(
    'applyChannelRemoval',
    'restoreChannelVideosToGrid'
  )
  assert.match(
    applySource,
    /s\.config\.channels = \(s\.config\.channels \|\| \[\]\)\.filter\(c => c\.id !== channelId\)\s*delete refreshes\[channelId\]/
  )
  assert.match(
    applySource,
    /if \(!s\.config\.removedChannelIds\.includes\(channelId\)\) \{\s*s\.config\.removedChannelIds\.push\(channelId\)\s*\}/
  )
  assert.match(
    applySource,
    /if \(isDefaultChannelId\(channelId\) && !s\.config\.removedDefaultChannelIds\.includes\(channelId\)\) \{\s*s\.config\.removedDefaultChannelIds\.push\(channelId\)\s*\}/
  )
  assert.match(
    applySource,
    /if \(shouldPreserveRemovedChannelVideo\(video\)\) \{\s*video\.hiddenFromGrid = false\s*video\.hiddenFromGridAt = null\s*return\s*\}\s*video\.hiddenFromGrid = true\s*video\.hiddenFromGridAt = getCurrentAppTimestamp\(s\)/
  )
})

test('local removal function remains while its global alias is removed', () => {
  assert.match(
    appSource,
    /function removeChannelFromFilter\(event, channelId\)/
  )
  assert.equal(
    LEGACY_ACTION_NAMES.includes('removeChannelFromFilter'),
    false
  )
  const installMap = appSource.match(
    /installLegacyActions\(window,\s*\{([\s\S]*?)\}\)/
  )?.[1]
  assert.ok(installMap)
  assert.doesNotMatch(
    installMap,
    /(?:^|[\s,])removeChannelFromFilter(?:[\s,]|$)/
  )
  assert.doesNotMatch(
    appSource,
    /\bonclick=(["'])[^"']*\bremoveChannelFromFilter\s*\([\s\S]*?\1/
  )
})
