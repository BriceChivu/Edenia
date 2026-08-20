import assert from 'node:assert/strict'
import test from 'node:test'
import {
  createTurnstileController,
  createTurnstileScriptLoader,
  TURNSTILE_SCRIPT_URL
} from '../../src/integrations/turnstile-controller.js'

function createTurnstileHarness() {
  const calls = []
  const configurations = []
  let nextWidgetId = 1
  const api = {
    remove(widgetId) { calls.push(['remove', widgetId]) },
    render(element, configuration) {
      configurations.push({ configuration, element })
      const widgetId = nextWidgetId++
      calls.push(['render', element, configuration, widgetId])
      return widgetId
    },
    reset(widgetId) { calls.push(['reset', widgetId]) }
  }
  return {
    api,
    calls,
    configurations,
    target: { turnstile: api }
  }
}

test('Turnstile explicitly renders one dynamic widget with safe options', async () => {
  const turnstile = createTurnstileHarness()
  const statuses = []
  const element = { isConnected: true }
  const controller = createTurnstileController({
    loadScript: async () => turnstile.api,
    onStatusChange(status, changedElement) {
      statuses.push([status, changedElement])
    },
    siteKey: 'public-site-key',
    turnstileTarget: turnstile.target
  })

  assert.equal(await controller.mount(element, {
    language: 'fr',
    theme: 'dark'
  }), true)
  assert.equal(await controller.mount(element, {
    language: 'fr',
    theme: 'dark'
  }), true)
  assert.equal(turnstile.calls.filter(call => call[0] === 'render').length, 1)
  const options = turnstile.configurations[0].configuration
  assert.equal(options.sitekey, 'public-site-key')
  assert.equal(options.language, 'fr')
  assert.equal(options.theme, 'dark')
  assert.equal(options.size, 'flexible')
  assert.equal(options.appearance, 'interaction-only')
  assert.equal(options['response-field'], false)
  options['before-interactive-callback']()
  options['after-interactive-callback']()
  assert.deepEqual(statuses.map(([status]) => status), [
    'loading',
    'pending',
    'interactive',
    'pending'
  ])
})

test('concurrent identical mounts render one provider widget', async () => {
  const turnstile = createTurnstileHarness()
  const statuses = []
  const element = { isConnected: true }
  let resolveScript
  const scriptReady = new Promise(resolve => { resolveScript = resolve })
  const controller = createTurnstileController({
    loadScript: () => scriptReady,
    onStatusChange(status) { statuses.push(status) },
    siteKey: 'public-site-key',
    turnstileTarget: turnstile.target
  })

  const first = controller.mount(element, { language: 'en', theme: 'auto' })
  const second = controller.mount(element, { language: 'en', theme: 'auto' })
  resolveScript(turnstile.api)

  assert.deepEqual(await Promise.all([first, second]), [true, true])
  assert.equal(turnstile.calls.filter(call => call[0] === 'render').length, 1)
  assert.deepEqual(statuses, ['loading', 'pending'])
})

test('Turnstile tokens are memory-only, bounded, single-use, and resettable', async () => {
  const turnstile = createTurnstileHarness()
  let now = 1_000
  const statuses = []
  const element = { isConnected: true }
  const controller = createTurnstileController({
    loadScript: async () => turnstile.api,
    now: () => now,
    onStatusChange(status) { statuses.push(status) },
    siteKey: 'public-site-key',
    turnstileTarget: turnstile.target
  })
  await controller.mount(element)
  const options = turnstile.configurations[0].configuration
  options.callback('private-turnstile-token')

  assert.equal(controller.consumeToken(element), 'private-turnstile-token')
  assert.equal(controller.consumeToken(element), null)
  assert.equal(controller.reset(element), true)
  assert.deepEqual(
    turnstile.calls.filter(call => call[0] === 'reset'),
    [['reset', 1]]
  )
  assert.ok(statuses.includes('ready'))
  assert.ok(statuses.includes('consumed'))

  options.callback('x'.repeat(2049))
  assert.equal(controller.consumeToken(element), null)
  assert.equal(statuses.at(-1), 'error')

  options.callback('fresh-token')
  now += 300_000
  assert.equal(controller.consumeToken(element), null)
  assert.equal(
    turnstile.calls.filter(call => call[0] === 'reset').length,
    2
  )

  options.callback('future-clock-token')
  now -= 300_001
  assert.equal(controller.consumeToken(element), null)
  assert.equal(
    turnstile.calls.filter(call => call[0] === 'reset').length,
    3
  )
})

test('expiry, timeout, errors, and unsupported browsers clear a token safely', async () => {
  const turnstile = createTurnstileHarness()
  const statuses = []
  const element = { isConnected: true }
  const controller = createTurnstileController({
    loadScript: async () => turnstile.api,
    onStatusChange(status) { statuses.push(status) },
    siteKey: 'public-site-key',
    turnstileTarget: turnstile.target
  })
  await controller.mount(element)
  const options = turnstile.configurations[0].configuration
  for (const callbackName of [
    'expired-callback',
    'timeout-callback',
    'error-callback',
    'unsupported-callback'
  ]) {
    options.callback('temporary-token')
    options[callbackName]()
    assert.equal(controller.consumeToken(element), null)
  }
  assert.deepEqual(statuses.slice(-2), ['ready', 'unavailable'])
})

test('rerender and destroy remove provider widgets without retaining tokens', async () => {
  const turnstile = createTurnstileHarness()
  const element = { isConnected: true }
  const controller = createTurnstileController({
    loadScript: async () => turnstile.api,
    siteKey: 'public-site-key',
    turnstileTarget: turnstile.target
  })
  await controller.mount(element, { theme: 'light' })
  await controller.mount(element, { theme: 'dark' })
  controller.destroy()

  assert.deepEqual(
    turnstile.calls.filter(call => call[0] === 'remove').map(call => call[1]),
    [1, 2]
  )
  assert.equal(controller.consumeToken(element), null)
})

test('Turnstile script loading is singleton and uses explicit rendering', async () => {
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
    head: { appendChild(element) { appended.push(element) } }
  }
  const loadScript = createTurnstileScriptLoader({ document, target })
  const first = loadScript()
  const second = loadScript()
  assert.equal(first, second)
  assert.equal(appended.length, 1)
  assert.equal(script.src, TURNSTILE_SCRIPT_URL)
  assert.equal(script.crossOrigin, 'anonymous')

  const turnstile = createTurnstileHarness()
  target.turnstile = turnstile.api
  listeners.load()
  assert.equal(await first, turnstile.api)
})

test('invalid Turnstile boundaries fail before script loading', () => {
  assert.throws(
    () => createTurnstileController({
      loadScript() {},
      siteKey: '',
      turnstileTarget: {}
    }),
    /requires a site key and callbacks/
  )
})
