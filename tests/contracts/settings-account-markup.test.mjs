import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const html = await readFile(new URL('../../index.html', import.meta.url), 'utf8')

test('Settings contains one generic internal Account surface', () => {
  assert.match(
    html,
    /class="settings-group settings-accordion settings-account hidden open" id="accountSettings"[^>]*aria-labelledby="accountSettingsTitle"/
  )
  assert.match(
    html,
    /class="settings-accordion-toggle settings-account-toggle"[^>]*aria-expanded="true"[^>]*aria-controls="accountSettingsContent"/
  )
  assert.match(
    html,
    /class="settings-accordion-content settings-account-content" id="accountSettingsContent"/
  )
  assert.match(
    html,
    /data-google-identity-button[^>]*data-google-identity-surface="settings"/
  )
  assert.doesNotMatch(html, /data-account-action="google"/)
  assert.match(html, /data-account-action="email-form"/)
  assert.match(html, /settings-account-signed-out hidden ph-no-capture/)
  assert.match(
    html,
    /id="accountEmail"[^>]*type="email"[^>]*autocomplete="email"/
  )
  assert.match(html, /data-account-action="code-form"/)
  assert.match(
    html,
    /id="accountEmailCode"[^>]*inputmode="numeric"[^>]*autocomplete="one-time-code"[^>]*maxlength="6"/
  )
  assert.match(html, /Sign in or create your account/)
  assert.match(
    html,
    /class="btn-secondary settings-account-sign-out"[^>]*data-account-action="sign-out"/
  )
  assert.match(html, /data-reminder-action="form"/)
  assert.match(
    html,
    /id="reminderPreferenceFields"[^>]*aria-labelledby="accountEmailsTitle"[^>]*disabled/
  )
  assert.match(html, /id="streakRemindersEnabled" type="checkbox"/)
  assert.match(html, /id="discoveryEmailsEnabled" type="checkbox"/)
  assert.doesNotMatch(html, /id="reminderLocalTime"|name="reminderDay"/)
})

test('signed-in email settings expose only two automatic choices', () => {
  const reminders = html.match(
    /<section class="settings-account-reminders"[^>]*>([\s\S]*?)<\/section>/
  )?.[1] || ''

  assert.match(reminders, /settings\.account\.streakReminders/)
  assert.match(reminders, /settings\.account\.discoveryEmails/)
  assert.match(reminders, /data-reminder-action="retry"/)
  assert.doesNotMatch(reminders, /type="time"|name="reminderDay"|type="submit"/)
})

test('signed-in Account presentation contains no subscription controls', () => {
  const signedIn = html.match(
    /<div class="settings-account-signed-in hidden" id="accountSignedIn">([\s\S]*?)<\/div>\s*<p class="settings-account-feedback/
  )?.[1] || ''

  assert.match(signedIn, /data-account-action="sign-out"/)
  assert.doesNotMatch(signedIn, /download-account|subscription|billing|Edenia Plus/i)
})
