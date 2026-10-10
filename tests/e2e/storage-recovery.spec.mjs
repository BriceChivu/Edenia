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
for (const kind of ['missing', 'invalid']) {
  test(`${kind} saved progress continues normally while preserving the protected original`, async ({ page }, testInfo) => {
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
    await expect(recovery).toBeHidden()
    await expect(page.getByRole('button', { name: 'Continue', exact: true })).toBeVisible()
    await page.screenshot({ path: testInfo.outputPath('normal-onboarding.png') })
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
test('a denied storage probe continues onboarding without an error screen', async ({ page }) => {
  await page.addInitScript(key => {
    const set = Storage.prototype.setItem
    Storage.prototype.setItem = function (name, value) {
      if (name === `${key}_storage_probe`) throw new DOMException('Fixture probe denied', 'SecurityError')
      return set.call(this, name, value)
    }
  }, key)
  await open(page, { indexedDbProfileEnabled: false })
  expect(await page.evaluate(() => profileRecoveryWorkspace.isActive())).toBe(true)
  await page.getByRole('button', { name: 'Continue', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'What language are you learning?', exact: true })).toBeVisible()
  await expect(page.locator('#onboardingPanel.is-recovery')).toBeHidden()
})

test('opening failure retains recovery progress across reloads without an error screen', async ({ page }) => {
  await open(page)
  await page.addInitScript(databaseName => {
    const open = IDBFactory.prototype.open
    IDBFactory.prototype.open = function (name, ...args) {
      if (name === databaseName) throw new DOMException('Fixture storage denied', 'SecurityError')
      return open.call(this, name, ...args)
    }
  }, databaseName)
  await page.reload()
  await expect(page.getByRole('button', { name: 'Continue', exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Continue', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'What language are you learning?', exact: true })).toBeVisible()
  await page.evaluate(async () => {
    const state = loadState()
    state.config.weeklyGoalHours = 7
    await saveState(state)
  })
  await page.reload()
  await expect(page.locator('#onboardingPanel.is-recovery')).toBeHidden()
  expect(await page.evaluate(() => loadState().config.weeklyGoalHours)).toBe(7)
})

test('a save failure switches to recovery silently even with an unavailable backup bank', async ({ page }) => {
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
  await expect(page.locator('#onboardingPanel.is-recovery')).toBeHidden()
  await expect(page.getByRole('heading', { name: 'What language are you learning?', exact: true })).toBeVisible()
  expect(await page.evaluate(key => JSON.parse(localStorage.getItem(`${key}_recovery_workspace_v1`)).status, key)).toBe('active')
})

test('storage failure continues normal onboarding in the background and preserves the original records', async ({ page }) => {
  await open(page)
  await page.evaluate(key => {
    localStorage.setItem(`${key}_indexed_db_v1`, '1')
    localStorage.setItem(`${key}_plus_auth_v1`, 'PRIVATE AUTH TOKEN')
  }, key)
  await page.addInitScript(databaseName => {
    const open = IDBFactory.prototype.open
    IDBFactory.prototype.open = function (name, ...args) {
      if (name === databaseName) throw new DOMException('PRIVATE PROFILE', 'SecurityError')
      return open.call(this, name, ...args)
    }
  }, databaseName)
  await page.reload()
  await expect(page.locator('#onboardingPanel.is-recovery')).toBeHidden()
  await expect(page.getByRole('button', { name: 'Continue', exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Continue', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'What language are you learning?', exact: true })).toBeVisible()
  expect(await page.evaluate(key => localStorage.getItem(`${key}_plus_auth_v1`), key)).toBe('PRIVATE AUTH TOKEN')
  expect(await page.evaluate(key => localStorage.getItem(`${key}_indexed_db_v1`), key)).toBe('1')
})

for (const conflict of [false, true]) {
  test(`returning storage ${conflict ? 'shows a real progress choice' : 'merges independent progress quietly'}`, async ({ page }, testInfo) => {
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
      await page.screenshot({ path: testInfo.outputPath('progress-conflict.png') })
      await dialog.getByRole('button', { name: 'Use recent progress', exact: true }).click()
      await page.evaluate(() => window.dispatchEvent(new Event('focus')))
      await expect.poll(() => page.evaluate(() => recoveryReconciliationPending)).toBe(false)
      await dialog.getByRole('button', { name: 'Confirm this choice', exact: true }).click()
      await expect(dialog).toBeHidden()
    } else await expect(dialog).toHaveCount(0)
    await expect.poll(() => page.evaluate(key => JSON.parse(localStorage.getItem(`${key}_recovery_workspace_v1`)).status, key)).toBe('archived')
    expect(await page.evaluate(() => loadState().anki['2026-10-10'].reviewed)).toBe(7)
    if (!conflict) expect(await page.evaluate(() => loadState().config.theme)).toBe('dark')
  })
}

test('a failure on the apex production origin automatically sends sanitized Discord feedback', async ({ page }) => {
  const captured = []
  const servedOrigin = `http://localhost:${Number(process.env.EDENIA_TEST_NORMAL_PORT || 8000)}`
  await page.route('https://us.i.posthog.com/capture/', route => {
    captured.push(route.request().postDataJSON())
    return route.fulfill({ json: { status: 1 } })
  })
  await page.route('https://edenia.study/**', async route => {
    const url = new URL(route.request().url())
    if (url.pathname === '/config.local.js') return route.fulfill({ contentType: 'application/javascript',
      body: 'window.EDENIA_CONFIG = { indexedDbProfileEnabled: true, accountFeaturesRollout: "off", learnerProfileLifecycleEnabled: false }' })
    const response = await route.fetch({ url: `${servedOrigin}${url.pathname}${url.search}` })
    return route.fulfill({ response })
  })
  await page.addInitScript(({ databaseName, key }) => {
    localStorage.setItem(`${key}_indexed_db_v1`, '1')
    localStorage.setItem(`${key}_plus_auth_v1`, 'SECRET AUTH TOKEN')
    const open = IDBFactory.prototype.open
    IDBFactory.prototype.open = function (name, ...args) {
      if (name === databaseName) throw new DOMException('SECRET SAVED PROGRESS', 'SecurityError')
      return open.call(this, name, ...args)
    }
  }, { databaseName, key })
  await page.goto('https://edenia.study/?internal_test=2&private=SECRET')
  await expect(page.getByRole('button', { name: 'Continue', exact: true })).toBeVisible()
  await expect.poll(() => captured.length).toBe(1)
  const event = captured[0]
  expect(event.event).toBe('feedback_submitted')
  expect(event.properties.feedback_source).toBe('automatic_storage_recovery')
  expect(event.properties.feedback_message).toContain('storage-denied')
  expect(event.properties.feedback_message).toContain('local')
  expect(event.properties.feedback_message).toContain('Chrome/')
  expect(event.properties.page_url).toBe('https://edenia.study/')
  expect(JSON.stringify(event)).not.toContain('SECRET')
  await expect(page.locator('#onboardingPanel.is-recovery')).toBeHidden()
})

test('two recovery tabs merge independent changes and ask about competing progress', async ({ page, context }) => {
  await open(page)
  const block = databaseName => {
    const open = IDBFactory.prototype.open
    IDBFactory.prototype.open = function (name, ...args) {
      if (name === databaseName) throw new DOMException('fixture denied', 'SecurityError')
      return open.call(this, name, ...args)
    }
  }
  await page.addInitScript(block, databaseName)
  await page.reload()
  await expect(page.getByRole('button', { name: 'Continue', exact: true })).toBeVisible()
  await page.evaluate(() => {
    const state = loadState()
    state.anki['2026-10-10'] = { reviewed: 7, created: 0 }
    saveState(state)
  })
  const other = await context.newPage()
  await other.addInitScript(block, databaseName)
  await open(other)
  await page.evaluate(() => {
    window.pendingRecoveryProfile = loadState()
    window.pendingRecoveryProfile.anki['2026-10-11'] = { reviewed: 2, created: 0 }
  })
  await other.evaluate(() => {
    const state = loadState()
    state.config.theme = 'dark'
    saveState(state)
  })
  expect(await page.evaluate(() => saveState(window.pendingRecoveryProfile))).toBe(true)
  await expect.poll(() => other.evaluate(() => loadState().anki['2026-10-11']?.reviewed)).toBe(2)
  expect(await page.evaluate(() => loadState().config.theme)).toBe('dark')
  await page.evaluate(() => {
    window.pendingRecoveryProfile = loadState()
    window.pendingRecoveryProfile.anki['2026-10-10'].reviewed = 8
  })
  await other.evaluate(() => {
    const state = loadState()
    state.anki['2026-10-10'].reviewed = 9
    saveState(state)
  })
  expect(await page.evaluate(() => saveState(window.pendingRecoveryProfile))).toBe(false)
  const dialog = page.locator('#localProgressConflict')
  await expect(dialog).toBeVisible()
  await expect(page.locator('#toast')).not.toContainText('Could not save')
  await dialog.getByRole('button', { name: 'Use recent progress', exact: true }).click()
  await dialog.getByRole('button', { name: 'Confirm this choice', exact: true }).click()
  await expect(dialog).toBeHidden()
  await expect.poll(() => other.evaluate(() => loadState().anki['2026-10-10'].reviewed)).toBe(8)
  await other.close()
})

test('a failed island checkpoint saves through background recovery and survives reload', async ({ page }) => {
  await open(page, { tinySwordsEnabled: true })
  await page.waitForFunction(() => Boolean(window.edeniaTinySwordsPersistence))
  const result = await page.evaluate(async () => {
    const persistence = window.edeniaTinySwordsPersistence
    const expected = JSON.stringify(persistence.readIsland()?.tinySwordsIsland) ?? 'absent'
    const put = IDBObjectStore.prototype.put
    IDBObjectStore.prototype.put = function (...args) {
      if (this.name === 'profiles') throw new DOMException('fixture checkpoint denied','SecurityError')
      return put.apply(this,args)
    }
    const saved = await persistence.save({ version: 23, level: 1, resources: { wood: 8 } }, expected, { syncCloud: false })
    IDBObjectStore.prototype.put = put
    return { saved, island: persistence.readIsland().tinySwordsIsland }
  })
  expect(result.saved).toBe(true)
  expect(result.island.resources.wood).toBe(8)
  await expect(page.locator('#onboardingPanel.is-recovery')).toBeHidden()
  await page.reload()
  await expect.poll(() => page.evaluate(() => loadState()?.tinySwordsIsland?.resources.wood)).toBe(8)
})
