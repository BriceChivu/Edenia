import { canonicalizeJson, sha256Base64UrlSync } from './portable-state.js'
import { portableProfilesHaveSameProgress } from '../domain/portable-profile-combination.js'
import syncContract from '../../godot/tiny-swords/sync_contract.json' with { type: 'json' }

export const ANIMAL_CHECKPOINT_MAX_BYTES = 512 * 1024
const attached = new WeakMap()
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value)
const uuid = value => typeof value === 'string' && /^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i.test(value)
const digest = value => typeof value === 'string' && /^[A-Za-z0-9_-]{43}$/.test(value)
const exactKeys = (value, keys) => object(value) && Object.keys(value).length === keys.length
  && keys.every(key => Object.hasOwn(value, key))

export function isAnimalCheckpointBinding(binding) {
  if (!exactKeys(binding, ['ownerId', 'profileId', 'generation', 'revision'])
    || typeof binding.profileId !== 'string' || !binding.profileId || binding.profileId.length > 512) return false
  if (binding.ownerId === null) return binding.generation === null && binding.revision === null
  return typeof binding.ownerId === 'string' && binding.ownerId.length > 0 && binding.ownerId.length <= 256
    && Number.isSafeInteger(binding.generation) && binding.generation > 0
    && Number.isSafeInteger(binding.revision) && binding.revision > 0
}

export function copyAnimalCheckpointLayout(layout) {
  if (!object(layout)) throw new TypeError('An animal checkpoint requires an island snapshot')
  const raw = JSON.stringify(layout)
  if (new TextEncoder().encode(raw).length > ANIMAL_CHECKPOINT_MAX_BYTES) {
    throw new RangeError('Animal checkpoint exceeds the island transport limit')
  }
  return JSON.parse(raw)
}

export function animalIslandSha256(layout) {
  return sha256Base64UrlSync(canonicalizeJson(copyAnimalCheckpointLayout(layout)))
}

function checkedAmbient(layout) {
  const identity = layout?.sync_semantics
  const declaration = identity?.version === 1
    ? { version: 1, ambient_arrays: ['chickens', 'sheep'] } : syncContract
  return object(identity) && identity.version === declaration.version
    && /^[a-f0-9]{64}$/.test(identity.sha256)
    && Array.isArray(identity.ambient_arrays) && identity.ambient_arrays.length > 0
    && canonicalizeJson(identity.ambient_arrays) === canonicalizeJson(declaration.ambient_arrays)
    && identity.ambient_arrays.every(field => Array.isArray(layout[field]))
}

// Use only the checked Godot declaration. The shared comparison also compares
// every other island byte; a stale fingerprint cannot hide resources or edits.
export function animalIslandsHaveSameProgress(before, after) {
  try {
    const left = copyAnimalCheckpointLayout(before), right = copyAnimalCheckpointLayout(after)
    return checkedAmbient(left) && checkedAmbient(right)
      && portableProfilesHaveSameProgress({ tinySwordsIsland: left }, { tinySwordsIsland: right })
  } catch { return false }
}

export function isAnimalCheckpointStamp(value) {
  return exactKeys(value, ['version', 'stamp', 'binding', 'layoutSha256',
      ...(value?.version === 2 ? ['replacementRevision'] : [])])
    && (value.version === 1 || (value.version === 2 && Number.isSafeInteger(value.replacementRevision) && value.replacementRevision >= 0))
    && uuid(value.stamp)
    && isAnimalCheckpointBinding(value.binding) && digest(value.layoutSha256)
}

export function createAnimalCheckpointStamp(layout, binding, stamp, replacementRevision = 0) {
  if (!isAnimalCheckpointBinding(binding) || !uuid(stamp) || !Number.isSafeInteger(replacementRevision) || replacementRevision < 0) throw new TypeError('Invalid animal checkpoint identity')
  return { version: 2, stamp, binding: { ...binding }, layoutSha256: animalIslandSha256(layout), replacementRevision }
}

// Trusted metadata belongs to this exact outgoing object, never its serialized
// fields. Portable envelopes continue containing only the ordinary island.
export function attachAnimalCheckpoint(profile, checkpoint) {
  if (!object(profile)) throw new TypeError('An animal checkpoint requires a profile')
  if (checkpoint === null || checkpoint === undefined) { attached.delete(profile); return profile }
  if (!isAnimalCheckpointStamp(checkpoint.stamp)
    || animalIslandSha256(checkpoint.layout) !== checkpoint.stamp.layoutSha256
    || animalIslandSha256(profile.tinySwordsIsland) !== checkpoint.stamp.layoutSha256) {
    throw new TypeError('Animal checkpoint does not match the outgoing island')
  }
  attached.set(profile, JSON.parse(JSON.stringify(checkpoint.stamp)))
  return profile
}

export function getAnimalCheckpoint(profile) {
  const stamp = object(profile) ? attached.get(profile) : null
  if (!stamp) return null
  try {
    if (animalIslandSha256(profile.tinySwordsIsland) === stamp.layoutSha256) return JSON.parse(JSON.stringify(stamp))
  } catch {}
  attached.delete(profile)
  return null
}

export function composeAnimalCheckpointProfile(profile, checkpoint) {
  if (!checkpoint) return profile
  return attachAnimalCheckpoint({ ...profile, tinySwordsIsland: copyAnimalCheckpointLayout(checkpoint.layout) }, checkpoint)
}
