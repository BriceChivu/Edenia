import {
  resolve4 as resolveIpv4,
  resolve6 as resolveIpv6,
  resolveCname,
  resolveTxt
} from 'node:dns/promises'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

export const GITHUB_PAGES_IPV4 = Object.freeze([
  '185.199.108.153',
  '185.199.109.153',
  '185.199.110.153',
  '185.199.111.153'
])

export const GITHUB_PAGES_IPV6 = Object.freeze([
  '2606:50c0:8000::153',
  '2606:50c0:8001::153',
  '2606:50c0:8002::153',
  '2606:50c0:8003::153'
])

const DOMAIN = 'edenia.study'
const CANONICAL_ROOT = 'https://www.edenia.study/'
const LEGACY_ROOT = 'https://bricechivu.github.io/Edenia/'
const HELPER_ROOT = 'https://bricechivu.github.io/edenia-migrate/'
const VERIFICATION_HOST = '_github-pages-challenge-bricechivu.edenia.study'
const REDIRECT_STATUSES = new Set([301, 302, 307, 308])

function normalizeDnsName(value) {
  return String(value || '').trim().toLowerCase().replace(/\.$/, '')
}

function equalSets(actual, expected) {
  return JSON.stringify([...new Set(actual)].sort())
    === JSON.stringify([...new Set(expected)].sort())
}

function assert(condition, message) {
  if (!condition) throw new Error(message)
}

async function resolveOptional(resolver, hostname) {
  try {
    return await resolver(hostname)
  } catch (error) {
    if (error?.code === 'ENODATA' || error?.code === 'ENOTFOUND') return []
    throw error
  }
}

async function request(fetchImpl, url, redirect) {
  const response = await fetchImpl(url, {
    redirect,
    signal: AbortSignal.timeout(15_000),
    headers: {
      'user-agent': 'Edenia domain migration verifier/1'
    }
  })
  assert(response && typeof response.status === 'number', `${url} returned no response`)
  return response
}

async function requireHtml(fetchImpl, url, expectedMarker) {
  const response = await request(fetchImpl, url, 'follow')
  assert(response.status === 200, `${url} returned HTTP ${response.status}`)
  assert(response.url === url, `${url} ended at ${response.url || 'an unknown URL'}`)
  const body = await response.text()
  assert(body.includes(expectedMarker), `${url} did not contain its expected page marker`)
  return body
}

async function requireRedirect(fetchImpl, source, expectedDestination) {
  const response = await request(fetchImpl, source, 'manual')
  assert(
    REDIRECT_STATUSES.has(response.status),
    `${source} returned HTTP ${response.status} instead of a redirect`
  )
  const location = response.headers.get('location')
  assert(location, `${source} returned no Location header`)
  const destination = new URL(location, source).href
  assert(
    destination === expectedDestination,
    `${source} redirected to ${destination} instead of ${expectedDestination}`
  )
  return destination
}

export function parseRuntimeConfig(source) {
  const match = String(source || '').match(
    /^\s*window\.EDENIA_CONFIG\s*=\s*(\{[\s\S]*\})\s*$/
  )
  assert(match, 'config.local.js did not contain one EDENIA_CONFIG object')
  return JSON.parse(match[1])
}

export function parseExpectedMigrationFlag(value) {
  if (value === undefined || value === '') return false
  if (value === 'true') return true
  if (value === 'false') return false
  throw new Error(
    'EDENIA_EXPECT_LEGACY_PROGRESS_MIGRATION_ENABLED must be true or false'
  )
}

