import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'
import test from 'node:test'

const source = readFileSync('scripts/tiny-swords-conflict-previews.js', 'utf8')
function harness() {
  const listeners = new Map()
  const sent = []
  const images = []
  let removed = false
  let now = 0
  let nextTimer = 0
  const timers = new Map()
  function advance(milliseconds) {
    const end = now + milliseconds
    while (true) {
      const next = [...timers].filter(([, timer]) => timer.at <= end)
        .sort((a, b) => a[1].at - b[1].at)[0]
      if (!next) break
      now = next[1].at
      timers.delete(next[0])
      next[1].callback()
    }
    now = end
  }
  const frame = {
    style: {}, setAttribute() {}, remove() { removed = true },
    contentWindow: { postMessage(data, origin) { sent.push({ data, origin }) } }
  }
  const window = {
    addEventListener(type, callback) { listeners.set(type, callback) },
    removeEventListener(type) { listeners.delete(type) }
  }
  vm.runInNewContext(source, {
    URL, window, location: { origin: 'https://edenia.test' },
    crypto: { randomUUID: () => 'session-1' },
    document: { currentScript: { src: 'https://edenia.test/game/release/conflict-previews.js' },
      createElement: () => frame, body: { append() {} } },
    setTimeout(callback, delay) {
      const id = ++nextTimer
      timers.set(id, { callback, at: now + delay })
      return id
    },
    clearTimeout(id) { timers.delete(id) }
  })
  const dispose = window.edeniaCreateConflictPreviews({ layouts: [{ version: 1 }, null],
    onImage(index, pixels) { images.push({ index, pixels }) } })
  return { frame, sent, images, dispose, advance, expire: () => advance(60000),
    pendingTimers: () => timers.size,
    removed: () => removed,
    emit(data, overrides = {}) { listeners.get('message')?.({ data,
      source: frame.contentWindow, origin: 'https://edenia.test', ...overrides }) }
  }
}

test('foreign frames and stale sessions cannot supply saved-island pixels', () => {
  const h = harness()
  h.emit({ type: 'edenia-conflict-preview-ready' }, { origin: 'https://foreign.test' })
  h.emit({ type: 'edenia-conflict-preview-ready' }, { source: {} })
  assert.equal(h.sent.length, 0)
  h.emit({ type: 'edenia-conflict-preview-ready' })
  assert.equal(h.sent[0].origin, 'https://edenia.test')
  assert.equal(h.sent[0].data.session, 'session-1')
  const result = { type: 'edenia-conflict-preview-image', session: 'session-1', index: 0,
    status: 'ready', pixels: 'aGVsbG8=' }
  h.emit({ ...result, session: 'old-session' })
  h.emit({ ...result, index: 8 })
  assert.equal(h.images.length, 0)
  h.emit(result)
  h.emit(result)
  assert.deepEqual(h.images, [{ index: 0, pixels: 'data:image/png;base64,aGVsbG8=' }])
  h.emit({ type: 'edenia-conflict-preview-done', session: 'session-1' })
  assert.deepEqual(h.images[1], { index: 1, pixels: null })
  assert.equal(h.removed(), true)
  assert.equal(h.pendingTimers(), 0)
})

test('cancellation discards late results and timeout releases the engine', () => {
  const h = harness()
  h.dispose()
  h.emit({ type: 'edenia-conflict-preview-image', session: 'session-1', index: 0,
    status: 'ready', pixels: 'aGVsbG8=' })
  assert.deepEqual(h.images, [])
  assert.equal(h.removed(), true)
  const stalled = harness()
  stalled.expire()
  assert.deepEqual(stalled.images, [{ index: 0, pixels: null }, { index: 1, pixels: null }])
  assert.equal(stalled.removed(), true)
})

test('advancing downloads may cross one minute and still deliver both islands', () => {
  const h = harness()
  h.advance(45000)
  h.emit({ type: 'edenia-game-loading-progress', current: 100, total: 1000 })
  h.advance(45000)
  assert.equal(h.removed(), false)
  h.emit({ type: 'edenia-game-engine-initialized' })
  h.emit({ type: 'edenia-conflict-preview-ready' })
  for (const index of [0, 1]) h.emit({ type: 'edenia-conflict-preview-image',
    session: 'session-1', index, status: 'ready', pixels: 'aGVsbG8=' })
  h.emit({ type: 'edenia-conflict-preview-done', session: 'session-1' })
  assert.equal(h.images.length, 2)
  assert.ok(h.images.every(image => image.pixels))
  assert.equal(h.pendingTimers(), 0)
})

test('repeated, malformed and foreign progress cannot postpone inactivity failure', () => {
  const h = harness()
  h.advance(30000)
  h.emit({ type: 'edenia-game-loading-progress', current: 100, total: 1000 })
  h.advance(30000)
  for (const current of [100, 99, -1, '200', NaN, Infinity, 1001]) {
    h.emit({ type: 'edenia-game-loading-progress', current, total: 1000 })
  }
  h.emit({ type: 'edenia-game-loading-progress', current: 200, total: 1000 }, { source: {} })
  h.emit({ type: 'edenia-game-loading-progress', current: 200, total: 1000 }, { origin: 'https://foreign.test' })
  assert.equal(h.removed(), false)
  h.advance(30000)
  assert.equal(h.removed(), true)
  assert.equal(h.images.length, 2)
  assert.equal(h.pendingTimers(), 0)
})

test('startup milestones renew inactivity once and total capture time remains bounded', () => {
  const h = harness()
  h.advance(55000)
  h.emit({ type: 'edenia-game-engine-initialized' })
  h.advance(55000)
  h.emit({ type: 'edenia-game-engine-initialized' })
  assert.equal(h.removed(), false)
  h.advance(5000)
  assert.equal(h.removed(), true)

  const busy = harness()
  for (const current of [100, 200, 300]) {
    busy.advance(45000)
    busy.emit({ type: 'edenia-game-loading-progress', current, total: 1000 })
  }
  busy.advance(45000)
  assert.equal(busy.removed(), true)
  assert.equal(busy.images.length, 2)
  assert.equal(busy.pendingTimers(), 0)
})
