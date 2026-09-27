import { expect, test } from '../support/network-fixture.mjs'
import { initial, story, transition } from '../../src/features/pip-story/story.js'

async function seed(page, internal = true, actions = []) {
  await page.goto(internal ? '/?internal_test=1' : '/')
  await page.waitForFunction(() => typeof window.defaultState === 'function')
  await page.evaluate(({ internal, actions }) => {
    const state = window.defaultState(4, [], 'light', [], 'en')
    const date = '2026-07-20T04:00:00.000Z'
    state.config.ankiEnabled = false
    Object.assign(state.onboarding, { introSeenAt: date, setupCompleted: true, setupCompletedAt: date, walkthroughCompleted: true, walkthroughCompletedAt: date })
    if (actions.length) state.pipStory = { version: 1, actions, page: 0, choosing: true }
    localStorage.setItem(internal ? 'edenia_v1_internal_test' : 'edenia_v1', JSON.stringify(state))
  }, { internal, actions })
  await page.reload()
  await expect(page.locator('#mainApp')).toBeVisible()
  if (internal) await expect(page.locator('.pip-story')).toBeVisible()
}

test('public homepage keeps its town and never requests Pip assets', async ({ page }) => {
  const requests = []
  page.on('request', request => { if (/pip-story|images\/pip\//.test(request.url())) requests.push(request.url()) })
  await seed(page, false)
  await expect(page.locator('#cityMilestoneImage')).toBeVisible()
  await expect(page.locator('.pip-story')).toHaveCount(0)
  await expect(page.locator('#pipStoryStyles')).toHaveCount(0)
  expect(requests).toEqual([])
  expect(await page.locator('.city-image-wrap').getAttribute('data-pan-zoom-ready')).toBe('true')
})

test('reading, decisions, Back, notebook, restart, and reload stay in the story frame', async ({ page }) => {
  await seed(page)
  const appErrors = []
  page.on('pageerror', error => appErrors.push(error.message))
  const baseline = await page.evaluate(() => {
    const s = JSON.parse(localStorage.getItem('edenia_v1_internal_test'))
    return { activityLog: s.activityLog, cityProgress: s.cityProgress, videos: s.videos }
  })
  await expect(page.locator('#cityMilestoneImage')).toBeHidden()
  await page.getByRole('button', { name: 'Next →', exact: true }).press('Enter')
  const passage = await page.locator('.pip-copy').innerText()
  await page.reload()
  await expect(page.locator('.pip-copy')).toHaveText(passage)
  await page.getByRole('button', { name: 'Back in Pip’s story' }).click()
  await expect(page.locator('.pip-copy')).toContainText('seven days ago')
  await page.getByRole('button', { name: 'Notebook', exact: true }).click()
  await expect(page.locator('.pip-notebook')).toContainText('The big willow tree')
  await page.getByRole('button', { name: 'Restart story', exact: true }).click()
  await page.getByRole('button', { name: 'Start again', exact: true }).click()
  await expect(page.locator('.pip-story')).toHaveAttribute('data-scene', 'opening')
  const after = await page.evaluate(() => {
    const s = JSON.parse(localStorage.getItem('edenia_v1_internal_test'))
    return { activityLog: s.activityLog, cityProgress: s.cityProgress, videos: s.videos }
  })
  expect(after).toEqual(baseline)
  const first = await page.locator('.pip-story canvas').getAttribute('data-frame')
  await expect.poll(() => page.locator('.pip-story canvas').getAttribute('data-frame')).not.toBe(first)
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.waitForTimeout(150)
  const frozen = await page.locator('.pip-story canvas').getAttribute('data-frame')
  await page.waitForTimeout(200)
  expect(await page.locator('.pip-story canvas').getAttribute('data-frame')).toBe(frozen)
  expect(appErrors).toEqual([])
})

test('all choices remain reachable inside narrow and wide town rectangles', async ({ page }) => {
  let s = initial(), actions = []
  while (s.scene !== 's12') {
    const action = s.outcome ? 'next' : 0
    actions.push(action)
    s = action === 'next' ? transition(s, { type: 'continue' }) : transition(s, { choice: story(s).choices[action] })
  }
  await seed(page, true, actions)
  for (const width of [320, 390, 640, 641, 1440]) {
    await page.setViewportSize({ width, height: 900 })
    const host = await page.locator('.city-image-wrap').boundingBox()
    const panel = await page.locator('.pip-dialogue').boundingBox()
    expect(panel.x).toBeGreaterThanOrEqual(host.x)
    expect(panel.y).toBeGreaterThanOrEqual(host.y)
    expect(panel.y + panel.height).toBeLessThanOrEqual(host.y + host.height + 1)
    expect(panel.x + panel.width).toBeLessThanOrEqual(host.x + host.width + 1)
    const choices = page.locator('.pip-choice')
    await expect(choices).toHaveCount(4)
    await choices.last().scrollIntoViewIfNeeded()
    await expect(choices.last()).toBeInViewport()
  }
  await page.locator('.pip-choice').last().click()
  await expect(page.locator('.pip-story')).toHaveAttribute('data-outcome', 'true')
})

for (const [name, friend, route] of [['Moss', 1, 0], ['Tumble', 2, 1], ['independent', 0, 0]]) {
  test(`complete ${name} route through actual paged controls`, async ({ page }) => {
    test.setTimeout(120000)
    await seed(page)
    for (let steps = 0; steps < 400; steps++) {
      const root = page.locator('.pip-story')
      const scene = await root.getAttribute('data-scene')
      if (scene === 'ending') break
      const mode = await root.getAttribute('data-mode')
      if (mode === 'reading') await page.locator('.pip-next').click()
      else if (scene === 'departure' && name === 'independent') await page.getByRole('button', { name: 'Go by herself', exact: true }).click()
      else {
        const index = scene === 'willow' ? friend : scene === 's1' && name === 'independent' ? 2 : scene === 's5' ? route : 0
        await page.locator('.pip-choice').nth(index).click()
      }
    }
    await expect(page.locator('.pip-story')).toHaveAttribute('data-scene', 'ending')
    await page.getByRole('button', { name: 'Notebook', exact: true }).click()
    await expect(page.locator('.pip-notebook')).toContainText('Sent:')
    if (name === 'independent') await expect(page.locator('.pip-notebook')).toContainText('Pip is traveling by herself')
    await page.reload()
    await expect(page.locator('.pip-story')).toHaveAttribute('data-scene', 'ending')
  })
}
