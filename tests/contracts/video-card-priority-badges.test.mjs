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
  const match = appSource.match(
    /function renderCard\([\s\S]*?\n}\n\nfunction removeVideoFromGrid/
  )
  assert.ok(match, 'renderCard source remains discoverable')
  return match[0]
}

function getRuleDeclarations(source, selector) {
  const escapedSelector = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const match = source.match(new RegExp(`${escapedSelector}\\s*\\{([^}]*)\\}`))
  assert.ok(match, `${selector} rule remains discoverable`)
  return match[1]
}

test('video-card priority badges use localized status and favorite labels', () => {
  const renderCardSource = getRenderCardSource()

  assert.doesNotMatch(renderCardSource, /t\('videos\.card\.resume'\)/)
  assert.match(
    renderCardSource,
    /partial-priority-badge[\s\S]*?renderVideoActionIcon\('partial'\)[\s\S]*?t\('videos\.status\.partial'\)/
  )
  assert.match(
    renderCardSource,
    /favorite-priority-badge[\s\S]*?renderVideoActionIcon\('favorite'\)[\s\S]*?t\('videos\.card\.favorite'\)/
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
