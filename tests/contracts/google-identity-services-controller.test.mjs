import assert from 'node:assert/strict'
import { webcrypto } from 'node:crypto'
import test from 'node:test'
import {
  createGoogleIdentityServicesController,
  createGoogleIdentityServicesScriptLoader,
  GOOGLE_IDENTITY_SCRIPT_URL
} from '../../src/integrations/google-identity-services-controller.js'

function createGoogleHarness() {
  const calls = []
  const configurations = []
  const api = {
    cancel() { calls.push(['cancel']) },
    disableAutoSelect() { calls.push(['disableAutoSelect']) },
    initialize(configuration) {
      configurations.push(configuration)
      calls.push(['initialize', configuration])
    },
    prompt() { calls.push(['prompt']) },
    renderButton(element, options) {
      calls.push(['renderButton', element, options])
      element.children.push({ iframe: true })
    }
  }
  const target = { google: { accounts: { id: api } } }
  return { api, calls, configurations, target }
}

function createElement() {
  return {
    children: [],
    replaceChildren() { this.children = [] }
  }
}

test('official buttons share one nonce opportunity and render idempotently', async () => {
  const google = createGoogleHarness()
  const statuses = []
  const controller = createGoogleIdentityServicesController({
    clientId: 'client.apps.googleusercontent.com',
    crypto: webcrypto,
    exchangeCredential: async () => true,
    googleTarget: google.target,
    loadScript: async () => google.api,
    onStatusChange(status) { statuses.push(status) }
  })
  const first = createElement()
  const second = createElement()

  assert.equal(await controller.mountButton(first, {
    locale: 'fr',
    width: 1000
  }), true)
  assert.equal(await controller.mountButton(first, {
    locale: 'fr',
    width: 1000
  }), true)
  assert.equal(await controller.mountButton(second, {
    locale: 'zh-TW',
    width: 180
  }), true)

  const renderCalls = google.calls.filter(call => call[0] === 'renderButton')
  assert.equal(renderCalls.length, 2)
  assert.deepEqual(renderCalls[0][2], {
    locale: 'fr',
    logo_alignment: 'left',
    shape: 'rectangular',
    size: 'large',
    text: 'continue_with',
    theme: 'outline',
    type: 'standard',
    width: 400
  })
  assert.equal(renderCalls[1][2].width, 200)
  assert.deepEqual(statuses, ['loading', 'ready'])
  assert.equal(google.configurations[0].client_id, 'client.apps.googleusercontent.com')
  assert.equal(google.configurations[0].auto_select, false)
  assert.equal(google.configurations[0].itp_support, true)
  assert.match(google.configurations[0].nonce, /^[0-9a-f]{64}$/)
})

test('one credential consumes its raw nonce once without retaining token state', async () => {
  const google = createGoogleHarness()
  const exchanges = []
  const controller = createGoogleIdentityServicesController({
    clientId: 'client.apps.googleusercontent.com',
    crypto: webcrypto,
    exchangeCredential: async input => {
      exchanges.push(input)
      return true
    },
    googleTarget: google.target,
    loadScript: async () => google.api
  })
  const element = createElement()
  await controller.mountButton(element)
  const configuration = google.configurations.at(-1)
  const callback = configuration.callback

  await callback({ credential: 'private-id-token' })
  await callback({ credential: 'duplicate-id-token' })
  await new Promise(resolve => setImmediate(resolve))

  assert.equal(exchanges.length, 1)
  assert.equal(exchanges[0].token, 'private-id-token')
  assert.match(exchanges[0].nonce, /^[A-Za-z0-9_-]{43}$/)
  const expectedGoogleNonce = Buffer.from(await webcrypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(exchanges[0].nonce)
  )).toString('hex')
  assert.equal(configuration.nonce, expectedGoogleNonce)
  assert.match(configuration.nonce, /^[0-9a-f]{64}$/)
  assert.equal(
    google.calls.filter(call => call[0] === 'cancel').length,
    1
  )
})

test('prompt eligibility is repeat-safe and explicit sign-out suppresses auto select', async () => {
  const google = createGoogleHarness()
  const controller = createGoogleIdentityServicesController({
    clientId: 'client.apps.googleusercontent.com',
    crypto: webcrypto,
    exchangeCredential: async () => true,
    googleTarget: google.target,
    loadScript: async () => google.api
  })

  assert.equal(await controller.synchronizePrompt({
    eligible: true,
    autoSelect: true
  }), true)
  assert.equal(await controller.synchronizePrompt({
    eligible: true,
    autoSelect: true
  }), true)
  assert.equal(
    google.calls.filter(call => call[0] === 'prompt').length,
    1
  )
  assert.equal(google.configurations.at(-1).auto_select, true)

  assert.equal(await controller.synchronizePrompt({ eligible: false }), false)
  controller.prepareForExplicitSignOut()
  assert.equal(
    google.calls.filter(call => call[0] === 'disableAutoSelect').length,
    1
  )
  assert.ok(google.calls.filter(call => call[0] === 'cancel').length >= 2)
})

