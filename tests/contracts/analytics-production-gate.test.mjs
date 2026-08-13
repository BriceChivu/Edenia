import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import vm from 'node:vm'

const html = await readFile(new URL('../../index.html', import.meta.url), 'utf8')
const analyticsBootstrap = [...html.matchAll(/<script>\s*([\s\S]*?)<\/script>/g)]
  .map(match => match[1])
  .find(source => source.includes('window.EDENIA_ANALYTICS_ENABLED'))

function runAnalyticsBootstrap(href, { escrowedOutcome } = {}) {
  const insertedScripts = []
  const firstScript = {
    parentNode: {
      insertBefore(script) {
        insertedScripts.push(script)
      }
    }
  }
  const context = {
    URLSearchParams,
    document: {
      createElement() {
        return {}
      },
      getElementsByTagName() {
        return [firstScript]
      }
    },
    location: new URL(href)
  }
  context.window = context
  if (escrowedOutcome !== undefined) {
    context.EDENIA_LEGACY_PROGRESS_FRAGMENT = escrowedOutcome
  }

  vm.runInNewContext(analyticsBootstrap, context, { timeout: 1000 })
  return {
    enabled: context.EDENIA_ANALYTICS_ENABLED,
    insertedScripts
  }
}

test('PostHog initializes only on the canonical application root', () => {
  for (const href of [
    'https://www.edenia.study/',
    'https://www.edenia.study/?internal_test=1'
  ]) {
    const result = runAnalyticsBootstrap(href)
    assert.equal(result.enabled, true, href)
    assert.equal(result.insertedScripts.length, 1, href)
  }

  for (const href of [
    'https://edenia.study/',
    'https://www.edenia.study/plus/',
    'https://www.edenia.study/?sandbox=1',
    'https://bricechivu.github.io/Edenia/',
    'https://bricechivu.github.io/edenia-migrate/',
    'http://localhost:8000/'
  ]) {
    const result = runAnalyticsBootstrap(href)
    assert.equal(result.enabled, false, href)
    assert.equal(result.insertedScripts.length, 0, href)
  }
})

test('an escrowed migration outcome suppresses analytics for the whole page load', () => {
  for (const escrowedOutcome of [
    `transfer.${'A'.repeat(43)}`,
    'none',
    'deferred'
  ]) {
    const result = runAnalyticsBootstrap('https://www.edenia.study/', {
      escrowedOutcome
    })
    assert.equal(result.enabled, false, escrowedOutcome)
    assert.equal(result.insertedScripts.length, 0, escrowedOutcome)
  }

  assert.match(
    analyticsBootstrap,
    /hasOwnProperty\.call\(\s*window,\s*'EDENIA_LEGACY_PROGRESS_FRAGMENT'/
  )
  assert.doesNotMatch(
    analyticsBootstrap,
    /window\.EDENIA_LEGACY_PROGRESS_FRAGMENT|\[\s*['"]EDENIA_LEGACY_PROGRESS_FRAGMENT/
  )
})
