import { canonicalizeJson, sha256Base64UrlSync } from '../state/portable-state.js'
import { validateTownEconomy } from '../state/town-economy.js'
import islandSyncContract from '../../godot/tiny-swords/sync_contract.json' with { type: 'json' }

export const PROFILE_CHANGE_MAX_BYTES = 128 * 1024
const ROOTS = new Set(['config', 'learnerProfile', 'onboarding', 'noAnkiFrequentUserPrompt', 'videos', 'anki', 'activityLog', 'cityProgress', 'legacyCityProgress', 'townEconomy', 'tinySwordsIsland'])
const MAPS = new Set(['config', 'learnerProfile', 'onboarding', 'videos', 'anki', 'activityLog', 'townEconomy'])
const BAD_KEYS = new Set(['__proto__', 'constructor', 'prototype'])
const CONFLICT = Symbol('incompatible portable changes')
const record = value => value !== null && typeof value === 'object' && !Array.isArray(value)
const clone = value => value === undefined ? undefined : JSON.parse(JSON.stringify(value))
const equal = (a, b) => a === undefined || b === undefined ? a === b : canonicalizeJson(a) === canonicalizeJson(b)

function semanticIsland(value) {
  const identity = value?.sync_semantics
  // Godot owns this identity and the rules for what constitutes gameplay.
  if (identity?.version !== islandSyncContract.version || !/^[a-f0-9]{64}$/.test(identity.sha256)
    || !Array.isArray(identity.ambient_arrays)
    || !equal(identity.ambient_arrays, islandSyncContract.ambient_arrays) || !identity.ambient_arrays.length
    || identity.ambient_arrays.length > 8 || new Set(identity.ambient_arrays).size !== identity.ambient_arrays.length
    || identity.ambient_arrays.some(key => typeof key !== 'string' || BAD_KEYS.has(key) || key === 'sync_semantics' || !Array.isArray(value[key]))) return value
  const projected = { ...value }
  // Consume Godot's transport declaration. Check all other bytes as well as
  // its fingerprint, so a stale tag cannot hide changed resources or buildings.
  for (const key of identity.ambient_arrays) projected[key] = value[key].length
  return projected
}
function sameIsland(a, b) { return equal(semanticIsland(a), semanticIsland(b)) }
function semanticProfile(profile) {
  return Object.hasOwn(profile, 'tinySwordsIsland')
    ? { ...profile, tinySwordsIsland: semanticIsland(profile.tinySwordsIsland) } : profile
}
// Diagnostic activity and Godot-declared animal motion do not change progress.
// Compare every other field, including resources and unknown snapshot fields.
export function portableProfilesHaveSameProgress(a, b) {
  if (!record(a) || !record(b)) return false
  const left = { ...semanticProfile(a) }, right = { ...semanticProfile(b) }
  delete left.activityLog
  delete right.activityLog
  return equal(left, right)
}

export function portableProfileChangeDigest(profile) {
  return sha256Base64UrlSync(canonicalizeJson(semanticProfile(profile)))
}
function validPath(path) {
  return Array.isArray(path) && path.length >= 1 && path.length <= 3
    && ROOTS.has(path[0]) && (path.length === 1 || MAPS.has(path[0]))
    && (path.length < 3 || (path[0] === 'townEconomy' && ['rewards', 'purchases'].includes(path[1])))
    && path.every(key => typeof key === 'string' && !BAD_KEYS.has(key))
}
const withinBound = value => new TextEncoder().encode(JSON.stringify(value)).length <= PROFILE_CHANGE_MAX_BYTES

