import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import vm from 'node:vm'

const source = await readFile(new URL('../../src/app.js', import.meta.url), 'utf8')
const restoreSource = source.slice(source.indexOf('function restoreFeedViewport('), source.indexOf('function renderFeed('))

function restoreAfterRefresh(offset, focusLost = false) {
  const calls = []
  const focused = []
  const body = {}
  const control = { hasAttribute: () => true, focus: options => focused.push({ ...options }) }
  const node = {
    isConnected: true,
    querySelector: () => control,
    getClientRects: () => [{}],
    getBoundingClientRect: () => ({ top: 100 + offset })
  }
  const context = vm.createContext({ window: { scrollBy: options => calls.push({ ...options }) }, document: { body, activeElement: body } })
  vm.runInContext(restoreSource, context)
  context.restoreFeedViewport({ nodes: [node], locations: [], index: 0, top: 100, focusLost })
  return { calls, focused }
}

test('unchanged feed geometry does not interrupt an in-flight smooth scroll', () => {
  assert.deepEqual(restoreAfterRefresh(0).calls, [])
})

test('feed viewport restoration still compensates for real layout movement', () => {
  for (const offset of [42, -18, 0.25]) {
    assert.deepEqual(restoreAfterRefresh(offset).calls, [{ top: offset, behavior: 'instant' }])
  }
})

test('zero-distance restoration still restores a lost keyboard focus', () => {
  const result = restoreAfterRefresh(0, true)
  assert.deepEqual(result.calls, [])
  assert.deepEqual(result.focused, [{ preventScroll: true }])
})
