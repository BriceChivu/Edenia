import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const html = await readFile(new URL('../../index.html', import.meta.url), 'utf8')

test('Settings contains a dormant passwordless Plus account surface', () => {
  assert.match(
    html,
    /class="settings-group settings-plus-account hidden" id="plusAccountSettings"/
  )
  assert.match(
    html,
    /data-plus-account-action="restore-form"/
  )
  assert.match(
    html,
    /id="plusAccountEmail"[^>]*type="email"[^>]*autocomplete="email"/
  )
  assert.match(html, /data-plus-account-action="refresh"/)
  assert.match(html, /data-plus-account-action="sign-out"/)
  assert.match(html, /data-plus-account-action="billing"/)
  assert.match(html, /data-plus-account-action="explore"/)
  assert.match(html, /id="plusAccountPlan"/)
  assert.match(html, /id="plusAccountPeriod"/)
  assert.match(
    html,
    /data-i18n="settings\.plusAccount\.localProgressNote"/
  )
})
