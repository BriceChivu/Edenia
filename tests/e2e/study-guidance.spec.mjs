import { expect, test } from '../support/network-fixture.mjs'

const fixedNow = new Date('2026-08-03T04:00:00.000Z')
const normalStorageKey = 'edenia_v1'
const internalStorageKey = 'edenia_v1_internal_test'
const guidanceProjects = new Set([
  'desktop-standard',
  'tablet-portrait',
  'phone-standard'
])

test.beforeEach(async ({ page }) => {
  await page.clock.setFixedTime(fixedNow)
})

async function waitForApplication(page) {
  await expect(page.locator('#mainApp')).not.toHaveClass(/\bhidden\b/)
}

async function seedGuidanceState(page, { internalTest }) {
  const storageKey = internalTest ? internalStorageKey : normalStorageKey
  const path = internalTest ? '/?internal_test=1' : '/'
  await page.goto(path)
  await waitForApplication(page)
  await page.evaluate(({ seededStorageKey }) => {
    const state = window.defaultState(4, [], 'light', [], 'en')
    const completedAt = '2026-07-01T04:00:00.000Z'
    state.config.ankiEnabled = false
    state.config.ankiDisabledAt = completedAt
    state.config.channels = [{
      id: 'guidance-channel',
      name: 'Guidance channel'
    }]
    state.onboarding.introSeenAt = completedAt
    state.onboarding.setupCompleted = true
    state.onboarding.setupCompletedAt = completedAt
    state.onboarding.walkthroughCompleted = true
    state.onboarding.walkthroughCompletedAt = completedAt
    state.onboarding.levelUpGuidanceShownAt = completedAt
    state.config.studyInsights.history = [{
      key: 'saved-insight',
      insightId: 'saved-insight',
      type: 'steady-process',
      variant: 0,
      activeDays: 3,
      ankiDays: 0,
      firstRecordedAt: '2026-07-01T04:00:00.000Z',
      recordedAt: '2026-07-01T04:00:00.000Z'
    }]

    const localDate = (year, month, day) => {
      const date = new Date(year, month - 1, day, 12, 0, 0, 0)
      return date.toISOString()
    }
    const addWatchedVideo = (id, year, month, day, minutes) => {
      const watchedAt = localDate(year, month, day)
      state.videos[id] = {
        id,
        title: `Study video ${id}`,
        channelId: 'guidance-channel',
        channelTitle: 'Guidance channel',
        duration: 3600,
        publishedAt: watchedAt,
        status: 'watched',
        watchedAt,
        watchProgress: [{ watchedAt, seconds: minutes * 60 }],
        watchProgressTracked: true,
        thumbnail: ''
      }
    }

    const weeks = [
      [2026, 7, 13],
      [2026, 7, 20],
      [2026, 7, 27]
    ]
    weeks.forEach(([year, month, monday], weekIndex) => {
      const days = [
        [0, 30],
        [1, 20],
        [3, 20],
        [4, 30]
      ]
      if (weekIndex < 2) days.push([2, 20])
      days.forEach(([dayOffset, minutes]) => {
        addWatchedVideo(
          `week-${weekIndex}-day-${dayOffset}`,
          year,
          month,
          monday + dayOffset,
          minutes
        )
      })
    })
    addWatchedVideo('current-monday', 2026, 8, 3, 30)
    state.videos['next-video'] = {
      id: 'next-video',
      title: 'A short video for today',
      channelId: 'guidance-channel',
      channelTitle: 'Guidance channel',
      duration: 600,
      publishedAt: '2026-08-03T03:00:00.000Z',
      status: 'watch-later',
      watchLater: true,
      thumbnail: ''
    }
    localStorage.setItem(seededStorageKey, JSON.stringify(state))
  }, { seededStorageKey: storageKey })
  await page.goto(path)
  await waitForApplication(page)
  return storageKey
}

test('Internal study guidance is simple, actionable, and not archived', async ({
  page
}, testInfo) => {
  test.skip(!guidanceProjects.has(testInfo.project.name))
  const storageKey = await seedGuidanceState(page, { internalTest: true })
  const insight = page.locator('#studyInsightCard')

  await expect(insight).toBeVisible()
  await expect(insight).toHaveAttribute(
    'data-guidance-key',
    '2026-08-03:extra-day:3'
  )
  await expect(insight).not.toHaveAttribute('data-insight-id', /.+/)
  await expect(page.locator('#studyInsightTitle')).toHaveText('Try Wednesday')
  await expect(page.locator('#studyInsightBody')).toHaveText(
    'Try 20 minutes of video study.'
  )
  await expect(page.locator('#studyInsightEvidence')).toContainText(
    '2 of the last 3 full weeks'
  )
  await expect(page.locator('#studyInsightHistoryCount')).toHaveText('1')
  await expect.poll(() => page.evaluate(key => {
    const state = JSON.parse(localStorage.getItem(key))
    return {
      historyCount: state.config.studyInsights.history.length,
      levelUpGuidanceShownAt: state.onboarding.levelUpGuidanceShownAt
    }
  }, storageKey)).toEqual({
    historyCount: 1,
    levelUpGuidanceShownAt: '2026-07-01T04:00:00.000Z'
  })

  const guidanceAction = page.locator('#studyGuidanceNextAction')
  await expect(guidanceAction).toBeVisible()
  await expect(guidanceAction).toHaveText('Choose a video')
  await guidanceAction.click()
  await expect(page.locator(
    '#nextStudyCard [data-next-study-action="open"]:visible'
  )).toBeFocused()
  const width = await page.evaluate(() => ({
    document: document.documentElement.scrollWidth,
    viewport: document.documentElement.clientWidth
  }))
  expect(width.document).toBeLessThanOrEqual(width.viewport)
})

test('Public mode keeps the new study guidance switched off', async ({
  page
}, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-standard')
  await seedGuidanceState(page, { internalTest: false })

  await expect(page.locator('#studyInsightCard')).not.toHaveAttribute(
    'data-guidance-key',
    /.+/
  )
  await expect(page.locator('#studyGuidanceNextAction')).toBeHidden()
})
