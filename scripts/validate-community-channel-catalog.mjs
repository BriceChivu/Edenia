import { readFile } from 'node:fs/promises'
import { spawnSync } from 'node:child_process'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import {
  ALLOWED_COMMUNITY_CANDIDATE_SOURCES,
  COMMUNITY_PROMOTION_STABLE_FIELDS,
  collectCatalogIdentities,
  collectSupportedLanguages,
  findCatalogIdentityMatch,
  getCommunityPromotionBlockers,
  isYoutubeChannelId,
  normalizeHandle,
  normalizeStringArray,
  parseCommunityMaximumPromotions
} from './community-channel-catalog-policy.mjs'

const CANDIDATES_PATH = 'data/channel-catalog.candidates.json'
const COMMUNITY_PATH = 'data/channel-catalog.community.json'
const ALLOWED_PATHS = new Set([CANDIDATES_PATH, COMMUNITY_PATH])
const OTHER_CATALOG_PATHS = [
  'data/channel-catalog.source.json',
  'data/channel-catalog.json',
  'data/channel-catalog.discovered.json'
]
const FORBIDDEN_PRIVATE_KEYS = new Set([
  'distinctid',
  'distinctids',
  'personid',
  'personids',
  'userid',
  'userids',
  'distinctusers'
])
const ALLOWED_REVIEW_REASONS = new Set(['name_matches_existing_catalog'])

function requiredText(value, label) {
  const text = String(value || '').trim()
  if (!text) throw new Error(`${label} is required.`)
  return text
}

function assertCatalogShape(catalog, label) {
  if (!catalog || typeof catalog !== 'object' || Array.isArray(catalog)) {
    throw new Error(`${label} must be a JSON object.`)
  }
  if (catalog.schemaVersion !== 1 || !Array.isArray(catalog.channels)) {
    throw new Error(`${label} must use schemaVersion 1 and contain a channels array.`)
  }
}

function assertNonNegativeInteger(value, label) {
  const number = Number(value)
  if (!Number.isInteger(number) || number < 0) {
    throw new Error(`${label} must be a non-negative integer.`)
  }
  return number
}

function assertNoPrivateKeys(value, label, path = '') {
  if (!value || typeof value !== 'object') return
  if (Array.isArray(value)) {
    value.forEach((item, index) => assertNoPrivateKeys(item, label, `${path}[${index}]`))
    return
  }
  Object.entries(value).forEach(([key, nested]) => {
    const normalizedKey = key.toLocaleLowerCase('en').replace(/[^a-z0-9]+/g, '')
    if (FORBIDDEN_PRIVATE_KEYS.has(normalizedKey)) {
      throw new Error(`${label} contains forbidden private identifier field ${path}${key}.`)
    }
    assertNoPrivateKeys(nested, label, `${path}${key}.`)
  })
}

function assertUniqueCatalogChannels(channels, label) {
  const catalogIds = new Set()
  const channelIds = new Set()
  const handles = new Set()
  channels.forEach((channel, index) => {
    const prefix = `${label} channel ${index + 1}`
    const catalogId = requiredText(channel?.catalogId, `${prefix} catalogId`)
    const channelId = requiredText(channel?.channelId, `${prefix} channelId`)
    if (!isYoutubeChannelId(channelId)) throw new Error(`${prefix} has an invalid channelId.`)
    const normalizedCatalogId = catalogId.toLocaleLowerCase('en')
    if (catalogIds.has(normalizedCatalogId)) {
      throw new Error(`${label} contains duplicate catalogId ${catalogId}.`)
    }
    if (channelIds.has(channelId)) {
      throw new Error(`${label} contains duplicate channelId ${channelId}.`)
    }
    catalogIds.add(normalizedCatalogId)
    channelIds.add(channelId)
    const handle = normalizeHandle(channel.handle)
    if (handle && handles.has(handle)) {
      throw new Error(`${label} contains duplicate handle ${channel.handle}.`)
    }
    if (handle) handles.add(handle)
  })
}

