import { test, expect } from '@playwright/test'
import { readFile } from 'node:fs/promises'
import { runOpeningCase } from '../../scripts/hosted-profile-opening-smoke.mjs'

const fixture = JSON.parse(await readFile(new URL('../fixtures/learner-profile/profile-ready-smoke.json', import.meta.url), 'utf8'))
const providerOrigin = 'https://profile-access-test.supabase.co'
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
