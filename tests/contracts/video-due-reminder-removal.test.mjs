import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const [appSource, defaultStateSource, importedStateSource, portableProfileSource, htmlSource, feedStyles, phoneStyles, wideStyles] = await Promise.all([
  readFile(new URL('../../src/app.js', import.meta.url), 'utf8'),
  readFile(new URL('../../src/state/default-state.js', import.meta.url), 'utf8'),
  readFile(new URL('../../src/state/imported-state.js', import.meta.url), 'utf8'),
  readFile(new URL('../../src/state/portable-learner-profile.js', import.meta.url), 'utf8'),
  readFile(new URL('../../index.html', import.meta.url), 'utf8'),
  readFile(new URL('../../src/styles/70-video-feed.css', import.meta.url), 'utf8'),
  readFile(new URL('../../src/styles/98-responsive-phone.css', import.meta.url), 'utf8'),
  readFile(new URL('../../src/styles/99-responsive-wide.css', import.meta.url), 'utf8')
])

test('duration-based reminder scheduler and card/global UI are removed', () => {
  const removedRuntimeNames = [
    'activeVideoWatchReminderId',
    'setVideoWatchReminderInState',
    'getDueVideoWatchReminderEntries',
    'scheduleVideoWatchReminderTimer',
    'renderActiveVideoWatchReminder',
    'dismissVideoWatchReminderOnOutsideClick'
  ]
  removedRuntimeNames.forEach(name => assert.doesNotMatch(appSource, new RegExp(`\\b${name}\\b`)))
  assert.doesNotMatch(htmlSource, /videoWatchReminderGlobal/)
  assert.doesNotMatch(`${feedStyles}\n${phoneStyles}\n${wideStyles}`, /watch-reminder-target|watch-reminder-arriving|is-global|video-watch-reminder-global/)
})

test('new and exported state omit reminders while legacy saved entries are deleted', () => {
  assert.doesNotMatch(defaultStateSource, /videoWatchReminders/)
  assert.match(
    appSource,
    /function removeLegacyVideoWatchReminderState\(state\) \{\s*if \(!state \|\| !Object\.prototype\.hasOwnProperty\.call\(state, 'videoWatchReminders'\)\) return false\s*delete state\.videoWatchReminders\s*return true/
  )
  assert.match(appSource, /if \(removeLegacyVideoWatchReminderState\(state\)\) shouldSave = true/)
  assert.match(importedStateSource, /removeLegacyVideoWatchReminderState\(importedState\)\s*return importedState/)
  assert.match(
    appSource,
    /createPortableLearnerProfileEnvelope\(state, \{\s*maxBytes: PORTABLE_LEARNER_PROFILE_RECOVERY_MAX_BYTES/
  )
  assert.doesNotMatch(portableProfileSource, /videoWatchReminders/)
})

test('iframe completion prompt and hidden-tab title remain active', () => {
  assert.match(appSource, /activeVideoShelfPlayer\s*&& activeVideoShelfPlayer\.completionPromptPending/)
  assert.match(appSource, /function showVideoShelfCompletionPrompt\(/)
  assert.match(appSource, /function completeVideoShelfPlayer\(session\)[\s\S]*?showVideoShelfCompletionPrompt\(session\)/)
  assert.match(appSource, /function confirmVideoWatchPrompt\(event, videoId, rewatch = false\)/)
  assert.match(appSource, /function dismissVideoWatchPrompt\(event, videoId\)/)
})
