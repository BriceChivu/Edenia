import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import {
  LEGACY_ACTION_NAMES
} from '../../src/compat/legacy-actions.js'

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

function getOpeningTags(source, tagName) {
  return [...source.matchAll(
    new RegExp(`<${tagName}\\b[^>]*>`, 'g')
  )].map(match => match[0])
}

function getTagByClass(source, tagName, className) {
  const tag = getOpeningTags(source, tagName).find(candidate => (
    (getAttribute(candidate, 'class') || '').split(/\s+/).includes(className)
  ))
  assert.ok(tag, `Expected ${tagName}.${className}`)
  return tag
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

const filterRenderSource = getFunctionSource(
  'renderChannelFilterOptions',
  'refreshOpenChannelFilterTimestamps'
)
const shelfRenderSource = getFunctionSource(
  'renderChannelVideoGroups',
  'renderChannelShelfAvatar'
)

const selectAllRow = getTagByClass(
  filterRenderSource,
  'div',
  'channel-filter-select-all'
)
const optionRow = getTagByClass(
  filterRenderSource,
  'div',
  'channel-filter-option'
)
const selectAllInput = getOpeningTags(filterRenderSource, 'input').find(
  tag => getAttribute(tag, 'id') === 'channelFilterSelectAll'
)
const optionInput = getOpeningTags(filterRenderSource, 'input').find(
  tag => getAttribute(tag, 'data-channel-id') === '${escHtml(id)}'
)
const filterRemoveButton = getTagByClass(
  filterRenderSource,
  'button',
  'channel-filter-remove'
)
const shelfRemoveButton = getTagByClass(
  shelfRenderSource,
  'button',
  'channel-shelf-remove'
)

assert.ok(selectAllInput, 'Expected select-all checkbox')
assert.ok(optionInput, 'Expected channel-option checkbox')

test('generated filter controls retain variants, order, metadata, and exact inline arguments', () => {
  assert.match(
    filterRenderSource,
    /const allChannelsControl = entries\.length\s*\? `/
  )
  assert.match(
    filterRenderSource,
    /const options = entries\.length\s*\? entries\.map\(\(\[id, name\]\) => \{/
  )
  assert.match(
    filterRenderSource,
    /: `<div class="channel-filter-empty">\$\{escHtml\(t\('videos\.channels\.none'\)\)\}<\/div>`/
  )

  const controls = [
    {
      action: 'handleChannelFilterSelectAllClick',
      eventAttribute: 'onclick',
      eventValue: 'handleChannelFilterSelectAllClick(event)',
      tag: selectAllRow
    },
    {
      action: 'setAllChannelFilters',
      eventAttribute: 'onchange',
      eventValue: 'setAllChannelFilters(this.checked)',
      tag: selectAllInput
    },
    {
      action: 'handleChannelFilterOptionClick',
      eventAttribute: 'onclick',
      eventValue:
        'handleChannelFilterOptionClick(event, this.dataset.channelId)',
      tag: optionRow
    },
    {
      action: 'setChannelFilter',
      eventAttribute: 'onchange',
      eventValue:
        'setChannelFilter(this.dataset.channelId, this.checked)',
      tag: optionInput
    },
    {
      action: 'removeChannelFromFilter',
      eventAttribute: 'onclick',
      eventValue:
        'removeChannelFromFilter(event, this.dataset.channelId)',
      tag: filterRemoveButton
    }
  ]

  for (const control of controls) {
    assert.equal(
      getAttribute(control.tag, 'data-analytics-action'),
      control.action
    )
    assert.equal(
      getAttribute(control.tag, control.eventAttribute),
      control.eventValue
    )
    assert.equal(
      getInlineHandlerName(control.eventValue),
      control.action
    )
    assert.equal(control.eventValue.startsWith('return '), false)
  }

  assert.equal(
    getAttribute(selectAllRow, 'class'),
    'channel-filter-select-all'
  )
  assert.equal(getAttribute(selectAllInput, 'type'), 'checkbox')
  assert.equal(
    getAttribute(selectAllInput, 'id'),
    'channelFilterSelectAll'
  )
  assert.equal(
    getAttribute(selectAllInput, 'aria-label'),
    "${escHtml(t('videos.channels.all'))}"
  )
  assert.ok(
    selectAllInput.includes(
      "${selectedCount === entries.length ? 'checked' : ''}"
    )
  )

  assert.equal(getAttribute(optionRow, 'class'), 'channel-filter-option')
  assert.equal(
    getAttribute(optionRow, 'data-channel-id'),
    '${escHtml(id)}'
  )
  assert.equal(getAttribute(optionInput, 'type'), 'checkbox')
  assert.equal(
    getAttribute(optionInput, 'data-channel-id'),
    '${escHtml(id)}'
  )
  assert.ok(
    optionInput.includes("${selected.has(id) ? 'checked' : ''}")
  )
  assert.ok(
    filterRenderSource.includes(
      '<span class="channel-filter-label">${escHtml(name)}</span>'
    )
  )
  assert.ok(
    filterRenderSource.includes(
      '<span class="channel-filter-refresh" title="${escHtml(refreshTitle)}">${escHtml(refreshLabel)}</span>'
    )
  )

  assert.equal(getAttribute(filterRemoveButton, 'type'), 'button')
  assert.equal(
    getAttribute(filterRemoveButton, 'data-channel-id'),
    '${escHtml(id)}'
  )
  assert.equal(
    getAttribute(filterRemoveButton, 'title'),
    "${escHtml(t('settings.remove'))}"
  )
  assert.equal(
    getAttribute(filterRemoveButton, 'aria-label'),
    "${escHtml(t('settings.remove'))}"
  )
  assert.match(
    filterRenderSource,
    /\$\{canRemove \? `<button[\s\S]*?>×<\/button>` : ''\}/
  )

  assertSourceOrder(
    filterRenderSource,
    [
      selectAllRow,
      selectAllInput,
      optionRow,
      optionInput,
      '<span class="channel-filter-label">',
      '<span class="channel-filter-refresh"',
      filterRemoveButton
    ],
    'channel-filter generated order'
  )
})

test('filter and shelf removal surfaces share exact metadata and inline ownership', () => {
  for (const button of [filterRemoveButton, shelfRemoveButton]) {
    assert.equal(getAttribute(button, 'type'), 'button')
    assert.equal(
      getAttribute(button, 'data-analytics-action'),
      'removeChannelFromFilter'
    )
    assert.equal(
      getAttribute(button, 'onclick'),
      'removeChannelFromFilter(event, this.dataset.channelId)'
    )
  }

  assert.equal(
    getAttribute(shelfRemoveButton, 'class'),
    'channel-shelf-remove'
  )
  assert.equal(
    getAttribute(shelfRemoveButton, 'data-channel-id'),
    '${escHtml(group.key)}'
  )
  assert.equal(
    getAttribute(shelfRemoveButton, 'title'),
    "${escHtml(t('settings.remove'))}"
  )
  assert.equal(
    getAttribute(shelfRemoveButton, 'aria-label'),
    "${escHtml(t('settings.remove'))}"
  )
  assert.match(
    shelfRenderSource,
    /\$\{isRemovedChannel \? '' : `<button[\s\S]*?class="channel-shelf-remove"[\s\S]*?<\/button>`\}/
  )
  assert.match(
    shelfRenderSource,
    /<svg class="channel-shelf-remove-icon" viewBox="0 0 16 16" aria-hidden="true">\s*<path d="M4 4l8 8M12 4l-8 8"><\/path>\s*<\/svg>/
  )

  const removalConsumers = [
    ...filterRenderSource.matchAll(
      /onclick="removeChannelFromFilter\(event, this\.dataset\.channelId\)"/g
    ),
    ...shelfRenderSource.matchAll(
      /onclick="removeChannelFromFilter\(event, this\.dataset\.channelId\)"/g
    )
  ]
  assert.equal(removalConsumers.length, 2)
})

test('explicit actions preserve current handler-derived analytics identities', () => {
  const expectedEvents = {
    setChannelFilter: 'set_channel_filter_clicked',
    setAllChannelFilters: 'set_all_channel_filters_clicked',
    handleChannelFilterSelectAllClick:
      'handle_channel_filter_select_all_click_clicked',
    handleChannelFilterOptionClick:
      'handle_channel_filter_option_click_clicked',
    removeChannelFromFilter: 'remove_channel_from_filter_clicked'
  }

  for (const [action, eventName] of Object.entries(expectedEvents)) {
    assert.equal(normalizeClickEventName(action), eventName)
  }

  assert.match(
    analyticsSource,
    /const handlerName = inlineHandler\.match\(\/\^\\s\*\(\[a-zA-Z_\$\]\[\\w\$\]\*\)\\s\*\\\(\/\)\?\.\[1\] \|\| '';/
  )
  assert.match(
    analyticsSource,
    /const action = control\.dataset\.analyticsAction\s*\|\| control\.dataset\.i18n/
  )
  assert.match(
    analyticsSource,
    /const control = event\.target\.closest\('button, a'\);\s*if \(!control \|\| control\.disabled\) return;/
  )
  assert.doesNotMatch(
    analyticsSource,
    /document\.addEventListener\(['"]change['"]/
  )

  for (const inertControl of [
    selectAllRow,
    selectAllInput,
    optionRow,
    optionInput
  ]) {
    assert.notEqual(inertControl.startsWith('<button'), true)
    assert.notEqual(inertControl.startsWith('<a'), true)
  }
})

test('nested target guards and Alt-click propagation retain exact ownership', () => {
  const selectAllSource = getFunctionSource(
    'handleChannelFilterSelectAllClick',
    'handleChannelFilterOptionClick'
  )
  assert.match(
    selectAllSource,
    /^function handleChannelFilterSelectAllClick\(event\) \{\s*if \(event\?\.target\?\.matches\?\.\('input'\)\) return\s*const checkbox = event\.currentTarget\?\.querySelector\?\.\('input\[type="checkbox"\]'\)\s*if \(!checkbox\) return\s*checkbox\.checked = !checkbox\.checked\s*setAllChannelFilters\(checkbox\.checked\)\s*\}/
  )
  assert.doesNotMatch(
    selectAllSource,
    /\.preventDefault\(|\.stopPropagation\(/
  )

  const optionSource = getFunctionSource(
    'handleChannelFilterOptionClick',
    'selectOnlyChannelFilter'
  )
  assert.match(
    optionSource,
    /^function handleChannelFilterOptionClick\(event, channelId\) \{\s*if \(event\?\.target\?\.closest\?\.\('\.channel-filter-remove'\)\) return\s*if \(event\?\.altKey\) \{\s*event\.preventDefault\(\)\s*event\.stopPropagation\(\)\s*selectOnlyChannelFilter\(channelId\)\s*return\s*\}\s*if \(event\?\.target\?\.matches\?\.\('input'\)\) return\s*const checkbox = event\.currentTarget\?\.querySelector\?\.\('input\[type="checkbox"\]'\)\s*if \(!checkbox\) return\s*checkbox\.checked = !checkbox\.checked\s*setChannelFilter\(channelId, checkbox\.checked\)\s*\}/
  )

  const removeSource = getFunctionSource(
    'removeChannelFromFilter',
    'removeChannel'
  )
  assert.match(
    removeSource,
    /^function removeChannelFromFilter\(event, channelId\) \{\s*event\?\.preventDefault\(\)\s*event\?\.stopPropagation\(\)\s*removeChannel\(channelId\)\s*\}/
  )
})

test('filter replacement and refresh timestamps retain synchronous timing', () => {
  assertSourceOrder(
    filterRenderSource,
    [
      'const refreshLabel = formatChannelLastRefreshLabel(s, id)',
      'const refreshTitle = formatChannelLastRefreshTitle(s, id)',
      'optionsWrap.innerHTML = `',
      "document.getElementById('channelFilterSelectAll')",
      'selectAllInput.indeterminate = selectedCount > 0 && selectedCount < entries.length',
      'optionsWrap.dataset.selectedCount = selectedCount'
    ],
    'filter replacement timing'
  )

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
    /^function startChannelRefreshLabelTicker\(\) \{\s*clearInterval\(startChannelRefreshLabelTicker\._timer\)\s*startChannelRefreshLabelTicker\._timer = setInterval\(refreshOpenChannelFilterTimestamps, 30_000\)\s*\}/
  )
  assert.match(
    appSource,
    /document\.addEventListener\('visibilitychange', refreshOpenChannelFilterTimestamps\)/
  )
})

test('all five handler families remain shared through the legacy bridge', () => {
  const expectedActions = [
    'handleChannelFilterOptionClick',
    'handleChannelFilterSelectAllClick',
    'removeChannelFromFilter',
    'setAllChannelFilters',
    'setChannelFilter'
  ]
  const installMap = appSource.match(
    /installLegacyActions\(window,\s*\{([\s\S]*?)\}\)/
  )?.[1]
  assert.ok(installMap)

  for (const action of expectedActions) {
    assert.equal(LEGACY_ACTION_NAMES.includes(action), true, action)
    assert.match(
      installMap,
      new RegExp(`(?:^|[\\s,])${action}(?:[\\s,]|$)`)
    )
  }
})
