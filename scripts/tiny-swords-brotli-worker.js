import init, { DecompressStream, BrotliStreamResultCode } from 'brotli-dec-wasm/web'

// Keep decoding off the game/page thread. Each pull transfers one bounded chunk;
// there is no second full-size copy of the engine in this worker.
function wasmTransform() {
  const decoder = new DecompressStream()
  let finished = false
  let freed = false
  const free = () => { if (!freed) { freed = true; decoder.free() } }
  return new TransformStream({
    transform(chunk, controller) {
      try {
        let offset = 0
        let code
        do {
          if (finished) throw new Error('Trailing Brotli data')
          const result = decoder.decompress(chunk.subarray(offset), 64 * 1024)
          try {
            offset += result.input_offset
            code = result.code
            const bytes = result.buf
            if (bytes.length) controller.enqueue(bytes)
          } finally { result.free() }
          finished = code === BrotliStreamResultCode.ResultSuccess
          if (![BrotliStreamResultCode.NeedsMoreInput, BrotliStreamResultCode.NeedsMoreOutput, BrotliStreamResultCode.ResultSuccess].includes(code)) {
            throw new Error('Invalid Brotli data')
          }
        } while (code === BrotliStreamResultCode.NeedsMoreOutput)
        if (offset !== chunk.length) throw new Error('Unconsumed Brotli data')
      } catch (error) { free(); throw error }
    },
    flush() {
      free()
      if (!finished) throw new Error('Truncated Brotli data')
    }
  })
}

let reader
let prepared
let expectedBytes = 0
let decodedBytes = 0
let engineCache
let cacheCopy
let assetUrl
// Origin storage is disposable here. Bound the whole operation, including
// eviction, so an unresolved browser storage request cannot gate the engine.
async function cacheDeadline(operation) {
  let timer
  try {
    return await Promise.race([
      operation(),
      new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('Engine cache timed out')), 1000) })
    ])
  } finally { clearTimeout(timer) }
}
async function engineResponse(data) {
  assetUrl = data.url
  if (data.cacheEngine) {
    try {
      const cached = await cacheDeadline(async () => {
        const cache = await caches.open('edenia-tiny-swords-engine-v1')
        const response = await cache.match(assetUrl)
        return { cache, response }
      })
      engineCache = cached.cache
      if (cached.response) return cached.response
    } catch { engineCache = null }
  }
  const response = await fetch(assetUrl)
  // Keep only the small, opaque Brotli artifact in origin storage. A host that
  // already HTTP-decodes Brotli would otherwise put the 40-MB engine here.
  if (response.ok && engineCache && response.headers.get('content-encoding') !== 'br') cacheCopy = response.clone()
  return response
}
async function commitEngineCache() {
  if (!cacheCopy) return
  try {
    // Commit only after the complete decoded stream passes the size check.
    await cacheDeadline(async () => {
      await engineCache.put(assetUrl, cacheCopy)
      for (const request of await engineCache.keys()) {
        if (request.url !== assetUrl) await engineCache.delete(request)
      }
    })
  } catch { /* Disposable asset caching must never prevent island startup. */ }
  cacheCopy = null
}
async function readChunk(type) {
  const result = await reader.read()
  decodedBytes += result.value?.byteLength || 0
  if (decodedBytes > expectedBytes || (result.done && decodedBytes !== expectedBytes)) {
    throw new Error('Unexpected decoded game asset size')
  }
  if (result.done) { await commitEngineCache(); postMessage({ type: 'done' }) }
  else {
    const value = result.value
    const buffer = value.byteOffset === 0 && value.byteLength === value.buffer.byteLength
      ? value.buffer : value.slice().buffer
    postMessage({ type, buffer }, [buffer])
  }
}

self.onmessage = async ({ data }) => {
  try {
    if (data.type === 'start') {
      expectedBytes = data.bytes
      prepared = (async () => {
        const response = await engineResponse(data)
        if (!response.ok || !response.body) throw new Error('Brotli asset unavailable')
        // Byte arrivals keep the inactivity watchdog alive even when the
        // decoder needs more input before it can emit its next decoded chunk.
        let body = response.body.pipeThrough(new TransformStream({
          transform(chunk, controller) {
            postMessage({ type: 'progress' })
            controller.enqueue(chunk)
          }
        }))
        // Some hosts already decode explicit .br URLs through HTTP headers.
        if (response.headers.get('content-encoding') !== 'br') {
          let transform
          try { transform = new DecompressionStream('brotli') } catch {
            await init({ module_or_path: data.decoderUrl })
            transform = wasmTransform()
          }
          body = body.pipeThrough(transform)
        }
        reader = body.getReader()
        // Validate the first decoded chunk before committing to the fast path.
        await readChunk('ready')
      })()
      await prepared
    } else if (data.type === 'pull') {
      await prepared
      await readChunk('chunk')
    }
  } catch (error) {
    cacheCopy?.body?.cancel().catch(() => {})
    if (engineCache) { try { await cacheDeadline(() => engineCache.delete(assetUrl)) } catch {} }
    postMessage({ type: 'error', message: error.message })
  }
}
