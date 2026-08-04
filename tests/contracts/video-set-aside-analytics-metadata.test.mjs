import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const indexSource = await readFile(new URL('../../index.html', import.meta.url), 'utf8')
const appSource = await readFile(new URL('../../src/app.js', import.meta.url), 'utf8')

function getButtons(source) {
  return [...source.matchAll(/<button\b[^>]*>[\s\S]*?<\/button>/g)]
    .map(match => match[0])
}

function openingTag(element) {
  return element.match(/^<button\b[^>]*>/)?.[0] ?? ''
}

function attribute(tag, name) {
  return tag.match(new RegExp(`\\s${name}="([^"]*)"`))?.[1] ?? null
}

function hasClass(tag, className) {
  return String(attribute(tag, 'class') || '').split(/\s+/).includes(className)
}

function findSingleButton(source, predicate, description) {
  const matches = getButtons(source).filter(element => predicate(openingTag(element)))
  assert.equal(matches.length, 1, `Expected one ${description}`)
  return matches[0]
}

test('legacy Set aside request controls retain their analytics surfaces', () => {
  for (const expected of [
    { className: 'next-study-set-aside', surface: 'continue_watching' },
    { className: 'set-aside-btn', surface: 'video_card' }
  ]) {
    const element = findSingleButton(
      appSource,
      tag => hasClass(tag, expected.className),
      `${expected.surface} Set aside request control`
    )
    const tag = openingTag(element)
    assert.equal(attribute(tag, 'data-video-id'), '${safeVideoId}')
    assert.equal(attribute(tag, 'data-video-set-aside-action'), 'request')
    assert.equal(attribute(tag, 'data-video-set-aside-surface'), expected.surface)
    assert.equal(attribute(tag, 'data-analytics-action'), 'requestVideoSetAside')
    assert.equal(attribute(tag, 'onclick'), null)
  }
})

test('static Set aside prompt actions retain module ownership and analytics', () => {
  for (const expected of [
    { action: 'cancel', key: 'setAsidePrompt.cancel' },
    { action: 'confirm', key: 'setAsidePrompt.confirm' }
  ]) {
    const element = findSingleButton(
      indexSource,
      tag => attribute(tag, 'data-video-set-aside-action') === expected.action,
      `Set aside prompt ${expected.action} control`
    )
    const tag = openingTag(element)
    assert.equal(attribute(tag, 'type'), 'button')
    assert.equal(attribute(tag, 'data-i18n'), expected.key)
    assert.equal(attribute(tag, 'data-analytics-action'), expected.key)
    assert.equal(attribute(tag, 'onclick'), null)
  }

  const overlays = [...indexSource.matchAll(/<div\b[^>]*\sid="setAsidePrompt"[^>]*>/g)]
  assert.equal(overlays.length, 1)
  assert.equal(attribute(overlays[0][0], 'data-video-set-aside-action'), 'prompt')
  assert.equal(attribute(overlays[0][0], 'data-analytics-action'), null)
})
