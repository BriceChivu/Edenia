import { readFile } from 'node:fs/promises'
import { expect, test } from '../support/network-fixture.mjs'
import { GLOBAL_ACTION_NAMES } from '../../src/core/global-action-contract.js'

const fixedNow = new Date('2026-07-28T04:00:00.000Z')
const PHONE_PROJECT_NAMES = new Set(['phone-standard', 'phone-small'])
const LAYOUT_TOLERANCE_PX = 1

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
  await page.locator('#toast').evaluate(toast => {
    toast.classList.remove('show')
    toast.textContent = ''
  })
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

async function expectCompletedPhoneDashboardLayout(page) {
  const layout = await page.evaluate(() => {
    function readRect(selector) {
      const element = document.querySelector(selector)
      if (!element) throw new Error(`Missing layout target: ${selector}`)
      const rect = element.getBoundingClientRect()
      return {
        selector,
        bottom: rect.bottom,
        height: rect.height,
        left: rect.left,
        right: rect.right,
        top: rect.top,
        width: rect.width
      }
    }

    return {
      viewportWidth: document.documentElement.clientWidth,
      documentWidth: Math.max(
        document.documentElement.scrollWidth,
        document.body.scrollWidth
      ),
      sections: [
        '.app-header',
        '.city-section',
        '.analytics-section',
        '.study-history-section',
        '.feed-section',
        '.app-footer'
      ].map(readRect),
      history: {
        tabs: readRect('.history-view-tabs'),
        stats: [...document.querySelectorAll(
          '.study-history-grid .history-stat'
        )].map((_, index) => readRect(
          `.study-history-grid .history-stat:nth-child(${index + 1})`
        )),
        table: readRect('#historyTable')
      },
      feed: {
        header: readRect('.feed-section > .section-header'),
        toolbar: readRect('.feed-toolbar'),
        addButton: readRect('#manualVideoBtn'),
        undoGroup: readRect('.undo-wrap'),
        grid: readRect('#videoGrid')
      },
      feedbackButton: readRect('#feedbackLaunchBtn')
    }
  })

  expect(layout.documentWidth).toBeLessThanOrEqual(layout.viewportWidth)

  for (const rect of layout.sections) {
    expect(rect.width, `${rect.selector} has width`).toBeGreaterThan(0)
    expect(rect.height, `${rect.selector} has height`).toBeGreaterThan(0)
    expect(rect.left, `${rect.selector} stays inside the left edge`)
      .toBeGreaterThanOrEqual(-LAYOUT_TOLERANCE_PX)
    expect(rect.right, `${rect.selector} stays inside the right edge`)
      .toBeLessThanOrEqual(layout.viewportWidth + LAYOUT_TOLERANCE_PX)
  }

  for (let index = 1; index < layout.sections.length; index += 1) {
    const previous = layout.sections[index - 1]
    const current = layout.sections[index]
    expect(
      previous.bottom,
      `${previous.selector} does not overlap ${current.selector}`
    ).toBeLessThanOrEqual(current.top + LAYOUT_TOLERANCE_PX)
  }

  const [firstStat, secondStat, thirdStat, fourthStat] = layout.history.stats
  expect(layout.history.stats).toHaveLength(4)
  expect(Math.abs(firstStat.top - secondStat.top)).toBeLessThanOrEqual(
    LAYOUT_TOLERANCE_PX
  )
  expect(Math.abs(thirdStat.top - fourthStat.top)).toBeLessThanOrEqual(
    LAYOUT_TOLERANCE_PX
  )
  expect(firstStat.right).toBeLessThanOrEqual(
    secondStat.left + LAYOUT_TOLERANCE_PX
  )
  expect(thirdStat.right).toBeLessThanOrEqual(
    fourthStat.left + LAYOUT_TOLERANCE_PX
  )
  expect(firstStat.bottom).toBeLessThanOrEqual(
    thirdStat.top + LAYOUT_TOLERANCE_PX
  )
  expect(layout.history.tabs.bottom).toBeLessThanOrEqual(
    firstStat.top + LAYOUT_TOLERANCE_PX
  )
  expect(thirdStat.bottom).toBeLessThanOrEqual(
    layout.history.table.top + LAYOUT_TOLERANCE_PX
  )

  expect(layout.feed.header.bottom).toBeLessThanOrEqual(
    layout.feed.toolbar.top + LAYOUT_TOLERANCE_PX
  )
  expect(layout.feed.toolbar.bottom).toBeLessThanOrEqual(
    layout.feed.grid.top + LAYOUT_TOLERANCE_PX
  )
  expect(layout.feed.addButton.right).toBeLessThanOrEqual(
    layout.feed.undoGroup.left + LAYOUT_TOLERANCE_PX
  )
  expect(layout.feed.addButton.height).toBeGreaterThanOrEqual(44)
  expect(layout.feed.undoGroup.height).toBeGreaterThanOrEqual(44)
  expect(layout.feedbackButton.left).toBeGreaterThanOrEqual(0)
  expect(layout.feedbackButton.right).toBeLessThanOrEqual(layout.viewportWidth)
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

async function seedCityClaimState(page, reviewedCards, locale = 'en') {
  await page.goto('/')
  await waitForApplication(page)
  await page.evaluate(({ reviewed, selectedLocale }) => {
    const state = window.defaultState(4, [], 'light', [], selectedLocale)
    const completedAt = '2026-07-20T04:00:00.000Z'
    state.config.ankiEnabled = false
    state.config.ankiDisabledAt = completedAt
    state.onboarding.introSeenAt = completedAt
    state.onboarding.setupCompleted = true
    state.onboarding.setupCompletedAt = completedAt
    state.onboarding.walkthroughCompleted = true
    state.onboarding.walkthroughCompletedAt = completedAt
    state.onboarding.levelUpGuidanceShownAt = completedAt
    state.anki['2026-07-28'] = {
      reviewed,
      created: 0
    }
    state.cityProgress = {
      maxLevelIndex: 0,
      pendingLevelIndex: 1,
      scoringVersion: 7
    }
    localStorage.setItem('edenia_v1', JSON.stringify(state))
    localStorage.removeItem('edenia_v1_backups')
    localStorage.removeItem('edenia_posthog_state_v2')
  }, { reviewed: reviewedCards, selectedLocale: locale })
  await page.reload()
  await waitForApplication(page)
  await page.addStyleTag({
    content: '#levelUpButton.show { animation: none !important; }'
  })
}

async function installCityAnalyticsProbe(page) {
  await page.evaluate(() => {
    window.__cityAnalyticsEvents = []
    window.EDENIA_ANALYTICS_ENABLED = true
    window.posthog = {
      capture(eventName, properties) {
        window.__cityAnalyticsEvents.push({ eventName, properties })
      },
      get_distinct_id() {
        return 'preservation-city-claim'
      },
      setPersonProperties() {}
    }
  })
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
  const globalActionSurface = await page.evaluate(() => ({
    present: Object.prototype.hasOwnProperty.call(window, 'EdeniaActions'),
    names: Object.keys(window.EdeniaActions || {}).sort()
  }))
  expect(globalActionSurface).toEqual({
    present: false,
    names: GLOBAL_ACTION_NAMES
  })
  await expect.poll(() => page.evaluate(() => window.EDENIA_ANALYTICS_ENABLED)).toBe(false)
  await expect.poll(() => page.evaluate(() => window.EDENIA_CONFIG?.youtubeApiKey)).toBe('')
})

test('completed local state preserves settings and feedback interactions', async ({
  page
}, testInfo) => {
  await seedCompletedState(page)

  await expect(page.locator('#introTrailer')).toHaveClass(/\bhidden\b/)
  await expect(page.locator('#onboardingPanel')).toHaveClass(/\bhidden\b/)
  await stabilizeVisuals(page)
  // Phone text wrapping and city cover positioning can vary by a few pixels.
  // Protect the responsive contracts directly instead of snapshotting the page.
  if (PHONE_PROJECT_NAMES.has(testInfo.project.name)) {
    await expectCompletedPhoneDashboardLayout(page)
  } else {
    await expect(page).toHaveScreenshot('completed-dashboard.png', {
      animations: 'disabled',
      fullPage: true
    })
  }

  await page.locator('.gear-btn').click()
  await expect(page.locator('#settingsPanel')).not.toHaveClass(/\bhidden\b/)
  await expect(page.locator('#settingsLocaleLabel')).toHaveText('English')
  await page.locator('#settingsCloseBtn').click()

  await page.locator('#feedbackLaunchBtn').click()
  await expect(page.locator('#feedbackModal')).not.toHaveClass(/\bhidden\b/)
  await page.locator('#feedbackMessage').fill('Deterministic migration smoke test')
  if (new URL(page.url()).origin === 'http://localhost:8000') {
    await page.locator('#feedbackSubmitBtn').click()
    await expect(page.locator('#feedbackConfirmation')).not.toHaveClass(/\bhidden\b/)
  }
})

test('channel remove icon stays centered on the title line across responsive layouts', async ({
  page
}, testInfo) => {
  test.skip(![
    'desktop-standard',
    'tablet-portrait',
    'phone-standard'
  ].includes(testInfo.project.name))

  await seedCompletedState(page)
  await page.evaluate(() => {
    const state = JSON.parse(localStorage.getItem('edenia_v1'))
    state.config.channels = [{
      id: 'protected-alignment-channel',
      name: '人生五分熟 Life Medium Rare Extended Language Learning Channel'
    }]
    state.videos = {
      'protected-alignment-video': {
        id: 'protected-alignment-video',
        title: 'Protected channel alignment lesson',
        channelId: 'protected-alignment-channel',
        channelTitle: '人生五分熟 Life Medium Rare Extended Language Learning Channel',
        duration: 720,
        publishedAt: '2026-07-27T04:00:00.000Z',
        status: 'unwatched',
        thumbnail: 'https://i.ytimg.com/vi/protected-alignment-video/hqdefault.jpg'
      }
    }
    localStorage.setItem('edenia_v1', JSON.stringify(state))
  })
  await page.reload()
  await waitForApplication(page)

  const alignment = await page.locator('.channel-shelf-title-row').evaluate(row => {
    const title = row.querySelector('strong')
    const button = row.querySelector('.channel-shelf-remove')
    const icon = button.querySelector('.channel-shelf-remove-icon')
    const titleRect = title.getBoundingClientRect()
    const buttonRect = button.getBoundingClientRect()
    const rowRect = row.getBoundingClientRect()
    const titleStyle = getComputedStyle(title)
    const buttonStyle = getComputedStyle(button)
    const iconStyle = getComputedStyle(icon)
    const center = rect => rect.top + rect.height / 2

    return {
      buttonCenterDelta: Math.abs(center(titleRect) - center(buttonRect)),
      buttonDisplay: buttonStyle.display,
      buttonHeight: buttonStyle.height,
      buttonWidth: buttonStyle.width,
      iconDisplay: iconStyle.display,
      iconHeight: iconStyle.height,
      iconWidth: iconStyle.width,
      rowCenterDelta: Math.abs(center(rowRect) - center(buttonRect)),
      titleLineHeight: titleStyle.lineHeight,
      titleWhiteSpace: titleStyle.whiteSpace
    }
  })

  expect(alignment.buttonCenterDelta).toBeLessThanOrEqual(LAYOUT_TOLERANCE_PX)
  expect(alignment.rowCenterDelta).toBeLessThanOrEqual(LAYOUT_TOLERANCE_PX)
  expect(alignment).toMatchObject({
    buttonDisplay: 'flex',
    buttonHeight: '24px',
    buttonWidth: '24px',
    iconDisplay: 'block',
    iconHeight: '12px',
    iconWidth: '12px',
    titleWhiteSpace: 'nowrap'
  })
  expect(alignment.titleLineHeight).not.toBe('normal')
})

