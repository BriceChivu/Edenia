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

test('Settings shell listeners preserve desktop inertness, focus, scrolling, Escape, and ordering', async ({
  page
}, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-standard')

  await seedCompletedState(page)
  const panel = page.locator('#settingsPanel')
  const drawer = page.locator('.settings-drawer')
  const opener = page.locator('.gear-btn[data-settings-shell-action="open"]')
  const overlay = page.locator('.settings-overlay[data-settings-shell-action="close"]')
  const closeControl = page.locator(
    '#settingsCloseBtn[data-settings-shell-action="close"]'
  )
  const storedBefore = await page.evaluate(() => localStorage.getItem('edenia_v1'))
  const bodyBefore = await page.evaluate(() => ({
    className: document.body.className,
    style: document.body.getAttribute('style'),
    overflow: getComputedStyle(document.body).overflow,
    scrollY: window.scrollY
  }))

  await page.evaluate(() => {
    window.__settingsOpenedAtDocumentBubble = null
    document.addEventListener('click', event => {
      if (!event.target.closest('[data-settings-shell-action="open"]')) return
      window.__settingsOpenedAtDocumentBubble = {
        hidden: document.getElementById('settingsPanel').classList.contains('hidden'),
        inert: document.getElementById('mainApp').inert
      }
    }, { once: true })
  })
  await opener.click()
  await expect.poll(() => page.evaluate(
    () => window.__settingsOpenedAtDocumentBubble
  )).toEqual({
    hidden: false,
    inert: true
  })
  await expect(closeControl).toBeFocused()

  await drawer.evaluate(element => {
    element.scrollTop = 80
  })
  const desktopDrawerScroll = await drawer.evaluate(element => element.scrollTop)
  await page.evaluate(() => {
    window.__settingsClosedAtDocumentBubble = null
    document.addEventListener('click', event => {
      if (!event.target.closest('#settingsCloseBtn')) return
      window.__settingsClosedAtDocumentBubble = {
        hidden: document.getElementById('settingsPanel').classList.contains('hidden'),
        inert: document.getElementById('mainApp').inert
      }
    }, { once: true })
  })
  await closeControl.click()
  await expect.poll(() => page.evaluate(
    () => window.__settingsClosedAtDocumentBubble
  )).toEqual({
    hidden: true,
    inert: false
  })
  await expect(opener).toBeFocused()

  await opener.press('Enter')
  await expect(panel).not.toHaveClass(/\bhidden\b/)
  expect(await drawer.evaluate(element => element.scrollTop))
    .toBe(desktopDrawerScroll)
  await closeControl.press('Space')
  await expect(panel).toHaveClass(/\bhidden\b/)
  await expect(opener).toBeFocused()

  await opener.click()
  await overlay.click({ position: { x: 4, y: 4 } })
  await expect(panel).toHaveClass(/\bhidden\b/)
  await expect(opener).toBeFocused()

  await opener.click()
  await page.evaluate(() => {
    window.__settingsEscapeDefaultPrevented = null
    document.addEventListener('keydown', event => {
      if (event.key === 'Escape') {
        window.__settingsEscapeDefaultPrevented = event.defaultPrevented
      }
    }, { once: true })
  })
  await page.keyboard.press('Escape')
  await expect(panel).toHaveClass(/\bhidden\b/)
  await expect(opener).toBeFocused()
  await expect.poll(() => page.evaluate(
    () => window.__settingsEscapeDefaultPrevented
  )).toBe(true)

  expect(await page.evaluate(() => localStorage.getItem('edenia_v1')))
    .toBe(storedBefore)
  expect(await page.evaluate(() => ({
    className: document.body.className,
    style: document.body.getAttribute('style'),
    overflow: getComputedStyle(document.body).overflow,
    scrollY: window.scrollY
  }))).toEqual(bodyBefore)
  expect(await page.evaluate(() => ({
    openSettings: Object.prototype.hasOwnProperty.call(
      window.EdeniaActions,
      'openSettings'
    ),
    closeSettings: Object.prototype.hasOwnProperty.call(
      window.EdeniaActions,
      'closeSettings'
    )
  }))).toEqual({
    openSettings: false,
    closeSettings: false
  })
})

