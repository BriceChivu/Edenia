import assert from 'node:assert/strict'
import test from 'node:test'
import {
  createLearnerProfileReverificationController
} from '../../src/integrations/learner-profile-reverification.js'

function deferred() {
  let resolve
  const promise = new Promise(next => { resolve = next })
  return { promise, resolve }
}

function createEventTarget() {
  const listeners = new Map()
  return {
    addEventListener(type, listener) {
      listeners.set(type, listener)
    },
    dispatch(type) {
      listeners.get(type)?.()
    },
    removeEventListener(type, listener) {
      if (listeners.get(type) === listener) listeners.delete(type)
    }
  }
}

test('focus and reconnect trigger bounded owner reverification', async () => {
  const eventTarget = createEventTarget()
  const attempts = []
  let now = 1_786_982_400_000
  let currentAttempt = deferred()
  const controller = createLearnerProfileReverificationController({
    eventTarget,
    isEligible: () => true,
    now: () => now,
    reverify() {
      attempts.push(now)
      return currentAttempt.promise
    }
  })
  controller.start()

  eventTarget.dispatch('focus')
  eventTarget.dispatch('focus')
  eventTarget.dispatch('online')
  assert.deepEqual(attempts, [1_786_982_400_000])

  currentAttempt.resolve()
  await Promise.resolve()
  await Promise.resolve()
  eventTarget.dispatch('focus')
  assert.equal(attempts.length, 1)

  now += 60_000
  currentAttempt = deferred()
  eventTarget.dispatch('focus')
  assert.equal(attempts.length, 2)
  currentAttempt.resolve()
  await Promise.resolve()
  await Promise.resolve()

  now += 1_000
  currentAttempt = deferred()
  eventTarget.dispatch('offline')
  eventTarget.dispatch('online')
  assert.equal(attempts.length, 3)

  controller.destroy()
  currentAttempt.resolve()
  await Promise.resolve()
  now += 60_000
  eventTarget.dispatch('focus')
  assert.equal(attempts.length, 3)
})
