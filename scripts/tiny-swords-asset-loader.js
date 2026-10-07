// Asset delivery only: Godot's ordinary loader still initializes the engine and
// pack, and the existing restore acknowledgment still gates island writes.
(() => {
  const config = window.edeniaGameAssets
  const base = document.baseURI
  function compressedResponse(asset) {
    return new Promise((resolve, reject) => {
      const worker = new Worker(new URL(config.worker, base), { type: 'module' })
      let controller
      let pendingPull
      const stop = () => { worker.terminate(); pendingPull?.(); pendingPull = null }
      const fail = error => {
        if (controller) controller.error(error)
        else reject(error)
        stop()
      }
      worker.onerror = event => { event.preventDefault(); fail(new Error('Game asset decoder unavailable')) }
      worker.onmessage = ({ data }) => {
        if (data.type === 'error') { fail(new Error(data.message)); return }
        if (data.type === 'ready') {
          const body = new ReadableStream({
            start(streamController) {
              controller = streamController
              controller.enqueue(new Uint8Array(data.buffer))
            },
            pull() {
              return new Promise(resolvePull => {
                pendingPull = resolvePull
                worker.postMessage({ type: 'pull' })
              })
            },
            cancel: stop
          })
          resolve(new Response(body, { headers: {
            'Content-Type': asset.type,
            'Content-Length': String(asset.bytes)
          } }))
        } else if (data.type === 'chunk') {
          controller.enqueue(new Uint8Array(data.buffer))
          pendingPull?.()
          pendingPull = null
        } else if (data.type === 'done') {
          controller.close()
          stop()
        }
      }
      worker.postMessage({
        type: 'start', url: new URL(asset.url + '.br', base).href,
        bytes: asset.bytes, cacheEngine: asset.type === 'application/wasm', decoderUrl: new URL(config.decoder, base).href
      })
    })
  }
  window.edeniaFetchGameAsset = async file => {
    const asset = config.files[file]
    if (!asset) return fetch(file)
    const original = new URL(asset.url, base)
    if (typeof Worker === 'function') {
      try { return await compressedResponse(asset) } catch {}
    }
    // Missing compressed files/decoder or unavailable workers retain ordinary
    // HTTP gzip delivery. This URL is stable for an unchanged engine too.
    return fetch(original)
  }
})()
