import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const html = await readFile(new URL('../../index.html', import.meta.url), 'utf8')

test('Settings contains one generic internal account and reminders surface', () => {
  assert.match(
    html,
    /class="settings-group settings-account hidden" id="accountSettings"[^>]*aria-labelledby="accountSettingsTitle"/
  )
  assert.match(html, /data-account-action="google"/)
  assert.match(html, /data-account-action="email-form"/)
  assert.match(
    html,
    /id="accountEmail"[^>]*type="email"[^>]*autocomplete="email"/
  )
  assert.match(html, /data-account-action="sign-out"/)
  assert.match(html, /data-reminder-action="form"/)
  assert.match(html, /id="reminderScheduleFields" disabled/)
  assert.match(html, /id="reminderEnabled" type="checkbox"/)
  assert.match(html, /id="reminderLocalTime" type="time"/)
  assert.match(html, /id="reminderTimezone" type="text"/)
  assert.match(html, /id="reminderConsent" type="checkbox"/)
  assert.match(html, /data-i18n="settings\.account\.remindersNoDelivery"/)
  assert.match(html, /data-i18n="settings\.account\.localProgressNote"/)
})

test('reminder controls collect schedule and consent without an email field', () => {
  const reminders = html.match(
    /<div class="settings-account-reminders">([\s\S]*?)<\/div>\s*<p class="settings-note"/
  )?.[1] || ''

  assert.match(reminders, /name="reminderDay" value="1"/)
  assert.match(reminders, /name="reminderDay" value="7"/)
  assert.match(reminders, /data-reminder-action="cancel"/)
  assert.match(reminders, /data-reminder-action="retry"/)
  assert.doesNotMatch(reminders, /type="email"|name="email"/)
})

test('signed-in Account presentation owns the internal Plus information', () => {
  const signedIn = html.match(
    /<div class="settings-account-signed-in hidden" id="accountSignedIn">([\s\S]*?)<\/div>\s*<p class="settings-account-feedback/
  )?.[1] || ''

  assert.match(signedIn, /id="accountPlusBadge"/)
  assert.match(signedIn, /id="accountPlusSubscription"/)
  assert.match(signedIn, /id="accountPlusPlan"/)
  assert.match(signedIn, /id="accountPlusPeriod"/)
  assert.match(signedIn, /data-account-action="refresh-plus"/)
  assert.match(signedIn, /data-account-action="billing"/)
  assert.match(signedIn, /data-account-action="explore-plus"/)
})
