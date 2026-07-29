import assert from 'node:assert/strict'
import { readdir, readFile } from 'node:fs/promises'
import { extname } from 'node:path'
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

const markupStart = appSource.indexOf(
  'function getVideoWatchReminderMarkup('
)
const markupEnd = appSource.indexOf(
  'function finalizeRenderedVideoWatchPrompt(',
  markupStart
)

assert.notEqual(markupStart, -1, 'Expected getVideoWatchReminderMarkup')
assert.notEqual(markupEnd, -1, 'Expected the watch-prompt markup boundary')

const markupSource = appSource.slice(markupStart, markupEnd)
const migratedActionNames = [
  'favoriteVideoFromWatchPrompt',
  'confirmVideoWatchPrompt',
  'dismissVideoWatchPrompt'
]

function getElements(source, tagName) {
  return [...source.matchAll(
    new RegExp(`(<${tagName}\\b[^>]*>)([\\s\\S]*?)<\\/${tagName}>`, 'g')
  )].map(match => ({
    content: match[2],
    tag: match[1]
  }))
}

function getOpeningTags(source, tagName) {
  return [...source.matchAll(new RegExp(`<${tagName}\\b[^>]*>`, 'g'))]
    .map(match => match[0])
}

function getAttribute(tag, name) {
  return tag.match(
    new RegExp(`\\s${name}=(["'])([\\s\\S]*?)\\1`)
  )?.[2] ?? null
}

function findSingle(items, predicate, description) {
  const matches = items.filter(predicate)
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

function getVideoWatchPromptBindings(source) {
  return [...source.matchAll(
    /bindVideoWatchPromptActions\((\w+),\s*\{([\s\S]*?)\}\)/g
  )].map(match => ({
    actions: Object.fromEntries(
      [...match[2].matchAll(/\b(\w+):\s*(\w+)/g)]
        .map(binding => [binding[1], binding[2]])
    ),
    root: match[1]
  }))
}

async function getJavaScriptFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true })
  const nestedFiles = await Promise.all(entries.map(entry => {
    const url = new URL(
      `${entry.name}${entry.isDirectory() ? '/' : ''}`,
      directory
    )
    if (entry.isDirectory()) return getJavaScriptFiles(url)
    return extname(entry.name) === '.js' ? [url] : []
  }))
  return nestedFiles.flat()
}

test('generated watch prompt retains its exact dialog identity and copy', () => {
  const prompt = findSingle(
    getOpeningTags(markupSource, 'div'),
    tag => String(getAttribute(tag, 'class') || '')
      .startsWith('video-watch-reminder-popover'),
    'watch-prompt dialog'
  )

  assert.equal(
    getAttribute(prompt, 'class'),
    "video-watch-reminder-popover${global ? ' is-global' : ''}${player ? ' is-player' : ''}"
  )
  assert.equal(getAttribute(prompt, 'data-video-id'), '${safeVideoId}')
  assert.equal(
    getAttribute(prompt, 'data-player-prompt'),
    '${String(player)}'
  )
  assert.equal(getAttribute(prompt, 'data-rewatch'), null)
  assert.equal(getAttribute(prompt, 'role'), 'dialog')
  assert.equal(getAttribute(prompt, 'aria-live'), 'polite')
  assert.equal(getAttribute(prompt, 'aria-labelledby'), '${promptId}')

  assert.match(
    markupSource,
    /const promptId = `videoWatchPrompt-\$\{safeVideoId\}-\$\{player \? 'player' : global \? 'global' : 'card'\}`/
  )

  const icon = findSingle(
    getElements(markupSource, 'span'),
    element => (
      getAttribute(element.tag, 'class')
        === 'video-watch-reminder-icon'
    ),
    'watch-prompt status icon'
  )
  assert.equal(getAttribute(icon.tag, 'aria-hidden'), 'true')
  assert.equal(icon.content.trim(), '✓')

  const question = findSingle(
    getElements(markupSource, 'span'),
    element => getAttribute(element.tag, 'id') === '${promptId}',
    'watch-prompt question'
  )
  assert.equal(
    question.content.trim(),
    "${escHtml(t(rewatch ? 'videoReminder.rewatchQuestion' : 'videoReminder.question'))}"
  )
})

