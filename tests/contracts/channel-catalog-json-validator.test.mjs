import assert from 'node:assert/strict'
import test from 'node:test'
import {
  validateChannelCatalogJson
} from '../../scripts/validate-channel-catalog-json.mjs'

function catalog(schemaVersion = 1, channels = []) {
  return { schemaVersion, channels }
}

test('general catalog validation accepts discovery schema versions 1 and 2', () => {
  assert.doesNotThrow(() => (
    validateChannelCatalogJson('channel-catalog.discovered.json', catalog(1))
  ))
  assert.doesNotThrow(() => (
    validateChannelCatalogJson('channel-catalog.discovered.json', catalog(2))
  ))
})

test('general catalog validation keeps every other catalog on schema version 1', () => {
  for (const fileName of [
    'channel-catalog.candidates.json',
    'channel-catalog.community.json',
    'channel-catalog.json',
    'channel-catalog.source.json'
  ]) {
    assert.throws(
      () => validateChannelCatalogJson(fileName, catalog(2)),
      new RegExp(`${fileName.replaceAll('.', '\\.')} must use schemaVersion 1`)
    )
  }
})

test('general catalog validation remains fail closed for unknown schemas', () => {
  assert.throws(
    () => validateChannelCatalogJson('channel-catalog.discovered.json', catalog(3)),
    /must use schemaVersion 1 or 2/
  )
})

test('general catalog validation still rejects duplicate catalog IDs', () => {
  assert.throws(
    () => validateChannelCatalogJson('channel-catalog.discovered.json', catalog(2, [
      { catalogId: 'discovered-example' },
      { catalogId: 'DISCOVERED-EXAMPLE' }
    ])),
    /contains duplicate catalogId/
  )
})
