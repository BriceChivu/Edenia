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
  await page.goto('https://edenia.study/?internal_test=2')
  await expect(page.getByRole('button', { name: 'Continue', exact: true })).toBeVisible()
}
for (const failure of ['indexeddb', 'local-read', 'writes']) for (const chooseSaved of [false, true]) {
  test(`a ${failure} failure during ${chooseSaved ? 'saved' : 'recent'} conflict confirmation continues quietly and reports automatically`, async ({ page }) => {
    const captured = []
    const servedOrigin = `http://localhost:${Number(process.env.EDENIA_TEST_NORMAL_PORT || 8000)}`
    await page.route('https://us.i.posthog.com/capture/', route => {
      const payload = route.request().postDataJSON()
      if (payload.event === 'feedback_submitted') captured.push(payload)
      return route.fulfill({ json: { status: 1 } })
    })
    await page.route('https://edenia.study/**', async route => {
      const url = new URL(route.request().url())
      return route.fulfill({ response: await route.fetch({ url: `${servedOrigin}${url.pathname}${url.search}` }) })
    })
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
    }, { databaseName, conflict: true })
    const dialog = page.locator('#localProgressConflict')
    await expect(dialog).toBeVisible()
    await page.evaluate(({ failure, key, databaseName }) => {
      window.blockConfirmationStorage = true
      if (failure === 'indexeddb') {
        const original = IDBFactory.prototype.open
        IDBFactory.prototype.open = function (name, ...args) {
          if (window.blockConfirmationStorage && name === databaseName) throw new DOMException('PRIVATE fixture error', 'SecurityError')
          return original.call(this, name, ...args)
        }
      } else if (failure === 'writes') {
        const original = Storage.prototype.setItem
        Storage.prototype.setItem = function (name, value) {
          if (window.blockConfirmationStorage && name.startsWith(key)) throw new DOMException('PRIVATE fixture error', 'QuotaExceededError')
          return original.call(this, name, value)
        }
      } else {
        const original = Storage.prototype.getItem
        Storage.prototype.getItem = function (name) {
          if (window.blockConfirmationStorage && this === localStorage && name.startsWith(key)) throw new DOMException('PRIVATE fixture error', 'SecurityError')
          return original.call(this, name)
        }
      }
    }, { failure, key, databaseName })
    await dialog.getByRole('button', { name: chooseSaved ? 'Use saved progress' : 'Use recent progress', exact: true }).click()
    await dialog.getByRole('button', { name: 'Confirm this choice', exact: true }).click()
    await expect(dialog).toBeHidden()
    expect(await page.evaluate(() => loadState().anki['2026-10-10'].reviewed)).toBe(chooseSaved ? 9 : 7)
    await expect.poll(() => captured.some(payload => {
      const report = JSON.parse(payload.properties.feedback_message.split('\n').slice(1).join('\n'))
      return report.operation === (failure === 'writes' ? 'save' : 'reconcile')
        && report.code === (failure === 'writes' ? 'storage-full' : 'storage-denied')
        && (failure !== 'writes' || report.recovery === 'memory')
    })).toBe(true)
    expect(JSON.stringify(captured)).not.toContain('PRIVATE')
    await page.evaluate(() => {
      window.blockConfirmationStorage = false
      window.dispatchEvent(new Event('focus'))
    })
    await expect.poll(() => page.evaluate(key => JSON.parse(localStorage.getItem(`${key}_recovery_workspace_v1`)).status, key)).toBe('archived')
    const protectedCopy = await page.evaluate(key => JSON.parse(JSON.parse(localStorage.getItem(`${key}_recovery_workspace_v1`)).unchosenProfile).anki['2026-10-10'].reviewed, key)
    expect(protectedCopy).toBe(chooseSaved ? 7 : 9)
  })
}


test('a new background reconciliation failure reports automatically without interrupting onboarding', async ({ page }) => {
  const captured = []
  const servedOrigin = `http://localhost:${Number(process.env.EDENIA_TEST_NORMAL_PORT || 8000)}`
  await page.route('https://us.i.posthog.com/capture/', route => {
    const payload = route.request().postDataJSON()
    if (payload.event === 'feedback_submitted') captured.push(payload)
    return route.fulfill({ json: { status: 1 } })
  })
  await page.route('https://edenia.study/**', async route => {
    const url = new URL(route.request().url())
    return route.fulfill({ response: await route.fetch({ url: `${servedOrigin}${url.pathname}${url.search}` }) })
  })
  await open(page)
  await page.evaluate(databaseName => {
    window.blockProfileWrites = true
    window.blockBackgroundOpening = false
    const put = IDBObjectStore.prototype.put
    IDBObjectStore.prototype.put = function (...args) {
      if (window.blockProfileWrites && this.name === 'profiles') throw new DOMException('fixture full', 'QuotaExceededError')
      return put.apply(this, args)
    }
    const open = IDBFactory.prototype.open
    IDBFactory.prototype.open = function (name, ...args) {
      if (window.blockBackgroundOpening && name === databaseName) throw new DOMException('PRIVATE reconciliation fault', 'SecurityError')
      return open.call(this, name, ...args)
    }
  }, databaseName)
  await page.getByRole('button', { name: 'Continue', exact: true }).click()
  const language = page.getByRole('heading', { name: 'What language are you learning?', exact: true })
  await expect(language).toBeVisible()
  await page.evaluate(async () => {
    window.blockBackgroundOpening = true
    await reconcileBackgroundProfileRecovery()
  })
  await expect.poll(() => captured.some(payload => {
    const report = JSON.parse(payload.properties.feedback_message.split('\n').slice(1).join('\n'))
    return report.operation === 'reconcile' && report.code === 'storage-denied'
  })).toBe(true)
  expect(JSON.stringify(captured)).not.toContain('PRIVATE')
  await expect(language).toBeVisible()
  await expect(page.locator('#onboardingPanel.is-recovery')).toBeHidden()
  await page.evaluate(async () => {
    window.blockProfileWrites = false
    window.blockBackgroundOpening = false
    await reconcileBackgroundProfileRecovery()
  })
  await expect.poll(() => page.evaluate(() => profileRecoveryWorkspace.isActive())).toBe(false)
})
