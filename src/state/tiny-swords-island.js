import { animalIslandsHaveSameProgress } from './tiny-swords-animal-checkpoint.js'

// Godot owns snapshot versions and gameplay validity. Edenia checks transport
// size and its checked ambient declaration when scheduling persistence.
export const TINY_SWORDS_MAX_BYTES = 512 * 1024
export function copyTinySwordsIsland(value) {
  const json = JSON.stringify(value)
  if (json === undefined || new TextEncoder().encode(json).length > TINY_SWORDS_MAX_BYTES) {
    throw new RangeError('Tiny Swords snapshot exceeds the transport limit')
  }
  return JSON.parse(json)
}

export function islandIdentity(state) {
  return JSON.stringify(state?.tinySwordsIsland) ?? 'absent'
}

export function createTinySwordsPersistence({ read, readDurable, save,
  readCheckpoint = null, saveCheckpoint = null,
  getCheckpointRepository = () => null, onCheckpoint = () => {}, readAccessIdentity = () => null,
  readAnimalBinding = () => null }) {
  const readRepositoryIsland = repository => repository.readIslandState({ binding: readAnimalBinding() })
  return {
    read,
    readAccessIdentity,
    readIsland: () => readCheckpoint ? readCheckpoint() : (() => {
      const repository = getCheckpointRepository()
      return repository ? readRepositoryIsland(repository) : read()
    })(),
    // Active state can contain an in-flight claim. Publish only the durable
    // revision, using the small IndexedDB head when available.
    readClaimedLevel() {
      const repository = getCheckpointRepository()
      const state = readCheckpoint ? readCheckpoint() : repository ? readRepositoryIsland(repository) : read() ? readDurable() : null
      return state ? Math.max(1, (state.cityProgress?.maxLevelIndex || 0) + 1) : null
    },
    async save(layout, expected, { syncCloud } = {}) {
      if (saveCheckpoint) {
        const persisted = await saveCheckpoint(copyTinySwordsIsland(layout), expected, { syncCloud })
        if (persisted !== null) { if (persisted) onCheckpoint(); return persisted }
      }
      const repository = getCheckpointRepository()
      if (repository) {
        try {
          const captured = copyTinySwordsIsland(layout)
          const binding = readAnimalBinding()
          const access = readAccessIdentity()
          const options = { binding, canPersist: () => getCheckpointRepository() === repository
            && readAccessIdentity() === access
            && JSON.stringify(readAnimalBinding()) === JSON.stringify(binding) }
          if (syncCloud === false && repository.saveAnimalCheckpoint) {
            const persisted = await repository.saveAnimalCheckpoint(captured, expected, options)
            // Only a checked gameplay difference promotes an ambient request.
            // A stale or failed write must retain its failure acknowledgement.
            if (persisted !== null) { if (persisted) onCheckpoint(); return persisted }
          }
          const persisted = await repository.saveIsland(captured, expected, options)
          if (persisted) onCheckpoint()
          return persisted
        } catch { return false }
      }
      const state = read()
      if (!state || islandIdentity(state) !== expected
        || islandIdentity(readDurable()) !== expected) return false
      const previous = state.tinySwordsIsland
      try {
        const captured = copyTinySwordsIsland(layout)
        const localOnly = syncCloud === false && animalIslandsHaveSameProgress(previous, captured)
        state.tinySwordsIsland = captured
        const persisted = await save(state, {
          backup: false, syncAnalytics: false, pruneBackups: false,
          syncCloud: syncCloud === false && !localOnly ? true : syncCloud,
          localIslandCheckpoint: localOnly
        })
        if (persisted && islandIdentity(read()) === islandIdentity(state)
          && islandIdentity(readDurable()) === islandIdentity(state)) return true
      } catch {}
      if (previous === undefined) delete state.tinySwordsIsland
      else state.tinySwordsIsland = previous
      return false
    }
  }
}
