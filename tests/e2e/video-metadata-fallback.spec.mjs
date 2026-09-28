import { expect, test } from '../support/network-fixture.mjs'

const now = '2026-09-28T08:00:00.000Z'
const id = 'fixture0001'

async function seed(page, overrides = {}, theme = 'light') {
  await page.clock.setFixedTime(new Date(now))
  await page.route('**/config.local.js', route => route.fulfill({
    contentType: 'application/javascript', body: 'window.EDENIA_CONFIG = { youtubeApiKey: "fixture-key", accountFeaturesRollout: "internal" }'
  }))
  await page.goto('/')
  await page.evaluate(({ now, id, overrides, theme }) => {
    const s = window.defaultState(4, [], theme, [], 'en')
    s.config.ankiEnabled = false
    Object.assign(s.onboarding, { introSeenAt: now, setupCompleted: true, setupCompletedAt: now, walkthroughCompleted: true, walkthroughCompletedAt: now })
    s.videos = { [id]: { id, title: '', thumbnail: '', channelTitle: '', channelId: 'manual-youtube',
      publishedAt: null, duration: 0, metadataFetchedAt: now, status: 'partial', favorite: true,
      resumeAtSeconds: 42, watchProgress: [{ seconds: 42, watchedAt: now }], watchProgressTracked: true,
      ...overrides } }
    localStorage.setItem('edenia_v1', JSON.stringify(s))
  }, { now, id, overrides, theme })
  await page.reload()
  await expect(page.locator('#mainApp')).not.toHaveClass(/hidden/)
  await page.locator('.channel-shelf').first().scrollIntoViewIfNeeded()
}

for (const theme of ['light', 'dark']) {
  test(`missing details remain usable in ${theme} theme`, async ({ page }) => {
    await seed(page, {}, theme)
    const card = page.locator(`.video-card[data-video-id="${id}"]`).first()
    await expect(card.locator('.card-title')).toHaveText('Saved YouTube video (fixture0001)')
    await expect(card.locator('.video-thumbnail-placeholder')).toBeVisible()
    await expect(card.locator('img')).toHaveCount(0)
    await expect(card.locator('.pub-ago')).toHaveCount(0)
    await expect(card.locator('.dur-badge')).toHaveCount(0)
    await expect(card).not.toContainText(/NaN|\d{3}mo ago|Loading/i)
    const play = card.getByRole('button', { name: 'Saved YouTube video (fixture0001)', exact: true })
    await play.focus()
    if (await page.evaluate(() => matchMedia('(hover: hover) and (pointer: fine)').matches)) {
      await expect(card).toHaveClass(/is-previewing/)
    }
    await play.press('Enter')
    if (!(await page.locator(`iframe[src*="${id}"]`).count())) {
      await expect(card).toHaveClass(/is-previewing/)
      await play.press('Enter')
    }
    await expect(page.locator(`iframe[src*="${id}"]`)).toBeVisible()
    await expect(page.locator(`iframe[src*="${id}"]`)).toHaveAttribute('title', 'Saved YouTube video (fixture0001)')
    await page.keyboard.press('Escape')
    await card.locator('.favorite-btn').focus()
    await page.keyboard.press('Enter')
    await expect(card.locator('.favorite-btn')).toHaveAttribute('aria-pressed', 'false')
    await card.locator('.watch-later-btn').focus()
    await page.keyboard.press('Enter')
    await expect(card.locator('.watch-later-btn')).toHaveAttribute('aria-label', 'Remove from watch later')
    await card.locator('.more-btn').focus()
    await page.keyboard.press('Enter')
    await expect(page.getByRole('menu')).toBeVisible()
  })
}

test('unavailable details recover in place with saved progress and organization', async ({ page }) => {
  await seed(page, { metadataUnavailable: true, publishedAt: 'invalid', thumbnail: '  ' })
  const card = page.locator(`.video-card[data-video-id="${id}"]`).first()
  await expect(card.locator('.card-title')).toHaveText('YouTube details unavailable (fixture0001)')
  await expect(card.locator('.pub-ago')).toHaveCount(0)
  await expect(card.locator('.dur-badge')).toHaveCount(0)
  await expect(card.locator('.video-thumbnail-placeholder')).toBeVisible()
  await expect(page.locator('#nextStudyCard')).toContainText('YouTube details unavailable (fixture0001)')
  await page.route('**/youtube/v3/videos?**', route => route.fulfill({ json: { items: [{ id,
    snippet: { title: 'Recovered lesson', channelId: 'manual-youtube', channelTitle: 'Recovered channel', publishedAt: now,
      thumbnails: { high: { url: 'https://i.ytimg.com/recovered.jpg' } } },
    contentDetails: { duration: 'PT10M' }, player: { embedWidth: '1280', embedHeight: '720' }
  }] } }))
  await page.clock.setFixedTime(new Date(Date.parse(now) + 86_400_000))
  await page.evaluate(() => window.dispatchEvent(new Event('focus')))
  await expect(card.locator('.card-title')).toHaveText('Recovered lesson')
  await expect(card.locator('img')).toBeVisible()
  await expect(card.locator('.video-thumbnail-placeholder')).toBeHidden()
  await expect(card.locator('.dur-badge')).toHaveText('10:00')
  await expect(card.locator('.pub-ago')).toHaveText('yesterday')
  await expect(card.locator('.favorite-btn')).toHaveAttribute('aria-pressed', 'true')
  await expect(card).toHaveClass(/status-partial/)
  await expect(page.locator('#nextStudyCard')).toContainText('Continue at 00:00:42')
  await expect(page.locator('#nextStudyCard')).toContainText('Recovered lesson')
  expect(await page.evaluate(id => window.loadState().videos[id], id)).toMatchObject({
    favorite: true, status: 'partial', resumeAtSeconds: 42,
    watchProgress: [{ seconds: 42, watchedAt: now }], watchProgressTracked: true
  })
})

test('failed nonempty thumbnails show a placeholder without losing known details', async ({ page }) => {
  await page.route('https://i.ytimg.com/broken.jpg', route => route.fulfill({ contentType: 'image/jpeg', body: 'not an image' }))
  await seed(page, { title: 'Known lesson', thumbnail: 'https://i.ytimg.com/broken.jpg', publishedAt: now, duration: 120 })
  const card = page.locator(`.video-card[data-video-id="${id}"]`).first()
  await expect(card.locator('.video-thumbnail-placeholder')).toBeVisible()
  await expect(card.locator('img')).toBeHidden()
  await expect(card.locator('.card-title')).toHaveText('Known lesson')
  await expect(card.locator('.dur-badge')).toHaveText('2:00')
  await expect(card.locator('.pub-ago')).toHaveText('today')
})
