import { expect, test } from '../support/network-fixture.mjs'
const key = 'edenia_v1_internal_test_2'
const databaseName = `${key}_profiles_indexed_db_v1`
async function open(page) {
  await page.route('**/config.local.js*', route => route.fulfill({
    body: `window.EDENIA_CONFIG = ${JSON.stringify({
      indexedDbProfileEnabled: true, accountFeaturesRollout: 'off',
      learnerProfileLifecycleEnabled: false
    })}`, contentType: 'application/javascript'
  }))
  await page.goto('/?internal_test=2')
  await expect(page.getByRole('button', { name: 'Continue', exact: true })).toBeVisible()
}
for (const kind of ['missing', 'invalid']) {
  test(`${kind} saved progress offers error details instead of an ineffective retry`, async ({ page }, testInfo) => {
    await open(page)
    await page.evaluate(async ({ key, databaseName, kind }) => {
      await new Promise((resolve, reject) => {
        const request = indexedDB.open(databaseName, 1)
        request.onerror = () => reject(request.error)
        request.onsuccess = () => {
          const database = request.result
          const transaction = database.transaction('profiles', 'readwrite')
          const store = transaction.objectStore('profiles')
          if (kind === 'invalid') store.put({ key: 'active', revision: 1, raw: '{}' })
          else { store.delete('active'); store.delete('active-body') }
          transaction.oncomplete = () => { database.close(); resolve() }
          transaction.onabort = () => reject(transaction.error)
        }
      })
      localStorage.setItem(`${key}_indexed_db_v1`, '1')
      localStorage.setItem(`${key}_plus_auth_v1`, 'PRIVATE AUTH TOKEN')
    }, { key, databaseName, kind })
    await page.reload()
    const recovery = page.locator('#onboardingPanel.is-recovery')
    await expect(recovery).toBeVisible()
    await expect(recovery.getByRole('button', { name: 'Try again', exact: true })).toHaveCount(0)
    await expect(recovery.getByRole('button', { name: 'Check storage again', exact: true })).toHaveCount(0)
    await expect(recovery).toContainText('Keep this browser’s site data')
    expect(await recovery.evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true)
    await page.screenshot({ path: testInfo.outputPath('recovery.png') })
    // Force clipboard denial: the fallback must still make the safe report usable.
    await page.evaluate(() => {
      Object.defineProperty(navigator, 'clipboard', { value: undefined, configurable: true })
      document.execCommand = () => false
    })
    await recovery.getByRole('button', { name: 'Copy error details', exact: true }).click()
    const details = page.getByRole('textbox', { name: 'Error details', exact: true })
    await expect(details).toBeVisible()
    const report = JSON.parse(await details.inputValue())
    expect(report.code).toBe(kind === 'missing' ? 'profile-missing' : 'profile-invalid')
    expect(JSON.stringify(report)).not.toContain('PRIVATE AUTH TOKEN')
    expect(await page.evaluate(key => localStorage.getItem(`${key}_indexed_db_v1`), key)).toBe('1')
    expect(await page.evaluate(key => localStorage.getItem(`${key}_plus_auth_v1`), key)).toBe('PRIVATE AUTH TOKEN')
    expect(await page.evaluate(({ databaseName }) => new Promise(resolve => {
      const request = indexedDB.open(databaseName, 1)
      request.onsuccess = () => {
        const database = request.result
        const transaction = database.transaction('profiles', 'readonly')
        const read = transaction.objectStore('profiles').get('active')
        transaction.oncomplete = () => { database.close(); resolve(read.result || null) }
      }
    }), { databaseName })).toEqual(kind === 'invalid' ? { key: 'active', revision: 1, raw: '{}' } : null)
  })
}
for (const recover of [true, false]) {
  test(`temporary opening failure checks in place and ${recover ? 'resumes startup' : 'ends repeated retry'}`, async ({ page }) => {
    await open(page)
    await page.addInitScript(databaseName => {
      window.blockProfileOpen = true
      const open = IDBFactory.prototype.open
      IDBFactory.prototype.open = function (name, ...args) {
        if (name === databaseName && window.blockProfileOpen) throw new DOMException('Fixture storage denied', 'SecurityError')
        return open.call(this, name, ...args)
      }
    }, databaseName)
    await page.reload()
    const recovery = page.locator('#onboardingPanel.is-recovery')
    await expect(recovery).toBeVisible()
    let navigations = 0
    page.on('framenavigated', frame => { if (frame === page.mainFrame()) navigations++ })
    if (recover) await page.evaluate(() => { window.blockProfileOpen = false })
    await recovery.getByRole('button', { name: 'Check storage again', exact: true }).click()
    if (recover) {
      await expect(page.getByRole('button', { name: 'Continue', exact: true })).toBeVisible()
      await expect(recovery).toBeHidden()
    } else {
      await expect(recovery.getByRole('button', { name: 'Check storage again', exact: true })).toHaveCount(0)
      await expect(recovery.getByRole('button', { name: 'Copy error details', exact: true })).toBeVisible()
      await expect(recovery).toContainText('Storage is still unavailable')
    }
    expect(navigations).toBe(0)
  })
}

test('an unavailable backup bank does not hijack recovery from a later onboarding save failure', async ({ page }) => {
  await open(page)
  await page.evaluate(key => localStorage.setItem(`${key}_backups_indexed_db_v1`, '1'), key)
  await page.addInitScript(() => {
    const open = IDBFactory.prototype.open
    IDBFactory.prototype.open = function (name, ...args) {
      if (name === 'edenia_state_backups_v1_internal_test_2') throw new DOMException('Fixture backup denied', 'SecurityError')
      return open.call(this, name, ...args)
    }
  })
  await page.reload()
  await expect(page.getByRole('button', { name: 'Continue', exact: true })).toBeVisible()
  await page.evaluate(() => {
    const put = IDBObjectStore.prototype.put
    window.blockProfileWrites = true
    IDBObjectStore.prototype.put = function (...args) {
      if (this.name === 'profiles' && window.blockProfileWrites) throw new DOMException('Fixture write denied', 'QuotaExceededError')
      return put.apply(this, args)
    }
  })
  await page.getByRole('button', { name: 'Continue', exact: true }).click()
  const recovery = page.locator('#onboardingPanel.is-recovery')
  await expect(recovery).toBeVisible()
  await page.evaluate(() => { window.blockProfileWrites = false })
  await recovery.getByRole('button', { name: 'Check storage again', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'What language are you learning?', exact: true })).toBeVisible()
  await expect(recovery).toBeHidden()
})
