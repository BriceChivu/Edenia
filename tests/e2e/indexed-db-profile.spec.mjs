import { expect, test } from '../support/network-fixture.mjs'
import { readFile } from 'node:fs/promises'
const channelId = 'UC0000000000000000000000'
const addedId = 'UC1111111111111111111111'
const databaseName = 'edenia_v1_profiles_indexed_db_v1'

async function configure(page, enabled) {
  await page.route('**/config.local.js*', route => route.fulfill({
    body: `window.EDENIA_CONFIG = ${JSON.stringify({
      accountFeaturesRollout: 'off', learnerProfileLifecycleEnabled: false,
      indexedDbProfileEnabled: enabled, indexedDbBackupsEnabled: enabled,
      indexedDbBackupCleanupEnabled: enabled
    })}`, contentType: 'application/javascript'
  }))
}
async function seed(page, count = 20) {
  await configure(page, false)
  await page.goto('/')
  await expect(page.locator('#mainApp')).toBeVisible()
  await page.evaluate(({ channelId, count }) => {
    const state = window.defaultState(4, [], 'light', [], 'en')
    const now = new Date().toISOString()
    state.config.ankiEnabled = false
    state.config.channels = [{ id: channelId, name: 'Storage fixture', metadataFetchedAt: now }]
    Object.assign(state.onboarding, { introSeenAt: now, setupCompleted: true, setupCompletedAt: now,
      walkthroughCompleted: true, walkthroughCompletedAt: now, levelUpGuidanceShownAt: now })
    state.videos = Object.fromEntries(Array.from({ length: count }, (_, index) => {
      const id = `fixture${String(index).padStart(4, '0')}`
      return [id, { id, channelId, title: `Fixture ${index} ${'cached '.repeat(120)}`,
        metadataFetchedAt: now, duration: 600, status: index ? 'unwatched' : 'partial',
        favorite: !index, watchLater: !index, resumeAtSeconds: index ? null : 90,
        watchProgress: index ? [] : [{ seconds: 90, watchedAt: now, studyDay: '2026-10-03' }], watchProgressTracked: !index }]
    }))
    state.anki['2026-10-01'] = { reviewed: 12, created: 3, loggedAt: now }
    localStorage.setItem('edenia_v1', JSON.stringify(state))
    localStorage.setItem('edenia_v1_backups', JSON.stringify([{ id: 'legacy', createdAt: now, reason: 'before import', state }]))
  }, { channelId, count })
  await page.unroute('**/config.local.js*')
  await configure(page, true)
}
async function head(page, key = 'active', fixtureDatabaseName = databaseName) {
  return page.evaluate(({ databaseName, key }) => new Promise((resolve, reject) => {
    const request = indexedDB.open(databaseName, 1)
    request.onerror = () => reject(request.error)
    request.onsuccess = () => {
      const database = request.result
      const transaction = database.transaction('profiles', 'readonly')
      const read = transaction.objectStore('profiles').get(key)
      transaction.oncomplete = () => { database.close(); resolve(read.result || null) }
      transaction.onabort = () => reject(transaction.error)
    }
  }), { databaseName: fixtureDatabaseName, key })
}
async function rejectWrites(page) {
  await page.evaluate(() => {
    const put = IDBObjectStore.prototype.put
    window.restoreProfileWrites = () => { IDBObjectStore.prototype.put = put }
    IDBObjectStore.prototype.put = function (...args) {
      if (this.name === 'profiles') throw new DOMException('Synthetic storage exhaustion', 'QuotaExceededError')
      return put.apply(this, args)
    }
  })
}
async function waitForOpeningMaintenance(page) {
  const scoringVersion = await page.evaluate(() => SCORING_RULES_VERSION)
  await expect.poll(async () => {
    const saved = await head(page)
    return saved?.raw ? JSON.parse(saved.raw).cityProgress.scoringVersion : null
  }).toBe(scoringVersion)
}
async function add(page) {
  return page.evaluate(id => window.addChannel({
    input: { value: id, focus() {} }, resolvedChannel: { id, name: 'Added fixture' }
  }), addedId)
}

test('verified opening retires duplicate local copies and preserves reload, progress and meaningful Undo', async ({ page }) => {
  await seed(page, 400)
  const before = await page.evaluate(() => localStorage.getItem('edenia_v1'))
  await page.reload()
  await expect(page.locator('.channel-shelf-remove')).toHaveCount(1)
  expect(await page.evaluate(() => localStorage.getItem('edenia_v1'))).toBeNull()
  expect(await page.evaluate(() => localStorage.getItem('edenia_v1_backups'))).toBeNull()
  expect((await head(page, 'legacy-recovery')).raw).toBe(before)
  const facts = await page.evaluate(() => window.loadState().videos.fixture0000)
  await page.evaluate(id => window.removeChannel(id), channelId)
  await expect(page.locator('.channel-shelf-remove')).toHaveCount(0)
  await page.evaluate(() => window.undoLastVideoAction())
  await expect(page.locator('.channel-shelf-remove')).toHaveCount(1)
  expect(await page.evaluate(() => window.loadState().videos.fixture0000.watchProgress)).toEqual(facts.watchProgress)
  // Make the asynchronous opening boundary observable even on fast machines.
  await page.addInitScript(databaseName => {
    const open = IDBFactory.prototype.open
    const success = Object.getOwnPropertyDescriptor(IDBRequest.prototype, 'onsuccess')
    IDBFactory.prototype.open = function (...args) {
      const request = open.apply(this, args)
      if (args[0] === databaseName) Object.defineProperty(request, 'onsuccess', {
        get() { return success.get.call(this) },
        set(handler) {
          success.set.call(this, typeof handler === 'function' ? function (event) {
            setTimeout(() => handler.call(this, event), 100)
          } : handler)
        }
      })
      return request
    }
  }, databaseName)
  await page.reload()
  // Document load does not wait for IndexedDB hydration. Check the rendered
  // profile before reading its snapshot, just as on the first opening above.
  await expect(page.locator('.channel-shelf-remove')).toHaveCount(1)
  expect(await page.evaluate(() => window.loadState().anki['2026-10-01'].reviewed)).toBe(12)
  expect(await page.evaluate(() => window.loadState().videos.fixture0000.favorite)).toBe(true)
  expect(await page.evaluate(() => window.loadState().videos.fixture0000.watchLater)).toBe(true)
})

