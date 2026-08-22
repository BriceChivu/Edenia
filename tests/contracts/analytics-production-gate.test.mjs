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
    URL,
    URLSearchParams,
    document: {
      createElement() {
        return {}
      },
      getElementsByTagName() {
        return [firstScript]
      }
    },
    history: {
      state: null,
      replaceState(state, _title, nextUrl) {
        this.state = state
        context.location = new URL(nextUrl, context.location)
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
    browserUrl: context.location.href,
    config: context.posthog?._i?.[0]?.[1],
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

test('production analytics masks inputs and redacts secret URL values', () => {
  const result = runAnalyticsBootstrap(
    'https://www.edenia.study/?utm_source=welcome&access_token=query-secret'
      + '&accessToken=camel-query-secret'
      + '#section=account&refresh_token=fragment-secret'
  )

  assert.equal(result.config.session_recording.maskAllInputs, true)
  assert.equal(result.config.disable_capture_url_hashes, true)

  const currentUrl = new URL(result.config.get_current_url())
  assert.equal(currentUrl.searchParams.get('utm_source'), 'welcome')
  assert.equal(currentUrl.searchParams.get('access_token'), '[REDACTED]')
  assert.equal(currentUrl.searchParams.get('accessToken'), '[REDACTED]')
  const fragment = new URLSearchParams(currentUrl.hash.slice(1))
  assert.equal(fragment.get('section'), 'account')
  assert.equal(fragment.get('refresh_token'), '[REDACTED]')

  const browserUrl = new URL(result.browserUrl)
  assert.equal(browserUrl.searchParams.get('access_token'), '[REDACTED]')
  assert.equal(
    new URLSearchParams(browserUrl.hash.slice(1)).get('refresh_token'),
    '[REDACTED]'
  )

  const properties = result.config.sanitize_properties({
    $current_url: 'https://www.edenia.study/?code=private-code&account=1',
    $referrer: 'https://example.com/source?credential=private-credential',
    video_url: 'https://www.youtube.com/watch?v=public-video-id',
    token: 'posthog-project-token'
  })
  assert.equal(
    new URL(properties.$current_url).searchParams.get('code'),
    '[REDACTED]'
  )
  assert.equal(
    new URL(properties.$referrer).searchParams.get('credential'),
    '[REDACTED]'
  )
  assert.equal(
    new URL(properties.video_url).searchParams.get('v'),
    'public-video-id'
  )
  assert.equal(properties.token, 'posthog-project-token')
})
