import { test, expect } from '@playwright/test'
import { readFile } from 'node:fs/promises'
import { runOpeningCase, prepareOpeningAuthentication, OPENING_URL } from '../../scripts/hosted-profile-opening-smoke.mjs'

const fixture = JSON.parse(await readFile(new URL('../fixtures/learner-profile/profile-ready-smoke.json', import.meta.url), 'utf8'))
const providerOrigin = 'https://profile-access-test.supabase.co'
test('authentication becomes ready while a nonessential subresource remains pending', async ({ browser }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-standard')
  let ready = false, imageRequested = false, externalRequests = 0, releaseImage
  const pendingImage = new Promise(resolve => { releaseImage = resolve })
  const owner = '11111111-1111-1111-1111-111111111111'
  const isolatedBrowser = { newContext: async options => {
    const context = await browser.newContext(options)
    context.setDefaultNavigationTimeout(1500)
    await context.addInitScript(({ owner }) => {
      if (location.href === 'https://www.edenia.study/?internal_test=1') {
        localStorage.setItem('edenia_v1_internal_test_plus_auth_v1', JSON.stringify({ user: { id: owner } }))
      }
    }, { owner })
    // Entire document and subresource are intercepted; no hosted request runs.
    const installRoute = context.route.bind(context)
    context.route = async pattern => installRoute(pattern, async route => {
      const url = route.request().url()
      if (url === OPENING_URL) return route.fulfill({ contentType: 'text/html',
        body: '<!doctype html><html><body><button>Email me a code</button><img src="/synthetic-pending-image.png"></body></html>' })
      if (url === 'https://www.edenia.study/synthetic-pending-image.png') {
        imageRequested = true
        await pendingImage
        return route.abort().catch(() => {})
      }
      externalRequests++
      return route.abort()
    })
    return context
  } }
  try {
    await prepareOpeningAuthentication({ browser: isolatedBrowser, providerOrigin, expectedOwner: owner,
      verifyGateOff: async () => {}, onReady: async () => {
        await expect.poll(() => imageRequested).toBe(true)
        ready = true
      } })
    expect(ready).toBe(true)
    expect(externalRequests).toBe(0)
  } finally { releaseImage() }
})

for (const bookkeeping of ['clean', 'malformed', 'stale', 'retry']) {
  test(`guarded profile opening and reload with ${bookkeeping} bookkeeping`, async ({ browser, baseURL }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop-standard')
    const result = await runOpeningCase({ browser, applicationOrigin: new URL(baseURL).origin,
      providerOrigin, synthetic: fixture, bookkeeping, testRuntime: {
        accountFeaturesRollout: 'internal', learnerProfileLifecycleEnabled: true,
        supabasePublishableKey: 'synthetic-key', supabaseUrl: providerOrigin,
        freePlusEnabled: false, indexedDbBackupCleanupEnabled: false,
        indexedDbBackupsEnabled: false, plusCheckoutEnabled: false, studyGuidanceEnabled: false
      } })
    expect(result, JSON.stringify(result)).toMatchObject({ complete: true, cleanup: true, synthetic: true })
    expect(result.phases).toHaveLength(bookkeeping === 'retry' ? 3 : 2)
    for (const phase of result.phases) expect(phase).toMatchObject({ complete: true, resolve: 1, unauthorized: 0 })
  })
}
