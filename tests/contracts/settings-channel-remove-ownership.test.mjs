import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import {
  GLOBAL_ACTION_NAMES
} from '../../src/core/global-action-contract.js'

const indexSource = await readFile(
  new URL('../../index.html', import.meta.url),
  'utf8'
)
const appSource = await readFile(
  new URL('../../src/app.js', import.meta.url),
  'utf8'
)

function getOpeningTags(source, tagName) {
  return [...source.matchAll(new RegExp(`<${tagName}\\b[^>]*>`, 'g'))]
    .map(match => match[0])
}

function getAttribute(tag, name) {
  return tag.match(
    new RegExp(`\\s${name}=(["'])([\\s\\S]*?)\\1`)
  )?.[2] ?? null
}

test('generated Settings channel removal retains dormant markup and scoped ownership', () => {
  assert.doesNotMatch(indexSource, /\bid=(["'])channelList\1/)

  const controls = getOpeningTags(appSource, 'button').filter(tag => (
    getAttribute(tag, 'class') === 'channel-remove'
  ))
  assert.equal(controls.length, 1)

  const [control] = controls
  assert.equal(getAttribute(control, 'type'), null)
  assert.equal(getAttribute(control, 'aria-label'), null)
  assert.equal(
    getAttribute(control, 'data-settings-channel-action'),
    'remove'
  )
  assert.equal(getAttribute(control, 'data-channel-id'), '${escHtml(c.id)}')
  assert.equal(
    getAttribute(control, 'data-analytics-action'),
    'removeChannel'
  )
  assert.equal(
    getAttribute(control, 'title'),
    '${escHtml(t(\'settings.remove\'))}'
  )
  assert.equal(getAttribute(control, 'onclick'), null)
})

test('channel list binds each generated removal control after replacement', () => {
  assert.match(
    appSource,
    /import\s*\{\s*bindSettingsChannelRemoveActions\s*\}\s*from '\.\/features\/settings\/channel-remove-actions\.js'/
  )

  const renderStart = appSource.indexOf('function renderChannelList(')
  const renderEnd = appSource.indexOf(
    '\nfunction showResetConfirm(',
    renderStart
  )
  assert.notEqual(renderStart, -1)
  assert.notEqual(renderEnd, -1)
  const renderSource = appSource.slice(renderStart, renderEnd)
  const markupIndex = renderSource.indexOf("el.innerHTML = channels.map")
  const bindingIndex = renderSource.indexOf(
    'bindSettingsChannelRemoveActions(el, {'
  )
  assert.notEqual(markupIndex, -1)
  assert.ok(bindingIndex > markupIndex)
  assert.match(
    renderSource,
    /bindSettingsChannelRemoveActions\(el,\s*\{\s*remove:\s*removeChannel\s*\}\)/
  )
})

test('Settings channel removal no longer needs global action ownership', () => {
  assert.equal(GLOBAL_ACTION_NAMES.includes('removeChannel'), false)

  const globalActionAudit =
    GLOBAL_ACTION_NAMES.join('\n') || 'global action bridge removed'
  assert.ok(globalActionAudit)
  assert.doesNotMatch(globalActionAudit, /(?:^|[\s,])removeChannel(?:[\s,]|$)/)
  assert.doesNotMatch(
    appSource,
    /\bonclick=(["'])[^"']*\bremoveChannel\s*\([\s\S]*?\1/
  )
})
