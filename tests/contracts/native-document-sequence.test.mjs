import test from 'node:test'
import assert from 'node:assert/strict'
import vm from 'node:vm'
import { nativeDocumentSequenceScript, nativeDocumentSequenceComplete } from '../fixtures/native-document-sequence.mjs'

for (const response of ['armed', 'denied', 'wrong-body', 'network-failure']) {
  test(`native fixture reloads only after acknowledged reset: ${response}`, async () => {
    const frames = [], events = [], status = {}
    let release
    const pending = new Promise(resolve => { release = resolve })
    vm.runInNewContext(nativeDocumentSequenceScript, {
      requestAnimationFrame: callback => frames.push(callback),
      document: { querySelector: () => status },
      fetch: async path => {
        events.push(path)
        await pending
        if (response === 'network-failure') throw Error('offline')
        return { ok: response !== 'denied', text: async () => response === 'wrong-body' ? 'unexpected' : 'reset-armed' }
      },
      location: { reload: () => events.push('reload') }
    })
    assert.deepEqual(events, [])
    frames.shift()()
    const done = frames.shift()()
    assert.deepEqual(events, ['/fixture/rendered'])
    release(); await done
    assert.deepEqual(events, response === 'armed' ? ['/fixture/rendered', 'reload'] : ['/fixture/rendered'])
    if (response !== 'armed') assert.match(status.textContent, /No pass is recorded/)
  })
}

test('local sequence cannot report success after expiry, missing failure check, or failed cleanup', () => {
  const complete = { browserStarted: true, documentRequests: 2, renderedReports: 1, injectedResets: 1,
    diagnostic: { documentDelivered: true, failure: 'upstream-reset' }, cleanupVerified: true }
  assert.equal(nativeDocumentSequenceComplete(complete), true)
  for (const change of [{ fixtureIncomplete: true }, { browserStarted: false }, { documentRequests: 1 }, { renderedReports: 0 },
    { injectedResets: 0 }, { cleanupVerified: false }, { diagnostic: { documentDelivered: false, failure: 'upstream-reset' } },
    { diagnostic: { documentDelivered: true, failure: 'deadline' } }]) {
    assert.equal(nativeDocumentSequenceComplete({ ...complete, ...change }), false)
  }
})