test('phone Settings header blur fades before the language controls', async ({
  page
}, testInfo) => {
  test.skip(testInfo.project.name !== 'phone-standard')

  await seedCompletedState(page)
  await page.locator('.gear-btn[data-settings-shell-action="open"]').click()

  const blurGeometry = await page.locator('.settings-header').evaluate(header => {
    const pseudo = getComputedStyle(header, '::before')
    const headerRect = header.getBoundingClientRect()
    const localeRect = document.querySelector('.settings-locale-group')
      .getBoundingClientRect()
    const pseudoBottom = headerRect.bottom - Number.parseFloat(pseudo.bottom)
    return {
      backdropFilter: pseudo.backdropFilter,
      clearance: localeRect.top - pseudoBottom,
      maskImage: pseudo.maskImage,
      pointerEvents: pseudo.pointerEvents
    }
  })

  expect(blurGeometry.backdropFilter).toContain('blur(3px)')
  expect(blurGeometry.maskImage).toContain('linear-gradient')
  expect(blurGeometry.clearance).toBeGreaterThan(0)
  expect(blurGeometry.pointerEvents).toBe('none')
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
      window.EdeniaActions || {},
      'openSettings'
    ),
    closeSettings: Object.prototype.hasOwnProperty.call(
      window.EdeniaActions || {},
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

test('walkthrough replay adapts no-Anki copy and frames the full video area', async ({
  page
}, testInfo) => {
  test.skip(![
    'desktop-standard',
    'tablet-portrait',
    'phone-standard'
  ].includes(testInfo.project.name))

  await seedCompletedState(page)
  await page.locator('[data-settings-shell-action="open"]').click()
  await page.locator(
    '[data-settings-replay-action="walkthrough"]'
  ).click()
  await expect(page.locator('body')).toHaveClass(/\bwalkthrough-active\b/)

  const nextButton = page.locator('.walkthrough-next')
  await nextButton.click()
  await expect(page.locator('.walkthrough-text')).toHaveText(
    'Study History shows what happened over time.'
  )

  await nextButton.click()
  await expect(page.locator('.walkthrough-text')).toHaveText(
    'This is the video area. New videos from your channels appear here.'
  )

  await expect.poll(() => page.evaluate(async () => {
    await new Promise(resolve => {
      let previousScrollY = window.scrollY
      let stableFrames = 0
      let frameCount = 0
      const checkScrollPosition = () => {
        const currentScrollY = window.scrollY
        stableFrames = Math.abs(currentScrollY - previousScrollY) < 0.5
          ? stableFrames + 1
          : 0
        previousScrollY = currentScrollY
        frameCount += 1
        if (stableFrames >= 4 || frameCount >= 120) {
          requestAnimationFrame(() => requestAnimationFrame(resolve))
          return
        }
        requestAnimationFrame(checkScrollPosition)
      }
      requestAnimationFrame(checkScrollPosition)
    })

    const highlight = document.querySelector('.walkthrough-highlight')
      .getBoundingClientRect()
    const title = document.querySelector('.feed-section > .section-header')
      .getBoundingClientRect()
    const controls = document.querySelector('.feed-controls')
      .getBoundingClientRect()
    const videoGrid = document.querySelector('#videoGrid')
      .getBoundingClientRect()
    const contains = rect => (
      highlight.left <= rect.left
      && highlight.top <= rect.top
      && highlight.right >= rect.right
      && highlight.bottom >= rect.bottom
    )
    return {
      containsControls: contains(controls),
      containsTitle: contains(title),
      containsVideoGrid: contains(videoGrid),
      highlightIsSubstantial: highlight.height > title.height * 2
    }
  })).toEqual({
    containsControls: true,
    containsTitle: true,
    containsVideoGrid: true,
    highlightIsSubstantial: true
  })
})

test('analytics bridge preserves classic global ownership during walkthrough', async ({
  page
}, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-standard')

  await seedCompletedState(page)
  await page.locator('.gear-btn[data-settings-shell-action="open"]').click()
  await page.locator(
    '[data-analytics-action="settings.walkthroughAgain"]'
  ).click()
  await expect(page.locator('body')).toHaveClass(/\bwalkthrough-active\b/)
  await expect(page.locator('.walkthrough-layer')).not.toHaveClass(/\bhidden\b/)
  await expect(page.locator('#mainApp')).toHaveJSProperty('inert', false)
})

test('Settings replay listeners preserve walkthrough and trailer handoffs', async ({
  page
}, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-standard')

  await seedCompletedState(page)
  const panel = page.locator('#settingsPanel')
  const opener = page.locator('.gear-btn[data-settings-shell-action="open"]')
  const walkthroughControl = page.locator(
    '[data-settings-replay-action="walkthrough"]'
  )
  const storedBeforeWalkthrough = await page.evaluate(
    () => localStorage.getItem('edenia_v1')
  )
  await opener.click()
  await page.evaluate(() => {
    window.__walkthroughReplayAtDocumentBubble = null
    document.addEventListener('click', event => {
      if (!event.target.closest('[data-settings-replay-action="walkthrough"]')) return
      window.__walkthroughReplayAtDocumentBubble = {
        hidden: document.getElementById('settingsPanel').classList.contains('hidden'),
        inert: document.getElementById('mainApp').inert,
        active: document.body.classList.contains('walkthrough-active')
      }
    }, { once: true })
  })
  await walkthroughControl.press('Enter')
  await expect.poll(() => page.evaluate(
    () => window.__walkthroughReplayAtDocumentBubble
  )).toEqual({
    hidden: true,
    inert: false,
    active: false
  })
  await expect(page.locator('body')).toHaveClass(/\bwalkthrough-active\b/)
  await expect(page.locator('.walkthrough-layer')).not.toHaveClass(/\bhidden\b/)
  await expect(page.locator('#mainApp')).toHaveJSProperty('inert', false)
  await expect(opener).toBeFocused()
  expect(await page.evaluate(() => localStorage.getItem('edenia_v1')))
    .toBe(storedBeforeWalkthrough)

  await page.reload()
  await waitForApplication(page)
  const storedBeforeTrailer = await page.evaluate(
    () => localStorage.getItem('edenia_v1')
  )
  await opener.click()
  const trailerControl = page.locator(
    '[data-settings-replay-action="trailer"]'
  )
  await page.evaluate(() => {
    window.__trailerReplayAtDocumentBubble = null
    document.addEventListener('click', event => {
      if (!event.target.closest('[data-settings-replay-action="trailer"]')) return
      window.__trailerReplayAtDocumentBubble = {
        hidden: document.getElementById('settingsPanel').classList.contains('hidden'),
        inert: document.getElementById('mainApp').inert,
        active: document.body.classList.contains('intro-active')
      }
    }, { once: true })
  })
  await trailerControl.press('Space')
  await expect.poll(() => page.evaluate(
    () => window.__trailerReplayAtDocumentBubble
  )).toEqual({
    hidden: true,
    inert: false,
    active: false
  })
  await expect(page.locator('#introTrailer')).not.toHaveClass(/\bhidden\b/)
  await expect(page.locator('body')).toHaveClass(/\bintro-active\b/)
  await expect(page.locator('#mainApp')).toHaveJSProperty('inert', true)
  await expect(page.locator('#introTrailer')).toHaveAttribute('data-scene', '0')
  await expect(page.locator('#introStartBtn')).toHaveAttribute(
    'data-i18n',
    'intro.finale.return'
  )
  expect(await page.evaluate(() => localStorage.getItem('edenia_v1')))
    .toBe(storedBeforeTrailer)
  expect(await page.evaluate(() => ({
    showWalkthroughAgain: Object.prototype.hasOwnProperty.call(
      window.EdeniaActions || {},
      'showWalkthroughAgain'
    ),
    showTrailerAgain: Object.prototype.hasOwnProperty.call(
      window.EdeniaActions || {},
      'showTrailerAgain'
    )
  }))).toEqual({
    showWalkthroughAgain: false,
    showTrailerAgain: false
  })
})

test('walkthrough replay preserves phone focus suppression', async ({
  page
}, testInfo) => {
  test.skip(testInfo.project.name !== 'phone-standard')

  await seedCompletedState(page)
  const opener = page.locator('.gear-btn[data-settings-shell-action="open"]')
  const storedBefore = await page.evaluate(() => localStorage.getItem('edenia_v1'))
  await opener.click()
  await page.evaluate(() => {
    window.__settingsReplayGearFocuses = 0
    document.addEventListener('focusin', event => {
      if (event.target.matches?.('.gear-btn')) {
        window.__settingsReplayGearFocuses += 1
      }
    })
  })
  await page.locator('[data-settings-replay-action="walkthrough"]').click()
  await expect(page.locator('#settingsPanel')).toHaveClass(/\bhidden\b/)
  await expect(page.locator('body')).toHaveClass(/\bwalkthrough-active\b/)
  await expect(page.locator('.walkthrough-layer')).not.toHaveClass(/\bhidden\b/)
  expect(await page.evaluate(() => window.__settingsReplayGearFocuses)).toBe(0)
  await expect(opener).not.toBeFocused()

  await page.keyboard.press('Escape')
  await expect(page.locator('body')).not.toHaveClass(/\bwalkthrough-active\b/)
  await opener.click()
  await page.evaluate(() => {
    window.__settingsReplayGearFocuses = 0
  })
  await page.locator('[data-settings-replay-action="trailer"]').click()
  await expect(page.locator('#introTrailer')).not.toHaveClass(/\bhidden\b/)
  await expect(page.locator('body')).toHaveClass(/\bintro-active\b/)
  expect(await page.evaluate(() => window.__settingsReplayGearFocuses))
    .toBeGreaterThan(0)
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
      window.EdeniaActions || {},
      'addSandboxDay'
    ),
    resetSandboxState: Object.prototype.hasOwnProperty.call(
      window.EdeniaActions || {},
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

test('Settings locale listeners preserve menu, localization, persistence, and ordering', async ({
  page
}, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-standard')

  await seedCompletedState(page)
  const settings = page.locator('#settingsPanel')
  const opener = page.locator('.gear-btn')
  const trigger = page.locator('#settingsLocaleBtn')
  const menu = page.locator('#settingsLocaleMenu')
  const toast = page.locator('#toast')

  await opener.click()
  await page.evaluate(() => {
    window.__settingsLocaleAnalytics = []
    window.EDENIA_ANALYTICS_ENABLED = true
    window.posthog = {
      capture(eventName, properties) {
        window.__settingsLocaleAnalytics.push({ eventName, properties })
      },
      setPersonProperties() {},
      get_distinct_id() {
        return 'preservation-settings-locale'
      }
    }
    window.__settingsLocaleAtTarget = null
    document.getElementById('settingsLocaleBtn').addEventListener(
      'click',
      event => {
        const button = event.currentTarget
        const localeMenu = document.getElementById('settingsLocaleMenu')
        window.__settingsLocaleAtTarget = {
          defaultPrevented: event.defaultPrevented,
          hidden: localeMenu.classList.contains('hidden'),
          expanded: button.getAttribute('aria-expanded'),
          activeId: document.activeElement?.id || null,
          left: localeMenu.style.left
        }
      },
      { once: true }
    )
  })

  await trigger.click()
  await expect.poll(() => page.evaluate(
    () => window.__settingsLocaleAtTarget
  )).toEqual({
    defaultPrevented: false,
    hidden: false,
    expanded: 'true',
    activeId: 'settingsLocaleBtn',
    left: expect.any(String)
  })
  await expect(menu).not.toHaveClass(/\bhidden\b/)
  await expect(trigger).toHaveAttribute('aria-expanded', 'true')
  await expect(trigger).toBeFocused()
  expect(await page.evaluate(() => window.__settingsLocaleAnalytics)).toEqual([])
  await expect(menu.locator('input[name="settingsLocale"]')).toHaveCount(5)
  await expect(menu.locator(
    'input[name="settingsLocale"][value="en"]'
  )).toBeChecked()

  const sameLocaleStorage = await page.evaluate(
    () => localStorage.getItem('edenia_v1')
  )
  await menu.locator(
    'input[name="settingsLocale"][value="en"]'
  ).dispatchEvent('change')
  await expect(menu).not.toHaveClass(/\bhidden\b/)
  await expect(trigger).toHaveAttribute('aria-expanded', 'true')
  expect(await page.evaluate(() => localStorage.getItem('edenia_v1')))
    .toBe(sameLocaleStorage)
  await expect(toast).not.toHaveClass(/\bshow\b/)

  const positionedLeft = await menu.evaluate(element => element.style.left)
  await trigger.click()
  await expect(menu).toHaveClass(/\bhidden\b/)
  await expect(trigger).toHaveAttribute('aria-expanded', 'false')
  expect(await menu.evaluate(element => element.style.left)).toBe(positionedLeft)

  await trigger.focus()
  await trigger.press('Enter')
  await expect(menu).not.toHaveClass(/\bhidden\b/)
  await page.locator('#settingsTitle').click()
  await expect(menu).toHaveClass(/\bhidden\b/)
  expect(await menu.evaluate(element => element.style.left)).toBe('')
  await expect(settings).not.toHaveClass(/\bhidden\b/)

  await trigger.press('Space')
  await expect(menu).not.toHaveClass(/\bhidden\b/)
  await page.keyboard.press('Escape')
  await expect(menu).toHaveClass(/\bhidden\b/)
  await expect(settings).toHaveClass(/\bhidden\b/)
  await expect(opener).toBeFocused()

  await page.evaluate(() => {
    window.EDENIA_ANALYTICS_ENABLED = false
  })
  await opener.click()
  await trigger.click()
  await page.evaluate(() => {
    window.__settingsLocaleChangeAtDocumentBubble = null
    document.addEventListener('change', event => {
      if (!event.target.matches('input[name="settingsLocale"]')) return
      const stored = JSON.parse(localStorage.getItem('edenia_v1'))
      const cookie = document.cookie
        .split('; ')
        .find(part => part.startsWith('edenia_config='))
      const cookieConfig = cookie
        ? JSON.parse(decodeURIComponent(cookie.slice(cookie.indexOf('=') + 1)))
        : null
      window.__settingsLocaleChangeAtDocumentBubble = {
        eventValue: event.target.value,
        storedLocale: stored.config.locale,
        cookieLocale: cookieConfig?.locale || null,
        htmlLang: document.documentElement.lang,
        settingsTitle: document.getElementById('settingsTitle').textContent,
        localeLabel: document.getElementById('settingsLocaleLabel').textContent,
        menuHidden: document.getElementById('settingsLocaleMenu')
          .classList.contains('hidden'),
        expanded: document.getElementById('settingsLocaleBtn')
          .getAttribute('aria-expanded'),
        settingsHidden: document.getElementById('settingsPanel')
          .classList.contains('hidden'),
        mainInert: document.getElementById('mainApp').inert,
        themeLabel: document.getElementById('themeToggle')
          .getAttribute('aria-label'),
        toast: document.getElementById('toast').textContent,
        toastShown: document.getElementById('toast').classList.contains('show'),
        activity: stored.activityLog[0]
      }
    }, { once: true })
  })
  const frenchOption = menu.locator(
    'input[name="settingsLocale"][value="fr"]'
  )
  await frenchOption.focus()
  await frenchOption.press('Space')
  await expect.poll(() => page.evaluate(
    () => window.__settingsLocaleChangeAtDocumentBubble
  )).toMatchObject({
    eventValue: 'fr',
    storedLocale: 'fr',
    cookieLocale: 'fr',
    htmlLang: 'fr',
    settingsTitle: 'Réglages',
    localeLabel: 'Français',
    menuHidden: true,
    expanded: 'false',
    settingsHidden: false,
    mainInert: true,
    themeLabel: 'Passer en mode sombre',
    toast: 'Langue changée en Français',
    toastShown: true,
    activity: {
      actor: 'user',
      type: 'locale',
      status: 'success',
      title: 'Langue modifiée',
      detail: 'Langue réglée sur Français.'
    }
  })
  await expect(page.locator('html')).toHaveAttribute('lang', 'fr')
  await expect(settings).not.toHaveClass(/\bhidden\b/)

  await trigger.click()
  const traditionalChineseOption = menu.locator(
    'input[name="settingsLocale"][value="zh-Hant"]'
  )
  await traditionalChineseOption.focus()
  await traditionalChineseOption.press('Space')
  await expect(page.locator('html')).toHaveAttribute('lang', 'zh-Hant')
  await expect(trigger).toHaveAttribute('aria-expanded', 'false')

  const bridgeState = await page.evaluate(() => ({
    toggleLocaleMenu: Object.prototype.hasOwnProperty.call(
      window.EdeniaActions || {},
      'toggleLocaleMenu'
    ),
    saveLocaleFromSettings: Object.prototype.hasOwnProperty.call(
      window.EdeniaActions || {},
      'saveLocaleFromSettings'
    ),
    toggleIntroLocaleMenu: Object.prototype.hasOwnProperty.call(
      window.EdeniaActions || {},
      'toggleIntroLocaleMenu'
    ),
    changeIntroLocale: Object.prototype.hasOwnProperty.call(
      window.EdeniaActions || {},
      'changeIntroLocale'
    ),
    toggleOnboardingLocaleMenu: Object.prototype.hasOwnProperty.call(
      window.EdeniaActions || {},
      'toggleOnboardingLocaleMenu'
    ),
    changeOnboardingLocale: Object.prototype.hasOwnProperty.call(
      window.EdeniaActions || {},
      'changeOnboardingLocale'
    )
  }))
  expect(bridgeState).toEqual({
    toggleLocaleMenu: false,
    saveLocaleFromSettings: false,
    toggleIntroLocaleMenu: false,
    changeIntroLocale: false,
    toggleOnboardingLocaleMenu: false,
    changeOnboardingLocale: false
  })
})

test('Settings sync listeners preserve download, picker, import, and failure ordering', async ({
  page
}, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-standard')

  await seedCompletedState(page)
  const settings = page.locator('#settingsPanel')
  const exportControl = page.locator(
    '[data-settings-sync-action="export"]'
  )
  const importControl = page.locator(
    '[data-settings-sync-action="choose-file"]'
  )
  const input = page.locator(
    '#syncFileInput[data-settings-sync-action="import-file"]'
  )
  const toast = page.locator('#toast')
  await page.evaluate(() => {
    const stored = JSON.parse(localStorage.getItem('edenia_v1'))
    stored.videoWatchReminders = {
      'protected-reminder': {
        openedAt: '2026-07-27T04:00:00.000Z'
      }
    }
    localStorage.setItem('edenia_v1', JSON.stringify(stored))
    localStorage.removeItem('edenia_v1_backups')
  })
  await page.reload()
  await waitForApplication(page)
  await page.locator('.gear-btn').click()
  const primaryBeforeExport = await page.evaluate(
    () => localStorage.getItem('edenia_v1')
  )
  const backupsBeforeExport = await page.evaluate(
    () => localStorage.getItem('edenia_v1_backups')
  )

  await page.evaluate(() => {
    window.__settingsSyncOrder = []
    window.EDENIA_ANALYTICS_ENABLED = true
    window.posthog = {
      capture(eventName, properties) {
        window.__settingsSyncOrder.push({
          type: 'analytics',
          eventName,
          properties
        })
      },
      setPersonProperties() {},
      get_distinct_id() {
        return 'preservation-settings-sync'
      }
    }
    const exportObserver = event => {
      if (!event.target.matches('[data-settings-sync-action="export"]')) return
      document.removeEventListener('click', exportObserver)
      window.__settingsSyncOrder.push({
        type: 'export-document',
        toast: document.getElementById('toast').textContent,
        toastShown: document.getElementById('toast').classList.contains('show'),
        settingsHidden: document.getElementById('settingsPanel')
          .classList.contains('hidden')
      })
    }
    document.addEventListener('click', exportObserver)
  })

  const downloadPromise = page.waitForEvent('download')
  await exportControl.focus()
  await exportControl.press('Enter')
  const download = await downloadPromise
  expect(download.suggestedFilename()).toBe('edenia-sync-2026-07-28.json')
  const downloadPath = await download.path()
  const downloadText = await readFile(downloadPath, 'utf8')
  const exported = JSON.parse(downloadText)
  expect(downloadText.startsWith('{\n  "app": "edenia"')).toBe(true)
  expect(exported).toMatchObject({
    app: 'edenia',
    syncVersion: 1,
    exportedAt: fixedNow.toISOString(),
    sandbox: false
  })
  expect(Object.prototype.hasOwnProperty.call(
    exported.state,
    'videoWatchReminders'
  )).toBe(false)
  expect(exported.state).toEqual(JSON.parse(primaryBeforeExport))
  expect(await page.evaluate(() => localStorage.getItem('edenia_v1')))
    .toBe(primaryBeforeExport)
  expect(await page.evaluate(
    () => localStorage.getItem('edenia_v1_backups')
  )).toBe(backupsBeforeExport)
  expect(await page.evaluate(() => window.__settingsSyncOrder)).toEqual([
    {
      type: 'analytics',
      eventName: 'settings_sync_export_clicked',
      properties: {
        action: 'settings.sync.export',
        button_name: 'Export sync file',
        control_type: 'button'
      }
    },
    {
      type: 'export-document',
      toast: 'Sync file exported',
      toastShown: true,
      settingsHidden: false
    }
  ])

  await page.evaluate(() => {
    localStorage.removeItem('edenia_v1_backups')
  })
  await page.evaluate(() => {
    window.__settingsSyncOrder = []
    const syncInput = document.getElementById('syncFileInput')
    syncInput.addEventListener('click', () => {
      window.__settingsSyncOrder.push({ type: 'input-click' })
    }, { once: true })
    const importObserver = event => {
      if (!event.target.matches(
        '[data-settings-sync-action="choose-file"]'
      )) return
      document.removeEventListener('click', importObserver)
      window.__settingsSyncOrder.push({ type: 'import-document' })
    }
    document.addEventListener('click', importObserver)
  })
  const fileChooserPromise = page.waitForEvent('filechooser')
  await importControl.focus()
  await importControl.press('Enter')
  const fileChooser = await fileChooserPromise
  expect(await page.evaluate(() => window.__settingsSyncOrder)).toEqual([
    { type: 'input-click' },
    {
      type: 'analytics',
      eventName: 'settings_sync_import_clicked',
      properties: {
        action: 'settings.sync.import',
        button_name: 'Import sync file',
        control_type: 'button'
      }
    },
    { type: 'import-document' }
  ])

  const importedState = JSON.parse(primaryBeforeExport)
  importedState.config.locale = 'fr'
  importedState.config.theme = 'dark'
  importedState.config.ankiEnabled = false
  importedState.config.ankiDisabledAt = '2026-07-26T04:00:00.000Z'
  importedState.config.includeShorts = true
  importedState.config.studyInsights.enabled = true
  importedState.activityLog = []
  importedState.videoWatchReminders = {
    'must-be-cleared': {
      openedAt: '2026-07-28T03:00:00.000Z'
    }
  }
  await page.evaluate(() => {
    window.EDENIA_ANALYTICS_ENABLED = false
  })
  await fileChooser.setFiles({
    name: 'protected-sync.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify({
      app: 'edenia',
      syncVersion: 1,
      exportedAt: fixedNow.toISOString(),
      sandbox: false,
      state: importedState
    }))
  })

  await expect(toast).toHaveText('Fichier de synchronisation importé')
  await expect(page.locator('html')).toHaveAttribute('lang', 'fr')
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
  await expect(settings).not.toHaveClass(/\bhidden\b/)
  await expect(page.locator('#settingsTitle')).toHaveText('Réglages')
  await expect(page.locator('#settingsIncludeShorts')).toBeChecked()
  await expect(page.locator('#settingsAnkiEnabled')).not.toBeChecked()
  await expect(page.locator('#settingsInsightsEnabled')).toBeChecked()
  expect(await input.evaluate(element => ({
    files: element.files?.length || 0,
    value: element.value
  }))).toEqual({
    files: 0,
    value: ''
  })

  const importResult = await page.evaluate(() => {
    const state = JSON.parse(localStorage.getItem('edenia_v1'))
    const backups = JSON.parse(
      localStorage.getItem('edenia_v1_backups') || '[]'
    )
    const cookie = document.cookie
      .split('; ')
      .find(part => part.startsWith('edenia_config='))
    return {
      state,
      backups,
      cookieConfig: cookie
        ? JSON.parse(decodeURIComponent(cookie.slice(cookie.indexOf('=') + 1)))
        : null,
      bridge: {
        exportSyncFile: Object.prototype.hasOwnProperty.call(
          window.EdeniaActions || {},
          'exportSyncFile'
        ),
        importSyncFileFromInput: Object.prototype.hasOwnProperty.call(
          window.EdeniaActions || {},
          'importSyncFileFromInput'
        )
      }
    }
  })
  expect(importResult.state.config).toMatchObject({
    locale: 'fr',
    theme: 'dark',
    ankiEnabled: false,
    includeShorts: true
  })
  expect(Object.prototype.hasOwnProperty.call(
    importResult.state,
    'videoWatchReminders'
  )).toBe(false)
  expect(importResult.state.activityLog.slice(0, 2)).toMatchObject([
    {
      actor: 'user',
      type: 'import',
      status: 'success',
      title: 'Sync file imported',
      detail: 'protected-sync.json'
    },
    {
      actor: 'auto',
      type: 'backup',
      status: 'info',
      title: 'Rollback backup created',
      detail: 'Saved a local backup before importing a sync file.'
    }
  ])
  expect(importResult.backups).toHaveLength(1)
  expect(importResult.backups[0]).toMatchObject({
    reason: 'before sync import',
    sandbox: false,
    state: {
      config: {
        locale: 'en',
        theme: 'light'
      }
    }
  })
  expect(importResult.cookieConfig).toMatchObject({
    locale: 'fr',
    theme: 'dark',
    ankiEnabled: false,
    includeShorts: true
  })
  expect(importResult.bridge).toEqual({
    exportSyncFile: false,
    importSyncFileFromInput: false
  })

  const primaryBeforeInvalidFile = await page.evaluate(
    () => localStorage.getItem('edenia_v1')
  )
  const backupsBeforeInvalidFile = await page.evaluate(
    () => localStorage.getItem('edenia_v1_backups')
  )
  const invalidChooserPromise = page.waitForEvent('filechooser')
  await importControl.click()
  const invalidChooser = await invalidChooserPromise
  await invalidChooser.setFiles({
    name: 'invalid-sync.json',
    mimeType: 'application/json',
    buffer: Buffer.from('{not valid json')
  })
  await expect(toast).toHaveText(
    'Ce fichier de synchronisation contient du JSON non valide'
  )
  expect(await page.evaluate(() => localStorage.getItem('edenia_v1')))
    .toBe(primaryBeforeInvalidFile)
  expect(await page.evaluate(
    () => localStorage.getItem('edenia_v1_backups')
  )).toBe(backupsBeforeInvalidFile)
  expect(await input.evaluate(element => ({
    files: element.files?.length || 0,
    value: element.value
  }))).toEqual({
    files: 0,
    value: ''
  })

  const primaryBeforeQuotaFailure = await page.evaluate(
    () => localStorage.getItem('edenia_v1')
  )
  await page.evaluate(() => {
    window.__originalStorageSetItem = Storage.prototype.setItem
    Storage.prototype.setItem = function setItemWithImportQuota(key, value) {
      if (key === 'edenia_v1') {
        throw new DOMException(
          'Setting the value of edenia_v1 exceeded the quota.',
          'QuotaExceededError'
        )
      }
      return window.__originalStorageSetItem.call(this, key, value)
    }
  })
  const quotaChooserPromise = page.waitForEvent('filechooser')
  await importControl.click()
  const quotaChooser = await quotaChooserPromise
  await quotaChooser.setFiles({
    name: 'quota-sync.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify({
      app: 'edenia',
      syncVersion: 1,
      exportedAt: fixedNow.toISOString(),
      sandbox: false,
      state: importedState
    }))
  })
  await expect(toast).toHaveText(
    'L’espace de stockage du navigateur est insuffisant pour importer ce fichier en toute sécurité. Votre progression actuelle n’a pas été modifiée.'
  )
  const quotaFailureResult = await page.evaluate(() => {
    Storage.prototype.setItem = window.__originalStorageSetItem
    delete window.__originalStorageSetItem
    return {
      primary: localStorage.getItem('edenia_v1'),
      backups: JSON.parse(
        localStorage.getItem('edenia_v1_backups') || '[]'
      )
    }
  })
  expect(quotaFailureResult.primary).toBe(primaryBeforeQuotaFailure)
  expect(quotaFailureResult.backups).toHaveLength(1)
  expect(quotaFailureResult.backups[0]).toMatchObject({
    reason: 'before sync import',
    sandbox: false,
    state: {
      config: {
        locale: 'fr',
        theme: 'dark'
      }
    }
  })
  expect(await input.evaluate(element => ({
    files: element.files?.length || 0,
    value: element.value
  }))).toEqual({
    files: 0,
    value: ''
  })
})

