import { expect, test } from '../support/network-fixture.mjs'
import { readRecoveryRecord } from '../support/profile-recovery-fixture.mjs'
const recoveryKey = 'edenia_v1_internal_test_2'

async function open(page, route = '/?internal_test=2') {
  await page.route('**/config.local.js*', request => request.fulfill({
    body: 'window.EDENIA_CONFIG = { indexedDbProfileEnabled: false, indexedDbBackupsEnabled: false, accountFeaturesRollout: "off", learnerProfileLifecycleEnabled: false }',
    contentType: 'application/javascript'
  }))
  await page.goto(route)
  await expect.poll(() => page.evaluate(() => applicationStarted && stateBackupStorageReady)).toBe(true)
}

for (const route of ['/', '/?internal_test=2']) {
  test(`real Web Storage quota reclaims only replaceable search metadata on ${route}`, async ({ page }) => {
    await open(page, route)
    const key = route === '/' ? 'edenia_v1' : recoveryKey
    const result = await page.evaluate(async key => {
      const cacheKey = `${key}_youtube_channel_search_cache_v1`
      const state = loadState()
      state.anki['2026-10-15'] = { reviewed: 1, created: 0 }
      if (!await saveState(state, { backup: false })) throw new Error('Baseline save failed')
      // Fill the browser's actual localStorage pool, without mocking quota.
      let cached = ''
      for (let step = 256 * 1024; step >= 1; step = Math.floor(step / 2)) {
        while (true) {
          try { localStorage.setItem(cacheKey, cached + 'x'.repeat(step)); cached += 'x'.repeat(step) }
          catch (error) { if (error.name !== 'QuotaExceededError') throw error; break }
        }
      }
      const edit = loadState()
      edit.anki['2026-10-15'].reviewed = 12345
      const saved = await saveState(edit, { backup: false })
      return { saved, active: profileRecoveryWorkspace.isActive(), cache: localStorage.getItem(cacheKey),
        reviewed: JSON.parse(localStorage.getItem(key)).anki['2026-10-15'].reviewed }
    }, key)
    expect(result).toEqual({ saved: true, active: false, cache: null, reviewed: 12345 })
    await page.reload()
    await expect.poll(() => page.evaluate(() => applicationStarted && stateBackupStorageReady)).toBe(true)
    expect(await page.evaluate(() => loadState().anki['2026-10-15'].reviewed)).toBe(12345)
  })
}

for (const denySession of [false, true]) {
  test(`quota recovery survives reload and closing the tab with session storage ${denySession ? 'full' : 'available'}`, async ({ page, context }) => {
    await open(page)
    await page.evaluate(async () => {
      const state = loadState()
      state.anki['2026-10-15'] = { reviewed: 1, created: 0 }
      if (!await saveState(state, { backup: false })) throw new Error('Baseline save failed')
    })
    const outcome = await page.evaluate(async ({ denySession, key }) => {
      const set = Storage.prototype.setItem
      Storage.prototype.setItem = function (name, value) {
        if (name.startsWith(key) && (this === localStorage || denySession)) throw new DOMException('Fixture quota', 'QuotaExceededError')
        return set.call(this, name, value)
      }
      const edit = loadState()
      edit.anki['2026-10-15'].reviewed = 7
      edit.config.weeklyGoalHours = 8
      const saved = await saveState(edit, { backup: false })
      return { saved, tier: profileRecoveryWorkspace.getTier() }
    }, { denySession, key: recoveryKey })
    expect(outcome).toEqual({ saved: true, tier: 'indexed-db' })
    const record = await readRecoveryRecord(page, 'edenia_v1_internal_test_2')
    expect(JSON.parse(record.values.edenia_v1_internal_test_2).anki['2026-10-15'].reviewed).toBe(7)
    await page.reload()
    await expect.poll(() => page.evaluate(() => applicationStarted && stateBackupStorageReady)).toBe(true)
    expect(await page.evaluate(() => loadState().anki['2026-10-15'].reviewed)).toBe(7)
    await page.close()
    const reopened = await context.newPage()
    await open(reopened)
    expect(await reopened.evaluate(() => loadState().anki['2026-10-15'].reviewed)).toBe(7)
    expect(await reopened.evaluate(() => loadState().config.weeklyGoalHours)).toBe(8)
  })
}

test('exhausted durable stores reject acknowledgement, retain memory edits and persist them when storage returns', async ({ page, context }) => {
  await open(page)
  await page.evaluate(async () => {
    const state = loadState()
    state.anki['2026-10-15'] = { reviewed: 1, created: 0 }
    if (!await saveState(state, { backup: false })) throw new Error('Baseline save failed')
  })
  const outcome = await page.evaluate(async key => {
    const set = Storage.prototype.setItem
    const put = IDBObjectStore.prototype.put
    window.denyQuotaWrites = true
    Storage.prototype.setItem = function (name, value) {
      if (window.denyQuotaWrites && name.startsWith(key)) throw new DOMException('Fixture quota', 'QuotaExceededError')
      return set.call(this, name, value)
    }
    IDBObjectStore.prototype.put = function (...args) {
      if (window.denyQuotaWrites && ['heads', 'profiles'].includes(this.name)) throw new DOMException('Fixture quota', 'QuotaExceededError')
      return put.apply(this, args)
    }
    const edit = loadState()
    edit.anki['2026-10-15'].reviewed = 7
    const saved = await saveState(edit, { backup: false })
    return { saved, tier: profileRecoveryWorkspace.getTier(), reviewed: loadState().anki['2026-10-15'].reviewed }
  }, recoveryKey)
  expect(outcome).toEqual({ saved: false, tier: 'memory', reviewed: 7 })
  await expect(page.getByText('Could not save this change. Your existing progress was not changed.', { exact: true })).toBeVisible()
  expect(await page.evaluate(async () => {
    window.denyQuotaWrites = false
    return saveState(loadState(), { backup: false })
  })).toBe(true)
  await page.close()
  const reopened = await context.newPage()
  await open(reopened)
  expect(await reopened.evaluate(() => loadState().anki['2026-10-15'].reviewed)).toBe(7)
})
