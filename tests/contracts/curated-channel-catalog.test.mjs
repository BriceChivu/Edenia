import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import test from 'node:test'
import {
  CURATED_CHANNEL_CATALOG,
  CURATED_CHANNEL_SEARCH_IGNORED_WORDS,
  CURATED_CHANNEL_SEARCH_LANGUAGE_ALIASES,
  CURATED_NOT_SURE_CHANNEL_IDS
} from '../../src/features/channels/curated-catalog.js'

function hash(value) {
  return crypto
    .createHash('sha256')
    .update(JSON.stringify(value))
    .digest('hex')
}

test('curated channel catalog preserves exact membership, order, and fields', () => {
  assert.equal(CURATED_CHANNEL_CATALOG.length, 161)
  assert.equal(
    new Set(CURATED_CHANNEL_CATALOG.map(channel => channel.id)).size,
    161
  )
  assert.equal(
    hash(CURATED_CHANNEL_CATALOG),
    '67423923310e79dfa554b8dd2bfce15e16b4210a4017892519bc5273978bf1e2'
  )
  assert.deepEqual(CURATED_CHANNEL_CATALOG[0], {
    id: 'mandarin-grace',
    language: 'mandarin',
    input: '@GraceMandarinChinese',
    name: 'Grace Mandarin Chinese',
    levels: ['starting'],
    style: 'Clear explanations',
    description: 'Practical pronunciation, vocabulary, and culture lessons.'
  })
  assert.deepEqual(CURATED_CHANNEL_CATALOG.at(-1), {
    id: 'english-bbc-earth',
    language: 'english',
    input: '@bbcearth',
    name: 'BBC Earth',
    levels: ['advanced'],
    style: 'Clear explanations'
  })
})

test('curated search metadata preserves exact aliases, ignored words, and starter sets', () => {
  assert.equal(
    hash(CURATED_CHANNEL_SEARCH_LANGUAGE_ALIASES),
    'c9af238c58ebc583ea2f411f528c53937a9cb5e7095f7fe29447cfaf69f80240'
  )
  assert.equal(CURATED_CHANNEL_SEARCH_IGNORED_WORDS.size, 16)
  assert.equal(
    hash([...CURATED_CHANNEL_SEARCH_IGNORED_WORDS]),
    'ef9d6a4befd5a737007c33bdfb65847937d802a9fcda5c6b9c413aba31dbe19b'
  )
  assert.equal(
    hash(CURATED_NOT_SURE_CHANNEL_IDS),
    '14a21691f3c23a429abe338add15985dffda2c4fd2f7c49c549292e767ecc44b'
  )
})
