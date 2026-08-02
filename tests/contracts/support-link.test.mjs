import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const source = await readFile(new URL('../../index.html', import.meta.url), 'utf8')
const footer = source.match(/<footer class="app-footer">([\s\S]*?)<\/footer>/)?.[1] ?? ''
const supportLink = footer.match(/<a\b[^>]*class="support-link"[^>]*>/)?.[0] ?? ''

function getAttribute(tag, name) {
  return tag.match(new RegExp(`\\s${name}="([^"]*)"`))?.[1] ?? null
}

test('Ko-fi support link is the safe left-hand footer action', () => {
  assert.notEqual(supportLink, '')
  assert.equal(getAttribute(supportLink, 'href'), 'https://ko-fi.com/bricelearnstuff')
  assert.equal(getAttribute(supportLink, 'target'), '_blank')
  assert.equal(getAttribute(supportLink, 'rel'), 'noopener noreferrer')
  assert.equal(getAttribute(supportLink, 'data-analytics-action'), 'support.kofi')
  assert.match(footer, /<span data-i18n="support\.button">Support me<\/span>/)
  assert.ok(
    footer.indexOf('class="support-link"') < footer.indexOf('id="feedbackLaunchBtn"'),
    'Support link should appear to the left of Feedback'
  )
})

test('Ko-fi overlay JavaScript is not loaded', () => {
  assert.doesNotMatch(source, /overlay-widget\.js|kofiWidgetOverlay/)
})
