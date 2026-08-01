import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import {
  GLOBAL_ACTION_NAMES
} from '../../src/core/global-action-contract.js'
import {
  bindChannelOrderActions
} from '../../src/features/channels/order-actions.js'

const appSource = await readFile(
  new URL('../../src/app.js', import.meta.url),
  'utf8'
)
const videoFeedStyle = await readFile(
  new URL('../../src/styles/70-video-feed.css', import.meta.url),
  'utf8'
)
const responsivePhoneStyle = await readFile(
  new URL('../../src/styles/98-responsive-phone.css', import.meta.url),
  'utf8'
)
const responsiveWideStyle = await readFile(
  new URL('../../src/styles/99-responsive-wide.css', import.meta.url),
  'utf8'
)

function sourceBetween(source, startMarker, endMarker) {
  const start = source.indexOf(startMarker)
  const end = source.indexOf(endMarker, start)
  assert.notEqual(start, -1, `Missing source marker: ${startMarker}`)
  assert.notEqual(end, -1, `Missing source marker: ${endMarker}`)
  return source.slice(start, end)
}

function cssRule(source, selector) {
  const startMarker = `${selector} {`
  const start = source.indexOf(startMarker)
  assert.notEqual(start, -1, `Missing CSS selector: ${selector}`)
  const bodyStart = source.indexOf('{', start)
  const end = source.indexOf('}', bodyStart)
  assert.notEqual(bodyStart, -1, `Missing CSS body: ${selector}`)
  assert.notEqual(end, -1, `Unclosed CSS selector: ${selector}`)
  return source.slice(start, end + 1)
}

function createControl(action) {
  const listeners = new Map()
  return {
    dataset: { channelOrderAction: action },
    addEventListener(type, listener) {
      listeners.set(type, listener)
    },
    dispatch(type) {
      const event = { type }
      listeners.get(type)?.(event)
      return event
    },
    listenerTypes() {
      return [...listeners.keys()]
    }
  }
}

function createRoot(controls) {
  return {
    querySelectorAll(selector) {
      assert.equal(selector, '[data-channel-order-action]')
      return controls
    }
  }
}

function createActions(calls) {
  return Object.fromEntries(
    ['start', 'finish', 'move', 'leave', 'drop', 'startTouch']
      .map(name => [name, (...args) => calls.push([name, args])])
  )
}

test('channel-order adapter preserves every native event and live control', () => {
  const shelf = createControl('shelf')
  const touchHandle = createControl('touch-handle')
  const calls = []
  assert.equal(
    bindChannelOrderActions(
      createRoot([shelf, touchHandle]),
      createActions(calls)
    ),
    2
  )

  const dragStart = shelf.dispatch('dragstart')
  shelf.dispatch('dragend')
  const dragOver = shelf.dispatch('dragover')
  const dragLeave = shelf.dispatch('dragleave')
  const drop = shelf.dispatch('drop')
  const pointerDown = touchHandle.dispatch('pointerdown')
  assert.deepEqual(calls, [
    ['start', [dragStart, shelf]],
    ['finish', []],
    ['move', [dragOver, shelf]],
    ['leave', [dragLeave, shelf]],
    ['drop', [drop, shelf]],
    ['startTouch', [pointerDown, touchHandle]]
  ])
})

test('channel-order binding is idempotent, replaceable, and fail-closed', () => {
  const shelf = createControl('shelf')
  const calls = []
  const actions = createActions(calls)
  const root = createRoot([shelf])
  assert.equal(bindChannelOrderActions(root, actions), 1)
  assert.equal(bindChannelOrderActions(root, actions), 0)
  assert.deepEqual(shelf.listenerTypes(), [
    'dragstart',
    'dragend',
    'dragover',
    'dragleave',
    'drop'
  ])

  const unknown = createControl('unknown')
  assert.equal(bindChannelOrderActions(createRoot([unknown]), actions), 0)
  assert.deepEqual(unknown.listenerTypes(), [])
  assert.throws(
    () => bindChannelOrderActions(null, actions),
    /queryable root/
  )
  for (const name of Object.keys(actions)) {
    assert.throws(
      () => bindChannelOrderActions(createRoot([]), {
        ...actions,
        [name]: null
      }),
      /start, finish, move, leave, drop, and startTouch callbacks/
    )
  }
})

