import { canonicalizeJson, sha256Base64UrlSync } from '../state/portable-state.js'

export const PROFILE_RECORD_BATCH_MAX_BYTES = 2 * 1024 * 1024
const MAX_UNITS = 2048
const MAX_KEY_LENGTH = 512
const BAD_KEYS = new Set(['__proto__', 'constructor', 'prototype'])
const PERSONAL_FIELDS = [
  'favorite', 'hiddenFromGrid', 'hiddenFromGridAt', 'manuallyAdded', 'pausedAt',
  'removedFromFeedAt', 'resumeAtSeconds', 'status', 'watchLater', 'watchProgress',
  'watchProgressTracked', 'watchedAt', 'watchedConfirmationUnlockedAt'
]
const METADATA_FIELDS = [
  'aspectRatio', 'channelId', 'channelImageUrl', 'channelTitle', 'duration', 'id',
  'isShort', 'publishedAt', 'source', 'thumbnail', 'title'
]
const SETTINGS = ['config', 'learnerProfile', 'noAnkiFrequentUserPrompt', 'onboarding']
const PROGRESSION = ['cityProgress', 'legacyCityProgress', 'townEconomy']
const ROOTS = new Set(['videos', 'anki', 'tinySwordsIsland', 'activityLog', ...SETTINGS, ...PROGRESSION])
const has = (value, key) => Object.hasOwn(value, key)
const clone = value => JSON.parse(JSON.stringify(value))
const record = value => value !== null && typeof value === 'object' && !Array.isArray(value)
  && [Object.prototype, null].includes(Object.getPrototypeOf(value))
const validKey = value => typeof value === 'string' && value.length > 0
  && value.length <= MAX_KEY_LENGTH && !BAD_KEYS.has(value)
const exactKeys = (value, keys) => record(value) && Object.keys(value).length === keys.length
  && keys.every(key => has(value, key))

// Check only selected units, never traverse the complete video/Anki library.
// Reject non-JSON and prototype-bearing input before cloning or canonicalizing it.
function safeJson(value, parents = new Set(), depth = 0) {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return true
  if (typeof value === 'number') return Number.isFinite(value)
  if (depth > 64 || (!Array.isArray(value) && !record(value)) || parents.has(value)) return false
  const keys = Object.keys(value)
  if (Array.isArray(value) && (keys.length !== value.length || keys.some((key, index) => key !== String(index)))) return false
  parents.add(value)
  for (const key of keys) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key)
    if (BAD_KEYS.has(key) || !descriptor || !has(descriptor, 'value')
      || !safeJson(descriptor.value, parents, depth + 1)) return false
  }
  parents.delete(value)
  return true
}

function equal(left, right) {
  if (left === undefined || right === undefined) return left === right
  if (!safeJson(left) || !safeJson(right)) throw new TypeError('Invalid profile record')
  return canonicalizeJson(left) === canonicalizeJson(right)
}

function validDay(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const date = new Date(`${value}T00:00:00.000Z`)
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value
}

function validExportTime(value) {
  if (typeof value !== 'string') return false
  const date = new Date(value)
  return Number.isFinite(date.getTime()) && date.toISOString() === value
}

export function mergeDirtyUnits(...hints) {
  const result = { videos: [], anki: [], island: false }
  const videos = new Set(), anki = new Set()
  for (const hint of hints) {
    if (hint === undefined) continue
    if (!record(hint) || Object.keys(hint).some(key => !['videos', 'anki', 'island'].includes(key))) return null
    for (const [key, target, valid] of [['videos', videos, validKey], ['anki', anki, validDay]]) {
      if (!has(hint, key)) continue
      if (!Array.isArray(hint[key]) || hint[key].length > MAX_UNITS
        || !safeJson(hint[key]) || hint[key].some(value => !valid(value))) return null
      for (const value of hint[key]) target.add(value)
    }
    if (has(hint, 'island') && typeof hint.island !== 'boolean') return null
    result.island ||= hint.island === true
    if (videos.size + anki.size + Number(result.island) > MAX_UNITS) return null
  }
  result.videos = [...videos].sort()
  result.anki = [...anki].sort()
  return result
}

function unitPath(unit) {
  if (unit.kind === 'video') return ['videos', unit.key]
  if (unit.kind === 'anki') return ['anki', unit.key]
  return [unit.key]
}

function validUnit(unit) {
  if (!record(unit) || !validKey(unit.key) || typeof unit.afterPresent !== 'boolean') return false
  const kind = unit.kind
  if (!['video', 'anki', 'island', 'settings', 'progression'].includes(kind)) return false
  if (kind === 'anki' && !validDay(unit.key)) return false
  if (kind === 'island' && unit.key !== 'tinySwordsIsland') return false
  if (kind === 'settings' && !SETTINGS.includes(unit.key)) return false
  if (kind === 'progression' && !PROGRESSION.includes(unit.key)) return false
  if (!unit.afterPresent) {
    return kind !== 'settings' && !(kind === 'progression' && unit.key === 'cityProgress')
      && exactKeys(unit, ['kind', 'key', 'afterPresent'])
  }
  const metadata = kind === 'video' && has(unit, 'metadata')
  if (!exactKeys(unit, ['kind', 'key', 'afterPresent', 'after', ...(metadata ? ['metadata'] : [])])
    || !record(unit.after) || !safeJson(unit.after)) return false
  if (kind !== 'video') return true
  return exactKeys(unit.after, PERSONAL_FIELDS)
    && (!metadata || (exactKeys(unit.metadata, METADATA_FIELDS) && safeJson(unit.metadata) && unit.metadata.id === unit.key))
}

