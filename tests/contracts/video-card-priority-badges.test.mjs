import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const appSource = await readFile(
  new URL('../../src/app.js', import.meta.url),
  'utf8'
)
const feedStyles = await readFile(
  new URL('../../src/styles/70-video-feed.css', import.meta.url),
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

test('channel shelf cards render one passive ribbon in priority order', () => {
  const renderCardSource = getRenderCardSource()

  assert.doesNotMatch(renderCardSource, /t\('videos\.card\.resume'\)/)
  assert.match(
    renderCardSource,
    /class="video-card-ribbon channel-shelf-priority-badge partial-priority-badge">\$\{escHtml\(t\('videos\.status\.partial'\)\)\}<\/span>/
  )
  assert.match(
    renderCardSource,
    /class="video-card-ribbon channel-shelf-priority-badge watch-later-priority-badge">\$\{escHtml\(t\('videos\.card\.watchLater'\)\)\}<\/span>/
  )
  assert.match(
    renderCardSource,
    /class="video-card-ribbon channel-shelf-priority-badge favorite-priority-badge">\$\{escHtml\(t\('videos\.card\.favorite'\)\)\}<\/span>/
  )
  assert.match(
    renderCardSource,
    /class="video-card-ribbon channel-shelf-priority-badge new-priority-badge">\$\{escHtml\(uploadRibbon\)\}<\/span>/
  )
  assert.doesNotMatch(
    renderCardSource,
    /channel-shelf-priority-badge[^>]*data-video-state-action/
  )
  assert.doesNotMatch(
    renderCardSource,
    /channel-shelf-priority-badge[^>]*>[^<]*renderVideoActionIcon/
  )
  assert.doesNotMatch(renderCardSource, /legacyShelfPriorityBadge/)
  assert.doesNotMatch(renderCardSource, /VIDEO_ORGANIZATION_ENABLED/)
  assert.match(
    renderCardSource,
    /options\.shelf && isPartial[\s\S]*?: options\.shelf && isWatchLater[\s\S]*?: options\.shelf && isFavorite[\s\S]*?: options\.shelf && uploadRibbon/
  )
  assert.match(
    renderCardSource,
    /uploadRibbon && !options\.shelf \? `<span class="video-card-ribbon video-upload-ribbon">/
  )
  assert.match(
    renderCardSource,
    /card-status partial-status[\s\S]*?renderVideoActionIcon\('partial'\)[\s\S]*?t\('videos\.status\.partial'\)/
  )
})

test('shelf ribbons share New geometry and attach to the top edge', () => {
  const sharedRibbon = getRuleDeclarations(feedStyles, '.video-card-ribbon')
  assert.match(sharedRibbon, /border:\s*0;/)
  assert.match(sharedRibbon, /box-shadow:\s*0 2px 6px rgba\(5,5,5,0\.34\);/)
  assert.match(sharedRibbon, /font-size:\s*0\.7rem;/)
  assert.match(sharedRibbon, /font-weight:\s*850;/)
  assert.match(sharedRibbon, /padding:\s*6px 10px 7px;/)

  const shelfRibbon = getRuleDeclarations(
    feedStyles,
    '.video-card-ribbon.channel-shelf-priority-badge'
  )
  assert.match(shelfRibbon, /border-radius:\s*0 0 4px 4px;/)
  assert.match(shelfRibbon, /bottom:\s*auto;/)
  assert.match(shelfRibbon, /left:\s*8px;/)
  assert.match(shelfRibbon, /pointer-events:\s*none;/)
  assert.match(shelfRibbon, /top:\s*0;/)

  for (const [selector, background, color] of [
    ['.partial-priority-badge', '#fcb831', '#3c2800'],
    ['.watch-later-priority-badge', '#12bcea', '#052a36'],
    ['.favorite-priority-badge', '#ffe4ec', '#bd2452'],
    ['.new-priority-badge', '#e50914', '#ffffff']
  ]) {
    const declarations = getRuleDeclarations(feedStyles, selector)
    assert.match(declarations, new RegExp(`background:\\s*${background};`))
    assert.match(declarations, new RegExp(`color:\\s*${color};`))
  }

  assert.match(
    getRuleDeclarations(phoneStyles, '.channel-shelf-card .channel-shelf-priority-badge'),
    /display:\s*inline-flex;/
  )
  assert.match(
    getRuleDeclarations(wideStyles, '.channel-shelf-priority-badge'),
    /display:\s*inline-flex;/
  )
})

test('preview-only state refreshes replace the unified shelf ribbon', () => {
  const start = appSource.indexOf('function refreshVideoActionUiWithoutFeedRerender(')
  const end = appSource.indexOf('\nfunction cleanupVideoShelfPreview(', start)
  assert.notEqual(start, -1, 'preview refresh source remains discoverable')
  assert.notEqual(end, -1, 'preview refresh boundary remains discoverable')
  const refreshSource = appSource.slice(start, end)

  assert.match(
    refreshSource,
    /card\.querySelector\('\.channel-shelf-priority-badge'\)/
  )
  assert.match(
    refreshSource,
    /updatedCard\.querySelector\('\.channel-shelf-priority-badge'\)/
  )
  assert.match(refreshSource, /currentPriorityBadge\.className = updatedPriorityBadge\.className/)
  assert.match(refreshSource, /currentPriorityBadge\.innerHTML = updatedPriorityBadge\.innerHTML/)
})
