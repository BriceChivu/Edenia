import assert from 'node:assert/strict'
import fs from 'node:fs'
import test from 'node:test'

const appSource = fs.readFileSync(new URL('../../src/app.js', import.meta.url), 'utf8')
const indexSource = fs.readFileSync(new URL('../../index.html', import.meta.url), 'utf8')
const feedStyles = fs.readFileSync(new URL('../../src/styles/70-video-feed.css', import.meta.url), 'utf8')
const phoneStyles = fs.readFileSync(new URL('../../src/styles/98-responsive-phone.css', import.meta.url), 'utf8')

test('video cards expose More actions while shelf badges remain informational', () => {
  assert.match(appSource, /data-video-organization-action="menu"/)
  assert.match(appSource, /data-video-organization-surface="continue_watching"/)
  assert.match(appSource, /data-video-organization-surface="video_card"/)
  assert.match(appSource, /options\.hideOrganizationActions \? '' : `<button class="action-btn more-btn"/)
  assert.match(
    appSource,
    /watchedGrid\.innerHTML =[\s\S]*?hideOrganizationActions: true[\s\S]*?stateActionSurface: 'watched_card'/
  )
  assert.doesNotMatch(appSource, /data-video-organization-surface="watched_card"/)
  assert.doesNotMatch(appSource, /data-video-set-aside-action/)
  assert.doesNotMatch(appSource, /channel-shelf-priority-badge[^>]*data-video-state-action/)
})

test('Removed recovery and the shared action surface have one static owner', () => {
  assert.equal((indexSource.match(/id="removedSection"/g) || []).length, 1)
  assert.equal((indexSource.match(/id="videoActionsPopover"/g) || []).length, 1)
  assert.match(indexSource, /class="[^"]*removed-section[^"]*collapsed[^"]*" id="removedSection"/)
  assert.match(indexSource, /id="removedSection"[\s\S]*id="removedGrid"/)
  assert.doesNotMatch(indexSource, /id="setAsidePrompt"/)
  assert.match(feedStyles, /\.video-actions-popover[\s\S]*position: fixed/)
  assert.match(phoneStyles, /@media \(max-width: 640px\)[\s\S]*\.video-actions-popover[\s\S]*bottom:/)
})

test('desktop action menus measure their anchor and close on viewport movement', () => {
  assert.match(
    appSource,
    /function positionVideoOrganizationMenu\([\s\S]*?trigger\.getBoundingClientRect\(\)[\s\S]*?popover\.getBoundingClientRect\(\)/
  )
  assert.match(appSource, /triggerRect\.right - popoverRect\.width/)
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

test('organization changes preserve exact snapshots for Undo', () => {
  assert.match(appSource, /type: 'video-organization'/)
  assert.match(appSource, /before: \{ video: beforeVideo \}/)
  assert.match(appSource, /after: \{ video: cloneVideoForHistoryAction\(video\) \}/)
  assert.match(appSource, /undoHistoryActionById\(action\.id\)/)
})
