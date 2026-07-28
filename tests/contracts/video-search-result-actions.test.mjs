import assert from 'node:assert/strict'
import test from 'node:test'
import {
  bindVideoSearchResultActions
} from '../../src/features/videos/search-result-actions.js'

const resultSelector = '[data-video-search-action="select-result"]'

function createHarness(includeList = true) {
  const list = includeList ? {
    listener: null,
    addEventListener(type, listener) {
      assert.equal(type, 'click')
      this.listener = listener
    },
    contains(control) {
      return control?.owner === this
    },
    click(target) {
      let defaultPrevented = false
      let propagationStopped = false
      this.listener?.({
        target,
        preventDefault() {
          defaultPrevented = true
        },
        stopPropagation() {
          propagationStopped = true
        }
      })
      return { defaultPrevented, propagationStopped }
    }
  } : null
  const root = {
    querySelector(selector) {
      assert.equal(selector, '#videoSearchResults')
      return list
    }
  }
  return { list, root }
}

function createTarget(control) {
  return {
    closest(selector) {
      assert.equal(selector, resultSelector)
      return control
    }
  }
}

test('video search result binding delegates nested live video identifiers', () => {
  const { list, root } = createHarness()
  const calls = []
  assert.equal(bindVideoSearchResultActions(root, {
    selectResult(...args) {
      calls.push(args)
    }
  }), 1)

  const control = {
    owner: list,
    dataset: { videoId: 'protected-result' }
  }
  assert.deepEqual(list.click(createTarget(control)), {
    defaultPrevented: false,
    propagationStopped: false
  })
  control.dataset.videoId = ''
  list.click(createTarget(control))
  assert.deepEqual(calls, [
    ['protected-result'],
    ['']
  ])
})

test('video search result binding ignores foreign and unmatched controls', () => {
  const { list, root } = createHarness()
  const calls = []
  bindVideoSearchResultActions(root, {
    selectResult(...args) {
      calls.push(args)
    }
  })
  list.click(createTarget(null))
  list.click(createTarget({
    owner: {},
    dataset: { videoId: 'foreign-result' }
  }))
  assert.deepEqual(calls, [])
})

test('video search result binding is idempotent and tolerates no list', () => {
  const { list, root } = createHarness()
  const calls = []
  const actions = {
    selectResult(videoId) {
      calls.push(videoId)
    }
  }
  assert.equal(bindVideoSearchResultActions(root, actions), 1)
  assert.equal(bindVideoSearchResultActions(root, actions), 0)
  list.click(createTarget({
    owner: list,
    dataset: { videoId: 'one-result' }
  }))
  assert.deepEqual(calls, ['one-result'])
  assert.equal(
    bindVideoSearchResultActions(createHarness(false).root, actions),
    0
  )
})

test('video search result binding fails closed on invalid boundaries', () => {
  const { root } = createHarness()
  assert.throws(
    () => bindVideoSearchResultActions(null, {
      selectResult() {}
    }),
    /queryable root/
  )
  assert.throws(
    () => bindVideoSearchResultActions(root, {}),
    /selectResult callback/
  )
})