test('backup Restore listeners preserve live IDs, rollback order, localization, and analytics', async ({
  page
}, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-standard')

  await seedCompletedState(page)
  await page.evaluate(() => {
    const current = JSON.parse(localStorage.getItem('edenia_v1'))
    const restored = structuredClone(current)
    restored.config.locale = 'fr'
    restored.config.theme = 'dark'
    restored.config.weeklyGoalHours = 7
    restored.config.includeShorts = false
    restored.config.studyInsights.enabled = false
    restored.config.apiKey = 'legacy-key-that-must-not-return'
    restored.videoWatchReminders = {
      legacy: { watchedAt: '2026-07-21T04:00:00.000Z' }
    }
    restored.activityLog = [{
      id: 'restore-marker',
      createdAt: '2026-07-20T04:00:00.000Z',
      actor: 'user',
      type: 'marker',
      status: 'info',
      title: 'Restore marker',
      detail: 'Protected backup payload'
    }]
    localStorage.setItem('edenia_v1_backups', JSON.stringify([{
      id: 'restore-target',
      createdAt: '2026-07-27T04:00:00.000Z',
      reason: 'before sync import',
      sandbox: false,
      state: restored
    }]))
    localStorage.removeItem('edenia_posthog_state_v2')
  })
  await page.reload()
  await waitForApplication(page)
  await page.evaluate(() => {
    window.__backupRestoreAnalytics = []
    window.EDENIA_ANALYTICS_ENABLED = true
    window.posthog = {
      capture(eventName, properties) {
        window.__backupRestoreAnalytics.push({ eventName, properties })
      },
      get_distinct_id() {
        return 'preservation-backup-restore'
      },
      setPersonProperties() {}
    }
  })

  await page.locator('.gear-btn').click()
  await page.locator('.backup-toggle').click()
  const list = page.locator('#backupList')
  const restoreSelector =
    '[data-settings-backup-action="restore"][data-backup-id="restore-target"]'
  const initialRestore = list.locator(restoreSelector)
  await expect(initialRestore).toHaveText('Restore')
  await expect(initialRestore).not.toHaveAttribute('onclick')

  const primaryBeforeMissing = await page.evaluate(
    () => localStorage.getItem('edenia_v1')
  )
  const backupsBeforeMissing = await page.evaluate(
    () => localStorage.getItem('edenia_v1_backups')
  )
  await initialRestore.evaluate(control => {
    control.dataset.backupId = 'missing-live-id'
    control.click()
  })
  await expect(page.locator('#toast')).toHaveText(
    'That backup is not available anymore'
  )
  expect(await page.evaluate(() => localStorage.getItem('edenia_v1')))
    .toBe(primaryBeforeMissing)
  expect(await page.evaluate(() => localStorage.getItem('edenia_v1_backups')))
    .toBe(backupsBeforeMissing)
  await expect(list.locator(restoreSelector)).toHaveCount(1)
  await expect.poll(() => page.evaluate(() => (
    window.__backupRestoreAnalytics
      .filter(entry => entry.eventName === 'restore_state_backup_clicked')
      .length
  ))).toBe(1)

  await page.evaluate(() => {
    const entries = JSON.parse(
      localStorage.getItem('edenia_v1_backups') || '[]'
    )
    localStorage.setItem('edenia_v1_backups', JSON.stringify(
      entries.filter(entry => entry.id === 'restore-target')
    ))
  })
  const restoreControl = list.locator(restoreSelector)
  const restoreLabel = await restoreControl.textContent()
  await page.evaluate(() => {
    window.__backupRestoreAnalytics.length = 0
    window.__backupRestoreAtDocumentBubble = null
    document.addEventListener('click', event => {
      if (!event.target.matches?.(
        '[data-settings-backup-action="restore"]'
      )) return
      const state = JSON.parse(localStorage.getItem('edenia_v1'))
      const backups = JSON.parse(
        localStorage.getItem('edenia_v1_backups') || '[]'
      )
      const cookie = document.cookie
        .split('; ')
        .find(part => part.startsWith('edenia_config='))
      const cookieConfig = cookie
        ? JSON.parse(decodeURIComponent(cookie.slice(cookie.indexOf('=') + 1)))
        : null
      const clickEvent = window.__backupRestoreAnalytics.find(
        entry => entry.eventName === 'restore_state_backup_clicked'
      )
      window.__backupRestoreAtDocumentBubble = {
        targetConnected: event.target.isConnected,
        locale: state.config.locale,
        theme: state.config.theme,
        weeklyGoalHours: state.config.weeklyGoalHours,
        includeShorts: state.config.includeShorts,
        insightsEnabled: state.config.studyInsights?.enabled,
        apiKeyPresent: Object.prototype.hasOwnProperty.call(
          state.config,
          'apiKey'
        ),
        remindersPresent: Object.prototype.hasOwnProperty.call(
          state,
          'videoWatchReminders'
        ),
        activity: state.activityLog.slice(0, 3).map(entry => ({
          actor: entry.actor,
          type: entry.type,
          title: entry.title,
          detail: entry.detail
        })),
        rollback: {
          reason: backups[0]?.reason,
          locale: backups[0]?.state?.config?.locale,
          theme: backups[0]?.state?.config?.theme
        },
        targetStillStored: backups.some(
          entry => entry.id === 'restore-target'
        ),
        htmlLang: document.documentElement.lang,
        htmlTheme: document.documentElement.dataset.theme,
        cookieLocale: cookieConfig?.locale || null,
        settingsHidden: document.getElementById('settingsPanel')
          .classList.contains('hidden'),
        backupContentHidden: document.getElementById('backupContent').hidden,
        newRestoreLabel: document.querySelector(
          '[data-settings-backup-action="restore"]'
        )?.textContent,
        toast: document.getElementById('toast').textContent,
        clickedEventCount: window.__backupRestoreAnalytics.filter(
          entry => entry.eventName === 'restore_state_backup_clicked'
        ).length,
        buttonName: clickEvent?.properties?.button_name
      }
    }, { once: true })
  })
  await restoreControl.focus()
  await restoreControl.press('Enter')

  await expect.poll(() => page.evaluate(
    () => window.__backupRestoreAtDocumentBubble
  )).toMatchObject({
    targetConnected: false,
    locale: 'fr',
    theme: 'dark',
    weeklyGoalHours: 7,
    includeShorts: false,
    insightsEnabled: false,
    apiKeyPresent: false,
    remindersPresent: false,
    activity: [
      {
        actor: 'user',
        type: 'backup-restore',
        title: 'Backup restored'
      },
      {
        actor: 'auto',
        type: 'backup',
        title: 'Rollback backup created',
        detail: 'Saved a local backup before restoring another backup.'
      },
      {
        actor: 'user',
        type: 'marker',
        title: 'Restore marker',
        detail: 'Protected backup payload'
      }
    ],
    rollback: {
      reason: 'before backup restore',
      locale: 'en',
      theme: 'light'
    },
    targetStillStored: true,
    htmlLang: 'fr',
    htmlTheme: 'dark',
    cookieLocale: 'fr',
    settingsHidden: false,
    backupContentHidden: false,
    newRestoreLabel: 'Restaurer',
    toast: 'Sauvegarde restaurée',
    clickedEventCount: 1,
    buttonName: restoreLabel
  })
  await expect(page.locator('#settingsIncludeShorts')).not.toBeChecked()
  await expect(page.locator('#settingsInsightsEnabled')).not.toBeChecked()
  await expect(restoreControl).not.toBeFocused()
  const removedBridgeAction = await page.evaluate(() => (
    Object.prototype.hasOwnProperty.call(
      window.EdeniaActions || {},
      'restoreStateBackup'
    )
  ))
  expect(removedBridgeAction).toBe(false)
})

test('Settings preference listeners preserve synchronous saves and Anki timing', async ({
  page
}, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-standard')

  await seedCompletedState(page)
  await page.evaluate(() => {
    const stored = JSON.parse(localStorage.getItem('edenia_v1'))
    stored.config.includeShorts = true
    stored.config.ankiEnabled = false
    stored.config.ankiDisabledAt = '2026-07-20T04:00:00.000Z'
    stored.config.studyInsights.enabled = true
    stored.videos.shortvideo1 = {
      id: 'shortvideo1',
      title: 'Protected short video',
      channelId: 'protected-channel',
      channelTitle: 'Protected channel',
      thumbnail: 'https://i.ytimg.com/vi/shortvideo1/hqdefault.jpg',
      publishedAt: '2026-07-27T04:00:00.000Z',
      duration: 120,
      isShort: true,
      status: 'unwatched'
    }
    localStorage.setItem('edenia_v1', JSON.stringify(stored))
    localStorage.removeItem('edenia_v1_backups')
  })
  await page.reload()
  await waitForApplication(page)

  const shortCard = page.locator(
    '#videoGrid .video-card[data-video-id="shortvideo1"]'
  )
  const shorts = page.locator('#settingsIncludeShorts')
  const anki = page.locator('#settingsAnkiEnabled')
  const insights = page.locator('#settingsInsightsEnabled')
  await expect(shortCard).toHaveCount(1)
  await page.locator('.gear-btn').click()

  await page.evaluate(() => {
    window.__shortsPreferenceAtDocumentBubble = null
    document.addEventListener('change', event => {
      if (event.target.id !== 'settingsIncludeShorts') return
      const stored = JSON.parse(localStorage.getItem('edenia_v1'))
      window.__shortsPreferenceAtDocumentBubble = {
        checked: event.target.checked,
        stored: stored.config.includeShorts,
        activity: stored.activityLog[0],
        cardVisible: Boolean(document.querySelector(
          '#videoGrid .video-card[data-video-id="shortvideo1"]'
        ))
      }
    }, { once: true })
  })
  await page.locator('.settings-shorts-group label').click()
  await expect.poll(() => page.evaluate(
    () => window.__shortsPreferenceAtDocumentBubble
  )).toMatchObject({
    checked: false,
    stored: false,
    activity: {
      actor: 'user',
      type: 'short-videos',
      status: 'success',
      title: 'Short video setting changed',
      detail: 'Short videos are hidden.'
    },
    cardVisible: false
  })
  await expect(shortCard).toHaveCount(0)
  expect(await page.evaluate(() => (
    JSON.parse(localStorage.getItem('edenia_v1')).videos.shortvideo1.isShort
  ))).toBe(true)
  const cookieAfterShorts = await page.evaluate(() => {
    const cookie = document.cookie
      .split('; ')
      .find(part => part.startsWith('edenia_config='))
    return cookie
      ? JSON.parse(decodeURIComponent(cookie.slice(cookie.indexOf('=') + 1)))
      : null
  })
  expect(cookieAfterShorts.includeShorts).toBe(false)

  await page.evaluate(() => {
    window.__insightsPreferenceAtDocumentBubble = null
    document.addEventListener('change', event => {
      if (event.target.id !== 'settingsInsightsEnabled') return
      const stored = JSON.parse(localStorage.getItem('edenia_v1'))
      window.__insightsPreferenceAtDocumentBubble = {
        checked: event.target.checked,
        stored: stored.config.studyInsights.enabled,
        activity: stored.activityLog[0],
        cardHidden: document.getElementById('studyInsightCard')
          .classList.contains('hidden'),
        reopenHidden: document.getElementById('studyInsightReopen')
          .classList.contains('hidden')
      }
    }, { once: true })
  })
  await insights.focus()
  await insights.press('Space')
  await expect.poll(() => page.evaluate(
    () => window.__insightsPreferenceAtDocumentBubble
  )).toMatchObject({
    checked: false,
    stored: false,
    activity: {
      actor: 'user',
      type: 'study-insights-setting',
      status: 'success',
      title: 'Study insights setting changed',
      detail: 'Study insights are hidden.'
    },
    cardHidden: true,
    reopenHidden: true
  })

  await shorts.focus()
  await shorts.press('Space')
  await expect(shortCard).toHaveCount(1)
  await expect(shorts).toBeChecked()

  let ankiRequestCount = 0
  let releaseFirstAnkiResponse
  let markFirstAnkiRequestStarted
  const firstAnkiRequestStarted = new Promise(resolve => {
    markFirstAnkiRequestStarted = resolve
  })
  const firstAnkiResponseGate = new Promise(resolve => {
    releaseFirstAnkiResponse = resolve
  })
  await page.route('http://127.0.0.1:8765/**', async route => {
    ankiRequestCount += 1
    if (ankiRequestCount === 1) {
      markFirstAnkiRequestStarted()
      await firstAnkiResponseGate
    }
    await route.fulfill({
      body: JSON.stringify({
        error: null,
        result: [
          { error: null, result: 0 },
          { error: null, result: [] },
          { error: null, result: [] }
        ]
      }),
      contentType: 'application/json',
      status: 200
    })
  })
  await page.evaluate(() => {
    window.__ankiPreferenceAtDocumentBubble = null
    document.addEventListener('change', event => {
      if (event.target.id !== 'settingsAnkiEnabled') return
      const stored = JSON.parse(localStorage.getItem('edenia_v1'))
      window.__ankiPreferenceAtDocumentBubble = {
        checked: event.target.checked,
        storedAnki: stored.config.ankiEnabled,
        storedShorts: stored.config.includeShorts,
        storedInsights: stored.config.studyInsights.enabled,
        hasAnkiActivity: stored.activityLog.some(
          entry => entry.type === 'anki-setting'
        )
      }
    }, { once: true })
  })
  await anki.focus()
  await anki.press('Space')
  await firstAnkiRequestStarted
  await expect.poll(() => page.evaluate(
    () => window.__ankiPreferenceAtDocumentBubble
  )).toEqual({
    checked: true,
    storedAnki: false,
    storedShorts: true,
    storedInsights: false,
    hasAnkiActivity: false
  })

  await page.evaluate(() => {
    document.getElementById('settingsIncludeShorts').checked = false
    document.getElementById('settingsInsightsEnabled').checked = true
  })
  releaseFirstAnkiResponse()
  await expect.poll(() => page.evaluate(() => {
    const stored = JSON.parse(localStorage.getItem('edenia_v1'))
    return {
      anki: stored.config.ankiEnabled,
      shorts: stored.config.includeShorts,
      insights: stored.config.studyInsights.enabled,
      disabledAt: stored.config.ankiDisabledAt,
      baseline: stored.config.ankiResumeBaselines?.['2026-07-28'] || null,
      activityTypes: stored.activityLog.map(entry => entry.type)
    }
  })).toMatchObject({
    anki: true,
    shorts: false,
    insights: false,
    disabledAt: null,
    baseline: {
      rawReviewed: 0,
      rawCreated: 0,
      trackedReviewed: 0,
      trackedCreated: 0,
      createdAt: fixedNow.toISOString()
    },
    activityTypes: expect.arrayContaining([
      'anki-setting',
      'short-videos'
    ])
  })
  await expect.poll(() => ankiRequestCount).toBeGreaterThanOrEqual(2)
  await expect(anki).toBeChecked()
  await expect(shorts).not.toBeChecked()
  await expect(insights).toBeChecked()
  expect(await page.evaluate(() => (
    Object.prototype.hasOwnProperty.call(
      window.EdeniaActions || {},
      'saveSettingsOnTheFly'
    )
  ))).toBe(false)
})

test('Settings preferences preserve raw Anki state on coarse-pointer devices', async ({
  page
}, testInfo) => {
  test.skip(!['tablet-portrait', 'phone-standard'].includes(
    testInfo.project.name
  ))

  await seedCompletedState(page)
  await page.evaluate(() => {
    const stored = JSON.parse(localStorage.getItem('edenia_v1'))
    stored.config.ankiEnabled = true
    stored.config.ankiDisabledAt = null
    stored.config.includeShorts = true
    stored.config.studyInsights.enabled = true
    stored.anki['2026-07-27'] = {
      reviewed: 60,
      created: 2,
      loggedAt: '2026-07-27T12:00:00.000Z',
      source: 'ankiconnect',
      rawReviewed: 60,
      rawCreated: 2
    }
    localStorage.setItem('edenia_v1', JSON.stringify(stored))
  })
  await page.reload()
  await waitForApplication(page)

  let ankiRequests = 0
  page.on('request', request => {
    if (request.url().startsWith('http://127.0.0.1:8765/')) {
      ankiRequests += 1
    }
  })
  await page.locator('.gear-btn').click()
  await expect(page.locator('.settings-anki-group')).toBeHidden()
  await page.locator('.settings-howto-toggle').click()
  await expect(page.locator('.settings-anki-section')).toBeHidden()
  await expect(page.locator('.settings-scoring-section')).toBeHidden()
  await expect(page.locator('.settings-shorts-group')).toBeVisible()
  await expect(page.locator('.settings-insights-group')).toBeVisible()
  await expect(page.locator('#settingsAnkiEnabled')).toBeChecked()

  await page.locator('#settingsIncludeShorts').focus()
  await page.locator('#settingsIncludeShorts').press('Space')
  await page.locator('#settingsInsightsEnabled').focus()
  await page.locator('#settingsInsightsEnabled').press('Space')
  await expect.poll(() => page.evaluate(() => {
    const stored = JSON.parse(localStorage.getItem('edenia_v1'))
    return {
      ankiEnabled: stored.config.ankiEnabled,
      ankiDisabledAt: stored.config.ankiDisabledAt,
      includeShorts: stored.config.includeShorts,
      insightsEnabled: stored.config.studyInsights.enabled,
      ankiDay: stored.anki['2026-07-27']
    }
  })).toEqual({
    ankiEnabled: true,
    ankiDisabledAt: null,
    includeShorts: false,
    insightsEnabled: false,
    ankiDay: {
      reviewed: 60,
      created: 2,
      loggedAt: '2026-07-27T12:00:00.000Z',
      source: 'ankiconnect',
      rawReviewed: 60,
      rawCreated: 2
    }
  })
  expect(ankiRequests).toBe(0)
  expect(await page.evaluate(() => (
    Object.prototype.hasOwnProperty.call(
      window.EdeniaActions || {},
      'saveSettingsOnTheFly'
    )
  ))).toBe(false)
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
    Object.prototype.hasOwnProperty.call(window.EdeniaActions || {}, 'toggleTheme')
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
      window.EdeniaActions || {},
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
      window.EdeniaActions || {},
      'openFeedbackModal'
    ),
    closeFeedbackModal: Object.prototype.hasOwnProperty.call(
      window.EdeniaActions || {},
      'closeFeedbackModal'
    )
  }))
  expect(removedBridgeActions).toEqual({
    openFeedbackModal: false,
    closeFeedbackModal: false
  })
})