test('generated watch-prompt controls retain exact module ownership and analytics metadata', () => {
  const expectedControls = [
    {
      action: 'favorite',
      analyticsAction: 'favoriteVideoFromWatchPrompt',
      ariaLabel: '${escHtml(favoriteLabel)}',
      ariaPressed: '${String(isFavorite)}',
      className: 'video-watch-reminder-favorite${favoriteActive}',
      content: "${renderVideoActionIcon('favorite')}",
      eventName: 'favorite_video_from_watch_prompt_clicked',
      playerPrompt: null,
      rewatch: null,
      title: '${escHtml(favoriteLabel)}'
    },
    {
      action: 'confirm',
      analyticsAction: 'confirmVideoWatchPrompt',
      ariaLabel: null,
      ariaPressed: null,
      className: 'video-watch-reminder-mark',
      content: "${escHtml(t('videoReminder.yes'))}",
      eventName: 'confirm_video_watch_prompt_clicked',
      playerPrompt: '${String(player)}',
      rewatch: '${String(rewatch)}',
      title: null
    },
    {
      action: 'dismiss',
      analyticsAction: 'dismissVideoWatchPrompt',
      ariaLabel: null,
      ariaPressed: null,
      className: 'video-watch-reminder-later',
      content: "${escHtml(t('videoReminder.notYet'))}",
      eventName: 'dismiss_video_watch_prompt_clicked',
      playerPrompt: '${String(player)}',
      rewatch: null,
      title: null
    }
  ]

  const controls = getElements(markupSource, 'button').filter(element => (
    getAttribute(element.tag, 'data-video-watch-prompt-action') !== null
  ))
  assert.equal(controls.length, expectedControls.length)

  expectedControls.forEach((expected, index) => {
    const control = controls[index]
    assert.equal(getAttribute(control.tag, 'type'), 'button')
    assert.equal(getAttribute(control.tag, 'class'), expected.className)
    assert.equal(
      getAttribute(control.tag, 'data-video-watch-prompt-action'),
      expected.action
    )
    assert.equal(
      getAttribute(control.tag, 'data-video-id'),
      '${safeVideoId}'
    )
    assert.equal(
      getAttribute(control.tag, 'data-rewatch'),
      expected.rewatch
    )
    assert.equal(
      getAttribute(control.tag, 'data-player-prompt'),
      expected.playerPrompt
    )
    assert.equal(
      getAttribute(control.tag, 'data-analytics-action'),
      expected.analyticsAction
    )
    assert.equal(
      normalizeClickEventName(
        getAttribute(control.tag, 'data-analytics-action')
      ),
      expected.eventName
    )
    assert.equal(
      getAttribute(control.tag, 'aria-pressed'),
      expected.ariaPressed
    )
    assert.equal(
      getAttribute(control.tag, 'aria-label'),
      expected.ariaLabel
    )
    assert.equal(getAttribute(control.tag, 'title'), expected.title)
    assert.equal(getAttribute(control.tag, 'onclick'), null)
    assert.equal(control.content.trim(), expected.content)
  })
})

test('rewatch prompts continue to omit only the Favorite action', () => {
  const branchStart = markupSource.indexOf("${rewatch ? '' : `")
  const branchEnd = markupSource.indexOf('\n        `}', branchStart)
  const confirmIndex = markupSource.indexOf(
    'data-video-watch-prompt-action="confirm"'
  )
  const dismissIndex = markupSource.indexOf(
    'data-video-watch-prompt-action="dismiss"'
  )

  assert.notEqual(branchStart, -1)
  assert.notEqual(branchEnd, -1)
  const favoriteBranch = markupSource.slice(branchStart, branchEnd)
  assert.match(
    favoriteBranch,
    /data-video-watch-prompt-action="favorite"/
  )
  assert.doesNotMatch(
    favoriteBranch,
    /data-video-watch-prompt-action="(?:confirm|dismiss)"/
  )
  assert.ok(confirmIndex > branchEnd)
  assert.ok(dismissIndex > branchEnd)
})

test('app composition imports the watch-prompt binder and wires every generated surface', () => {
  assert.match(
    appSource,
    /import\s*\{\s*bindVideoWatchPromptActions\s*\}\s*from '\.\/features\/videos\/watch-prompt-actions\.js'/
  )

  const expectedActions = {
    favorite: 'favoriteVideoFromWatchPrompt',
    confirm: 'confirmVideoWatchPrompt',
    dismiss: 'dismissVideoWatchPrompt'
  }
  assert.deepEqual(
    getVideoWatchPromptBindings(appSource),
    [
      {
        actions: expectedActions,
        root: 'globalReminder'
      },
      {
        actions: expectedActions,
        root: 'zoomedCard'
      },
      {
        actions: expectedActions,
        root: 'prompt'
      }
    ]
  )
})

test('global prompt binds immediately after replacing its markup', () => {
  const renderStart = appSource.indexOf(
    'function renderGlobalVideoWatchReminderPrompt('
  )
  const renderEnd = appSource.indexOf(
    '\nfunction renderActiveVideoWatchReminder(',
    renderStart
  )
  assert.notEqual(renderStart, -1)
  assert.notEqual(renderEnd, -1)
  const renderSource = appSource.slice(renderStart, renderEnd)

  assert.match(
    renderSource,
    /globalReminder\.innerHTML = getVideoWatchReminderMarkup\(videoId,\s*\{\s*global: true,\s*rewatch,\s*video\s*\}\)\s*bindVideoWatchPromptActions\(globalReminder,\s*\{\s*favorite: favoriteVideoFromWatchPrompt,\s*confirm: confirmVideoWatchPrompt,\s*dismiss: dismissVideoWatchPrompt\s*\}\)\s*globalReminder\.classList\.remove\('hidden'\)/
  )
})

