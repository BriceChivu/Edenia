// Asset delivery only: Godot's ordinary loader still initializes the engine and
// pack, and the existing restore acknowledgment still gates island writes.
(() => {
  const config = window.edeniaGameAssets
  const base = document.baseURI
  const ordinaryOnly = new URL(base).searchParams.get('startup_delivery') === 'ordinary'
  const cancellations = new Set()
  let canceled = false
  window.edeniaCancelGameStartup = () => {
    canceled = true
    for (const cancel of [...cancellations]) cancel()
    cancellations.clear()
  }
  window.addEventListener?.('pagehide', event => { if (!event.persisted) window.edeniaCancelGameStartup() })
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
  class AssetFailure extends Error {
    constructor(message, reason) { super(message); this.reason = reason }
  }
  class AssetTimeout extends AssetFailure {
    constructor() { super('Game asset delivery timed out', 'timeout') }
  }
  let timeoutReported = false
  function reportFailure(error, asset) {
    // Read-only conflict previews have their own host and retain Godot's prior
    // retry budget. Only the live island's controller supervises every failure.
    if (window.edeniaConflictPreviewMode && !(error instanceof AssetTimeout)) return
    if (!canceled && !timeoutReported) {
      timeoutReported = true
      const reason = error.reason || 'network'
      const kind = asset.type === 'application/wasm' ? 'engine' : 'pack'
      if (window.edeniaReportGameStartupFailure) window.edeniaReportGameStartupFailure(reason, kind)
      else parent.postMessage({ type: 'edenia-game-startup-failed', reason, asset: kind }, location.origin)
    }
  }
  // Inactivity excludes hidden time. Sleeping renderers may deliver timers
  // before visibility/pageshow; grant one short reconciliation grace then.
  function watchdog(expire) {
    let timer, at = 0, late = false, stopped = false
    const clear = () => clearTimeout(timer)
    const arm = (ms = inactivityMs) => {
      clear()
      if (stopped || document.visibilityState === 'hidden') return
      at = Date.now() + ms
      timer = setTimeout(() => {
        if (stopped || document.visibilityState === 'hidden') return
        if (!late && Date.now() - at > 2000) { late = true; arm(2000); return }
        expire()
      }, ms)
    }
    const visibility = () => document.visibilityState === 'hidden' ? clear() : arm()
    document.addEventListener?.('visibilitychange', visibility)
    arm()
    return { refresh: () => arm(), cancel() { stopped = true; clear(); document.removeEventListener?.('visibilitychange', visibility) } }
  }
  async function deadline(operation, abort = () => {}) {
    let watch
    try {
      return await Promise.race([
        operation(),
        new Promise((_, reject) => {
          // Settle the deadline first: native fetch rejects synchronously on
          // abort, and its generic AbortError must not hide a terminal timeout.
          watch = watchdog(() => { reject(new AssetTimeout()); abort() })
        })
      ])
    } finally { watch?.cancel() }
  }
  async function ordinaryResponse(asset) {
    if (canceled || timeoutReported) throw new Error('Game asset startup failed')
    const abort = new AbortController()
    const cancel = () => abort.abort()
    cancellations.add(cancel)
    let response
    try { response = await deadline(() => fetch(new URL(asset.url, base), { signal: abort.signal }), cancel) }
    catch (error) { cancellations.delete(cancel); throw error }
    if (!response.ok || !response.body) {
      cancellations.delete(cancel); abort.abort()
      throw new AssetFailure('Game asset unavailable', [404, 410].includes(response.status) ? 'http-missing' : 'http-server')
    }
    const reader = response.body.getReader()
    let bytes = 0
    return new Response(new ReadableStream({
      async pull(controller) {
        try {
          const chunk = await deadline(() => reader.read(), () => abort.abort())
          bytes += chunk.value?.byteLength || 0
          if (bytes > asset.bytes || (chunk.done && bytes !== asset.bytes)) throw new AssetFailure('Unexpected game asset size', 'integrity')
          if (chunk.done) { cancellations.delete(cancel); controller.close() }
          else controller.enqueue(chunk.value)
        } catch (error) { cancellations.delete(cancel); abort.abort(); reportFailure(error, asset); controller.error(error) }
      },
      cancel() { cancellations.delete(cancel); abort.abort(); return reader.cancel() }
    }), { headers: { 'Content-Type': asset.type, 'Content-Length': String(asset.bytes) } })
  }
  async function compressedResponse(asset) {
    const worker = new Worker(new URL(config.worker, base), { type: 'module' })
    let preloadHandle
    try { preloadHandle = parent.edeniaTakeTinySwordsPreload?.(new URL(asset.url + '.br', base).href) } catch {}
    let pending
    let watch
    let stopped = false
    function arm() {
      watch?.cancel()
      watch = watchdog(() => settle(new AssetTimeout()))
    }
    function settle(error, chunk) {
      watch?.cancel()
      const waiting = pending
      pending = null
      if (error) waiting?.reject(error)
      else waiting?.resolve(chunk)
    }
    function stop() {
      if (stopped) return
      stopped = true
      cancellations.delete(stop)
      worker.terminate()
      preloadHandle?.cancel()
      if (pending) settle(new Error('Game asset delivery canceled'))
      watch?.cancel()
    }
    cancellations.add(stop)
    worker.onerror = event => { event.preventDefault(); settle(new AssetFailure('Game asset decoder unavailable', 'decoder')) }
    worker.onmessage = ({ data }) => {
      if (stopped || !pending) return
      if (data.type === 'progress') { watch?.refresh(); return }
      if (data.type === 'error') settle(new AssetFailure('Invalid Brotli data', data.reason || 'integrity'))
      else if (data.type === 'done') settle(null, { done: true })
      else if (data.type === 'ready' || data.type === 'chunk') settle(null, { done: false, value: new Uint8Array(data.buffer) })
    }
    function readWorker(message, transfer = []) {
      return new Promise((resolve, reject) => {
        pending = { resolve, reject }
        arm()
        worker.postMessage(message, transfer)
      })
    }
    let first
    try {
      first = await readWorker({
        type: 'start', url: new URL(asset.url + '.br', base).href,
        bytes: asset.bytes, cacheEngine: asset.type === 'application/wasm', decoderUrl: new URL(config.decoder, base).href,
        ...(preloadHandle ? { preloaded: preloadHandle.port } : {})
      }, preloadHandle ? [preloadHandle.port] : [])
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
          if (delivered > asset.bytes || (chunk.done && delivered !== asset.bytes)) throw new AssetFailure('Unexpected game asset size', 'integrity')
          if (chunk.done) { controller.close(); stop() }
          else controller.enqueue(chunk.value)
        } catch (error) {
          stop()
          fallbackReader?.cancel().catch(() => {})
          reportFailure(error, asset)
          controller.error(error)
        }
      },
      cancel() { stop(); return fallbackReader?.cancel() }
    }), { headers: { 'Content-Type': asset.type, 'Content-Length': String(asset.bytes) } })
  }
  window.edeniaFetchGameAsset = async file => {
    if (timeoutReported || canceled) throw new Error('Game asset startup failed')
    const asset = config.files[file]
    if (!asset) return fetch(file)
    if (!ordinaryOnly && typeof Worker === 'function') {
      try { return await compressedResponse(asset) } catch {}
    }
    if (canceled || timeoutReported) throw new Error('Game asset startup failed')
    // Missing compressed files/decoder or unavailable workers retain ordinary
    // HTTP gzip delivery. This URL is stable for an unchanged engine too.
    try { return await ordinaryResponse(asset) } catch (error) { reportFailure(error, asset); throw error }
  }
})()
