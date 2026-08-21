const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu

function normalizeRecord(value) {
  if (
    !value
    || typeof value !== 'object'
    || Array.isArray(value)
    || Object.keys(value).length !== 2
    || !UUID_PATTERN.test(value.ownerId)
    || !Number.isFinite(value.verifiedAt)
    || value.verifiedAt < 0
  ) return null
  return {
    ownerId: value.ownerId,
    verifiedAt: value.verifiedAt
  }
}

export function createLearnerProfileOwnerVerificationStore({
  eventTarget,
  storage,
  storageKey
}) {
  if (
    !storage
    || typeof storageKey !== 'string'
    || !storageKey
  ) {
    throw new TypeError('Owner verification requires browser storage')
  }

  function read() {
    try {
      const serialized = storage.getItem(storageKey)
      if (serialized === null) return null
      return normalizeRecord(JSON.parse(serialized))
    } catch {
      return null
    }
  }

  function record(value) {
    const next = normalizeRecord(value)
    if (!next) return false
    try {
      storage.setItem(storageKey, JSON.stringify(next))
      return JSON.stringify(read()) === JSON.stringify(next)
    } catch {
      return false
    }
  }

  function clear() {
    try {
      storage.removeItem(storageKey)
      return storage.getItem(storageKey) === null
    } catch {
      return false
    }
  }

  function subscribe(listener) {
    if (
      typeof listener !== 'function'
      || !eventTarget?.addEventListener
      || !eventTarget?.removeEventListener
    ) return () => {}
    const handleStorage = event => {
      if (event.key !== storageKey) return
      if (event.storageArea && event.storageArea !== storage) return
      listener()
    }
    eventTarget.addEventListener('storage', handleStorage)
    return () => eventTarget.removeEventListener('storage', handleStorage)
  }

  return Object.freeze({ clear, read, record, subscribe })
}
