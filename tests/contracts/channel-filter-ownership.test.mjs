import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import {
  LEGACY_ACTION_NAMES
} from '../../src/compat/legacy-actions.js'
import {
  bindChannelFilterActions
} from '../../src/features/channels/filter-actions.js'

const appSource = await readFile(
  new URL('../../src/app.js', import.meta.url),
  'utf8'
)

const controlSelector = '[data-channel-filter-action]'
const migratedActionNames = [
  'handleChannelFilterOptionClick',
  'handleChannelFilterSelectAllClick',
  'setAllChannelFilters',
  'setChannelFilter'
]

function createControl(actionName, dataset = {}, checked = false) {
  const control = new EventTarget()
  control.dataset = {
    channelFilterAction: actionName,
    ...dataset
  }
  control.checked = checked
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

function createActions(calls) {
  return {
    setChannel(...args) {
      calls.push(['setChannel', args])
    },
    setAll(...args) {
      calls.push(['setAll', args])
    },
    handleSelectAllClick(...args) {
      calls.push(['handleSelectAllClick', args])
    },
    handleOptionClick(...args) {
      calls.push(['handleOptionClick', args])
    }
  }
}

function getAttribute(tag, name) {
  return tag.match(
    new RegExp(`\\s${name}=(["'])([\\s\\S]*?)\\1`)
  )?.[2] ?? null
}

function getOpeningTags(source, tagName) {
  return [...source.matchAll(
    new RegExp(`<${tagName}\\b[^>]*>`, 'g')
  )].map(match => match[0])
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

function getChannelFilterBinding(source) {
  const match = source.match(
    /bindChannelFilterActions\(optionsWrap,\s*\{([\s\S]*?)\}\)/
  )
  assert.ok(match, 'Expected generated channel-filter binding')
  return Object.fromEntries(
    [...match[1].matchAll(/\b(\w+):\s*(\w+)/g)]
      .map(binding => [binding[1], binding[2]])
  )
}

test('channel-filter ownership forwards exact events and live values', () => {
  const selectAllRow = createControl('select-all-row')
  const selectAll = createControl('select-all', {}, false)
  const optionRow = createControl('option-row', {
    channelId: 'row-original'
  })
  const select = createControl('select', {
    channelId: 'select-original'
  }, true)
  const { root } = createHarness([
    selectAllRow,
    selectAll,
    optionRow,
    select
  ])
  const calls = []

  assert.equal(
    bindChannelFilterActions(root, createActions(calls)),
    4
  )

  selectAll.checked = true
  optionRow.dataset.channelId = 'row-live'
  select.dataset.channelId = 'select-live'
  select.checked = false

  const selectAllRowEvent = new Event('click', {
    bubbles: true,
    cancelable: true
  })
  const selectAllEvent = new Event('change', {
    bubbles: true,
    cancelable: true
  })
  const optionRowEvent = new Event('click', {
    bubbles: true,
    cancelable: true
  })
  Object.defineProperty(optionRowEvent, 'altKey', {
    value: true
  })
  const selectEvent = new Event('change', {
    bubbles: true,
    cancelable: true
  })

  assert.equal(selectAllRow.dispatchEvent(selectAllRowEvent), true)
  assert.equal(selectAll.dispatchEvent(selectAllEvent), true)
  assert.equal(optionRow.dispatchEvent(optionRowEvent), true)
  assert.equal(select.dispatchEvent(selectEvent), true)

  assert.equal(calls.length, 4)
  assert.equal(calls[0][0], 'handleSelectAllClick')
  assert.deepEqual(calls[0][1], [selectAllRowEvent])
  assert.deepEqual(calls[1], ['setAll', [true]])
  assert.equal(calls[2][0], 'handleOptionClick')
  assert.deepEqual(calls[2][1], [optionRowEvent, 'row-live'])
  assert.equal(calls[2][1][0].altKey, true)
  assert.deepEqual(calls[3], ['setChannel', ['select-live', false]])

  for (const event of [
    selectAllRowEvent,
    selectAllEvent,
    optionRowEvent,
    selectEvent
  ]) {
    assert.equal(event.defaultPrevented, false)
    assert.equal(event.cancelBubble, false)
  }
})

test('channel-filter ownership is idempotent and binds replacements', () => {
  const original = createControl('select', {
    channelId: 'original'
  }, true)
  const replacementRow = createControl('option-row', {
    channelId: 'replacement'
  })
  const replacementSelectAll = createControl('select-all', {}, false)
  const harness = createHarness([original])
  const calls = []
  const actions = createActions(calls)

  assert.equal(bindChannelFilterActions(harness.root, actions), 1)
  assert.equal(bindChannelFilterActions(harness.root, actions), 0)
  original.dispatchEvent(new Event('change'))

  harness.replaceControls([replacementRow, replacementSelectAll])
  assert.equal(bindChannelFilterActions(harness.root, actions), 2)
  replacementRow.dispatchEvent(new Event('click'))
  replacementSelectAll.dispatchEvent(new Event('change'))

  assert.deepEqual(calls.map(call => call[0]), [
    'setChannel',
    'handleOptionClick',
    'setAll'
  ])
  assert.deepEqual(calls[0][1], ['original', true])
  assert.equal(calls[1][1][1], 'replacement')
  assert.deepEqual(calls[2][1], [false])

  harness.replaceControls([])
  assert.equal(bindChannelFilterActions(harness.root, actions), 0)
})

test('channel-filter ownership ignores unknown hooks and validates boundaries', () => {
  const foreign = createControl(undefined)
  delete foreign.dataset.channelFilterAction
  const unknown = createControl('unknown', {
    channelId: 'ignored'
  }, true)
  const harness = createHarness([foreign, unknown])
  const calls = []
  const actions = createActions(calls)

  assert.equal(bindChannelFilterActions(harness.root, actions), 0)
  foreign.dispatchEvent(new Event('click'))
  unknown.dispatchEvent(new Event('click'))
  unknown.dispatchEvent(new Event('change'))
  assert.deepEqual(calls, [])

  assert.throws(
    () => bindChannelFilterActions(null, actions),
    /queryable root/
  )
  assert.throws(
    () => bindChannelFilterActions({}, actions),
    /queryable root/
  )
  for (const callbackName of [
    'setChannel',
    'setAll',
    'handleSelectAllClick',
    'handleOptionClick'
  ]) {
    assert.throws(
      () => bindChannelFilterActions(harness.root, {
        ...actions,
        [callbackName]: null
      }),
      /setChannel, setAll, handleSelectAllClick, and handleOptionClick callbacks/
    )
  }
})

test('generated filter markup transfers exactly four controls to module ownership', () => {
  const renderSource = getFunctionSource(
    'renderChannelFilterOptions',
    'refreshOpenChannelFilterTimestamps'
  )
  const expectedControls = [
    {
      action: 'select-all-row',
      analyticsAction: 'handleChannelFilterSelectAllClick',
      channelId: null,
      eventAttribute: 'onclick',
      id: null,
      tagName: 'div'
    },
    {
      action: 'select-all',
      analyticsAction: 'setAllChannelFilters',
      channelId: null,
      eventAttribute: 'onchange',
      id: 'channelFilterSelectAll',
      tagName: 'input'
    },
    {
      action: 'option-row',
      analyticsAction: 'handleChannelFilterOptionClick',
      channelId: '${escHtml(id)}',
      eventAttribute: 'onclick',
      id: null,
      tagName: 'div'
    },
    {
      action: 'select',
      analyticsAction: 'setChannelFilter',
      channelId: '${escHtml(id)}',
      eventAttribute: 'onchange',
      id: null,
      tagName: 'input'
    }
  ]

  for (const expected of expectedControls) {
    const control = findSingle(
      getOpeningTags(renderSource, expected.tagName),
      tag => (
        getAttribute(tag, 'data-channel-filter-action')
          === expected.action
      ),
      `${expected.action} channel-filter control`
    )
    assert.equal(
      getAttribute(control, 'data-channel-filter-action'),
      expected.action
    )
    assert.equal(
      getAttribute(control, 'data-analytics-action'),
      expected.analyticsAction
    )
    assert.equal(
      getAttribute(control, 'data-channel-id'),
      expected.channelId
    )
    assert.equal(getAttribute(control, 'id'), expected.id)
    assert.equal(getAttribute(control, expected.eventAttribute), null)
  }
})

test('render replacement binds immediately before indeterminate state is restored', () => {
  assert.match(
    appSource,
    /import\s*\{\s*bindChannelFilterActions\s*\}\s*from '\.\/features\/channels\/filter-actions\.js'/
  )

  const renderSource = getFunctionSource(
    'renderChannelFilterOptions',
    'refreshOpenChannelFilterTimestamps'
  )
  assert.deepEqual(getChannelFilterBinding(renderSource), {
    setChannel: 'setChannelFilter',
    setAll: 'setAllChannelFilters',
    handleSelectAllClick: 'handleChannelFilterSelectAllClick',
    handleOptionClick: 'handleChannelFilterOptionClick'
  })

  const replacementIndex = renderSource.indexOf(
    'optionsWrap.innerHTML = `'
  )
  const bindingIndex = renderSource.indexOf(
    'bindChannelFilterActions(optionsWrap, {'
  )
  const selectAllLookupIndex = renderSource.indexOf(
    "document.getElementById('channelFilterSelectAll')"
  )
  const indeterminateIndex = renderSource.indexOf(
    'selectAllInput.indeterminate = selectedCount > 0 && selectedCount < entries.length'
  )
  assert.notEqual(replacementIndex, -1)
  assert.ok(bindingIndex > replacementIndex)
  assert.ok(selectAllLookupIndex > bindingIndex)
  assert.ok(indeterminateIndex > selectAllLookupIndex)
  assert.match(
    renderSource.slice(replacementIndex, bindingIndex),
    /optionsWrap\.innerHTML = `[\s\S]*?`\s*$/
  )
})

test('periodic timestamp replacement continues through the bound renderer', () => {
  const refreshSource = getFunctionSource(
    'refreshOpenChannelFilterTimestamps',
    'startChannelRefreshLabelTicker'
  )
  assert.match(
    refreshSource,
    /^function refreshOpenChannelFilterTimestamps\(\) \{\s*const popover = document\.getElementById\('manualVideoPopover'\)\s*if \(!popover \|\| popover\.classList\.contains\('hidden'\)\) return\s*renderChannelFilterOptions\(loadState\(\)\)\s*\}/
  )

  const tickerSource = getFunctionSource(
    'startChannelRefreshLabelTicker',
    'getChannelFilterEntries'
  )
  assert.match(
    tickerSource,
    /clearInterval\(startChannelRefreshLabelTicker\._timer\)\s*startChannelRefreshLabelTicker\._timer = setInterval\(refreshOpenChannelFilterTimestamps, 30_000\)/
  )
  assert.match(
    appSource,
    /document\.addEventListener\('visibilitychange', refreshOpenChannelFilterTimestamps\)/
  )
})

test('nested guards and Alt-click cancellation remain in app-owned handlers', () => {
  const selectAllSource = getFunctionSource(
    'handleChannelFilterSelectAllClick',
    'handleChannelFilterOptionClick'
  )
  assert.match(
    selectAllSource,
    /^function handleChannelFilterSelectAllClick\(event\) \{\s*if \(event\?\.target\?\.matches\?\.\('input'\)\) return\s*const checkbox = event\.currentTarget\?\.querySelector\?\.\('input\[type="checkbox"\]'\)\s*if \(!checkbox\) return\s*checkbox\.checked = !checkbox\.checked\s*setAllChannelFilters\(checkbox\.checked\)\s*\}/
  )

  const optionSource = getFunctionSource(
    'handleChannelFilterOptionClick',
    'selectOnlyChannelFilter'
  )
  assert.match(
    optionSource,
    /^function handleChannelFilterOptionClick\(event, channelId\) \{\s*if \(event\?\.target\?\.closest\?\.\('\.channel-filter-remove'\)\) return\s*if \(event\?\.altKey\) \{\s*event\.preventDefault\(\)\s*event\.stopPropagation\(\)\s*selectOnlyChannelFilter\(channelId\)\s*return\s*\}\s*if \(event\?\.target\?\.matches\?\.\('input'\)\) return\s*const checkbox = event\.currentTarget\?\.querySelector\?\.\('input\[type="checkbox"\]'\)\s*if \(!checkbox\) return\s*checkbox\.checked = !checkbox\.checked\s*setChannelFilter\(channelId, checkbox\.checked\)\s*\}/
  )
})

test('only inline removal remains shared through the legacy bridge', () => {
  const renderSource = getFunctionSource(
    'renderChannelFilterOptions',
    'refreshOpenChannelFilterTimestamps'
  )
  const shelfSource = getFunctionSource(
    'renderChannelVideoGroups',
    'renderChannelShelfAvatar'
  )
  const removeHandler =
    'removeChannelFromFilter(event, this.dataset.channelId)'
  const filterRemove = findSingle(
    getOpeningTags(renderSource, 'button'),
    tag => getAttribute(tag, 'class') === 'channel-filter-remove',
    'filter removal control'
  )
  const shelfRemove = findSingle(
    getOpeningTags(shelfSource, 'button'),
    tag => getAttribute(tag, 'class') === 'channel-shelf-remove',
    'shelf removal control'
  )
  for (const control of [filterRemove, shelfRemove]) {
    assert.equal(getAttribute(control, 'onclick'), removeHandler)
    assert.equal(
      getAttribute(control, 'data-analytics-action'),
      'removeChannelFromFilter'
    )
    assert.equal(
      getAttribute(control, 'data-channel-filter-action'),
      null
    )
  }

  const installMap = appSource.match(
    /installLegacyActions\(window,\s*\{([\s\S]*?)\}\)/
  )?.[1]
  assert.ok(installMap)
  for (const actionName of migratedActionNames) {
    assert.equal(LEGACY_ACTION_NAMES.includes(actionName), false)
    assert.doesNotMatch(
      installMap,
      new RegExp(`(?:^|[\\s,])${actionName}(?:[\\s,]|$)`)
    )
  }
  assert.equal(
    LEGACY_ACTION_NAMES.includes('removeChannelFromFilter'),
    true
  )
  assert.match(
    installMap,
    /(?:^|[\s,])removeChannelFromFilter(?:[\s,]|$)/
  )
})
