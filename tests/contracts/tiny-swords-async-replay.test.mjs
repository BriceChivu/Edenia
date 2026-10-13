import { readFile } from 'node:fs/promises'
import vm from 'node:vm'
import { test } from 'node:test'
import assert from 'node:assert/strict'
const source = await readFile(new URL('../../scripts/tiny-swords-xp-replay.js', import.meta.url), 'utf8')
function fixture() {
  const timers = [], listeners = {}, blobs = []
  const canvas = { width: 1152, height: 496, isConnected: true, style: {} }
  let draws = 0, synchronousEncodes = 0
  const snapshot = { getContext: () => ({ drawImage() { draws++ } }),
    toBlob(resolve) { blobs.push(resolve) }, toDataURL() { synchronousEncodes++; return 'data:old' } }
  const parent = { EDENIA_ANALYTICS_ENABLED: true, posthog: { sessionRecordingStarted: () => true } }
  const window = { edeniaGameLevel: 10 }
  const document = { hidden: false, getElementById: () => canvas, createElement: () => snapshot }
  class Reader { readAsDataURL() { this.result = 'data:image/webp;base64,test'; this.onload() } }
  vm.runInNewContext(source, { parent, window, document, location: { search: '?tiny_swords_fps=30' },
    URLSearchParams, FileReader: Reader, performance: { now: () => 1 },
    addEventListener: (type, fn) => { listeners[type] = fn },
    setTimeout: fn => { timers.push(fn); return fn }, clearTimeout: fn => { const i = timers.indexOf(fn); if (i >= 0) timers.splice(i, 1) },
    requestAnimationFrame: fn => fn() })
  return { canvas, window, document, parent, listeners, timers, blobs,
    get draws() { return draws }, get synchronousEncodes() { return synchronousEncodes } }
}
const flush = async () => { for (let i = 0; i < 6; i++) await Promise.resolve() }
test('trial replay copies after real render and encodes asynchronously with one image in flight', async () => {
  const f = fixture()
  f.timers.shift()()
  assert.equal(f.draws, 0, 'timer does not read a cleared WebGL buffer')
  f.window.edeniaReplayCaptureAfterFrame()
  f.window.edeniaReplayCaptureAfterFrame()
  assert.equal(f.draws, 1)
  assert.equal(f.synchronousEncodes, 0)
  f.blobs.shift()({})
  await flush()
  assert.match(f.canvas.style.backgroundImage, /data:image\/webp/)
  assert.equal(f.timers.length, 1)
})
test('privacy and late completion gates prevent an image from entering retired or disabled replay', async () => {
  for (const stop of [f => { f.parent.EDENIA_ANALYTICS_ENABLED = false }, f => { f.document.hidden = true }, f => f.listeners.pagehide()]) {
    const f = fixture()
    f.timers.shift()(); f.window.edeniaReplayCaptureAfterFrame(); stop(f)
    f.blobs.shift()({}); await flush()
    assert.equal(f.canvas.style.backgroundImage, undefined)
  }
  const f = fixture(); f.parent.EDENIA_ANALYTICS_ENABLED = false
  f.timers.shift()(); f.window.edeniaReplayCaptureAfterFrame()
  assert.equal(f.draws, 0)
})
test('null blobs recover without blocking play or accumulating capture requests', async () => {
  const f = fixture(); f.timers.shift()(); f.window.edeniaReplayCaptureAfterFrame()
  f.blobs.shift()(null); await flush()
  assert.equal(f.timers.length, 1)
  f.timers.shift()(); f.window.edeniaReplayCaptureAfterFrame()
  assert.equal(f.draws, 2)
})
