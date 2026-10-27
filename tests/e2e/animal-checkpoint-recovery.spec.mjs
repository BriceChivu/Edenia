import { readFile } from 'node:fs/promises'
import { expect, test } from '../support/network-fixture.mjs'
import { readRecoveryRecord } from '../support/profile-recovery-fixture.mjs'

const key = 'edenia_v1_internal_test_2'
const databaseName = `${key}_profiles_indexed_db_v1`
const initial = JSON.parse(await readFile(new URL('../fixtures/tiny-swords-animal-v39.json', import.meta.url), 'utf8'))

async function openCheckpointProfile(page) {
  let enabled = false
  await page.route('**/config.local.js*', route => route.fulfill({ contentType: 'text/javascript',
    body: `window.EDENIA_CONFIG=${JSON.stringify({ tinySwordsEnabled: false,
      accountFeaturesRollout: 'off', learnerProfileLifecycleEnabled: false,
      indexedDbProfileEnabled: enabled, indexedDbBackupsEnabled: enabled,
      storageRecoveryTestRunId: 'animal-checkpoint-recovery' })}` }))
  await page.addInitScript(() => {
    Object.defineProperty(document, 'visibilityState', { configurable: true,
      get: () => sessionStorage.getItem('hold-animal-recovery') === '1' ? 'hidden' : 'visible' })
  })
  await page.goto('./?internal_test=2')
  await page.waitForFunction(() => typeof defaultState === 'function')
  await page.evaluate(({ key, initial }) => {
    const at = new Date().toISOString()
    const state = defaultState(4, [], 'light', [], 'en')
    state.config.ankiEnabled = false
    Object.assign(state.onboarding, { introSeenAt: at, setupCompleted: true,
      setupCompletedAt: at, walkthroughCompleted: true, walkthroughCompletedAt: at,
      levelUpGuidanceShownAt: at, islandAnnouncementSeenAt: at })
    state.tinySwordsIsland = initial
    localStorage.setItem(key, JSON.stringify(state))
  }, { key, initial })
  enabled = true
  await page.reload({ waitUntil: 'domcontentloaded' })
  await expect(page.locator('#mainApp')).toBeVisible()
  return page.evaluate(async key => {
    const binding = { ownerId: null, profileId: `accountless:${key}`, generation: null, revision: null }
    if (!await saveState(loadState(), { backup: false, syncAnalytics: false, syncCloud: false })) {
      throw new Error('Initial native study save failed')
    }
    const repository = getProfileRepository()
    const canonical = repository.snapshot().tinySwordsIsland
    const moved = structuredClone(canonical)
    moved.sheep[0][0] += 16
    if (!await repository.saveAnimalCheckpoint(moved, JSON.stringify(canonical), { binding })) {
      throw new Error('Initial position checkpoint failed')
    }
    sessionStorage.setItem('hold-animal-recovery', '1')
    return { canonical, moved, replacementRevision: repository.getReplacementRevision() }
  }, key)
}

async function primaryFacts(page) {
  return page.evaluate(databaseName => new Promise((resolve, reject) => {
    const request = indexedDB.open(databaseName, 1)
    request.onupgradeneeded = () => request.transaction.abort()
    request.onerror = () => reject(request.error)
    request.onsuccess = () => {
      const database = request.result
      const transaction = database.transaction('profiles', 'readonly')
      const store = transaction.objectStore('profiles')
      const head = store.get('active'), body = store.get('active-body'), animal = store.get('animal-checkpoint')
      transaction.oncomplete = () => {
        const saved = head.result
        const profile = JSON.parse(saved.raw ?? body.result.raw)
        if (saved.islandRaw !== undefined) profile.tinySwordsIsland = saved.islandRaw === null ? undefined : JSON.parse(saved.islandRaw)
        database.close()
        resolve({ profile, animal: animal.result ? JSON.parse(animal.result.layoutRaw) : null,
          replacementRevision: saved.replacementRevision || 0 })
      }
      transaction.onabort = () => { database.close(); reject(transaction.error) }
    }
  }), databaseName)
}