test('feedback submission listener preserves validation, analytics, reset, focus, and storage', async ({
  page
}, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-standard')

  await seedCompletedState(page)
  const modal = page.locator('#feedbackModal')
  const launcher = page.locator('#feedbackLaunchBtn')
  const form = page.locator('#feedbackForm')
  const message = page.locator('#feedbackMessage')
  const name = page.locator('#feedbackName')
  const email = page.locator('#feedbackEmail')
  const status = page.locator('#feedbackStatus')
  const submit = page.locator('#feedbackSubmitBtn')
  const confirmation = page.locator('#feedbackConfirmation')
  const confirmationControl = page.locator('.feedback-confirmation-ok')
  const storedBefore = await page.evaluate(() => localStorage.getItem('edenia_v1'))

  await launcher.click()
  await expect(message).toBeFocused()

  await page.evaluate(() => {
    window.__feedbackNativeSubmitCount = 0
    window.__feedbackNativeSubmitObserver = event => {
      if (event.target.id === 'feedbackForm') {
        window.__feedbackNativeSubmitCount += 1
      }
    }
    document.addEventListener('submit', window.__feedbackNativeSubmitObserver)
  })
  await submit.click()
  expect(await page.evaluate(() => window.__feedbackNativeSubmitCount)).toBe(0)
  await expect(message).toBeFocused()
  await expect(modal).not.toHaveClass(/\bhidden\b/)
  expect(await message.evaluate(element => ({
    valid: element.validity.valid,
    valueMissing: element.validity.valueMissing
  }))).toEqual({
    valid: false,
    valueMissing: true
  })
  await page.evaluate(() => {
    document.removeEventListener(
      'submit',
      window.__feedbackNativeSubmitObserver
    )
  })

  await message.fill('   ')
  await page.evaluate(() => {
    window.__feedbackWhitespaceSubmit = null
    document.addEventListener('submit', event => {
      if (event.target.id !== 'feedbackForm') return
      window.__feedbackWhitespaceSubmit = {
        defaultPrevented: event.defaultPrevented,
        status: document.getElementById('feedbackStatus').textContent,
        statusClass: document.getElementById('feedbackStatus').className,
        activeId: document.activeElement?.id || null,
        modalHidden: document.getElementById('feedbackModal')
          .classList.contains('hidden'),
        message: document.getElementById('feedbackMessage').value
      }
    }, { once: true })
  })
  await submit.click()
  await expect.poll(() => page.evaluate(
    () => window.__feedbackWhitespaceSubmit
  )).toEqual({
    defaultPrevented: true,
    status: 'Please write a message before sending.',
    statusClass: 'feedback-status is-error',
    activeId: 'feedbackMessage',
    modalHidden: false,
    message: '   '
  })
  await expect(status).toHaveText('Please write a message before sending.')
  await expect(message).toBeFocused()

  await message.fill('Feedback capture should remain unavailable locally.')
  await page.evaluate(() => {
    window.__feedbackUnavailableSubmit = null
    document.addEventListener('submit', event => {
      if (event.target.id !== 'feedbackForm') return
      window.__feedbackUnavailableSubmit = {
        defaultPrevented: event.defaultPrevented,
        status: document.getElementById('feedbackStatus').textContent,
        activeId: document.activeElement?.id || null,
        modalHidden: document.getElementById('feedbackModal')
          .classList.contains('hidden'),
        confirmationHidden: document.getElementById('feedbackConfirmation')
          .classList.contains('hidden'),
        message: document.getElementById('feedbackMessage').value,
        busy: document.getElementById('feedbackForm').getAttribute('aria-busy'),
        disabled: document.getElementById('feedbackSubmitBtn').disabled
      }
    }, { once: true })
  })
  await submit.click()
  await expect.poll(() => page.evaluate(
    () => window.__feedbackUnavailableSubmit
  )).toEqual({
    defaultPrevented: true,
    status: 'Feedback can only be sent from the live Edenia app.',
    activeId: 'feedbackSubmitBtn',
    modalHidden: false,
    confirmationHidden: true,
    message: 'Feedback capture should remain unavailable locally.',
    busy: null,
    disabled: false
  })

  await page.locator('input[name="feedbackCategory"][value="idea"]').check()
  await message.fill('  Preserve the feedback lifecycle.  ')
  await name.fill('  Protected Learner  ')
  await email.fill('learner@example.com')
  await page.evaluate(() => {
    window.__feedbackAnalyticsCalls = []
    window.EDENIA_ANALYTICS_ENABLED = true
    window.posthog = {
      capture(eventName, properties) {
        window.__feedbackAnalyticsCalls.push({
          type: 'capture',
          eventName,
          properties
        })
      },
      get_session_replay_url() {
        window.__feedbackAnalyticsCalls.push({ type: 'replay' })
        return 'https://us.posthog.com/project/1/replay/protected'
      },
      setPersonProperties(properties, propertiesOnce) {
        window.__feedbackAnalyticsCalls.push({
          type: 'person',
          properties,
          propertiesOnce
        })
      },
      get_distinct_id() {
        return 'preservation-feedback'
      }
    }
    window.__feedbackSuccessfulSubmit = null
    document.addEventListener('submit', event => {
      if (event.target.id !== 'feedbackForm') return
      const selectedCategory = new FormData(
        document.getElementById('feedbackForm')
      ).get('feedbackCategory')
      window.__feedbackSuccessfulSubmit = {
        defaultPrevented: event.defaultPrevented,
        modalHidden: document.getElementById('feedbackModal')
          .classList.contains('hidden'),
        bodyOpen: document.body.classList.contains('feedback-modal-open'),
        launcherFocused: document.activeElement ===
          document.getElementById('feedbackLaunchBtn'),
        confirmationHidden: document.getElementById('feedbackConfirmation')
          .classList.contains('hidden'),
        confirmationShown: document.getElementById('feedbackConfirmation')
          .classList.contains('show'),
        busy: document.getElementById('feedbackForm').getAttribute('aria-busy'),
        disabled: document.getElementById('feedbackSubmitBtn').disabled,
        category: selectedCategory,
        message: document.getElementById('feedbackMessage').value,
        name: document.getElementById('feedbackName').value,
        email: document.getElementById('feedbackEmail').value,
        analyticsCalls: window.__feedbackAnalyticsCalls
      }
    }, { once: true })
  })

  await submit.focus()
  await submit.press('Enter')
  await expect.poll(() => page.evaluate(
    () => window.__feedbackSuccessfulSubmit
  )).not.toBeNull()
  await expect(modal).toHaveClass(/\bhidden\b/)
  await expect(confirmation).not.toHaveClass(/\bhidden\b/)
  await expect(confirmationControl).toBeFocused()
  expect(await form.getAttribute('aria-busy')).toBeNull()
  await expect(submit).toBeEnabled()
  await expect(page.locator(
    'input[name="feedbackCategory"][value="bug"]'
  )).toBeChecked()
  await expect(message).toHaveValue('')
  await expect(name).toHaveValue('')
  await expect(email).toHaveValue('')

  const result = await page.evaluate(() => ({
    successfulSubmit: window.__feedbackSuccessfulSubmit,
    analyticsCalls: window.__feedbackAnalyticsCalls,
    storage: localStorage.getItem('edenia_v1'),
    bridgePresent: Object.prototype.hasOwnProperty.call(
      window.EdeniaActions || {},
      'submitFeedback'
    )
  }))
  expect(result.successfulSubmit).toMatchObject({
    defaultPrevented: true,
    modalHidden: true,
    bodyOpen: false,
    launcherFocused: true,
    confirmationHidden: false,
    confirmationShown: true,
    busy: null,
    disabled: false,
    category: 'bug',
    message: '',
    name: '',
    email: ''
  })
  expect(result.analyticsCalls.map(call => (
    call.eventName || call.type
  ))).toEqual([
    'feedback_submit_clicked',
    'replay',
    'feedback_submitted',
    'person'
  ])
  expect(result.analyticsCalls[0]).toMatchObject({
    type: 'capture',
    eventName: 'feedback_submit_clicked',
    properties: {
      action: 'feedback_submit',
      button_name: 'Send feedback →',
      control_type: 'button'
    }
  })
  expect(result.analyticsCalls[1]).toEqual({ type: 'replay' })
  expect(result.analyticsCalls[2]).toMatchObject({
    type: 'capture',
    eventName: 'feedback_submitted',
    properties: {
      feedback_category: 'idea',
      feedback_message: 'Preserve the feedback lifecycle.',
      feedback_name: 'Protected Learner',
      feedback_email: 'learner@example.com',
      has_feedback_name: true,
      has_feedback_email: true,
      feedback_source: 'main_page_footer',
      submitted_at: fixedNow.toISOString(),
      locale: 'en',
      theme: 'light',
      page_url: page.url(),
      viewport_width: 1440,
      viewport_height: 900,
      session_replay_url: 'https://us.posthog.com/project/1/replay/protected'
    }
  })
  expect(result.analyticsCalls[2].properties.feedback_id).toMatch(/\S+/)
  expect(result.analyticsCalls[2].properties.app_version).toMatch(/\S+/)
  expect(result.analyticsCalls[2].properties.screen_width).toEqual(
    expect.any(Number)
  )
  expect(result.analyticsCalls[2].properties.screen_height).toEqual(
    expect.any(Number)
  )
  expect(result.analyticsCalls[3]).toEqual({
    type: 'person',
    properties: {
      has_submitted_feedback: true,
      latest_feedback_category: 'idea',
      latest_feedback_at: fixedNow.toISOString(),
      name: 'Protected Learner',
      email: 'learner@example.com'
    },
    propertiesOnce: {
      first_feedback_at: fixedNow.toISOString()
    }
  })
  expect(result.storage).toBe(storedBefore)
  expect(result.bridgePresent).toBe(false)
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
      window.EdeniaActions || {},
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

test('saved-video search-result listener preserves selection, analytics, and Enter activation', async ({
  page
}, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-standard')

  await seedCompletedState(page)
  await page.evaluate(() => {
    const state = JSON.parse(localStorage.getItem('edenia_v1'))
    state.config.channels = [{
      id: 'protected-search-channel',
      name: 'Protected search channel'
    }]
    state.videos = {
      'protected-search-alpha': {
        id: 'protected-search-alpha',
        title: 'Protected Alpha Lesson',
        channelId: 'protected-search-channel',
        channelTitle: 'Protected search channel',
        duration: 720,
        publishedAt: '2026-07-27T04:00:00.000Z',
        status: 'unwatched',
        thumbnail: 'https://i.ytimg.com/vi/protected-search-alpha/hqdefault.jpg'
      },
      'protected-search-beta': {
        id: 'protected-search-beta',
        title: 'Protected Beta Lesson',
        channelId: 'protected-search-channel',
        channelTitle: 'Protected search channel',
        duration: 660,
        publishedAt: '2026-07-26T04:00:00.000Z',
        status: 'unwatched',
        thumbnail: 'https://i.ytimg.com/vi/protected-search-beta/hqdefault.jpg'
      }
    }
    localStorage.setItem('edenia_v1', JSON.stringify(state))
    localStorage.removeItem('edenia_posthog_state_v2')
  })
  await page.reload()
  await waitForApplication(page)
  const storedBefore = await page.evaluate(
    () => localStorage.getItem('edenia_v1')
  )

  await page.evaluate(() => {
    window.__videoSearchAnalyticsEvents = []
    window.EDENIA_ANALYTICS_ENABLED = true
    window.posthog = {
      capture(eventName, properties) {
        window.__videoSearchAnalyticsEvents.push({ eventName, properties })
      },
      get_distinct_id() {
        return 'preservation-video-search'
      },
      setPersonProperties() {}
    }
  })

  const searchButton = page.locator('#videoSearchBtn')
  const searchPopover = page.locator('#videoSearchPopover')
  const searchInput = page.locator('#videoSearchInput')
  await searchButton.click()
  await expect(searchPopover).not.toHaveClass(/\bhidden\b/)
  await searchInput.fill('protected')
  const results = page.locator(
    '#videoSearchResults [data-video-search-action="select-result"]'
  )
  await expect(results).toHaveCount(2)
  await expect(results.first()).toHaveAttribute(
    'data-video-id',
    'protected-search-alpha'
  )

  await page.evaluate(() => {
    window.__videoSearchAnalyticsEvents.length = 0
    window.__videoSearchAtDocumentBubble = null
    document.addEventListener('click', event => {
      if (!event.target.closest?.('[data-video-search-action="select-result"]')) {
        return
      }
      const card = document.querySelector(
        '.video-card[data-video-id="protected-search-alpha"]'
      )
      window.__videoSearchAtDocumentBubble = {
        popoverHidden: document.getElementById('videoSearchPopover')
          .classList.contains('hidden'),
        expanded: document.getElementById('videoSearchBtn')
          .getAttribute('aria-expanded'),
        cardRendered: Boolean(card),
        focusSlot: card?.closest('.channel-shelf-slot')
          ?.classList.contains('channel-refresh-focus') || false,
        flashed: card?.classList.contains('flash-target') || false,
        eventNames: window.__videoSearchAnalyticsEvents
          .map(entry => entry.eventName)
      }
    }, { once: true })
  })
  await results.first().locator('.video-search-title').click()
  await expect.poll(() => page.evaluate(
    () => window.__videoSearchAtDocumentBubble
  )).toEqual({
    popoverHidden: true,
    expanded: 'false',
    cardRendered: true,
    focusSlot: true,
    flashed: false,
    eventNames: [
      'search_result_selected',
      'jump_to_video_from_search_clicked'
    ]
  })
  const selectedCard = page.locator(
    '.video-card[data-video-id="protected-search-alpha"]'
  )
  await expect(selectedCard).toHaveClass(/\bflash-target\b/)
  expect(await page.evaluate(() => localStorage.getItem('edenia_v1')))
    .toBe(storedBefore)

  await searchButton.click()
  await expect(searchPopover).not.toHaveClass(/\bhidden\b/)
  await expect(results).toHaveCount(2)
  const firstResultId = await results.first().getAttribute('data-video-id')
  await page.evaluate(() => {
    window.__videoSearchAnalyticsEvents.length = 0
    window.__videoSearchEnterAtDocumentBubble = null
    document.addEventListener('keydown', event => {
      if (event.target.id !== 'videoSearchInput' || event.key !== 'Enter') return
      window.__videoSearchEnterAtDocumentBubble = {
        defaultPrevented: event.defaultPrevented,
        popoverHidden: document.getElementById('videoSearchPopover')
          .classList.contains('hidden'),
        eventNames: window.__videoSearchAnalyticsEvents
          .map(entry => entry.eventName)
      }
    }, { once: true })
  })
  await searchInput.press('Enter')
  await expect.poll(() => page.evaluate(
    () => window.__videoSearchEnterAtDocumentBubble
  )).toEqual({
    defaultPrevented: true,
    popoverHidden: true,
    eventNames: [
      'search_result_selected',
      'jump_to_video_from_search_clicked'
    ]
  })
  await expect(page.locator(
    `.video-card[data-video-id="${firstResultId}"]`
  )).toHaveClass(/\bflash-target\b/)
  expect(await page.evaluate(() => localStorage.getItem('edenia_v1')))
    .toBe(storedBefore)

  const bridgeActions = await page.evaluate(() => ({
    selected: Object.prototype.hasOwnProperty.call(
      window.EdeniaActions || {},
      'jumpToVideoFromSearch'
    ),
    inputKey: Object.prototype.hasOwnProperty.call(
      window.EdeniaActions || {},
      'handleVideoSearchInputKey'
    ),
    render: Object.prototype.hasOwnProperty.call(
      window.EdeniaActions || {},
      'renderVideoSearchResults'
    ),
    close: Object.prototype.hasOwnProperty.call(
      window.EdeniaActions || {},
      'closeVideoSearchPopover'
    ),
    toggle: Object.prototype.hasOwnProperty.call(
      window.EdeniaActions || {},
      'toggleVideoSearchPopover'
    )
  }))
  expect(bridgeActions).toEqual({
    selected: false,
    inputKey: false,
    render: false,
    close: false,
    toggle: false
  })
})

test('saved-video search shell listeners preserve analytics, focus, and responsive geometry', async ({
  page
}, testInfo) => {
  const isDesktop = testInfo.project.name === 'desktop-standard'
  const isTablet = testInfo.project.name === 'tablet-portrait'
  const isPhone = testInfo.project.name === 'phone-standard'
  test.skip(!isDesktop && !isTablet && !isPhone)

  await seedCompletedState(page)
  await page.evaluate(() => {
    const state = JSON.parse(localStorage.getItem('edenia_v1'))
    state.config.channels = [{
      id: 'protected-search-shell-channel',
      name: 'Protected search shell channel'
    }]
    state.videos = {
      'protected-search-shell-alpha': {
        id: 'protected-search-shell-alpha',
        title: 'Protected Search Shell Alpha',
        channelId: 'protected-search-shell-channel',
        channelTitle: 'Protected search shell channel',
        duration: 720,
        publishedAt: '2026-07-27T04:00:00.000Z',
        status: 'unwatched',
        thumbnail: 'https://i.ytimg.com/vi/protected-search-shell-alpha/hqdefault.jpg'
      },
      'protected-search-shell-beta': {
        id: 'protected-search-shell-beta',
        title: 'Protected Search Shell Beta',
        channelId: 'protected-search-shell-channel',
        channelTitle: 'Protected search shell channel',
        duration: 660,
        publishedAt: '2026-07-26T04:00:00.000Z',
        status: 'partial',
        thumbnail: 'https://i.ytimg.com/vi/protected-search-shell-beta/hqdefault.jpg'
      }
    }
    localStorage.setItem('edenia_v1', JSON.stringify(state))
    localStorage.removeItem('edenia_posthog_state_v2')
  })
  await page.reload()
  await waitForApplication(page)
  const storedBefore = await page.evaluate(
    () => localStorage.getItem('edenia_v1')
  )
  await page.evaluate(() => {
    document.getElementById('videoSearchInput').value = 'Protected'
    window.__videoSearchShellAnalyticsEvents = []
    window.EDENIA_ANALYTICS_ENABLED = true
    window.posthog = {
      capture(eventName, properties) {
        window.__videoSearchShellAnalyticsEvents.push({
          eventName,
          properties
        })
      },
      get_distinct_id() {
        return 'preservation-video-search-shell'
      },
      setPersonProperties() {}
    }
  })

  const opener = page.locator(
    '#videoSearchBtn[data-video-search-action="toggle"]'
  )
  const popover = page.locator('#videoSearchPopover')
  const input = page.locator(
    '#videoSearchInput[data-video-search-action="query"]'
  )
  const results = page.locator(
    '#videoSearchResults [data-video-search-action="select-result"]'
  )
  const mobileHeader = popover.locator('.mobile-popover-header')
  const closeButton = popover.locator(
    '[data-video-search-action="close"]'
  )

  await opener.click()
  await expect(popover).not.toHaveClass(/\bhidden\b/)
  await expect(opener).toHaveAttribute('aria-expanded', 'true')
  await expect(input).toBeFocused()
  await expect(results).toHaveCount(2)

  const openingEvents = await page.evaluate(
    () => window.__videoSearchShellAnalyticsEvents
  )
  expect(openingEvents.map(entry => entry.eventName)).toEqual([
    'search_opened',
    'search_results_shown'
  ])
  expect(openingEvents[0]).toMatchObject({
    eventName: 'search_opened',
    properties: {
      current_video_count: 2,
      search_query: 'Protected',
      search_source: 'saved_videos'
    }
  })
  expect(openingEvents[1]).toMatchObject({
    eventName: 'search_results_shown',
    properties: {
      query_length: 9,
      query_token_count: 1,
      result_count: 2,
      search_query: 'Protected',
      search_source: 'saved_videos'
    }
  })
  expect(openingEvents.map(entry => entry.eventName))
    .not.toContain('header_search_title_clicked')

  if (isPhone) {
    await expect(popover).toHaveCSS('position', 'fixed')
    await expect(mobileHeader).toBeVisible()
    await expect(closeButton).toBeVisible()
    await expect(input).toHaveCSS('font-size', '16px')
    const openerBox = await opener.boundingBox()
    const inputBox = await input.boundingBox()
    expect(openerBox?.width).toBeGreaterThanOrEqual(44)
    expect(openerBox?.height).toBeGreaterThanOrEqual(44)
    expect(inputBox?.height).toBeGreaterThanOrEqual(44)
  } else {
    await expect(popover).toHaveCSS('position', 'absolute')
    await expect(mobileHeader).toBeHidden()
  }

  await page.evaluate(() => {
    window.__videoSearchShellAnalyticsEvents.length = 0
  })
  await opener.focus()
  await opener.press('Space')
  await expect(popover).toHaveClass(/\bhidden\b/)
  await expect(opener).toHaveAttribute('aria-expanded', 'false')
  expect(await page.evaluate(
    () => window.__videoSearchShellAnalyticsEvents
  )).toEqual([])

  await opener.press('Enter')
  await expect(popover).not.toHaveClass(/\bhidden\b/)
  await expect(input).toBeFocused()
  await expect(results).toHaveCount(2)
  await page.evaluate(() => {
    window.__videoSearchShellAnalyticsEvents.length = 0
  })
  await input.fill('  PROTECTED  ')
  await expect(results).toHaveCount(2)
  expect(await page.evaluate(
    () => window.__videoSearchShellAnalyticsEvents
  )).toEqual([])

  await input.fill('')
  await input.fill('missing')
  await input.fill(' MISSING ')
  await expect(page.locator('#videoSearchResults')).toContainText(
    'No matching videos found.'
  )
  const noResultEvents = await page.evaluate(() => (
    window.__videoSearchShellAnalyticsEvents.filter(
      entry => entry.eventName === 'search_no_results'
    )
  ))
  expect(noResultEvents).toHaveLength(1)
  expect(noResultEvents[0]).toMatchObject({
    eventName: 'search_no_results',
    properties: {
      query_length: 7,
      query_token_count: 1,
      result_count: 0,
      search_query: 'missing',
      search_source: 'saved_videos'
    }
  })

  await page.evaluate(() => {
    window.__videoSearchNoResultEnter = null
    document.addEventListener('keydown', event => {
      if (event.target.id !== 'videoSearchInput' || event.key !== 'Enter') {
        return
      }
      window.__videoSearchNoResultEnter = {
        defaultPrevented: event.defaultPrevented,
        hidden: document.getElementById('videoSearchPopover')
          .classList.contains('hidden')
      }
    }, { once: true })
  })
  await input.press('Enter')
  await expect.poll(() => page.evaluate(
    () => window.__videoSearchNoResultEnter
  )).toEqual({
    defaultPrevented: false,
    hidden: false
  })

  await page.evaluate(() => {
    window.__videoSearchInputEscape = null
    document.addEventListener('keydown', event => {
      if (event.target.id !== 'videoSearchInput' || event.key !== 'Escape') {
        return
      }
      window.__videoSearchInputEscape = {
        defaultPrevented: event.defaultPrevented,
        hidden: document.getElementById('videoSearchPopover')
          .classList.contains('hidden')
      }
    }, { once: true })
  })
  await input.press('Escape')
  await expect.poll(() => page.evaluate(
    () => window.__videoSearchInputEscape
  )).toEqual({
    defaultPrevented: true,
    hidden: true
  })
  await expect(input).toHaveValue(' MISSING ')
  if (isPhone) await expect(opener).toBeFocused()
  else await expect(opener).not.toBeFocused()

  if (isPhone) {
    await page.evaluate(() => {
      window.__videoSearchShellAnalyticsEvents.length = 0
    })
    await opener.press('Enter')
    await expect(input).toBeFocused()
    await page.evaluate(() => {
      window.__videoSearchShellAnalyticsEvents.length = 0
    })
    await closeButton.focus()
    await closeButton.press('Enter')
    await expect(popover).toHaveClass(/\bhidden\b/)
    await expect(opener).toBeFocused()
    expect(await page.evaluate(() => (
      window.__videoSearchShellAnalyticsEvents
    ))).toEqual([
      expect.objectContaining({
        eventName: 'settings_close_clicked',
        properties: expect.objectContaining({
          action: 'settings.close',
          button_name: 'Close settings',
          control_type: 'button'
        })
      })
    ])
  }

  await opener.focus()
  await opener.press('Enter')
  await expect(input).toBeFocused()
  await opener.focus()
  await page.evaluate(() => {
    window.__videoSearchDocumentEscape = null
    document.addEventListener('keydown', event => {
      if (event.key !== 'Escape') return
      window.__videoSearchDocumentEscape = {
        defaultPrevented: event.defaultPrevented,
        hidden: document.getElementById('videoSearchPopover')
          .classList.contains('hidden')
      }
    }, { once: true })
  })
  await opener.press('Escape')
  await expect.poll(() => page.evaluate(
    () => window.__videoSearchDocumentEscape
  )).toEqual({
    defaultPrevented: false,
    hidden: true
  })

  await opener.press('Enter')
  await expect(input).toBeFocused()
  await page.locator(
    '.feed-section .section-title[data-i18n="videos.title"]'
  ).click()
  await expect(popover).toHaveClass(/\bhidden\b/)
  await expect(opener).toHaveAttribute('aria-expanded', 'false')

  expect(await page.evaluate(() => localStorage.getItem('edenia_v1')))
    .toBe(storedBefore)
  const removedBridgeActions = await page.evaluate(() => ({
    close: Object.prototype.hasOwnProperty.call(
      window.EdeniaActions || {},
      'closeVideoSearchPopover'
    ),
    inputKey: Object.prototype.hasOwnProperty.call(
      window.EdeniaActions || {},
      'handleVideoSearchInputKey'
    ),
    render: Object.prototype.hasOwnProperty.call(
      window.EdeniaActions || {},
      'renderVideoSearchResults'
    ),
    toggle: Object.prototype.hasOwnProperty.call(
      window.EdeniaActions || {},
      'toggleVideoSearchPopover'
    )
  }))
  expect(removedBridgeActions).toEqual({
    close: false,
    inputKey: false,
    render: false,
    toggle: false
  })
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
      window.EdeniaActions || {},
      'setStudyInsightView'
    ),
    setStudyInsightsCollapsed: Object.prototype.hasOwnProperty.call(
      window.EdeniaActions || {},
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
      window.EdeniaActions || {},
      'toggleSettingsHowTo'
    ),
    toggleSettingsActivityLog: Object.prototype.hasOwnProperty.call(
      window.EdeniaActions || {},
      'toggleSettingsActivityLog'
    ),
    toggleSettingsBackups: Object.prototype.hasOwnProperty.call(
      window.EdeniaActions || {},
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
      window.EdeniaActions || {},
      'showResetConfirm'
    ),
    hideResetConfirm: Object.prototype.hasOwnProperty.call(
      window.EdeniaActions || {},
      'hideResetConfirm'
    )
  }))
  expect(removedBridgeActions).toEqual({
    showResetConfirm: false,
    hideResetConfirm: false
  })
})

