import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import vm from 'node:vm'

function restoreAfterRefresh(restoreSource, offset, focusLost = false) {
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

for (const appPath of ['src/app.js', 'compat/production/src/app.js']) {
  const source = await readFile(new URL(`../../${appPath}`, import.meta.url), 'utf8')
  const restoreSource = source.slice(source.indexOf('function restoreFeedViewport('), source.indexOf('function renderFeed('))

  test(`${appPath}: unchanged feed geometry does not interrupt an in-flight smooth scroll`, () => {
    assert.deepEqual(restoreAfterRefresh(restoreSource, 0).calls, [])
  })

  test(`${appPath}: feed viewport restoration still compensates for real layout movement`, () => {
    for (const offset of [42, -18, 0.25]) {
      assert.deepEqual(restoreAfterRefresh(restoreSource, offset).calls, [{ top: offset, behavior: 'instant' }])
    }
  })

  test(`${appPath}: zero-distance restoration still restores a lost keyboard focus`, () => {
    const result = restoreAfterRefresh(restoreSource, 0, true)
    assert.deepEqual(result.calls, [])
    assert.deepEqual(result.focused, [{ preventScroll: true }])
  })
}
