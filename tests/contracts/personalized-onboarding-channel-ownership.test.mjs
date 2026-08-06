import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import {
  GLOBAL_ACTION_NAMES
} from '../../src/core/global-action-contract.js'
import {
  bindPersonalizedOnboardingActions
} from '../../src/features/onboarding/personalized-onboarding-actions.js'

const appSource = await readFile(
  new URL('../../src/app.js', import.meta.url),
  'utf8'
)
const analyticsSource = await readFile(
  new URL('../../analytics.js', import.meta.url),
  'utf8'
)
const moduleSource = await readFile(
  new URL(
    '../../src/features/onboarding/personalized-onboarding-actions.js',
    import.meta.url
  ),
  'utf8'
)

function getAttribute(tag, name) {
  return tag.match(
    new RegExp(`\\s${name}=(["'])([\\s\\S]*?)\\1`)
  )?.[2] ?? null
}

function getElements(source, tagName) {
  return [...source.matchAll(
    new RegExp(`(<${tagName}\\b[^>]*>)([\\s\\S]*?)<\\/${tagName}>`, 'g')
  )].map(match => ({
    content: match[2],
    tag: match[1]
  }))
}

function createChannelControl(catalogId) {
  const listeners = new Map()
  return {
    addEventListener(type, listener) {
      const callbacks = listeners.get(type) || []
      callbacks.push(listener)
      listeners.set(type, callbacks)
    },
    dataset: {
      catalogId,
      personalizedOnboardingAction: 'toggle-channel'
    },
    listeners
  }
}

const renderStart = appSource.indexOf(
  'function renderOnboardingChannelsStep(content) {'
)
const renderEnd = appSource.indexOf(
  '\nfunction selectOnboardingLanguage(',
  renderStart
)
assert.notEqual(renderStart, -1)
assert.notEqual(renderEnd, -1)
const renderSource = appSource.slice(renderStart, renderEnd)

test('channel choices retain exact hook, avatar, and ARIA markup', () => {
  const controls = getElements(renderSource, 'button')
  assert.equal(controls.length, 3)
  const channel = controls[0]

  assert.equal(getAttribute(channel.tag, 'type'), 'button')
  assert.equal(getAttribute(channel.tag, 'class'), 'onboarding-channel')
  assert.equal(
    getAttribute(channel.tag, 'data-catalog-id'),
    '${escHtml(channel.id)}'
  )
  assert.equal(
    getAttribute(
      channel.tag,
      'data-personalized-onboarding-action'
    ),
    'toggle-channel'
  )
  assert.equal(
    getAttribute(channel.tag, 'data-analytics-action'),
    'toggleOnboardingChannel'
  )
  assert.equal(getAttribute(channel.tag, 'aria-pressed'), '${selected}')
  assert.equal(getAttribute(channel.tag, 'onclick'), null)
  assert.equal(getAttribute(channel.tag, 'disabled'), null)

  assert.match(
    renderSource,
    /const avatarUrl = getCuratedChannelAvatarPath\(channel\.id\)\s*const avatarFallback = language\?\.icon \|\| channel\.name\.slice\(0, 2\)\.toUpperCase\(\)\s*const avatar = avatarUrl\s*\? `<img src="\$\{escHtml\(avatarUrl\)\}" alt="" loading="eager">`\s*: escHtml\(avatarFallback\)/
  )
  assert.match(
    channel.content,
    /<span class="onboarding-channel-avatar" aria-hidden="true">\$\{avatar\}<\/span>/
  )
  assert.match(
    channel.content,
    /<span class="onboarding-channel-name">\$\{escHtml\(channel\.name\)\}<\/span>/
  )
  assert.match(
    channel.content,
    /<span class="onboarding-channel-meta">\$\{escHtml\(t\(ONBOARDING_CHANNEL_STYLE_KEYS\[channel\.style\] \|\| channel\.style\)\)\}<\/span>/
  )
  assert.match(
    channel.content,
    /<span class="onboarding-channel-check" aria-hidden="true">✓<\/span>/
  )
})

