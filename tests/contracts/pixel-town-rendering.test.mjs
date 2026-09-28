import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile, access } from 'node:fs/promises'
import { compose } from '../../src/experiments/pixel-town/compose.js'
import { artwork } from '../../src/experiments/pixel-town/artwork.js'
import { ASSETS } from '../../src/experiments/pixel-town/catalog-data.js'
import { fingerprints } from '../support/pixel-town-fingerprints.mjs'

test('extracted artwork preserves pre-refactor scene, object and variant RGBA', async () => {
  const baseline = JSON.parse(await readFile(
    new URL('../fixtures/pixel-town/pre-extraction.json', import.meta.url), 'utf8'
  ))
  const actual = fingerprints({ compose, artwork })
  assert.deepEqual(Object.keys(actual), Object.keys(baseline.fingerprints))
  for (const [name, digest] of Object.entries(baseline.fingerprints))
    assert.equal(actual[name], digest, name)
})

test('catalog source pointers resolve to editable object geometry or variant settings', async () => {
  for (const asset of ASSETS) {
    const expected = asset.variant
      ? 'src/experiments/pixel-town/parameters.js'
      : `src/experiments/pixel-town/objects/${asset.kind}.js`
    assert.equal(asset.source, expected)
    await access(new URL(`../../${asset.source}`, import.meta.url))
  }
})