// Store only before-values for changed domain fields, never another complete
// profile. The target stays in the existing durable outbox. A damaged, oversized
// or unsupported record falls back to the protected conflict protocol.
export function captureProfileChanges(base, target) {
  try {
    if (!record(base) || !record(target)) return null
    const entries = []
    const add = (path, parent, key) => {
      if (!validPath(path)) throw new TypeError('Unsupported profile change')
      entries.push({ path, present: Object.hasOwn(parent, key), ...(Object.hasOwn(parent, key) ? { before: clone(parent[key]) } : {}) })
    }
    for (const key of new Set([...Object.keys(base), ...Object.keys(target)])) {
      if (key === 'tinySwordsIsland' ? sameIsland(base[key], target[key]) : equal(base[key], target[key])) continue
      if (!ROOTS.has(key)) return null
      if (key === 'activityLog' && Array.isArray(base[key]) && Array.isArray(target[key])) {
        const before = Object.fromEntries(base[key].map(entry => [entry.id, entry]))
        const after = Object.fromEntries(target[key].map(entry => [entry.id, entry]))
        if (Object.keys(before).length !== base[key].length || Object.keys(after).length !== target[key].length) return null
        for (const id of new Set([...Object.keys(before), ...Object.keys(after)])) {
          if (!equal(before[id], after[id])) add([key, id], before, id)
        }
      } else if (MAPS.has(key) && record(base[key]) && record(target[key])) {
        for (const child of new Set([...Object.keys(base[key]), ...Object.keys(target[key])])) {
          if (equal(base[key][child], target[key][child])) continue
          if (key === 'townEconomy' && ['rewards', 'purchases'].includes(child) && record(base[key][child]) && record(target[key][child])) {
            for (const id of new Set([...Object.keys(base[key][child]), ...Object.keys(target[key][child])])) {
              if (!equal(base[key][child][id], target[key][child][id])) add([key, child, id], base[key][child], id)
            }
          } else add([key, child], base[key], child)
        }
      } else add([key], base, key)
    }
    const changes = { version: 1, baseDigest: portableProfileChangeDigest(base), targetDigest: portableProfileChangeDigest(target), entries }
    return entries.length <= 2048 && withinBound(changes) ? changes : null
  } catch { return null }
}

export function restoreProfileBase(target, changes) {
  try {
    if (!record(target) || !record(changes) || changes.version !== 1 || !Array.isArray(changes.entries)
      || changes.entries.length > 2048 || !withinBound(changes)
      || portableProfileChangeDigest(target) !== changes.targetDigest) return null
    const base = clone(target), paths = []
    let log
    for (const entry of changes.entries) {
      if (!record(entry) || !validPath(entry.path) || typeof entry.present !== 'boolean'
        || Object.hasOwn(entry, 'before') !== entry.present
        || Object.keys(entry).sort().join(',') !== (entry.present ? 'before,path,present' : 'path,present')) return null
      const path = entry.path.join('\u0000')
      if (paths.some(existing => existing === path || existing.startsWith(path + '\u0000') || path.startsWith(existing + '\u0000'))) return null
      paths.push(path)
      let parent = base
      if (entry.path.length > 1) {
        if (entry.path[0] === 'activityLog') {
          if (!Array.isArray(base.activityLog)) return null
          log ||= Object.fromEntries(base.activityLog.map(value => [value.id, value]))
          parent = log
        } else {
          parent = base[entry.path[0]]
          if (entry.path.length === 3) parent = parent?.[entry.path[1]]
        }
      }
      if (!record(parent)) return null
      const key = entry.path.at(-1)
      if (entry.present) Object.defineProperty(parent, key, { value: clone(entry.before), enumerable: true, writable: true, configurable: true })
      else delete parent[key]
    }
    if (log) base.activityLog = Object.values(log).sort((a, b) => b.createdAt.localeCompare(a.createdAt) || a.id.localeCompare(b.id))
    return portableProfileChangeDigest(base) === changes.baseDigest ? base : null
  } catch { return null }
}

