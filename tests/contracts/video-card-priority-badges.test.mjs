import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const appSource = await readFile(
  new URL('../../src/app.js', import.meta.url),
  'utf8'
)
const phoneStyles = await readFile(
  new URL('../../src/styles/98-responsive-phone.css', import.meta.url),
  'utf8'
)
const wideStyles = await readFile(
  new URL('../../src/styles/99-responsive-wide.css', import.meta.url),
  'utf8'
)

function getRenderCardSource() {
  const start = appSource.indexOf('function renderCard(')
  const end = appSource.indexOf('\nfunction renderRemovedVideoCard(', start)
  assert.notEqual(start, -1, 'renderCard source remains discoverable')
  assert.notEqual(end, -1, 'renderCard boundary remains discoverable')
  return appSource.slice(start, end)
}

function getRuleDeclarations(source, selector) {
  const escapedSelector = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const match = source.match(new RegExp(`${escapedSelector}\\s*\\{([^}]*)\\}`))
  assert.ok(match, `${selector} rule remains discoverable`)
  return match[1]
}

test('video-card priority badges switch between preview labels and legacy actions', () => {
  const renderCardSource = getRenderCardSource()
  const organizationStart = renderCardSource.indexOf('const organizationShelfPriorityBadge =')
  const legacyStart = renderCardSource.indexOf('const legacyShelfPriorityBadge =')
  const selectionStart = renderCardSource.indexOf('const shelfPriorityBadge =')
  const organizationSource = renderCardSource.slice(organizationStart, legacyStart)
  const legacySource = renderCardSource.slice(legacyStart, selectionStart)

  assert.doesNotMatch(renderCardSource, /t\('videos\.card\.resume'\)/)
  assert.match(
    organizationSource,
    /class="channel-shelf-priority-badge partial-priority-badge">\$\{renderVideoActionIcon\('partial'\)\}\$\{escHtml\(t\('videos\.status\.partial'\)\)\}<\/span>/
  )
  assert.match(
    organizationSource,
    /class="channel-shelf-priority-badge favorite-priority-badge">\$\{renderVideoActionIcon\('favorite'\)\}\$\{escHtml\(t\('videos\.card\.favorite'\)\)\}<\/span>/
  )
  assert.doesNotMatch(
    organizationSource,
    /channel-shelf-priority-badge[^>]*data-video-state-action/
  )
  assert.match(legacySource, /data-video-state-action="clear-paused"/)
  assert.match(legacySource, /data-video-state-action="remove-watch-later"/)
  assert.match(legacySource, /data-video-state-action="remove-favorite"/)
  assert.match(
    renderCardSource,
    /const shelfPriorityBadge = VIDEO_ORGANIZATION_ENABLED\s*\? organizationShelfPriorityBadge\s*: legacyShelfPriorityBadge/
  )
  assert.match(
    renderCardSource,
    /card-status partial-status[\s\S]*?renderVideoActionIcon\('partial'\)[\s\S]*?t\('videos\.status\.partial'\)/
  )
})

test('only In progress and Watch later priority badges hide the white stroke', () => {
  for (const [source, selectorPrefix] of [
    [phoneStyles, '.channel-shelf-card '],
    [wideStyles, '']
  ]) {
    for (const badge of ['partial', 'watch-later']) {
      assert.match(
        getRuleDeclarations(source, `${selectorPrefix}.${badge}-priority-badge`),
        /border-color:\s*transparent;/
      )
    }
    assert.doesNotMatch(
      getRuleDeclarations(source, `${selectorPrefix}.favorite-priority-badge`),
      /border(?:-color)?:/
    )
  }
})
