import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import vm from 'node:vm'
import test from 'node:test'

const source = await readFile(new URL('../../src/app.js', import.meta.url), 'utf8')
const start = source.indexOf('async function refreshAnkiStats(')
const end = source.indexOf('\nfunction startAnkiAutoRefresh', start)
assert.ok(start > 0 && end > start)

function harness({ signedIn, fails }) {
  const state = { activityLog: [{ title: 'existing history' }] }
  const calls = { saved: 0, rendered: 0, synchronized: 0 }
  const context = vm.createContext({
    ankiRefreshDeferredForPrompt: false,
    learnerProfileLifecycleAuthority: signedIn ? {} : null,
    ankiStatsCache: null,
    loadState: () => state,
    isAnkiTrackingActive: () => true,
    fetchAnkiStats: async () => { if (fails) throw new Error('unavailable'); return { study: 1 } },
    syncAnkiStatsToState: () => { calls.synchronized += 1 },
    renderAnkiStatus: () => { calls.rendered += 1 },
    formatAnkiConnectError: () => 'unavailable',
    appendActivityLog: (target, entry) => target.activityLog.push(entry),
    saveState: () => { calls.saved += 1 },
    t: key => key
  })
  vm.runInContext(source.slice(start, end), context)
  return { state, calls, refresh: options => context.refreshAnkiStats(options) }
}

test('failed signed-in automatic refresh preserves history and only renders status', async () => {
  const h = harness({ signedIn: true, fails: true })
  await h.refresh({ silent: true })
  assert.deepEqual(h.calls, { saved: 0, rendered: 1, synchronized: 0 })
  assert.deepEqual(h.state.activityLog, [{ title: 'existing history' }])
})

test('ordinary accountless automatic refresh keeps its existing diagnostic logging', async () => {
  const h = harness({ signedIn: false, fails: true })
  await h.refresh({ silent: true })
  assert.deepEqual(h.calls, { saved: 1, rendered: 1, synchronized: 0 })
  assert.equal(h.state.activityLog.length, 2)
  assert.equal(h.state.activityLog[0].title, 'existing history')
})

test('successful signed-in Anki refresh still synchronizes Study facts', async () => {
  const h = harness({ signedIn: true, fails: false })
  await h.refresh({ silent: true })
  assert.deepEqual(h.calls, { saved: 0, rendered: 1, synchronized: 1 })
})