test('tester import escapes the shared localStorage quota and regular migration frees its allocation', async ({ page, context, baseURL }) => {
  test.setTimeout(60_000)
  const testerKey = 'edenia_v1_internal_test_2'
  const testerDatabase = `${testerKey}_profiles_indexed_db_v1`
  let enabled = false
  await context.route('**/config.local.js*', route => route.fulfill({
    contentType: 'application/javascript',
    body: `window.EDENIA_CONFIG=${JSON.stringify({
      tinySwordsEnabled: false, accountFeaturesRollout: 'off',
      learnerProfileLifecycleEnabled: false, indexedDbProfileEnabled: enabled,
      indexedDbBackupsEnabled: true, indexedDbBackupCleanupEnabled: true
    })}`
  }))
  const testerUrl = new URL('?internal_test=2', baseURL).href
  await page.goto(testerUrl)
  await page.waitForFunction(() => typeof defaultState === 'function')
  const fixture = await page.evaluate(async testerKey => {
    const at = new Date().toISOString()
    const ready = () => {
      const state = defaultState(4, [], 'light', [], 'en')
      state.config.ankiEnabled = false
      // Keep delayed guidance writes out of this storage-isolation comparison.
      Object.assign(state.onboarding, { introSeenAt: at, setupCompleted: true,
        setupCompletedAt: at, walkthroughCompleted: true, walkthroughCompletedAt: at,
        levelUpGuidanceShownAt: at })
      return state
    }
    const imported = ready()
    imported.videos = Object.fromEntries(Array.from({ length: 1612 }, (_, index) => {
      const id = `portable${String(index).padStart(4, '0')}`
      return [id, { id, title: `Portable lesson ${index} ${'metadata '.repeat(40)}`,
        metadataFetchedAt: at, duration: 600, status: 'partial',
        favorite: !index, watchLater: !index, resumeAtSeconds: 90,
        watchProgress: [{ seconds: 90, watchedAt: at, studyDay: '2026-10-03', experienceSeconds: 90 }],
        watchProgressTracked: true }]
    }))
    imported.anki['2026-10-01'] = { reviewed: 12, created: 3, loggedAt: at }
    imported.tinySwordsIsland = { version: 23, level: 4, resources: { wood: 8 } }
    const { serialized } = await createPortableLearnerProfileEnvelope(imported)
    const regular = ready()
    regular.videos = Object.fromEntries(Array.from({ length: 7717 }, (_, index) => {
      const id = `regular${String(index).padStart(4, '0')}`
      return [id, { id, title: `Regular lesson ${index}`, metadataFetchedAt: at,
        duration: 600, status: index ? 'unwatched' : 'partial',
        watchProgress: index ? [] : [{ seconds: 60, watchedAt: at, studyDay: '2026-10-03' }] }]
    }))
    // Match the observed regular-profile allocation without retaining personal data.
    regular.config.quotaFixturePadding = ''
    regular.config.quotaFixturePadding = ' '.repeat(4141239 - JSON.stringify(regular).length)
    const regularRaw = JSON.stringify(regular)
    localStorage.setItem('edenia_v1', regularRaw)
    localStorage.setItem(testerKey, JSON.stringify(ready()))
    const paddingKey = 'edenia_shared_quota_fixture'
    const occupied = Object.keys(localStorage).reduce((n, key) => n + key.length + localStorage.getItem(key).length, 0)
    localStorage.setItem(paddingKey, ' '.repeat(4628820 - occupied - paddingKey.length))
    return { serialized, regularRaw, testerRaw: localStorage.getItem(testerKey) }
  }, testerKey)
  expect(JSON.stringify(JSON.parse(fixture.serialized).profile).length).toBeGreaterThan(800_000)
  await page.reload()
  await expect(page.locator('#mainApp')).toBeVisible()
  // Startup can normalize the seeded profile before any import begins.
  fixture.testerRaw = await page.evaluate(key => localStorage.getItem(key), testerKey)
  const importFixture = async target => {
    await target.evaluate(() => {
      openSettings()
      beginSettingsSyncImportInteraction(document.getElementById('syncFileInput'))
    })
    await target.locator('#syncFileInput').setInputFiles({
      name: 'shared-quota-profile.json', mimeType: 'application/json',
      buffer: Buffer.from(fixture.serialized)
    })
  }
  await importFixture(page)
  await expect(page.locator('#toast')).toContainText('Not enough browser storage')
  expect(await page.evaluate(key => localStorage.getItem(key), testerKey)).toBe(fixture.testerRaw)
  expect(await page.evaluate(() => getStateBackupEntries().some(entry => entry.reason === 'before sync import'))).toBe(true)

  enabled = true
  await page.reload()
  await expect(page.locator('#mainApp')).toBeVisible()
  expect((await head(page, 'legacy-recovery', testerDatabase)).raw).toBe(fixture.testerRaw)
  await importFixture(page)
  await expect(page.locator('#toast')).toContainText(/imported/i)
  expect(await page.evaluate(() => localStorage.getItem('edenia_v1'))).toBe(fixture.regularRaw)
  expect(await page.evaluate(key => localStorage.getItem(key), testerKey)).toBeNull()

  // A new page simulates reopening the application; disabled rollout must still read migrated data.
  enabled = false
  const reopened = await context.newPage()
  await reopened.goto(testerUrl)
  await expect(reopened.locator('#mainApp')).toBeVisible()
  const restored = await reopened.evaluate(() => {
    const state = loadState()
    return { count: Object.keys(state.videos).length, lesson: state.videos.portable0000,
      anki: state.anki['2026-10-01'], island: state.tinySwordsIsland }
  })
  expect(restored.count).toBe(1612)
  expect(restored.lesson.watchProgress[0].seconds).toBe(90)
  expect(restored.lesson.favorite).toBe(true)
  expect(restored.lesson.watchLater).toBe(true)
  expect(restored.anki.reviewed).toBe(12)
  expect(restored.island.resources.wood).toBe(8)
  const testerHead = await head(reopened, 'active', testerDatabase)

  enabled = true
  const normal = await context.newPage()
  await normal.goto(baseURL)
  await expect(normal.locator('#mainApp')).toBeVisible()
  expect((await head(normal, 'legacy-recovery')).raw).toBe(fixture.regularRaw)
  expect(await normal.evaluate(() => localStorage.getItem('edenia_v1'))).toBeNull()
  expect(await normal.evaluate(() => Object.keys(loadState().videos).length)).toBe(7717)
  expect(await normal.evaluate(() => loadState().videos.regular0000.watchProgress[0].seconds)).toBe(60)
  expect(await head(reopened, 'active', testerDatabase)).toEqual(testerHead)
  expect(await normal.evaluate(() => Object.keys(localStorage).reduce((n, key) => n + key.length + localStorage.getItem(key).length, 0))).toBeLessThan(600_000)
})

