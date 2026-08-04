import assert from 'node:assert/strict'
import test from 'node:test'
import {
  parseRuntimeConfigFlag
} from '../../scripts/runtime-config-flags.mjs'

test('runtime release flags are disabled by default and accept explicit booleans', () => {
  assert.equal(parseRuntimeConfigFlag(undefined, 'FLAG'), false)
  assert.equal(parseRuntimeConfigFlag('', 'FLAG'), false)
  assert.equal(parseRuntimeConfigFlag('false', 'FLAG'), false)
  assert.equal(parseRuntimeConfigFlag(' FALSE ', 'FLAG'), false)
  assert.equal(parseRuntimeConfigFlag('true', 'FLAG'), true)
  assert.equal(parseRuntimeConfigFlag(' TRUE ', 'FLAG'), true)
})

test('runtime release flags reject ambiguous deployment values', () => {
  assert.throws(
    () => parseRuntimeConfigFlag('1', 'EDENIA_FREE_PLUS_ENABLED'),
    /EDENIA_FREE_PLUS_ENABLED must be true or false/
  )
  assert.throws(
    () => parseRuntimeConfigFlag('yes', 'EDENIA_PLUS_CHECKOUT_ENABLED'),
    /EDENIA_PLUS_CHECKOUT_ENABLED must be true or false/
  )
  assert.throws(
    () => parseRuntimeConfigFlag('1', 'EDENIA_VIDEO_ORGANIZATION_ENABLED'),
    /EDENIA_VIDEO_ORGANIZATION_ENABLED must be true or false/
  )
})
