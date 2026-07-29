import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import {
  GLOBAL_ACTION_NAMES
} from '../../src/core/global-action-contract.js'

const appSource = await readFile(
  new URL('../../src/app.js', import.meta.url),
  'utf8'
)
const analyticsSource = await readFile(
  new URL('../../analytics.js', import.meta.url),
  'utf8'
)

function getAttribute(tag, name) {
  return tag.match(
    new RegExp(`\\s${name}=(["'])([\\s\\S]*?)\\1`)
  )?.[2] ?? null
}

function getElements(source, tagName) {
  return [...source.matchAll(
    new RegExp(
      `(<${tagName}\\b[^>]*>)([\\s\\S]*?)<\\/${tagName}>`,
      'g'
    )
  )].map(match => ({
    content: match[2],
    tag: match[1]
  }))
}

function getOpeningTags(source, tagName) {
  return [...source.matchAll(
    new RegExp(`<${tagName}\\b[^>]*>`, 'g')
  )].map(match => match[0])
}

function hasClass(tag, className) {
  return String(getAttribute(tag, 'class') || '')
    .split(/\s+/)
    .includes(className)
}

function findSingle(items, predicate, description) {
  const matches = items.filter(predicate)
  assert.equal(matches.length, 1, `Expected one ${description}`)
  return matches[0]
}

