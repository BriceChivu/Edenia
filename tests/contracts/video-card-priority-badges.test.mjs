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

test('video-card priority badges are passive organization labels', () => {
  const renderCardSource = getRenderCardSource()

  assert.doesNotMatch(renderCardSource, /t\('videos\.card\.resume'\)/)
  assert.match(
    renderCardSource,
    /class="channel-shelf-priority-badge partial-priority-badge">\$\{renderVideoActionIcon\('partial'\)\}\$\{escHtml\(t\('videos\.status\.partial'\)\)\}<\/span>/
  )
  assert.match(
    renderCardSource,
    /class="channel-shelf-priority-badge favorite-priority-badge">\$\{renderVideoActionIcon\('favorite'\)\}\$\{escHtml\(t\('videos\.card\.favorite'\)\)\}<\/span>/
  )
  assert.doesNotMatch(
    renderCardSource,
    /channel-shelf-priority-badge[^>]*data-video-state-action/
  )
  assert.doesNotMatch(renderCardSource, /legacyShelfPriorityBadge/)
  assert.doesNotMatch(renderCardSource, /VIDEO_ORGANIZATION_ENABLED/)
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
