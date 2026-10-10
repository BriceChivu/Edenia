import { expect, test } from '../support/network-fixture.mjs'
import { readRecoveryRecord } from '../support/profile-recovery-fixture.mjs'
const key = 'edenia_v1_internal_test_2'

async function open(page) {
  await page.route('**/config.local.js*', route => route.fulfill({ body: 'window.EDENIA_CONFIG = { indexedDbProfileEnabled: true, accountFeaturesRollout: "off", learnerProfileLifecycleEnabled: false }', contentType: 'application/javascript' }))
  await page.goto('/?internal_test=2')
}
async function recover(page, context) {
  await open(page)
  await page.getByRole('button', { name: 'Continue', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'What language are you learning?', exact: true })).toBeVisible()
  await page.evaluate(async () => {
    const state = loadState()
    state.anki['2026-10-10'] = { reviewed: 1, created: 0 }
    await saveState(state, { backup: false })
  })
  const blockPrimary = () => {
    const set = Storage.prototype.setItem
    Storage.prototype.setItem = function (name, value) {
      if (name.startsWith('edenia_v1_internal_test_2')) throw new DOMException('Fixture', 'QuotaExceededError')
      return set.call(this, name, value)
    }
    const put = IDBObjectStore.prototype.put
    IDBObjectStore.prototype.put = function (...args) {
      if (this.name === 'profiles') throw new DOMException('Fixture', 'SecurityError')
      return put.apply(this, args)
    }
  }
  await context.addInitScript(blockPrimary)
  await page.evaluate(blockPrimary)
  await page.evaluate(async () => {
    const state = loadState()
    state.anki['2026-10-10'].reviewed = 7
    await saveState(state)
  })
  expect(await page.evaluate(() => profileRecoveryWorkspace.getTier())).toBe('indexed-db')
  const other = await context.newPage()
  await open(other)
  await expect(other.getByRole('heading', { name: 'What language are you learning?', exact: true })).toBeVisible()
  await page.evaluate(() => { window.staleRecoveryEdit = loadState() })
  await other.evaluate(() => { window.staleRecoveryEdit = loadState() })
  return other
}

test('healthy recovery IndexedDB merges stale independent tab edits while primary stores remain unavailable', async ({ page, context }) => {
  const other = await recover(page, context)
  await page.evaluate(async () => {
    window.staleRecoveryEdit.config.theme = 'dark'
    await saveState(window.staleRecoveryEdit)
  })
  await other.evaluate(async () => {
    window.staleRecoveryEdit.anki['2026-10-10'].reviewed = 9
    await saveState(window.staleRecoveryEdit)
  })
  await expect.poll(() => page.evaluate(() => loadState().anki['2026-10-10'].reviewed)).toBe(9)
  expect(await page.evaluate(() => loadState().config.theme)).toBe('dark')
  await expect(page.locator('#localProgressConflict')).toBeHidden()
  await other.reload()
  await expect(other.getByRole('heading', { name: 'What language are you learning?', exact: true })).toBeVisible()
  expect(await other.evaluate(() => loadState().anki['2026-10-10'].reviewed)).toBe(9)
  expect(await other.evaluate(() => loadState().config.theme)).toBe('dark')
})

for (const chooseSaved of [false, true]) test(`healthy recovery IndexedDB retains both competing tab edits after choosing ${chooseSaved ? 'saved' : 'recent'} and reloading`, async ({ page, context }) => {
  const other = await recover(page, context)
  await page.evaluate(async () => {
    window.staleRecoveryEdit.anki['2026-10-10'].reviewed = 8
    await saveState(window.staleRecoveryEdit)
  })
  await other.evaluate(async () => {
    window.staleRecoveryEdit.anki['2026-10-10'].reviewed = 9
    await saveState(window.staleRecoveryEdit)
  })
  const dialog = other.locator('#localProgressConflict')
  await expect(dialog).toBeVisible()
  await dialog.getByRole('button', { name: chooseSaved ? 'Use saved progress' : 'Use recent progress', exact: true }).click()
  await other.evaluate(async key => {
    profileBrowserStorage.setItem(`${key}_storage_probe`, 'bookkeeping')
    await profileRecoveryWorkspace.flush()
  }, key)
  await expect(dialog.getByRole('button', { name: 'Confirm this choice', exact: true })).toBeVisible()
  await dialog.getByRole('button', { name: 'Confirm this choice', exact: true }).click()
  await expect(dialog).toBeHidden()
  const expected = chooseSaved ? 8 : 9
  expect(await other.evaluate(() => loadState().anki['2026-10-10'].reviewed)).toBe(expected)
  const record = await readRecoveryRecord(other, key)
  expect(JSON.parse(record.unchosenProfile).anki['2026-10-10'].reviewed).toBe(chooseSaved ? 9 : 8)
  await other.reload()
  await expect(other.getByRole('heading', { name: 'What language are you learning?', exact: true })).toBeVisible()
  expect(await other.evaluate(() => loadState().anki['2026-10-10'].reviewed)).toBe(expected)
  await expect(other.locator('#localProgressConflict')).toBeHidden()
})
