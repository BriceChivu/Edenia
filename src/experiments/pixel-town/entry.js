import { localLight } from './lighting.js'
import { createPlayer, validateManifest } from './player.js'

let currentMount = null

export function mountTown({ image, base, version, clock = () => new Date() }) {
  currentMount?.dispose()
  const intro = document.querySelector('.intro-city-viewport')
  let introVisible = false
  const wrap = image.closest('.city-image-wrap'),
    canvas = document.createElement('canvas')
  canvas.className = 'pixel-town-canvas'
  canvas.hidden = true
  canvas.setAttribute('aria-hidden', 'true')
  image.after(canvas)
  const button = document.createElement('button')
  button.type = 'button'
  button.className = 'pixel-town-toggle'
  button.textContent = 'Town animation'
  wrap.after(button)
  const reduced = matchMedia('(prefers-reduced-motion: reduce)')
  let motion = true
  try {
    motion = localStorage.getItem('edenia.pixelTown.motion') !== 'off'
  } catch {}
  let visible = false,
    disposed = false,
    player = null,
    atlas = null,
    abort = null,
    lightTimer = null,
    startupTimer = null,
    serial = 0,
    sceneKey = '',
    failedKey = '',
    pendingKey = ''
  const metrics = {
    samples: [],
    loads: 0,
    pixelBytes: 0,
    active: false,
    errors: 0
  }
  const active = () => visible && !document.hidden && !disposed
  const release = () => {
    player?.dispose()
    player = null
    atlas?.close()
    atlas = null
    canvas.hidden = true
    metrics.pixelBytes = 0
    metrics.active = false
  }
  const cancel = () => {
    serial++
    abort?.abort()
    abort = null
    clearTimeout(startupTimer)
    startupTimer = null
    pendingKey = ''
  }
  const syncButton = () => {
    button.setAttribute('aria-pressed', String(motion && !reduced.matches))
    button.title = reduced.matches
      ? 'Paused by reduced-motion setting'
      : motion
        ? 'Pause town animation'
        : 'Play town animation'
  }
  async function prepare(key) {
    if (pendingKey === key || failedKey === key || disposed) return
    cancel()
    release()
    const token = serial
    pendingKey = key
    abort = new AbortController()
    const signal = abort.signal
    const isCurrent = () => !disposed && token === serial && active()
    startupTimer = setTimeout(() => {
      if (token === serial) {
        failedKey = key
        cancel()
        release()
      }
    }, 6000)
    let nextAtlas = null
    try {
      await image.decode()
      if (!isCurrent()) return
      const response = await fetch(`${base}${key}.json`, { signal })
      if (!response.ok) throw new Error('Missing town manifest')
      const manifest = await response.json()
      validateManifest(manifest, version)
      if (`${manifest.stage}-${manifest.light}` !== key)
        throw new Error('Mismatched scene')
      const png = await fetch(`${base}${key}-motion.png`, { signal })
      if (!png.ok) throw new Error('Missing town motion')
      nextAtlas = await createImageBitmap(await png.blob())
      if (!isCurrent()) {
        nextAtlas.close()
        return
      }
      if (
        nextAtlas.width !== manifest.atlasWidth ||
        nextAtlas.height !== manifest.atlasHeight
      )
        throw new Error('Mismatched atlas')
      atlas = nextAtlas
      nextAtlas = null
      player = createPlayer({
        canvas,
        still: image,
        atlas,
        manifest,
        onSample: (sample) => {
          metrics.samples.push(sample)
          if (metrics.samples.length > 600) metrics.samples.shift()
        }
      })
      metrics.loads++
      metrics.pixelBytes = manifest.pixelBytes + 4 * 768 * 460 * 4
      canvas.hidden = false
      clearTimeout(startupTimer)
      startupTimer = null
      pendingKey = ''
      if (active() && motion && !reduced.matches) {
        player.start()
        metrics.active = true
      }
    } catch (error) {
      nextAtlas?.close()
      if (token === serial && !disposed) {
        failedKey = key
        metrics.errors++
        release()
      }
    } finally {
      if (token === serial) {
        clearTimeout(startupTimer)
        startupTimer = null
        pendingKey = ''
      }
    }
  }
  function refresh() {
    clearTimeout(lightTimer)
    lightTimer = null
    syncButton()
    const light = localLight(clock())
    const introActive = introVisible && !document.hidden && !disposed
    if (introActive) {
      document.querySelectorAll('[data-intro-city-frame]').forEach((img) => {
        const url = `${base}${img.dataset.introCityFrame}-${light}.png`
        if (img.getAttribute('src') !== url) img.src = url
      })
    }
    if (!active()) {
      cancel()
      player?.stop()
      metrics.active = false
      if (introActive) lightTimer = setTimeout(refresh, 60000)
      return
    }
    const stage = Number(image.dataset.pixelStage || 0),
      key = `${stage}-${light}`
    if (key !== sceneKey) {
      cancel()
      release()
      sceneKey = key
      failedKey = ''
      image.src = `${base}${key}.png`
    }
    document.querySelectorAll('[data-intro-city-frame]').forEach((img) => {
      const url = `${base}${img.dataset.introCityFrame}-${light}.png`
      if (img.getAttribute('src') !== url) img.src = url
    })
    if (motion && !reduced.matches) {
      if (player) {
        player.start()
        metrics.active = true
      } else void prepare(key)
    } else {
      cancel()
      player?.stop()
      canvas.hidden = true
      metrics.active = false
    }
    if (player && motion && !reduced.matches) canvas.hidden = false
    lightTimer = setTimeout(refresh, 60000)
  }
  const toggle = () => {
    motion = !motion
    failedKey = ''
    player?.retry()
    try {
      localStorage.setItem('edenia.pixelTown.motion', motion ? 'on' : 'off')
    } catch {}
    refresh()
  }
  button.addEventListener('click', toggle)
  const observer = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      if (entry.target === wrap) visible = entry.isIntersecting
      if (entry.target === intro) introVisible = entry.isIntersecting
    }
    refresh()
  })
  observer.observe(wrap)
  if (intro) observer.observe(intro)
  const mutation = new MutationObserver(refresh)
  mutation.observe(image, {
    attributes: true,
    attributeFilter: ['data-pixel-stage']
  })
  document.addEventListener('visibilitychange', refresh)
  window.addEventListener('focus', refresh)
  reduced.addEventListener('change', refresh)
  const dispose = () => {
    if (disposed) return
    disposed = true
    cancel()
    release()
    clearTimeout(lightTimer)
    lightTimer = null
    observer.disconnect()
    mutation.disconnect()
    document.removeEventListener('visibilitychange', refresh)
    window.removeEventListener('focus', refresh)
    window.removeEventListener('pagehide', hide)
    window.removeEventListener('pageshow', show)
    reduced.removeEventListener('change', refresh)
    button.remove()
    canvas.remove()
  }
  const hide = (event) => {
    if (event.persisted) {
      visible = false
      refresh()
    } else dispose()
  }
  const show = () => {
    observer.unobserve(wrap)
    observer.observe(wrap)
  }
  window.addEventListener('pagehide', hide)
  window.addEventListener('pageshow', show)
  currentMount = {
    dispose,
    refresh,
    metrics,
    get pending() {
      return {
        animation: player?.pending || false,
        lighting: lightTimer !== null,
        startup: startupTimer !== null
      }
    }
  }
  return currentMount
}
if (window.EDENIA_PIXEL_TOWN?.enabled) {
  const image = document.getElementById('cityMilestoneImage')
  if (image)
    window.EDENIA_PIXEL_TOWN.controller = mountTown({
      image,
      ...window.EDENIA_PIXEL_TOWN
    })
}