function timestamp(a, b) {
  if (a !== null && a !== undefined && !Number.isFinite(Date.parse(a))) return CONFLICT
  if (b !== null && b !== undefined && !Number.isFinite(Date.parse(b))) return CONFLICT
  return [a, b].filter(Boolean).sort().at(-1) || null
}
function maximum(base, a, b) {
  return [base ?? 0, a, b].every(value => Number.isSafeInteger(value) && value >= 0)
    && a >= (base ?? 0) && b >= (base ?? 0) ? Math.max(a, b) : CONFLICT
}
function mapChanges(base, local, cloud, merger) {
  if (!record(base) || !record(local) || !record(cloud)) return CONFLICT
  const result = clone(cloud)
  for (const key of new Set([...Object.keys(base), ...Object.keys(local)])) {
    if (BAD_KEYS.has(key)) return CONFLICT
    const value = merger(base[key], local[key], cloud[key], key)
    if (value === CONFLICT) return CONFLICT
    if (value === undefined) delete result[key]
    else Object.defineProperty(result, key, { value, enumerable: true, writable: true, configurable: true })
  }
  return result
}
function oneSided(base, local, cloud) {
  if (equal(base, local)) return clone(cloud)
  if (equal(base, cloud) || equal(local, cloud)) return clone(local)
  return CONFLICT
}
function observations(base, local, cloud) {
  const simple = oneSided(base, local, cloud)
  if (simple !== CONFLICT) return simple
  if (!record(local) || !record(cloud) || (base !== undefined && !record(base))) return CONFLICT
  return mapChanges(base || {}, local, cloud, (before, a, b, key) => {
    const simple = oneSided(before, a, b)
    if (simple !== CONFLICT) return simple
    if (key === 'observedAt') return timestamp(a, b)
    if (['created', 'reviewed', 'experienceReviews', 'experienceWatermark'].includes(key)) return maximum(before, a, b)
    return CONFLICT
  })
}
function watchFacts(base, local, cloud) {
  if (![base, local, cloud].every(Array.isArray)) return CONFLICT
  const index = list => new Map(list.map(entry => [entry.watchedAt, entry]))
  const before = index(base), a = index(local), b = index(cloud)
  if (before.size !== base.length || a.size !== local.length || b.size !== cloud.length) return CONFLICT
  const result = []
  for (const key of new Set([...before.keys(), ...a.keys(), ...b.keys()])) {
    const original = before.get(key), left = a.get(key), right = b.get(key)
    if ((original && (!left || !right)) || !Number.isFinite(Date.parse(key))) return CONFLICT
    if (!left || !right) { result.push(clone(left || right)); continue }
    if (left.studyDay !== right.studyDay || (original && original.studyDay !== left.studyDay)) return CONFLICT
    const seconds = maximum(original?.seconds, left.seconds, right.seconds)
    const experienceSeconds = maximum(original?.experienceSeconds, left.experienceSeconds ?? 0, right.experienceSeconds ?? 0)
    if (seconds === CONFLICT || experienceSeconds === CONFLICT) return CONFLICT
    result.push({ ...clone(right), seconds, ...(left.experienceSeconds !== undefined || right.experienceSeconds !== undefined ? { experienceSeconds: Math.min(seconds, experienceSeconds) } : {}) })
  }
  return result.sort((a, b) => a.watchedAt.localeCompare(b.watchedAt))
}
function videoChanges(base, local, cloud) {
  const simple = oneSided(base, local, cloud)
  if (simple !== CONFLICT) return simple
  if (!record(local) || !record(cloud) || (base !== undefined && !record(base))) return CONFLICT
  // Resume position and its playback timestamp are one observation. A later
  // explicitly dated session wins; absent/tied dates retain the protected choice.
  const playback = value => ({ resumeAtSeconds: value?.resumeAtSeconds, pausedAt: value?.pausedAt })
  let resume = oneSided(playback(base), playback(local), playback(cloud))
  if (resume === CONFLICT) {
    const a = Date.parse(local.pausedAt), b = Date.parse(cloud.pausedAt)
    const before = base?.pausedAt == null ? Number.NEGATIVE_INFINITY : Date.parse(base.pausedAt)
    if (Number.isFinite(a) && Number.isFinite(b) && a !== b && a > before && b > before
      && [local.resumeAtSeconds, cloud.resumeAtSeconds].every(value => Number.isSafeInteger(value) && value >= 0)) {
      resume = playback(a > b ? local : cloud)
    }
  }
  if (resume === CONFLICT) return CONFLICT
  const ranks = ['unwatched', 'partial', 'watched']
  const merged = mapChanges(base || {}, local, cloud, (before, a, b, key) => {
    if (['resumeAtSeconds', 'pausedAt'].includes(key)) return clone(resume[key])
    const simple = oneSided(before, a, b)
    if (simple !== CONFLICT) return simple
    if (key === 'watchProgress') return watchFacts(before || [], a, b)
    if (key === 'status' && ranks.includes(a) && ranks.includes(b)
      && ranks.indexOf(a) >= ranks.indexOf(before ?? 'unwatched') && ranks.indexOf(b) >= ranks.indexOf(before ?? 'unwatched')) return ranks[Math.max(ranks.indexOf(a), ranks.indexOf(b))]
    if (['watchedAt', 'watchedConfirmationUnlockedAt'].includes(key)) return timestamp(a, b)
    // Other ambiguous restart and rewatch changes remain explicit.
    return CONFLICT
  })
  return merged
}
function activities(base, local, cloud) {
  if (![base, local, cloud].every(Array.isArray)) return CONFLICT
  const items = new Map()
  for (const entry of [...cloud, ...local]) {
    if (!entry?.id || (items.has(entry.id) && !equal(items.get(entry.id), entry))) return CONFLICT
    items.set(entry.id, clone(entry))
  }
  // The portable log is bounded diagnostic history, not the study-fact source.
  return [...items.values()].sort((a, b) => b.createdAt.localeCompare(a.createdAt) || a.id.localeCompare(b.id)).slice(0, 500)
}
function economy(base, local, cloud) {
  if (!record(base) || !record(local) || !record(cloud) || base.version !== local.version || base.version !== cloud.version || base.mode !== local.mode || base.mode !== cloud.mode) return CONFLICT
  const rewards = mapChanges(base.rewards, local.rewards, cloud.rewards, (before, a, b) => {
    const simple = oneSided(before, a, b)
    if (simple !== CONFLICT) return simple
    if (!record(a) || !record(b) || a.baseline !== b.baseline || (before && before.baseline !== a.baseline)) return CONFLICT
    const seconds = maximum(before?.seconds, a.seconds, b.seconds)
    return seconds === CONFLICT ? CONFLICT : { baseline: a.baseline, seconds }
  })
  const purchases = mapChanges(base.purchases, local.purchases, cloud.purchases, oneSided)
  if (rewards === CONFLICT || purchases === CONFLICT) return CONFLICT
  try { return validateTownEconomy({ version: base.version, mode: base.mode, rewards, purchases }) } catch { return CONFLICT }
}

