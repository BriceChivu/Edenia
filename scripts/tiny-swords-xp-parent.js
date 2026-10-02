// Loaded only by the explicitly requested local test build.
if (['localhost', '127.0.0.1'].includes(location.hostname) && location.port === '8037') {
  document.documentElement.classList.add('tiny-swords-preview')
  window.addEventListener('DOMContentLoaded', () => {
    const frame = document.createElement('iframe')
    frame.src = 'tiny-swords-xp-game/index.html'
    frame.title = 'Tiny Swords island: earn XP by studying to unlock building'
    frame.className = 'tiny-swords-frame'
    const layoutKey = 'edenia_tiny_swords_xp_layout_v1'
    function sendStudyLevel() {
      const state = loadState()
      let level = Math.min(4, Math.max(1, (state?.cityProgress?.maxLevelIndex || 0) + 1))
      let saved = null
      try { saved = JSON.parse(localStorage.getItem(layoutKey)) } catch {}
      // This local sandbox retains its earned progression with its map.
      if (Number.isInteger(saved?.level) && saved.level >= 1 && saved.level <= 4) {
        level = Math.max(level, saved.level)
      }
      frame.contentWindow?.postMessage({ type: 'edenia-study-level', level, layout: saved }, location.origin)
    }
    window.addEventListener('message', event => {
      if (event.origin !== location.origin || event.source !== frame.contentWindow) return
      if (event.data?.type === 'edenia-game-progression' && Array.isArray(event.data.thresholds)) {
        // Project the Godot-owned thresholds into the local study XP bar.
        for (const [index, threshold] of event.data.thresholds.entries()) {
          if (index < CITY_LEVELS.length || !Number.isFinite(threshold)) continue
          CITY_LEVELS.push({ threshold, label: `Level ${index + 1}` })
        }
        const state = loadState()
        renderCity(getCurrentCityScore(state), state)
        sendStudyLevel()
      }
      if (event.data?.type === 'edenia-page-scroll'  && Number.isFinite(event.data.x) && Number.isFinite(event.data.y)) {
        window.scrollBy({ left: event.data.x, top: event.data.y, behavior: 'instant' })
      }
      if (event.data?.type === 'edenia-game-ui') controls.hidden = event.data.celebrating === true
      if (event.data?.type === 'edenia-tiny-ready') sendStudyLevel()
      if (event.data?.type === 'edenia-tiny-layout') {
        const layout = event.data.layout
        if (layout && Number.isInteger(layout.level) && layout.level >= 1 && layout.level <= 4) {
          localStorage.setItem(layoutKey, JSON.stringify(layout))
        }
      }
    })
    // Clone the owning Edenia markup: exact SVG icons, labels, classes and CSS.
    // Cloning removes the old image's listeners before binding the game camera.
    const originalControls = document.querySelector('.city-zoom-controls')
    const controls = originalControls.cloneNode(true)
    controls.classList.add('tiny-swords-camera-controls')
    originalControls.replaceWith(controls)
    // Godot draws its 64px cursor in viewport units; match that rendered size
    // when the pointer crosses from the game into the parent camera controls.
    const cursorImage = new Image()
    cursorImage.src = 'tiny-swords-xp-game/Cursor_02.png'
    let cursorSize = 0
    function matchCameraCursor() {
      const viewport = frame.contentWindow?.edeniaCamera
      if (!cursorImage.complete || !cursorImage.naturalWidth || !viewport?.width) return
      const scale = frame.getBoundingClientRect().width / viewport.width
      const size = Math.max(1, Math.round(cursorImage.naturalWidth * scale))
      if (size === cursorSize) return
      cursorSize = size
      const canvas = document.createElement('canvas')
      canvas.width = canvas.height = size
      const context = canvas.getContext('2d')
      context.imageSmoothingEnabled = false
      context.drawImage(cursorImage, 0, 0, size, size)
      controls.style.setProperty('--tiny-swords-camera-cursor', `url("${canvas.toDataURL()}") ${Math.round(24 * scale)} ${Math.round(18 * scale)}, default`)
    }
    cursorImage.addEventListener('load', matchCameraCursor)
    controls.addEventListener('pointerenter', matchCameraCursor)
    new ResizeObserver(matchCameraCursor).observe(frame)
    for (const button of controls.querySelectorAll('[data-city-zoom-action]')) {
      button.addEventListener('click', event => {
        event.stopImmediatePropagation()
        frame.contentWindow?.postMessage({ type: 'edenia-camera', command: button.dataset.cityZoomAction }, location.origin)
      })
    }
    document.querySelector('.city-image-wrap').append(frame)
    new MutationObserver(sendStudyLevel).observe(document.getElementById('cityCurrentLevel'), { childList: true, characterData: true, subtree: true })
    frame.addEventListener('load', sendStudyLevel)
  }, { once: true })
}