test('large-library additions save without localStorage profile writes and survive disabled rollout reload', async ({ page }) => {
  await seed(page, 2000)
  await page.reload()
  await expect(page.locator('#mainApp')).toBeVisible()
  await page.evaluate(() => {
    const set = Storage.prototype.setItem
    Storage.prototype.setItem = function (key, value) {
      if (key === 'edenia_v1' || key === 'edenia_v1_backups') throw new DOMException('Local pool full', 'QuotaExceededError')
      return set.call(this, key, value)
    }
  })
  await add(page)
  expect(JSON.parse((await head(page)).raw).config.channels).toHaveLength(2)
  await page.unroute('**/config.local.js*')
  await configure(page, false)
  await page.reload()
  await expect(page.locator('#mainApp')).toBeVisible()
  expect(await page.evaluate(() => Object.keys(window.loadState().videos).length)).toBe(2000)
  expect(await page.evaluate(() => window.loadState().config.channels.length)).toBe(2)
  expect(await page.evaluate(() => localStorage.getItem('edenia_v1_backups'))).toBeNull()
})

test('failed additions, settings and video actions retain durable data and render the saved state', async ({ page }) => {
  await seed(page)
  await page.reload()
  await expect(page.locator('.channel-shelf-remove')).toHaveCount(1)
  await waitForOpeningMaintenance(page)
  const before = await head(page)
  await rejectWrites(page)
  await add(page)
  await expect(page.locator('#toast')).toContainText('Could not save')
  await expect(page.locator('.channel-shelf-remove')).toHaveCount(1)
  await page.evaluate(() => window.toggleTheme())
  expect(await page.evaluate(() => document.body.dataset.theme || document.documentElement.dataset.theme)).not.toBe('dark')
  await page.evaluate(() => window.toggleVideoFavorite('fixture0000'))
  expect(await head(page)).toEqual(before)
  expect(await page.evaluate(() => window.loadState().videos.fixture0000.favorite)).toBe(true)
  await page.evaluate(() => window.restoreProfileWrites())
  await add(page)
  expect(JSON.parse((await head(page)).raw).config.channels).toHaveLength(2)
})

test('failed migration writes retain the original primary and recovery backups', async ({ page }) => {
  await seed(page)
  const before = await page.evaluate(() => localStorage.getItem('edenia_v1'))
  await page.addInitScript(() => {
    const put = IDBObjectStore.prototype.put
    IDBObjectStore.prototype.put = function (...args) {
      if (this.name === 'profiles') throw new DOMException('Migration quota', 'QuotaExceededError')
      return put.apply(this, args)
    }
  })
  await page.reload()
  await expect(page.locator('#onboardingPanel.is-recovery')).toBeVisible()
  expect(await page.evaluate(() => localStorage.getItem('edenia_v1'))).toBe(before)
  expect(await page.evaluate(() => localStorage.getItem('edenia_v1_indexed_db_v1'))).toBeNull()
  // Backups already moved safely to their own verified repository.
  expect(await page.evaluate(() => window.getStateBackupEntries().some(entry => entry.id === 'legacy'))).toBe(true)
})

test('two tabs reject a stale snapshot and refresh the winner without losing study facts', async ({ page, context }) => {
  await seed(page)
  await page.reload()
  await expect(page.locator('.channel-shelf-remove')).toHaveCount(1)
  const other = await context.newPage()
  await configure(other, true)
  await other.goto('/')
  await expect(other.locator('.channel-shelf-remove')).toHaveCount(1)
  await other.evaluate(() => { window.staleFixture = window.loadState() })
  await add(page)
  await expect.poll(() => other.evaluate(() => window.loadState().config.channels.length)).toBe(2)
  const accepted = await other.evaluate(async () => {
    window.staleFixture.config.theme = 'dark'
    return await window.saveState(window.staleFixture, { backup: false })
  })
  expect(accepted).toBe(false)
  expect(JSON.parse((await head(page)).raw).config.channels).toHaveLength(2)
  expect(JSON.parse((await head(page)).raw).videos.fixture0000.resumeAtSeconds).toBe(90)
  await other.close()
})

test('overlapping same-tab updates preserve an independent preference and the added channel', async ({ page }) => {
  await seed(page)
  await page.reload()
  await expect(page.locator('.channel-shelf-remove')).toHaveCount(1)
  const outcomes = await page.evaluate(async addedId => {
    const independent = window.loadState()
    independent.config.weeklyGoalHours = 7
    const savingPreference = window.saveState(independent, { backup: false })
    const addingChannel = window.addChannel({ input: { value: addedId, focus() {} },
      resolvedChannel: { id: addedId, name: 'Added fixture' } })
    return Promise.all([savingPreference, addingChannel])
  }, addedId)
  expect(outcomes[0]).toBe(true)
  const saved = JSON.parse((await head(page)).raw)
  expect(saved.config.channels).toHaveLength(2)
  await expect(page.locator('#toast')).not.toContainText('Could not save')
  expect(saved.config.weeklyGoalHours).toBe(7)
  expect(saved.videos.fixture0000.resumeAtSeconds).toBe(90)
})

test('failed refreshes and preference changes never render or retain unsaved mutations', async ({ page }) => {
  await seed(page)
  await page.reload()
  await expect(page.locator('.channel-shelf-remove')).toHaveCount(1)
  await waitForOpeningMaintenance(page)
  const before = await head(page)
  await rejectWrites(page)
  await page.evaluate(() => window.openSettings())
  await page.evaluate(() => { document.getElementById('settingsAnkiEnabled').checked = true })
  await page.evaluate(() => window.saveSettingsOnTheFly())
  expect(await page.locator('#settingsAnkiEnabled').isChecked()).toBe(false)
  await page.evaluate(() => window.closeSettings())
  const failed = await page.evaluate(async channelId => {
    window.EDENIA_CONFIG.youtubeApiKey = 'synthetic-key'
    return await window.refreshFeed({ silent: true, channelIds: [channelId] })
  }, channelId)
  expect(failed.ok).toBe(false)
  expect(await head(page)).toEqual(before)
  await expect(page.locator('#toast')).toContainText('Could not save')
  await page.evaluate(() => window.restoreProfileWrites())
  const succeeded = await page.evaluate(channelId => window.refreshFeed({ silent: true, channelIds: [channelId] }), channelId)
  expect(succeeded.ok).toBe(true)
  const saved = JSON.parse((await head(page)).raw)
  expect(saved.videos.fixture0001.title).toBe('Fixture Study Video')
  expect(saved.videos.fixture0000.watchProgress).toEqual(JSON.parse(before.raw).videos.fixture0000.watchProgress)
  expect(saved.videos.fixture0000.favorite).toBe(true)
  await page.locator('#videoGrid').scrollIntoViewIfNeeded()
  await expect(page.locator('#videoGrid')).toContainText('Fixture Study Video')
})

