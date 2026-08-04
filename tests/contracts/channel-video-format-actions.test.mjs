import assert from 'node:assert/strict'
import test from 'node:test'
import {
  bindChannelVideoFormatActions,
  CHANNEL_VIDEO_FORMATS,
  getAvailableChannelVideoFormat,
  getChannelVideoFormat,
  normalizeChannelVideoFormat
} from '../../src/features/channels/video-format-actions.js'

const controlSelector = '[data-channel-video-format-action="select"]'

function createControl(channelKey, format) {
  const control = new EventTarget()
  control.dataset = {
    channelVideoFormatAction: 'select',
    channelKey,
    channelVideoFormat: format
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

test('video format derives vertical layout without changing duration semantics', () => {
  assert.deepEqual(CHANNEL_VIDEO_FORMATS, {
    VIDEOS: 'videos',
    SHORTS: 'shorts'
  })
  assert.equal(getChannelVideoFormat({ aspectRatio: 9 / 16, duration: 600 }), 'shorts')
  assert.equal(getChannelVideoFormat({ aspectRatio: 16 / 9, duration: 30 }), 'videos')
  assert.equal(getChannelVideoFormat({ aspectRatio: 1 }), 'videos')
  assert.equal(getChannelVideoFormat({ aspectRatio: null }), 'videos')
  assert.equal(getChannelVideoFormat({ aspectRatio: 0.2 }), 'videos')
  assert.equal(normalizeChannelVideoFormat('shorts'), 'shorts')
  assert.equal(normalizeChannelVideoFormat('videos'), 'videos')
  assert.equal(normalizeChannelVideoFormat('unexpected'), 'videos')
})

test('format selection falls back only when the other format has videos', () => {
  assert.equal(getAvailableChannelVideoFormat('videos', {
    videos: 0,
    shorts: 2
  }), 'shorts')
  assert.equal(getAvailableChannelVideoFormat('shorts', {
    videos: 3,
    shorts: 0
  }), 'videos')
  assert.equal(getAvailableChannelVideoFormat('videos', {
    videos: 1,
    shorts: 4
  }), 'videos')
  assert.equal(getAvailableChannelVideoFormat('shorts', {
    videos: 4,
    shorts: 1
  }), 'shorts')
  assert.equal(getAvailableChannelVideoFormat('shorts', {
    videos: 0,
    shorts: 0
  }), 'shorts')
  assert.equal(getAvailableChannelVideoFormat('shorts'), 'shorts')
  assert.equal(getAvailableChannelVideoFormat('videos', null), 'videos')
  assert.equal(getAvailableChannelVideoFormat('unexpected', {
    videos: 0,
    shorts: 1
  }), 'shorts')
})

test('format action binding forwards channel and format without consuming clicks', () => {
  const videos = createControl('channel-a', 'videos')
  const shorts = createControl('channel-a', 'shorts')
  const harness = createHarness([videos, shorts])
  const calls = []
  const actions = {
    select(...args) {
      calls.push(args)
    }
  }

  assert.equal(bindChannelVideoFormatActions(harness.root, actions), 2)
  const event = new Event('click', { bubbles: true, cancelable: true })
  assert.equal(shorts.dispatchEvent(event), true)
  assert.deepEqual(calls, [[shorts, 'channel-a', 'shorts']])
  assert.equal(event.defaultPrevented, false)
  assert.equal(event.cancelBubble, false)

  assert.equal(bindChannelVideoFormatActions(harness.root, actions), 0)
  const replacement = createControl('channel-b', 'videos')
  harness.replaceControls([shorts, replacement])
  assert.equal(bindChannelVideoFormatActions(harness.root, actions), 1)
  replacement.dispatchEvent(new Event('click'))
  assert.deepEqual(calls.at(-1), [replacement, 'channel-b', 'videos'])
})

test('format action binding fails closed for invalid controls and boundaries', () => {
  const invalidControls = [
    createControl('', 'videos'),
    createControl('channel-a', 'all'),
    { dataset: null }
  ]
  const harness = createHarness(invalidControls)
  const actions = { select() {} }

  assert.equal(bindChannelVideoFormatActions(harness.root, actions), 0)
  assert.throws(
    () => bindChannelVideoFormatActions(null, actions),
    /queryable root/
  )
  assert.throws(
    () => bindChannelVideoFormatActions({}, actions),
    /queryable root/
  )
  assert.throws(
    () => bindChannelVideoFormatActions(harness.root, null),
    /select callback/
  )
  assert.throws(
    () => bindChannelVideoFormatActions(harness.root, {}),
    /select callback/
  )
})
