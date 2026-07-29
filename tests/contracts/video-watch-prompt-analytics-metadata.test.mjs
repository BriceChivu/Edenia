import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const appSource = await readFile(
  new URL('../../src/app.js', import.meta.url),
  'utf8'
)
const analyticsSource = await readFile(
  new URL('../../analytics.js', import.meta.url),
  'utf8'
)

const markupStart = appSource.indexOf('function getVideoWatchReminderMarkup(')
const markupEnd = appSource.indexOf(
  'function finalizeRenderedVideoWatchPrompt(',
  markupStart
)

assert.notEqual(markupStart, -1, 'Expected getVideoWatchReminderMarkup')
assert.notEqual(markupEnd, -1, 'Expected the watch-prompt markup boundary')

const markupSource = appSource.slice(markupStart, markupEnd)

function getButtonElements(source) {
  return [...source.matchAll(/<button\b[^>]*>[\s\S]*?<\/button>/g)]
    .map(match => match[0])
}

function getOpeningTag(element) {
  return element.match(/^<button\b[^>]*>/)?.[0] ?? ''
}

function getAttribute(tag, name) {
  return tag.match(new RegExp(`\\s${name}="([^"]*)"`))?.[1] ?? null
}

function findSingleButton(className) {
  const matches = getButtonElements(markupSource)
    .filter(element => String(getAttribute(getOpeningTag(element), 'class'))
      .startsWith(className))
  assert.equal(matches.length, 1, `Expected one ${className} button`)
  return matches[0]
}

function normalizeClickEventName(action) {
  return `${String(action || '')
    .trim()
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .replace(/[^a-zA-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .toLowerCase()
    .slice(0, 80)}_clicked`
}

test('generated watch-prompt controls retain exact markup and analytics identities', () => {
  const expectedControls = [
    {
      className: 'video-watch-reminder-favorite',
      exactClass: 'video-watch-reminder-favorite${favoriteActive}',
      analyticsAction: 'favoriteVideoFromWatchPrompt',
      eventName: 'favorite_video_from_watch_prompt_clicked',
      onclick: 'favoriteVideoFromWatchPrompt(event, this.dataset.videoId)',
      content: "${renderVideoActionIcon('favorite')}",
      ariaPressed: '${String(isFavorite)}',
      ariaLabel: '${escHtml(favoriteLabel)}',
      title: '${escHtml(favoriteLabel)}'
    },
    {
      className: 'video-watch-reminder-mark',
      exactClass: 'video-watch-reminder-mark',
      analyticsAction: 'confirmVideoWatchPrompt',
      eventName: 'confirm_video_watch_prompt_clicked',
      onclick: 'confirmVideoWatchPrompt(event, this.dataset.videoId, ${String(rewatch)}, ${String(player)})',
      content: "${escHtml(t('videoReminder.yes'))}",
      ariaPressed: null,
      ariaLabel: null,
      title: null
    },
    {
      className: 'video-watch-reminder-later',
      exactClass: 'video-watch-reminder-later',
      analyticsAction: 'dismissVideoWatchPrompt',
      eventName: 'dismiss_video_watch_prompt_clicked',
      onclick: 'dismissVideoWatchPrompt(event, this.dataset.videoId, ${String(player)})',
      content: "${escHtml(t('videoReminder.notYet'))}",
      ariaPressed: null,
      ariaLabel: null,
      title: null
    }
  ]

  for (const expected of expectedControls) {
    const element = findSingleButton(expected.className)
    const tag = getOpeningTag(element)

    assert.equal(getAttribute(tag, 'type'), 'button')
    assert.equal(getAttribute(tag, 'class'), expected.exactClass)
    assert.equal(getAttribute(tag, 'data-video-id'), '${safeVideoId}')
    assert.equal(getAttribute(tag, 'onclick'), expected.onclick)
    assert.equal(
      getAttribute(tag, 'data-analytics-action'),
      expected.analyticsAction
    )
    assert.equal(
      normalizeClickEventName(getAttribute(tag, 'data-analytics-action')),
      expected.eventName
    )
    assert.equal(getAttribute(tag, 'aria-pressed'), expected.ariaPressed)
    assert.equal(getAttribute(tag, 'aria-label'), expected.ariaLabel)
    assert.equal(getAttribute(tag, 'title'), expected.title)
    assert.ok(
      element.includes(expected.content),
      `Expected localized/icon content for ${expected.className}`
    )
  }
})

test('rewatch prompts continue to omit the Favorite action only', () => {
  assert.match(
    markupSource,
    /\$\{rewatch \? '' : `\s*<button\b[\s\S]*?class="video-watch-reminder-favorite\$\{favoriteActive\}"[\s\S]*?<\/button>\s*`\}/
  )

  const favoriteBranchEnd = markupSource.indexOf('`}', markupSource.indexOf(
    'class="video-watch-reminder-favorite'
  ))
  const confirmIndex = markupSource.indexOf('class="video-watch-reminder-mark"')
  const dismissIndex = markupSource.indexOf('class="video-watch-reminder-later"')

  assert.ok(favoriteBranchEnd > -1)
  assert.ok(confirmIndex > favoriteBranchEnd)
  assert.ok(dismissIndex > favoriteBranchEnd)
})

test('watch-prompt handlers suppress bubbling before performing action work', () => {
  const expectedHandlerStarts = [
    /function favoriteVideoFromWatchPrompt\(event, videoId\) \{\s*event\?\.preventDefault\(\)\s*event\?\.stopPropagation\(\)\s*const state = loadState\(\)/,
    /function confirmVideoWatchPrompt\(event, videoId, rewatch = false, playerPrompt = false\) \{\s*event\?\.preventDefault\(\)\s*event\?\.stopPropagation\(\)\s*const targetVideoId = String\(videoId \?\? ''\)/,
    /function dismissVideoWatchPrompt\(event, videoId, playerPrompt = false\) \{\s*event\?\.preventDefault\(\)\s*event\?\.stopPropagation\(\)\s*const targetVideoId = String\(videoId \?\? ''\)/
  ]

  for (const pattern of expectedHandlerStarts) {
    assert.match(appSource, pattern)
  }

  assert.match(
    analyticsSource,
    /document\.addEventListener\('click', event => \{\s*const control = event\.target\.closest\('button, a'\)/
  )
  assert.match(
    analyticsSource,
    /capture\(`\$\{eventName\}_clicked`, \{/
  )
})
