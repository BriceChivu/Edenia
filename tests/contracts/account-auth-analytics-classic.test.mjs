import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import vm from 'node:vm'

const source = await readFile(new URL('../../analytics.js', import.meta.url), 'utf8')
const USER_ID = '3940E250-7B9D-4D2A-8F5C-4C111C812345'

function createHarness({ enabled = true } = {}) {
  const calls = []
  const window = {
    EDENIA_ANALYTICS_ENABLED: enabled,
    EDENIA_INTERNAL_TEST: true,
    posthog: {
      capture() {},
      identify(userId) { calls.push(['identify', userId]) },
      reset() { calls.push(['reset']) }
    }
  }
  vm.runInNewContext(source, {
    document: { addEventListener() {} },
    localStorage: {
      getItem() { return null },
      setItem() {}
    },
    window
  })
  return { calls, window }
}

test('classic analytics identifies a stable UUID without accepting email', () => {
  const { calls, window } = createHarness()

  assert.equal(window.identifyEdeniaAuthenticatedUser(USER_ID), true)
  assert.equal(
    window.identifyEdeniaAuthenticatedUser('learner@example.com'),
    false
  )
  assert.equal(window.identifyEdeniaAuthenticatedUser('not-a-uuid'), false)
  assert.deepEqual(calls, [[
    'identify',
    USER_ID.toLowerCase()
  ]])
})

test('classic analytics resets PostHog only in the enabled environment', () => {
  const enabled = createHarness()
  assert.equal(enabled.window.resetEdeniaAuthenticatedUser(), true)
  assert.deepEqual(enabled.calls, [['reset']])

  const disabled = createHarness({ enabled: false })
  assert.equal(disabled.window.identifyEdeniaAuthenticatedUser(USER_ID), false)
  assert.equal(disabled.window.resetEdeniaAuthenticatedUser(), false)
  assert.deepEqual(disabled.calls, [])
})