function validateCandidate(candidate, index, options) {
  const label = `Candidate ${index + 1} (${candidate?.channelId || 'unknown'})`
  if (candidate.available !== true || candidate.privacyStatus !== 'public') {
    throw new Error(`${label} must be publicly available.`)
  }
  requiredText(candidate.name, `${label} name`)
  requiredText(candidate.thumbnailUrl, `${label} thumbnailUrl`)
  requiredText(candidate.publishedAt, `${label} publishedAt`)
  const addCount = assertNonNegativeInteger(candidate.addCount, `${label} addCount`)
  const distinctUserCount = assertNonNegativeInteger(
    candidate.distinctUserCount,
    `${label} distinctUserCount`
  )
  if (distinctUserCount > addCount) {
    throw new Error(`${label} distinctUserCount may not exceed addCount.`)
  }
  const sources = normalizeStringArray(candidate.sources)
  if (
    !sources.length
    || sources.some(source => !ALLOWED_COMMUNITY_CANDIDATE_SOURCES.includes(source))
  ) {
    throw new Error(`${label} must contain only explicitly eligible candidate sources.`)
  }
  const languages = normalizeStringArray(candidate.languages)
  if (
    languages.some(language => (
      options.supportedLanguages.size && !options.supportedLanguages.has(language)
    ))
  ) {
    throw new Error(`${label} contains an unsupported learning language.`)
  }
  const reviewReasons = normalizeStringArray(candidate.reviewReasons)
  if (reviewReasons.some(reason => !ALLOWED_REVIEW_REASONS.has(reason))) {
    throw new Error(`${label} contains an unsupported review reason.`)
  }
  const knownMatch = findCatalogIdentityMatch(candidate, options.knownIdentities)
  if (knownMatch) {
    throw new Error(
      `${label} duplicates another catalog by ${knownMatch.field}: ${knownMatch.identity.catalogId}.`
    )
  }
}

export function validateCommunityCatalogDelta(options) {
  const {
    baseCandidates,
    baseCommunity,
    currentCandidates,
    currentCommunity,
    otherCatalogs = []
  } = options
  ;[
    [baseCandidates, 'Base candidate catalog'],
    [baseCommunity, 'Base community catalog'],
    [currentCandidates, 'Current candidate catalog'],
    [currentCommunity, 'Current community catalog']
  ].forEach(([catalog, label]) => assertCatalogShape(catalog, label))
  assertNoPrivateKeys(currentCandidates, 'Current candidate catalog')
  assertNoPrivateKeys(currentCommunity, 'Current community catalog')
  assertUniqueCatalogChannels(currentCandidates.channels, 'Current candidate catalog')
  assertUniqueCatalogChannels(currentCommunity.channels, 'Current community catalog')

  const knownIdentities = collectCatalogIdentities(otherCatalogs)
  const supportedLanguages = options.supportedLanguages instanceof Set
    ? options.supportedLanguages
    : collectSupportedLanguages(otherCatalogs)
  currentCandidates.channels.forEach((candidate, index) => validateCandidate(candidate, index, {
    knownIdentities,
    supportedLanguages
  }))

  const baseCommunityById = new Map(
    baseCommunity.channels.map(channel => [channel.channelId, channel])
  )
  const currentCommunityById = new Map(
    currentCommunity.channels.map(channel => [channel.channelId, channel])
  )
  baseCommunityById.forEach((baseChannel, channelId) => {
    const current = currentCommunityById.get(channelId)
    if (!current) {
      throw new Error(`Automated community updates may not remove promoted channel ${channelId}.`)
    }
    COMMUNITY_PROMOTION_STABLE_FIELDS.forEach(field => {
      if (JSON.stringify(current[field] ?? null) !== JSON.stringify(baseChannel[field] ?? null)) {
        throw new Error(
          `Automated community updates may not change ${field} for promoted channel ${channelId}.`
        )
      }
    })
  })

  const candidatesById = new Map(
    currentCandidates.channels.map(channel => [channel.channelId, channel])
  )
  const promotions = currentCommunity.channels.filter(
    channel => !baseCommunityById.has(channel.channelId)
  )
  const maximumPromotions = parseCommunityMaximumPromotions(options.maximumPromotions)
  if (promotions.length > maximumPromotions) {
    throw new Error(
      `Community update promoted ${promotions.length} channels, exceeding the limit of ${maximumPromotions}.`
    )
  }
  promotions.forEach(channel => {
    const candidate = candidatesById.get(channel.channelId)
    if (!candidate) {
      throw new Error(`Promoted channel ${channel.channelId} must exist in the candidate catalog.`)
    }
    const blockers = getCommunityPromotionBlockers(candidate, {
      minimumDistinctUsers: currentCommunity.minimumDistinctUsers,
      supportedLanguages
    })
    if (blockers.length) {
      throw new Error(
        `Promoted channel ${channel.channelId} is not eligible: ${blockers.join(', ')}.`
      )
    }
    const knownMatch = findCatalogIdentityMatch(channel, knownIdentities, {
      includeName: true
    })
    if (knownMatch) {
      throw new Error(
        `Promoted channel ${channel.channelId} duplicates another catalog by ${knownMatch.field}.`
      )
    }
    if (!String(channel.promotedAt || '').trim()) {
      throw new Error(`Promoted channel ${channel.channelId} must contain promotedAt.`)
    }
  })

  const baseCandidatesById = new Map(
    baseCandidates.channels.map(channel => [channel.channelId, channel])
  )
  const candidateAdditions = currentCandidates.channels.filter(
    channel => !baseCandidatesById.has(channel.channelId)
  ).length
  const candidateRemovals = baseCandidates.channels.filter(
    channel => !candidatesById.has(channel.channelId)
  ).length
  const candidateUpdates = currentCandidates.channels.filter(channel => {
    const previous = baseCandidatesById.get(channel.channelId)
    return previous && JSON.stringify(previous) !== JSON.stringify(channel)
  }).length

  return {
    candidateAdditions,
    candidateRemovals,
    candidateUpdates,
    candidates: currentCandidates.channels.length,
    promotions: promotions.length,
    promotedTotal: currentCommunity.channels.length
  }
}

