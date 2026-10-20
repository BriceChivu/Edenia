import { build } from 'esbuild'
import { expect, test } from '../support/network-fixture.mjs'
import { readRecoveryRecord } from '../support/profile-recovery-fixture.mjs'

const { outputFiles } = await build({ entryPoints: ['src/state/profile-recovery-workspace.js'],
  bundle: true, write: false, format: 'iife', globalName: 'RecoveryCleanup' })

test('real Web Storage quota is reclaimed after journal acknowledgement and on legacy reopening', async ({ page }) => {
  await page.route('**/recovery-cleanup.html', route => route.fulfill({ contentType: 'text/html',
    body: '<!doctype html><title>Recovery fixture</title><script src="/recovery-cleanup.js"></script>' }))
  await page.route('**/recovery-cleanup.js', route => route.fulfill({ contentType: 'application/javascript', body: outputFiles[0].text }))
  await page.goto('/recovery-cleanup.html')
  const before = await page.evaluate(async () => {
    localStorage.setItem('unrelated-cache', 'x'.repeat(800_000))
    const profile = JSON.stringify({ config: {}, study: 'x'.repeat(1_870_000) })
    const workspace = RecoveryCleanup.createProfileRecoveryWorkspace({
      storageKey: 'cleanup-profile', accessKey: 'cleanup-access', keys: ['backup'],
      getPrimary: () => localStorage, getSecondary: () => sessionStorage,
      indexedDb: indexedDB, eventTarget: window, capture: () => ({ profile })
    })
    await workspace.initialize()
    workspace.activate()
    const key = 'cleanup-profile_recovery_workspace_v1'
    const fallback = localStorage.getItem(key)
    if (!fallback) throw new Error('The fixture must first use actual localStorage')
    sessionStorage.setItem('original-fallback', fallback)
    const edit = workspace.repository.snapshot()
    edit.study += 'edited'
    const saved = await workspace.repository.save(edit, { replace: true })
    const tier = workspace.getTier()
    const retired = localStorage.getItem(key) === null && sessionStorage.getItem(key) === null
    const completed = await workspace.complete()
    workspace.storage.setItem('backup', 'x'.repeat(1_350_000))
    const active = workspace.isActive()
    localStorage.removeItem('backup')
    // Simulate reopening a stale copy left behind by a preceding release.
    localStorage.setItem(key, fallback)
    return { saved, tier, retired, completed, active }
  })
  expect(before).toEqual({ saved: true, tier: 'indexed-db', retired: true, completed: true, active: false })
  const archived = await readRecoveryRecord(page, 'cleanup-profile')
  expect(archived.status).toBe('archived')
  expect(JSON.parse(archived.values['cleanup-profile']).study.endsWith('edited')).toBe(true)
  await page.reload()
  const reopened = await page.evaluate(async () => {
    const workspace = RecoveryCleanup.createProfileRecoveryWorkspace({
      storageKey: 'cleanup-profile', accessKey: 'cleanup-access', keys: ['backup'],
      getPrimary: () => localStorage, getSecondary: () => sessionStorage,
      indexedDb: indexedDB, eventTarget: window
    })
    await workspace.initialize()
    return { pending: workspace.hasPending(), local: localStorage.getItem('cleanup-profile_recovery_workspace_v1'),
      unrelatedChars: localStorage.getItem('unrelated-cache').length }
  })
  expect(reopened).toEqual({ pending: false, local: null, unrelatedChars: 800_000 })
  expect(await readRecoveryRecord(page, 'cleanup-profile')).toEqual(archived)
})
