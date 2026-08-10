import assert from 'node:assert/strict'
import fs from 'node:fs'
import test from 'node:test'

const appSource = fs.readFileSync(new URL('../../src/app.js', import.meta.url), 'utf8')
const indexSource = fs.readFileSync(new URL('../../index.html', import.meta.url), 'utf8')
const feedStyles = fs.readFileSync(new URL('../../src/styles/70-video-feed.css', import.meta.url), 'utf8')
const phoneStyles = fs.readFileSync(new URL('../../src/styles/98-responsive-phone.css', import.meta.url), 'utf8')
const pageFlowStyles = fs.readFileSync(new URL('../../src/styles/96-responsive-page-flows.css', import.meta.url), 'utf8')

test('video cards expose organization actions and passive priority labels', () => {
  assert.match(appSource, /data-video-organization-action="menu"/)
  assert.match(appSource, /data-video-organization-surface="continue_watching"/)
  assert.match(appSource, /data-video-organization-surface="video_card"/)
  assert.match(appSource, /options\.hideOrganizationActions \? '' : `<button class="action-btn more-btn"/)
  assert.match(
    appSource,
    /watchedGrid\.innerHTML =[\s\S]*?hideOrganizationActions: true[\s\S]*?stateActionSurface: 'watched_card'/
  )
  assert.doesNotMatch(appSource, /data-video-organization-surface="watched_card"/)
  assert.doesNotMatch(appSource, /data-video-set-aside-action="request"/)
  assert.match(appSource, /const shelfPriorityBadge =[\s\S]*?<span class="channel-shelf-priority-badge/)
  assert.doesNotMatch(appSource, /legacyShelfPriorityBadge|VIDEO_ORGANIZATION_ENABLED/)
})

test('Removed recovery and the shared action surface have one static owner', () => {
  assert.equal((indexSource.match(/id="removedSection"/g) || []).length, 1)
  assert.equal((indexSource.match(/id="videoActionsPopover"/g) || []).length, 1)
  assert.match(indexSource, /class="[^"]*removed-section[^"]*collapsed[^"]*" id="removedSection"/)
  assert.match(indexSource, /id="removedSection"[\s\S]*id="removedGrid"/)
  assert.equal((indexSource.match(/id="setAsidePrompt"/g) || []).length, 0)
  assert.doesNotMatch(indexSource, /data-video-organization-(?:preview|legacy)/)
  assert.doesNotMatch(appSource, /function applyVideoOrganizationVisibility\(\)/)
  assert.match(feedStyles, /\.video-actions-popover[\s\S]*position: fixed/)
  assert.match(phoneStyles, /@media \(max-width: 640px\)[\s\S]*\.video-actions-popover[\s\S]*bottom:/)
})

test('desktop action menus measure their anchor and close on viewport movement', () => {
  assert.match(
    appSource,
    /function positionVideoOrganizationMenu\([\s\S]*?trigger\.closest\('\.channel-shelf-card'\)[\s\S]*?card\.getBoundingClientRect\(\)[\s\S]*?popover\.getBoundingClientRect\(\)/
  )
  assert.match(appSource, /popover\.style\.width = `\$\{Math\.min\(anchorRect\.width, maxWidth\)\}px`/)
  assert.match(appSource, /card\s*\? anchorRect\.left\s*:\s*triggerRect\.right - popoverRect\.width/)
  assert.match(appSource, /aboveTop >= viewportTop \+ margin/)
  assert.match(
    appSource,
    /window\.addEventListener\('scroll', closeVideoOrganizationMenuOnViewportChange, \{\s*capture: true,\s*passive: true\s*\}\)/
  )
  assert.match(
    appSource,
    /function closeVideoOrganizationMenuOnViewportChange\(event\)[\s\S]*?event\?\.type === 'scroll' && usesPhoneComposition\(\)[\s\S]*?closeVideoOrganizationMenu\(true\)/
  )
  assert.match(appSource, /focus\(\{ preventScroll: true \}\)/)
})

test('menu options share one geometry while the list owns the divider', () => {
  assert.match(appSource, /list\.classList\.toggle\('has-divider', items\.length > 1\)/)
  assert.doesNotMatch(appSource, /class="video-actions-item \$\{item\.separated/)
  assert.match(feedStyles, /\.video-actions-popover \{[^}]*padding: 0/)
  assert.match(phoneStyles, /\.video-actions-popover \{[^}]*padding: 0/)
  assert.match(
    feedStyles,
    /\.video-actions-list \{[^}]*border-radius: 12px[^}]*gap: 0[^}]*grid-auto-rows: 1fr[^}]*overflow: hidden/
  )
  assert.match(feedStyles, /\.video-actions-list\.has-divider::before \{[^}]*z-index: 1/)
  assert.match(feedStyles, /\.video-actions-item \{[^}]*border-radius: 0/)
  assert.doesNotMatch(feedStyles, /\.video-actions-item\.is-separated/)
})

test('phone action toasts prefer one line without splitting the Undo label', () => {
  assert.match(
    pageFlowStyles,
    /@media \(max-width: 640px\)[\s\S]*?\.toast\.has-action \{\s*width: max-content;\s*\}/
  )
  assert.match(
    pageFlowStyles,
    /\.toast\.has-action > span \{\s*min-width: 0;\s*\}/
  )
  assert.match(
    pageFlowStyles,
    /\.toast\.has-action \.toast-action \{\s*flex: 0 0 auto;\s*overflow-wrap: normal;\s*white-space: nowrap;\s*word-break: keep-all;\s*\}/
  )
})

test('organization changes preserve exact snapshots for Undo', () => {
  assert.match(appSource, /type: 'video-organization'/)
  assert.match(appSource, /before: \{ video: beforeVideo \}/)
  assert.match(appSource, /after: \{ video: cloneVideoForHistoryAction\(video\) \}/)
  assert.match(appSource, /undoHistoryActionById\(action\.id\)/)
})
