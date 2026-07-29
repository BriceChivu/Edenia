import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const indexSource = await readFile(
  new URL('../../index.html', import.meta.url),
  'utf8'
)
const appSource = await readFile(
  new URL('../../src/app.js', import.meta.url),
  'utf8'
)

function getButtonElements(source) {
  return [...source.matchAll(/<button\b[^>]*>[\s\S]*?<\/button>/g)]
    .map(match => match[0])
}

function getOpeningTag(element) {
  return element.match(/^<button\b[^>]*>/)?.[0] ?? ''
}

function getAttribute(tag, name) {
  return tag.match(new RegExp(`\\s${name}="([^"]*)"`))?.[1] ?? null
}

function hasClass(tag, className) {
  return String(getAttribute(tag, 'class') || '')
    .split(/\s+/)
    .includes(className)
}

function findSingleButton(source, predicate, description) {
  const matches = getButtonElements(source)
    .filter(element => predicate(getOpeningTag(element)))
  assert.equal(matches.length, 1, `Expected one ${description}`)
  return matches[0]
}

function normalizeClickEventName(action) {
  return `${String(action || '')
    .trim()
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .replace(/[^a-zA-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .toLowerCase()
    .slice(0, 80)}_clicked`
}

test('generated Set aside request controls retain their exact analytics identities', () => {
  const expectedControls = [
    {
      className: 'next-study-set-aside',
      type: 'button',
      surface: 'continue_watching',
      localizedContent: "${escHtml(t('videos.card.setAside'))}"
    },
    {
      className: 'set-aside-btn',
      type: null,
      surface: 'video_card',
      localizedContent: "${renderVideoActionIcon('set-aside')}"
    }
  ]

  for (const expected of expectedControls) {
    const element = findSingleButton(
      appSource,
      tag => hasClass(tag, expected.className),
      `${expected.surface} Set aside request control`
    )
    const tag = getOpeningTag(element)

    assert.equal(getAttribute(tag, 'type'), expected.type)
    assert.equal(getAttribute(tag, 'data-video-id'), '${safeVideoId}')
    assert.equal(
      getAttribute(tag, 'onclick'),
      `requestVideoSetAside(this.dataset.videoId, { surface: '${expected.surface}' })`
    )
    assert.equal(
      getAttribute(tag, 'data-analytics-action'),
      'requestVideoSetAside'
    )
    assert.equal(
      normalizeClickEventName(getAttribute(tag, 'data-analytics-action')),
      'request_video_set_aside_clicked'
    )
    assert.ok(
      element.includes(expected.localizedContent),
      `Expected localized content on the ${expected.surface} control`
    )
  }
})

test('video-card Set aside request keeps its localized accessible labels', () => {
  const element = findSingleButton(
    appSource,
    tag => hasClass(tag, 'set-aside-btn'),
    'video-card Set aside request control'
  )
  const tag = getOpeningTag(element)
  const localizedLabel = "${escHtml(t('videos.card.setAside'))}"

  assert.ok(hasClass(tag, 'action-btn'))
  assert.equal(getAttribute(tag, 'aria-label'), localizedLabel)
  assert.equal(getAttribute(tag, 'title'), localizedLabel)
})

test('static Set aside prompt actions retain exact handlers and analytics identities', () => {
  const expectedControls = [
    {
      className: 'btn-ghost',
      handler: 'cancelVideoSetAsidePrompt()',
      i18n: 'setAsidePrompt.cancel',
      eventName: 'set_aside_prompt_cancel_clicked'
    },
    {
      className: 'btn-primary',
      handler: 'confirmVideoSetAsidePrompt()',
      i18n: 'setAsidePrompt.confirm',
      eventName: 'set_aside_prompt_confirm_clicked'
    }
  ]

  for (const expected of expectedControls) {
    const element = findSingleButton(
      indexSource,
      tag => getAttribute(tag, 'onclick') === expected.handler,
      `${expected.i18n} control`
    )
    const tag = getOpeningTag(element)

    assert.ok(hasClass(tag, expected.className))
    assert.equal(getAttribute(tag, 'type'), 'button')
    assert.equal(getAttribute(tag, 'onclick'), expected.handler)
    assert.equal(getAttribute(tag, 'data-i18n'), expected.i18n)
    assert.equal(getAttribute(tag, 'data-analytics-action'), expected.i18n)
    assert.equal(
      normalizeClickEventName(getAttribute(tag, 'data-analytics-action')),
      expected.eventName
    )
  }
})

test('Set aside prompt overlay retains keydown ownership without click analytics', () => {
  const matches = [...indexSource.matchAll(/<div\b[^>]*\sid="setAsidePrompt"[^>]*>/g)]
    .map(match => match[0])
  assert.equal(matches.length, 1, 'Expected one #setAsidePrompt overlay')

  const [overlay] = matches
  assert.ok(hasClass(overlay, 'set-aside-prompt-overlay'))
  assert.ok(hasClass(overlay, 'hidden'))
  assert.equal(getAttribute(overlay, 'aria-hidden'), 'true')
  assert.equal(
    getAttribute(overlay, 'onkeydown'),
    'handleVideoSetAsidePromptKeydown(event)'
  )
  assert.equal(getAttribute(overlay, 'data-analytics-action'), null)
})
