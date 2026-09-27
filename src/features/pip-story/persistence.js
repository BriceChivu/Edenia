// Story progress stays on this device. A verified profile identity keeps a
// cloud profile refresh from discarding it, without adding it to cloud sync.
export function createBrowserStoryStore({ storage, namespace, context, saveProfile }) {
  const cacheKey = current => current?.identity
    ? `${namespace}_pip_story_${encodeURIComponent(JSON.stringify(current.identity))}` : null
  return {
    read() {
      const current = context()
      if (!current) return undefined
      if (current.profile.pipStory?.version === 1) return current.profile.pipStory
      const key = cacheKey(current)
      if (key) {
        try {
          const value = JSON.parse(storage.getItem(key))
          if (value?.version === 1) return value
        } catch {}
      }
      return current.profile.pipStory
    },
    write(snapshot) {
      const current = context()
      if (!current) return false
      const previous = current.profile.pipStory
      current.profile.pipStory = snapshot
      if (!saveProfile(current.profile)) {
        if (previous === undefined) delete current.profile.pipStory
        else current.profile.pipStory = previous
        return false
      }
      const key = cacheKey(current)
      if (!key) return true
      const verified = context()
      if (!verified || verified.profile !== current.profile || cacheKey(verified) !== key) return false
      try { storage.setItem(key, JSON.stringify(snapshot)); return true } catch { return false }
    }
  }
}
