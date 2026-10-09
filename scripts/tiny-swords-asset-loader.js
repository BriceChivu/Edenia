// Asset delivery only: Godot's ordinary loader still initializes the engine and
// pack, and the existing restore acknowledgment still gates island writes.
(() => {
  const config = window.edeniaGameAssets
  const base = document.baseURI
  window.edeniaTrackGameStartup = engine => {
    const initialize = engine.init
    let reported = false
    engine.init = function (...args) {
      return initialize.apply(this, args).then(result => {
        if (!reported) {
          reported = true
          parent.postMessage({ type: 'edenia-game-engine-initialized' }, location.origin)
        }
        return result
      })
    }
  }
  const inactivityMs = 15000
  class AssetTimeout extends Error {
    constructor() { super('Game asset delivery timed out') }
  }
  let timeoutReported = false
  function reportTimeout(error) {
    // Godot retries rejected downloads internally. Once the recovery request
    // itself stalls, retire this attempt promptly through the host retry UI.
    if (error instanceof AssetTimeout && !timeoutReported) {
      timeoutReported = true
      parent.postMessage({ type: 'edenia-game-startup-failed' }, location.origin)
    }
  }
  async function deadline(operation, abort = () => {}) {
    let timer
    try {
      return await Promise.race([
        operation(),
        new Promise((_, reject) => {
          // Settle the deadline first: native fetch rejects synchronously on
          // abort, and its generic AbortError must not hide a terminal timeout.
          timer = setTimeout(() => { reject(new AssetTimeout()); abort() }, inactivityMs)
        })
      ])
    } finally { clearTimeout(timer) }
  }
  async function ordinaryResponse(asset) {
    const abort = new AbortController()
    const response = await deadline(() => fetch(new URL(asset.url, base), { signal: abort.signal }), () => abort.abort())
    if (!response.ok || !response.body) { abort.abort(); throw new Error('Game asset unavailable') }
    const reader = response.body.getReader()
    let bytes = 0
    return new Response(new ReadableStream({
      async pull(controller) {
        try {
          const chunk = await deadline(() => reader.read(), () => abort.abort())
          bytes += chunk.value?.byteLength || 0
          if (bytes > asset.bytes || (chunk.done && bytes !== asset.bytes)) throw new Error('Unexpected game asset size')
          if (chunk.done) controller.close()
          else controller.enqueue(chunk.value)
        } catch (error) { abort.abort(); reportTimeout(error); controller.error(error) }
      },
      cancel() { abort.abort(); return reader.cancel() }
    }), { headers: { 'Content-Type': asset.type, 'Content-Length': String(asset.bytes) } })
  }
  async function compressedResponse(asset) {
    const worker = new Worker(new URL(config.worker, base), { type: 'module' })
    let pending
    let timer
    let stopped = false
    function arm() {
      clearTimeout(timer)
      timer = setTimeout(() => settle(new AssetTimeout()), inactivityMs)
    }
    function settle(error, chunk) {
      clearTimeout(timer)
      const waiting = pending
      pending = null
      if (error) waiting?.reject(error)
      else waiting?.resolve(chunk)
    }
    function stop() {
      if (stopped) return
      stopped = true
      worker.terminate()
      if (pending) settle(new Error('Game asset delivery canceled'))
      clearTimeout(timer)
    }
    worker.onerror = event => { event.preventDefault(); settle(new Error('Game asset decoder unavailable')) }
    worker.onmessage = ({ data }) => {
      if (stopped || !pending) return
      if (data.type === 'progress') { arm(); return }
      if (data.type === 'error') settle(new Error(data.message))
      else if (data.type === 'done') settle(null, { done: true })
      else if (data.type === 'ready' || data.type === 'chunk') settle(null, { done: false, value: new Uint8Array(data.buffer) })
    }
    function readWorker(message) {
      return new Promise((resolve, reject) => {
        pending = { resolve, reject }
        arm()
        worker.postMessage(message)
      })
    }
    let first
    try {
      first = await readWorker({
        type: 'start', url: new URL(asset.url + '.br', base).href,
        bytes: asset.bytes, cacheEngine: asset.type === 'application/wasm', decoderUrl: new URL(config.decoder, base).href
      })
    } catch (error) { stop(); throw error }
    let delivered = first.value?.byteLength || 0
    let fallbackReader
    return new Response(new ReadableStream({
      start(controller) {
        if (first.done) { controller.close(); stop() }
        else controller.enqueue(first.value)
      },
      async pull(controller) {
        try {
          let chunk
          if (fallbackReader) chunk = await fallbackReader.read()
          else {
            try { chunk = await readWorker({ type: 'pull' }) } catch (error) {
              stop()
              if (!(error instanceof AssetTimeout)) throw error
              // Both URLs name the same immutable asset. Replay ordinary HTTP
              // delivery and skip the prefix already handed to Godot, keeping
              // its compilation stream alive without buffering the whole WASM.
              fallbackReader = (await ordinaryResponse(asset)).body.getReader()
              let skip = delivered
              do {
                chunk = await fallbackReader.read()
                if (chunk.done && skip > 0) throw new Error('Incomplete game asset fallback')
                if (chunk.done) break
                const skipped = Math.min(skip, chunk.value.byteLength)
                skip -= skipped
                chunk = { done: false, value: chunk.value.subarray(skipped) }
              } while (skip > 0 || chunk.value.byteLength === 0)
            }
          }
          delivered += chunk.value?.byteLength || 0
          if (delivered > asset.bytes || (chunk.done && delivered !== asset.bytes)) throw new Error('Unexpected game asset size')
          if (chunk.done) { controller.close(); stop() }
          else controller.enqueue(chunk.value)
        } catch (error) {
          stop()
          fallbackReader?.cancel().catch(() => {})
          controller.error(error)
        }
      },
      cancel() { stop(); return fallbackReader?.cancel() }
    }), { headers: { 'Content-Type': asset.type, 'Content-Length': String(asset.bytes) } })
  }
  window.edeniaFetchGameAsset = async file => {
    if (timeoutReported) throw new Error('Game asset startup failed')
    const asset = config.files[file]
    if (!asset) return fetch(file)
    if (typeof Worker === 'function') {
      try { return await compressedResponse(asset) } catch {}
    }
    // Missing compressed files/decoder or unavailable workers retain ordinary
    // HTTP gzip delivery. This URL is stable for an unchanged engine too.
    try { return await ordinaryResponse(asset) } catch (error) { reportTimeout(error); throw error }
  }
})()