test('failed locale, history and channel-format preferences keep the saved view', async ({ page }) => {
  await seed(page)
  await page.evaluate(() => {
    const state = JSON.parse(localStorage.getItem('edenia_v1'))
    state.videos.fixture0001.isShort = true
    state.videos.fixture0001.aspectRatio = 0.5625
    localStorage.setItem('edenia_v1', JSON.stringify(state))
  })
  await page.reload()
  await expect(page.locator('.channel-shelf-remove')).toHaveCount(1)
  await waitForOpeningMaintenance(page)
  const before = await head(page)
  const shelf = page.locator('.channel-shelf').first()
  await expect(shelf).toHaveAttribute('data-channel-selected-video-format', 'videos')
  await expect(shelf.locator('.channel-shelf-format-option[data-channel-video-format="shorts"]')).toHaveCount(1)
  await rejectWrites(page)
  await page.evaluate(() => window.changeIntroLocale('fr'))
  await page.evaluate(() => window.changeOnboardingLocale('fr'))
  await page.evaluate(() => window.saveLocaleFromSettings('fr'))
  await expect(page.locator('html')).toHaveAttribute('lang', 'en')
  await page.evaluate(() => window.setHistoryView('heatmap'))
  await page.evaluate(channelId => window.selectChannelVideoFormat(
    document.querySelector('.channel-shelf-format-option[data-channel-video-format="shorts"]'), channelId, 'shorts'
  ), channelId)
  await expect(shelf).toHaveAttribute('data-channel-selected-video-format', 'videos')
  expect(await head(page)).toEqual(before)
})

test('failed Undo and Redo wait for durable completion and retain saved visibility and history', async ({ page }) => {
  await seed(page)
  await page.reload()
  await expect(page.locator('.channel-shelf-remove')).toHaveCount(1)
  await page.evaluate(channelId => window.removeChannel(channelId), channelId)
  const removed = await head(page)
  await rejectWrites(page)
  await page.evaluate(() => window.undoLastVideoAction())
  await expect(page.locator('.channel-shelf-remove')).toHaveCount(0)
  expect(await head(page)).toEqual(removed)
  await page.evaluate(() => window.restoreProfileWrites())
  await page.evaluate(() => window.undoLastVideoAction())
  await expect(page.locator('.channel-shelf-remove')).toHaveCount(1)
  const restored = await head(page)
  await rejectWrites(page)
  await page.evaluate(() => window.redoLastVideoAction())
  await expect(page.locator('.channel-shelf-remove')).toHaveCount(1)
  expect(await head(page)).toEqual(restored)
})

test('portable export and verified import use the durable profile and survive reload', async ({ page }) => {
  await seed(page)
  await page.reload()
  await expect(page.locator('.channel-shelf-remove')).toHaveCount(1)
  await page.evaluate(() => window.openSettings())
  const download = page.waitForEvent('download')
  await page.locator('[data-settings-sync-action="export"]').click()
  const exported = await download
  const stream = await exported.createReadStream()
  const chunks = []
  for await (const chunk of stream) chunks.push(chunk)
  const portable = Buffer.concat(chunks)
  await page.evaluate(channelId => window.removeChannel(channelId), channelId)
  const choosing = page.waitForEvent('filechooser')
  await page.locator('[data-settings-sync-action="choose-file"]').click()
  await (await choosing).setFiles({ name: 'portable-fixture.json', mimeType: 'application/json', buffer: portable })
  await expect(page.locator('#toast')).toContainText(/imported/i)
  expect(JSON.parse((await head(page)).raw).config.channels[0].id).toBe(channelId)
  await page.reload()
  await expect(page.locator('.channel-shelf-remove')).toHaveCount(1)
  expect(await page.evaluate(() => window.loadState().videos.fixture0000.resumeAtSeconds)).toBe(90)
  expect(await page.evaluate(() => localStorage.getItem('edenia_v1'))).toBeNull()
})

test('an existing durable profile still opens when startup maintenance cannot save', async ({ page }) => {
  await seed(page)
  await page.reload()
  await expect(page.locator('.channel-shelf-remove')).toHaveCount(1)
  await waitForOpeningMaintenance(page)
  const before = await head(page)
  await page.addInitScript(() => {
    const put = IDBObjectStore.prototype.put
    IDBObjectStore.prototype.put = function (...args) {
      if (this.name === 'profiles') throw new DOMException('Synthetic startup quota', 'QuotaExceededError')
      return put.apply(this, args)
    }
  })
  await page.reload()
  await expect(page.locator('#mainApp')).toBeVisible()
  await expect(page.locator('.channel-shelf-remove')).toHaveCount(1)
  expect(await head(page)).toEqual(before)
  expect(await page.evaluate(() => window.loadState().videos.fixture0000.resumeAtSeconds)).toBe(90)
})

test('a failed migrated-backup reopen preserves primary operation without recreating localStorage copies', async ({ page }) => {
  await seed(page)
  await page.reload()
  await expect(page.locator('.channel-shelf-remove')).toHaveCount(1)
  await page.addInitScript(() => {
    const open = IDBFactory.prototype.open
    IDBFactory.prototype.open = function (name, ...args) {
      if (name === 'edenia_state_backups_v1') throw new DOMException('Synthetic backup open failure', 'UnknownError')
      return open.call(this, name, ...args)
    }
  })
  await page.reload()
  await expect(page.locator('#mainApp')).toBeVisible()
  await expect(page.locator('.channel-shelf-remove')).toHaveCount(1)
  await page.evaluate(() => window.toggleVideoFavorite('fixture0000'))
  expect(JSON.parse((await head(page)).raw).videos.fixture0000.favorite).toBe(false)
  expect(await page.evaluate(() => localStorage.getItem('edenia_v1_backups') === null)).toBe(true)
  expect(await page.evaluate(() => window.createVerifiedStateBackup('synthetic protected action'))).toBeNull()
  expect(await page.evaluate(() => localStorage.getItem('edenia_v1_backups_indexed_db_v1'))).toBe('1')
})

