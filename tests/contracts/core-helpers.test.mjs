import assert from 'node:assert/strict'
import test from 'node:test'
import { escHtml, escapeSvgText } from '../../src/core/escaping.js'

test('HTML escaping preserves the exact legacy character contract', () => {
  assert.equal(escHtml(null), '')
  assert.equal(escHtml(undefined), '')
  assert.equal(escHtml(42), '42')
  assert.equal(
    escHtml(`&<>"'`),
    `&amp;&lt;&gt;&quot;'`
  )
  assert.equal(escHtml('&amp;'), '&amp;amp;')
})

test('SVG text escaping preserves the exact narrower legacy contract', () => {
  assert.equal(escapeSvgText(null), '')
  assert.equal(escapeSvgText(undefined), '')
  assert.equal(escapeSvgText(42), '42')
  assert.equal(
    escapeSvgText(`&<>"'`),
    `&amp;&lt;&gt;"'`
  )
  assert.equal(escapeSvgText('&amp;'), '&amp;amp;')
})