test('Delete data listener preserves backups, reload, isolation, and sandbox handoff', async ({
  page
}, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-standard')

  await seedCompletedState(page)
  const primaryBeforeReset = await page.evaluate(() => {
    const state = JSON.parse(localStorage.getItem('edenia_v1'))
    state.config.weeklyGoalHours = 9
    state.activityLog.unshift({
      id: 'pre-reset-marker',
      createdAt: '2026-07-27T04:00:00.000Z',
      actor: 'user',
      type: 'marker',
      status: 'info',
      title: 'Pre-reset marker',
      detail: 'Protected state before reset'
    })
    localStorage.setItem('edenia_v1', JSON.stringify(state))
    localStorage.removeItem('edenia_v1_backups')
    localStorage.setItem(
      'edenia_v1_youtube_channel_search_cache_v1',
      'retained-cache'
    )
    localStorage.setItem('edenia_custom_retained', 'retained-custom')
    sessionStorage.setItem('__resetAnalyticsEvents', '[]')
    window.EDENIA_ANALYTICS_ENABLED = true
    window.posthog = {
      capture(eventName, properties) {
        const events = JSON.parse(
          sessionStorage.getItem('__resetAnalyticsEvents') || '[]'
        )
        events.push({ eventName, properties })
        sessionStorage.setItem(
          '__resetAnalyticsEvents',
          JSON.stringify(events)
        )
      },
      get_distinct_id() {
        return 'preservation-reset'
      },
      setPersonProperties() {}
    }
    return localStorage.getItem('edenia_v1')
  })

  await page.locator('.gear-btn').click()
  await page.locator('[data-settings-reset-confirm-action="show"]').click()
  const confirm = page.locator(
    '[data-settings-reset-confirm-action="confirm"]'
  )
  await expect(confirm).toHaveText('Delete data')
  await expect(confirm).toHaveAttribute(
    'data-analytics-action',
    'settings.reset.delete'
  )
  await expect(confirm).not.toHaveAttribute('onclick')
  await confirm.focus()
  await Promise.all([
    page.waitForNavigation({ waitUntil: 'load' }),
    confirm.press('Enter')
  ])
  await waitForApplication(page)

  const normalReset = await page.evaluate(() => {
    const state = JSON.parse(localStorage.getItem('edenia_v1'))
    const backups = JSON.parse(
      localStorage.getItem('edenia_v1_backups') || '[]'
    )
    const resetBackup = backups.find(
      entry => entry.reason === 'before reset'
    )
    const cookie = document.cookie
      .split('; ')
      .find(part => part.startsWith('edenia_config='))
    const cookieConfig = cookie
      ? JSON.parse(decodeURIComponent(cookie.slice(cookie.indexOf('=') + 1)))
      : null
    const analytics = JSON.parse(
      sessionStorage.getItem('__resetAnalyticsEvents') || '[]'
    )
    return {
      state,
      resetBackup,
      cookieConfig,
      cache: localStorage.getItem(
        'edenia_v1_youtube_channel_search_cache_v1'
      ),
      custom: localStorage.getItem('edenia_custom_retained'),
      resetEvents: analytics.filter(
        entry => entry.eventName === 'settings_reset_delete_clicked'
      ),
      bridgePresent: Object.prototype.hasOwnProperty.call(
        window.EdeniaActions || {},
        'resetApp'
      )
    }
  })
  expect(normalReset.state.config.weeklyGoalHours).toBe(4)
  expect(normalReset.state.onboarding).toMatchObject({
    setupCompleted: false,
    walkthroughCompleted: false
  })
  expect(normalReset.state.activityLog[0]).toMatchObject({
    actor: 'user',
    type: 'reset',
    status: 'warn',
    title: 'Reset everything',
    detail: 'Started fresh after keeping a rollback backup.'
  })
  expect(normalReset.resetBackup).toMatchObject({
    reason: 'before reset',
    sandbox: false,
    state: {
      config: {
        weeklyGoalHours: 9
      },
      onboarding: {
        setupCompleted: true
      }
    }
  })
  expect(normalReset.resetBackup.state.activityLog[0]).toMatchObject({
    id: 'pre-reset-marker',
    title: 'Pre-reset marker'
  })
  expect(normalReset.cookieConfig).toMatchObject({
    weeklyGoalHours: 4,
    theme: 'light'
  })
  expect(normalReset.cache).toBe('retained-cache')
  expect(normalReset.custom).toBe('retained-custom')
  expect(normalReset.resetEvents).toHaveLength(1)
  expect(normalReset.resetEvents[0]).toMatchObject({
    properties: {
      action: 'settings.reset.delete',
      button_name: 'Delete data',
      control_type: 'button'
    }
  })
  expect(normalReset.bridgePresent).toBe(false)
  await expect(page.locator('#introTrailer')).not.toHaveClass(/\bhidden\b/)

  await page.goto('http://localhost:8001/?sandbox=1')
  await waitForApplication(page)
  const sandboxBeforeReset = await page.evaluate(() => {
    const state = JSON.parse(localStorage.getItem('edenia_v1_sandbox'))
    state.config.weeklyGoalHours = 9
    state.activityLog.unshift({
      id: 'sandbox-pre-reset-marker',
      createdAt: '2026-07-27T04:00:00.000Z',
      actor: 'user',
      type: 'marker',
      status: 'info',
      title: 'Sandbox pre-reset marker',
      detail: 'Protected sandbox state'
    })
    localStorage.setItem('edenia_v1_sandbox', JSON.stringify(state))
    localStorage.removeItem('edenia_v1_sandbox_backups')
    localStorage.setItem('edenia_v1', 'sandbox-origin-normal-sentinel')
    return localStorage.getItem('edenia_v1_sandbox')
  })
  expect(sandboxBeforeReset).not.toBeNull()

  await page.locator('.gear-btn').click()
  await page.locator('[data-settings-reset-confirm-action="show"]').click()
  const sandboxConfirm = page.locator(
    '[data-settings-reset-confirm-action="confirm"]'
  )
  await sandboxConfirm.focus()
  await Promise.all([
    page.waitForNavigation({ waitUntil: 'load' }),
    sandboxConfirm.press('Space')
  ])
  await waitForApplication(page)
  await expect(page.locator('body')).toHaveClass(/\bwalkthrough-active\b/)

  const sandboxReset = await page.evaluate(() => {
    const state = JSON.parse(localStorage.getItem('edenia_v1_sandbox'))
    const backups = JSON.parse(
      localStorage.getItem('edenia_v1_sandbox_backups') || '[]'
    )
    return {
      state,
      resetBackup: backups.find(entry => entry.reason === 'before reset'),
      normalState: localStorage.getItem('edenia_v1'),
      queuedWalkthrough: sessionStorage.getItem(
        'edenia_v1_sandbox_walkthrough_after_reset'
      ),
      url: location.href,
      bridgePresent: Object.prototype.hasOwnProperty.call(
        window.EdeniaActions || {},
        'resetApp'
      )
    }
  })
  expect(sandboxReset.state.config.weeklyGoalHours).toBe(4)
  expect(sandboxReset.state.sandboxStartDate)
    .toBe(sandboxReset.state.sandboxLastDate)
  expect(sandboxReset.state.config.channels).toHaveLength(10)
  expect(sandboxReset.state.activityLog[0]).toMatchObject({
    actor: 'user',
    type: 'reset',
    status: 'warn'
  })
  expect(sandboxReset.resetBackup).toMatchObject({
    reason: 'before reset',
    sandbox: true,
    state: {
      config: {
        weeklyGoalHours: 9
      }
    }
  })
  expect(sandboxReset.resetBackup.state.activityLog[0]).toMatchObject({
    id: 'sandbox-pre-reset-marker',
    title: 'Sandbox pre-reset marker'
  })
  expect(sandboxReset.normalState).toBe('sandbox-origin-normal-sentinel')
  expect(sandboxReset.queuedWalkthrough).toBeNull()
  expect(sandboxReset.url).toContain('localhost:8001/?sandbox=1')
  expect(sandboxReset.bridgePresent).toBe(false)
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
    Object.prototype.hasOwnProperty.call(window.EdeniaActions || {}, 'setActivityLogFilter')
  ))
  expect(removedBridgeAction).toBe(false)
})

test('Activity Log pagination listener survives generated-button replacement', async ({
  page
}, testInfo) => {
  test.skip(testInfo.project.name !== 'phone-standard')

  await seedCompletedState(page)
  await page.evaluate(() => {
    const state = JSON.parse(localStorage.getItem('edenia_v1'))
    state.activityLog = Array.from({ length: 45 }, (_, index) => ({
      id: `protected-pagination-${index}`,
      createdAt: new Date(Date.UTC(2026, 6, 28, 3, 59 - index)).toISOString(),
      actor: 'user',
      type: 'general',
      status: 'success',
      title: `Protected pagination entry ${index + 1}`,
      detail: `Unique detail ${index + 1}`
    }))
    localStorage.setItem('edenia_v1', JSON.stringify(state))
  })
  await page.reload()
  await waitForApplication(page)
  await page.locator('.gear-btn[data-settings-shell-action="open"]').click()
  await page.locator('.activity-log-toggle').click()

  const list = page.locator('#activityLogList')
  const items = list.locator('.activity-log-item')
  const moreSelector = '[data-activity-log-action="show-older"]'
  await expect(items).toHaveCount(20)
  await expect(list.locator(moreSelector)).toHaveCount(1)
  const storedBefore = await page.evaluate(() => localStorage.getItem('edenia_v1'))

  await page.evaluate(() => {
    window.__activityPaginationAtDocumentBubble = null
    document.addEventListener('click', event => {
      if (!event.target.closest('[data-activity-log-action="show-older"]')) return
      window.__activityPaginationAtDocumentBubble = {
        count: document.querySelectorAll('#activityLogList .activity-log-item').length,
        hasMore: Boolean(
          document.querySelector(
            '#activityLogList [data-activity-log-action="show-older"]'
          )
        )
      }
    }, { once: true })
  })
  await list.locator(moreSelector).click()
  await expect.poll(() => page.evaluate(
    () => window.__activityPaginationAtDocumentBubble
  )).toEqual({
    count: 40,
    hasMore: true
  })

  await page.locator('[data-activity-log-filter="user"]').click()
  await expect(items).toHaveCount(20)
  await list.locator(moreSelector).press('Enter')
  await expect(items).toHaveCount(40)
  await list.locator(moreSelector).press('Space')
  await expect(items).toHaveCount(45)
  await expect(list.locator(moreSelector)).toHaveCount(0)
  expect(await page.evaluate(() => localStorage.getItem('edenia_v1')))
    .toBe(storedBefore)
  const removedBridgeAction = await page.evaluate(() => (
    Object.prototype.hasOwnProperty.call(
      window.EdeniaActions || {},
      'showOlderActivityLogEntries'
    )
  ))
  expect(removedBridgeAction).toBe(false)
})

test('city level-up listener preserves staged claims and outcome-dependent analytics', async ({
  page
}, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-standard')

  await seedCityClaimState(page, 180)
  const control = page.locator(
    '#levelUpButton[data-city-level-action="claim"]'
  )
  await expect(control).toBeEnabled()
  await expect(control).toHaveClass(/\bshow\b/)
  await installCityAnalyticsProbe(page)
  await page.evaluate(() => {
    window.__cityClaimAtDocumentBubble = null
    document.addEventListener('click', event => {
      if (!event.target.closest?.('[data-city-level-action="claim"]')) return
      const state = JSON.parse(localStorage.getItem('edenia_v1'))
      const button = document.getElementById('levelUpButton')
      window.__cityClaimAtDocumentBubble = {
        cityProgress: state.cityProgress,
        levelClaim: state.activityLog.find(entry => entry.type === 'level-claim'),
        button: {
          disabled: button.disabled,
          ariaHidden: button.getAttribute('aria-hidden'),
          shown: button.classList.contains('show')
        },
        progressReady: document.getElementById('cityLevelProgress')
          .classList.contains('is-level-ready'),
        confettiCount: document.querySelectorAll(
          '.city-level-up-confetti'
        ).length,
        toastShown: document.getElementById('toast').classList.contains('show'),
        eventNames: window.__cityAnalyticsEvents.map(entry => entry.eventName)
      }
    }, { once: true })
  })
  await control.click()

  await expect.poll(() => page.evaluate(
    () => window.__cityClaimAtDocumentBubble
  )).not.toBeNull()
  await expect.poll(() => page.evaluate(
    () => window.__cityClaimAtDocumentBubble
  )).toMatchObject({
    cityProgress: {
      maxLevelIndex: 1,
      pendingLevelIndex: null,
      scoringVersion: 7
    },
    levelClaim: {
      actor: 'user',
      type: 'level-claim',
      status: 'success',
      meta: { levelIndex: 1 }
    },
    button: {
      disabled: true,
      ariaHidden: 'true',
      shown: false
    },
    progressReady: false,
    confettiCount: 1,
    toastShown: true
  })
  const finalClaimEvents = await page.evaluate(
    () => window.__cityClaimAtDocumentBubble.eventNames
  )
  expect(finalClaimEvents.filter(name => name === 'town_level_updated'))
    .toHaveLength(1)
  expect(finalClaimEvents).not.toContain('city_level_up_clicked')
  const finalClaimBackup = await page.evaluate(() => {
    const backups = JSON.parse(
      localStorage.getItem('edenia_v1_backups') || '[]'
    )
    return {
      count: backups.length,
      reason: backups[0]?.reason,
      cityProgress: backups[0]?.state?.cityProgress
    }
  })
  expect(finalClaimBackup).toEqual({
    count: 1,
    reason: 'automatic backup',
    cityProgress: {
      maxLevelIndex: 0,
      pendingLevelIndex: 1,
      scoringVersion: 7
    }
  })
  const removedBridgeAction = await page.evaluate(() => (
    Object.prototype.hasOwnProperty.call(
      window.EdeniaActions || {},
      'claimCityLevelUp'
    )
  ))
  expect(removedBridgeAction).toBe(false)

  await page.reload()
  await waitForApplication(page)
  await expect(control).toBeDisabled()
  await expect.poll(() => page.evaluate(() => (
    JSON.parse(localStorage.getItem('edenia_v1')).cityProgress
  ))).toEqual({
    maxLevelIndex: 1,
    pendingLevelIndex: null,
    scoringVersion: 7
  })

  await seedCityClaimState(page, 420)
  await expect(control).toBeEnabled()
  await installCityAnalyticsProbe(page)
  await page.evaluate(() => {
    window.__cityClaimAtDocumentBubble = null
    document.addEventListener('click', event => {
      if (!event.target.closest?.('[data-city-level-action="claim"]')) return
      const state = JSON.parse(localStorage.getItem('edenia_v1'))
      const button = document.getElementById('levelUpButton')
      window.__cityClaimAtDocumentBubble = {
        cityProgress: state.cityProgress,
        claimLevels: state.activityLog
          .filter(entry => entry.type === 'level-claim')
          .map(entry => entry.meta?.levelIndex),
        disabled: button.disabled,
        ariaHidden: button.getAttribute('aria-hidden'),
        shown: button.classList.contains('show'),
        eventNames: window.__cityAnalyticsEvents.map(entry => entry.eventName)
      }
    }, { once: true })
  })
  await control.press('Enter')
  await expect.poll(() => page.evaluate(
    () => window.__cityClaimAtDocumentBubble
  )).toMatchObject({
    cityProgress: {
      maxLevelIndex: 1,
      pendingLevelIndex: 2,
      scoringVersion: 7
    },
    claimLevels: [1],
    disabled: false,
    ariaHidden: 'false',
    shown: true
  })
  const intermediateEvents = await page.evaluate(
    () => window.__cityClaimAtDocumentBubble.eventNames
  )
  expect(intermediateEvents.filter(name => name === 'town_level_updated'))
    .toHaveLength(2)
  expect(intermediateEvents.filter(name => name === 'city_level_up_clicked'))
    .toHaveLength(1)

  await page.evaluate(() => {
    window.__cityAnalyticsEvents.length = 0
    window.__cityClaimAtDocumentBubble = null
    document.addEventListener('click', event => {
      if (!event.target.closest?.('[data-city-level-action="claim"]')) return
      const state = JSON.parse(localStorage.getItem('edenia_v1'))
      const button = document.getElementById('levelUpButton')
      window.__cityClaimAtDocumentBubble = {
        cityProgress: state.cityProgress,
        claimLevels: state.activityLog
          .filter(entry => entry.type === 'level-claim')
          .map(entry => entry.meta?.levelIndex),
        disabled: button.disabled,
        ariaHidden: button.getAttribute('aria-hidden'),
        shown: button.classList.contains('show'),
        confettiCount: document.querySelectorAll(
          '.city-level-up-confetti'
        ).length,
        eventNames: window.__cityAnalyticsEvents.map(entry => entry.eventName)
      }
    }, { once: true })
  })
  await control.press('Space')
  await expect.poll(() => page.evaluate(
    () => window.__cityClaimAtDocumentBubble
  )).toMatchObject({
    cityProgress: {
      maxLevelIndex: 2,
      pendingLevelIndex: null,
      scoringVersion: 7
    },
    claimLevels: [2, 1],
    disabled: true,
    ariaHidden: 'true',
    shown: false,
    confettiCount: 1
  })
  const secondClaimEvents = await page.evaluate(
    () => window.__cityClaimAtDocumentBubble.eventNames
  )
  expect(secondClaimEvents.filter(name => name === 'town_level_updated'))
    .toHaveLength(1)
  expect(secondClaimEvents).not.toContain('city_level_up_clicked')
  await expect.poll(() => page.evaluate(() => (
    JSON.parse(localStorage.getItem('edenia_v1_backups') || '[]').length
  ))).toBe(1)
})

test('city level-up control stays centered, prominent, and on one line', async ({
  page
}) => {
  await seedCityClaimState(page, 180, 'fr')

  const layout = await page.evaluate(() => {
    const button = document.getElementById('levelUpButton')
    const rail = document.querySelector('.city-level-progress-rail')
    const buttonRect = button.getBoundingClientRect()
    const railRect = rail.getBoundingClientRect()
    const buttonStyle = getComputedStyle(button)
    const textRange = document.createRange()
    textRange.selectNodeContents(button)
    const textRect = textRange.getBoundingClientRect()

    return {
      buttonCenterX: buttonRect.left + (buttonRect.width / 2),
      buttonCenterY: buttonRect.top + (buttonRect.height / 2),
      buttonHeight: buttonRect.height,
      buttonText: button.textContent.trim(),
      fontSize: Number.parseFloat(buttonStyle.fontSize),
      railCenterX: railRect.left + (railRect.width / 2),
      railCenterY: railRect.top + (railRect.height / 2),
      railHeight: railRect.height,
      textFits: textRect.left >= buttonRect.left && textRect.right <= buttonRect.right,
      textLineCount: textRange.getClientRects().length,
      whiteSpace: buttonStyle.whiteSpace
    }
  })

  expect(layout.buttonText).toBe('Niveau suivant')
  expect(layout.whiteSpace).toBe('nowrap')
  expect(layout.textFits).toBe(true)
  expect(layout.textLineCount).toBe(1)
  expect(layout.fontSize).toBeGreaterThanOrEqual(14)
  expect(layout.railHeight).toBeGreaterThanOrEqual(layout.buttonHeight)
  expect(Math.abs(layout.buttonCenterX - layout.railCenterX)).toBeLessThanOrEqual(1)
  expect(Math.abs(layout.buttonCenterY - layout.railCenterY)).toBeLessThanOrEqual(1)
})