export function combinePortableProfiles(base, local, cloud) {
  try {
    const merged = mapChanges(base, local, cloud, (before, a, b, key) => {
      if (key === 'tinySwordsIsland') {
        if (sameIsland(before, a) || sameIsland(a, b)) return clone(b)
        if (sameIsland(before, b)) return clone(a)
        return CONFLICT
      }
      const simple = oneSided(before, a, b)
      if (simple !== CONFLICT) return simple
      if (!ROOTS.has(key)) return CONFLICT
      if (key === 'videos') return mapChanges(before || {}, a, b, videoChanges)
      if (key === 'anki') return mapChanges(before || {}, a, b, observations)
      if (key === 'activityLog') return activities(before, a, b)
      if (key === 'cityProgress') return mapChanges(before, a, b, (value, left, right, field) => oneSided(value, left, right) !== CONFLICT ? oneSided(value, left, right) : field === 'maxLevelIndex' ? maximum(value, left, right) : CONFLICT)
      if (key === 'townEconomy') return economy(before, a, b)
      if (['config', 'learnerProfile', 'onboarding'].includes(key)) return mapChanges(before, a, b, (value, left, right, field) => {
        const simple = oneSided(value, left, right)
        if (simple !== CONFLICT) return simple
        if (key === 'learnerProfile' && field === 'updatedAt') return timestamp(left, right)
        if (key === 'onboarding' && field.endsWith('At')) return timestamp(left, right)
        return CONFLICT
      })
      return CONFLICT
    })
    return merged === CONFLICT ? null : merged
  } catch { return null }
}
