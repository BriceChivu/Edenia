import assert from 'node:assert/strict'
import test from 'node:test'
import {
  containsNonLatinLetter,
  isSupportedChannelSearchQuery,
  normalizeChannelSearchText,
  tokenMatchesChannelSearch
} from '../../src/features/channels/search-model.js'

test('channel search normalization preserves searchable Unicode letters', () => {
  assert.equal(normalizeChannelSearchText('  Café・中文  '), 'cafe 中文')
  assert.equal(normalizeChannelSearchText('かなこ / 日本語'), 'かなこ 日本語')
  assert.equal(normalizeChannelSearchText('빅키쌤'), '빅키쌤')
})

test('non-Latin searches support one meaningful character while Latin keeps two', () => {
  assert.equal(containsNonLatinLetter('叔'), true)
  assert.equal(containsNonLatinLetter('かな'), true)
  assert.equal(containsNonLatinLetter('한국어'), true)
  assert.equal(containsNonLatinLetter('Cafe'), false)
  assert.equal(isSupportedChannelSearchQuery('叔'), true)
  assert.equal(isSupportedChannelSearchQuery('あ'), true)
  assert.equal(isSupportedChannelSearchQuery('한'), true)
  assert.equal(isSupportedChannelSearchQuery('a'), false)
  assert.equal(isSupportedChannelSearchQuery('ab'), true)
  assert.equal(isSupportedChannelSearchQuery('  '), false)
})

test('non-Latin tokens match internal substrings without broadening Latin matching', () => {
  assert.equal(tokenMatchesChannelSearch('叔中', ['大叔中文']), true)
  assert.equal(tokenMatchesChannelSearch('たしン', ['あたしンち公式チャンネル']), true)
  assert.equal(tokenMatchesChannelSearch('키쌤', ['빅키쌤']), true)
  assert.equal(tokenMatchesChannelSearch('andarin', ['mandarin']), false)
  assert.equal(tokenMatchesChannelSearch('mand', ['mandarin']), true)
  assert.equal(tokenMatchesChannelSearch('mandarin', ['mand']), true)
})
