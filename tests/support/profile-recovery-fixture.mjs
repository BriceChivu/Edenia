export function readRecoveryRecord(page, key) {
  return page.evaluate(async namespace => {
    let native = null
    try { native = JSON.parse(localStorage.getItem(`${namespace}_recovery_workspace_v1`)) } catch {}
    const journal = await new Promise((resolve, reject) => {
      const request = indexedDB.open('edenia_profile_recovery_v1', 1)
      let missing = false
      request.onupgradeneeded = event => {
        if (event.oldVersion === 0) { missing = true; request.transaction.abort() }
      }
      request.onerror = () => missing ? resolve(null) : reject(request.error)
      request.onsuccess = () => {
        const db = request.result
        const tx = db.transaction('heads', 'readonly')
        const read = tx.objectStore('heads').get(namespace)
        let record = null
        read.onsuccess = () => { record = read.result ? JSON.parse(read.result.raw) : null }
        tx.oncomplete = () => { db.close(); resolve(record) }
        tx.onabort = () => { db.close(); reject(tx.error) }
      }
    })
    return journal || native
  }, key)
}