async function failFullProfileWrites(page) {
  await page.evaluate(() => {
    const put = IDBObjectStore.prototype.put
    window.restoreAnimalProfileWrites = () => { IDBObjectStore.prototype.put = put }
    IDBObjectStore.prototype.put = function (value, ...args) {
      if (this.name === 'profiles' && value.key === 'active-body') {
        throw new DOMException('Synthetic animal recovery quota', 'QuotaExceededError')
      }
      return put.call(this, value, ...args)
    }
  })
}

async function promoteRecovery(page) {
  await page.evaluate(() => {
    window.restoreAnimalProfileWrites?.()
    sessionStorage.removeItem('hold-animal-recovery')
    window.dispatchEvent(new Event('focus'))
  })
  await expect.poll(async () => (await readRecoveryRecord(page, key))?.status).toBe('archived')
  await expect.poll(() => page.evaluate(() => !profileRecoveryWorkspace.isActive() && primaryProfileRepository !== null)).toBe(true)
}

test('a failed full study save retains acknowledged animal positions in recovery, reload and promotion', async ({ page }) => {
  test.setTimeout(60000)
  const { canonical, moved } = await openCheckpointProfile(page)
  await failFullProfileWrites(page)
  const result = await page.evaluate(async () => {
    const state = loadState()
    const at = '2026-10-27T00:00:00.000Z'
    state.videos.animalRecoveryLesson = { id: 'animalRecoveryLesson', title: 'Recovery study fact',
      duration: 300, status: 'partial', resumeAtSeconds: 25, watchProgressTracked: true,
      watchProgress: [{ seconds: 25, experienceSeconds: 25, watchedAt: at, studyDay: '2026-10-27' }] }
    const saved = await saveState(state, { backup: false, syncAnalytics: false })
    return { saved, recovery: profileRecoveryWorkspace.isActive(), profile: loadState() }
  })
  expect(result.saved).toBe(true)
  expect(result.recovery).toBe(true)
  expect(result.profile.tinySwordsIsland).toEqual(moved)
  expect(result.profile.videos.animalRecoveryLesson.resumeAtSeconds).toBe(25)
  const original = await primaryFacts(page)
  expect(original.profile.tinySwordsIsland).toEqual(canonical)
  expect(original.profile.videos.animalRecoveryLesson).toBeUndefined()
  expect(original.animal).toEqual(moved)
  await page.reload({ waitUntil: 'domcontentloaded' })
  await expect(page.locator('#mainApp')).toBeVisible()
  expect(await page.evaluate(() => loadState().tinySwordsIsland)).toEqual(moved)
  expect(await page.evaluate(() => loadState().videos.animalRecoveryLesson.resumeAtSeconds)).toBe(25)
  await promoteRecovery(page)
  const promoted = await primaryFacts(page)
  expect(promoted.profile.tinySwordsIsland).toEqual(moved)
  expect(promoted.profile.videos.animalRecoveryLesson.resumeAtSeconds).toBe(25)
  await page.reload({ waitUntil: 'domcontentloaded' })
  await expect(page.locator('#mainApp')).toBeVisible()
  expect(await page.evaluate(() => loadState().tinySwordsIsland)).toEqual(moved)
  expect(await page.evaluate(() => loadState().videos.animalRecoveryLesson.resumeAtSeconds)).toBe(25)
})

test('an explicit island reset clears old positions through recovery and advances the promotion boundary', async ({ page }) => {
  test.setTimeout(60000)
  const { canonical, moved, replacementRevision } = await openCheckpointProfile(page)
  await failFullProfileWrites(page)
  const result = await page.evaluate(async () => {
    const state = loadState()
    const saved = await saveState(state, { backup: false, syncAnalytics: false, replaceIsland: true })
    return { saved, recovery: profileRecoveryWorkspace.isActive(), island: loadState().tinySwordsIsland }
  })
  expect(result.saved).toBe(true)
  expect(result.recovery).toBe(true)
  expect(result.island).toEqual(canonical)
  expect(result.island).not.toEqual(moved)
  await promoteRecovery(page)
  const promoted = await primaryFacts(page)
  expect(promoted.profile.tinySwordsIsland).toEqual(canonical)
  expect(promoted.animal).toBeNull()
  expect(promoted.replacementRevision).toBeGreaterThan(replacementRevision)
})
