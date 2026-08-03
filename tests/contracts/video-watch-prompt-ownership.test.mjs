import assert from 'node:assert/strict'
import { readdir, readFile } from 'node:fs/promises'
import { extname } from 'node:path'
import test from 'node:test'
import { GLOBAL_ACTION_NAMES } from '../../src/core/global-action-contract.js'

const appSource = await readFile(new URL('../../src/app.js', import.meta.url), 'utf8')
const analyticsSource = await readFile(new URL('../../analytics.js', import.meta.url), 'utf8')
const markupStart = appSource.indexOf('function getVideoWatchReminderMarkup(')
const markupEnd = appSource.indexOf('function finalizeRenderedVideoWatchPrompt(', markupStart)
const markupSource = appSource.slice(markupStart, markupEnd)

async function getJavaScriptFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true })
  return (await Promise.all(entries.map(entry => {
    const url = new URL(`${entry.name}${entry.isDirectory() ? '/' : ''}`, directory)
    if (entry.isDirectory()) return getJavaScriptFiles(url)
    return extname(entry.name) === '.js' ? [url] : []
  }))).flat()
}

test('completion prompt markup is owned only by the embedded player', () => {
  assert.notEqual(markupStart, -1)
  assert.notEqual(markupEnd, -1)
  assert.match(markupSource, /class="video-watch-reminder-popover is-player"/)
  assert.match(markupSource, /const promptId = `videoWatchPrompt-\$\{safeVideoId\}-player`/)
  assert.doesNotMatch(markupSource, /is-global|data-player-prompt|global =|player =/)
})

test('player inserts and binds its completion prompt before exposing it', () => {
  const start = appSource.indexOf('function showVideoShelfCompletionPrompt(')
  const end = appSource.indexOf('\nfunction handleVideoShelfPlayerStateChange(', start)
  const source = appSource.slice(start, end)
  assert.match(
    source,
    /session\.frame\.insertAdjacentHTML\('beforeend', getVideoWatchReminderMarkup\(session\.videoId,\s*\{\s*rewatch: session\.isRewatch,\s*video\s*\}\)\)\s*const prompt = session\.frame\.querySelector\('\.video-watch-reminder-popover\.is-player'\)\s*if \(!prompt\) return false\s*bindVideoWatchPromptActions\(prompt,\s*\{\s*favorite: favoriteVideoFromWatchPrompt,\s*confirm: confirmVideoWatchPrompt,\s*dismiss: dismissVideoWatchPrompt\s*\}\)\s*session\.completionPromptVisible = true/
  )
  assert.equal((appSource.match(/bindVideoWatchPromptActions\(/g) || []).length, 1)
})

test('iframe ended state remains the sole completion trigger', () => {
  const start = appSource.indexOf('function handleVideoShelfPlayerStateChange(')
  const end = appSource.indexOf('\nfunction completeVideoShelfPlayer(', start)
  const source = appSource.slice(start, end)
  assert.match(source, /if \(state === 0\)[\s\S]*?trackVideoPlaybackSessionEnded\(session, 'ended'\)[\s\S]*?completeVideoShelfPlayer\(session\)/)
  assert.match(
    appSource,
    /function completeVideoShelfPlayer\(session\) \{\s*if \(\s*activeVideoShelfPlayer !== session\s*\|\| !isStudyVideoShelfPlayerSession\(session\)\s*\) return false\s*showVideoShelfCompletionPrompt\(session\)/
  )
})

test('completion-prompt handlers own and validate player actions', () => {
  assert.match(appSource, /function confirmVideoWatchPrompt\(event, videoId, rewatch = false\) \{\s*event\?\.preventDefault\(\)\s*event\?\.stopPropagation\(\)/)
  assert.match(appSource, /function dismissVideoWatchPrompt\(event, videoId\) \{\s*event\?\.preventDefault\(\)\s*event\?\.stopPropagation\(\)/)
  assert.match(appSource, /session\.completionPromptVisible !== true/)
  assert.match(analyticsSource, /document\.addEventListener\('click', event => \{\s*const control = event\.target\.closest\('button, a'\)/)
})

test('watch-prompt handlers stay out of inline and legacy global ownership', async () => {
  const actionNames = [
    'favoriteVideoFromWatchPrompt',
    'confirmVideoWatchPrompt',
    'dismissVideoWatchPrompt'
  ]
  const files = [new URL('../../index.html', import.meta.url), ...await getJavaScriptFiles(new URL('../../src/', import.meta.url))]
  const inlineHandlers = []
  for (const file of files) {
    const source = await readFile(file, 'utf8')
    for (const match of source.matchAll(/(?<![.\w])\bon[a-z]+\s*=\s*(["'])([\s\S]*?)\1/g)) {
      inlineHandlers.push(match[2])
    }
  }
  for (const actionName of actionNames) {
    assert.equal(inlineHandlers.some(handler => new RegExp(`\\b${actionName}\\b`).test(handler)), false)
    assert.equal(GLOBAL_ACTION_NAMES.includes(actionName), false)
  }
})
