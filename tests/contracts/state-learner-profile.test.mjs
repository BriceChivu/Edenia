import assert from 'node:assert/strict'
import test from 'node:test'
import {
  createLearnerProfileNormalizer
} from '../../src/state/learner-profile-state.js'

function createFixture() {
  const languageOptions = [{ id: 'mandarin' }, { id: 'french' }]
  const levelOptions = [{ id: 'beginner' }, { id: 'advanced' }]
  const channelCatalog = [{ id: 'channel-one' }, { id: 'channel-two' }]
  return {
    languageOptions,
    levelOptions,
    channelCatalog,
    normalize: createLearnerProfileNormalizer({
      languageOptions,
      levelOptions,
      channelCatalog
    })
  }
}

test('learner profile normalization filters, dedupes, and retains source order', () => {
  const { normalize } = createFixture()
  const state = {
    learnerProfile: {
      languages: ['french', 'invalid', 'mandarin', 'french'],
      level: 'advanced',
      selectedChannelCatalogIds: [
        'channel-two',
        'invalid',
        'channel-one',
        'channel-two'
      ],
      createdAt: '2026-07-28T00:00:00.000Z',
      updatedAt: 'invalid',
      extra: true
    }
  }
  assert.equal(normalize(state), true)
  assert.deepEqual(state.learnerProfile, {
    languages: ['french', 'mandarin'],
    level: 'advanced',
    selectedChannelCatalogIds: ['channel-two', 'channel-one'],
    createdAt: '2026-07-28T00:00:00.000Z',
    updatedAt: null
  })
  assert.equal(normalize(state), false)
})

test('learner profile defaults preserve nulls and empty arrays', () => {
  const { normalize } = createFixture()
  const state = { learnerProfile: [] }
  assert.equal(normalize(state), true)
  assert.deepEqual(state.learnerProfile, {
    languages: [],
    level: null,
    selectedChannelCatalogIds: [],
    createdAt: null,
    updatedAt: null
  })
  assert.equal(normalize(null), false)
})

test('learner profile normalizer re-reads product catalogs on every call', () => {
  const fixture = createFixture()
  const state = {
    learnerProfile: {
      languages: ['new-language'],
      level: 'new-level',
      selectedChannelCatalogIds: ['new-channel']
    }
  }
  fixture.normalize(state)
  assert.deepEqual(state.learnerProfile.languages, [])

  fixture.languageOptions.push({ id: 'new-language' })
  fixture.levelOptions.push({ id: 'new-level' })
  fixture.channelCatalog.push({ id: 'new-channel' })
  state.learnerProfile = {
    languages: ['new-language'],
    level: 'new-level',
    selectedChannelCatalogIds: ['new-channel']
  }
  fixture.normalize(state)
  assert.deepEqual(state.learnerProfile, {
    languages: ['new-language'],
    level: 'new-level',
    selectedChannelCatalogIds: ['new-channel'],
    createdAt: null,
    updatedAt: null
  })
})

test('learner profile normalization preserves catalog and mutation errors', () => {
  const normalizeMalformed = createLearnerProfileNormalizer({
    languageOptions: null,
    levelOptions: [],
    channelCatalog: []
  })
  assert.throws(
    () => normalizeMalformed({}),
    TypeError
  )

  const { normalize } = createFixture()
  assert.throws(
    () => normalize(Object.freeze({})),
    TypeError
  )
})
