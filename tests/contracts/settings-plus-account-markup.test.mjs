import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const html = await readFile(new URL('../../index.html', import.meta.url), 'utf8')

test('Settings contains no legacy Plus account or subscription surface', () => {
  assert.doesNotMatch(html, /id="plusAccountSettings"/)
  assert.doesNotMatch(html, /data-plus-account-action=/)
  assert.doesNotMatch(html, /id="accountPlus(?:Badge|Subscription|Plan|Period)"/)
  assert.doesNotMatch(html, /data-account-action="(?:refresh-plus|billing|explore-plus)"/)
})