test('an eligible prompt replaces a manual-only nonce instead of reinitializing it', async () => {
  const google = createGoogleHarness()
  const exchanges = []
  const controller = createGoogleIdentityServicesController({
    clientId: 'client.apps.googleusercontent.com',
    crypto: webcrypto,
    exchangeCredential: async input => {
      exchanges.push(input)
      return true
    },
    googleTarget: google.target,
    loadScript: async () => google.api
  })
  const element = createElement()

  await controller.mountButton(element)
  const firstConfiguration = google.configurations.at(-1)
  await controller.synchronizePrompt({ eligible: true, autoSelect: true })
  const secondConfiguration = google.configurations.at(-1)

  assert.equal(google.configurations.length, 2)
  assert.equal(firstConfiguration.auto_select, false)
  assert.equal(secondConfiguration.auto_select, true)
  assert.notEqual(firstConfiguration.nonce, secondConfiguration.nonce)
  assert.equal(
    google.calls.filter(call => call[0] === 'renderButton').length,
    2
  )

  await firstConfiguration.callback({ credential: 'stale-token' })
  await secondConfiguration.callback({ credential: 'current-token' })
  assert.equal(exchanges.length, 1)
  assert.equal(exchanges[0].token, 'current-token')
})

test('failed exchanges create a fresh nonce and rerender mounted buttons', async () => {
  const google = createGoogleHarness()
  const controller = createGoogleIdentityServicesController({
    clientId: 'client.apps.googleusercontent.com',
    crypto: webcrypto,
    exchangeCredential: async () => false,
    googleTarget: google.target,
    loadScript: async () => google.api
  })
  const element = createElement()
  await controller.mountButton(element)
  const firstNonce = google.configurations.at(-1).nonce

  await google.configurations.at(-1).callback({
    credential: 'rejected-token'
  })
  await new Promise(resolve => setImmediate(resolve))

  assert.equal(
    google.calls.filter(call => call[0] === 'renderButton').length,
    2
  )
  assert.notEqual(google.configurations.at(-1).nonce, firstNonce)
})

test('script loading is singleton and validates the installed Google boundary', async () => {
  const listeners = {}
  const appended = []
  const script = {
    addEventListener(name, callback) { listeners[name] = callback }
  }
  const target = {}
  const document = {
    createElement(name) {
      assert.equal(name, 'script')
      return script
    },
    getElementById() { return null },
    head: {
      appendChild(element) { appended.push(element) }
    }
  }
  const loadScript = createGoogleIdentityServicesScriptLoader({
    document,
    target
  })
  const first = loadScript()
  const second = loadScript()
  assert.equal(first, second)
  assert.equal(appended.length, 1)
  assert.equal(script.src, GOOGLE_IDENTITY_SCRIPT_URL)
  assert.equal(script.crossOrigin, undefined)

  const google = createGoogleHarness()
  target.google = google.target.google
  listeners.load()
  assert.equal(await first, google.api)
})

test('unavailable status exposes only a safe lifecycle stage', async () => {
  const statuses = []
  const controller = createGoogleIdentityServicesController({
    clientId: 'client.apps.googleusercontent.com',
    crypto: webcrypto,
    exchangeCredential: async () => true,
    googleTarget: {},
    loadScript: async () => {
      throw new Error('private provider diagnostic')
    },
    onStatusChange(status, details) { statuses.push([status, details]) }
  })

  assert.equal(await controller.synchronizePrompt({ eligible: true }), false)
  assert.deepEqual(statuses, [
    ['loading', undefined],
    ['unavailable', { stage: 'script' }]
  ])
  assert.doesNotMatch(JSON.stringify(statuses), /private provider diagnostic/u)
})

test('initialization failure discards the candidate before a fresh retry', async () => {
  const google = createGoogleHarness()
  const statuses = []
  const initialize = google.api.initialize
  let initializeAttempts = 0
  google.api.initialize = configuration => {
    initializeAttempts += 1
    if (initializeAttempts === 1) {
      google.configurations.push(configuration)
      throw new Error('private initialization failure')
    }
    initialize(configuration)
  }
  const controller = createGoogleIdentityServicesController({
    clientId: 'client.apps.googleusercontent.com',
    crypto: webcrypto,
    exchangeCredential: async () => true,
    googleTarget: google.target,
    loadScript: async () => google.api,
    onStatusChange(status, details) { statuses.push([status, details]) }
  })

  assert.equal(await controller.synchronizePrompt({ eligible: true }), false)
  const failedNonce = google.configurations[0].nonce
  assert.equal(await controller.synchronizePrompt({ eligible: true }), true)
  assert.equal(initializeAttempts, 2)
  assert.notEqual(google.configurations[1].nonce, failedNonce)
  assert.deepEqual(statuses.slice(0, 4), [
    ['loading', undefined],
    ['unavailable', { stage: 'initialize' }],
    ['loading', undefined],
    ['ready', undefined]
  ])
  assert.doesNotMatch(JSON.stringify(statuses), /private initialization failure/u)
})

test('invalid controller boundaries fail before loading Google', () => {
  assert.throws(
    () => createGoogleIdentityServicesController({
      clientId: '',
      exchangeCredential() {},
      googleTarget: {},
      loadScript() {}
    }),
    /requires a client ID and callbacks/
  )
})
