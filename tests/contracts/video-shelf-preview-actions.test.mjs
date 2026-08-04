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
  const removedThumbnail = createControl('removed-thumbnail')
  const card = createControl('card')
  const calls = []
  assert.equal(
    bindVideoShelfPreviewActions(
      createRoot([thumbnail, removedThumbnail, card]),
      createActions(calls)
    ),
    3
  )

  const click = thumbnail.dispatch('click')
  const removedClick = removedThumbnail.dispatch('click')
  const touchClick = card.dispatch('click')
  const mouseEnter = card.dispatch('mouseenter')
  card.dispatch('mouseleave')
  card.dispatch('focusin')
  card.dispatch('focusout')
  assert.deepEqual(calls, [
    ['thumbnail', [click, thumbnail]],
    ['thumbnail', [removedClick, removedThumbnail]],
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
  assert.match(
    appSource,
    /removedGrid\.innerHTML =[\s\S]*?bindRenderedVideoShelfPreviewActions\(removedGrid\)/
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

test('expanded preview action buttons do not animate a square background', () => {
  const previewActionRule = sourceBetween(
    responsiveWideStyle,
    '.channel-shelf-card:is(.is-previewing, .is-preview-closing) .watch-later-btn,',
    '.channel-shelf-card:is(.is-previewing, .is-preview-closing) .watch-later-btn .action-icon,'
  )

  assert.match(previewActionRule, /background:\s*transparent;/)
  assert.match(previewActionRule, /border:\s*0;/)
  assert.match(previewActionRule, /border-radius:\s*0;/)
  assert.match(previewActionRule, /box-shadow:\s*none;/)
  assert.match(
    previewActionRule,
    /transition:\s*color var\(--motion-base\) var\(--ease-standard\);/
  )
  assert.doesNotMatch(previewActionRule, /transition:[^;]*(?:background|border)/)
})