// Exercise the actual repository in a browser with a separate synthetic store,
// including the narrow interval between transaction commit and acknowledgment.
const edgeDatabaseName = 'synthetic_profile_edge_cases'
async function repositoryFixture(page) {
  const source = await readFile(new URL('../../src/state/indexed-db-profile.js', import.meta.url), 'utf8')
  const adapter = await readFile(new URL('../../src/state/tiny-swords-island.js', import.meta.url), 'utf8')
  await configure(page, false)
  await page.route('**/profile-repository-fixture.js', route => route.fulfill({
    body: source, contentType: 'application/javascript'
  }))
  await page.route('**/island-adapter-fixture.js', route => route.fulfill({
    body: adapter, contentType: 'application/javascript'
  }))
  await page.goto('/')
  await expect(page.locator('#mainApp')).toBeVisible()
  await page.evaluate(async databaseName => {
    const { openIndexedDbProfile } = await import('/profile-repository-fixture.js')
    window.openEdgeRepository = (onChange = () => {}, eventTarget = null) => openIndexedDbProfile({
      storage: localStorage, storageKey: 'synthetic-profile', accessKey: 'synthetic-access',
      databaseName, eventTarget, onChange, isValidState: state => Boolean(state?.config)
    })
    window.edgeState = { config: { theme: 'light' }, videos: {}, anki: {} }
  }, edgeDatabaseName)
}

test('island checkpoints survive reload, merge with queued study saves and travel with profile replacement', async ({ page }) => {
  await repositoryFixture(page)
  const result = await page.evaluate(async () => {
    localStorage.setItem('synthetic-profile', JSON.stringify({ ...window.edgeState,
      cityProgress: { maxLevelIndex: 3 }, tinySwordsIsland: null }))
    let repository = await window.openEdgeRepository()
    const first = { version: 23, level: 4, resources: { wood: 6 } }
    const migrated = await repository.saveIsland(first, 'null')
    const study = repository.snapshot()
    study.anki.day = { reviewed: 12 }
    const second = { ...first, resources: { wood: 8 } }
    const islandSave = repository.saveIsland(second, JSON.stringify(first))
    const studySave = repository.save(study)
    const queued = await Promise.all([islandSave, studySave])
    const failedStudy = repository.snapshot()
    failedStudy.config.theme = 'unacknowledged'
    let checks = 0
    const fullFailed = await repository.save(failedStudy, { canPersist: () => ++checks < 3 })
    const portableAndBackup = JSON.parse(repository.readRaw())
    repository.close()
    repository = await window.openEdgeRepository()
    const reloaded = repository.snapshot()
    const notifications = []
    const observer = await window.openEdgeRepository(change => notifications.push(change))
    await repository.save(reloaded, { replace: true })
    await observer.refresh()
    observer.close()
    const replacement = { ...window.edgeState, tinySwordsIsland: null }
    const replaced = await repository.save(replacement, { replace: true })
    const stale = await repository.saveIsland(first, JSON.stringify(second))
    const reset = repository.snapshot()
    // Importing a profile with no island must remove the previous overlay.
    const absentImport = await repository.save(window.edgeState, { replace: true })
    const absent = repository.readIslandState()
    repository.close()
    return { migrated, queued, fullFailed, portableAndBackup, reloaded, notifications, replaced, stale, reset, absentImport, absent }
  })
  expect(result.migrated).toBe(true)
  expect(result.queued).toEqual([true, true])
  expect(result.fullFailed).toBe(false)
  expect(result.reloaded.config.theme).toBe('light')
  expect(result.reloaded).toEqual(result.portableAndBackup)
  expect(result.notifications).toEqual([{ islandOnly: false, replacement: true }])
  expect(result.reloaded.anki.day.reviewed).toBe(12)
  expect(result.reloaded.tinySwordsIsland.resources.wood).toBe(8)
  expect(result.replaced).toBe(true)
  expect(result.stale).toBe(false)
  expect(result.reset.tinySwordsIsland).toBeNull()
  expect(result.absentImport).toBe(true)
  expect(result.absent).not.toHaveProperty('tinySwordsIsland')
})

test('unacknowledged checkpoints retain the previous island and stale repositories cannot overwrite another tab', async ({ page }) => {
  await repositoryFixture(page)
  const result = await page.evaluate(async () => {
    localStorage.setItem('synthetic-profile', JSON.stringify({ ...window.edgeState, tinySwordsIsland: null }))
    const repository = await window.openEdgeRepository()
    const first = { version: 23, resources: { wood: 6 } }
    await repository.saveIsland(first, 'null')
    const put = IDBObjectStore.prototype.put
    IDBObjectStore.prototype.put = function (...args) {
      if (this.name === 'profiles') throw new DOMException('Synthetic quota', 'QuotaExceededError')
      return put.apply(this, args)
    }
    const quota = await repository.saveIsland({ ...first, changed: true }, JSON.stringify(first))
    IDBObjectStore.prototype.put = put
    const transaction = IDBDatabase.prototype.transaction
    let interrupted = false
    IDBDatabase.prototype.transaction = function (...args) {
      const result = transaction.apply(this, args)
      if (this.name === 'synthetic_profile_edge_cases' && args[1] === 'readonly' && !interrupted) {
        interrupted = true
        queueMicrotask(() => result.abort())
      }
      return result
    }
    const readback = await repository.saveIsland({ ...first, changed: true }, JSON.stringify(first))
    IDBDatabase.prototype.transaction = transaction
    let checks = 0
    const fence = await repository.saveIsland({ ...first, changed: true }, JSON.stringify(first), {
      canPersist() {
        if (++checks < 3) return true
        localStorage.setItem('synthetic-access', 'replacement-owner')
        return false
      }
    })
    const retained = repository.readIslandState().tinySwordsIsland
    const other = await window.openEdgeRepository()
    const newer = { ...first, resources: { wood: 10 } }
    const otherSaved = await other.saveIsland(newer, JSON.stringify(first))
    const stale = await repository.saveIsland({ ...first, stale: true }, JSON.stringify(first))
    const final = repository.snapshot()
    repository.close(); other.close()
    return { quota, readback, interrupted, fence, retained, otherSaved, stale, final }
  })
  expect(result.quota).toBe(false)
  expect(result.readback).toBe(false)
  expect(result.interrupted).toBe(true)
  expect(result.fence).toBe(false)
  expect(result.retained).toEqual({ version: 23, resources: { wood: 6 } })
  expect(result.otherSaved).toBe(true)
  expect(result.stale).toBe(false)
  expect(result.final.tinySwordsIsland.resources.wood).toBe(10)
})

test('a checkpoint losing its fence after commit preserves a newer replacement transaction', async ({ page }) => {
  await repositoryFixture(page)
  const result = await page.evaluate(async () => {
    localStorage.setItem('synthetic-profile', JSON.stringify({ ...window.edgeState, tinySwordsIsland: null }))
    const repository = await window.openEdgeRepository()
    const first = { version: 23, resources: { wood: 6 } }
    await repository.saveIsland(first, 'null')
    const database = await new Promise((resolve, reject) => {
      const request = indexedDB.open('synthetic_profile_edge_cases', 1)
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error)
    })
    let checks = 0
    const accepted = await repository.saveIsland({ ...first, changed: true }, JSON.stringify(first), {
      canPersist() {
        if (++checks < 3) return true
        localStorage.setItem('synthetic-access', 'replacement-owner')
        const transaction = database.transaction('profiles', 'readwrite')
        transaction.objectStore('profiles').put({ key: 'active', revision: 4,
          raw: JSON.stringify({ ...window.edgeState, config: { theme: 'new-owner' }, tinySwordsIsland: null }) })
        return false
      }
    })
    repository.close(); database.close()
    const reopened = await window.openEdgeRepository()
    const durable = reopened.snapshot()
    reopened.close()
    return { accepted, durable }
  })
  expect(result.accepted).toBe(false)
  expect(result.durable.config.theme).toBe('new-owner')
  expect(result.durable.tinySwordsIsland).toBeNull()
})