test('city waveform mouse listeners preserve edge scrolling, clearing, and phone inertness', async ({
  page
}, testInfo) => {
  test.skip(!['desktop-standard', 'phone-standard'].includes(
    testInfo.project.name
  ))

  await seedCompletedState(page)
  const waveform = page.locator(
    '#cityTimeWaveform[data-city-waveform-action="mouse-preview"]'
  )
  const bars = page.locator('#cityWaveBars')
  const track = page.locator('#cityWaveTrack')
  const storedBefore = await page.evaluate(
    () => localStorage.getItem('edenia_v1')
  )

  await expect(waveform).not.toHaveAttribute('onmouseenter')
  await expect(waveform).not.toHaveAttribute('onmousemove')
  await expect(waveform).not.toHaveAttribute('onmouseleave')

  const singleDayDimensions = await bars.evaluate(element => ({
    clientWidth: element.clientWidth,
    scrollWidth: element.scrollWidth,
    scrollLeft: element.scrollLeft
  }))
  expect(singleDayDimensions.scrollWidth).toBeLessThanOrEqual(
    singleDayDimensions.clientWidth
  )
  expect(singleDayDimensions.scrollLeft).toBe(0)

  await waveform.evaluate(element => {
    const rect = element.getBoundingClientRect()
    const eventInit = {
      bubbles: false,
      cancelable: true,
      clientX: rect.right - 1,
      clientY: rect.top + rect.height / 2
    }
    element.dispatchEvent(new MouseEvent('mouseenter', eventInit))
    element.dispatchEvent(new MouseEvent('mousemove', eventInit))
  })
  await page.waitForTimeout(80)
  await expect.poll(() => bars.evaluate(element => element.scrollLeft)).toBe(0)
  await waveform.dispatchEvent('mouseleave')

  await page.evaluate(() => {
    const state = JSON.parse(localStorage.getItem('edenia_v1'))
    state.anki['2026-04-01'] = { reviewed: 1, created: 0 }
    localStorage.setItem('edenia_v1', JSON.stringify(state))
  })
  await page.reload()
  await waitForApplication(page)

  const scrollableDimensions = await bars.evaluate(element => ({
    clientWidth: element.clientWidth,
    scrollWidth: element.scrollWidth
  }))
  expect(scrollableDimensions.scrollWidth).toBeGreaterThan(
    scrollableDimensions.clientWidth
  )
  await expect(bars).toHaveClass(/\bis-scrollable\b/)

  if (testInfo.project.name === 'phone-standard') {
    await expect(track.locator('.city-wave-bar').first())
      .toHaveCSS('pointer-events', 'none')
    await bars.evaluate(element => {
      element.scrollLeft = 0
    })
    await waveform.evaluate(element => {
      const rect = element.getBoundingClientRect()
      const eventInit = {
        bubbles: false,
        cancelable: true,
        clientX: rect.right - 1,
        clientY: rect.top + rect.height / 2
      }
      element.dispatchEvent(new MouseEvent('mouseenter', eventInit))
      element.dispatchEvent(new MouseEvent('mousemove', eventInit))
    })
    await page.waitForTimeout(80)
    await expect.poll(() => bars.evaluate(element => element.scrollLeft)).toBe(0)
    await waveform.dispatchEvent('mouseleave')
  } else {
    await bars.evaluate(element => {
      element.scrollLeft = 0
    })
    await waveform.evaluate(element => {
      const rect = element.getBoundingClientRect()
      const eventInit = {
        bubbles: false,
        cancelable: true,
        clientX: rect.right - 1,
        clientY: rect.top + rect.height / 2
      }
      element.dispatchEvent(new MouseEvent('mouseenter', eventInit))
      element.dispatchEvent(new MouseEvent('mousemove', eventInit))
    })
    await expect.poll(() => bars.evaluate(element => element.scrollLeft))
      .toBeGreaterThan(0)

    const barBeforeLeave = await track.locator('.city-wave-bar').first()
      .evaluate(element => {
        window.__cityWaveBarBeforeLeave = element
        return element.dataset.offset
      })
    await waveform.dispatchEvent('mouseleave')
    await expect.poll(() => page.evaluate(
      () => window.__cityWaveBarBeforeLeave?.isConnected
    )).toBe(false)
    await expect(track.locator('.city-wave-bar').first())
      .toHaveAttribute('data-offset', barBeforeLeave)

    const rightAligned = await bars.evaluate(element => element.scrollLeft)
    expect(rightAligned).toBeGreaterThan(0)
    await waveform.evaluate(element => {
      const rect = element.getBoundingClientRect()
      const eventInit = {
        bubbles: false,
        cancelable: true,
        clientX: rect.left + 1,
        clientY: rect.top + rect.height / 2
      }
      element.dispatchEvent(new MouseEvent('mouseenter', eventInit))
      element.dispatchEvent(new MouseEvent('mousemove', eventInit))
    })
    await expect.poll(() => bars.evaluate(element => element.scrollLeft))
      .toBeLessThan(rightAligned)

    await waveform.dispatchEvent('mouseleave')
    const settledScroll = await bars.evaluate(element => element.scrollLeft)
    await page.waitForTimeout(80)
    await expect.poll(() => bars.evaluate(element => element.scrollLeft))
      .toBe(settledScroll)
  }

  expect(await page.evaluate(() => localStorage.getItem('edenia_v1')))
    .not.toBe(storedBefore)
  const storedAfterHistorySeed = await page.evaluate(() => {
    const state = JSON.parse(localStorage.getItem('edenia_v1'))
    return {
      anki: state.anki,
      activityLog: state.activityLog
    }
  })
  expect(storedAfterHistorySeed).toEqual({
    anki: {
      '2026-04-01': { reviewed: 1, created: 0 }
    },
    activityLog: []
  })
  const removedBridgeActions = await page.evaluate(() => ({
    handleCityWaveformMouseMove: Object.prototype.hasOwnProperty.call(
      window.EdeniaActions || {},
      'handleCityWaveformMouseMove'
    ),
    clearCityWaveformPreview: Object.prototype.hasOwnProperty.call(
      window.EdeniaActions || {},
      'clearCityWaveformPreview'
    )
  }))
  expect(removedBridgeActions).toEqual({
    handleCityWaveformMouseMove: false,
    clearCityWaveformPreview: false
  })
})

test('city waveform touch dragging remains at both scroll endpoints after release', async ({
  page
}, testInfo) => {
  test.skip(testInfo.project.name !== 'phone-standard')

  await seedCompletedState(page)
  await page.evaluate(() => {
    const state = JSON.parse(localStorage.getItem('edenia_v1'))
    state.anki['2026-04-01'] = { reviewed: 1, created: 0 }
    localStorage.setItem('edenia_v1', JSON.stringify(state))
  })
  await page.reload()
  await waitForApplication(page)

  const bars = page.locator('#cityWaveBars')
  const track = page.locator('#cityWaveTrack')
  await expect(bars).toHaveClass(/\bis-scrollable\b/)
  const endpointOffsets = await track.evaluate(element => {
    const dayBars = element.querySelectorAll('.city-wave-bar')
    return {
      first: dayBars[0]?.dataset.offset,
      last: dayBars[dayBars.length - 1]?.dataset.offset
    }
  })

  const dragToEndpoint = async direction => {
    await bars.evaluate((element, dragDirection) => {
      const rect = element.getBoundingClientRect()
      const pointerId = dragDirection === 'right' ? 401 : 402
      const startX = rect.left + rect.width / 2
      const endX = dragDirection === 'right'
        ? startX - element.scrollWidth
        : startX + element.scrollWidth
      const eventInit = {
        bubbles: true,
        cancelable: true,
        clientY: rect.top + rect.height / 2,
        pointerId,
        pointerType: 'touch'
      }
      element.dispatchEvent(new PointerEvent('pointerdown', {
        ...eventInit,
        clientX: startX
      }))
      element.dispatchEvent(new PointerEvent('pointermove', {
        ...eventInit,
        clientX: endX
      }))
      element.dispatchEvent(new PointerEvent('pointerup', {
        ...eventInit,
        clientX: endX
      }))
    }, direction)
  }

  await dragToEndpoint('right')
  expect(await bars.evaluate(element => (
    element.scrollWidth - element.clientWidth
  ))).toBeGreaterThan(0)
  await expect.poll(() => bars.evaluate(element => (
    Math.abs(element.scrollLeft - (element.scrollWidth - element.clientWidth))
  ))).toBeLessThanOrEqual(1)
  await expect(track.locator('.city-wave-bar.selected'))
    .toHaveAttribute('data-offset', endpointOffsets.last)
  await expect.poll(() => bars.evaluate(element => {
    const selected = element.querySelector('.city-wave-bar.selected')
    const barsRect = element.getBoundingClientRect()
    const selectedRect = selected?.getBoundingClientRect()
    if (!selectedRect) return Number.POSITIVE_INFINITY
    return Math.abs(
      (selectedRect.left + selectedRect.width / 2)
      - (barsRect.left + barsRect.width / 2)
    )
  })).toBeLessThanOrEqual(1)

  await dragToEndpoint('left')
  await expect.poll(() => bars.evaluate(element => element.scrollLeft))
    .toBeLessThanOrEqual(1)
  await expect(track.locator('.city-wave-bar.selected'))
    .toHaveAttribute('data-offset', endpointOffsets.first)
  await expect.poll(() => bars.evaluate(element => {
    const selected = element.querySelector('.city-wave-bar.selected')
    const barsRect = element.getBoundingClientRect()
    const selectedRect = selected?.getBoundingClientRect()
    if (!selectedRect) return Number.POSITIVE_INFINITY
    return Math.abs(
      (selectedRect.left + selectedRect.width / 2)
      - (barsRect.left + barsRect.width / 2)
    )
  })).toBeLessThanOrEqual(1)
})

test('city waveform bar listeners preserve preview, selection, analytics, and replacement ordering', async ({
  page
}, testInfo) => {
  test.skip(!['desktop-standard', 'phone-standard'].includes(
    testInfo.project.name
  ))

  await seedCompletedState(page)
  await page.evaluate(() => {
    const state = JSON.parse(localStorage.getItem('edenia_v1'))
    state.anki = {
      '2026-04-01': { reviewed: 60, created: 0 },
      '2026-07-28': { reviewed: 60, created: 0 }
    }
    localStorage.setItem('edenia_v1', JSON.stringify(state))
    localStorage.removeItem('edenia_posthog_state_v2')
  })
  await page.reload()
  await waitForApplication(page)
  await installCityAnalyticsProbe(page)

  const waveform = page.locator('#cityTimeWaveform')
  const track = page.locator('#cityWaveTrack')
  const bars = track.locator('[data-city-wave-action="select"]')
  const storedBefore = await page.evaluate(
    () => localStorage.getItem('edenia_v1')
  )
  const activityBefore = await page.evaluate(
    () => JSON.parse(localStorage.getItem('edenia_v1')).activityLog
  )

  await expect(bars.first()).not.toHaveAttribute('onclick')
  await expect(bars.first()).not.toHaveAttribute('onmouseenter')
  await expect(bars.first()).not.toHaveAttribute('onmousemove')
  await expect(bars.first()).not.toHaveAttribute('onfocus')
  await expect(bars.first()).toHaveAttribute(
    'data-analytics-action',
    'selectCityWaveBar'
  )

  const todayScore = Number(await page.locator('#cityScore').textContent())
  const firstBar = bars.first()
  const firstLabel = await firstBar.getAttribute('data-label')
  await firstBar.dispatchEvent('mouseenter')
  const previewScore = Number(await page.locator('#cityScore').textContent())
  expect(previewScore).toBeLessThan(todayScore)
  await expect(firstBar).toHaveCSS('--hover-boost', '16px')
  await expect(page.locator('#cityWaveTooltip')).toHaveText(firstLabel)
  await firstBar.dispatchEvent('mousemove')
  await firstBar.focus()
  expect(await page.evaluate(() => window.__cityAnalyticsEvents)).toEqual([])

  const firstNodeStillConnected = await firstBar.evaluate(element => {
    window.__cityWavePreviewBar = element
    return element.isConnected
  })
  expect(firstNodeStillConnected).toBe(true)
  await waveform.dispatchEvent('mouseleave')
  await expect.poll(() => page.evaluate(
    () => window.__cityWavePreviewBar?.isConnected
  )).toBe(false)
  await expect(page.locator('#cityScore')).toHaveText(String(todayScore))

  if (testInfo.project.name === 'desktop-standard') {
    const selectionLabel = await track.locator(
      '[data-city-wave-action="select"][data-offset="-1"]'
    ).getAttribute('aria-label')
    await page.evaluate(() => {
      window.__cityWaveMutationCount = 0
      window.__cityWaveSelectionAtDocument = null
      const trackElement = document.getElementById('cityWaveTrack')
      const observer = new MutationObserver(records => {
        window.__cityWaveMutationCount += records.filter(
          record => record.type === 'childList'
        ).length
      })
      observer.observe(trackElement, { childList: true })
      window.__cityWaveMutationObserver = observer
      document.addEventListener('click', event => {
        if (!event.target.matches?.('[data-city-wave-action="select"]')) return
        window.__cityWaveSelectionAtDocument = {
          targetConnected: event.target.isConnected,
          selectedOffset: document.querySelector(
            '#cityWaveTrack .city-wave-bar.selected'
          )?.dataset.offset,
          touchPreview: document.getElementById('cityTimeWaveform')
            .classList.contains('has-touch-preview'),
          eventNames: window.__cityAnalyticsEvents.map(
            entry => entry.eventName
          ),
          buttonName: window.__cityAnalyticsEvents[0]
            ?.properties?.button_name
        }
      }, { once: true })
    })
    await page.evaluate(() => {
      document.querySelector(
        '[data-city-wave-action="select"][data-offset="-1"]'
      ).click()
    })

    await expect.poll(() => page.evaluate(
      () => window.__cityWaveSelectionAtDocument
    )).toEqual({
      targetConnected: false,
      selectedOffset: '-1',
      touchPreview: false,
      eventNames: ['select_city_wave_bar_clicked'],
      buttonName: selectionLabel
    })
    await expect.poll(() => page.evaluate(
      () => window.__cityWaveMutationCount
    )).toBe(2)
    await page.evaluate(() => {
      window.__cityWaveMutationObserver.disconnect()
    })

    await page.evaluate(() => {
      window.__cityAnalyticsEvents.length = 0
    })
    const enterBar = track.locator(
      '[data-city-wave-action="select"][data-offset="-2"]'
    )
    await enterBar.focus()
    expect(await page.evaluate(() => window.__cityAnalyticsEvents)).toEqual([])
    await enterBar.press('Enter')
    await expect.poll(() => page.evaluate(
      () => window.__cityAnalyticsEvents.map(entry => entry.eventName)
    )).toEqual(['select_city_wave_bar_clicked'])
    await expect(track.locator(
      '[data-city-wave-action="select"][data-offset="-2"]'
    )).not.toBeFocused()

    const spaceBar = track.locator(
      '[data-city-wave-action="select"][data-offset="-3"]'
    )
    await spaceBar.focus()
    await spaceBar.press('Space')
    await expect.poll(() => page.evaluate(
      () => window.__cityAnalyticsEvents.map(entry => entry.eventName)
    )).toEqual([
      'select_city_wave_bar_clicked',
      'select_city_wave_bar_clicked'
    ])
  } else {
    const phoneBar = track.locator(
      '[data-city-wave-action="select"][data-offset="-1"]'
    )
    await expect(phoneBar).toHaveCSS('pointer-events', 'none')
    await phoneBar.focus()
    expect(await page.evaluate(() => window.__cityAnalyticsEvents)).toEqual([])
    await phoneBar.press('Enter')
    await expect.poll(() => page.evaluate(
      () => window.__cityAnalyticsEvents.map(entry => entry.eventName)
    )).toEqual(['select_city_wave_bar_clicked'])

    const replacementBar = track.locator(
      '[data-city-wave-action="select"][data-offset="-2"]'
    )
    await replacementBar.focus()
    await replacementBar.press('Space')
    await expect.poll(() => page.evaluate(
      () => window.__cityAnalyticsEvents.map(entry => entry.eventName)
    )).toEqual([
      'select_city_wave_bar_clicked',
      'select_city_wave_bar_clicked'
    ])
  }

  expect(await page.evaluate(() => localStorage.getItem('edenia_v1')))
    .toBe(storedBefore)
  expect(await page.evaluate(
    () => JSON.parse(localStorage.getItem('edenia_v1')).activityLog
  )).toEqual(activityBefore)
  const removedBridgeActions = await page.evaluate(() => ({
    selectCityWaveBar: Object.prototype.hasOwnProperty.call(
      window.EdeniaActions || {},
      'selectCityWaveBar'
    ),
    previewCityWaveBar: Object.prototype.hasOwnProperty.call(
      window.EdeniaActions || {},
      'previewCityWaveBar'
    )
  }))
  expect(removedBridgeActions).toEqual({
    selectCityWaveBar: false,
    previewCityWaveBar: false
  })
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
  const zoomControls = page.locator('.city-zoom-controls')

  await page.mouse.move(0, 0)
  await expect(zoomControls).toHaveCSS('opacity', '0.38')
  await wrap.hover()
  await expect(zoomControls).toHaveCSS('opacity', '1')
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
      window.EdeniaActions || {},
      'zoomCityImage'
    ),
    resetCityImageView: Object.prototype.hasOwnProperty.call(
      window.EdeniaActions || {},
      'resetCityImageView'
    )
  }))
  expect(removedBridgeActions).toEqual({
    zoomCityImage: false,
    resetCityImageView: false
  })
})

test('city image pans across its cover crop at minimum zoom without exposing background', async ({
  page
}, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-standard')

  await seedCompletedState(page)
  const wrap = page.locator('.city-image-wrap')
  const image = page.locator('#cityMilestoneImage')
  await wrap.scrollIntoViewIfNeeded()

  await expect.poll(() => image.evaluate(element => (
    element.naturalWidth > 0
    && Number.isFinite(Number.parseFloat(element.style.width))
    && Number.isFinite(Number.parseFloat(element.style.height))
  ))).toBe(true)

  const initialGeometry = await page.evaluate(() => {
    const wrapElement = document.querySelector('.city-image-wrap')
    const imageElement = document.getElementById('cityMilestoneImage')
    const wrapRect = wrapElement.getBoundingClientRect()
    return {
      maxX: Math.max(
        0,
        (Number.parseFloat(imageElement.style.width) - wrapRect.width) / 2
      ),
      maxY: Math.max(
        0,
        (Number.parseFloat(imageElement.style.height) - wrapRect.height) / 2
      ),
      transform: imageElement.style.transform,
      pannable: wrapElement.classList.contains('is-pannable'),
      zoomed: wrapElement.classList.contains('is-zoomed')
    }
  })
  expect(initialGeometry.maxX).toBeLessThan(0.01)
  expect(initialGeometry.maxY).toBeGreaterThan(1)
  expect(initialGeometry.transform).toBe('translate(0px, 0px) scale(1)')
  expect(initialGeometry.pannable).toBe(true)
  expect(initialGeometry.zoomed).toBe(false)

  const wrapBox = await wrap.boundingBox()
  const startX = wrapBox.x + wrapBox.width / 2
  const startY = wrapBox.y + wrapBox.height / 2
  await page.mouse.move(startX, startY)
  await page.mouse.down()
  await page.mouse.move(startX, startY - wrapBox.height / 3, { steps: 4 })
  await page.mouse.up()

  const pannedGeometry = await page.evaluate(() => {
    const wrapRect = document.querySelector('.city-image-wrap').getBoundingClientRect()
    const imageElement = document.getElementById('cityMilestoneImage')
    const imageRect = imageElement.getBoundingClientRect()
    const matrix = new DOMMatrix(imageElement.style.transform)
    return {
      x: matrix.m41,
      y: matrix.m42,
      coversTop: imageRect.top <= wrapRect.top + 0.5,
      coversRight: imageRect.right >= wrapRect.right - 0.5,
      coversBottom: imageRect.bottom >= wrapRect.bottom - 0.5,
      coversLeft: imageRect.left <= wrapRect.left + 0.5,
      zoomed: document.querySelector('.city-image-wrap').classList.contains('is-zoomed')
    }
  })
  expect(Math.abs(pannedGeometry.x)).toBeLessThan(0.01)
  expect(pannedGeometry.y).toBeCloseTo(-initialGeometry.maxY, 1)
  expect(pannedGeometry).toMatchObject({
    coversTop: true,
    coversRight: true,
    coversBottom: true,
    coversLeft: true,
    zoomed: false
  })
})

test('phone city image defaults to 75% zoom and pans without exposing background', async ({
  page
}, testInfo) => {
  test.skip(testInfo.project.name !== 'phone-standard')

  await seedCompletedState(page)
  const wrap = page.locator('.city-image-wrap')
  const image = page.locator('#cityMilestoneImage')
  const reset = page.locator('[data-city-zoom-action="reset"]')
  await wrap.scrollIntoViewIfNeeded()
  await expect(wrap).toHaveCSS('touch-action', 'none')
  await expect(wrap).toHaveClass(/\bis-zoomed\b/)
  await expect.poll(() => image.evaluate(element => element.style.transform))
    .toBe('translate(0px, -40px) scale(1.75)')

  await expect.poll(() => page.evaluate(() => {
    const wrapElement = document.querySelector('.city-image-wrap')
    const imageElement = document.getElementById('cityMilestoneImage')
    const wrapRect = wrapElement.getBoundingClientRect()
    const renderedWidth = Number.parseFloat(imageElement.style.width)
    const renderedHeight = Number.parseFloat(imageElement.style.height)
    const scale = new DOMMatrix(imageElement.style.transform).a
    return {
      ready: imageElement.naturalWidth > 0 && Number.isFinite(renderedWidth),
      maxX: Math.max(0, (renderedWidth * scale - wrapRect.width) / 2),
      maxY: Math.max(0, (renderedHeight * scale - wrapRect.height) / 2)
    }
  })).toMatchObject({
    ready: true
  })
  const geometry = await page.evaluate(() => {
    const wrapElement = document.querySelector('.city-image-wrap')
    const imageElement = document.getElementById('cityMilestoneImage')
    const wrapRect = wrapElement.getBoundingClientRect()
    const renderedWidth = Number.parseFloat(imageElement.style.width)
    const renderedHeight = Number.parseFloat(imageElement.style.height)
    const scale = new DOMMatrix(imageElement.style.transform).a
    return {
      maxX: Math.max(0, (renderedWidth * scale - wrapRect.width) / 2),
      maxY: Math.max(0, (renderedHeight * scale - wrapRect.height) / 2),
      centerX: wrapRect.left + wrapRect.width / 2,
      centerY: wrapRect.top + wrapRect.height / 2
    }
  })
  expect(geometry.maxX).toBeGreaterThan(1)
  expect(geometry.maxY).toBeGreaterThan(1)

  await image.dispatchEvent('pointerdown', {
    bubbles: true,
    cancelable: true,
    clientX: geometry.centerX,
    clientY: geometry.centerY,
    isPrimary: true,
    pointerId: 41,
    pointerType: 'touch'
  })
  await image.dispatchEvent('pointermove', {
    bubbles: true,
    cancelable: true,
    clientX: geometry.centerX - geometry.maxX * 2,
    clientY: geometry.centerY,
    isPrimary: true,
    pointerId: 41,
    pointerType: 'touch'
  })
  await image.dispatchEvent('pointerup', {
    bubbles: true,
    cancelable: true,
    clientX: geometry.centerX - geometry.maxX * 2,
    clientY: geometry.centerY,
    isPrimary: true,
    pointerId: 41,
    pointerType: 'touch'
  })

  const pannedGeometry = await page.evaluate(() => {
    const wrapRect = document.querySelector('.city-image-wrap').getBoundingClientRect()
    const imageElement = document.getElementById('cityMilestoneImage')
    const imageRect = imageElement.getBoundingClientRect()
    const matrix = new DOMMatrix(imageElement.style.transform)
    return {
      x: matrix.m41,
      y: matrix.m42,
      coversTop: imageRect.top <= wrapRect.top + 0.5,
      coversRight: imageRect.right >= wrapRect.right - 0.5,
      coversBottom: imageRect.bottom >= wrapRect.bottom - 0.5,
      coversLeft: imageRect.left <= wrapRect.left + 0.5,
      zoomed: document.querySelector('.city-image-wrap').classList.contains('is-zoomed')
    }
  })
  expect(pannedGeometry.x).toBeCloseTo(-geometry.maxX, 1)
  expect(pannedGeometry.y).toBeCloseTo(-40, 1)
  expect(pannedGeometry).toMatchObject({
    coversTop: true,
    coversRight: true,
    coversBottom: true,
    coversLeft: true,
    zoomed: true
  })

  await reset.dispatchEvent('click')
  await expect.poll(() => image.evaluate(element => element.style.transform))
    .toBe('translate(0px, -40px) scale(1.75)')
})

