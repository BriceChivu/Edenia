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