function runGit(args) {
  const result = spawnSync('git', args, {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe']
  })
  if (result.error) throw result.error
  if (result.status !== 0) {
    throw new Error(String(result.stderr || '').trim() || `git ${args[0]} failed.`)
  }
  return String(result.stdout || '').trim()
}

function parseArgs(argv, environment = process.env) {
  const options = {
    maximumPromotions: environment.COMMUNITY_CATALOG_MAX_PROMOTIONS
  }
  for (let index = 0; index < argv.length; index += 2) {
    const flag = argv[index]
    const value = argv[index + 1]
    if (value === undefined) throw new Error(`Missing value for ${flag || '(empty argument)'}.`)
    if (flag === '--base-ref') options.baseRef = value
    else if (flag === '--max-promotions') options.maximumPromotions = value
    else throw new Error(`Unknown argument: ${flag}`)
  }
  options.baseRef = requiredText(options.baseRef, '--base-ref')
  return options
}

async function readJson(path) {
  return JSON.parse(await readFile(path, 'utf8'))
}

async function main() {
  const options = parseArgs(process.argv.slice(2))
  const changedPaths = runGit(['diff', '--name-only', options.baseRef, '--'])
    .split(/\r?\n/)
    .filter(Boolean)
  if (!changedPaths.length || changedPaths.some(path => !ALLOWED_PATHS.has(path))) {
    throw new Error(
      `Automated community import may change only ${Array.from(ALLOWED_PATHS).join(' and ')}; found: ${changedPaths.join(', ') || 'no files'}`
    )
  }

  const [
    currentCandidates,
    currentCommunity,
    ...otherCatalogs
  ] = await Promise.all([
    readJson(CANDIDATES_PATH),
    readJson(COMMUNITY_PATH),
    ...OTHER_CATALOG_PATHS.map(readJson)
  ])
  const result = validateCommunityCatalogDelta({
    baseCandidates: JSON.parse(runGit(['show', `${options.baseRef}:${CANDIDATES_PATH}`])),
    baseCommunity: JSON.parse(runGit(['show', `${options.baseRef}:${COMMUNITY_PATH}`])),
    currentCandidates,
    currentCommunity,
    maximumPromotions: options.maximumPromotions,
    otherCatalogs
  })
  console.log(
    `Validated community delta (${result.candidateAdditions} candidates added, ${result.candidateUpdates} updated, ${result.candidateRemovals} expired; ${result.promotions} promoted, ${result.promotedTotal} promoted total).`
  )
}

function isMainModule() {
  return Boolean(process.argv[1])
    && pathToFileURL(resolve(process.argv[1])).href === import.meta.url
}

if (isMainModule()) {
  main().catch(error => {
    console.error(error.message)
    process.exitCode = 1
  })
}
