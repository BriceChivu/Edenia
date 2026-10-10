import { expect, test } from '../support/network-fixture.mjs'
import { readRecoveryRecord } from '../support/profile-recovery-fixture.mjs'
const key = 'edenia_v1_internal_test_2'
test('healthy IndexedDB preserves later progress when a large recovery archive exceeds Web Storage quota', async ({ page }) => {
  await page.route('**/config.local.js*', route => route.fulfill({ body: 'window.EDENIA_CONFIG = {indexedDbProfileEnabled:true, accountFeaturesRollout:"off", learnerProfileLifecycleEnabled:false}', contentType: 'application/javascript' }))
  await page.goto('/?internal_test=2')
  await page.getByRole('button', { name: 'Continue', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'What language are you learning?', exact: true })).toBeVisible()
  await page.evaluate(async () => {
    const state = loadState()
    const at = new Date().toISOString()
    state.videos = Object.fromEntries(Array.from({ length: 1600 }, (_, index) => {
      const id = `library${String(index).padStart(4, '0')}`
      return [id, { id, title: `Library lesson ${index} ${'metadata '.repeat(70)}`,
        metadataFetchedAt: at, duration: 600, status: 'partial', resumeAtSeconds: 90,
        watchProgress: [{ seconds: 90, watchedAt: at, studyDay: '2026-10-03', experienceSeconds: 90 }], watchProgressTracked: true }]
    }))
    state.anki['2026-10-10'] = { reviewed: 1, created: 0 }
    await saveState(state, { backup: false })
    window.denyCapacityProfileWrites = true
    const put = IDBObjectStore.prototype.put
    IDBObjectStore.prototype.put = function (...args) {
      if (window.denyCapacityProfileWrites && this.name === 'profiles') throw new DOMException('fixture failure', 'SecurityError')
      return put.apply(this, args)
    }
    const edit = loadState()
    edit.anki['2026-10-10'].reviewed = 7
    await saveState(edit)
    window.denyCapacityProfileWrites = false
    await reconcileBackgroundProfileRecovery()
    const later = loadState()
    later.anki['2026-10-10'].reviewed = 8
    await saveState(later)
    await reconcileBackgroundProfileRecovery()
  })
  expect(await page.evaluate(() => loadState().anki['2026-10-10'].reviewed)).toBe(8)
  const archive = await readRecoveryRecord(page, key)
  expect(archive.status).toBe('archived')
  const originals = [archive.originalProfile, ...(archive.protectedOriginalProfiles || [])].filter(Boolean)
  expect(originals.some(raw => JSON.parse(raw).anki['2026-10-10'].reviewed === 1)).toBe(true)
  expect(Object.keys(JSON.parse(archive.values[key]).videos)).toHaveLength(1600)
  await page.reload()
  await expect(page.getByRole('heading', { name: 'What language are you learning?', exact: true })).toBeVisible()
  expect(await page.evaluate(() => loadState().anki['2026-10-10'].reviewed)).toBe(8)
  expect(await page.evaluate(() => Object.keys(loadState().videos).length)).toBe(1600)
})
