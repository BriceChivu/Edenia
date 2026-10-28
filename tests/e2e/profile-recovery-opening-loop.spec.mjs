import { readFile } from 'node:fs/promises'
import { expect, test } from '../support/network-fixture.mjs'
import { createPortableLearnerProfileEnvelope } from '../../src/state/portable-learner-profile.js'

const fixture = JSON.parse(await readFile(new URL('../fixtures/learner-profile/profile-ready-trial-smoke.json', import.meta.url), 'utf8'))
const key = 'edenia_v1_auth_trial_v1'
const primary = `${key}_profiles_indexed_db_v1`
const origin = 'https://profile-recovery-opening.supabase.co'
const ownerId = fixture.session.user.id
const profileId = fixture.resolution.profile_id

test('a committed recovery metadata write does not reopen a usable signed-in profile before its acknowledgement', async ({ page }, testInfo) => {
  test.skip(!['desktop-standard', 'phone-standard'].includes(testInfo.project.name))
  test.setTimeout(60000)
  const profile = structuredClone(fixture.resolution.envelope.profile)
  profile.config.ankiEnabled = false
  const { envelope } = await createPortableLearnerProfileEnvelope(profile)
  const openings = []
  let raceStarted = false
  await page.route('**/config.local.js*', route => route.fulfill({ contentType: 'text/javascript',
    body: `window.EDENIA_CONFIG=${JSON.stringify({ authTrialEnabled: true,
      accountFeaturesRollout: 'off', indexedDbProfileEnabled: true,
      indexedDbBackupsEnabled: false, tinySwordsEnabled: false,
      googleSignInMode: 'off', supabaseUrl: origin, supabasePublishableKey: 'synthetic-key', youtubeApiKey: '' })}` }))
  await page.route(`${origin}/**`, async route => {
    const path = new URL(route.request().url()).pathname
    if (path === '/auth/v1/user') return route.fulfill({ json: fixture.session.user })
    if (path === '/auth/v1/token') return route.fulfill({ json: fixture.session })
    if (path.endsWith('/open_my_learner_profile') || path.endsWith('/resolve_my_learner_profile')) {
      openings.push(path)
      if (raceStarted) await new Promise(resolve => setTimeout(resolve, 2100))
      return route.fulfill({ json: [{ ...fixture.resolution, envelope, reset_state: { status: 'none' } }] })
    }
    if (path === '/rest/v1/learner_profile_heads') return route.fulfill({ json: {
      user_id: ownerId, profile_id: profileId, generation: 1, revision: fixture.resolution.revision } })
    if (path.endsWith('/read_my_latest_learner_profile_reset')) return route.fulfill({ json: [{ status: 'none' }] })
    return route.fulfill({ json: [] })
  })
  await page.addInitScript(({ key, primary, profile, session, ownerId, profileId, revision }) => {
    if (!localStorage.getItem(`${key}_plus_auth_v1`)) {
      localStorage.setItem(key, JSON.stringify(profile))
      localStorage.setItem(`${key}_plus_auth_v1`, JSON.stringify(session))
      localStorage.setItem(`${key}_learner_profile_access_v1`, JSON.stringify({ version: 1,
        ownerId, profileId, generation: 1, revision, activatedAt: Date.now(), activationId: null }))
      localStorage.setItem(`${key}_learner_profile_sync_v1`, JSON.stringify({ version: 1,
        ownerId, profileId, generation: 1, acceptedRevision: revision, pending: null, queued: null }))
    }
    const setItem = Storage.prototype.setItem
    Storage.prototype.setItem = function (name, value) {
      if (sessionStorage.getItem('fixture-primary-unavailable') === '1'
        && name === `${key}_recovery_workspace_v1`) {
        throw new DOMException('Synthetic Web Storage quota', 'QuotaExceededError')
      }
      return setItem.call(this, name, value)
    }
    const setTimer = window.setTimeout
    window.setTimeout = function (callback, delay, ...args) {
      return setTimer.call(this, callback, delay === 8000 ? 150 : delay, ...args)
    }
    const transaction = IDBDatabase.prototype.transaction
    IDBDatabase.prototype.transaction = function (...args) {
      const tx = transaction.apply(this, args)
      if (this.name === primary && sessionStorage.getItem('fixture-primary-unavailable') === '1') {
        const store = tx.objectStore('profiles')
        const keepAlive = () => { try { store.get('fixture-pending').onsuccess = keepAlive } catch {} }
        keepAlive()
      }
      if (this.name === 'edenia_profile_recovery_v1' && args[1] === 'readonly'
        && window.fixtureHoldJournalReadback === true) {
        const completion = Object.getOwnPropertyDescriptor(IDBTransaction.prototype, 'oncomplete')
        window.fixtureHoldJournalReadback = false
        Object.defineProperty(tx, 'oncomplete', {
          configurable: true,
          get() { return completion.get.call(this) },
          set(callback) {
            completion.set.call(this, function (event) {
              window.fixtureJournalReadbackWaiting = true
              window.fixtureReleaseJournalReadback = () => {
                window.fixtureJournalReadbackWaiting = false
                callback.call(this, event)
              }
            })
          }
        })
      }
      return tx
    }
  }, { key, primary, profile, session: fixture.session, ownerId, profileId, revision: fixture.resolution.revision })
  await page.goto('/?internal_test=1')
  await expect(page.locator('html')).toHaveAttribute('data-learner-profile-access-state', 'active')
  await expect(page.locator('#mainApp')).toBeVisible()
  const saved = await page.evaluate(async () => {
    sessionStorage.setItem('fixture-primary-unavailable', '1')
    const state = loadState()
    return { saved: await saveState(state, { backup: false, syncCloud: false, syncAnalytics: false }),
      recovery: profileRecoveryWorkspace.isActive(), tier: profileRecoveryWorkspace.getTier() }
  })
  expect(saved).toEqual({ saved: true, recovery: true, tier: 'indexed-db' })
  await page.reload()
  await expect(page.locator('html')).toHaveAttribute('data-learner-profile-access-state', 'active')
  await expect(page.locator('#mainApp')).toBeVisible()
  expect(await page.evaluate(() => profileRecoveryWorkspace.isActive())).toBe(true)
  const completedOpenings = openings.length
  raceStarted = true
  await page.evaluate(() => {
    const notice = document.getElementById('learnerProfileOpeningNotice')
    window.fixtureOpeningExposures = 0
    new MutationObserver(() => {
      if (!notice.classList.contains('hidden') && !notice.classList.contains('sr-only')
        && document.getElementById('learnerProfileOpeningStatus').textContent === 'Getting your progress ready…') {
        window.fixtureOpeningExposures++
      }
    }).observe(notice, { attributes: true, childList: true, subtree: true })
  })
  for (let attempt = 0; attempt < 2; attempt++) {
    await page.evaluate(() => {
      window.fixtureHoldJournalReadback = true
      profileBrowserStorage.setItem(LEARNER_PROFILE_SYNC_KEY, profileBrowserStorage.getItem(LEARNER_PROFILE_SYNC_KEY))
      window.fixtureJournalSave = profileBrowserStorage.flush()
    })
    await page.waitForFunction(() => window.fixtureJournalReadbackWaiting === true)
    await page.evaluate(() => { window.fixtureReconciliation = reconcileBackgroundProfileRecovery() })
    // Keep the committed write unacknowledged long enough for reconciliation
    // to observe it. A correct implementation may instead await the writer.
    await page.waitForTimeout(250)
    await page.evaluate(async () => {
      window.fixtureReleaseJournalReadback()
      await window.fixtureJournalSave
      await window.fixtureReconciliation
    })
    await expect(page.locator('html')).toHaveAttribute('data-learner-profile-access-state', 'active')
  }
  const diagnostics = await page.evaluate(() => ({
    profile: window.edeniaProfileOpeningDiagnostics.read(),
    status: document.documentElement.dataset.learnerProfileAccessState,
    recovery: profileRecoveryWorkspace.isActive(),
    openingExposures: window.fixtureOpeningExposures,
    openingVisible: !document.getElementById('learnerProfileOpeningNotice').classList.contains('hidden')
      && !document.getElementById('learnerProfileOpeningNotice').classList.contains('sr-only')
  }))
  await testInfo.attach('profile-opening-diagnostics', { body: JSON.stringify({ openings, diagnostics }, null, 2), contentType: 'application/json' })
  expect(openings.length, 'primary recovery attempts must not reopen an already usable signed-in profile').toBe(completedOpenings)
  expect(diagnostics.status).toBe('active')
  expect(diagnostics.openingExposures, 'Getting your progress ready must not flash again after opening completes').toBe(0)
  expect(diagnostics.openingVisible).toBe(false)
})
