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

const EXPECTED_SOURCE_BYTES = 255416
const EXPECTED_SOURCE_SHA256 =
  '3bd8076c6e9b804f1ad0fe7d2a8d2df4d65f83dcfcfce00eea6b3a7ae25485e7'
const EXPECTED_BUILT_SHA256 =
  '378c8ec3df16848ee11fcd402bcbb7b314705c6d79bb6c9f9d2bd3c875e47a9e'

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