test('Settings shell listeners preserve the phone drawer and scroll reset', async ({
  page
}, testInfo) => {
  test.skip(testInfo.project.name !== 'phone-standard')

  await seedCompletedState(page)
  const panel = page.locator('#settingsPanel')
  const drawer = page.locator('.settings-drawer')
  const opener = page.locator('.gear-btn[data-settings-shell-action="open"]')
  const overlay = page.locator('.settings-overlay[data-settings-shell-action="close"]')
  const closeControl = page.locator(
    '#settingsCloseBtn[data-settings-shell-action="close"]'
  )
  const storedBefore = await page.evaluate(() => localStorage.getItem('edenia_v1'))
  await expect(overlay).toBeHidden()

  await opener.click()
  await expect(panel).not.toHaveClass(/\bhidden\b/)
  await expect(page.locator('#mainApp')).toHaveJSProperty('inert', true)
  await expect(closeControl).toBeFocused()
  await drawer.evaluate(element => {
    element.scrollTop = 80
  })
  expect(await drawer.evaluate(element => element.scrollTop)).toBeGreaterThan(0)
  await closeControl.click()
  await expect(panel).toHaveClass(/\bhidden\b/)
  await expect(opener).toBeFocused()

  await opener.press('Space')
  await expect(panel).not.toHaveClass(/\bhidden\b/)
  expect(await drawer.evaluate(element => element.scrollTop)).toBe(0)
  await page.keyboard.press('Escape')
  await expect(panel).toHaveClass(/\bhidden\b/)
  await expect(page.locator('#mainApp')).toHaveJSProperty('inert', false)
  await expect(opener).toBeFocused()
  expect(await page.evaluate(() => localStorage.getItem('edenia_v1')))
    .toBe(storedBefore)
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

test('sandbox action listeners preserve day advancement, reset backups, keyboard, and ordering', async ({
  page
}, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-standard')

  await page.goto('http://localhost:8001/?sandbox=1')
  await waitForApplication(page)
  const addDay = page.locator('[data-sandbox-action="add-day"]')
  const reset = page.locator('[data-sandbox-action="reset"]')
  const readSandboxDate = () => page.evaluate(() => (
    JSON.parse(localStorage.getItem('edenia_v1_sandbox')).sandboxLastDate
  ))
  const getDayDelta = (previous, next) => {
    const ordinal = key => {
      const [year, month, day] = key.split('-').map(Number)
      return Date.UTC(year, month - 1, day) / 86_400_000
    }
    return ordinal(next) - ordinal(previous)
  }

  const initialDate = await readSandboxDate()
  await page.evaluate(() => {
    window.__sandboxAddDayAtDocumentBubble = null
    document.addEventListener('click', event => {
      if (!event.target.closest('[data-sandbox-action="add-day"]')) return
      const state = JSON.parse(localStorage.getItem('edenia_v1_sandbox'))
      window.__sandboxAddDayAtDocumentBubble = {
        lastDate: state.sandboxLastDate,
        normalState: localStorage.getItem('edenia_v1')
      }
    }, { once: true })
  })
  await addDay.click()
  const clickedDate = await readSandboxDate()
  expect(getDayDelta(initialDate, clickedDate)).toBe(1)
  await expect.poll(() => page.evaluate(
    () => window.__sandboxAddDayAtDocumentBubble
  )).toEqual({
    lastDate: clickedDate,
    normalState: null
  })

  await addDay.focus()
  await addDay.press('Enter')
  const enterDate = await readSandboxDate()
  expect(getDayDelta(clickedDate, enterDate)).toBe(1)

  await addDay.focus()
  await addDay.press('Space')
  const spaceDate = await readSandboxDate()
  expect(getDayDelta(enterDate, spaceDate)).toBe(1)

  await page.evaluate(() => {
    window.__sandboxResetAtDocumentBubble = null
    document.addEventListener('click', event => {
      if (!event.target.closest('[data-sandbox-action="reset"]')) return
      const state = JSON.parse(localStorage.getItem('edenia_v1_sandbox'))
      const backups = JSON.parse(
        localStorage.getItem('edenia_v1_sandbox_backups') || '[]'
      )
      window.__sandboxResetAtDocumentBubble = {
        startDate: state.sandboxStartDate,
        lastDate: state.sandboxLastDate,
        hasResetEntry: state.activityLog.some(entry => entry.type === 'reset'),
        hasResetBackup: backups.some(
          entry => entry.reason === 'before sandbox reset' && entry.sandbox === true
        ),
        normalState: localStorage.getItem('edenia_v1')
      }
    }, { once: true })
  })
  await reset.focus()
  await reset.press('Enter')
  await expect.poll(() => page.evaluate(
    () => window.__sandboxResetAtDocumentBubble?.hasResetBackup
  )).toBe(true)
  const resetObservation = await page.evaluate(
    () => window.__sandboxResetAtDocumentBubble
  )
  expect(resetObservation.lastDate).toBe(resetObservation.startDate)
  expect(resetObservation).toMatchObject({
    hasResetEntry: true,
    hasResetBackup: true,
    normalState: null
  })

  const removedBridgeActions = await page.evaluate(() => ({
    addSandboxDay: Object.prototype.hasOwnProperty.call(
      window.EdeniaActions,
      'addSandboxDay'
    ),
    resetSandboxState: Object.prototype.hasOwnProperty.call(
      window.EdeniaActions,
      'resetSandboxState'
    )
  }))
  expect(removedBridgeActions).toEqual({
    addSandboxDay: false,
    resetSandboxState: false
  })
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

test('theme listener preserves persistence, labels, keyboard, activity, and ordering', async ({
  page
}, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-standard')

  await seedCompletedState(page)
  const toggle = page.locator('[data-theme-action="toggle"]')
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light')
  await expect(page.locator('body')).toHaveAttribute('data-theme', 'light')
  await expect(toggle).toHaveAttribute('aria-label', 'Switch to dark mode')

  await page.evaluate(() => {
    window.__themeAtDocumentBubble = null
    document.addEventListener('click', event => {
      if (!event.target.closest('[data-theme-action="toggle"]')) return
      const state = JSON.parse(localStorage.getItem('edenia_v1'))
      window.__themeAtDocumentBubble = {
        stored: state.config.theme,
        documentTheme: document.documentElement.dataset.theme,
        bodyTheme: document.body.dataset.theme,
        label: document.getElementById('themeToggle').getAttribute('aria-label'),
        hasActivity: state.activityLog.some(entry => entry.type === 'theme')
      }
    }, { once: true })
  })
  await toggle.click()
  await expect.poll(() => page.evaluate(
    () => window.__themeAtDocumentBubble
  )).toEqual({
    stored: 'dark',
    documentTheme: 'dark',
    bodyTheme: 'dark',
    label: 'Switch to light mode',
    hasActivity: true
  })

  await page.reload()
  await waitForApplication(page)
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
  await expect(toggle).toHaveAttribute('aria-label', 'Switch to light mode')

  await toggle.focus()
  await toggle.press('Space')
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light')
  await expect.poll(() => page.evaluate(() => (
    JSON.parse(localStorage.getItem('edenia_v1')).config.theme
  ))).toBe('light')

  await toggle.focus()
  await toggle.press('Enter')
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')

  const removedBridgeAction = await page.evaluate(() => (
    Object.prototype.hasOwnProperty.call(window.EdeniaActions, 'toggleTheme')
  ))
  expect(removedBridgeAction).toBe(false)
})

test('feedback confirmation listener preserves dismissal, focus, keyboard, and ordering', async ({
  page
}, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-standard')

  await seedCompletedState(page)
  const confirmation = page.locator('#feedbackConfirmation')
  const closeControl = page.locator('[data-feedback-confirmation-action="close"]')
  const launcher = page.locator('#feedbackLaunchBtn')
  const storedBefore = await page.evaluate(() => localStorage.getItem('edenia_v1'))
  const showConfirmation = () => page.evaluate(() => {
    const element = document.getElementById('feedbackConfirmation')
    element.classList.remove('hidden')
    element.classList.add('show')
    element.querySelector('[data-feedback-confirmation-action="close"]').focus()
  })

  await showConfirmation()
  await expect(confirmation).not.toHaveClass(/\bhidden\b/)
  await expect(closeControl).toBeFocused()
  await page.evaluate(() => {
    window.__feedbackConfirmationAtDocumentBubble = null
    document.addEventListener('click', event => {
      if (!event.target.closest('[data-feedback-confirmation-action="close"]')) return
      const element = document.getElementById('feedbackConfirmation')
      window.__feedbackConfirmationAtDocumentBubble = {
        hidden: element.classList.contains('hidden'),
        shown: element.classList.contains('show'),
        launcherFocused: document.activeElement ===
          document.getElementById('feedbackLaunchBtn')
      }
    }, { once: true })
  })
  await closeControl.click()
  await expect.poll(() => page.evaluate(
    () => window.__feedbackConfirmationAtDocumentBubble
  )).toEqual({
    hidden: true,
    shown: false,
    launcherFocused: true
  })
  await expect(launcher).toBeFocused()

  await showConfirmation()
  await closeControl.press('Enter')
  await expect(confirmation).toHaveClass(/\bhidden\b/)
  await expect(launcher).toBeFocused()

  await showConfirmation()
  await closeControl.press('Space')
  await expect(confirmation).toHaveClass(/\bhidden\b/)
  await expect(launcher).toBeFocused()

  expect(await page.evaluate(() => localStorage.getItem('edenia_v1')))
    .toBe(storedBefore)
  const removedBridgeAction = await page.evaluate(() => (
    Object.prototype.hasOwnProperty.call(
      window.EdeniaActions,
      'closeFeedbackConfirmation'
    )
  ))
  expect(removedBridgeAction).toBe(false)
})

test('feedback modal listeners preserve focus, Escape, keyboard, storage, and ordering', async ({
  page
}, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-standard')

  await seedCompletedState(page)
  const modal = page.locator('#feedbackModal')
  const launcher = page.locator('[data-feedback-modal-action="open"]')
  const backdrop = page.locator('.feedback-backdrop[data-feedback-modal-action="close"]')
  const closeControl = page.locator('.feedback-close-btn[data-feedback-modal-action="close"]')
  const message = page.locator('#feedbackMessage')
  const storedBefore = await page.evaluate(() => localStorage.getItem('edenia_v1'))
  await expect(modal).toHaveClass(/\bhidden\b/)

  await page.evaluate(() => {
    window.__feedbackOpenedAtDocumentBubble = null
    document.addEventListener('click', event => {
      if (!event.target.closest('[data-feedback-modal-action="open"]')) return
      window.__feedbackOpenedAtDocumentBubble = {
        hidden: document.getElementById('feedbackModal').classList.contains('hidden'),
        bodyOpen: document.body.classList.contains('feedback-modal-open')
      }
    }, { once: true })
  })
  await launcher.click()
  await expect.poll(() => page.evaluate(
    () => window.__feedbackOpenedAtDocumentBubble
  )).toEqual({
    hidden: false,
    bodyOpen: true
  })
  await expect(message).toBeFocused()

  await page.evaluate(() => {
    window.__feedbackClosedAtDocumentBubble = null
    document.addEventListener('click', event => {
      if (!event.target.closest('.feedback-backdrop')) return
      window.__feedbackClosedAtDocumentBubble = {
        hidden: document.getElementById('feedbackModal').classList.contains('hidden'),
        bodyOpen: document.body.classList.contains('feedback-modal-open'),
        launcherFocused: document.activeElement ===
          document.getElementById('feedbackLaunchBtn')
      }
    }, { once: true })
  })
  await backdrop.click({ position: { x: 4, y: 4 } })
  await expect.poll(() => page.evaluate(
    () => window.__feedbackClosedAtDocumentBubble
  )).toEqual({
    hidden: true,
    bodyOpen: false,
    launcherFocused: true
  })

  await launcher.focus()
  await launcher.press('Enter')
  await expect(modal).not.toHaveClass(/\bhidden\b/)
  await closeControl.focus()
  await closeControl.press('Space')
  await expect(modal).toHaveClass(/\bhidden\b/)
  await expect(launcher).toBeFocused()

  await launcher.press('Space')
  await expect(message).toBeFocused()
  await message.press('Escape')
  await expect(modal).toHaveClass(/\bhidden\b/)
  await expect(launcher).toBeFocused()

  expect(await page.evaluate(() => localStorage.getItem('edenia_v1')))
    .toBe(storedBefore)
  const removedBridgeActions = await page.evaluate(() => ({
    openFeedbackModal: Object.prototype.hasOwnProperty.call(
      window.EdeniaActions,
      'openFeedbackModal'
    ),
    closeFeedbackModal: Object.prototype.hasOwnProperty.call(
      window.EdeniaActions,
      'closeFeedbackModal'
    )
  }))
  expect(removedBridgeActions).toEqual({
    openFeedbackModal: false,
    closeFeedbackModal: false
  })
})

test('watched-section listener preserves transient disclosure, labels, keyboard, and ordering', async ({
  page
}, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-standard')

  await seedCompletedState(page)
  await page.evaluate(() => {
    const state = JSON.parse(localStorage.getItem('edenia_v1'))
    state.videos['protected-watched-video'] = {
      id: 'protected-watched-video',
      title: 'Protected watched video',
      channelId: 'protected-channel',
      channelTitle: 'Protected channel',
      duration: 600,
      publishedAt: '2026-07-18T04:00:00.000Z',
      watchedAt: '2026-07-20T04:00:00.000Z',
      status: 'watched',
      thumbnail: 'https://i.ytimg.com/vi/protected-watched-video/hqdefault.jpg'
    }
    localStorage.setItem('edenia_v1', JSON.stringify(state))
  })
  await page.reload()
  await expect(page.locator('#mainApp')).not.toHaveClass(/\bhidden\b/)

  const section = page.locator('#watchedSection')
  const control = page.locator(
    '#watchedSectionToggle[data-watched-section-action="toggle"]'
  )
  await expect(section).not.toHaveClass(/\bhidden\b/)
  await expect(section).not.toHaveClass(/\bcollapsed\b/)
  await expect(control).toHaveAttribute('aria-expanded', 'true')
  await expect(control).toHaveAttribute('aria-label', 'Hide watched videos')
  await expect(control).toHaveAttribute(
    'data-analytics-action',
    'videos.watched.hide'
  )
  const storedBefore = await page.evaluate(() => localStorage.getItem('edenia_v1'))

  await page.evaluate(() => {
    window.__watchedSectionAtDocumentBubble = null
    document.addEventListener('click', event => {
      if (!event.target.closest('[data-watched-section-action="toggle"]')) return
      const section = document.getElementById('watchedSection')
      const control = document.getElementById('watchedSectionToggle')
      window.__watchedSectionAtDocumentBubble = {
        collapsed: section.classList.contains('collapsed'),
        expanded: control.getAttribute('aria-expanded'),
        label: control.getAttribute('aria-label')
      }
    }, { once: true })
  })
  await control.click()
  await expect.poll(() => page.evaluate(
    () => window.__watchedSectionAtDocumentBubble
  )).toEqual({
    collapsed: true,
    expanded: 'false',
    label: 'Show watched videos'
  })

  await control.click()
  await expect(section).not.toHaveClass(/\bcollapsed\b/)
  await control.focus()
  await control.press('Enter')
  await expect(section).toHaveClass(/\bcollapsed\b/)
  await expect(control).toHaveAttribute('aria-expanded', 'false')
  await expect(control).toHaveAttribute('aria-label', 'Show watched videos')
  await control.press('Space')
  await expect(section).not.toHaveClass(/\bcollapsed\b/)
  await expect(control).toHaveAttribute('aria-expanded', 'true')
  await expect(control).toHaveAttribute('aria-label', 'Hide watched videos')

  expect(await page.evaluate(() => localStorage.getItem('edenia_v1')))
    .toBe(storedBefore)
  const removedBridgeAction = await page.evaluate(() => (
    Object.prototype.hasOwnProperty.call(
      window.EdeniaActions,
      'toggleWatchedSection'
    )
  ))
  expect(removedBridgeAction).toBe(false)

  await control.click()
  await expect(section).toHaveClass(/\bcollapsed\b/)
  await page.reload()
  await expect(page.locator('#mainApp')).not.toHaveClass(/\bhidden\b/)
  await expect(section).not.toHaveClass(/\bcollapsed\b/)
  await expect(control).toHaveAttribute('aria-expanded', 'true')
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

test('Settings reset-confirm listeners preserve visibility, keyboard, storage, and ordering', async ({
  page
}, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-standard')

  await seedCompletedState(page)
  await page.locator('.gear-btn').click()
  const confirmation = page.locator('#resetConfirm')
  const showControl = page.locator('[data-settings-reset-confirm-action="show"]')
  const hideControl = page.locator('[data-settings-reset-confirm-action="hide"]')
  const storedBefore = await page.evaluate(() => localStorage.getItem('edenia_v1'))
  await expect(confirmation).toHaveClass(/\bhidden\b/)

  await page.evaluate(() => {
    window.__resetConfirmShownAtDocumentBubble = null
    document.addEventListener('click', event => {
      if (!event.target.closest('[data-settings-reset-confirm-action="show"]')) return
      window.__resetConfirmShownAtDocumentBubble =
        !document.getElementById('resetConfirm').classList.contains('hidden')
    }, { once: true })
  })
  await showControl.click()
  await expect(confirmation).not.toHaveClass(/\bhidden\b/)
  await expect.poll(() => page.evaluate(
    () => window.__resetConfirmShownAtDocumentBubble
  )).toBe(true)

  await page.evaluate(() => {
    window.__resetConfirmHiddenAtDocumentBubble = null
    document.addEventListener('click', event => {
      if (!event.target.closest('[data-settings-reset-confirm-action="hide"]')) return
      window.__resetConfirmHiddenAtDocumentBubble =
        document.getElementById('resetConfirm').classList.contains('hidden')
    }, { once: true })
  })
  await hideControl.click()
  await expect(confirmation).toHaveClass(/\bhidden\b/)
  await expect.poll(() => page.evaluate(
    () => window.__resetConfirmHiddenAtDocumentBubble
  )).toBe(true)

  await showControl.focus()
  await showControl.press('Enter')
  await expect(confirmation).not.toHaveClass(/\bhidden\b/)
  await hideControl.focus()
  await hideControl.press('Space')
  await expect(confirmation).toHaveClass(/\bhidden\b/)

  await showControl.click()
  await page.locator('#settingsCloseBtn').click()
  await page.locator('.gear-btn').click()
  await expect(confirmation).not.toHaveClass(/\bhidden\b/)
  await hideControl.click()

  expect(await page.evaluate(() => localStorage.getItem('edenia_v1')))
    .toBe(storedBefore)
  const removedBridgeActions = await page.evaluate(() => ({
    showResetConfirm: Object.prototype.hasOwnProperty.call(
      window.EdeniaActions,
      'showResetConfirm'
    ),
    hideResetConfirm: Object.prototype.hasOwnProperty.call(
      window.EdeniaActions,
      'hideResetConfirm'
    )
  }))
  expect(removedBridgeActions).toEqual({
    showResetConfirm: false,
    hideResetConfirm: false
  })
})

test('Activity Log filter listeners preserve live values, rendering, keyboard, and ordering', async ({
  page
}, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-standard')

  await seedCompletedState(page)
  await page.evaluate(() => {
    const state = JSON.parse(localStorage.getItem('edenia_v1'))
    state.activityLog = [
      {
        id: 'auto-warning',
        createdAt: '2026-07-28T03:00:00.000Z',
        actor: 'auto',
        type: 'anki-refresh',
        status: 'warn',
        title: 'Protected automatic warning',
        detail: ''
      },
      {
        id: 'user-error',
        createdAt: '2026-07-28T02:00:00.000Z',
        actor: 'user',
        type: 'general',
        status: 'error',
        title: 'Protected user issue',
        detail: ''
      },
      {
        id: 'auto-info',
        createdAt: '2026-07-28T01:00:00.000Z',
        actor: 'auto',
        type: 'general',
        status: 'info',
        title: 'Protected automatic info',
        detail: ''
      },
      {
        id: 'user-success',
        createdAt: '2026-07-28T00:00:00.000Z',
        actor: 'user',
        type: 'general',
        status: 'success',
        title: 'Protected user success',
        detail: ''
      },
      {
        id: 'point-delta',
        createdAt: '2026-07-27T23:00:00.000Z',
        actor: 'user',
        type: 'point-delta',
        status: 'success',
        title: 'Protected point adjustment',
        detail: '',
        meta: { pointsDelta: 7 }
      }
    ]
    localStorage.setItem('edenia_v1', JSON.stringify(state))
  })
  await page.reload()
  await waitForApplication(page)
  await page.locator('.gear-btn').click()
  await page.locator('.activity-log-toggle').click()

  const filters = page.locator('[data-activity-log-filter]')
  const list = page.locator('#activityLogList')
  const allFilter = page.locator('[data-activity-log-filter="all"]')
  const userFilter = page.locator('[data-activity-log-filter="user"]')
  const autoFilter = page.locator('[data-activity-log-filter="auto"]')
  const issuesFilter = page.locator('[data-activity-log-filter="issues"]')
  const pointsFilter = page.locator('[data-activity-log-filter="points"]')
  await expect(filters).toHaveCount(5)
  await expect(allFilter).toHaveAttribute('aria-selected', 'true')

  await page.evaluate(() => {
    window.__activityLogAtDocumentBubble = null
    document.addEventListener('click', event => {
      if (!event.target.closest('[data-activity-log-filter="user"]')) return
      window.__activityLogAtDocumentBubble = {
        filter: document.querySelector('.activity-log-filter.active')
          ?.dataset.activityLogFilter,
        titles: [...document.querySelectorAll('#activityLogList .activity-log-title')]
          .map(element => element.textContent)
      }
    }, { once: true })
  })
  await userFilter.click()
  await expect(userFilter).toHaveAttribute('aria-selected', 'true')
  await expect(list).toContainText('Protected user issue')
  await expect(list).toContainText('Protected user success')
  await expect(list).not.toContainText('Protected automatic info')
  await expect.poll(() => page.evaluate(
    () => window.__activityLogAtDocumentBubble
  )).toEqual({
    filter: 'user',
    titles: [
      'Protected user issue',
      'Protected user success',
      'Protected point adjustment'
    ]
  })

  await autoFilter.focus()
  await autoFilter.press('Enter')
  await expect(autoFilter).toHaveAttribute('aria-selected', 'true')
  await expect(list).toContainText('Protected automatic warning')
  await expect(list).not.toContainText('Protected user success')

  await issuesFilter.focus()
  await issuesFilter.press('Space')
  await expect(issuesFilter).toHaveAttribute('aria-selected', 'true')
  await expect(list).toContainText('Protected automatic warning')
  await expect(list).toContainText('Protected user issue')
  await expect(list).not.toContainText('Protected automatic info')

  await pointsFilter.click()
  await expect(pointsFilter).toHaveAttribute('aria-selected', 'true')
  await expect(list).toContainText('Protected point adjustment')
  await expect(list).toContainText('+7')

  await page.evaluate(() => {
    const control = document.querySelector('[data-activity-log-filter="user"]')
    control.dataset.activityLogFilter = 'invalid-live-value'
    control.click()
  })
  await expect(allFilter).toHaveAttribute('aria-selected', 'true')
  await expect(list).toContainText('Protected automatic info')
  await expect(list).toContainText('Protected user success')

  const removedBridgeAction = await page.evaluate(() => (
    Object.prototype.hasOwnProperty.call(window.EdeniaActions, 'setActivityLogFilter')
  ))
  expect(removedBridgeAction).toBe(false)
})

test('city zoom listeners preserve fixed steps, limits, reset, keyboard, and ordering', async ({
  page
}, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-standard')

  await seedCompletedState(page)
  const wrap = page.locator('.city-image-wrap')
  const image = page.locator('#cityMilestoneImage')
  const zoomOut = page.locator('[data-city-zoom-action="out"]')
  const reset = page.locator('[data-city-zoom-action="reset"]')
  const zoomIn = page.locator('[data-city-zoom-action="in"]')

  await expect(image).toHaveCSS('transform', 'matrix(1, 0, 0, 1, 0, 0)')
  await zoomOut.click()
  await expect(image).toHaveCSS('transform', 'matrix(1, 0, 0, 1, 0, 0)')

  await page.evaluate(() => {
    window.__cityZoomAtDocumentBubble = null
    document.addEventListener('click', event => {
      if (!event.target.closest('[data-city-zoom-action="in"]')) return
      window.__cityZoomAtDocumentBubble = {
        transform: document.getElementById('cityMilestoneImage').style.transform,
        zoomed: document.querySelector('.city-image-wrap').classList.contains('is-zoomed')
      }
    }, { once: true })
  })
  await zoomIn.click()
  await expect(wrap).toHaveClass(/\bis-zoomed\b/)
  await expect.poll(() => page.evaluate(
    () => window.__cityZoomAtDocumentBubble
  )).toEqual({
    transform: 'translate(0px, 0px) scale(1.25)',
    zoomed: true
  })

  await zoomIn.focus()
  await zoomIn.press('Enter')
  await expect.poll(() => image.evaluate(element => element.style.transform))
    .toBe('translate(0px, 0px) scale(1.5)')

  await zoomOut.focus()
  await zoomOut.press('Space')
  await expect.poll(() => image.evaluate(element => element.style.transform))
    .toBe('translate(0px, 0px) scale(1.25)')

  for (let index = 0; index < 8; index += 1) {
    await zoomIn.click()
  }
  await expect.poll(() => image.evaluate(element => element.style.transform))
    .toBe('translate(0px, 0px) scale(2)')

  await reset.focus()
  await reset.press('Enter')
  await expect(wrap).not.toHaveClass(/\bis-zoomed\b/)
  await expect.poll(() => image.evaluate(element => element.style.transform))
    .toBe('translate(0px, 0px) scale(1)')

  const removedBridgeActions = await page.evaluate(() => ({
    zoomCityImage: Object.prototype.hasOwnProperty.call(
      window.EdeniaActions,
      'zoomCityImage'
    ),
    resetCityImageView: Object.prototype.hasOwnProperty.call(
      window.EdeniaActions,
      'resetCityImageView'
    )
  }))
  expect(removedBridgeActions).toEqual({
    zoomCityImage: false,
    resetCityImageView: false
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
