import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import {
  hasCoarsePrimaryPointer,
  matchesResponsiveMedia,
  prefersReducedMotion,
  RESPONSIVE_QUERIES,
  supportsAnkiIntegrationInput,
  supportsChannelShelfMouseDrag,
  supportsVideoShelfPreviewInput,
  usesCompactPortraitComposition,
  usesDocumentHeatmapPositioning,
  usesPhoneComposition,
  usesTabletCoarseInput,
  usesTapVideoShelfPreviewInput
} from '../../src/core/responsive-capabilities.js'

const appSource = await readFile(
  new URL('../../src/app.js', import.meta.url),
  'utf8'
)

function createMatcher(activeQueries = []) {
  const active = new Set(activeQueries)
  return query => ({ matches: active.has(query), media: query })
}

test('responsive capability names preserve every existing media boundary', () => {
  const active = [
    RESPONSIVE_QUERIES.phone,
    RESPONSIVE_QUERIES.compactPortrait,
    RESPONSIVE_QUERIES.coarsePrimary,
    RESPONSIVE_QUERIES.tabletCoarse,
    RESPONSIVE_QUERIES.wideNoHover,
    RESPONSIVE_QUERIES.reducedMotion
  ]
  const matcher = createMatcher(active)
  assert.equal(usesPhoneComposition(matcher), true)
  assert.equal(usesCompactPortraitComposition(matcher), true)
  assert.equal(hasCoarsePrimaryPointer(matcher), true)
  assert.equal(usesTabletCoarseInput(matcher), true)
  assert.equal(usesTapVideoShelfPreviewInput(matcher), true)
  assert.equal(supportsVideoShelfPreviewInput(matcher), true)
  assert.equal(supportsChannelShelfMouseDrag(matcher), false)
  assert.equal(prefersReducedMotion(matcher), true)
})

test('Anki and heatmap capabilities retain combined width/input behavior', () => {
  assert.equal(
    supportsAnkiIntegrationInput(createMatcher([])),
    true
  )
  assert.equal(
    supportsAnkiIntegrationInput(createMatcher([
      RESPONSIVE_QUERIES.phoneOrAnyCoarse
    ])),
    false
  )
  assert.equal(
    usesDocumentHeatmapPositioning(
      1200,
      createMatcher([RESPONSIVE_QUERIES.coarsePrimary])
    ),
    true
  )
  assert.equal(
    usesDocumentHeatmapPositioning(768, createMatcher([])),
    true
  )
  assert.equal(
    usesDocumentHeatmapPositioning(769, createMatcher([])),
    false
  )
})

test('media matching fails closed when matchMedia is unavailable', () => {
  assert.equal(matchesResponsiveMedia('(unknown)', {}), false)
  assert.equal(usesPhoneComposition({}), false)
})

test('application decisions use named capabilities instead of raw device checks', () => {
  assert.doesNotMatch(appSource, /\bisMobileLayout\b/)
  assert.doesNotMatch(appSource, /\bwindow\.matchMedia\b/)
  assert.match(
    appSource,
    /function canReorderChannelShelves\(\) \{\s*return supportsChannelShelfMouseDrag\(\)/
  )
  assert.match(
    appSource,
    /function usesTapVideoShelfPreview\(\) \{\s*return usesTapVideoShelfPreviewInput\(\)/
  )
  assert.match(
    appSource,
    /function canUseVideoShelfPreview\(\) \{\s*return !document\.body\.classList\.contains\('walkthrough-active'\)\s*&& supportsVideoShelfPreviewInput\(\)/
  )
})
