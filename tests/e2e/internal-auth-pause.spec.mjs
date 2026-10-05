import { expect, test } from '../support/network-fixture.mjs'

const internalKey = 'edenia_v1_internal_test'
async function pauseConfig(page, indexedDbProfileEnabled = false) {
  await page.route('**/config.local.js', route => route.fulfill({
    contentType: 'text/javascript',
    body: `window.EDENIA_CONFIG = { accountFeaturesRollout: "off", learnerProfileLifecycleEnabled: false, indexedDbBackupsEnabled: true, indexedDbProfileEnabled: ${indexedDbProfileEnabled}, supabaseUrl: "https://paused-test.supabase.co", supabasePublishableKey: "test-key" };`
  }))
}
function watchExperimentalRequests(page) {
  const calls = []
  page.on('request', req => {
    if (/supabase|accounts\.google|challenges\.cloudflare|pip-story|images\/pip\//.test(req.url())) calls.push(req.url())
  })
  return calls
}
async function seedTown(page, key) {
  await page.waitForFunction(() => typeof window.defaultState === 'function')
  await page.evaluate(async key => {
    const state = window.defaultState(4, [], 'light', [], 'en')
    const date = '2026-07-20T04:00:00.000Z'
    state.config.ankiEnabled = false
    window.updatePersistentCityLevel(state, 0)
    Object.assign(state.onboarding, { introSeenAt: date, setupCompleted: true, setupCompletedAt: date, walkthroughCompleted: true, walkthroughCompletedAt: date })
    await window.saveState(state, { backup: false, syncAnalytics: false })
    if (key.endsWith('_internal_test')) {
      localStorage.setItem(`${key}_learner_profile_access_v1`, JSON.stringify({
        version: 1, ownerId: null, profileId: `accountless:${key}`,
        activationId: null, activatedAt: 1, legacy: true
      }))
    }
  }, key)
}
for (const internal of [false, true]) {
  test(`${internal ? 'internal' : 'public'} accountless town stays available without experimental traffic`, async ({ page }) => {
    await pauseConfig(page)
    const calls = watchExperimentalRequests(page)
    const key = internal ? internalKey : 'edenia_v1'
    await page.goto(internal ? '/?internal_test=1' : '/')
    await seedTown(page, key)
    const progress = await page.evaluate(key => {
      const { activityLog, cityProgress, videos } = JSON.parse(localStorage.getItem(key))
      return { activityLog, cityProgress, videos }
    }, key)
    await page.reload()
    await expect(page.locator('#mainApp')).toBeVisible()
    await expect(page.locator('#cityMilestoneImage')).toBeVisible()
    await expect(page.locator('.pip-story, #pipStoryStyles, #internalAuthPaused')).toHaveCount(0)
    expect(await page.evaluate(key => {
      const { activityLog, cityProgress, videos } = JSON.parse(localStorage.getItem(key))
      return { activityLog, cityProgress, videos }
    }, key)).toEqual(progress)
    expect(calls).toEqual([])
  })
}
for (const indexedDbProfileEnabled of [false, true]) {
for (const access of ['owned', 'malformed', 'legacy-auth']) {
  test(`retained ${access} internal state stays byte-for-byte preserved and unopened${indexedDbProfileEnabled ? ' with IndexedDB enabled' : ''}`, async ({ page }) => {
    await pauseConfig(page)
    const calls = watchExperimentalRequests(page)
    await page.goto('/?internal_test=1')
    await seedTown(page, internalKey)
    const before = await page.evaluate(({key,access}) => {
      localStorage.setItem(`${key}_backups`, 'retained-backup-fixture')
      if (access === 'legacy-auth') localStorage.setItem(`${key}_plus_auth_v1`, 'retained-session-fixture')
      else localStorage.setItem(`${key}_learner_profile_access_v1`, access === 'owned'
        ? JSON.stringify({version:1,ownerId:'synthetic-owner',profileId:'synthetic-profile',activationId:null,activatedAt:1,generation:1,revision:1}) : '{invalid')
      return Object.fromEntries(Object.entries(localStorage).filter(([k]) => k.startsWith(key)))
    }, {key:internalKey,access})
    await pauseConfig(page, indexedDbProfileEnabled)
    await page.addInitScript(key => {
      const get = Storage.prototype.getItem
      window.retainedProfileReads = 0
      window.retainedDatabaseOpens = 0
      const open = IDBFactory.prototype.open
      IDBFactory.prototype.open = function(...args) {
        window.retainedDatabaseOpens++
        return open.apply(this, args)
      }
      Storage.prototype.getItem = function(k) {
        if (k === key || k === `${key}_backups`) window.retainedProfileReads++
        return get.call(this,k)
      }
    }, internalKey)
    await page.reload()
    await expect(page.locator('#internalAuthPaused')).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Authentication testing is paused' })).toBeVisible()
    await expect(page.locator('#mainApp')).toHaveCount(0)
    expect(await page.evaluate(() => window.retainedProfileReads)).toBe(0)
    expect(await page.evaluate(() => window.retainedDatabaseOpens)).toBe(0)
    expect(await page.evaluate(key => Object.fromEntries(Object.entries(localStorage).filter(([k]) => k.startsWith(key))), internalKey)).toEqual(before)
    expect(calls).toEqual([])
    await page.goto('/')
    await expect(page.locator('#internalAuthPaused')).toHaveCount(0)
  })
}
}
