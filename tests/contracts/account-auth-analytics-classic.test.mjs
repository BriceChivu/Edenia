import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import vm from 'node:vm'

const source = await readFile(new URL('../../analytics.js', import.meta.url), 'utf8')
const USER_ID = '3940E250-7B9D-4D2A-8F5C-4C111C812345'

function createHarness({
  enabled = true,
  internalTest = true,
  posthogUserId = null,
  removeFails = false,
  sdkLoaded = true,
  storage = new Map()
} = {}) {
  const calls = []
  const window = {
    EDENIA_ANALYTICS_ENABLED: enabled,
    EDENIA_INTERNAL_TEST: internalTest,
    posthog: {
      __loaded: sdkLoaded,
      capture() {},
      get_property(key) {
        return key === '$user_id' ? posthogUserId : undefined
      },
      identify(userId, properties) {
        calls.push(['identify', userId, properties])
      },
      reset() { calls.push(['reset']) }
    }
  }
  const localStorage = {
    getItem(key) { return storage.get(key) ?? null },
    removeItem(key) {
      if (removeFails) throw new Error('storage unavailable')
      storage.delete(key)
    },
    setItem(key, value) { storage.set(key, value) }
  }
  vm.runInNewContext(source, {
    document: { addEventListener() {} },
    localStorage,
    window
  })
  return { calls, storage, window }
}

test('classic analytics identifies a stable UUID without accepting email', () => {
  const { calls, window } = createHarness()

  assert.equal(window.identifyEdeniaAuthenticatedUser(USER_ID, {
    email: ' LEARNER@Example.com '
  }), true)
  assert.equal(
    window.identifyEdeniaAuthenticatedUser('learner@example.com'),
    false
  )
  assert.equal(window.identifyEdeniaAuthenticatedUser('not-a-uuid'), false)
  assert.equal(calls.length, 1)
  assert.equal(calls[0][0], 'identify')
  assert.equal(calls[0][1], USER_ID.toLowerCase())
  assert.deepEqual(
    { ...calls[0][2] },
    { email: 'learner@example.com' }
  )
  assert.equal(window.getEdeniaAuthenticatedUserId(), USER_ID.toLowerCase())
})

test('classic analytics preserves its authenticated UUID across a reload', () => {
  const storage = new Map()
  const firstLoad = createHarness({ storage })
  assert.equal(firstLoad.window.identifyEdeniaAuthenticatedUser(USER_ID), true)

  const secondLoad = createHarness({ storage })
  assert.equal(
    secondLoad.window.getEdeniaAuthenticatedUserId(),
    USER_ID.toLowerCase()
  )
})

test('classic analytics uses one marker across internal and public entrypoints', () => {
  const storage = new Map()
  const internalLoad = createHarness({ internalTest: true, storage })
  internalLoad.window.identifyEdeniaAuthenticatedUser(USER_ID)

  const publicLoad = createHarness({ internalTest: false, storage })
  assert.equal(
    publicLoad.window.getEdeniaAuthenticatedUserId(),
    USER_ID.toLowerCase()
  )
})

test('classic analytics adopts a loaded PostHog user when its marker is absent', () => {
  const analytics = createHarness({ posthogUserId: USER_ID })

  assert.equal(
    analytics.window.getEdeniaAuthenticatedUserId(),
    USER_ID.toLowerCase()
  )
  assert.equal(
    analytics.storage.get('edenia_posthog_authenticated_user_v1'),
    USER_ID.toLowerCase()
  )
})

test('classic analytics reports identity as unready until PostHog loads', () => {
  const analytics = createHarness({ sdkLoaded: false })
  assert.equal(analytics.window.getEdeniaAuthenticatedUserId(), undefined)
})

test('classic analytics rejects untrusted account person properties', () => {
  const { calls, window } = createHarness()
  for (const properties of [
    { email: 'invalid' },
    { auth_method: 'google' },
    { email: 'learner@example.com', role: 'admin' },
    []
  ]) {
    assert.equal(
      window.identifyEdeniaAuthenticatedUser(USER_ID, properties),
      false
    )
  }
  assert.deepEqual(calls, [])
})

test('classic analytics resets PostHog only in the enabled environment', () => {
  const enabled = createHarness()
  enabled.window.identifyEdeniaAuthenticatedUser(USER_ID)
  assert.equal(enabled.window.resetEdeniaAuthenticatedUser(), true)
  assert.equal(enabled.calls.length, 2)
  assert.equal(enabled.calls[0][0], 'identify')
  assert.equal(enabled.calls[0][1], USER_ID.toLowerCase())
  assert.deepEqual({ ...enabled.calls[0][2] }, {})
  assert.deepEqual(enabled.calls[1], ['reset'])
  assert.equal(enabled.window.getEdeniaAuthenticatedUserId(), null)

  const disabled = createHarness({ enabled: false })
  assert.equal(disabled.window.identifyEdeniaAuthenticatedUser(USER_ID), false)
  assert.equal(disabled.window.resetEdeniaAuthenticatedUser(), false)
  assert.equal(disabled.window.getEdeniaAuthenticatedUserId(), null)
  assert.deepEqual(disabled.calls, [])
})

test('classic analytics counts PostHog reset when marker cleanup fails', () => {
  const analytics = createHarness({ removeFails: true })
  analytics.window.identifyEdeniaAuthenticatedUser(USER_ID)

  assert.equal(analytics.window.resetEdeniaAuthenticatedUser(), true)
  assert.equal(
    analytics.window.getEdeniaAuthenticatedUserId(),
    USER_ID.toLowerCase()
  )
  assert.equal(
    analytics.calls.filter(([operation]) => operation === 'reset').length,
    1
  )
})