test('warm island writes touch only the small head with empty and 30000-video libraries', async ({ page }) => {
  await repositoryFixture(page)
  const measurements = await page.evaluate(async () => {
    const { createTinySwordsPersistence } = await import('/island-adapter-fixture.js')
    const results = []
    const get = IDBObjectStore.prototype.get
    const put = IDBObjectStore.prototype.put
    for (const count of [0, 30000]) {
      const repository = await window.openEdgeRepository()
      const videos = Object.fromEntries(Array.from({ length: count }, (_, index) => [String(index), {
        title: `Synthetic video ${index} ${'metadata '.repeat(20)}`, favorite: index === 0,
        watchProgress: index === 0 ? [{ seconds: 90, studyDay: '2026-10-05' }] : []
      }]))
      await repository.save({ ...window.edgeState, videos, tinySwordsIsland: null }, { replace: true })
      let island = { version: 23, resources: { wood: 6 }, tiles: Array.from({ length: 80 }, (_, index) => [index, 0, 'meadow']) }
      await repository.saveIsland(island, 'null') // One-time split is measured separately from warm writes.
      const adapter = createTinySwordsPersistence({
        read() { throw new Error('Checkpoint read the complete profile') },
        readDurable() { throw new Error('Checkpoint normalized the complete profile') },
        save() { throw new Error('Checkpoint used the whole-profile save path') },
        getCheckpointRepository: () => repository
      })
      const other = await window.openEdgeRepository()
      const keys = []
      const bytes = []
      IDBObjectStore.prototype.get = function (key) { if (this.name === 'profiles') keys.push(key); return get.call(this, key) }
      IDBObjectStore.prototype.put = function (value) { if (this.name === 'profiles') bytes.push(JSON.stringify(value).length); return put.call(this, value) }
      const times = []
      for (let index = 0; index < 20; index += 1) {
        const expected = JSON.stringify(island)
        island = { ...island, tick: index }
        const started = performance.now()
        if (!await adapter.save(island, expected)) throw new Error('Synthetic checkpoint rejected')
        if (JSON.stringify(adapter.readIsland().tinySwordsIsland) !== JSON.stringify(island)) throw new Error('Acknowledgment lost the island')
        times.push(performance.now() - started)
        await other.refresh()
        if (other.readIslandState().tinySwordsIsland.tick !== index) throw new Error('Other tab did not refresh')
      }
      IDBObjectStore.prototype.get = get
      IDBObjectStore.prototype.put = put
      const state = repository.snapshot()
      times.sort((a, b) => a - b)
      results.push({ count, videoCount: Object.keys(state.videos).length,
        facts: state.videos['0'] ?? null, keys: [...new Set(keys)], maxHeadBytes: Math.max(...bytes),
        medianMs: times[10], p95Ms: times[19] })
      repository.close(); other.close()
    }
    return results
  })
  for (const measurement of measurements) {
    expect(measurement.keys).toEqual(['active'])
    expect(measurement.maxHeadBytes).toBeLessThan(3000)
    expect(measurement.videoCount).toBe(measurement.count)
  }
  expect(measurements[1].facts.favorite).toBe(true)
  expect(measurements[1].facts.watchProgress).toEqual([{ seconds: 90, studyDay: '2026-10-05' }])
  console.log('Synthetic warm checkpoint timings:', JSON.stringify(measurements.map(({ count, medianMs, p95Ms, maxHeadBytes }) => ({ count, medianMs, p95Ms, maxHeadBytes }))))
})

test('an empty store remains retryable after a failed first save and becomes durable after retry', async ({ page }) => {
  await repositoryFixture(page)
  await page.evaluate(async () => { window.edgeRepository = await window.openEdgeRepository() })
  expect(await page.evaluate(() => localStorage.getItem('synthetic-profile_indexed_db_v1'))).toBe('empty')
  await rejectWrites(page)
  expect(await page.evaluate(() => window.edgeRepository.save(window.edgeState))).toBe(false)
  await page.evaluate(async () => {
    window.restoreProfileWrites()
    window.edgeRepository.close()
    window.edgeRepository = await window.openEdgeRepository()
  })
  expect(await page.evaluate(() => window.edgeRepository.hasProfile())).toBe(false)
  expect(await page.evaluate(() => window.edgeRepository.save(window.edgeState))).toBe(true)
  await page.evaluate(async () => {
    window.edgeRepository.close()
    window.edgeRepository = await window.openEdgeRepository()
  })
  expect(await page.evaluate(() => window.edgeRepository.snapshot())).toEqual({ config: { theme: 'light' }, videos: {}, anki: {} })
  expect(await page.evaluate(() => localStorage.getItem('synthetic-profile_indexed_db_v1'))).toBe('1')
})

test('a failed commit readback restores only the unacknowledged head and retains the previous profile', async ({ page }) => {
  await repositoryFixture(page)
  const result = await page.evaluate(async () => {
    const before = JSON.stringify(window.edgeState)
    localStorage.setItem('synthetic-profile', before)
    const repository = await window.openEdgeRepository()
    const state = repository.snapshot()
    state.config.theme = 'unacknowledged'
    const transaction = IDBDatabase.prototype.transaction
    let interrupted = false
    IDBDatabase.prototype.transaction = function (...args) {
      const result = transaction.apply(this, args)
      if (this.name === 'synthetic_profile_edge_cases' && args[1] === 'readonly' && !interrupted) {
        interrupted = true
        queueMicrotask(() => result.abort())
      }
      return result
    }
    const accepted = await repository.save(state)
    IDBDatabase.prototype.transaction = transaction
    repository.close()
    const reopened = await window.openEdgeRepository()
    const after = reopened.readRaw()
    reopened.close()
    return { accepted, before, after, interrupted }
  })
  expect(result.interrupted).toBe(true)
  expect(result.accepted).toBe(false)
  expect(result.after).toBe(result.before)
})

