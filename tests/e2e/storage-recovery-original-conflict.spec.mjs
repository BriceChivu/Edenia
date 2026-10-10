import { expect, test } from '../support/network-fixture.mjs'
const key = 'edenia_v1_internal_test_2'
const databaseName = `${key}_profiles_indexed_db_v1`
async function open(page, config = {}) {
  await page.route('**/config.local.js*', route => route.fulfill({
    body: `window.EDENIA_CONFIG = ${JSON.stringify({
      indexedDbProfileEnabled: true, accountFeaturesRollout: 'off',
      learnerProfileLifecycleEnabled: false, ...config
    })}`, contentType: 'application/javascript'
  }))
  await page.goto('/?internal_test=2')
  await expect(page.getByRole('button', { name: 'Continue', exact: true })).toBeVisible()
}
for (const conflict of [true]) {
  test('changed saved progress refreshes a pending conflict instead of trapping repeated choices', async ({ page }, testInfo) => {
    await open(page)
    await page.evaluate(() => {
      const put = IDBObjectStore.prototype.put
      window.blockProfileWrites = true
      IDBObjectStore.prototype.put = function (...args) {
        if (this.name === 'profiles' && window.blockProfileWrites) throw new DOMException('Fixture write denied', 'QuotaExceededError')
        return put.apply(this, args)
      }
    })
    await page.getByRole('button', { name: 'Continue', exact: true }).click()
    await expect(page.getByRole('heading', { name: 'What language are you learning?', exact: true })).toBeVisible()
    await page.evaluate(async ({ databaseName, conflict }) => {
      const state = loadState()
      state.anki['2026-10-10'] = { reviewed: 7, created: 0 }
      await saveState(state)
      window.blockProfileWrites = false
      const request = indexedDB.open(databaseName, 1)
      await new Promise((resolve, reject) => {
        request.onerror = () => reject(request.error)
        request.onsuccess = () => {
          const db = request.result
          const tx = db.transaction('profiles','readwrite')
          const store = tx.objectStore('profiles')
          const read = store.get('active')
          read.onsuccess = () => {
            const head = read.result
            const state = JSON.parse(head.raw)
            if (conflict) state.anki['2026-10-10'] = { reviewed: 9, created: 0 }
            else state.config.theme = 'dark'
            store.put({ ...head, revision: head.revision + 1, raw: JSON.stringify(state) })
          }
          tx.oncomplete = () => { db.close(); resolve() }
          tx.onabort = () => reject(tx.error)
        }
      })
      window.dispatchEvent(new Event('focus'))
    }, { databaseName, conflict })
    const dialog = page.locator('#localProgressConflict')
    if (conflict) {
      await expect(dialog).toBeVisible()
      await expect(dialog).toContainText('Both copies will be kept')
      await expect(dialog).toContainText('Recent progress')
      await expect(dialog).toContainText('Saved progress')
      await expect(dialog).not.toContainText('Cloud')
      await page.evaluate(async databaseName => {
        const request = indexedDB.open(databaseName, 1)
        await new Promise((resolve, reject) => {
          request.onerror = () => reject(request.error)
          request.onsuccess = () => {
            const db = request.result
            const tx = db.transaction('profiles', 'readwrite')
            const store = tx.objectStore('profiles')
            const read = store.get('active')
            read.onsuccess = () => {
              const head = read.result
              const changed = JSON.parse(head.raw)
              changed.anki['2026-10-10'].reviewed = 12
              store.put({ ...head, revision: head.revision + 1, raw: JSON.stringify(changed) })
            }
            tx.oncomplete = () => { db.close(); resolve() }
            tx.onabort = () => reject(tx.error)
          }
        })
      }, databaseName)
      await dialog.getByRole('button', { name: 'Use recent progress', exact: true }).click()
      await page.evaluate(() => window.dispatchEvent(new Event('focus')))
      await expect.poll(() => page.evaluate(() => recoveryReconciliationPending)).toBe(false)
      await dialog.getByRole('button', { name: 'Confirm this choice', exact: true }).click()
      if (await dialog.isVisible()) {
        await dialog.getByRole('button', { name: 'Use recent progress', exact: true }).click()
        await dialog.getByRole('button', { name: 'Confirm this choice', exact: true }).click()
      }
      await expect(dialog).toBeHidden()
    } else await expect(dialog).toHaveCount(0)
    await expect.poll(() => page.evaluate(key => JSON.parse(localStorage.getItem(`${key}_recovery_workspace_v1`)).status, key)).toBe('archived')
    expect(await page.evaluate(() => loadState().anki['2026-10-10'].reviewed)).toBe(7)
    const protectedCounts = await page.evaluate(key => JSON.parse(localStorage.getItem(`${key}_recovery_workspace_v1`)).protectedOriginalProfiles.map(raw => JSON.parse(raw).anki['2026-10-10'].reviewed), key)
    expect(protectedCounts).toContain(9)
    if (!conflict) expect(await page.evaluate(() => loadState().config.theme)).toBe('dark')
  })
}