test('card prompt binds immediately after inserting its markup', () => {
  const renderStart = appSource.indexOf(
    'function renderActiveVideoWatchReminder('
  )
  const renderEnd = appSource.indexOf(
    '\nfunction queueActiveVideoWatchReminderRender(',
    renderStart
  )
  assert.notEqual(renderStart, -1)
  assert.notEqual(renderEnd, -1)
  const renderSource = appSource.slice(renderStart, renderEnd)

  assert.match(
    renderSource,
    /zoomedCard\.insertAdjacentHTML\('beforeend', getVideoWatchReminderMarkup\(targetVideoId,\s*\{\s*rewatch: reminder\.rewatch === true,\s*video\s*\}\)\)\s*bindVideoWatchPromptActions\(zoomedCard,\s*\{\s*favorite: favoriteVideoFromWatchPrompt,\s*confirm: confirmVideoWatchPrompt,\s*dismiss: dismissVideoWatchPrompt\s*\}\)\s*finalizeRenderedVideoWatchPrompt\(/
  )
})

test('player prompt queries and binds the inserted prompt before exposing it', () => {
  const renderStart = appSource.indexOf(
    'function showVideoShelfCompletionPrompt('
  )
  const renderEnd = appSource.indexOf(
    '\nfunction handleVideoShelfPlayerStateChange(',
    renderStart
  )
  assert.notEqual(renderStart, -1)
  assert.notEqual(renderEnd, -1)
  const renderSource = appSource.slice(renderStart, renderEnd)

  assert.match(
    renderSource,
    /session\.frame\.insertAdjacentHTML\('beforeend', getVideoWatchReminderMarkup\(session\.videoId,\s*\{\s*player: true,\s*rewatch: session\.isRewatch,\s*video\s*\}\)\)\s*const prompt = session\.frame\.querySelector\('\.video-watch-reminder-popover\.is-player'\)\s*if \(!prompt\) return false\s*bindVideoWatchPromptActions\(prompt,\s*\{\s*favorite: favoriteVideoFromWatchPrompt,\s*confirm: confirmVideoWatchPrompt,\s*dismiss: dismissVideoWatchPrompt\s*\}\)\s*session\.completionPromptVisible = true/
  )
})

test('watch-prompt handlers retain first ownership of their click events', () => {
  const expectedHandlerStarts = [
    /function favoriteVideoFromWatchPrompt\(event, videoId\) \{\s*event\?\.preventDefault\(\)\s*event\?\.stopPropagation\(\)\s*const state = loadState\(\)/,
    /function confirmVideoWatchPrompt\(event, videoId, rewatch = false, playerPrompt = false\) \{\s*event\?\.preventDefault\(\)\s*event\?\.stopPropagation\(\)\s*const targetVideoId = String\(videoId \?\? ''\)/,
    /function dismissVideoWatchPrompt\(event, videoId, playerPrompt = false\) \{\s*event\?\.preventDefault\(\)\s*event\?\.stopPropagation\(\)\s*const targetVideoId = String\(videoId \?\? ''\)/
  ]

  expectedHandlerStarts.forEach(pattern => {
    assert.match(appSource, pattern)
  })

  assert.match(
    analyticsSource,
    /document\.addEventListener\('click', event => \{\s*const control = event\.target\.closest\('button, a'\)/
  )
  assert.doesNotMatch(
    analyticsSource,
    /document\.addEventListener\('click',[\s\S]*?\},\s*true\s*\)/
  )
})

test('only watch-prompt handlers leave inline and legacy ownership', async () => {
  const sourceFiles = [
    new URL('../../index.html', import.meta.url),
    ...await getJavaScriptFiles(new URL('../../src/', import.meta.url))
  ]
  const inlineHandlerPattern =
    /(?<![.\w])\bon[a-z]+\s*=\s*(["'])([\s\S]*?)\1/g
  const inlineHandlers = []

  for (const sourceFile of sourceFiles) {
    const source = await readFile(sourceFile, 'utf8')
    for (const match of source.matchAll(inlineHandlerPattern)) {
      inlineHandlers.push(match[2])
    }
  }

  const globalActionAudit =
    GLOBAL_ACTION_NAMES.join('\n') || 'global action bridge removed'
  assert.ok(globalActionAudit, 'Expected the empty global-action audit')

  for (const actionName of migratedActionNames) {
    const actionPattern = new RegExp(`\\b${actionName}\\b`)
    assert.equal(
      inlineHandlers.some(handler => actionPattern.test(handler)),
      false,
      `${actionName} must not remain in an inline attribute`
    )
    assert.equal(
      GLOBAL_ACTION_NAMES.includes(actionName),
      false,
      `${actionName} must not remain in the legacy manifest`
    )
    assert.doesNotMatch(
      globalActionAudit,
      actionPattern,
      `${actionName} must not remain in the legacy install map`
    )
  }
})
