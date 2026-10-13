// Capture-only storage and a store-mode ZIP. Never shares learner-profile storage.
(() => {
  const archiveLimit = 5
  const memory = new Map()
  let database = null
  const ready = new Promise(resolve => {
    try {
      const request = indexedDB.open('edenia-tiny-swords-lag-captures-v1', 1)
      request.onupgradeneeded = () => request.result.createObjectStore('captures', { keyPath: 'id' })
      request.onerror = request.onblocked = () => resolve()
      request.onsuccess = () => {
        database = request.result
        database.onversionchange = () => { database.close(); database = null }
        const transaction = database.transaction('captures', 'readonly')
        const all = transaction.objectStore('captures').getAll()
        all.onsuccess = () => { for (const item of all.result) memory.set(item.id, item) }
        transaction.oncomplete = transaction.onabort = transaction.onerror = () => resolve()
      }
    } catch { resolve() }
  })
  const persist = (operation, value) => new Promise(resolve => {
    if (!database) return resolve(false)
    try {
      const transaction = database.transaction('captures', 'readwrite')
      transaction.objectStore('captures')[operation](value)
      transaction.oncomplete = () => resolve(true)
      transaction.onabort = transaction.onerror = () => resolve(false)
    } catch { resolve(false) }
  })
  // This function is self-contained so it can run in a disposable worker.
  // Yielding fallback also keeps CRC work out of a single long browser task.
  async function zip(files) {
    const encoder = new TextEncoder(), parts = [], directory = []
    let offset = 0
    const table = new Uint32Array(256)
    for (let n = 0; n < 256; n++) {
      let c = n
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
      table[n] = c >>> 0
    }
    const header = size => { const bytes = new Uint8Array(size); return [bytes, new DataView(bytes.buffer)] }
    for (const file of files) {
      const name = encoder.encode(file.name), data = new Uint8Array(await file.blob.arrayBuffer())
      let crc = 0xffffffff
      for (let base = 0; base < data.length; base += 262144) {
        const end = Math.min(base + 262144, data.length)
        for (let i = base; i < end; i++) crc = table[(crc ^ data[i]) & 255] ^ (crc >>> 8)
        if (end < data.length) await new Promise(resolve => setTimeout(resolve, 0))
      }
      crc = (crc ^ 0xffffffff) >>> 0
      const [local, l] = header(30)
      l.setUint32(0, 0x04034b50, true); l.setUint16(4, 20, true); l.setUint16(6, 0x800, true)
      l.setUint16(12, 33, true) // Valid DOS date: 1980-01-01; capture time is in the reports.
      l.setUint32(14, crc, true); l.setUint32(18, data.length, true); l.setUint32(22, data.length, true); l.setUint16(26, name.length, true)
      const [central, c] = header(46)
      c.setUint32(0, 0x02014b50, true); c.setUint16(4, 20, true); c.setUint16(6, 20, true); c.setUint16(8, 0x800, true)
      c.setUint16(14, 33, true)
      c.setUint32(16, crc, true); c.setUint32(20, data.length, true); c.setUint32(24, data.length, true); c.setUint16(28, name.length, true); c.setUint32(42, offset, true)
      parts.push(local, name, data); directory.push(central, name)
      offset += local.length + name.length + data.length
    }
    const directorySize = directory.reduce((sum, bytes) => sum + bytes.length, 0)
    const [end, e] = header(22)
    e.setUint32(0, 0x06054b50, true); e.setUint16(8, files.length, true); e.setUint16(10, files.length, true)
    e.setUint32(12, directorySize, true); e.setUint32(16, offset, true)
    return new Blob([...parts, ...directory, end], { type: 'application/zip' })
  }
  const packageFiles = async files => {
    if (typeof Worker !== 'function') return zip(files)
    const url = URL.createObjectURL(new Blob([`onmessage = async e => { try { postMessage({blob: await (${zip.toString()})(e.data)}) } catch { postMessage({error:true}) } }`], { type: 'text/javascript' }))
    let worker, timeout
    try {
      return await new Promise((resolve, reject) => {
        worker = new Worker(url)
        worker.onmessage = event => event.data.error ? reject(Error('Package failed')) : resolve(event.data.blob)
        worker.onerror = reject
        timeout = setTimeout(() => reject(Error('Package worker timed out')), 20000)
        worker.postMessage(files)
      })
    } catch { return zip(files) }
    finally { clearTimeout(timeout); worker?.terminate(); URL.revokeObjectURL(url) }
  }
  window.edeniaLagCaptureStore = {
    ready, archiveLimit, packageFiles,
    list: () => [...memory.values()].sort((a, b) => b.createdAt - a.createdAt),
    async put(item) {
      await ready
      memory.set(item.id, item)
      item.durable = await persist('put', { ...item, durable: true })
      return item.durable
    },
    async remove(id) {
      const item = memory.get(id)
      if (!item) return true
      if (item.durable && !await persist('delete', id)) return false
      memory.delete(id); return true
    }
  }
})()
