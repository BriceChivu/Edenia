import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import { transform } from 'esbuild'
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

test('style index preserves the complete ordered section contract', async () => {
  const indexPath = new URL('../../src/styles/index.css', import.meta.url)
  const { files } = await readOrderedStyleSource(indexPath)

  assert.deepEqual(files, EXPECTED_STYLE_FILES)
})

test('built stylesheet matches the current ordered source', async () => {
  const indexPath = new URL('../../src/styles/index.css', import.meta.url)
  const { source } = await readOrderedStyleSource(indexPath)
  const expectedStyle = await transform(source.toString('utf8'), {
    legalComments: 'none',
    loader: 'css',
    minify: true,
    target: 'es2022'
  })
  const builtStyle = await readFile(
    new URL('../../_site/style.css', import.meta.url),
    'utf8'
  )

  assert.equal(builtStyle, expectedStyle.code)
})

test('the learner-profile sync status keeps the protected phone touch target', async () => {
  const responsiveInput = await readFile(
    new URL('../../src/styles/97-responsive-input.css', import.meta.url),
    'utf8'
  )

  assert.match(
    responsiveInput,
    /@media \(max-width: 640px\)[\s\S]*\.learner-profile-sync-status[\s\S]*min-height: 44px;/
  )
})
