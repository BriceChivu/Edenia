import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import {
  GLOBAL_ACTION_NAMES
} from '../../src/core/global-action-contract.js'
import {
  bindVideoShelfPreviewActions
} from '../../src/features/videos/shelf-preview-actions.js'

const appSource = await readFile(
  new URL('../../src/app.js', import.meta.url),
  'utf8'
)

function createControl(action) {
  const listeners = new Map()
  return {
    dataset: { videoPreviewAction: action },
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
      assert.equal(selector, '[data-video-preview-action]')
      return controls
    }
  }
}

function createActions(calls) {
  return Object.fromEntries(
    [
      'thumbnail',
      'toggleTouch',
      'open',
      'queueClose',
      'openFromFocus',
      'closeAfterFocus'
    ].map(name => [name, (...args) => calls.push([name, args])])
  )
}

test('shelf-preview adapter preserves exact native events and controls', () => {
  const thumbnail = createControl('thumbnail')
  const card = createControl('card')
  const calls = []
  assert.equal(
    bindVideoShelfPreviewActions(
      createRoot([thumbnail, card]),
      createActions(calls)
    ),
    2
  )

  const click = thumbnail.dispatch('click')
  const touchClick = card.dispatch('click')
  const mouseEnter = card.dispatch('mouseenter')
  card.dispatch('mouseleave')
  card.dispatch('focusin')
  card.dispatch('focusout')
  assert.deepEqual(calls, [
    ['thumbnail', [click, thumbnail]],
    ['toggleTouch', [touchClick, card]],
    ['open', [card, false, mouseEnter]],
    ['queueClose', [card]],
    ['openFromFocus', [card]],
    ['closeAfterFocus', [card]]
  ])
})

test('shelf-preview binding is idempotent, replaceable, and fail-closed', () => {
  const card = createControl('card')
  const actions = createActions([])
  const root = createRoot([card])
  assert.equal(bindVideoShelfPreviewActions(root, actions), 1)
  assert.equal(bindVideoShelfPreviewActions(root, actions), 0)
  assert.deepEqual(card.listenerTypes(), [
    'click',
    'mouseenter',
    'mouseleave',
    'focusin',
    'focusout'
  ])

  const unknown = createControl('unknown')
  assert.equal(
    bindVideoShelfPreviewActions(createRoot([unknown]), actions),
    0
  )
  assert.deepEqual(unknown.listenerTypes(), [])
  assert.throws(
    () => bindVideoShelfPreviewActions(null, actions),
    /queryable root/
  )
  for (const name of Object.keys(actions)) {
    assert.throws(
      () => bindVideoShelfPreviewActions(createRoot([]), {
        ...actions,
        [name]: null
      }),
      /thumbnail, toggleTouch, open, queueClose, openFromFocus, and closeAfterFocus callbacks/
    )
  }
})

test('rendered shelf and Watched cards bind without preview globals', () => {
  assert.match(
    appSource,
    /class="thumb-link"[\s\S]*?data-video-preview-action="thumbnail"[\s\S]*?data-analytics-action="handleVideoThumbnailClick"/
  )
  assert.match(
    appSource,
    /const shelfPreviewAction = options\.shelf[\s\S]*?data-video-preview-action="card"/
  )
  assert.doesNotMatch(
    appSource,
    /\bon(?:click|mouseenter|mouseleave|focusin|focusout)="[^"]*\b(?:handleVideoThumbnailClick|toggleVideoShelfPreviewOnTouch|openVideoShelfPreview|queueVideoShelfPreviewClose|openVideoShelfPreviewFromFocus|closeVideoShelfPreviewAfterFocus)\b/
  )
  assert.match(
    appSource,
    /bindChannelOrderActions\(grid,[\s\S]*?\}\)\s*bindRenderedVideoShelfPreviewActions\(grid\)/
  )
  assert.match(
    appSource,
    /bindRenderedVideoStateActions\(watchedGrid\)\s*bindRenderedVideoShelfPreviewActions\(watchedGrid\)/
  )
  for (const name of [
    'handleVideoThumbnailClick',
    'toggleVideoShelfPreviewOnTouch',
    'openVideoShelfPreview',
    'queueVideoShelfPreviewClose',
    'openVideoShelfPreviewFromFocus',
    'closeVideoShelfPreviewAfterFocus'
  ]) {
    assert.equal(GLOBAL_ACTION_NAMES.includes(name), false)
  }
})
