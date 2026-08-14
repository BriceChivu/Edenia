import assert from 'node:assert/strict'
import test from 'node:test'

import {
  GITHUB_PAGES_IPV4,
  parseExpectedMigrationFlag,
  parseRuntimeConfig,
  verifyDomainMigration
} from '../../scripts/verify-domain-migration.mjs'

const CANONICAL_ROOT = 'https://www.edenia.study/'
const HELPER_ROOT = 'https://bricechivu.github.io/edenia-migrate/'

function response({ body = '', location = null, status = 200, url }) {
  return {
    status,
    url,
    headers: new Headers(location ? { location } : {}),
    async text() {
      return body
    }
  }
}

function createHealthyDependencies(overrides = {}) {
  const runtimeConfig = {
    legacyProgressMigrationEnabled: false,
    plusCheckoutEnabled: false,
    accountFeaturesRollout: 'internal'
  }
  const responses = new Map([
    [CANONICAL_ROOT, response({
      body: '<!doctype html><title>Edenia</title>',
      url: CANONICAL_ROOT
    })],
    [`${CANONICAL_ROOT}config.local.js`, response({
      body: `window.EDENIA_CONFIG = ${JSON.stringify(runtimeConfig, null, 2)}\n`,
      url: `${CANONICAL_ROOT}config.local.js`
    })],
    ['https://edenia.study/plus/?edenia_cutover_probe=1', response({
      location: 'https://www.edenia.study/plus/?edenia_cutover_probe=1',
      status: 301,
      url: 'https://edenia.study/plus/?edenia_cutover_probe=1'
    })],
    ['https://bricechivu.github.io/Edenia/?edenia_cutover_probe=1', response({
      location: 'https://www.edenia.study/?edenia_cutover_probe=1',
      status: 301,
      url: 'https://bricechivu.github.io/Edenia/?edenia_cutover_probe=1'
    })],
    [HELPER_ROOT, response({
      body: '<title>Move your Edenia progress</title><meta name="referrer" content="no-referrer"><meta http-equiv="Content-Security-Policy" content="default-src \'none\'">',
      url: HELPER_ROOT
    })],
    [`${CANONICAL_ROOT}plus/`, response({
      body: '<title>Edenia Plus</title>',
      url: `${CANONICAL_ROOT}plus/`
    })],
    [`${CANONICAL_ROOT}unsubscribe/`, response({
      body: '<title>Study reminder preferences · Edenia</title>',
      url: `${CANONICAL_ROOT}unsubscribe/`
    })]
  ])

  return {
    dns: {
      async resolve4() {
        return overrides.ipv4 || [...GITHUB_PAGES_IPV4]
      },
      async resolve6() {
        return overrides.ipv6 || []
      },
      async resolveCname() {
        return overrides.cname || ['bricechivu.github.io']
      },
      async resolveTxt() {
        return overrides.txt ?? [['github-pages-challenge']]
      }
    },
    async fetchImpl(url) {
      if (overrides.responses?.has(url)) return overrides.responses.get(url)
      const value = responses.get(url)
      assert(value, `unexpected URL ${url}`)
      return value
    }
  }
}

test('domain verifier accepts the exact safe cutover surface', async () => {
  const result = await verifyDomainMigration(createHealthyDependencies())

  assert.equal(result.ok, true)
  assert.equal(result.checks.length, 11)
  assert.deepEqual(result.checks.filter(check => !check.ok), [])
})

test('domain verifier rejects parking DNS and an unexpected enabled migration', async () => {
  const badResponses = new Map()
  badResponses.set(`${CANONICAL_ROOT}config.local.js`, response({
    body: 'window.EDENIA_CONFIG = {"legacyProgressMigrationEnabled":true,"plusCheckoutEnabled":false,"accountFeaturesRollout":"internal"}\n',
    url: `${CANONICAL_ROOT}config.local.js`
  }))
  const dependencies = createHealthyDependencies({
    ipv4: ['192.64.119.36'],
    cname: ['parkingpage.namecheap.com'],
    responses: badResponses
  })

  const result = await verifyDomainMigration(dependencies)

  assert.equal(result.ok, false)
  assert.deepEqual(
    result.checks.filter(check => !check.ok).map(check => check.name),
    [
      'Apex uses GitHub Pages IPv4',
      'www CNAME targets GitHub Pages',
      'Canonical runtime matches expected rollout'
    ]
  )
})

test('domain verifier accepts an explicitly expected public migration rollout', async () => {
  const runtimeResponse = new Map()
  runtimeResponse.set(`${CANONICAL_ROOT}config.local.js`, response({
    body: 'window.EDENIA_CONFIG = {"legacyProgressMigrationEnabled":true,"plusCheckoutEnabled":false,"accountFeaturesRollout":"internal"}\n',
    url: `${CANONICAL_ROOT}config.local.js`
  }))
  const dependencies = createHealthyDependencies({
    responses: runtimeResponse
  })

  const result = await verifyDomainMigration({
    ...dependencies,
    expectedLegacyProgressMigrationEnabled: true
  })

  assert.equal(result.ok, true)
  assert.deepEqual(result.checks.filter(check => !check.ok), [])
})

test('domain verifier rejects missing ownership, foreign IPv6, redirects, and helper analytics', async () => {
  const badResponses = new Map()
  badResponses.set('https://edenia.study/plus/?edenia_cutover_probe=1', response({
    location: 'https://attacker.example/plus/',
    status: 302,
    url: 'https://edenia.study/plus/?edenia_cutover_probe=1'
  }))
  badResponses.set(HELPER_ROOT, response({
    body: '<title>Move your Edenia progress</title><meta name="referrer" content="no-referrer"><meta http-equiv="Content-Security-Policy" content="default-src \'none\'"><script src="analytics.js"></script>',
    url: HELPER_ROOT
  }))
  const dependencies = createHealthyDependencies({
    ipv6: ['2001:db8::1'],
    txt: [],
    responses: badResponses
  })

  const result = await verifyDomainMigration(dependencies)

  assert.equal(result.ok, false)
  assert.deepEqual(
    result.checks.filter(check => !check.ok).map(check => check.name),
    [
      'GitHub ownership TXT exists',
      'Apex IPv6 is absent or exact',
      'Apex redirects path and query to www',
      'Legacy helper remains isolated and reachable'
    ]
  )
})

test('runtime config parser rejects extra executable content', () => {
  assert.deepEqual(
    parseRuntimeConfig('window.EDENIA_CONFIG = {"legacyProgressMigrationEnabled":false}\n'),
    { legacyProgressMigrationEnabled: false }
  )
  assert.throws(
    () => parseRuntimeConfig('alert(1); window.EDENIA_CONFIG = {}'),
    /one EDENIA_CONFIG object/
  )
})

test('expected migration flag parser is strict and defaults off', () => {
  assert.equal(parseExpectedMigrationFlag(undefined), false)
  assert.equal(parseExpectedMigrationFlag(''), false)
  assert.equal(parseExpectedMigrationFlag('false'), false)
  assert.equal(parseExpectedMigrationFlag('true'), true)
  assert.throws(
    () => parseExpectedMigrationFlag('1'),
    /must be true or false/
  )
})
