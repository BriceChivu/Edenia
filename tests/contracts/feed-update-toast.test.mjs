import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import vm from 'node:vm'

const source = await readFile(new URL('../../src/app.js', import.meta.url), 'utf8')
const start = source.indexOf('function showToast(')
const end = source.indexOf('\n// ═', start)

function harness() {
  const timers = new Map()
  const toast = {
    firstChild: null,
    className: '',
    classList: {
      toggle() {},
      remove: () => { toast.className = toast.className.replace(' show', '') }
    },
    setAttribute() {},
    replaceChildren() { this.firstChild = null },
    append(child) { this.firstChild ||= child }
  }
  const context = vm.createContext({
    document: { getElementById: () => toast, createElement: () => ({}) },
    setTimeout: (callback, delay) => { const id = {}; timers.set(id, { callback, delay }); return id },
    clearTimeout: id => timers.delete(id)
  })
  vm.runInContext(source.slice(start, end), context)
  return { toast, timers, showToast: context.showToast }
}

test('feed updating notice stays visible until explicitly finished', () => {
  const h = harness()
  const dismiss = h.showToast('Updating video feed…', 'info', { durationMs: 0 })
  assert.equal(h.timers.size, 0)
  assert.match(h.toast.className, / show$/)
  dismiss()
  assert.doesNotMatch(h.toast.className, / show$/)
})

test('finishing a feed update cannot hide a newer success or error toast', () => {
  for (const type of ['success', 'error']) {
    const h = harness()
    const dismiss = h.showToast('Updating video feed…', 'info', { durationMs: 0 })
    h.showToast('Refresh finished', type)
    dismiss()
    assert.match(h.toast.className, / show$/)
    assert.equal(h.toast.firstChild.textContent, 'Refresh finished')
    assert.equal(h.timers.size, 1)
  }
})