test('Study History period listeners preserve generated options and runtime-only selection', async ({
  page
}, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-standard')

  await seedCompletedState(page)
  await page.evaluate(() => {
    const state = JSON.parse(localStorage.getItem('edenia_v1'))
    state.anki = {
      '2026-07-28': { reviewed: 3, created: 0 },
      '2026-07-20': { reviewed: 6, created: 0 },
      '2026-06-15': { reviewed: 9, created: 0 }
    }
    localStorage.setItem('edenia_v1', JSON.stringify(state))
  })
  await page.reload()
  await waitForApplication(page)

  const storedBefore = await page.evaluate(
    () => localStorage.getItem('edenia_v1')
  )
  const weekCell = page.locator(
    '[data-history-period-range="week"]'
  )
  const weekToggle = weekCell.locator('.history-range-btn')
  await weekToggle.click()
  await expect(weekCell).toHaveClass(/\bopen\b/)
  await expect(weekToggle).toHaveAttribute('aria-expanded', 'true')
  const olderWeek = page.locator(
    '#historyWeekPeriodPopover '
      + '[data-history-period-action="select"]'
      + '[data-history-range="week"]'
      + '[data-history-period-key="2026-07-20"]'
  )
  await expect(olderWeek).toHaveCount(1)
  await page.evaluate(() => {
    window.__historyPeriodAtDocumentBubble = null
    document.addEventListener('click', event => {
      if (!event.target.closest?.('[data-history-period-action="select"]')) {
        return
      }
      const activeRange = document.querySelector('.history-range-btn.active')
      const activeOption = document.querySelector(
        '#historyWeekPeriodPopover .history-period-option.active'
      )
      window.__historyPeriodAtDocumentBubble = {
        activeRange: activeRange?.dataset.historyRange,
        activePeriod: activeOption?.dataset.historyPeriodKey,
        weekOpen: document.querySelector(
          '[data-history-period-range="week"]'
        ).classList.contains('open'),
        weekExpanded: document.querySelector(
          '[data-history-period-range="week"] .history-range-btn'
        ).getAttribute('aria-expanded'),
        points: document.getElementById('historyAnkiCreated').textContent,
        rowCount: document.querySelectorAll(
          '#historyTable .history-row:not(.history-row-head)'
        ).length
      }
    }, { once: true })
  })
  await olderWeek.click()
  await expect.poll(() => page.evaluate(
    () => window.__historyPeriodAtDocumentBubble
  )).toEqual({
    activeRange: 'week',
    activePeriod: '2026-07-20',
    weekOpen: false,
    weekExpanded: 'false',
    points: '2',
    rowCount: 1
  })
  expect(await page.evaluate(() => localStorage.getItem('edenia_v1')))
    .toBe(storedBefore)

  const monthCell = page.locator(
    '[data-history-period-range="month"]'
  )
  const monthToggle = monthCell.locator('.history-range-btn')
  await monthToggle.focus()
  await monthToggle.press('Enter')
  await expect(monthCell).toHaveClass(/\bopen\b/)
  await expect(monthToggle).toHaveAttribute('aria-expanded', 'true')
  const olderMonth = page.locator(
    '#historyMonthPeriodPopover '
      + '[data-history-period-action="select"]'
      + '[data-history-range="month"]'
      + '[data-history-period-key="2026-06"]'
  )
  await expect(olderMonth).toHaveCount(1)
  await page.evaluate(() => {
    window.__historyPeriodAtDocumentBubble = null
    document.addEventListener('click', event => {
      if (!event.target.closest?.('[data-history-period-action="select"]')) {
        return
      }
      const activeRange = document.querySelector('.history-range-btn.active')
      const activeOption = document.querySelector(
        '#historyMonthPeriodPopover .history-period-option.active'
      )
      window.__historyPeriodAtDocumentBubble = {
        activeRange: activeRange?.dataset.historyRange,
        activePeriod: activeOption?.dataset.historyPeriodKey,
        monthOpen: document.querySelector(
          '[data-history-period-range="month"]'
        ).classList.contains('open'),
        monthExpanded: document.querySelector(
          '[data-history-period-range="month"] .history-range-btn'
        ).getAttribute('aria-expanded'),
        points: document.getElementById('historyAnkiCreated').textContent,
        rowCount: document.querySelectorAll(
          '#historyTable .history-row:not(.history-row-head)'
        ).length
      }
    }, { once: true })
  })
  await olderMonth.focus()
  await olderMonth.press('Space')
  await expect.poll(() => page.evaluate(
    () => window.__historyPeriodAtDocumentBubble
  )).toEqual({
    activeRange: 'month',
    activePeriod: '2026-06',
    monthOpen: false,
    monthExpanded: 'false',
    points: '3',
    rowCount: 1
  })
  expect(await page.evaluate(() => localStorage.getItem('edenia_v1')))
    .toBe(storedBefore)

  const bridgeActions = await page.evaluate(() => ({
    selected: Object.prototype.hasOwnProperty.call(
      window.EdeniaActions || {},
      'setHistoryPeriodForRange'
    ),
    toggled: Object.prototype.hasOwnProperty.call(
      window.EdeniaActions || {},
      'toggleHistoryPeriodPopover'
    )
  }))
  expect(bridgeActions).toEqual({
    selected: false,
    toggled: false
  })
})

test('Study History empty period triggers preserve the desktop and phone boundary', async ({
  page
}, testInfo) => {
  test.skip(!['desktop-standard', 'phone-standard'].includes(
    testInfo.project.name
  ))

  await seedCompletedState(page)
  const storedBefore = await page.evaluate(
    () => localStorage.getItem('edenia_v1')
  )
  const monthCell = page.locator(
    '[data-history-period-range="month"]'
  )
  const monthToggle = monthCell.locator(
    '[data-history-period-action="toggle"][data-history-range="month"]'
  )
  const weekToggle = page.locator(
    '[data-history-period-action="toggle"][data-history-range="week"]'
  )
  await page.evaluate(() => {
    window.__historyEmptyPeriodAtDocumentBubble = null
    document.addEventListener('click', event => {
      if (!event.target.closest?.(
        '[data-history-period-action="toggle"]'
      )) return
      window.__historyEmptyPeriodAtDocumentBubble = true
    }, { once: true })
  })
  await monthToggle.focus()
  await monthToggle.press(
    testInfo.project.name === 'phone-standard' ? 'Space' : 'Enter'
  )

  await expect.poll(() => page.evaluate(
    () => window.__historyEmptyPeriodAtDocumentBubble
  )).toBe(null)
  if (testInfo.project.name === 'phone-standard') {
    await expect(monthCell).not.toHaveClass(/\bopen\b/)
    await expect(monthToggle).toHaveAttribute('aria-expanded', 'false')
    await expect(weekToggle).toHaveClass(/\bactive\b/)
    await expect(monthToggle).not.toHaveClass(/\bactive\b/)
  } else {
    await expect(monthCell).toHaveClass(/\bopen\b/)
    await expect(monthToggle).toHaveAttribute('aria-expanded', 'true')
    await expect(weekToggle).not.toHaveClass(/\bactive\b/)
    await expect(monthToggle).toHaveClass(/\bactive\b/)
    await expect(
      page.locator('#historyMonthPeriodPopover .history-period-empty')
    ).toHaveCount(1)
  }
  expect(await page.evaluate(() => localStorage.getItem('edenia_v1')))
    .toBe(storedBefore)
})

test('Study History watched popover listeners preserve fine and coarse interactions', async ({
  page
}, testInfo) => {
  test.skip(!['desktop-standard', 'phone-standard'].includes(
    testInfo.project.name
  ))

  await seedCompletedState(page)
  await page.evaluate(() => {
    const state = JSON.parse(localStorage.getItem('edenia_v1'))
    state.videos['history-popover-video'] = {
      id: 'history-popover-video',
      title: 'Protected History popover video',
      channelId: 'history-popover-channel',
      channelTitle: 'Protected History popover channel',
      duration: 600,
      publishedAt: '2026-07-27T04:00:00.000Z',
      watchedAt: '2026-07-28T05:00:00.000Z',
      status: 'watched',
      thumbnail: '',
      watchProgress: [{
        watchedAt: '2026-07-28T05:00:00.000Z',
        seconds: 300
      }],
      watchProgressTracked: true
    }
    localStorage.setItem('edenia_v1', JSON.stringify(state))
    localStorage.removeItem('edenia_posthog_state_v2')
  })
  await page.reload()
  await waitForApplication(page)

  const cell = page.locator(
    '[data-history-watched-popover-action="toggle"]'
  ).first()
  const trigger = cell.locator('.history-video-count')
  const storedBefore = await page.evaluate(
    () => localStorage.getItem('edenia_v1')
  )
  await expect(trigger).toHaveAttribute('aria-expanded', 'false')
  await page.evaluate(() => {
    window.__historyWatchedAnalyticsEvents = []
    window.__historyWatchedAtDocumentBubble = null
    window.EDENIA_ANALYTICS_ENABLED = true
    window.posthog = {
      capture(eventName, properties) {
        window.__historyWatchedAnalyticsEvents.push({
          eventName,
          properties
        })
      },
      get_distinct_id() {
        return 'preservation-history-watched-popover'
      },
      setPersonProperties() {}
    }
    document.addEventListener('click', event => {
      if (!event.target.closest?.(
        '[data-history-watched-popover-action="toggle"]'
      )) return
      window.__historyWatchedAtDocumentBubble = true
    }, { once: true })
  })

  if (testInfo.project.name === 'desktop-standard') {
    await cell.hover()
    await expect(cell).toHaveClass(/\bopen\b/)
    await expect(trigger).toHaveAttribute('aria-expanded', 'true')
    await page.mouse.move(0, 0)
    await expect(cell).not.toHaveClass(/\bopen\b/)

    await trigger.focus()
    await expect(cell).toHaveClass(/\bopen\b/)
    await trigger.blur()
    await expect(cell).not.toHaveClass(/\bopen\b/)

    await trigger.focus()
    await expect(cell).toHaveClass(/\bopen\b/)
    await trigger.press('Enter')
    await expect(cell).not.toHaveClass(/\bopen\b/)
    await trigger.press('Space')
    await expect(cell).toHaveClass(/\bopen\b/)
    await trigger.click()
    await expect(cell).not.toHaveClass(/\bopen\b/)
    await trigger.click()
    await expect(cell).toHaveClass(/\bopen\b/)
    await page.keyboard.press('Escape')
    await expect(cell).not.toHaveClass(/\bopen\b/)
  } else {
    await trigger.press('Space')
    await expect(cell).toHaveClass(/\bopen\b/)
    await expect(trigger).toHaveAttribute('aria-expanded', 'true')
    await trigger.press('Enter')
    await expect(cell).toHaveClass(/\bopen\b/)
    await page.locator('.section-title').first().click()
    await expect(cell).not.toHaveClass(/\bopen\b/)
    await expect(trigger).toHaveAttribute('aria-expanded', 'false')
  }

  await expect.poll(() => page.evaluate(
    () => window.__historyWatchedAtDocumentBubble
  )).toBe(null)
  expect(await page.evaluate(
    () => window.__historyWatchedAnalyticsEvents
  )).toEqual([])
  expect(await page.evaluate(() => localStorage.getItem('edenia_v1')))
    .toBe(storedBefore)
  const removedBridgeActions = await page.evaluate(() => ({
    closeSoon: Object.prototype.hasOwnProperty.call(
      window.EdeniaActions || {},
      'closeHistoryVideoPopoverSoon'
    ),
    open: Object.prototype.hasOwnProperty.call(
      window.EdeniaActions || {},
      'openHistoryVideoPopover'
    ),
    toggle: Object.prototype.hasOwnProperty.call(
      window.EdeniaActions || {},
      'toggleHistoryVideoPopover'
    )
  }))
  expect(removedBridgeActions).toEqual({
    closeSoon: false,
    open: false,
    toggle: false
  })
})

test('Study History watched-video listeners preserve navigation branches', async ({
  page
}, testInfo) => {
  test.skip(!['desktop-standard', 'phone-standard'].includes(
    testInfo.project.name
  ))

  await seedCompletedState(page)
  await page.evaluate(() => {
    const state = JSON.parse(localStorage.getItem('edenia_v1'))
    state.config.channels = [{
      id: 'history-navigation-channel',
      name: 'Protected History navigation channel'
    }]
    state.videos['history-navigation-active'] = {
      id: 'history-navigation-active',
      title: 'Protected active History video',
      channelId: 'history-navigation-channel',
      channelTitle: 'Protected History navigation channel',
      duration: 720,
      publishedAt: '2026-07-27T04:00:00.000Z',
      watchedAt: null,
      pausedAt: '2026-07-28T06:00:00.000Z',
      resumeAtSeconds: 180,
      status: 'partial',
      thumbnail: '',
      watchProgress: [{
        watchedAt: '2026-07-28T06:00:00.000Z',
        seconds: 180
      }],
      watchProgressTracked: true
    }
    state.videos['history-navigation-watched'] = {
      id: 'history-navigation-watched',
      title: 'Protected watched History video',
      channelId: 'history-navigation-channel',
      channelTitle: 'Protected History navigation channel',
      duration: 600,
      publishedAt: '2026-07-26T04:00:00.000Z',
      watchedAt: '2026-07-28T05:00:00.000Z',
      status: 'watched',
      thumbnail: '',
      watchProgress: [{
        watchedAt: '2026-07-28T05:00:00.000Z',
        seconds: 300
      }],
      watchProgressTracked: true
    }
    localStorage.setItem('edenia_v1', JSON.stringify(state))
    localStorage.removeItem('edenia_posthog_state_v2')
  })
  await page.reload()
  await waitForApplication(page)

  const cell = page.locator(
    '[data-history-watched-popover-action="toggle"]'
  ).first()
  const watchedItem = cell.locator(
    '[data-history-watched-video-action="jump"]'
      + '[data-video-id="history-navigation-watched"]'
  )
  const activeItem = cell.locator(
    '[data-history-watched-video-action="jump"]'
      + '[data-video-id="history-navigation-active"]'
  )
  const storedBefore = await page.evaluate(
    () => localStorage.getItem('edenia_v1')
  )
  await expect(watchedItem).toHaveCount(1)
  await expect(activeItem).toHaveCount(1)
  await page.evaluate(() => {
    window.__historyWatchedVideoAnalyticsEvents = []
    window.__historyWatchedVideoAtDocumentBubble = null
    window.__historyWatchedVideoTargetEvents = {}
    window.EDENIA_ANALYTICS_ENABLED = true
    window.posthog = {
      capture(eventName, properties) {
        window.__historyWatchedVideoAnalyticsEvents.push({
          eventName,
          properties
        })
      },
      get_distinct_id() {
        return 'preservation-history-watched-video'
      },
      setPersonProperties() {}
    }
    document.addEventListener('click', event => {
      if (!event.target.closest?.(
        '[data-history-watched-video-action="jump"]'
      )) return
      window.__historyWatchedVideoAtDocumentBubble = true
    })
    document.addEventListener('click', event => {
      const control = event.target.closest?.(
        '[data-history-watched-video-action="jump"]'
      )
      if (!control) return
      queueMicrotask(() => {
        window.__historyWatchedVideoTargetEvents[
          control.dataset.videoId
        ] = {
          defaultPrevented: event.defaultPrevented
        }
      })
    }, true)
  })

  if (testInfo.project.name === 'desktop-standard') {
    await page.locator('[data-status-tab="favorite"]').click()
    await expect(
      page.locator('[data-status-tab="favorite"]')
    ).toHaveClass(/\bactive\b/)
    await page.evaluate(() => {
      window.__historyWatchedVideoAnalyticsEvents.length = 0
    })
    await cell.hover()
    await watchedItem.focus()
    await watchedItem.press('Enter')
    await expect(cell).not.toHaveClass(/\bopen\b/)
    await expect(page.locator('[data-status-tab="all"]')).toHaveClass(
      /\bactive\b/
    )
    await expect(
      page.locator(
        '#watchedGrid '
          + '.video-card[data-video-id="history-navigation-watched"]'
      )
    ).toHaveClass(/\bhistory-video-arriving\b/)
    await expect.poll(() => page.evaluate(() => (
      window.__historyWatchedVideoTargetEvents[
        'history-navigation-watched'
      ]?.defaultPrevented
    ))).toBe(false)
  }

  if (testInfo.project.name === 'phone-standard') {
    await cell.locator('.history-video-count').press('Space')
    await activeItem.focus()
    await activeItem.press('Space')
    await expect(cell).not.toHaveClass(/\bopen\b/)
    await expect(
      page.locator(
        '.video-card[data-video-id="history-navigation-active"]'
      ).first()
    ).toHaveClass(/\bflash-target\b/)
    await expect.poll(() => page.evaluate(() => (
      window.__historyWatchedVideoTargetEvents[
        'history-navigation-active'
      ]?.defaultPrevented
    ))).toBe(false)
  }

  await expect.poll(() => page.evaluate(
    () => window.__historyWatchedVideoAtDocumentBubble
  )).toBe(null)
  expect(await page.evaluate(
    () => window.__historyWatchedVideoAnalyticsEvents
  )).toEqual([])
  expect(await page.evaluate(() => localStorage.getItem('edenia_v1')))
    .toBe(storedBefore)
  const removedBridgeAction = await page.evaluate(() => (
    Object.prototype.hasOwnProperty.call(
      window.EdeniaActions || {},
      'jumpToWatchedVideo'
    )
  ))
  expect(removedBridgeAction).toBe(false)
})

test('desktop Study History partial navigation survives stationary-pointer hover changes', async ({
  page
}, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-standard')

  await seedCompletedState(page)
  await page.evaluate(() => {
    const state = JSON.parse(localStorage.getItem('edenia_v1'))
    const channelId = 'history-pointer-navigation-channel'
    const channelTitle = 'Protected pointer navigation channel'
    state.config.channels = [{
      id: channelId,
      name: channelTitle
    }]
    state.config.channelShelfOrder = [channelId]
    state.videos['history-pointer-navigation-target'] = {
      id: 'history-pointer-navigation-target',
      title: 'Protected pointer navigation target',
      channelId,
      channelTitle,
      duration: 720,
      publishedAt: '2026-07-27T04:00:00.000Z',
      watchedAt: null,
      pausedAt: '2026-07-28T07:00:00.000Z',
      resumeAtSeconds: 180,
      status: 'partial',
      thumbnail: '',
      watchProgress: [{
        watchedAt: '2026-07-28T02:00:00.000Z',
        seconds: 180
      }],
      watchProgressTracked: true
    }
    for (let index = 1; index <= 4; index += 1) {
      const videoId = `history-pointer-navigation-sibling-${index}`
      const watchedHour = String(7 - index).padStart(2, '0')
      state.videos[videoId] = {
        id: videoId,
        title: `Protected pointer navigation sibling ${index}`,
        channelId,
        channelTitle,
        duration: 600,
        publishedAt: `2026-07-${27 - index}T04:00:00.000Z`,
        watchedAt: null,
        pausedAt: `2026-07-28T${watchedHour}:00:00.000Z`,
        resumeAtSeconds: 120,
        status: 'partial',
        thumbnail: '',
        watchProgress: [{
          watchedAt: `2026-07-28T${watchedHour}:00:00.000Z`,
          seconds: 120
        }],
        watchProgressTracked: true
      }
    }
    localStorage.setItem('edenia_v1', JSON.stringify(state))
  })
  await page.reload()
  await waitForApplication(page)

  const cell = page.locator(
    '[data-history-watched-popover-action="toggle"]'
  ).first()
  await cell.hover()
  const targetItem = cell.locator(
    '[data-history-watched-video-action="jump"]'
      + '[data-video-id="history-pointer-navigation-target"]'
  )
  await expect(targetItem).toHaveCount(1)
  const targetItemBox = await targetItem.boundingBox()
  expect(targetItemBox).not.toBe(null)
  await targetItem.click()

  const pointerPosition = {
    x: targetItemBox.x + (targetItemBox.width / 2),
    y: targetItemBox.y + (targetItemBox.height / 2)
  }
  await expect.poll(() => page.evaluate(({ x, y }) => (
    document.elementFromPoint(x, y)
      ?.closest?.('.channel-shelf-card')
      ?.dataset.videoId || ''
  ), pointerPosition)).toMatch(/^history-pointer-navigation-sibling-/)
  await page.mouse.move(pointerPosition.x + 1, pointerPosition.y)

  const targetCard = page.locator(
    '.channel-shelf-card'
      + '[data-video-id="history-pointer-navigation-target"]'
  )
  await expect(targetCard).toHaveClass(/\bis-previewing\b/)
  await expect(page.locator('.channel-shelf-card.is-previewing')).toHaveCount(1)

  const siblingCard = page.locator(
    '.channel-shelf-card'
      + '[data-video-id="history-pointer-navigation-sibling-3"]'
  )
  await siblingCard.hover()
  await expect(siblingCard).toHaveClass(/\bis-previewing\b/)
  await expect(targetCard).not.toHaveClass(/\bis-previewing\b/)
})

