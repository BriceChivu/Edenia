import { expect, test } from '../support/network-fixture.mjs'

const fixtureChannelId = 'UC0000000000000000000000'
const keyboardProjects = new Set(['desktop-standard', 'phone-standard'])

async function seedCompletedState(page) {
  await page.route('**/config.local.js', route => route.fulfill({
    body: `window.EDENIA_CONFIG = {
      youtubeApiKey: 'fixture-key',
      freePlusEnabled: false,
      plusCheckoutEnabled: false,
      videoOrganizationEnabled: true,
      channelVideoFormatToggleEnabled: true,
      supabaseUrl: '',
      supabasePublishableKey: ''
    }`,
    contentType: 'application/javascript',
    status: 200
  }))
  await page.goto('/')
  await page.evaluate(() => {
    const state = window.defaultState(4, [], 'light', [], 'en')
    const completedAt = '2026-08-05T04:00:00.000Z'
    state.config.ankiEnabled = false
    state.config.ankiDisabledAt = completedAt
    state.onboarding.introSeenAt = completedAt
    state.onboarding.setupCompleted = true
    state.onboarding.setupCompletedAt = completedAt
    state.onboarding.walkthroughCompleted = true
    state.onboarding.walkthroughCompletedAt = completedAt
    localStorage.setItem('edenia_v1', JSON.stringify(state))
  })
  await page.reload()
  await expect(page.locator('#mainApp')).not.toHaveClass(/\bhidden\b/)
}

async function openChannelEntry(page) {
  await page.locator('#manualVideoBtn').click()
  await expect(page.locator('#manualVideoPopover')).not.toHaveClass(/\bhidden\b/)
  return page.locator('#manualVideoUrlInput')
}

async function installAnalyticsProbe(page) {
  await page.evaluate(() => {
    window.__manualChannelAnalyticsEvents = []
    window.EDENIA_ANALYTICS_ENABLED = true
    window.posthog = {
      capture(eventName, properties) {
        window.__manualChannelAnalyticsEvents.push({ eventName, properties })
      },
      get_distinct_id() {
        return 'manual-channel-entry-regression'
      },
      setPersonProperties() {}
    }
  })
}

test('a typed YouTube handle overrides previously active catalog suggestions', async ({
  page
}, testInfo) => {
  test.skip(!keyboardProjects.has(testInfo.project.name))
  await seedCompletedState(page)
  await installAnalyticsProbe(page)

  const input = await openChannelEntry(page)
  const suggestions = page.locator('#manualChannelSuggestions')
  await input.fill('Grace Mandarin')
  await expect(suggestions).not.toHaveClass(/\bhidden\b/)
  await input.press('ArrowDown')
  await expect(input).toHaveAttribute(
    'aria-activedescendant',
    'manualChannelSuggestion-mandarin-grace'
  )

  await input.fill('@GraceMandarinChinese')
  await expect(suggestions).toHaveClass(/\bhidden\b/)
  await expect(input).not.toHaveAttribute('aria-activedescendant', /.+/)
  await page.evaluate(() => {
    window.__manualChannelAnalyticsEvents.length = 0
  })
  await input.press('Enter')

  await expect.poll(() => page.evaluate(() => (
    JSON.parse(localStorage.getItem('edenia_v1')).config.channels.map(channel => channel.id)
  ))).toEqual([fixtureChannelId])
  await expect.poll(() => page.evaluate(() => (
    window.__manualChannelAnalyticsEvents
      .filter(event => [
        'search_result_selected',
        'channel_added_via_add_button'
      ].includes(event.eventName))
      .map(event => ({
        eventName: event.eventName,
        source: event.properties.source || null
      }))
  ))).toEqual([{
    eventName: 'channel_added_via_add_button',
    source: 'direct_input'
  }])
})

test('ArrowDown and Enter still select an explicit catalog suggestion', async ({
  page
}, testInfo) => {
  test.skip(!keyboardProjects.has(testInfo.project.name))
  await seedCompletedState(page)
  await installAnalyticsProbe(page)

  const input = await openChannelEntry(page)
  await input.fill('Grace Mandarin')
  await expect(page.locator('#manualChannelSuggestions')).not.toHaveClass(/\bhidden\b/)
  await input.press('ArrowDown')
  await expect(input).toHaveAttribute(
    'aria-activedescendant',
    'manualChannelSuggestion-mandarin-grace'
  )
  await page.evaluate(() => {
    window.__manualChannelAnalyticsEvents.length = 0
  })
  await input.press('Enter')

  await expect.poll(() => page.evaluate(() => (
    JSON.parse(localStorage.getItem('edenia_v1')).config.channels.map(channel => channel.id)
  ))).toEqual([fixtureChannelId])
  await expect.poll(() => page.evaluate(() => (
    window.__manualChannelAnalyticsEvents
      .filter(event => event.eventName === 'search_result_selected')
      .map(event => ({
        catalogId: event.properties.catalog_id,
        searchSource: event.properties.search_source
      }))
  ))).toEqual([{
    catalogId: 'mandarin-grace',
    searchSource: 'channel_catalog'
  }])
})

test('catalog suggestions match partial Chinese text inside a channel name', async ({
  page
}, testInfo) => {
  test.skip(!keyboardProjects.has(testInfo.project.name))
  await seedCompletedState(page)

  const input = await openChannelEntry(page)
  await input.fill('叔中')
  const suggestion = page.locator(
    '#manualChannelSuggestions .manual-channel-suggestion',
    { hasText: 'Dashu Mandarin 大叔中文' }
  )
  await expect(suggestion).toBeVisible()
})