test('recommendations preserve zero-to-six order and grid threshold', () => {
  const recommendationStart = appSource.indexOf(
    'function getRecommendedChannelCatalog(profile, limit = 6) {'
  )
  const recommendationEnd = appSource.indexOf(
    '\nfunction normalizeLoadedState(',
    recommendationStart
  )
  assert.notEqual(recommendationStart, -1)
  assert.notEqual(recommendationEnd, -1)
  const source = appSource.slice(recommendationStart, recommendationEnd)

  assert.match(
    source,
    /const normalizedLimit = Math\.max\(1, Math\.floor\(Number\(limit\) \|\| 6\)\)/
  )
  assert.match(
    source,
    /return \(matches\.length \? matches : fallbacks\)\.slice\(0, normalizedLimit\)/
  )
  assert.match(
    source,
    /for \(let index = 0; recommendations\.length < normalizedLimit; index \+= 1\) \{/
  )
  assert.match(
    source,
    /byLanguage\.forEach\(channels => \{\s*const channel = channels\[index\][\s\S]*?recommendations\.push\(channel\)/
  )
  assert.match(source, /return recommendations/)

  assert.match(
    renderSource,
    /const channelMarkup = recommendations\.length\s*\? recommendations\.map\(channel => \{[\s\S]*?\}\)\.join\(''\)\s*: `<div class="onboarding-empty">\$\{escHtml\(t\('onboarding\.channels\.none'\)\)\}<\/div>`/
  )
  assert.match(
    renderSource,
    /<div class="onboarding-channel-list\$\{recommendations\.length >= 4 \? ' onboarding-channel-list-grid' : ''\}">\$\{channelMarkup\}<\/div>/
  )
})

test('channel ownership forwards only the live catalog ID', () => {
  const control = createChannelControl('initial-channel')
  const calls = []
  const root = {
    querySelectorAll(selector) {
      assert.equal(selector, '[data-personalized-onboarding-action]')
      return [control]
    }
  }
  assert.equal(
    bindPersonalizedOnboardingActions(root, {
      selectLanguage() {
        assert.fail('Channel control must not select language')
      },
      continueFromLanguage() {
        assert.fail('Channel control must not continue language')
      },
      selectLevel() {
        assert.fail('Channel control must not select level')
      },
      setStep() {
        assert.fail('Channel control must not navigate steps')
      },
      toggleChannel(...args) {
        calls.push(args)
      },
      finish() {
        assert.fail('Channel choices must not finish onboarding')
      }
    }),
    1
  )
  control.dataset.catalogId = 'live-channel'

  let preventDefaultCalls = 0
  let stopPropagationCalls = 0
  const event = {
    preventDefault() {
      preventDefaultCalls += 1
    },
    stopPropagation() {
      stopPropagationCalls += 1
    }
  }
  assert.equal(control.listeners.get('click')[0](event), undefined)
  assert.deepEqual(calls, [['live-channel']])
  assert.equal(preventDefaultCalls, 0)
  assert.equal(stopPropagationCalls, 0)
})

test('first visit selects recommendations in order within the current allowance', () => {
  const start = appSource.indexOf(
    'function prepareOnboardingChannelSelections() {'
  )
  const end = appSource.indexOf(
    '\nfunction toggleOnboardingChannel(',
    start
  )
  assert.notEqual(start, -1)
  assert.notEqual(end, -1)
  const source = appSource.slice(start, end)

  assert.match(
    source,
    /if \(personalizedOnboardingState\.channelSelectionsInitialized\) return/
  )
  assert.match(
    source,
    /personalizedOnboardingState\.selectedChannelCatalogIds = getRecommendedChannelCatalog\(\{[\s\S]*?\}\)\.slice\(0, getOnboardingChannelSelectionLimit\(\)\)\.map\(channel => channel\.id\)/
  )
  assert.match(
    appSource,
    /const ONBOARDING_CHANNEL_SELECTION_LIMIT = STARTER_FEED_CHANNEL_LIMIT/
  )
  assert.match(
    source,
    /personalizedOnboardingState\.channelSelectionsInitialized = true/
  )
})

test('selection updates the live control while limit feedback returns early', () => {
  const start = appSource.indexOf(
    'function toggleOnboardingChannel(catalogId) {'
  )
  const end = appSource.indexOf(
    '\nfunction resolveCuratedChannelEntry(',
    start
  )
  assert.notEqual(start, -1)
  assert.notEqual(end, -1)
  const source = appSource.slice(start, end)
  const limitIndex = source.indexOf(
    'if (selectedIds.size >= selectionLimit)'
  )
  const toastIndex = source.indexOf(
    "showToast(t('onboarding.channels.limit'",
    limitIndex
  )
  const limitReturnIndex = source.indexOf('return', toastIndex)
  const selectionSyncIndex = source.indexOf(
    "control?.setAttribute('aria-pressed', String(selectedIds.has(catalogId)))"
  )
  assert.notEqual(limitIndex, -1)
  assert.ok(toastIndex > limitIndex)
  assert.ok(limitReturnIndex > toastIndex)
  assert.ok(selectionSyncIndex > limitReturnIndex)
  assert.match(
    source,
    /showToast\(t\('onboarding\.channels\.limit', \{ count: ONBOARDING_CHANNEL_SELECTION_LIMIT \}\), 'warn'\)/
  )
  assert.match(
    source,
    /const control = \[\.\.\.document\.querySelectorAll\('\.onboarding-channel'\)\]\s*\.find\(channel => channel\.dataset\.catalogId === catalogId\)\s*control\?\.setAttribute\('aria-pressed', String\(selectedIds\.has\(catalogId\)\)\)\s*syncOnboardingChoiceLayout\(\)/
  )
  assert.doesNotMatch(source, /renderPersonalizedOnboarding\(\)/)
})

test('removing and re-adding a channel moves it to the end', () => {
  const start = appSource.indexOf(
    'function toggleOnboardingChannel(catalogId) {'
  )
  const end = appSource.indexOf(
    '\nfunction resolveCuratedChannelEntry(',
    start
  )
  const source = appSource.slice(start, end)
  assert.match(
    source,
    /const selectedIds = new Set\(personalizedOnboardingState\.selectedChannelCatalogIds\)/
  )
  assert.match(
    source,
    /if \(selectedIds\.has\(catalogId\)\) selectedIds\.delete\(catalogId\)/
  )
  assert.match(source, /selectedIds\.add\(catalogId\)/)
  assert.match(
    source,
    /personalizedOnboardingState\.selectedChannelCatalogIds = \[\.\.\.selectedIds\]/
  )

  const selectedIds = new Set(['a', 'b', 'c'])
  selectedIds.delete('b')
  assert.deepEqual([...selectedIds], ['a', 'c'])
  selectedIds.add('b')
  assert.deepEqual([...selectedIds], ['a', 'c', 'b'])
})

test('applying-state no-op still reaches generic analytics for enabled cards', () => {
  const start = appSource.indexOf(
    'function toggleOnboardingChannel(catalogId) {'
  )
  const end = appSource.indexOf(
    '\nfunction resolveCuratedChannelEntry(',
    start
  )
  const source = appSource.slice(start, end)
  assert.match(
    source,
    /if \(!getCuratedChannelEntry\(catalogId\) \|\| personalizedOnboardingState\.isApplyingChannels\) return/
  )
  assert.match(
    moduleSource,
    /control\.addEventListener\('click', \(\) => \{\s*actions\.toggleChannel\(control\.dataset\.catalogId\)\s*\}\)/
  )
  assert.doesNotMatch(
    moduleSource,
    /\.preventDefault\(|\.stopPropagation\(|queueMicrotask|setTimeout/
  )
  assert.match(
    analyticsSource,
    /document\.addEventListener\('click', event => \{\s*const control = event\.target\.closest\('button, a'\);\s*if \(!control \|\| control\.disabled\) return;/
  )
})

test('central binder includes channel ownership with no remaining bridge', () => {
  const renderStart = appSource.indexOf(
    'function renderPersonalizedOnboarding() {'
  )
  const renderEnd = appSource.indexOf(
    '\nfunction renderOnboardingHeading(',
    renderStart
  )
  const centralSource = appSource.slice(renderStart, renderEnd)
  assert.match(
    centralSource,
    /bindPersonalizedOnboardingActions\(content,\s*\{\s*selectLanguage:\s*selectOnboardingLanguage,\s*continueFromLanguage:\s*continuePersonalizedOnboardingFromLanguage,\s*selectLevel:\s*selectOnboardingLevel,\s*setStep:\s*setPersonalizedOnboardingStep,\s*toggleChannel:\s*toggleOnboardingChannel,\s*finish:\s*finishPersonalizedOnboarding\s*\}\)/
  )

  assert.equal(GLOBAL_ACTION_NAMES.includes('toggleOnboardingChannel'), false)
  assert.equal(
    GLOBAL_ACTION_NAMES.includes('finishPersonalizedOnboarding'),
    false
  )
  const globalActionAudit =
    GLOBAL_ACTION_NAMES.join('\n') || 'global action bridge removed'
  assert.ok(globalActionAudit)
  assert.doesNotMatch(
    globalActionAudit,
    /(?:^|[\s,])toggleOnboardingChannel(?:[\s,]|$)/
  )
  assert.doesNotMatch(
    globalActionAudit,
    /(?:^|[\s,])finishPersonalizedOnboarding(?:[\s,]|$)/
  )
})