test('Study History points popover listeners preserve fine and coarse interactions', async ({
  page
}, testInfo) => {
  test.skip(!['desktop-standard', 'phone-standard'].includes(
    testInfo.project.name
  ))

  await seedCompletedState(page)
  await page.evaluate(() => {
    const state = JSON.parse(localStorage.getItem('edenia_v1'))
    state.anki['2026-07-28'] = {
      reviewed: 6,
      created: 1
    }
    localStorage.setItem('edenia_v1', JSON.stringify(state))
    localStorage.removeItem('edenia_posthog_state_v2')
  })
  await page.reload()
  await waitForApplication(page)

  const cell = page.locator(
    '[data-history-points-popover-action="toggle"]'
  ).first()
  const trigger = cell.locator('.history-points-trigger')
  const storedBefore = await page.evaluate(
    () => localStorage.getItem('edenia_v1')
  )
  await expect(trigger).toHaveAttribute('aria-expanded', 'false')
  await page.evaluate(() => {
    window.__historyPointsAnalyticsEvents = []
    window.__historyPointsAtDocumentBubble = null
    window.EDENIA_ANALYTICS_ENABLED = true
    window.posthog = {
      capture(eventName, properties) {
        window.__historyPointsAnalyticsEvents.push({
          eventName,
          properties
        })
      },
      get_distinct_id() {
        return 'preservation-history-points-popover'
      },
      setPersonProperties() {}
    }
    document.addEventListener('click', event => {
      if (!event.target.closest?.(
        '[data-history-points-popover-action="toggle"]'
      )) return
      window.__historyPointsAtDocumentBubble = true
    }, { once: true })
  })

  if (testInfo.project.name === 'desktop-standard') {
    await cell.hover()
    await expect(cell).toHaveClass(/\bopen\b/)
    await expect(trigger).toHaveAttribute('aria-expanded', 'true')
    await page.mouse.move(0, 0)
    await expect(cell).not.toHaveClass(/\bopen\b/)

    await trigger.focus()
    await expect(cell).toHaveClass(/\bopen\b/)
    await trigger.blur()
    await expect(cell).not.toHaveClass(/\bopen\b/)

    await trigger.focus()
    await expect(cell).toHaveClass(/\bopen\b/)
    await trigger.press('Enter')
    await expect(cell).not.toHaveClass(/\bopen\b/)
    await trigger.press('Space')
    await expect(cell).toHaveClass(/\bopen\b/)
    await page.keyboard.press('Escape')
    await expect(cell).not.toHaveClass(/\bopen\b/)
  } else {
    await trigger.press('Space')
    await expect(cell).toHaveClass(/\bopen\b/)
    await expect(trigger).toHaveAttribute('aria-expanded', 'true')
    await trigger.press('Enter')
    await expect(cell).toHaveClass(/\bopen\b/)
    await page.locator('.section-title').first().click()
    await expect(cell).not.toHaveClass(/\bopen\b/)
    await expect(trigger).toHaveAttribute('aria-expanded', 'false')
  }

  await expect.poll(() => page.evaluate(
    () => window.__historyPointsAtDocumentBubble
  )).toBe(null)
  expect(await page.evaluate(
    () => window.__historyPointsAnalyticsEvents
  )).toEqual([])
  expect(await page.evaluate(() => localStorage.getItem('edenia_v1')))
    .toBe(storedBefore)
  const removedBridgeActions = await page.evaluate(() => ({
    closeSoon: Object.prototype.hasOwnProperty.call(
      window.EdeniaActions || {},
      'closeHistoryPointsPopoverSoon'
    ),
    open: Object.prototype.hasOwnProperty.call(
      window.EdeniaActions || {},
      'openHistoryPointsPopover'
    ),
    toggle: Object.prototype.hasOwnProperty.call(
      window.EdeniaActions || {},
      'toggleHistoryPointsPopover'
    )
  }))
  expect(removedBridgeActions).toEqual({
    closeSoon: false,
    open: false,
    toggle: false
  })
})

test('Study History heatmap listeners preserve tooltip input and positioning branches', async ({
  page
}, testInfo) => {
  test.skip(!['desktop-standard', 'phone-standard'].includes(
    testInfo.project.name
  ))

  await seedCompletedState(page)
  await page.evaluate(() => {
    const state = JSON.parse(localStorage.getItem('edenia_v1'))
    state.anki['2026-07-28'] = {
      reviewed: 6,
      created: 1
    }
    localStorage.setItem('edenia_v1', JSON.stringify(state))
    localStorage.removeItem('edenia_posthog_state_v2')
  })
  await page.reload()
  await waitForApplication(page)
  const summaryTab = page.locator('[data-history-view="summary"]')
  const heatmapTab = page.locator('[data-history-view="heatmap"]')
  await heatmapTab.click()
  await summaryTab.click()
  await heatmapTab.click()

  const day = page.locator(
    '[data-history-heatmap-action="tooltip"][data-points="2"]'
  )
  const tooltip = page.locator('#heatmapTooltip')
  const storedBefore = await page.evaluate(
    () => localStorage.getItem('edenia_v1')
  )
  await expect(day).toHaveCount(1)
  await page.evaluate(() => {
    window.__historyHeatmapAnalyticsEvents = []
    window.__historyHeatmapAtDocumentBubble = null
    window.EDENIA_ANALYTICS_ENABLED = true
    window.posthog = {
      capture(eventName, properties) {
        window.__historyHeatmapAnalyticsEvents.push({
          eventName,
          properties
        })
      },
      get_distinct_id() {
        return 'preservation-history-heatmap'
      },
      setPersonProperties() {}
    }
    document.addEventListener('click', event => {
      if (!event.target.closest?.(
        '[data-history-heatmap-action="tooltip"]'
      )) return
      window.__historyHeatmapAtDocumentBubble = true
    }, { once: true })
  })

  if (testInfo.project.name === 'desktop-standard') {
    await day.hover()
    await expect(tooltip).toHaveClass(/\bshow\b/)
    await expect(tooltip).toContainText('2 pts')
    await expect(tooltip).toHaveCSS('position', 'fixed')
    await page.mouse.move(0, 0)
    await expect(tooltip).not.toHaveClass(/\bshow\b/)

    await day.focus()
    await expect(tooltip).toHaveClass(/\bshow\b/)
    await day.blur()
    await expect(tooltip).not.toHaveClass(/\bshow\b/)

    await day.focus()
    await expect(tooltip).toHaveClass(/\bshow\b/)
    await day.press('Enter')
    await expect(tooltip).not.toHaveClass(/\bshow\b/)
    await day.press('Space')
    await expect(tooltip).toHaveClass(/\bshow\b/)
    await page.keyboard.press('Escape')
    await expect(tooltip).toHaveClass(/\bshow\b/)
    await page.locator('.section-title').first().click()
    await expect(tooltip).not.toHaveClass(/\bshow\b/)
  } else {
    await day.press('Space')
    await expect(tooltip).toHaveClass(/\bshow\b/)
    await expect(tooltip).toContainText('2 pts')
    await expect(tooltip).toHaveCSS('position', 'absolute')
    await day.press('Enter')
    await expect(tooltip).toHaveClass(/\bshow\b/)
    await page.locator('.section-title').first().click()
    await expect(tooltip).not.toHaveClass(/\bshow\b/)
  }

  await expect.poll(() => page.evaluate(
    () => window.__historyHeatmapAtDocumentBubble
  )).toBe(null)
  expect(await page.evaluate(
    () => window.__historyHeatmapAnalyticsEvents
  )).toEqual([])
  expect(await page.evaluate(() => localStorage.getItem('edenia_v1')))
    .toBe(storedBefore)
  const removedBridgeActions = await page.evaluate(() => ({
    hide: Object.prototype.hasOwnProperty.call(
      window.EdeniaActions || {},
      'hideHeatmapTooltip'
    ),
    position: Object.prototype.hasOwnProperty.call(
      window.EdeniaActions || {},
      'positionHeatmapTooltip'
    ),
    show: Object.prototype.hasOwnProperty.call(
      window.EdeniaActions || {},
      'showHeatmapTooltip'
    ),
    toggle: Object.prototype.hasOwnProperty.call(
      window.EdeniaActions || {},
      'toggleHeatmapTooltip'
    )
  }))
  expect(removedBridgeActions).toEqual({
    hide: false,
    position: false,
    show: false,
    toggle: false
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
    Object.prototype.hasOwnProperty.call(window.EdeniaActions || {}, 'setHistoryView')
  ))
  expect(removedBridgeAction).toBe(false)
})

test('Undo and Redo listeners preserve stacks, analytics, focus, and responsive behavior', async ({
  page
}, testInfo) => {
  const isDesktop = testInfo.project.name === 'desktop-standard'
  const isPhone = testInfo.project.name === 'phone-standard'
  test.skip(!isDesktop && !isPhone)

  await seedCompletedState(page)
  await page.evaluate(() => {
    const state = JSON.parse(localStorage.getItem('edenia_v1'))
    const channel = {
      id: 'protected-undo-channel',
      name: 'Protected Undo channel'
    }
    const beforeVideo = {
      id: 'protected-undo-video',
      title: 'Protected favorite lesson',
      channelId: channel.id,
      channelTitle: channel.name,
      duration: 720,
      publishedAt: '2026-07-27T04:00:00.000Z',
      status: 'unwatched',
      favorite: false,
      thumbnail: 'https://i.ytimg.com/vi/protected-undo-video/hqdefault.jpg'
    }
    const afterVideo = {
      ...beforeVideo,
      favorite: true
    }
    const createAction = (marker, createdAt) => ({
      type: 'video-favorite',
      marker,
      videoId: beforeVideo.id,
      before: {
        favorite: false,
        video: { ...beforeVideo }
      },
      after: {
        favorite: true,
        video: { ...afterVideo }
      },
      createdAt
    })

    state.config.channels = [channel]
    state.videos = {
      [afterVideo.id]: afterVideo
    }
    state.undoStack = Array.from({ length: 14 }, (_, index) => (
      createAction(
        `older-${index}`,
        `2026-07-27T${String(index).padStart(2, '0')}:00:00.000Z`
      )
    ))
    state.undoStack.push(
      createAction('protected-newest', '2026-07-28T03:59:00.000Z')
    )
    state.redoStack = []
    localStorage.setItem('edenia_v1', JSON.stringify(state))
    localStorage.removeItem('edenia_v1_backups')
    localStorage.removeItem('edenia_posthog_state_v2')
  })
  await page.reload()
  await waitForApplication(page)
  await page.evaluate(() => {
    window.__undoRedoAnalyticsEvents = []
    window.EDENIA_ANALYTICS_ENABLED = true
    window.posthog = {
      capture(eventName, properties) {
        window.__undoRedoAnalyticsEvents.push({ eventName, properties })
      },
      get_distinct_id() {
        return 'preservation-undo-redo'
      },
      setPersonProperties() {}
    }
  })

  const undoButton = page.locator(
    '#undoBtn[data-undo-redo-action="toggle"][data-undo-redo-direction="undo"]'
  )
  const redoButton = page.locator(
    '#redoBtn[data-undo-redo-action="toggle"][data-undo-redo-direction="redo"]'
  )
  const undoTooltip = page.locator('#undoTooltip')
  const redoTooltip = page.locator('#redoTooltip')
  const undoActions = undoTooltip.locator(
    '[data-undo-redo-action="apply"]'
  )
  const redoActions = redoTooltip.locator(
    '[data-undo-redo-action="apply"]'
  )

  await expect(undoButton).toBeEnabled()
  await expect(redoButton).toBeDisabled()
  if (isPhone) {
    await undoButton.focus()
    await undoButton.press('Enter')
  } else {
    await undoButton.click()
  }
  await expect(undoTooltip).not.toHaveClass(/\bhidden\b/)
  await expect(undoButton).toHaveAttribute('aria-expanded', 'true')
  await expect(undoActions).toHaveCount(15)
  await expect(undoActions.first()).toHaveAttribute(
    'data-undo-redo-index',
    '14'
  )
  expect(await page.evaluate(
    () => window.__undoRedoAnalyticsEvents
  )).toEqual([])
  if (isPhone) {
    await expect(undoActions.first()).toBeFocused()
    expect(await undoTooltip.evaluate(element => ({
      left: element.style.left,
      right: element.style.right
    }))).toEqual({
      left: '',
      right: ''
    })
  } else {
    expect(await undoTooltip.evaluate(element => ({
      left: element.style.left,
      right: element.style.right
    }))).toEqual({
      left: expect.stringMatching(/^-?\d+px$/),
      right: 'auto'
    })
    await undoActions.first().focus()
  }

  await page.evaluate(() => {
    window.__undoRedoAtDocumentBubble = null
    document.addEventListener('click', event => {
      if (!event.target.closest?.('[data-undo-redo-action="apply"]')) return
      const state = JSON.parse(localStorage.getItem('edenia_v1'))
      window.__undoRedoAtDocumentBubble = {
        favorite: state.videos['protected-undo-video']?.favorite,
        undoMarkers: state.undoStack.map(action => action.marker),
        redoMarkers: state.redoStack.map(action => action.marker),
        activity: state.activityLog.find(entry => entry.type === 'undo'),
        eventNames: window.__undoRedoAnalyticsEvents.map(
          entry => entry.eventName
        )
      }
    }, { once: true })
  })
  await undoActions.first().press('Enter')
  await expect.poll(() => page.evaluate(
    () => window.__undoRedoAtDocumentBubble
  )).not.toBeNull()
  const undoResult = await page.evaluate(
    () => window.__undoRedoAtDocumentBubble
  )
  expect(undoResult).toMatchObject({
    favorite: false,
    redoMarkers: ['protected-newest'],
    activity: {
      actor: 'user',
      type: 'undo',
      status: 'success',
      title: 'Undo action',
      meta: { videoId: 'protected-undo-video' }
    }
  })
  expect(undoResult.undoMarkers).toHaveLength(14)
  expect(undoResult.undoMarkers).not.toContain('protected-newest')
  expect(undoResult.eventNames.filter(eventName => [
    'undo_applied',
    'video_favorite_changed',
    'apply_history_action_clicked'
  ].includes(eventName))).toEqual([
    'undo_applied',
    'video_favorite_changed',
    'apply_history_action_clicked'
  ])
  await expect(page.locator('#toast')).toHaveClass(/\bshow\b/)
  await expect(page.locator('#toast')).toContainText(
    'Removed from favorites: Protected favorite lesson'
  )
  await expect(undoButton).toBeEnabled()
  await expect(redoButton).toBeEnabled()

  await page.evaluate(() => {
    window.__undoRedoAnalyticsEvents.length = 0
  })
  await redoButton.focus()
  await redoButton.press('Enter')
  await expect(redoTooltip).not.toHaveClass(/\bhidden\b/)
  await expect(redoButton).toHaveAttribute('aria-expanded', 'true')
  await expect(redoActions).toHaveCount(1)
  await expect(redoActions.first()).toHaveAttribute(
    'data-undo-redo-index',
    '0'
  )
  expect(await page.evaluate(
    () => window.__undoRedoAnalyticsEvents
  )).toEqual([])
  if (isPhone) await expect(redoActions.first()).toBeFocused()
  else await redoActions.first().focus()

  await page.evaluate(() => {
    window.__undoRedoAtDocumentBubble = null
    document.addEventListener('click', event => {
      if (!event.target.closest?.('[data-undo-redo-action="apply"]')) return
      const state = JSON.parse(localStorage.getItem('edenia_v1'))
      window.__undoRedoAtDocumentBubble = {
        favorite: state.videos['protected-undo-video']?.favorite,
        undoMarkers: state.undoStack.map(action => action.marker),
        redoMarkers: state.redoStack.map(action => action.marker),
        activity: state.activityLog.find(entry => entry.type === 'redo'),
        eventNames: window.__undoRedoAnalyticsEvents.map(
          entry => entry.eventName
        )
      }
    }, { once: true })
  })
  await redoActions.first().press('Space')
  await expect.poll(() => page.evaluate(
    () => window.__undoRedoAtDocumentBubble
  )).not.toBeNull()
  const redoResult = await page.evaluate(
    () => window.__undoRedoAtDocumentBubble
  )
  expect(redoResult).toMatchObject({
    favorite: true,
    redoMarkers: [],
    activity: {
      actor: 'user',
      type: 'redo',
      status: 'success',
      title: 'Redo action',
      meta: { videoId: 'protected-undo-video' }
    }
  })
  expect(redoResult.undoMarkers).toHaveLength(15)
  expect(redoResult.undoMarkers.at(-1)).toBe('protected-newest')
  expect(redoResult.eventNames.filter(eventName => [
    'redo_applied',
    'video_favorite_changed',
    'apply_history_action_clicked'
  ].includes(eventName))).toEqual([
    'redo_applied',
    'video_favorite_changed',
    'apply_history_action_clicked'
  ])
  await expect(page.locator('#toast')).toContainText(
    'Added to favorites: Protected favorite lesson'
  )

  await page.evaluate(() => {
    window.__undoRedoAnalyticsEvents.length = 0
  })
  await undoButton.focus()
  await undoButton.press('Enter')
  await expect(undoTooltip).not.toHaveClass(/\bhidden\b/)
  const undoScroller = undoTooltip.locator(
    '[data-undo-redo-action="scroll"]'
  )
  await expect(undoScroller).toBeVisible()

  if (isPhone) {
    await expect(undoActions.first()).toBeFocused()
    const scrollLifecycle = await undoScroller.evaluate(async scroller => {
      scroller.scrollTop = 0
      const rect = scroller.getBoundingClientRect()
      scroller.dispatchEvent(new MouseEvent('mousemove', {
        bubbles: true,
        clientY: rect.bottom - 1
      }))
      await new Promise(resolve => window.setTimeout(resolve, 100))
      const moved = scroller.scrollTop
      scroller.dispatchEvent(new MouseEvent('mouseleave'))
      await new Promise(resolve => {
        requestAnimationFrame(() => requestAnimationFrame(resolve))
      })
      return {
        afterLeave: scroller.scrollTop,
        clientHeight: scroller.clientHeight,
        moved,
        scrollHeight: scroller.scrollHeight
      }
    })
    expect(scrollLifecycle.scrollHeight).toBeGreaterThan(
      scrollLifecycle.clientHeight
    )
    expect(scrollLifecycle.moved).toBeGreaterThan(0)
    expect(scrollLifecycle.afterLeave).toBe(scrollLifecycle.moved)

    const closeButton = undoTooltip.locator(
      '[data-undo-redo-action="close"]'
    )
    await closeButton.focus()
    await closeButton.press('Enter')
    await expect(undoTooltip).toHaveClass(/\bhidden\b/)
    await expect(undoButton).toHaveAttribute('aria-expanded', 'false')
    await expect(undoButton).toBeFocused()
    expect(await page.evaluate(() => (
      window.__undoRedoAnalyticsEvents.map(entry => entry.eventName)
    ))).toContain('close_history_action_popovers_clicked')

    await page.evaluate(() => {
      window.__undoRedoAnalyticsEvents.length = 0
    })
    await undoButton.press('Enter')
    await expect(undoActions.first()).toBeFocused()
    await undoActions.first().press('Escape')
    await expect(undoTooltip).toHaveClass(/\bhidden\b/)
    await expect(undoButton).toBeFocused()
    expect(await page.evaluate(
      () => window.__undoRedoAnalyticsEvents
    )).toEqual([])
  } else {
    const desktopScroll = await undoScroller.evaluate(async scroller => {
      scroller.scrollTop = 0
      const rect = scroller.getBoundingClientRect()
      scroller.dispatchEvent(new MouseEvent('mousemove', {
        bubbles: true,
        clientY: rect.bottom - 1
      }))
      await new Promise(resolve => {
        requestAnimationFrame(() => requestAnimationFrame(resolve))
      })
      scroller.dispatchEvent(new MouseEvent('mouseleave'))
      return scroller.scrollTop
    })
    expect(desktopScroll).toBe(0)
    await undoButton.press('Escape')
    await expect(undoTooltip).toHaveClass(/\bhidden\b/)
  }

  const removedBridgeActions = await page.evaluate(() => {
    const names = [
      'applyHistoryAction',
      'closeHistoryActionPopovers',
      'handleHistoryActionScrollHover',
      'stopHistoryActionAutoScroll',
      'toggleHistoryActionPopover'
    ]
    return Object.fromEntries(names.map(name => [
      name,
      Object.prototype.hasOwnProperty.call(window.EdeniaActions || {}, name)
    ]))
  })
  expect(removedBridgeActions).toEqual({
    applyHistoryAction: false,
    closeHistoryActionPopovers: false,
    handleHistoryActionScrollHover: false,
    stopHistoryActionAutoScroll: false,
    toggleHistoryActionPopover: false
  })

  await page.reload()
  await waitForApplication(page)
  await expect.poll(() => page.evaluate(() => {
    const state = JSON.parse(localStorage.getItem('edenia_v1'))
    return {
      favorite: state.videos['protected-undo-video']?.favorite,
      redoCount: state.redoStack.length,
      undoCount: state.undoStack.length,
      undoMarker: state.undoStack.at(-1)?.marker,
      activityTypes: state.activityLog
        .filter(entry => entry.type === 'undo' || entry.type === 'redo')
        .map(entry => entry.type)
    }
  })).toEqual({
    favorite: true,
    redoCount: 0,
    undoCount: 15,
    undoMarker: 'protected-newest',
    activityTypes: ['redo', 'undo']
  })
})