export function isProfileRecordBatch(value) {
  try {
    if (!exactKeys(value, ['version', 'exportedAt', 'units']) || value.version !== 1
      || !validExportTime(value.exportedAt) || !Array.isArray(value.units)
      || value.units.length > MAX_UNITS) return false
    const paths = new Set()
    for (const unit of value.units) {
      if (!validUnit(unit)) return false
      const path = JSON.stringify(unitPath(unit))
      if (paths.has(path)) return false
      paths.add(path)
    }
    return safeJson(value) && new TextEncoder().encode(canonicalizeJson(value)).byteLength <= PROFILE_RECORD_BATCH_MAX_BYTES
  } catch { return false }
}

// The caller already normalized these portable profiles. Mutation-time hints
// select frequent records; fixed roots retain coupled economy/progression edits.
// Unknown/low-frequency edits use the existing complete-envelope path.
export function createProfileRecordBatch(profile, baseProfile, dirtyUnits, exportedAt) {
  try {
    const dirty = mergeDirtyUnits(dirtyUnits)
    if (!dirty || !record(profile) || !record(baseProfile) || !validExportTime(exportedAt)
      || [profile, baseProfile].some(value => Object.keys(value).some(key => !ROOTS.has(key)))) return null
    for (const key of SETTINGS) {
      if (has(profile, key) !== has(baseProfile, key) || !equal(profile[key], baseProfile[key])) return null
    }
    const units = []
    const add = (kind, key, current, before) => {
      if (has(current, key) === has(before, key) && equal(current[key], before[key])) return
      const afterPresent = has(current, key)
      units.push({ kind, key, afterPresent, ...(afterPresent ? { after: clone(current[key]) } : {}) })
    }
    if ((dirty.videos.length && (!record(profile.videos) || !record(baseProfile.videos)))
      || (dirty.anki.length && (!record(profile.anki) || !record(baseProfile.anki)))) return null
    for (const key of dirty.videos) {
      const current = profile.videos, before = baseProfile.videos
      if (!has(current, key)) {
        if (has(before, key)) units.push({ kind: 'video', key, afterPresent: false })
        continue
      }
      const video = current[key], previous = before[key]
      if (!exactKeys(video, [...PERSONAL_FIELDS, ...METADATA_FIELDS]) || video.id !== key || !safeJson(video)
        || (has(before, key) && (!exactKeys(previous, [...PERSONAL_FIELDS, ...METADATA_FIELDS]) || previous.id !== key || !safeJson(previous)))) return null
      const select = (value, fields) => Object.fromEntries(fields.map(field => [field, value[field]]))
      const after = select(video, PERSONAL_FIELDS), metadata = select(video, METADATA_FIELDS)
      const changedMetadata = !has(before, key) || !equal(metadata, select(previous, METADATA_FIELDS))
      if (!changedMetadata && equal(after, select(previous, PERSONAL_FIELDS))) continue
      units.push({ kind: 'video', key, afterPresent: true, after: clone(after), ...(changedMetadata ? { metadata: clone(metadata) } : {}) })
    }
    for (const key of dirty.anki) add('anki', key, profile.anki, baseProfile.anki)
    if (dirty.island) add('island', 'tinySwordsIsland', profile, baseProfile)
    for (const key of PROGRESSION) add('progression', key, profile, baseProfile)
    const batch = { version: 1, exportedAt, units }
    return isProfileRecordBatch(batch) ? batch : null
  } catch { return null }
}

export function recordBatchPaths(batch) {
  return isProfileRecordBatch(batch) ? batch.units.map(unitPath) : null
}

export function dirtyUnitsFromBatch(batch) {
  if (batch == null) return undefined
  if (!isProfileRecordBatch(batch) || batch.units.some(unit => unit.kind === 'settings')) return null
  return mergeDirtyUnits({
    videos: batch.units.filter(unit => unit.kind === 'video').map(unit => unit.key),
    anki: batch.units.filter(unit => unit.kind === 'anki').map(unit => unit.key),
    island: batch.units.some(unit => unit.kind === 'island')
  })
}

export function recordRequestDigest(operation) {
  if (!operation || !isProfileRecordBatch(operation.recordBatch)
    || !['ownerId', 'operationId', 'profileId'].every(key => typeof operation[key] === 'string' && operation[key].length > 0)
    || !Number.isSafeInteger(operation.generation) || operation.generation < 1
    || !Number.isSafeInteger(operation.baseRevision) || operation.baseRevision < 1) {
    throw new TypeError('Invalid profile record operation')
  }
  const { ownerId, operationId, profileId, generation, baseRevision, recordBatch: batch } = operation
  return sha256Base64UrlSync(canonicalizeJson({ ownerId, operationId, profileId, generation, baseRevision, batch }))
}
