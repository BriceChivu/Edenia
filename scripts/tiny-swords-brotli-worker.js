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
        const response = data.preloaded ? null : await cache.match(assetUrl)
        return { cache, response }
      })
      engineCache = cached.cache
      if (cached.response) return cached.response
    } catch { engineCache = null }
  }
  const source = data.preloaded ? await preloadedResponse(data.preloaded) : null
  const response = source ? source.response : await fetch(assetUrl)
  // Keep only the small, opaque Brotli artifact in origin storage. A host that
  // already HTTP-decodes Brotli would otherwise put the 40-MB engine here.
  if (response.ok && engineCache && !source?.cached && response.headers.get('content-encoding') !== 'br') cacheCopy = response.clone()
  return response
}
function preloadedResponse(port) {
  return new Promise((resolve, reject) => {
    let stream, completePull
    const close = () => { port.postMessage({ type: 'cancel' }); port.close() }
    port.onmessage = ({ data }) => {
      if (data.type === 'headers') {
        const body = new ReadableStream({
          start(controller) { stream = controller },
          pull() { return new Promise(resolve => { completePull = resolve; port.postMessage({ type: 'pull' }) }) },
          cancel: close
        })
        resolve({ response: new Response(body, { status: data.status, headers: data.headers }), cached: data.cached })
      } else if (data.type === 'chunk') { stream.enqueue(new Uint8Array(data.buffer)); completePull?.() }
      else if (data.type === 'done') { stream.close(); completePull?.(); port.close() }
      else { const error = new Error('Asset preload unavailable'); stream?.error(error); completePull?.(); reject(error); close() }
    }
    port.postMessage({ type: 'headers' })
  })
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
// Start compilation with the first available bytes. Later pulls batch the
// decoder's small outputs, reducing worker round trips without buffering the
// whole engine. Keep partial native chunks alive until their remainder is read.
let pendingValue = null
let pendingOffset = 0
let streamDone = false
async function readChunk(type) {
  const limit = type === 'ready' ? 64 * 1024 : 512 * 1024
  const parts = []
  let bytes = 0
  while (bytes < limit && !streamDone) {
    if (!pendingValue) {
      const result = await reader.read()
      decodedBytes += result.value?.byteLength || 0
      if (decodedBytes > expectedBytes || (result.done && decodedBytes !== expectedBytes)) {
        throw new Error('Unexpected decoded game asset size')
      }
      if (result.done) { streamDone = true; break }
      if (!result.value.byteLength) continue
      pendingValue = result.value
      pendingOffset = 0
    }
    const amount = Math.min(limit - bytes, pendingValue.byteLength - pendingOffset)
    parts.push(pendingValue.subarray(pendingOffset, pendingOffset + amount))
    pendingOffset += amount
    bytes += amount
    if (pendingOffset === pendingValue.byteLength) pendingValue = null
    // Preserve the first available bytes so compilation starts immediately.
    if (type === 'ready') break
  }
  if (!bytes) { await commitEngineCache(); postMessage({ type: 'done' }); return }
  let buffer
  if (parts.length === 1 && parts[0].byteOffset === 0 && parts[0].byteLength === parts[0].buffer.byteLength) {
    buffer = parts[0].buffer
  } else {
    const combined = new Uint8Array(bytes)
    let offset = 0
    for (const part of parts) { combined.set(part, offset); offset += part.byteLength }
    buffer = combined.buffer
  }
  postMessage({ type, buffer }, [buffer])
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
