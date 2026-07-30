import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import {
  bindImageFallbackActions
} from '../../src/features/images/fallback-actions.js'

const appSource = await readFile(
  new URL('../../src/app.js', import.meta.url),
  'utf8'
)

function createRoot() {
  let listener = null
  return {
    addEventListener(type, nextListener, capture) {
      assert.equal(type, 'error')
      assert.equal(capture, true)
      listener = nextListener
    },
    dispatch(target) {
      listener?.({ target })
    }
  }
}

function createImage(matches) {
  return {
    hidden: false,
    matches(selector) {
      assert.equal(selector, '[data-image-fallback-action="hide"]')
      return matches
    }
  }
}

test('capture-phase image fallback hides only opted-in failed images', () => {
  const root = createRoot()
  assert.equal(bindImageFallbackActions(root), true)
  const optedIn = createImage(true)
  const ordinary = createImage(false)
  root.dispatch(ordinary)
  root.dispatch(optedIn)
  assert.equal(ordinary.hidden, false)
  assert.equal(optedIn.hidden, true)
  assert.equal(bindImageFallbackActions(root), false)
})

test('all generated fallbacks use the early capture owner without inline code', () => {
  assert.equal(
    [...appSource.matchAll(/data-image-fallback-action="hide"/g)].length,
    3
  )
  assert.doesNotMatch(appSource, /<[^>]*\son[a-z]+\s*=\s*["']/)
  const bindIndex = appSource.indexOf('bindImageFallbackActions(document)')
  const initIndex = appSource.indexOf(
    "document.addEventListener('DOMContentLoaded', init)"
  )
  assert.notEqual(bindIndex, -1)
  assert.ok(initIndex > bindIndex)
})

test('image fallback binding validates its event boundary', () => {
  assert.throws(
    () => bindImageFallbackActions(null),
    /event target root/
  )
  assert.throws(
    () => bindImageFallbackActions({}),
    /event target root/
  )
})
