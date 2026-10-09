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
  let timeout
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
    setTimeout(callback) { timeout = callback; return 1 }, clearTimeout() {}
  })
  const dispose = window.edeniaCreateConflictPreviews({ layouts: [{ version: 1 }, null],
    onImage(index, pixels) { images.push({ index, pixels }) } })
  return { frame, sent, images, dispose, expire: () => timeout(),
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
