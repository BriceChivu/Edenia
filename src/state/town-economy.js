import { mapPersistenceResult } from './persistence-result.js'
import { normalizeVideoWatchProgress } from '../domain/video-watch-progress.js'

// Portable learner-owned records. Presentation never awards coins.
export const FIRST_FLOWER_ID = 'garden-flower-1'
export const FIRST_FLOWER_COST = 15
export const SECONDS_PER_COIN = 40

const record = value => value && typeof value === 'object' && !Array.isArray(value)
const integer = value => Number.isSafeInteger(value) && value >= 0

export function validateTownEconomy(value) {
  if (!record(value) || value.version !== 1
    || !['starter', 'legacy'].includes(value.mode)
    || Object.keys(value).sort().join(',') !== 'mode,purchases,rewards,version'
    || !record(value.rewards) || !record(value.purchases)) {
    throw new TypeError('Invalid town economy')
  }
  for (const [key, reward] of Object.entries(value.rewards)) {
    if (!key.startsWith('video:') || !record(reward)
      || Object.keys(reward).sort().join(',') !== 'baseline,seconds'
      || !integer(reward.baseline) || !integer(reward.seconds)
      || reward.seconds < reward.baseline) throw new TypeError('Invalid town reward')
  }
  for (const [id, cost] of Object.entries(value.purchases)) {
    if (id !== FIRST_FLOWER_ID || (cost !== FIRST_FLOWER_COST
      && !(value.mode === 'legacy' && cost === 0))) throw new TypeError('Invalid town purchase')
  }
  if (!Number.isSafeInteger(earnedSeconds(value)) || getTownBalance(value) < 0) {
    throw new TypeError('Invalid town balance')
  }
  return value
}

function studyRecords(state) {
  const records = new Map()
  for (const [id, video] of Object.entries(state.videos || {})) {
    let entries = normalizeVideoWatchProgress(video.watchProgress, video.duration)
    // Match portable-profile and Study History treatment of old completed videos.
    if (!entries.length && video.watchProgressTracked !== true
      && video.status === 'watched' && video.watchedAt && video.duration > 0) {
      entries = normalizeVideoWatchProgress([{ watchedAt: video.watchedAt, seconds: video.duration }], video.duration)
    }
    for (const entry of entries) {
      if (!entry.watchedAt || !Number.isFinite(Date.parse(entry.watchedAt))) continue
      const key = `video:${encodeURIComponent(id)}:${new Date(entry.watchedAt).toISOString()}`
      const seconds = Math.max(0, Math.floor(Number(entry.seconds) || 0))
      if (!Number.isSafeInteger(seconds)) continue
      // A growing session is one fact; reprocessing or duplicate copies cannot mint coins.
      records.set(key, Math.max(records.get(key) || 0, seconds))
    }
  }
  return records
}

export function initializeTownEconomy(state, { newProfile = false } = {}) {
  if (state.townEconomy !== undefined) {
    validateTownEconomy(state.townEconomy)
    return false
  }
  const records = studyRecords(state)
  // Absence of study is not permission to remove an existing learner's town.
  const existing = !newProfile
  state.townEconomy = {
    version: 1,
    mode: existing ? 'legacy' : 'starter',
    rewards: Object.fromEntries([...records].map(([id, seconds]) => [id, { baseline: seconds, seconds }])),
    // Legacy scenes already contain this flower patch. Preserve them without charging.
    purchases: existing ? { [FIRST_FLOWER_ID]: 0 } : {}
  }
  return true
}

export function recordTownRewards(state) {
  if (initializeTownEconomy(state)) return
  const economy = state.townEconomy
  for (const [id, seconds] of studyRecords(state)) {
    const previous = economy.rewards[id]
    economy.rewards[id] = {
      baseline: previous?.baseline || 0,
      seconds: Math.max(previous?.seconds || 0, seconds)
    }
  }
  validateTownEconomy(economy)
}

function earnedSeconds(economy) {
  return Object.values(economy.rewards).reduce((total, entry) => total + entry.seconds - entry.baseline, 0)
}

export function getTownBalance(economy) {
  if (!economy) return 0
  return Math.floor(earnedSeconds(economy) / SECONDS_PER_COIN)
    - Object.values(economy.purchases).reduce((sum, cost) => sum + cost, 0)
}

// Synchronous transaction through the active-profile persistence fence. Ownership is
// the debit receipt, so deduction and construction cannot be saved independently.
export function purchaseFirstFlower(state, persist) {
  if (!state?.townEconomy) return 'unavailable'
  validateTownEconomy(state.townEconomy)
  if (Object.hasOwn(state.townEconomy.purchases, FIRST_FLOWER_ID)) return 'owned'
  if (getTownBalance(state.townEconomy) < FIRST_FLOWER_COST) return 'insufficient'
  const previous = state.townEconomy
  state.townEconomy = {
    ...previous,
    purchases: { ...previous.purchases, [FIRST_FLOWER_ID]: FIRST_FLOWER_COST }
  }
  try {
    return mapPersistenceResult(persist(state), persisted => {
      if (persisted) return 'purchased'
      state.townEconomy = previous
      return 'save-failed'
    })
  } catch {}
  state.townEconomy = previous
  return 'save-failed'
}
