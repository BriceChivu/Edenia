import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const appSource = await readFile(new URL('../../src/app.js', import.meta.url), 'utf8')

test('phone city zoom doubles the cap without changing desktop and tablet limits', () => {
  assert.match(appSource, /const CITY_IMAGE_MAX_ZOOM = 2/)
  assert.match(appSource, /const CITY_IMAGE_PHONE_MAX_ZOOM = 4/)
  assert.match(
    appSource,
    /function getCityImageMaxZoom\(\) \{\s*return usesPhoneComposition\(\)\s*\? CITY_IMAGE_PHONE_MAX_ZOOM\s*: CITY_IMAGE_MAX_ZOOM\s*\}/
  )
  assert.equal(
    appSource.match(/getCityImageMaxZoom\(\)/g)?.length,
    5,
    'helper definition plus pinch, button eligibility, button application, and resize clamp'
  )
  assert.match(
    appSource,
    /window\.addEventListener\('resize', \(\) => \{\s*cityImageView\.scale = clampNumber\(\s*cityImageView\.scale,\s*CITY_IMAGE_MIN_ZOOM,\s*getCityImageMaxZoom\(\)/
  )
})
