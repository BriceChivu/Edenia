import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import vm from 'node:vm'

const source = await readFile('scripts/tiny-swords-xp-replay.js', 'utf8')
function harness({ analytics = true, recording = true, hidden = false, visible = true, conflict = false, ready = true, error = false } = {}) {
  const timers = []
  let captures = 0
  let frame = 'data:image/webp;base64,frame1'
  const canvas = { width: 2400, height: 1600, style: {}, isConnected: true, textContent: 'Your browser does not support the canvas tag.' }
  const snapshot = { width: 0, height: 0, getContext: () => ({ drawImage() { captures++; if (error) throw new Error('buffer unavailable') } }), toDataURL: () => frame }
  const parent = { EDENIA_ANALYTICS_ENABLED: analytics, posthog: { sessionRecordingStarted: () => recording } }
  const target = {
    parent, document: { hidden, getElementById: () => canvas, createElement: () => snapshot },
    edeniaConflictPreviewMode: conflict, edeniaHostVisible: visible, edeniaGameLevel: ready ? 1 : undefined,
    setTimeout(fn, delay) { timers.push({ fn, delay }) }, requestAnimationFrame(fn) { fn() }
  }
  target.window = target
  vm.runInNewContext(source, target)
  return { target, canvas, snapshot, timers, captures: () => captures, setFrame(value) { frame = value }, tick() { timers.shift()?.fn() } }
}

test('Tiny Swords replay exposes bounded WebGL frames as iframe DOM styles', () => {
  const h = harness()
  assert.equal(h.timers[0].delay, 500)
  h.tick()
  assert.equal(h.captures(), 1)
  assert.equal(h.snapshot.width, 810)
  assert.equal(h.snapshot.height, 540)
  assert.equal(h.canvas.style.backgroundImage, 'url("data:image/webp;base64,frame1")')
  assert.equal(h.canvas.style.backgroundSize, '100% 100%')
  assert.equal(h.canvas.textContent, '')
  assert.equal(h.timers[0].delay, 500)
  let writes = 0
  const image = h.canvas.style.backgroundImage
  Object.defineProperty(h.canvas.style, 'backgroundImage', { get: () => image, set() { writes++ } })
  h.tick()
  assert.equal(writes, 0, 'unchanged pixels do not create replay mutations')
  h.setFrame('data:image/webp;base64,frame2')
  h.tick()
  assert.equal(writes, 1)
})

test('replay pixels stay gated by production recording, readiness and visibility', () => {
  for (const options of [{ analytics: false }, { recording: false }, { hidden: true }, { visible: false }, { ready: false }]) {
    const h = harness(options)
    h.tick()
    assert.equal(h.captures(), 0, JSON.stringify(options))
    assert.equal(h.canvas.style.backgroundImage, undefined)
    assert.equal(h.timers[0].delay, 1000)
  }
  const preview = harness({ conflict: true })
  assert.equal(preview.timers.length, 0, 'protected conflict previews are excluded')
  const h = harness()
  h.canvas.isConnected = false
  h.tick()
  assert.equal(h.captures(), 0)
  h.canvas.isConnected = true
  h.tick()
  assert.equal(h.captures(), 1)
  h.target.parent.posthog.sessionRecordingStarted = () => false
  h.tick()
  assert.equal(h.captures(), 1, 'stopping recording stops readback')
})

test('canvas capture errors cannot break gameplay or spin synchronously', () => {
  const h = harness({ error: true })
  assert.doesNotThrow(() => h.tick())
  assert.equal(h.canvas.style.backgroundImage, undefined)
  assert.equal(h.timers.length, 1)
  assert.equal(h.timers[0].delay, 500)
})

test('the integrated export attaches replay after the canonical Godot canvas', async () => {
  const build = await readFile('scripts/build-tiny-swords.mjs', 'utf8')
  assert.ok(build.includes("readFile('scripts/tiny-swords-xp-replay.js', 'utf8')"))
  assert.ok(build.includes("game.replace('</body>', `<script>${replay}</script></body>`)"))
})
