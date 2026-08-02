import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const source = await readFile(new URL('../../index.html', import.meta.url), 'utf8')
const styleSource = await readFile(
  new URL('../../src/styles/91-feedback.css', import.meta.url),
  'utf8'
)
const introStyleSource = await readFile(
  new URL('../../src/styles/10-intro.css', import.meta.url),
  'utf8'
)
const footer = source.match(/<footer class="app-footer">([\s\S]*?)<\/footer>/)?.[1] ?? ''
const supportLink = footer.match(/<a\b[^>]*class="support-link"[^>]*>/)?.[0] ?? ''
const creatorLinks = [
  ...source.matchAll(/<nav class="intro-creator-links"[^>]*>([\s\S]*?)<\/nav>/g)
].map(match => match[1])

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

test('trailer and Settings expose icon-only Ko-fi support links instead of Kick', () => {
  assert.equal(creatorLinks.length, 2)

  for (const links of creatorLinks) {
    const support = links.match(
      /<a\b[^>]*class="intro-social-link intro-social-support"[^>]*>/
    )?.[0] ?? ''

    assert.notEqual(support, '')
    assert.equal(getAttribute(support, 'href'), 'https://ko-fi.com/bricelearnstuff')
    assert.equal(getAttribute(support, 'target'), '_blank')
    assert.equal(getAttribute(support, 'rel'), 'noopener noreferrer')
    assert.equal(getAttribute(support, 'data-analytics-action'), 'support.kofi')
    assert.match(links, /<svg class="intro-social-support-icon"[^>]*aria-hidden="true">/)
    assert.match(
      links,
      /<span class="sr-only" data-i18n="support\.button">Support me<\/span>/
    )
  }

  assert.doesNotMatch(source, /kick\.com\/bricelearnstuff|intro-social-kick|>Kick<\/a>/)
  assert.doesNotMatch(introStyleSource, /intro-social-kick/)
})

test('creator support hearts inherit the shared rounded-link height', () => {
  const supportRule = introStyleSource.match(
    /\.intro-social-link\.intro-social-support\s*{([^}]*)}/s
  )?.[1] ?? ''

  assert.match(supportRule, /align-items:\s*center;/)
  assert.match(supportRule, /display:\s*inline-flex;/)
  assert.match(supportRule, /justify-content:\s*center;/)
  assert.doesNotMatch(supportRule, /\b(?:border|box-shadow|height|padding|width):/)
  assert.match(
    introStyleSource,
    /\.intro-social-support-icon\s*{[^}]*height:\s*1em;[^}]*width:\s*1em;/s
  )
  assert.match(
    introStyleSource,
    /\.intro-social-support:hover\s*{\s*background:\s*#c026d3;\s*border-color:\s*#c026d3;\s*color:\s*#fff;\s*}/
  )
  assert.match(
    introStyleSource,
    /body\[data-theme="dark"\] \.intro-social-link\.intro-social-support:hover\s*{\s*color:\s*#fff;\s*}/
  )
})

test('support and feedback share a surface while their icons stay distinct', () => {
  assert.match(
    styleSource,
    /\.feedback-launch-btn,\s*\.support-link\s*{[^}]*background: var\(--surface\);/s
  )
  assert.match(
    styleSource,
    /\.feedback-launch-btn:hover,\s*\.support-link:hover\s*{[^}]*background: var\(--mint\);/s
  )
  assert.match(styleSource, /\.feedback-launch-icon\s*{\s*stroke: var\(--accent-dim\);\s*}/)
  assert.match(styleSource, /\.support-link-icon\s*{\s*stroke: var\(--error\);\s*}/)
})
