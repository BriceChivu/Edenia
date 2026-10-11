import { expect, test } from '../support/network-fixture.mjs'

for (const boundary of ['before-save', 'after-commit']) {
  test(`closed primary connection ${boundary} recovers quietly across background, reload and return`, async ({ page }) => {
    const events = []
    const key = 'edenia_v1_internal_test_2'
    const databaseName = `${key}_profiles_indexed_db_v1`
    const localOrigin = `http://localhost:${Number(process.env.EDENIA_TEST_NORMAL_PORT || 8000)}`
    await page.route('https://us.i.posthog.com/capture/', route => {
      events.push(route.request().postDataJSON())
      return route.fulfill({ json: { status: 1 } })
    })
    await page.route('https://edenia.study/**', async route => {
      const url = new URL(route.request().url())
      // This storage test does not exercise trailer streaming across reloads.
      if (url.pathname.endsWith('.mp4')) return route.fulfill({ status: 204, body: '' })
      if (url.pathname === '/config.local.js') return route.fulfill({ contentType: 'application/javascript',
        body: 'window.EDENIA_CONFIG = { indexedDbProfileEnabled: true, accountFeaturesRollout: "off", learnerProfileLifecycleEnabled: false, storageRecoveryTestRunId: "closed-connection-436" }' })
      const response = await route.fetch({ url: `${localOrigin}${url.pathname}${url.search}` })
      return route.fulfill({ response })
    })
    await page.addInitScript(({ databaseName }) => {
      window.testClosedConnections = []
      const open = IDBFactory.prototype.open
      IDBFactory.prototype.open = function (...args) {
        const request = open.apply(this, args)
        if (args[0] === databaseName) request.addEventListener('success', () => window.testClosedConnections.push(request.result))
        return request
      }
      Object.defineProperty(document, 'visibilityState', { configurable: true,
        get: () => sessionStorage.getItem('hold-recovery-436') ? 'hidden' : 'visible' })
    }, { databaseName })
    await page.goto('https://edenia.study/?internal_test=2')
    await expect(page.getByRole('button', { name: 'Continue', exact: true })).toBeVisible()
    await expect.poll(() => page.evaluate(() => stateBackupStorageReady && applicationStarted)).toBe(true)
    await page.evaluate(async () => {
      const state = loadState()
      state.config.ankiEnabled = false
      state.config.weeklyGoalHours = 7
      if (!await saveState(state)) throw new Error('Baseline save failed')
    })
    const saved = await page.evaluate(async ({ boundary, databaseName }) => {
      sessionStorage.setItem('hold-recovery-436', '1')
      document.dispatchEvent(new Event('visibilitychange'))
      if (boundary === 'before-save') window.testClosedConnections.forEach(database => database.close())
      else {
        const transaction = IDBDatabase.prototype.transaction
        IDBDatabase.prototype.transaction = function (...args) {
          const result = transaction.apply(this, args)
          if (this.name === databaseName && args[1] === 'readwrite') {
            IDBDatabase.prototype.transaction = transaction
            result.addEventListener('complete', () => this.close(), { once: true })
          }
          return result
        }
      }
      const state = loadState()
      state.config.weeklyGoalHours = 8
      return { saved: await saveState(state), goal: loadState().config.weeklyGoalHours,
        recovery: profileRecoveryWorkspace.isActive(), context: profileRecoveryWorkspace.getDiagnosticContext() }
    }, { boundary, databaseName })
    expect(saved.saved).toBe(true)
    expect(saved.goal).toBe(8)
    expect(saved.recovery).toBe(true)
    await expect.poll(() => events.filter(event => event.properties?.storage_recovery_outcome === 'failure').length).toBeGreaterThan(0)
    const failed = events.find(event => event.properties?.storage_recovery_outcome === 'failure')
    expect(failed.properties.feedback_message).toContain('[TEST: closed-connection-436]')
    expect(failed.properties.feedback_message).toContain('InvalidStateError')
    expect(failed.properties.feedback_message).toContain('transaction-open')
    expect(failed.properties.feedback_message).toContain('primary-profile')
    expect(failed.properties.storage_recovery_incident_id).toBe(saved.context.incidentId)
    await expect(page.locator('#onboardingPanel.is-recovery')).toBeHidden()
    await expect(page.locator('#localProgressConflict')).toBeHidden()
    await page.reload()
    await expect.poll(() => page.evaluate(() => stateBackupStorageReady && applicationStarted)).toBe(true)
    expect(await page.evaluate(() => loadState().config.weeklyGoalHours)).toBe(8)
    expect(await page.evaluate(() => profileRecoveryWorkspace.getDiagnosticContext()?.incidentId)).toBe(saved.context.incidentId)
    await page.evaluate(() => {
      sessionStorage.removeItem('hold-recovery-436')
      document.dispatchEvent(new Event('visibilitychange'))
      window.dispatchEvent(new Event('focus'))
    })
    await expect.poll(() => page.evaluate(() => profileRecoveryWorkspace.isActive())).toBe(false)
    await expect.poll(() => events.some(event => event.properties?.storage_recovery_outcome === 'recovered'
      && event.properties.storage_recovery_incident_id === saved.context.incidentId)).toBe(true)
    const completed = events.find(event => event.properties?.storage_recovery_outcome === 'recovered'
      && event.properties.storage_recovery_incident_id === saved.context.incidentId)
    expect(completed.properties.feedback_message).toContain('[TEST: closed-connection-436] Storage recovery completed')
    expect(completed.properties.feedback_category).toBe('other')
    await page.reload()
    await expect.poll(() => page.evaluate(() => stateBackupStorageReady && applicationStarted)).toBe(true)
    expect(await page.evaluate(() => loadState().config.weeklyGoalHours)).toBe(8)
    await expect(page.locator('#onboardingPanel.is-recovery')).toBeHidden()
    await expect(page.locator('#localProgressConflict')).toBeHidden()
  })
}
