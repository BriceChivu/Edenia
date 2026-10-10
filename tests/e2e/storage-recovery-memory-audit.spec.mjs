import { expect, test } from '../support/network-fixture.mjs'
const key = 'edenia_v1_internal_test_2'
async function open(page) {
  await page.route('**/config.local.js*', route => route.fulfill({ body: 'window.EDENIA_CONFIG = { indexedDbProfileEnabled: false, accountFeaturesRollout: "off", learnerProfileLifecycleEnabled: false }', contentType: 'application/javascript' }))
  await page.goto('/?internal_test=2')
  await expect(page.getByRole('button', { name: 'Continue', exact: true })).toBeVisible()
}
test('memory recovery preserves independent peer edits when browser storage returns', async ({ page, context }) => {
  await open(page)
  await page.evaluate(async () => {
    const state = loadState()
    state.anki['2026-10-10'] = { reviewed: 1, created: 0 }
    await saveState(state, { backup: false })
    const set = Storage.prototype.setItem
    window.denyStudyWrites = true
    Storage.prototype.setItem = function (name, value) {
      if (window.denyStudyWrites && name.startsWith('edenia_v1_internal_test_2')) throw new DOMException('Denied', 'SecurityError')
      return set.call(this, name, value)
    }
    const edit = loadState()
    edit.anki['2026-10-10'].reviewed = 7
    await saveState(edit)
  })
  expect(await page.evaluate(() => profileRecoveryWorkspace.getTier())).toBe('memory')
  const other = await context.newPage()
  await open(other)
  await other.evaluate(async key => {
    const set = Storage.prototype.setItem
    Storage.prototype.setItem = function (name, value) {
      if (name === key) throw new DOMException('Full', 'QuotaExceededError')
      return set.call(this, name, value)
    }
    const edit = loadState()
    edit.config.theme = 'dark'
    await saveState(edit)
  }, key)
  expect(await other.evaluate(() => profileRecoveryWorkspace.getTier())).toBe('local')
  await page.evaluate(async () => {
    window.denyStudyWrites = false
    const edit = loadState()
    edit.config.weeklyGoalHours = 8
    await saveState(edit)
  })
  expect(await page.evaluate(() => loadState().config.theme)).toBe('dark')
  expect(await page.evaluate(() => loadState().anki['2026-10-10'].reviewed)).toBe(7)
  await expect.poll(() => other.evaluate(() => loadState().config.theme)).toBe('dark')
  await expect.poll(() => other.evaluate(() => loadState().anki['2026-10-10'].reviewed)).toBe(7)
})
