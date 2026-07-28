import { expect, test } from '../support/network-fixture.mjs'
import { LEGACY_ACTION_NAMES } from '../../src/compat/legacy-actions.js'

const fixedNow = new Date('2026-07-28T04:00:00.000Z')

test.beforeEach(async ({ page }) => {
  await page.clock.setFixedTime(fixedNow)
})

async function waitForApplication(page) {
  await expect(page.locator('#mainApp')).not.toHaveClass(/\bhidden\b/)
  await page.evaluate(async () => {
    await document.fonts.ready
    await Promise.all([...document.images].map(image => {
      if (image.complete) return image.decode?.().catch(() => {})
      return new Promise(resolve => {
        image.addEventListener('load', resolve, { once: true })
        image.addEventListener('error', resolve, { once: true })
      })
    }))
    await new Promise(resolve => {
      requestAnimationFrame(() => requestAnimationFrame(resolve))
    })
  })
}

async function stabilizeVisuals(page) {
  await page.addStyleTag({
    content: `
      .background-physics {
        visibility: hidden !important;
      }
      .toast {
        visibility: hidden !important;
      }
      * {
        caret-color: transparent !important;
      }
    `
  })
}

async function seedCompletedState(page, locale = 'en') {
  await page.goto('/')
  await waitForApplication(page)
  await page.evaluate(selectedLocale => {
    const state = window.defaultState(4, [], 'light', [], selectedLocale)
    const completedAt = '2026-07-20T04:00:00.000Z'
    state.config.ankiEnabled = false
    state.config.ankiDisabledAt = completedAt
    state.onboarding.introSeenAt = completedAt
    state.onboarding.setupCompleted = true
    state.onboarding.setupCompletedAt = completedAt
    state.onboarding.walkthroughCompleted = true
    state.onboarding.walkthroughCompletedAt = completedAt
    localStorage.setItem('edenia_v1', JSON.stringify(state))
  }, locale)
  await page.reload()
  await waitForApplication(page)
}

