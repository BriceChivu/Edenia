import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import vm from 'node:vm'

const html = await readFile(new URL('../../index.html', import.meta.url), 'utf8')
const firstScriptMatch = html.match(/<script>\s*([\s\S]*?)<\/script>/)

function runEscrow(hash) {
  const replacedUrls = []
  const window = {
    location: {
      hash,
      pathname: '/',
      search: '?legacy_migration_test=1'
    },
    history: {
      state: { preserved: true },
      replaceState(state, title, url) {
        replacedUrls.push({ state, title, url })
      }
    }
  }
  vm.runInNewContext(firstScriptMatch[1], { window }, { timeout: 1000 })
  return { window, replacedUrls }
}

test('legacy progress fragment is escrowed before analytics initializes', () => {
  assert.ok(firstScriptMatch)
  const escrowPosition = html.indexOf('EDENIA_LEGACY_PROGRESS_FRAGMENT')
  const analyticsBootstrapPosition = html.indexOf('window.posthog=e')
  const posthogInitPosition = html.indexOf('posthog.init(')
  const replacePosition = html.indexOf('window.history.replaceState')

  assert.ok(escrowPosition > 0)
  assert.ok(escrowPosition < analyticsBootstrapPosition)
  assert.ok(replacePosition < posthogInitPosition)
})

test('legacy progress fragment escrow accepts only the exact outcome grammar', () => {
  const capability = 'A'.repeat(43)
  for (const outcome of [`transfer.${capability}`, 'none', 'deferred']) {
    const { window, replacedUrls } = runEscrow(
      `#edenia-legacy-progress=${outcome}`
    )
    assert.equal(window.EDENIA_LEGACY_PROGRESS_FRAGMENT, outcome)
    assert.deepEqual(replacedUrls, [{
      state: { preserved: true },
      title: '',
      url: '/?legacy_migration_test=1'
    }])
  }

  for (const hash of [
    '',
    '#other-fragment',
    '#edenia-legacy-progress=transfer.short',
    `#edenia-legacy-progress=transfer.${'A'.repeat(44)}`,
    `#edenia-legacy-progress=transfer.${'A'.repeat(42)}=`,
    '#edenia-legacy-progress=None',
    '#edenia-legacy-progress=none&extra=1'
  ]) {
    const { window, replacedUrls } = runEscrow(hash)
    assert.equal(window.EDENIA_LEGACY_PROGRESS_FRAGMENT, undefined, hash)
    assert.deepEqual(replacedUrls, [], hash)
  }
})

test('fragment escrow has no persistence, DOM, logging, or analytics side effects', () => {
  const source = firstScriptMatch[1]
  assert.doesNotMatch(source, /localStorage|sessionStorage|cookie/i)
  assert.doesNotMatch(source, /document|console|posthog|analytics/i)
  assert.doesNotMatch(source, /innerHTML|textContent|appendChild/i)
})