test('full localStorage and an interrupted opening marker preserve a verified recovery pointer', async ({ page }) => {
  await repositoryFixture(page)
  const before = await page.evaluate(async () => {
    const raw = JSON.stringify(window.edgeState)
    localStorage.setItem('synthetic-profile', raw)
    const set = Storage.prototype.setItem
    Storage.prototype.setItem = function (key, value) {
      if (key === 'synthetic-profile_indexed_db_v1') throw new DOMException('Synthetic marker quota', 'QuotaExceededError')
      return set.call(this, key, value)
    }
    try { await window.openEdgeRepository(); return null } catch {
      Storage.prototype.setItem = set
      return raw
    }
  })
  expect(before).not.toBeNull()
  expect((await head(page, 'legacy-recovery', edgeDatabaseName)).raw).toBe(before)
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('synthetic-profile')).schema)).toBe('edenia-indexed-db-profile-v1')
  await page.evaluate(async () => { window.edgeRepository = await window.openEdgeRepository() })
  expect(await page.evaluate(() => window.edgeRepository.readRaw())).toBe(before)
  expect(await page.evaluate(() => localStorage.getItem('synthetic-profile'))).toBeNull()
})

test('migration readback refuses to delete a legacy value changed by another tab', async ({ page }) => {
  await repositoryFixture(page)
  const result = await page.evaluate(async () => {
    const original = JSON.stringify(window.edgeState)
    const newer = JSON.stringify({ ...window.edgeState, config: { theme: 'dark' } })
    localStorage.setItem('synthetic-profile', original)
    const transaction = IDBDatabase.prototype.transaction
    let reads = 0
    IDBDatabase.prototype.transaction = function (...args) {
      if (this.name === 'synthetic_profile_edge_cases' && args[1] === 'readonly' && ++reads === 2) {
        localStorage.setItem('synthetic-profile', newer)
      }
      return transaction.apply(this, args)
    }
    let opened = false
    try { await window.openEdgeRepository(); opened = true } catch {} finally { IDBDatabase.prototype.transaction = transaction }
    return { original, newer, opened, retained: localStorage.getItem('synthetic-profile') }
  })
  expect(result.opened).toBe(false)
  expect(result.retained).toBe(result.newer)
  expect((await head(page, 'legacy-recovery', edgeDatabaseName)).raw).toBe(result.original)
  expect(await page.evaluate(() => localStorage.getItem('synthetic-profile_indexed_db_v1'))).toBeNull()
})

test('queued mutations render only acknowledged state and a failed predecessor cannot authorize a later save', async ({ page }) => {
  await repositoryFixture(page)
  const result = await page.evaluate(async () => {
    localStorage.setItem('synthetic-profile', JSON.stringify(window.edgeState))
    const repository = await window.openEdgeRepository()
    const state = repository.snapshot()
    state.config.theme = 'first'
    const first = repository.save(state)
    state.config.theme = 'second'
    const second = repository.save(state)
    const firstSaved = await first
    const firstAcknowledgedTheme = state.config.theme
    const secondSaved = await second
    const secondAcknowledgedTheme = state.config.theme
    state.config.theme = 'failed'
    const failed = repository.save(state, { canPersist: () => false })
    state.config.theme = 'must-not-follow-failure'
    const dependent = repository.save(state)
    return { firstSaved, firstAcknowledgedTheme, secondSaved, secondAcknowledgedTheme,
      failed: await failed, dependent: await dependent, durableTheme: repository.snapshot().config.theme }
  })
  expect(result).toEqual({ firstSaved: true, firstAcknowledgedTheme: 'first', secondSaved: true,
    secondAcknowledgedTheme: 'second', failed: false, dependent: false, durableTheme: 'second' })
})

test('queued local rebases retain independent facts, reject conflicting edits and never cross another repository’s revision', async ({ page }) => {
  await repositoryFixture(page)
  const result = await page.evaluate(async () => {
    localStorage.setItem('synthetic-profile', JSON.stringify(window.edgeState))
    const repository = await window.openEdgeRepository()
    const first = repository.snapshot()
    const independent = repository.snapshot()
    independent.anki.day = { reviewed: 8 }
    const addingFacts = repository.save(independent)
    first.config.theme = 'first'
    const savingFirst = repository.save(first)
    first.config.theme = 'second'
    const savingSecond = repository.save(first)
    const accepted = await Promise.all([addingFacts, savingFirst, savingSecond])
    const merged = repository.snapshot()
    const conflictA = repository.snapshot()
    const conflictB = repository.snapshot()
    conflictA.config.theme = 'conflict-a'
    conflictB.config.theme = 'conflict-b'
    const conflicts = await Promise.all([repository.save(conflictA), repository.save(conflictB)])
    const stale = repository.snapshot()
    const other = await window.openEdgeRepository()
    const otherState = other.snapshot()
    otherState.config.theme = 'other-repository'
    await other.save(otherState)
    await repository.refresh()
    const afterOther = repository.snapshot()
    afterOther.config.local = true
    await repository.save(afterOther)
    stale.config.stale = true
    const staleAccepted = await repository.save(stale)
    const durable = repository.snapshot()
    repository.close()
    other.close()
    return { accepted, merged, conflicts, staleAccepted, durable }
  })
  expect(result.accepted).toEqual([true, true, true])
  expect(result.merged.config.theme).toBe('second')
  expect(result.merged.anki.day.reviewed).toBe(8)
  expect(result.conflicts).toEqual([true, false])
  expect(result.staleAccepted).toBe(false)
  expect(result.durable.config).toEqual({ theme: 'other-repository', local: true })
  expect(result.durable.anki.day.reviewed).toBe(8)
})

for (const newerWinner of [false, true]) {
  test(`a fence lost after commit ${newerWinner ? 'preserves a newer transaction' : 'restores only its own exact head'}`, async ({ page }) => {
    await repositoryFixture(page)
    await page.evaluate(async () => {
      localStorage.setItem('synthetic-profile', JSON.stringify(window.edgeState))
      window.edgeRepository = await window.openEdgeRepository()
      window.edgeDatabase = await new Promise((resolve, reject) => {
        const request = indexedDB.open('synthetic_profile_edge_cases', 1)
        request.onsuccess = () => resolve(request.result)
        request.onerror = () => reject(request.error)
      })
    })
    const result = await page.evaluate(async newerWinner => {
      const state = window.edgeRepository.snapshot()
      state.config.theme = 'dark'
      let checks = 0
      const accepted = await window.edgeRepository.save(state, { canPersist: () => {
        if (++checks < 3) return true
        localStorage.setItem('synthetic-access', 'new-owner')
        if (newerWinner && checks === 3) {
          const transaction = window.edgeDatabase.transaction('profiles', 'readwrite')
          transaction.objectStore('profiles').put({ key: 'active', revision: 3,
            raw: JSON.stringify({ ...window.edgeState, config: { theme: 'newer-winner' } }) })
        }
        return false
      } })
      return { accepted, state: window.edgeRepository.snapshot() }
    }, newerWinner)
    expect(result.accepted).toBe(false)
    expect(result.state.config.theme).toBe(newerWinner ? 'newer-winner' : 'light')
    expect(JSON.parse((await head(page, 'active', edgeDatabaseName)).raw).config.theme).toBe(result.state.config.theme)
  })
}