export async function verifyDomainMigration({
  dns = {
    resolve4: resolveIpv4,
    resolve6: resolveIpv6,
    resolveCname,
    resolveTxt
  },
  expectedLegacyProgressMigrationEnabled = false,
  fetchImpl = globalThis.fetch
} = {}) {
  assert(
    typeof expectedLegacyProgressMigrationEnabled === 'boolean',
    'expected legacy progress migration state must be boolean'
  )
  const checks = []

  async function check(name, operation) {
    try {
      const detail = await operation()
      checks.push({ name, ok: true, detail: String(detail) })
    } catch (error) {
      checks.push({
        name,
        ok: false,
        detail: error instanceof Error ? error.message : String(error)
      })
    }
  }

  await check('GitHub ownership TXT exists', async () => {
    const records = await resolveOptional(dns.resolveTxt, VERIFICATION_HOST)
    const values = records.map(parts => parts.join('')).filter(Boolean)
    assert(values.length > 0, `${VERIFICATION_HOST} has no TXT record`)
    return `${values.length} TXT record${values.length === 1 ? '' : 's'}`
  })

  await check('Apex uses GitHub Pages IPv4', async () => {
    const addresses = await dns.resolve4(DOMAIN)
    assert(
      equalSets(addresses, GITHUB_PAGES_IPV4),
      `${DOMAIN} resolves to ${addresses.sort().join(', ') || 'no IPv4 addresses'}`
    )
    return addresses.sort().join(', ')
  })

  await check('Apex IPv6 is absent or exact', async () => {
    const addresses = await resolveOptional(dns.resolve6, DOMAIN)
    assert(
      addresses.length === 0 || equalSets(addresses, GITHUB_PAGES_IPV6),
      `${DOMAIN} has unexpected IPv6 addresses: ${addresses.sort().join(', ')}`
    )
    return addresses.length === 0 ? 'no AAAA records' : addresses.sort().join(', ')
  })

  await check('www CNAME targets GitHub Pages', async () => {
    const names = (await dns.resolveCname(`www.${DOMAIN}`)).map(normalizeDnsName)
    assert(
      equalSets(names, ['bricechivu.github.io']),
      `www.${DOMAIN} aliases ${names.join(', ') || 'nothing'}`
    )
    return names.join(', ')
  })

  await check('Canonical root serves Edenia over HTTPS', async () => {
    await requireHtml(fetchImpl, CANONICAL_ROOT, '<title>Edenia</title>')
    return CANONICAL_ROOT
  })

  await check('Canonical runtime matches expected rollout', async () => {
    const response = await request(fetchImpl, `${CANONICAL_ROOT}config.local.js`, 'follow')
    assert(response.status === 200, `canonical config returned HTTP ${response.status}`)
    assert(
      response.url === `${CANONICAL_ROOT}config.local.js`,
      `canonical config ended at ${response.url || 'an unknown URL'}`
    )
    const config = parseRuntimeConfig(await response.text())
    assert(
      config.legacyProgressMigrationEnabled
        === expectedLegacyProgressMigrationEnabled,
      `automatic legacy migration is not ${expectedLegacyProgressMigrationEnabled}`
    )
    assert(config.plusCheckoutEnabled === false, 'Plus checkout is not false')
    assert(
      config.accountFeaturesRollout === 'internal',
      'account features are not limited to internal rollout'
    )
    return `migration=${expectedLegacyProgressMigrationEnabled}; checkout=false; accounts=internal`
  })

  await check('Apex redirects path and query to www', async () => {
    const source = 'https://edenia.study/plus/?edenia_cutover_probe=1'
    const destination = 'https://www.edenia.study/plus/?edenia_cutover_probe=1'
    return requireRedirect(fetchImpl, source, destination)
  })

  await check('Legacy app redirects to canonical root', async () => {
    const source = `${LEGACY_ROOT}?edenia_cutover_probe=1`
    const destination = `${CANONICAL_ROOT}?edenia_cutover_probe=1`
    return requireRedirect(fetchImpl, source, destination)
  })

  await check('Legacy helper remains isolated and reachable', async () => {
    const body = await requireHtml(
      fetchImpl,
      HELPER_ROOT,
      '<title>Move your Edenia progress</title>'
    )
    assert(
      /<meta\s+name=["']referrer["']\s+content=["']no-referrer["']/i.test(body),
      'helper is missing its no-referrer policy'
    )
    assert(/Content-Security-Policy/i.test(body), 'helper is missing its CSP')
    assert(!/posthog|analytics\.js/i.test(body), 'helper unexpectedly contains analytics code')
    return HELPER_ROOT
  })

  await check('Plus subpath serves its standalone page', async () => {
    await requireHtml(fetchImpl, `${CANONICAL_ROOT}plus/`, '<title>Edenia Plus</title>')
    return `${CANONICAL_ROOT}plus/`
  })

  await check('Unsubscribe subpath serves its standalone page', async () => {
    await requireHtml(
      fetchImpl,
      `${CANONICAL_ROOT}unsubscribe/`,
      '<title>Study reminder preferences · Edenia</title>'
    )
    return `${CANONICAL_ROOT}unsubscribe/`
  })

  return {
    ok: checks.every(result => result.ok),
    checks
  }
}

export async function main() {
  const result = await verifyDomainMigration({
    expectedLegacyProgressMigrationEnabled: parseExpectedMigrationFlag(
      process.env.EDENIA_EXPECT_LEGACY_PROGRESS_MIGRATION_ENABLED
    )
  })
  for (const check of result.checks) {
    console.log(`${check.ok ? 'PASS' : 'FAIL'} ${check.name}: ${check.detail}`)
  }
  if (!result.ok) process.exitCode = 1
}

function isMainModule() {
  return Boolean(process.argv[1])
    && pathToFileURL(resolve(process.argv[1])).href === import.meta.url
}

if (isMainModule()) {
  main().catch(error => {
    console.error(error instanceof Error ? error.message : String(error))
    process.exitCode = 1
  })
}