test('generated shelves and both avatar branches bind without legacy globals', () => {
  assert.match(
    appSource,
    /<section class="channel-video-group channel-shelf[\s\S]*?data-channel-order-action="shelf"[\s\S]*?draggable="true"/
  )
  assert.doesNotMatch(
    appSource,
    /\bon(?:dragstart|dragend|dragover|dragleave|drop)="[^"]*"/
  )
  assert.equal(
    [...appSource.matchAll(/data-channel-order-action="touch-handle"/g)].length,
    2
  )
  assert.doesNotMatch(
    appSource,
    /onpointerdown="startTouchChannelShelfDrag/
  )
  assert.match(
    appSource,
    /bindRenderedVideoStateActions\(grid\)\s*bindChannelOrderActions\(grid,\s*\{[\s\S]*?startTouch: startTouchChannelShelfDrag\s*\}\)/
  )
  for (const name of [
    'startChannelShelfDrag',
    'finishChannelShelfDrag',
    'moveChannelShelfDrag',
    'leaveChannelShelfDrag',
    'dropChannelShelf',
    'startTouchChannelShelfDrag'
  ]) {
    assert.equal(GLOBAL_ACTION_NAMES.includes(name), false)
  }
})

test('channel drag feedback never moves a fixed-preview containing block', () => {
  const touchDropSource = sourceBetween(
    appSource,
    'function finishTouchChannelShelfDrag',
    'function cancelTouchChannelShelfDrag'
  )
  const desktopDropSource = sourceBetween(
    appSource,
    'function dropChannelShelf',
    'function finishChannelShelfDrag'
  )

  for (const dropSource of [touchDropSource, desktopDropSource]) {
    const settleIndex = dropSource.indexOf("classList.add('just-dropped')")
    const cleanupIndex = dropSource.indexOf('finishChannelShelfDrag()')
    assert.notEqual(settleIndex, -1)
    assert.notEqual(cleanupIndex, -1)
    assert.ok(settleIndex < cleanupIndex)
  }

  for (const [name, source] of [
    ['phone', responsivePhoneStyle],
    ['wide', responsiveWideStyle]
  ]) {
    const shelfRule = cssRule(source, '.channel-shelf')
    const draggingRule = cssRule(source, '.channel-shelf.is-dragging')
    const settleRule = cssRule(source, '.channel-shelf.just-dropped')

    assert.match(shelfRule, /transition:\s*opacity\b/, name)
    assert.doesNotMatch(shelfRule, /\b(?:filter|transform)\b/, name)
    assert.match(draggingRule, /opacity:\s*0\.3;/, name)
    assert.doesNotMatch(draggingRule, /\b(?:filter|transform)\b/, name)
    assert.match(settleRule, /transition:\s*none;/, name)
    assert.doesNotMatch(
      source,
      /\.channel-shelf\.drag-over-(?:before|after)(?!::)[^{}]*\{[^{}]*\b(?:filter|transform)\b/,
      name
    )
  }

  for (const settleAnimation of [
    sourceBetween(
      videoFeedStyle,
      '@keyframes channelShelfDropSettle',
      '.channel-shelf-controls'
    ),
    sourceBetween(
      responsiveWideStyle,
      '@keyframes channelShelfDropSettle',
      '.channel-shelf:has(.channel-shelf-card.is-previewing)'
    )
  ]) {
    assert.match(settleAnimation, /box-shadow:/)
    assert.doesNotMatch(settleAnimation, /\b(?:filter|transform)\s*:/)
  }
})