test('stale backup adapters preserve each other’s recovery copies and a failed flush retains durable entries', async ({ page }) => {
  await repositoryFixture(page)
  const source = await readFile(new URL('../../src/state/indexed-db-backups.js', import.meta.url), 'utf8')
  await page.route('**/backup-repository-fixture.js', route => route.fulfill({
    body: source, contentType: 'application/javascript'
  }))
  const result = await page.evaluate(async () => {
    const { createIndexedDbBackupStorage } = await import('/backup-repository-fixture.js')
    const options = { backupKey: 'synthetic-backups', databaseName: 'synthetic_backup_edge_cases',
      cleanupLegacy: true, legacyStorage: localStorage, isValidEntry: entry => Boolean(entry?.id && entry?.state?.config) }
    const entry = id => ({ id, createdAt: '2026-10-03T00:00:00Z', reason: 'synthetic', state: window.edgeState })
    const legacy = entry('legacy')
    localStorage.setItem(options.backupKey, JSON.stringify([legacy]))
    const first = await createIndexedDbBackupStorage(options)
    const second = await createIndexedDbBackupStorage(options)
    first.storage.setItem(options.backupKey, JSON.stringify([entry('first'), legacy]))
    await first.flush()
    second.storage.setItem(options.backupKey, JSON.stringify([entry('second'), legacy]))
    const both = await second.flush()
    // First still knows only about its own addition and the old legacy entry.
    first.storage.setItem(options.backupKey, JSON.stringify([entry('first')]))
    const pruned = await first.flush()
    const put = IDBObjectStore.prototype.put
    IDBObjectStore.prototype.put = function (...args) {
      if (this.name === 'backups') throw new DOMException('Synthetic backup quota', 'QuotaExceededError')
      return put.apply(this, args)
    }
    first.storage.setItem(options.backupKey, JSON.stringify([entry('failed'), ...pruned.entries]))
    const failed = await first.flush()
    IDBObjectStore.prototype.put = put
    first.close()
    second.close()
    const reopened = await createIndexedDbBackupStorage(options)
    const durable = (await reopened.flush()).entries
    reopened.close()
    return { both: both.entries.map(entry => entry.id).sort(), pruned: pruned.entries.map(entry => entry.id).sort(),
      failed: failed.persisted, durable: durable.map(entry => entry.id).sort(), legacyRaw: localStorage.getItem(options.backupKey) }
  })
  expect(result).toEqual({ both: ['first', 'legacy', 'second'], pruned: ['first', 'second'],
    failed: false, durable: ['first', 'second'], legacyRaw: null })
})

for (const [islandOnly, externalWinner] of [[false, false], [true, false], [false, true]]) {
  test(`focus during committed ${islandOnly ? 'island' : 'profile'} readback ${externalWinner ? 'preserves a newer external winner' : 'does not retire its own activation'}`, async ({ page }) => {
    await repositoryFixture(page)
    const result = await page.evaluate(async ([islandOnly, externalWinner]) => {
      localStorage.setItem('synthetic-profile', JSON.stringify({ ...window.edgeState,
        cityProgress: { maxLevelIndex: 3 }, tinySwordsIsland: { version: 23, level: 4, resources: { wood: 6 } } }))
      let active = true
      let notices = 0
      const repository = await window.openEdgeRepository(() => { notices += 1; active = false }, window)
      const state = repository.snapshot()
      const originalTransaction = IDBDatabase.prototype.transaction
      let intercepted = false
      let releaseReadback
      let readbackReady
      const ready = new Promise(resolve => { readbackReady = resolve })
      IDBDatabase.prototype.transaction = function (...args) {
        const transaction = originalTransaction.apply(this, args)
        if (this.name === 'synthetic_profile_edge_cases' && args[1] === 'readonly' && !intercepted) {
          intercepted = true
          transaction.addEventListener('complete', event => {
            event.stopImmediatePropagation()
            releaseReadback = () => transaction.oncomplete.call(transaction, event)
            readbackReady()
          }, { once: true })
        }
        return transaction
      }
      const saving = islandOnly
        ? repository.saveIsland({ ...state.tinySwordsIsland, resources: { wood: 7 } }, JSON.stringify(state.tinySwordsIsland), { canPersist: () => active })
        : repository.save(Object.assign(state, { config: { theme: 'dark' } }), { canPersist: () => active })
      await ready
      if (externalWinner) {
        const other = await window.openEdgeRepository()
        const winner = other.snapshot()
        winner.config.theme = 'external winner'
        await other.save(winner)
        other.close()
      }
      let focusReadReady
      const focusRead = new Promise(resolve => { focusReadReady = resolve })
      let focusIntercepted = false
      IDBDatabase.prototype.transaction = function (...args) {
        const transaction = originalTransaction.apply(this, args)
        if (this.name === 'synthetic_profile_edge_cases' && args[1] === 'readonly' && !focusIntercepted) {
          focusIntercepted = true
          // Finish the focus transaction and its promise callbacks before
          // observing notifications, while the writer's readback stays held.
          transaction.addEventListener('complete', () => setTimeout(focusReadReady, 0), { once: true })
        }
        return transaction
      }
      window.dispatchEvent(new Event('focus'))
      await focusRead
      IDBDatabase.prototype.transaction = originalTransaction
      const noticesBeforeRelease = notices
      releaseReadback()
      const accepted = await saving
      const saved = JSON.parse(repository.readRaw())
      repository.close()
      const reopened = await window.openEdgeRepository()
      const restored = JSON.parse(reopened.readRaw())
      reopened.close()
      return { intercepted, noticesBeforeRelease, notices, accepted, saved, restored }
    }, [islandOnly, externalWinner])
    expect(result.intercepted).toBe(true)
    expect(result.noticesBeforeRelease).toBe(externalWinner ? 1 : 0)
    expect(result.notices).toBe(externalWinner ? 1 : 0)
    expect(result.accepted).toBe(!externalWinner)
    expect(result.restored).toEqual(result.saved)
    expect(result.saved.config.theme).toBe(externalWinner ? 'external winner' : islandOnly ? 'light' : 'dark')
    expect(result.saved.tinySwordsIsland.resources.wood).toBe(islandOnly ? 7 : 6)
  })
}
