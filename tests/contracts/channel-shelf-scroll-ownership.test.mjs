import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import {
  LEGACY_ACTION_NAMES
} from '../../src/compat/legacy-actions.js'
import {
  bindChannelShelfScrollActions
} from '../../src/features/channels/shelf-scroll-actions.js'

const appSource = await readFile(
  new URL('../../src/app.js', import.meta.url),
  'utf8'
)
const analyticsSource = await readFile(
  new URL('../../analytics.js', import.meta.url),
  'utf8'
)

const controlSelector = '[data-channel-shelf-scroll-action]'

function createControl(actionName, dataset = {}) {
  const control = new EventTarget()
  control.dataset = {
    channelShelfScrollAction: actionName,
    ...dataset
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

function createActions(calls) {
  return {
    scroll(...args) {
      calls.push(['scroll', args])
    },
    sync(...args) {
      calls.push(['sync', args])
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

test('shelf-scroll ownership forwards live controls and numeric directions', () => {
  const previous = createControl('scroll', {
    shelfDirection: '1'
  })
  const next = createControl('scroll', {
    shelfDirection: '-1'
  })
  const track = createControl('sync')
  const { root } = createHarness([previous, next, track])
  const calls = []

  assert.equal(
    bindChannelShelfScrollActions(root, createActions(calls)),
    3
  )

  previous.dataset.shelfDirection = '-1'
  next.dataset.shelfDirection = '1'
  const previousEvent = new Event('click', {
    bubbles: true,
    cancelable: true
  })
  const nextEvent = new Event('click', {
    bubbles: true,
    cancelable: true
  })
  const trackEvent = new Event('scroll', {
    bubbles: false,
    cancelable: false
  })

  assert.equal(previous.dispatchEvent(previousEvent), true)
  assert.equal(next.dispatchEvent(nextEvent), true)
  assert.equal(track.dispatchEvent(trackEvent), true)
  assert.deepEqual(calls, [
    ['scroll', [previous, -1]],
    ['scroll', [next, 1]],
    ['sync', [track]]
  ])
  for (const event of [previousEvent, nextEvent, trackEvent]) {
    assert.equal(event.defaultPrevented, false)
    assert.equal(event.cancelBubble, false)
  }
})

test('shelf-scroll ownership is idempotent and binds replacements', () => {
  const originalScroll = createControl('scroll', {
    shelfDirection: '-1'
  })
  const originalTrack = createControl('sync')
  const replacementScroll = createControl('scroll', {
    shelfDirection: '1'
  })
  const replacementTrack = createControl('sync')
  const harness = createHarness([originalScroll, originalTrack])
  const calls = []
  const actions = createActions(calls)

  assert.equal(
    bindChannelShelfScrollActions(harness.root, actions),
    2
  )
  assert.equal(
    bindChannelShelfScrollActions(harness.root, actions),
    0
  )
  originalScroll.dispatchEvent(new Event('click'))
  originalTrack.dispatchEvent(new Event('scroll'))

  harness.replaceControls([replacementScroll, replacementTrack])
  assert.equal(
    bindChannelShelfScrollActions(harness.root, actions),
    2
  )
  replacementScroll.dispatchEvent(new Event('click'))
  replacementTrack.dispatchEvent(new Event('scroll'))
  assert.deepEqual(calls, [
    ['scroll', [originalScroll, -1]],
    ['sync', [originalTrack]],
    ['scroll', [replacementScroll, 1]],
    ['sync', [replacementTrack]]
  ])

  harness.replaceControls([])
  assert.equal(
    bindChannelShelfScrollActions(harness.root, actions),
    0
  )
})

test('shelf-scroll ownership ignores unknown hooks and validates boundaries', () => {
  const foreign = createControl(undefined)
  delete foreign.dataset.channelShelfScrollAction
  const unknown = createControl('unknown', {
    shelfDirection: '-1'
  })
  const harness = createHarness([foreign, unknown])
  const calls = []
  const actions = createActions(calls)

  assert.equal(
    bindChannelShelfScrollActions(harness.root, actions),
    0
  )
  foreign.dispatchEvent(new Event('click'))
  unknown.dispatchEvent(new Event('click'))
  unknown.dispatchEvent(new Event('scroll'))
  assert.deepEqual(calls, [])

  assert.throws(
    () => bindChannelShelfScrollActions(null, actions),
    /queryable root/
  )
  assert.throws(
    () => bindChannelShelfScrollActions({}, actions),
    /queryable root/
  )
  for (const callbackName of ['scroll', 'sync']) {
    assert.throws(
      () => bindChannelShelfScrollActions(harness.root, {
        ...actions,
        [callbackName]: null
      }),
      /scroll and sync callbacks/
    )
  }
})

test('generated buttons and tracks transfer exactly to shelf-scroll ownership', () => {
  const renderSource = getFunctionSource(
    'renderChannelVideoGroups',
    'renderChannelShelfAvatar'
  )
  const buttons = getElements(renderSource, 'button').filter(
    element => hasClass(element.tag, 'channel-shelf-scroll')
  )
  const expectedButtons = [
    {
      className:
        'channel-shelf-scroll channel-shelf-scroll-prev',
      content: '<span aria-hidden="true">‹</span>',
      direction: '-1'
    },
    {
      className:
        'channel-shelf-scroll channel-shelf-scroll-next',
      content: '<span aria-hidden="true">›</span>',
      direction: '1'
    }
  ]
  assert.equal(buttons.length, expectedButtons.length)

  expectedButtons.forEach((expected, index) => {
    const control = buttons[index]
    assert.equal(getAttribute(control.tag, 'type'), 'button')
    assert.equal(getAttribute(control.tag, 'class'), expected.className)
    assert.equal(
      getAttribute(control.tag, 'data-shelf-direction'),
      expected.direction
    )
    assert.equal(
      getAttribute(control.tag, 'data-channel-shelf-scroll-action'),
      'scroll'
    )
    assert.equal(
      getAttribute(control.tag, 'data-analytics-action'),
      'scrollVideoChannelShelf'
    )
    assert.equal(getAttribute(control.tag, 'onclick'), null)
    assert.equal(getAttribute(control.tag, 'aria-controls'), '${trackId}')
    assert.equal(control.content.trim(), expected.content)
  })

  const track = findSingle(
    getOpeningTags(renderSource, 'div'),
    tag => hasClass(tag, 'channel-shelf-track'),
    'channel shelf track'
  )
  assert.equal(
    getAttribute(track, 'data-channel-shelf-scroll-action'),
    'sync'
  )
  assert.equal(
    getAttribute(track, 'data-analytics-action'),
    'syncVideoChannelShelfControls'
  )
  assert.equal(getAttribute(track, 'id'), '${trackId}')
  assert.equal(getAttribute(track, 'tabindex'), '0')
  assert.equal(getAttribute(track, 'onscroll'), null)
})

test('active-grid replacement binds shelf scrolling before later features', () => {
  assert.match(
    appSource,
    /import\s*\{\s*bindChannelShelfScrollActions\s*\}\s*from '\.\/features\/channels\/shelf-scroll-actions\.js'/
  )
  const feedSource = getFunctionSource('renderFeed', 'toggleWatchedSection')
  const groupReplacementIndex = feedSource.indexOf(
    'grid.innerHTML = renderChannelVideoGroups('
  )
  const scrollBindingIndex = feedSource.indexOf(
    'bindChannelShelfScrollActions(grid, {'
  )
  const removeBindingIndex = feedSource.indexOf(
    'bindChannelRemoveActions(grid, {'
  )
  const setAsideBindingIndex = feedSource.indexOf(
    'bindVideoSetAsideActions(grid, {'
  )
  assert.notEqual(groupReplacementIndex, -1)
  assert.ok(scrollBindingIndex > groupReplacementIndex)
  assert.ok(removeBindingIndex > scrollBindingIndex)
  assert.ok(setAsideBindingIndex > removeBindingIndex)
  assert.match(
    feedSource.slice(groupReplacementIndex, scrollBindingIndex),
    /grid\.innerHTML = renderChannelVideoGroups\([\s\S]*?\)\s*\}\s*$/
  )
  assert.match(
    feedSource.slice(scrollBindingIndex, removeBindingIndex),
    /bindChannelShelfScrollActions\(grid,\s*\{\s*scroll:\s*scrollVideoChannelShelf,\s*sync:\s*syncVideoChannelShelfControls\s*\}\)\s*$/
  )
})

test('local scroll functions and deferred lexical sync remain unchanged', () => {
  const syncSource = getFunctionSource(
    'syncVideoChannelShelfControls',
    'scrollVideoChannelShelf'
  )
  const scrollSource = getFunctionSource(
    'scrollVideoChannelShelf',
    'canReorderChannelShelves'
  )
  assertSourceOrder(
    syncSource,
    [
      'if (activeVideoShelfPreview && track.contains(activeVideoShelfPreview))',
      'positionVideoShelfPreview(activeVideoShelfPreview)',
      'closeVideoShelfPreview(activeVideoShelfPreview, true)',
      'const atStart = track.scrollLeft <= 2',
      'const atEnd = track.scrollLeft + track.clientWidth >= track.scrollWidth - 2',
      'if (previousButton) previousButton.disabled = atStart',
      'if (nextButton) nextButton.disabled = atEnd'
    ],
    'shelf sync behavior'
  )
  assertSourceOrder(
    scrollSource,
    [
      "const shelf = button?.closest?.('.channel-shelf')",
      "const track = shelf?.querySelector('.channel-shelf-track')",
      'const targetCardIndex = Math.max(0, currentCardIndex + (direction < 0 ? -4 : 4))',
      "const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches",
      'track.scrollTo({',
      "behavior: reduceMotion ? 'auto' : 'smooth'"
    ],
    'shelf scroll behavior'
  )
  assert.doesNotMatch(
    `${syncSource}\n${scrollSource}`,
    /\.preventDefault\(|\.stopPropagation\(/
  )

  const feedSource = getFunctionSource('renderFeed', 'toggleWatchedSection')
  assert.match(
    feedSource,
    /requestAnimationFrame\(\(\) => \{\s*document\.querySelectorAll\('\.channel-shelf-track'\)\.forEach\(syncVideoChannelShelfControls\)\s*\}\)/
  )
})

test('explicit metadata preserves generic click identity without cancellation', () => {
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
    /document\.addEventListener\(['"]scroll['"]/
  )
})

test('scroll and sync retain local ownership without global aliases', () => {
  for (const actionName of [
    'scrollVideoChannelShelf',
    'syncVideoChannelShelfControls'
  ]) {
    assert.match(
      appSource,
      new RegExp(`function ${actionName}\\(`)
    )
    assert.equal(LEGACY_ACTION_NAMES.includes(actionName), false)
  }

  const installMap = appSource.match(
    /installLegacyActions\(window,\s*\{([\s\S]*?)\}\)/
  )?.[1]
  assert.ok(installMap)
  assert.doesNotMatch(
    installMap,
    /(?:^|[\s,])scrollVideoChannelShelf(?:[\s,]|$)/
  )
  assert.doesNotMatch(
    installMap,
    /(?:^|[\s,])syncVideoChannelShelfControls(?:[\s,]|$)/
  )
  assert.doesNotMatch(
    appSource,
    /\bonclick=(["'])[^"']*\bscrollVideoChannelShelf\s*\([\s\S]*?\1/
  )
  assert.doesNotMatch(
    appSource,
    /\bonscroll=(["'])[^"']*\bsyncVideoChannelShelfControls\s*\([\s\S]*?\1/
  )
})
