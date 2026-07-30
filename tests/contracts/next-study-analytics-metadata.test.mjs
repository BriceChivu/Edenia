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

const renderStart = appSource.indexOf('function renderNextStudy(')
const renderEnd = appSource.indexOf('\nfunction renderAnkiStatus(', renderStart)
assert.notEqual(renderStart, -1)
assert.notEqual(renderEnd, -1)
const renderSource = appSource.slice(renderStart, renderEnd)

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

function hasClass(tag, className) {
  return String(getAttribute(tag, 'class') || '')
    .split(/\s+/)
    .includes(className)
}

function findSingleButton(predicate, description) {
  const matches = getButtonElements(renderSource)
    .filter(element => predicate(getOpeningTag(element), element))
  assert.equal(matches.length, 1, `Expected one ${description}`)
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

test('Next Study variants retain every generated control and exact branch markup', () => {
  assert.equal(getButtonElements(renderSource).length, 7)
  assert.match(renderSource, /const actions = isInProgress\s*\? `/)
  assert.match(renderSource, /`\s*: isRewatch\s*\? `/)
  assert.match(renderSource, /`\s*: `/)

  const expectedControls = [
    {
      className: 'next-study-set-aside',
      analyticsAction: 'requestVideoSetAside',
      nextStudyAction: null,
      inlineHandler: null,
      content: "${escHtml(t('videos.card.setAside'))}",
      ariaLabel: null
    },
    {
      className: 'next-study-continue',
      analyticsAction: 'openNextStudyVideoPlayer',
      nextStudyAction: 'open',
      inlineHandler: null,
      content: '${escHtml(cta)}',
      ariaLabel: '${escHtml(cta)}: ${escHtml(nextVideo.title)}'
    },
    {
      className: 'next-study-reset',
      analyticsAction: 'toggleVideoFavorite',
      nextStudyAction: 'toggle-favorite',
      inlineHandler: null,
      content: "${escHtml(t('nextStudy.removeFavorite'))}",
      ariaLabel: null
    },
    {
      className: 'next-study-watch',
      analyticsAction: 'openNextStudyVideoPlayer',
      nextStudyAction: 'open',
      inlineHandler: null,
      content: "${escHtml(t('nextStudy.watchAgain'))}",
      ariaLabel: null
    },
    {
      className: 'next-study-watch',
      analyticsAction: 'openNextStudyVideoPlayer',
      nextStudyAction: 'open',
      inlineHandler: null,
      content: "${escHtml(t('nextStudy.watch'))}",
      ariaLabel: null
    },
    {
      className: 'next-study-panel-focus',
      analyticsAction: 'focusNextStudyVideoCard',
      nextStudyAction: 'focus',
      inlineHandler: null,
      content: '',
      ariaLabel: '${escHtml(panelLabel)}'
    },
    {
      className: 'next-study-mobile-link',
      analyticsAction: 'openNextStudyVideoPlayer',
      nextStudyAction: 'open',
      inlineHandler: null,
      content: '',
      ariaLabel: '${escHtml(cta)}: ${escHtml(nextVideo.title)}'
    }
  ]

  for (const expected of expectedControls) {
    const element = findSingleButton(
      (tag, candidate) => (
        hasClass(tag, expected.className)
        && candidate.slice(tag.length, -'</button>'.length).trim() === expected.content
      ),
      expected.className
    )
    const tag = getOpeningTag(element)

    assert.equal(getAttribute(tag, 'type'), 'button')
    assert.equal(getAttribute(tag, 'data-video-id'), '${safeVideoId}')
    assert.equal(getAttribute(tag, 'onclick'), expected.inlineHandler)
    assert.equal(
      getAttribute(tag, 'data-next-study-action'),
      expected.nextStudyAction
    )
    assert.equal(
      getAttribute(tag, 'data-analytics-action'),
      expected.analyticsAction
    )
    assert.equal(getAttribute(tag, 'aria-label'), expected.ariaLabel)
  }
})

test('Next Study Set aside keeps its existing module ownership and surface', () => {
  const element = findSingleButton(
    tag => hasClass(tag, 'next-study-set-aside'),
    'Next Study Set aside control'
  )
  const tag = getOpeningTag(element)

  assert.ok(hasClass(tag, 'next-study-cta'))
  assert.equal(getAttribute(tag, 'data-video-set-aside-action'), 'request')
  assert.equal(
    getAttribute(tag, 'data-video-set-aside-surface'),
    'continue_watching'
  )
  assert.equal(getAttribute(tag, 'data-analytics-action'), 'requestVideoSetAside')
  assert.equal(getAttribute(tag, 'onclick'), null)

  const replacementIndex = renderSource.indexOf('container.innerHTML =')
  const bindingIndex = renderSource.indexOf('bindVideoSetAsideActions(container,')
  const returnIndex = renderSource.lastIndexOf('return nextVideo')
  assert.ok(replacementIndex >= 0)
  assert.ok(bindingIndex > replacementIndex)
  assert.ok(returnIndex > bindingIndex)
})

test('Next Study open controls retain explicit identity but suppress generic clicks', () => {
  const openControls = getButtonElements(renderSource).filter(element => {
    const tag = getOpeningTag(element)
    return getAttribute(tag, 'data-analytics-action') === 'openNextStudyVideoPlayer'
  })
  assert.equal(openControls.length, 4)

  for (const element of openControls) {
    const tag = getOpeningTag(element)
    assert.equal(getAttribute(tag, 'data-next-study-action'), 'open')
    assert.equal(getAttribute(tag, 'onclick'), null)
    assert.equal(
      normalizeClickEventName(getAttribute(tag, 'data-analytics-action')),
      'open_next_study_video_player_clicked'
    )
  }

  const callbackStart = appSource.indexOf('function openNextStudyVideoPlayer(')
  const callbackEnd = appSource.indexOf(
    '\nfunction focusNextStudyVideoCard(',
    callbackStart
  )
  assert.notEqual(callbackStart, -1)
  assert.notEqual(callbackEnd, -1)
  const callbackSource = appSource.slice(callbackStart, callbackEnd)
  const preventIndex = callbackSource.indexOf('event?.preventDefault()')
  const stopIndex = callbackSource.indexOf('event?.stopPropagation()')
  const openIndex = callbackSource.indexOf('openVideoPlayer(targetVideoId)')
  const returnIndex = callbackSource.lastIndexOf('return false')

  assert.ok(preventIndex >= 0)
  assert.ok(stopIndex > preventIndex)
  assert.ok(openIndex > stopIndex)
  assert.ok(returnIndex > openIndex)
  assert.match(
    analyticsSource,
    /document\.addEventListener\('click', event => \{[\s\S]*capture\(`\$\{eventName\}_clicked`/
  )
})

test('Next Study panel focus retains its exact latent generic identity', () => {
  const element = findSingleButton(
    tag => hasClass(tag, 'next-study-panel-focus'),
    'Next Study panel focus control'
  )
  const tag = getOpeningTag(element)

  assert.equal(getAttribute(tag, 'type'), 'button')
  assert.equal(getAttribute(tag, 'data-video-id'), '${safeVideoId}')
  assert.equal(getAttribute(tag, 'data-next-study-action'), 'focus')
  assert.equal(getAttribute(tag, 'onclick'), null)
  assert.equal(
    getAttribute(tag, 'data-analytics-action'),
    'focusNextStudyVideoCard'
  )
  assert.equal(
    normalizeClickEventName(getAttribute(tag, 'data-analytics-action')),
    'focus_next_study_video_card_clicked'
  )
  assert.equal(getAttribute(tag, 'aria-label'), '${escHtml(panelLabel)}')
})

test('Next Study Remove favorite retains identity, surface, and event ordering context', () => {
  const element = findSingleButton(
    tag => hasClass(tag, 'next-study-reset'),
    'Next Study Remove favorite control'
  )
  const tag = getOpeningTag(element)

  assert.equal(
    getAttribute(tag, 'data-next-study-action'),
    'toggle-favorite'
  )
  assert.equal(
    getAttribute(tag, 'data-next-study-surface'),
    'next_study'
  )
  assert.equal(getAttribute(tag, 'onclick'), null)
  assert.equal(
    getAttribute(tag, 'data-analytics-action'),
    'toggleVideoFavorite'
  )
  assert.equal(
    normalizeClickEventName(getAttribute(tag, 'data-analytics-action')),
    'toggle_video_favorite_clicked'
  )

  const callbackStart = appSource.indexOf('function toggleVideoFavorite(')
  const callbackEnd = appSource.indexOf(
    '\nfunction syncVideoWatchPromptFavoriteAction(',
    callbackStart
  )
  assert.notEqual(callbackStart, -1)
  assert.notEqual(callbackEnd, -1)
  const callbackSource = appSource.slice(callbackStart, callbackEnd)
  const saveIndex = callbackSource.indexOf('saveState(s)')
  const explicitEventIndex = callbackSource.indexOf(
    'trackVideoFavoriteChanged(s, video, isFavoriteVideo(beforeVideo), options.surface)'
  )
  const renderIndex = callbackSource.indexOf('renderAll(s)')

  assert.ok(saveIndex >= 0)
  assert.ok(explicitEventIndex > saveIndex)
  assert.ok(renderIndex > explicitEventIndex)
  assert.doesNotMatch(callbackSource, /preventDefault|stopPropagation/)
  assert.match(
    analyticsSource,
    /document\.addEventListener\('click', event => \{[\s\S]*capture\(`\$\{eventName\}_clicked`/
  )
})
