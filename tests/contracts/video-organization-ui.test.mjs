import assert from 'node:assert/strict'
import fs from 'node:fs'
import test from 'node:test'

const appSource = fs.readFileSync(new URL('../../src/app.js', import.meta.url), 'utf8')
const indexSource = fs.readFileSync(new URL('../../index.html', import.meta.url), 'utf8')
const feedStyles = fs.readFileSync(new URL('../../src/styles/70-video-feed.css', import.meta.url), 'utf8')
const phoneStyles = fs.readFileSync(new URL('../../src/styles/98-responsive-phone.css', import.meta.url), 'utf8')

test('video cards expose More actions while shelf badges remain informational', () => {
  assert.match(appSource, /data-video-organization-action="menu"/)
  assert.match(appSource, /surface: 'continue_watching'/)
  assert.match(appSource, /const surface = options\.surface \|\| 'video_card'/)
  assert.match(appSource, /options\.hideOrganizationActions \? '' : renderVideoOrganizationDisclosure\(v\)/)
  assert.match(
    appSource,
    /watchedGrid\.innerHTML =[\s\S]*?hideOrganizationActions: true[\s\S]*?stateActionSurface: 'watched_card'/
  )
  assert.doesNotMatch(appSource, /data-video-organization-surface="watched_card"/)
  assert.doesNotMatch(appSource, /data-video-set-aside-action/)
  assert.doesNotMatch(appSource, /channel-shelf-priority-badge[^>]*data-video-state-action/)
})

test('Removed recovery remains static while video action menus belong to their cards', () => {
  assert.equal((indexSource.match(/id="removedSection"/g) || []).length, 1)
  assert.equal((indexSource.match(/id="videoActionsPopover"/g) || []).length, 0)
  assert.match(indexSource, /class="[^"]*removed-section[^"]*collapsed[^"]*" id="removedSection"/)
  assert.match(indexSource, /id="removedSection"[\s\S]*id="removedGrid"/)
  assert.doesNotMatch(indexSource, /id="setAsidePrompt"/)
  assert.match(appSource, /data-video-actions-disclosure/)
  assert.match(appSource, /class="video-actions-menu"[\s\S]*role="menu"/)
  assert.match(feedStyles, /\.video-actions-menu[\s\S]*position: absolute/)
  assert.doesNotMatch(feedStyles, /\.video-actions-(?:menu|popover)[\s\S]*position: fixed/)
  assert.doesNotMatch(phoneStyles, /\.video-actions-popover/)
})

test('card action menus reveal vertically and close safely on viewport movement', () => {
  assert.doesNotMatch(appSource, /function positionVideoOrganizationMenu\(/)
  assert.match(appSource, /aria-controls="\$\{escHtml\(menuId\)\}"/)
  assert.match(appSource, /disclosure\.closest\('\.video-card, \.next-study-card'\)/)
  assert.match(feedStyles, /clip-path: inset\(100% 0 0 0 round 12px\)/)
  assert.match(feedStyles, /\.video-actions-disclosure\.is-open > \.video-actions-menu[\s\S]*clip-path: inset\(0 0 0 0 round 12px\)/)
  assert.match(feedStyles, /@media \(prefers-reduced-motion: reduce\)[\s\S]*\.video-actions-menu/)
  assert.match(
    appSource,
    /window\.addEventListener\('scroll', closeVideoOrganizationMenuOnViewportChange, \{\s*capture: true,\s*passive: true\s*\}\)/
  )
  assert.match(
    appSource,
    /function closeVideoOrganizationMenuOnViewportChange\(event\)[\s\S]*?event\?\.type === 'scroll'[\s\S]*?\.next-study-card[\s\S]*?closeVideoOrganizationMenu\(false\)/
  )
  assert.match(appSource, /event\.key === 'ArrowDown'/)
  assert.match(appSource, /event\.key === 'ArrowUp'/)
  assert.match(appSource, /focus\(\{ preventScroll: true \}\)/)
})

test('video action choices remain capped at two in the required order', () => {
  const start = appSource.indexOf('function getVideoOrganizationMenuItems(')
  const end = appSource.indexOf('\nfunction getVideoOrganizationMenuId(', start)
  const menuItemsSource = appSource.slice(start, end)
  assert.match(menuItemsSource, /if \(hasVideoResumePriority\(video\)\)/)
  assert.match(menuItemsSource, /action: 'remove-continue'/)
  assert.match(menuItemsSource, /action: 'remove-feed'/)
  assert.equal((menuItemsSource.match(/items\.push\(/g) || []).length, 2)
  assert.ok(menuItemsSource.indexOf("action: 'remove-continue'") < menuItemsSource.indexOf("action: 'remove-feed'"))
})

test('organization changes preserve exact snapshots for Undo', () => {
  assert.match(appSource, /type: 'video-organization'/)
  assert.match(appSource, /before: \{ video: beforeVideo \}/)
  assert.match(appSource, /after: \{ video: cloneVideoForHistoryAction\(video\) \}/)
  assert.match(appSource, /undoHistoryActionById\(action\.id\)/)
})
