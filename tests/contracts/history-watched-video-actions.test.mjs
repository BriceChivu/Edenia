import assert from 'node:assert/strict'
import test from 'node:test'
import {
  bindStudyHistoryWatchedVideoActions
} from '../../src/features/study-history/watched-video-actions.js'

const controlSelector = '[data-history-watched-video-action="jump"]'

function createControl(videoId) {
  return {
    dataset: { videoId },
    listener: null,
    addEventListener(type, listener) {
      assert.equal(type, 'click')
      this.listener = listener
    },
    click() {
      let defaultPrevented = false
      let propagationStopped = false
      const event = {
        currentTarget: this,
        preventDefault() {
          defaultPrevented = true
        },
        stopPropagation() {
          propagationStopped = true
        }
      }
      this.listener?.(event)
      return { defaultPrevented, event, propagationStopped }
    }
  }
}

function createHarness(controls = [
  createControl('history-video-a'),
  createControl('history-video-b')
]) {
  return {
    controls,
    root: {
      querySelectorAll(selector) {
        assert.equal(selector, controlSelector)
        return controls
      }
    }
  }
}

test('watched video binding forwards the exact event and each live video ID', () => {
  const { controls, root } = createHarness()
  const calls = []
  assert.equal(bindStudyHistoryWatchedVideoActions(root, {
    jump(event, videoId) {
      calls.push({ event, videoId })
    }
  }), 2)

  const firstResult = controls[0].click()
  controls[1].dataset.videoId = 'history-video-live'
  const secondResult = controls[1].click()
  assert.deepEqual(calls, [
    {
      event: firstResult.event,
      videoId: 'history-video-a'
    },
    {
      event: secondResult.event,
      videoId: 'history-video-live'
    }
  ])
  assert.equal(firstResult.event.currentTarget, controls[0])
  assert.equal(secondResult.event.currentTarget, controls[1])
  assert.deepEqual(
    [firstResult, secondResult].map(result => ({
      defaultPrevented: result.defaultPrevented,
      propagationStopped: result.propagationStopped
    })),
    [
      { defaultPrevented: false, propagationStopped: false },
      { defaultPrevented: false, propagationStopped: false }
    ]
  )
})

test('watched video binding is idempotent and binds replacement controls', () => {
  const firstControl = createControl('history-video-a')
  const { root } = createHarness([firstControl])
  const calls = []
  const actions = {
    jump(event, videoId) {
      calls.push([event.currentTarget, videoId])
    }
  }
  assert.equal(bindStudyHistoryWatchedVideoActions(root, actions), 1)
  assert.equal(bindStudyHistoryWatchedVideoActions(root, actions), 0)
  firstControl.click()

  const replacementControl = createControl('history-video-b')
  const replacement = createHarness([replacementControl])
  assert.equal(
    bindStudyHistoryWatchedVideoActions(replacement.root, actions),
    1
  )
  replacementControl.click()
  assert.deepEqual(calls, [
    [firstControl, 'history-video-a'],
    [replacementControl, 'history-video-b']
  ])
  assert.equal(
    bindStudyHistoryWatchedVideoActions(createHarness([]).root, actions),
    0
  )
})

test('watched video binding fails closed on invalid boundaries', () => {
  const { root } = createHarness()
  assert.throws(
    () => bindStudyHistoryWatchedVideoActions(null, { jump() {} }),
    /queryable root/
  )
  assert.throws(
    () => bindStudyHistoryWatchedVideoActions(root, {}),
    /jump callback/
  )
})
