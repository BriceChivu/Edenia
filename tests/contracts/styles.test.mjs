import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import { readOrderedStyleSource } from '../../scripts/read-style-source.mjs'

const EXPECTED_STYLE_FILES = [
  '00-foundations.css',
  '10-intro.css',
  '20-settings-onboarding.css',
  '30-header.css',
  '40-city.css',
  '50-analytics.css',
  '60-study-history.css',
  '70-video-feed.css',
  '80-walkthrough.css',
  '90-toast.css',
  '91-feedback.css',
  '92-plus.css',
  '95-global-adjustments.css',
  '96-responsive-page-flows.css',
  '97-responsive-input.css',
  '98-responsive-phone.css',
  '99-responsive-wide.css'
]

const EXPECTED_SOURCE_BYTES = 252016
const EXPECTED_SOURCE_SHA256 =
  '955e2a85fa633c499aa662c35b8a92ad8af33053aa7520cea3f94563b660893e'
const EXPECTED_BUILT_SHA256 =
  'eb58894487fc4b01e5e2cbcc1ec588dcaadc7ef05be4e92d27a9f072c1f80b13'

function sha256(value) {
  return createHash('sha256').update(value).digest('hex')
}

test('ordered style sections reproduce the protected stylesheet exactly', async () => {
  const indexPath = new URL('../../src/styles/index.css', import.meta.url)
  const { files, source } = await readOrderedStyleSource(indexPath)

  assert.deepEqual(files, EXPECTED_STYLE_FILES)
  assert.equal(source.length, EXPECTED_SOURCE_BYTES)
  assert.equal(sha256(source), EXPECTED_SOURCE_SHA256)
})

test('built stylesheet remains byte-identical after source decomposition', async () => {
  const builtStyle = await readFile(
    new URL('../../_site/style.css', import.meta.url)
  )

  assert.equal(sha256(builtStyle), EXPECTED_BUILT_SHA256)
})