function getFunctionSource(name, nextName) {
  const declaration = new RegExp(
    `(?:async\\s+)?function\\s+${name}\\s*\\(`
  ).exec(appSource)
  assert.ok(declaration, `Expected ${name}`)
  const end = appSource.indexOf(`\nfunction ${nextName}(`, declaration.index)
  assert.notEqual(end, -1, `Expected boundary after ${name}`)
  return appSource.slice(declaration.index, end)
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

function assertSourceOrder(source, values, label) {
  let previousIndex = -1
  for (const value of values) {
    const index = source.indexOf(value, previousIndex + 1)
    assert.ok(index > previousIndex, `${label}: ${value}`)
    previousIndex = index
  }
}

const shelfRenderSource = getFunctionSource(
  'renderChannelVideoGroups',
  'renderChannelShelfAvatar'
)
const syncSource = getFunctionSource(
  'syncVideoChannelShelfControls',
  'scrollVideoChannelShelf'
)
const scrollSource = getFunctionSource(
  'scrollVideoChannelShelf',
  'canReorderChannelShelves'
)
const feedSource = getFunctionSource('renderFeed', 'toggleWatchedSection')

const scrollButtons = getElements(shelfRenderSource, 'button').filter(
  element => hasClass(element.tag, 'channel-shelf-scroll')
)
const shelfTrack = findSingle(
  getOpeningTags(shelfRenderSource, 'div'),
  tag => hasClass(tag, 'channel-shelf-track'),
  'channel shelf track'
)

test('generated shelf controls retain exact direction, ARIA, metadata, and order', () => {
  const expectedButtons = [
    {
      analyticsAction: 'scrollVideoChannelShelf',
      ariaLabel:
        "${escHtml(t('videos.channel.previousLabel', { channel: group.title }))}",
      className:
        'channel-shelf-scroll channel-shelf-scroll-prev',
      content: '<span aria-hidden="true">‹</span>',
      direction: '-1',
      ownershipAction: 'scroll'
    },
    {
      analyticsAction: 'scrollVideoChannelShelf',
      ariaLabel:
        "${escHtml(t('videos.channel.nextLabel', { channel: group.title }))}",
      className:
        'channel-shelf-scroll channel-shelf-scroll-next',
      content: '<span aria-hidden="true">›</span>',
      direction: '1',
      ownershipAction: 'scroll'
    }
  ]

  assert.equal(scrollButtons.length, expectedButtons.length)
  expectedButtons.forEach((expected, index) => {
    const control = scrollButtons[index]
    assert.equal(getAttribute(control.tag, 'type'), 'button')
    assert.equal(getAttribute(control.tag, 'class'), expected.className)
    assert.equal(
      getAttribute(control.tag, 'data-shelf-direction'),
      expected.direction
    )
    assert.equal(
      getAttribute(control.tag, 'data-analytics-action'),
      expected.analyticsAction
    )
    assert.equal(
      getAttribute(control.tag, 'data-channel-shelf-scroll-action'),
      expected.ownershipAction
    )
    assert.equal(getAttribute(control.tag, 'onclick'), null)
    assert.equal(
      getAttribute(control.tag, 'aria-controls'),
      '${trackId}'
    )
    assert.equal(
      getAttribute(control.tag, 'aria-label'),
      expected.ariaLabel
    )
    assert.equal(control.content.trim(), expected.content)
  })

  assert.equal(getAttribute(shelfTrack, 'class'), 'channel-shelf-track')
  assert.equal(getAttribute(shelfTrack, 'id'), '${trackId}')
  assert.equal(getAttribute(shelfTrack, 'tabindex'), '0')
  assert.equal(
    getAttribute(shelfTrack, 'data-analytics-action'),
    'syncVideoChannelShelfControls'
  )
  assert.equal(
    getAttribute(shelfTrack, 'data-channel-shelf-scroll-action'),
    'sync'
  )
  assert.equal(
    getAttribute(shelfTrack, 'aria-label'),
    "${escHtml(t('videos.channel.shelfLabel', { channel: group.title }))}"
  )
  assert.equal(
    getAttribute(shelfTrack, 'onscroll'),
    null
  )

  assertSourceOrder(
    shelfRenderSource,
    [
      '<div class="channel-shelf-controls">',
      scrollButtons[0].tag,
      scrollButtons[1].tag,
      '</header>',
      shelfTrack
    ],
    'shelf navigation controls'
  )
})

test('explicit metadata preserves pre-migration fallback identities and generic collection', () => {
  const expectedEvents = {
    scrollVideoChannelShelf: 'scroll_video_channel_shelf_clicked',
    syncVideoChannelShelfControls:
      'sync_video_channel_shelf_controls_clicked'
  }
  for (const [action, eventName] of Object.entries(expectedEvents)) {
    assert.equal(normalizeClickEventName(action), eventName)
  }

  for (const control of scrollButtons) {
    assert.equal(
      getAttribute(control.tag, 'data-analytics-action'),
      'scrollVideoChannelShelf'
    )
    assert.equal(getAttribute(control.tag, 'onclick'), null)
  }
  assert.equal(
    getAttribute(shelfTrack, 'data-analytics-action'),
    'syncVideoChannelShelfControls'
  )
  assert.equal(getAttribute(shelfTrack, 'onscroll'), null)

  assert.match(
    analyticsSource,
    /const handlerName = inlineHandler\.match\(\/\^\\s\*\(\[a-zA-Z_\$\]\[\\w\$\]\*\)\\s\*\\\(\/\)\?\.\[1\] \|\| '';/
  )
  assert.match(
    analyticsSource,
    /const action = control\.dataset\.analyticsAction\s*\|\| control\.dataset\.i18n/
  )
  assert.match(
    analyticsSource,
    /const control = event\.target\.closest\('button, a'\);\s*if \(!control \|\| control\.disabled\) return;/
  )
  assert.equal(shelfTrack.startsWith('<button'), false)
  assert.equal(shelfTrack.startsWith('<a'), false)
  assert.doesNotMatch(
    analyticsSource,
    /document\.addEventListener\(['"]scroll['"]/
  )
  assert.doesNotMatch(
    scrollSource,
    /\.preventDefault\(|\.stopPropagation\(/
  )
  assert.doesNotMatch(
    syncSource,
    /\.preventDefault\(|\.stopPropagation\(/
  )
})

test('scrolling retains live control lookup, four-card movement, and reduced motion', () => {
  assertSourceOrder(
    scrollSource,
    [
      "const shelf = button?.closest?.('.channel-shelf')",
      "const track = shelf?.querySelector('.channel-shelf-track')",
      'if (!track) return',
      "const firstSlot = track.querySelector('.channel-shelf-slot')",
      'const slotWidth = firstSlot?.getBoundingClientRect().width || 0',
      'const gap = Number.parseFloat(getComputedStyle(track).columnGap || getComputedStyle(track).gap) || 0',
      'const cardPitch = slotWidth + gap',
      'const currentCardIndex = cardPitch > 0 ? Math.round(track.scrollLeft / cardPitch) : 0',
      'const targetCardIndex = Math.max(0, currentCardIndex + (direction < 0 ? -4 : 4))',
      'const maxScrollLeft = Math.max(0, track.scrollWidth - track.clientWidth)',
      'const targetLeft = cardPitch > 0',
      '? Math.min(targetCardIndex * cardPitch, maxScrollLeft)',
      ': clampNumber(track.scrollLeft + ((direction < 0 ? -1 : 1) * track.clientWidth), 0, maxScrollLeft)',
      'const reduceMotion = prefersReducedMotion()',
      'track.scrollTo({',
      'left: targetLeft,',
      "behavior: reduceMotion ? 'auto' : 'smooth'"
    ],
    'channel shelf scroll'
  )
})

test('scroll sync retains preview handling before edge-button state', () => {
  assertSourceOrder(
    syncSource,
    [
      'if (!track) return',
      'if (activeVideoShelfPreview && track.contains(activeVideoShelfPreview))',
      'const isPinnedPreview = activeVideoShelfPreview.dataset.videoId === activeVideoWatchReminderId',
      '|| activeVideoShelfPreview.dataset.videoId === activeNextStudyFocusVideoId',
      'if (isPinnedPreview)',
      'positionVideoShelfPreview(activeVideoShelfPreview)',
      'else',
      'closeVideoShelfPreview(activeVideoShelfPreview, true)',
      "const shelf = track.closest('.channel-shelf')",
      'const atStart = track.scrollLeft <= 2',
      'const atEnd = track.scrollLeft + track.clientWidth >= track.scrollWidth - 2',
      "const previousButton = shelf?.querySelector('[data-shelf-direction=\"-1\"]')",
      "const nextButton = shelf?.querySelector('[data-shelf-direction=\"1\"]')",
      'if (previousButton) previousButton.disabled = atStart',
      'if (nextButton) nextButton.disabled = atEnd'
    ],
    'channel shelf sync'
  )
})

test('active-grid replacement retains generated controls and deferred initial sync', () => {
  assert.match(
    shelfRenderSource,
    /return groupActiveVideosByChannel\([\s\S]*?\)\.map\(\(group, index\) => \{/
  )
  assert.match(
    shelfRenderSource,
    /const trackId = `channelShelfTrack\$\{index\}`/
  )
  assert.match(
    shelfRenderSource,
    /data-shelf-direction="-1"[\s\S]*?data-channel-shelf-scroll-action="scroll"[\s\S]*?data-shelf-direction="1"[\s\S]*?data-channel-shelf-scroll-action="scroll"[\s\S]*?id="\$\{trackId\}"[\s\S]*?data-channel-shelf-scroll-action="sync"/
  )

  assertSourceOrder(
    feedSource,
    [
      'grid.innerHTML = renderChannelVideoGroups(',
      'bindChannelShelfScrollActions(grid, {',
      'bindChannelRemoveActions(grid, {',
      'bindVideoSetAsideActions(grid, {',
      'requestAnimationFrame(() => {',
      "document.querySelectorAll('.channel-shelf-track').forEach(syncVideoChannelShelfControls)"
    ],
    'active-grid shelf replacement'
  )
})

test('scroll and sync handlers leave inline and legacy ownership', () => {
  const globalActionAudit =
    GLOBAL_ACTION_NAMES.join('\n') || 'global action bridge removed'
  assert.ok(globalActionAudit)

  for (const actionName of [
    'scrollVideoChannelShelf',
    'syncVideoChannelShelfControls'
  ]) {
    assert.equal(GLOBAL_ACTION_NAMES.includes(actionName), false)
    assert.doesNotMatch(
      globalActionAudit,
      new RegExp(`(?:^|[\\s,])${actionName}(?:[\\s,]|$)`)
    )
  }

  assert.equal(
    [...shelfRenderSource.matchAll(
      /onclick="scrollVideoChannelShelf\(this, (?:-1|1)\)"/g
    )].length,
    0
  )
  assert.equal(
    [...shelfRenderSource.matchAll(
      /onscroll="syncVideoChannelShelfControls\(this\)"/g
    )].length,
    0
  )
})
