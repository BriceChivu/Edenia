import { expect, test } from '../support/network-fixture.mjs'

for (const experience of [
  { name: 'public', url: '/', key: 'edenia_v1' },
  { name: 'internal', url: '/?internal_test=2', key: 'edenia_v1_internal_test_2' }
]) test(`${experience.name} Recent backups expands older copies and confirms restoration`, async ({ page }, testInfo) => {
  test.skip(!['desktop-standard', 'phone-standard'].includes(testInfo.project.name))
  await page.clock.setFixedTime(new Date('2026-10-20T08:00:00.000Z'))
  await page.route('**/config.local.js', route => route.fulfill({
    contentType: 'text/javascript', body: `window.EDENIA_CONFIG = ${JSON.stringify({
      youtubeApiKey: '', freePlusEnabled: false, accountFeaturesRollout: 'off',
      indexedDbBackupsEnabled: false, indexedDbProfileEnabled: false,
      supabaseUrl: '', supabasePublishableKey: ''
    })}`
  }))
  await page.goto(experience.url)
  await expect(page.locator('#mainApp')).toBeVisible()
  await page.evaluate(({ key }) => {
    const state = window.defaultState(4, [], 'light', [], 'en')
    const completedAt = '2026-10-19T04:00:00.000Z'
    state.config.ankiEnabled = false
    state.config.ankiDisabledAt = completedAt
    state.config.weeklyGoalHours = 4
    Object.assign(state.onboarding, { introSeenAt: completedAt, setupCompleted: true,
      setupCompletedAt: completedAt, walkthroughCompleted: true, walkthroughCompletedAt: completedAt })
    localStorage.setItem(key, JSON.stringify(state))
    const entries = Array.from({ length: 6 }, (_, index) => {
      const saved = structuredClone(state)
      saved.config.weeklyGoalHours = 7
      return { id: `backup-${index}`, createdAt: new Date(Date.parse('2026-10-20T08:00:00Z') - index * 60_000).toISOString(),
        reason: index === 0 ? 'before reset' : 'before sync import', sandbox: false, state: saved }
    })
    localStorage.setItem(`${key}_backups`, JSON.stringify(entries))
  }, experience)
  await page.reload()
  await expect(page.locator('#mainApp')).toBeVisible()
  await page.locator('.gear-btn').click()
  await expect(page.locator('.backup-toggle')).toContainText('Recent backups')
  await expect(page.locator('#backupContent')).toBeHidden()
  await expect(page.locator('#startOverUndo, #learnerProfileConflictRecovery')).toHaveCount(0)
  await page.locator('.backup-toggle').click()
  await expect(page.locator('#backupList .backup-item')).toHaveCount(4)
  await expect(page.locator('#backupList')).toContainText('Before starting over')
  await expect(page.locator('#backupList')).toContainText('This browser only')
  await page.locator('#backupShowOlder').click()
  const retainedCount = await page.evaluate(key => JSON.parse(localStorage.getItem(`${key}_backups`)).length, experience.key)
  expect(retainedCount).toBeGreaterThanOrEqual(6)
  await expect(page.locator('#backupList .backup-item')).toHaveCount(retainedCount)
  await expect(page.locator('#backupShowOlder')).toBeHidden()
  await page.screenshot({ path: testInfo.outputPath(`${experience.name}-recent-backups.png`), fullPage: true })
  const button = page.locator('[data-backup-id="backup-5"]')
  const before = await page.evaluate(key => localStorage.getItem(key), experience.key)
  await button.click()
  await expect(page.locator('#backupRestoreDialog')).toBeVisible()
  await expect(page.locator('#backupRestoreCancel')).toBeFocused()
  await expect(page.locator('#backupRestoreBody')).toContainText('in this browser')
  await expect(page.locator('#backupRestoreBody')).toContainText('backed up first')
  expect(await page.evaluate(key => localStorage.getItem(key), experience.key)).toBe(before)
  await page.keyboard.press('Tab')
  await expect(page.locator('#backupRestoreConfirm')).toBeFocused()
  await page.keyboard.press('Tab')
  await expect(page.locator('#backupRestoreCancel')).toBeFocused()
  await page.screenshot({ path: testInfo.outputPath(`${experience.name}-restore-confirmation.png`), fullPage: true })
  await page.locator('#backupRestoreCancel').click()
  await expect(button).toBeFocused()
  expect(await page.evaluate(key => localStorage.getItem(key), experience.key)).toBe(before)
  await button.click()
  await page.keyboard.press('Escape')
  await expect(page.locator('#backupRestoreDialog')).toBeHidden()
  await expect(page.locator('#settingsPanel')).toBeVisible()
  await button.click()
  await page.locator('#backupRestoreConfirm').click()
  await expect(page.locator('#backupRestoreDialog')).toBeHidden()
  await expect(page.locator('#toast')).toHaveText('Backup restored')
  expect(await page.evaluate(key => JSON.parse(localStorage.getItem(key)).config.weeklyGoalHours, experience.key)).toBe(7)
  const rollback = await page.evaluate(key => JSON.parse(localStorage.getItem(`${key}_backups`))
    .find(entry => entry.reason === 'before backup restore'), experience.key)
  expect(rollback.state.config.weeklyGoalHours).toBe(4)
  const geometry = await page.locator('#backupContent').evaluate(element => ({
    width: element.clientWidth, scroll: element.scrollWidth,
    document: document.documentElement.scrollWidth, viewport: document.documentElement.clientWidth
  }))
  expect(geometry.scroll).toBeLessThanOrEqual(geometry.width)
  expect(geometry.document).toBeLessThanOrEqual(geometry.viewport)
})