test('fresh install boots the protected first-run experience and classic handlers', async ({ page }) => {
  await page.goto('/')
  await waitForApplication(page)

  await expect(page).toHaveTitle('Edenia')
  await expect(page.locator('#introTrailer')).not.toHaveClass(/\bhidden\b/, { timeout: 2_000 })
  await expect(page.locator('#introTrailerTitle')).toHaveText('EDENIA')
  await page.evaluate(() => window.setIntroTrailerScene(0, { autoAdvance: false }))
  await stabilizeVisuals(page)
  await expect(page).toHaveScreenshot('fresh-trailer.png', {
    animations: 'disabled'
  })

  const missingHandlers = await page.evaluate(() => {
    const attributeNames = [
      'onclick',
      'onchange',
      'onsubmit',
      'oninput',
      'onkeydown',
      'onkeyup',
      'onblur',
      'onfocus'
    ]
    const handlerNames = new Set()
    document.querySelectorAll(attributeNames.map(name => `[${name}]`).join(',')).forEach(element => {
      attributeNames.forEach(attributeName => {
        const source = element.getAttribute(attributeName) || ''
        const match = source.match(/^\s*(?:return\s+)?([A-Za-z_$][\w$]*)\s*\(/)
        if (match && match[1] !== 'document') handlerNames.add(match[1])
      })
    })
    return [...handlerNames].filter(name => typeof window[name] !== 'function')
  })

  expect(missingHandlers).toEqual([])
  const legacyActionBridge = await page.evaluate(actionNames => ({
    frozen: Object.isFrozen(window.EdeniaActions),
    missing: actionNames.filter(
      name => typeof window.EdeniaActions?.[name] !== 'function'
        || window[name] !== window.EdeniaActions[name]
    ),
    names: Object.keys(window.EdeniaActions || {}).sort()
  }), LEGACY_ACTION_NAMES)
  expect(legacyActionBridge).toEqual({
    frozen: true,
    missing: [],
    names: LEGACY_ACTION_NAMES
  })
  await expect.poll(() => page.evaluate(() => window.EDENIA_ANALYTICS_ENABLED)).toBe(false)
  await expect.poll(() => page.evaluate(() => window.EDENIA_CONFIG?.youtubeApiKey)).toBe('')
})

test('completed local state preserves settings and feedback interactions', async ({ page }) => {
  await seedCompletedState(page)

  await expect(page.locator('#introTrailer')).toHaveClass(/\bhidden\b/)
  await expect(page.locator('#onboardingPanel')).toHaveClass(/\bhidden\b/)
  await stabilizeVisuals(page)
  await expect(page).toHaveScreenshot('completed-dashboard.png', {
    animations: 'disabled',
    fullPage: true
  })

  await page.locator('.gear-btn').click()
  await expect(page.locator('#settingsPanel')).not.toHaveClass(/\bhidden\b/)
  await expect(page.locator('#settingsLocaleLabel')).toHaveText('English')
  await expect(page).toHaveScreenshot('settings-open.png', {
    animations: 'disabled'
  })
  await page.locator('#settingsCloseBtn').click()

  await page.locator('#feedbackLaunchBtn').click()
  await expect(page.locator('#feedbackModal')).not.toHaveClass(/\bhidden\b/)
  await page.locator('#feedbackMessage').fill('Deterministic migration smoke test')
  if (new URL(page.url()).origin === 'http://localhost:8000') {
    await page.locator('#feedbackSubmitBtn').click()
    await expect(page.locator('#feedbackConfirmation')).not.toHaveClass(/\bhidden\b/)
  }
})

test('sandbox remains isolated on its exact origin', async ({ page }) => {
  await page.goto('http://localhost:8001/?sandbox=1')
  await waitForApplication(page)

  await expect(page.locator('body')).toHaveAttribute('data-sandbox', 'true')
  await expect(page.locator('#sandboxTools')).not.toHaveClass(/\bhidden\b/)

  const storageKeys = await page.evaluate(() => ({
    normal: localStorage.getItem('edenia_v1'),
    sandbox: localStorage.getItem('edenia_v1_sandbox')
  }))
  expect(storageKeys.normal).toBeNull()
  expect(storageKeys.sandbox).not.toBeNull()
})

test('all five locales initialize and persist through the rendered Settings flow', async ({
  page
}, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-standard')

  const expectedSettingsTitles = {
    en: 'Settings',
    'zh-Hant': '設定',
    'zh-Hans': '设置',
    es: 'Ajustes',
    fr: 'Réglages'
  }

  for (const [locale, expectedTitle] of Object.entries(expectedSettingsTitles)) {
    await seedCompletedState(page, locale)
    await expect(page.locator('html')).toHaveAttribute('lang', locale)
    await page.locator('.gear-btn').click()
    await expect(page.locator('#settingsTitle')).toHaveText(expectedTitle)
    await page.locator('#settingsCloseBtn').click()
  }
})

test('Study Insight listeners preserve tabs, persistence, focus, and event ordering', async ({
  page
}, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-standard')

  await seedCompletedState(page)
  await page.evaluate(() => {
    const state = JSON.parse(localStorage.getItem('edenia_v1'))
    state.videos['insight-history-video'] = {
      id: 'insight-history-video',
      title: 'Protected insight history',
      channelId: 'insight-channel',
      channelTitle: 'Insight channel',
      duration: 900,
      status: 'watched',
      watchedAt: '2026-07-20T10:00:00.000Z',
      watchProgress: [{
        watchedAt: '2026-07-20T10:00:00.000Z',
        seconds: 900
      }],
      watchProgressTracked: true
    }
    state.config.studyInsights = {
      enabled: true,
      collapsed: false,
      history: [{
        key: '2026-07-13:routine-reset',
        insightId: 'routine-reset',
        type: 'routine-reset',
        variant: 0,
        suggestedMinutes: 15,
        gapDays: 4,
        recordedAt: '2026-07-21T04:00:00.000Z'
      }]
    }
    localStorage.setItem('edenia_v1', JSON.stringify(state))
  })
  await page.reload()
  await waitForApplication(page)

  const card = page.locator('#studyInsightCard')
  const currentTab = page.locator('#studyInsightCurrentTab')
  const previousTab = page.locator('#studyInsightPreviousTab')
  const historyPanel = page.locator('#studyInsightHistoryPanel')
  await expect(card).not.toHaveClass(/\bhidden\b/)
  await expect(previousTab).toBeEnabled()

  await previousTab.locator('span').first().click()
  await expect(previousTab).toHaveAttribute('aria-selected', 'true')
  await expect(historyPanel).not.toHaveClass(/\bhidden\b/)
  await currentTab.click()
  await expect(currentTab).toHaveAttribute('aria-selected', 'true')

  await page.evaluate(() => {
    window.__studyInsightCollapsedAtDocumentBubble = null
    document.addEventListener('click', event => {
      if (!event.target.closest('.study-insight-collapse')) return
      const state = JSON.parse(localStorage.getItem('edenia_v1'))
      window.__studyInsightCollapsedAtDocumentBubble =
        state.config.studyInsights.collapsed
    }, { once: true })
  })
  await page.locator('.study-insight-collapse').click()
  await expect(card).toHaveClass(/\bhidden\b/)
  await expect(page.locator('#studyInsightReopen')).not.toHaveClass(/\bhidden\b/)
  await expect(page.locator('#studyInsightReopen')).toBeFocused()
  await expect.poll(() => page.evaluate(
    () => window.__studyInsightCollapsedAtDocumentBubble
  )).toBe(true)

  await page.locator('#studyInsightReopen span[data-i18n="insights.reopen"]').click()
  await expect(card).not.toHaveClass(/\bhidden\b/)
  await expect(currentTab).toBeFocused()
  await expect.poll(() => page.evaluate(() => (
    JSON.parse(localStorage.getItem('edenia_v1')).config.studyInsights.collapsed
  ))).toBe(false)

  const removedBridgeActions = await page.evaluate(() => ({
    setStudyInsightView: Object.prototype.hasOwnProperty.call(
      window.EdeniaActions,
      'setStudyInsightView'
    ),
    setStudyInsightsCollapsed: Object.prototype.hasOwnProperty.call(
      window.EdeniaActions,
      'setStudyInsightsCollapsed'
    )
  }))
  expect(removedBridgeActions).toEqual({
    setStudyInsightView: false,
    setStudyInsightsCollapsed: false
  })
})

test('Settings accordion listeners preserve mouse, keyboard, reset, and ordering', async ({
  page
}, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-standard')

  await seedCompletedState(page)
  await page.locator('.gear-btn').click()
  const controls = [
    {
      toggle: page.locator('.settings-howto-toggle'),
      content: page.locator('#settingsHowToContent'),
      group: page.locator('.settings-howto-group')
    },
    {
      toggle: page.locator('.activity-log-toggle'),
      content: page.locator('#activityLogContent'),
      group: page.locator('.activity-log-panel')
    },
    {
      toggle: page.locator('.backup-toggle'),
      content: page.locator('#backupContent'),
      group: page.locator('.backup-panel')
    }
  ]

  for (const control of controls) {
    await expect(control.content).toBeHidden()
    await expect(control.toggle).toHaveAttribute('aria-expanded', 'false')
    await expect(control.group).not.toHaveClass(/\bopen\b/)
  }

  await page.evaluate(() => {
    window.__settingsHowToOpenAtDocumentBubble = null
    document.addEventListener('click', event => {
      if (!event.target.closest('.settings-howto-toggle')) return
      window.__settingsHowToOpenAtDocumentBubble =
        !document.getElementById('settingsHowToContent').hidden
    }, { once: true })
  })
  await controls[0].toggle.locator('[data-i18n="settings.howto.title"]').click()
  await expect(controls[0].content).toBeVisible()
  await expect(controls[0].toggle).toHaveAttribute('aria-expanded', 'true')
  await expect(controls[0].group).toHaveClass(/\bopen\b/)
  await expect.poll(() => page.evaluate(
    () => window.__settingsHowToOpenAtDocumentBubble
  )).toBe(true)

  await controls[1].toggle.focus()
  await controls[1].toggle.press('Enter')
  await expect(controls[1].content).toBeVisible()
  await expect(controls[1].toggle).toHaveAttribute('aria-expanded', 'true')

  await controls[2].toggle.focus()
  await controls[2].toggle.press('Space')
  await expect(controls[2].content).toBeVisible()
  await expect(controls[2].toggle).toHaveAttribute('aria-expanded', 'true')

  await page.locator('#settingsCloseBtn').click()
  await page.locator('.gear-btn').click()
  for (const control of controls) {
    await expect(control.content).toBeHidden()
    await expect(control.toggle).toHaveAttribute('aria-expanded', 'false')
    await expect(control.group).not.toHaveClass(/\bopen\b/)
  }

  const removedBridgeActions = await page.evaluate(() => ({
    toggleSettingsHowTo: Object.prototype.hasOwnProperty.call(
      window.EdeniaActions,
      'toggleSettingsHowTo'
    ),
    toggleSettingsActivityLog: Object.prototype.hasOwnProperty.call(
      window.EdeniaActions,
      'toggleSettingsActivityLog'
    ),
    toggleSettingsBackups: Object.prototype.hasOwnProperty.call(
      window.EdeniaActions,
      'toggleSettingsBackups'
    )
  }))
  expect(removedBridgeActions).toEqual({
    toggleSettingsHowTo: false,
    toggleSettingsActivityLog: false,
    toggleSettingsBackups: false
  })
})

test('Study History view listeners preserve persistence, keyboard, and ordering', async ({
  page
}, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-standard')

  await seedCompletedState(page)
  const summaryTab = page.locator('[data-history-view="summary"]')
  const heatmapTab = page.locator('[data-history-view="heatmap"]')
  const summaryView = page.locator('#historySummaryView')
  const heatmapView = page.locator('#historyHeatmapView')
  await expect(summaryTab).toHaveClass(/\bactive\b/)
  await expect(summaryTab).toHaveAttribute('aria-selected', 'true')
  await expect(summaryView).not.toHaveClass(/\bhidden\b/)
  await expect(heatmapView).toHaveClass(/\bhidden\b/)

  await page.evaluate(() => {
    window.__historyViewAtDocumentBubble = null
    document.addEventListener('click', event => {
      if (!event.target.closest('[data-history-view="heatmap"]')) return
      const state = JSON.parse(localStorage.getItem('edenia_v1'))
      window.__historyViewAtDocumentBubble = state.config.historyView
    }, { once: true })
  })
  await heatmapTab.click()
  await expect(heatmapTab).toHaveClass(/\bactive\b/)
  await expect(heatmapTab).toHaveAttribute('aria-selected', 'true')
  await expect(summaryView).toHaveClass(/\bhidden\b/)
  await expect(heatmapView).not.toHaveClass(/\bhidden\b/)
  await expect.poll(() => page.evaluate(
    () => window.__historyViewAtDocumentBubble
  )).toBe('heatmap')

  await page.reload()
  await waitForApplication(page)
  await expect(heatmapTab).toHaveClass(/\bactive\b/)
  await expect(heatmapTab).toHaveAttribute('aria-selected', 'true')

  await summaryTab.focus()
  await summaryTab.press('Enter')
  await expect(summaryTab).toHaveClass(/\bactive\b/)
  await expect(summaryTab).toHaveAttribute('aria-selected', 'true')
  await expect(summaryView).not.toHaveClass(/\bhidden\b/)
  await expect(heatmapView).toHaveClass(/\bhidden\b/)
  await expect.poll(() => page.evaluate(() => (
    JSON.parse(localStorage.getItem('edenia_v1')).config.historyView
  ))).toBe('summary')

  await heatmapTab.focus()
  await heatmapTab.press('Space')
  await expect(heatmapTab).toHaveAttribute('aria-selected', 'true')

  const removedBridgeAction = await page.evaluate(() => (
    Object.prototype.hasOwnProperty.call(window.EdeniaActions, 'setHistoryView')
  ))
  expect(removedBridgeAction).toBe(false)
})
