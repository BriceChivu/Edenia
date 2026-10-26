import { expect, test } from '../support/network-fixture.mjs'

const profileDatabase = 'edenia_v1_internal_test_2_profiles_indexed_db_v1'

test('a returning profile paints before its nonessential maintenance transaction completes', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-standard')
  await page.route('**/config.local.js', route => route.fulfill({
    body: 'window.EDENIA_CONFIG = { indexedDbProfileEnabled: true, accountFeaturesRollout: "off", learnerProfileLifecycleEnabled: false }',
    contentType: 'application/javascript'
  }))
  await page.goto('/?internal_test=2')
  await expect.poll(() => page.evaluate(() => applicationStarted && stateBackupStorageReady)).toBe(true)
  await page.evaluate(async () => {
    const state = loadState()
    state.config.channels = []
    state.config.ankiEnabled = false
    state.config.ankiDisabledAt = new Date().toISOString()
    state.onboarding.setupCompleted = true
    state.onboarding.introSeenAt = new Date().toISOString()
    state.onboarding.walkthroughCompleted = true
    state.anki['2026-10-20'] = { reviewed: 7, created: 0 }
    if (!await saveState(state, { backup: false })) throw new Error('Fixture save failed')
  })
  await page.addInitScript(({ profileDatabase }) => {
    window.heldOpeningMaintenanceWrites = 0
    let holding = true
    window.releaseOpeningMaintenance = () => { holding = false }
    const transaction = IDBDatabase.prototype.transaction
    IDBDatabase.prototype.transaction = function (...args) {
      const tx = transaction.apply(this, args)
      let started = false
      try { started = applicationStarted } catch {}
      if (this.name === profileDatabase && args[1] === 'readwrite' && started && holding) {
        window.heldOpeningMaintenanceWrites++
        const store = tx.objectStore('profiles')
        const keepAlive = () => {
          if (!holding) return
          try { store.get('fixture-opening-maintenance-hold').onsuccess = keepAlive } catch {}
        }
        keepAlive()
      }
      return tx
    }
  }, { profileDatabase })
  await page.reload()
  await expect(page.locator('#mainApp')).not.toHaveClass(/\bhidden\b/)
  await expect.poll(() => page.evaluate(() => heldOpeningMaintenanceWrites)).toBeGreaterThan(0)
  expect(await page.evaluate(() => loadState().anki['2026-10-20'].reviewed)).toBe(7)
  await page.evaluate(() => releaseOpeningMaintenance())
  await page.reload()
  await expect(page.locator('#mainApp')).not.toHaveClass(/\bhidden\b/)
  expect(await page.evaluate(() => loadState().anki['2026-10-20'].reviewed)).toBe(7)
  await page.evaluate(() => releaseOpeningMaintenance())
})
