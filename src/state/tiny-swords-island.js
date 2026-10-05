// Edenia checks transport size only. Godot owns snapshot versions and gameplay validity.
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
  getCheckpointRepository = () => null, onCheckpoint = () => {} }) {
  return {
    read,
    readIsland: () => getCheckpointRepository()?.readIslandState() ?? read(),
    async save(layout, expected) {
      const repository = getCheckpointRepository()
      if (repository) {
        try {
          const persisted = await repository.saveIsland(copyTinySwordsIsland(layout), expected, {
            canPersist: () => getCheckpointRepository() === repository
          })
          if (persisted) onCheckpoint()
          return persisted
        } catch { return false }
      }
      const state = read()
      if (!state || islandIdentity(state) !== expected
        || islandIdentity(readDurable()) !== expected) return false
      const previous = state.tinySwordsIsland
      try {
        state.tinySwordsIsland = copyTinySwordsIsland(layout)
        const persisted = await save(state, {
          backup: false, syncAnalytics: false, pruneBackups: false
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
