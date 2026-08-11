import assert from 'node:assert/strict'
import test from 'node:test'
import {
  ACCOUNT_EXPORT_FEEDBACK,
  createAccountExportController
} from '../../src/integrations/account-export-controller.js'

const USER_A = '123e4567-e89b-42d3-a456-426614174000'
const USER_B = '223e4567-e89b-42d3-a456-426614174001'

function signedIn(userId = USER_A) {
  return { sessionState: 'signed-in', userId }
}

function exportFor(userId = USER_A) {
  return {
    schema_version: 'edenia-account-export-v1',
    account: { id: userId },
    scope: {
      server_data: true,
      current_device_progress: false
    },
    reminder_preference: null,
    subscription: null
  }
}

function createHarness(invoke = async () => ({ data: exportFor(), error: null })) {
  const states = []
  const downloads = []
  const calls = []
  const controller = createAccountExportController({
    client: {
      functions: {
        invoke(name, options) {
          calls.push([name, options])
          return invoke(name, options)
        }
      }
    },
    download(data, filename) { downloads.push({ data, filename }) },
    now: () => new Date('2026-08-12T03:04:05.000Z'),
    onStateChange(state) { states.push(state) }
  })
  return { calls, controller, downloads, states }
}

test('account export requires a signed-in stable user UUID', async () => {
  const { calls, controller, downloads } = createHarness()

  assert.equal(await controller.exportData(), false)
  assert.equal(controller.getState().feedback, ACCOUNT_EXPORT_FEEDBACK.SIGN_IN_REQUIRED)
  assert.deepEqual(calls, [])
  assert.deepEqual(downloads, [])

  controller.synchronizeAccount({ sessionState: 'signed-in', userId: 'not-a-uuid' })
  assert.equal(controller.getState().userId, null)
})

test('account export downloads only a matching server-data response', async () => {
  const { calls, controller, downloads } = createHarness()
  controller.synchronizeAccount(signedIn())

  assert.equal(await controller.exportData(), true)
  assert.deepEqual(calls, [['export-account-data', { body: {} }]])
  assert.deepEqual(downloads, [{
    data: exportFor(),
    filename: 'edenia-account-data-2026-08-12.json'
  }])
  assert.equal(controller.getState().feedback, ACCOUNT_EXPORT_FEEDBACK.COMPLETE)
  assert.equal(controller.getState().busyAction, null)
})

test('account export fails closed for mismatched or local-progress scope', async () => {
  for (const data of [
    exportFor(USER_B),
    {
      ...exportFor(),
      scope: { server_data: true, current_device_progress: true }
    }
  ]) {
    const { controller, downloads } = createHarness(async () => ({
      data,
      error: null
    }))
    controller.synchronizeAccount(signedIn())

    assert.equal(await controller.exportData(), false)
    assert.equal(controller.getState().feedback, ACCOUNT_EXPORT_FEEDBACK.FAILED)
    assert.deepEqual(downloads, [])
  }
})

test('account export discards an in-flight response after account switching', async () => {
  let finishRequest
  const response = new Promise(resolve => { finishRequest = resolve })
  const { controller, downloads } = createHarness(() => response)
  controller.synchronizeAccount(signedIn(USER_A))

  const pending = controller.exportData()
  controller.synchronizeAccount(signedIn(USER_B))
  finishRequest({ data: exportFor(USER_A), error: null })

  assert.equal(await pending, false)
  assert.equal(controller.getState().userId, USER_B)
  assert.equal(controller.getState().feedback, null)
  assert.deepEqual(downloads, [])
})

test('account export prevents concurrent requests and maps rate limits', async () => {
  let finishRequest
  const response = new Promise(resolve => { finishRequest = resolve })
  const { calls, controller } = createHarness(() => response)
  controller.synchronizeAccount(signedIn())

  const first = controller.exportData()
  assert.equal(await controller.exportData(), false)
  assert.equal(calls.length, 1)
  finishRequest({
    data: null,
    error: {
      context: new Response(JSON.stringify({ code: 'rate_limited' }), {
        headers: { 'Content-Type': 'application/json' },
        status: 429
      })
    }
  })

  assert.equal(await first, false)
  assert.equal(controller.getState().feedback, ACCOUNT_EXPORT_FEEDBACK.RATE_LIMITED)
})

test('account export validates its dependencies', () => {
  const valid = {
    client: { functions: { invoke() {} } },
    download() {},
    onStateChange() {}
  }
  assert.throws(
    () => createAccountExportController({ ...valid, client: null }),
    /Supabase client/
  )
  assert.throws(
    () => createAccountExportController({ ...valid, download: null }),
    /download callback/
  )
  assert.throws(
    () => createAccountExportController({ ...valid, onStateChange: null }),
    /state callback/
  )
})
