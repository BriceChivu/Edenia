// Loaded only by the explicitly requested local test build.
if (['localhost', '127.0.0.1'].includes(location.hostname) && location.port === '8037') {
  document.documentElement.classList.add('tiny-swords-preview')
  window.addEventListener('DOMContentLoaded', () => {
    let frame
    let session = 0
    let gameLevelCount = null
    let expected = 'absent'
    let restored = false
    let saving = false
    let legacy = false
    const layoutKey = 'edenia_tiny_swords_xp_layout_v1'
    const persistence = () => window.edeniaTinySwordsPersistence
    const identity = state => JSON.stringify(state?.tinySwordsIsland) ?? 'absent'
    const status = document.createElement('span')
    status.setAttribute('role', 'status')
    status.className = 'tiny-swords-save-status'
    function reportFailure(text) { status.textContent = text }
    function mountFrame() {
      const previous = frame
      frame = document.createElement('iframe')
      frame.src = 'tiny-swords-xp-game/index.html'
      frame.title = 'Tiny Swords island: earn XP by studying to unlock building'
      frame.className = 'tiny-swords-frame'
      session += 1
      restored = false
      legacy = false
      gameLevelCount = null
      expected = identity(persistence()?.read())
      status.textContent = ''
      controls.hidden = false
      cameraObserver.observe(frame)
      frame.addEventListener('load', sendStudyLevel)
      if (previous) previous.replaceWith(frame)
      else document.querySelector('.city-image-wrap').append(frame)
    }
    function sendStudyLevel() {
      if (gameLevelCount === null || !persistence()) return
      const state = persistence().read()
      if (!state) {
        restored = false
        reportFailure('Open a learner profile to save the island.')
        return
      }
      let level = Math.min(gameLevelCount, Math.max(1, (state.cityProgress?.maxLevelIndex || 0) + 1))
      let saved = state.tinySwordsIsland
      if (saved === undefined) {
        // Only the old integrated developer save can migrate. Native saves are separate.
        try {
          const raw = localStorage.getItem(layoutKey)
          if (raw !== null) {
            saved = JSON.parse(raw)
            if (saved === null) throw new Error('Invalid legacy island')
            legacy = true
          }
        } catch {
          reportFailure('The previous island could not be read. Island saving is blocked.')
          return
        }
      }
      if (new TextEncoder().encode(JSON.stringify(saved) || '').length > 512 * 1024) {
        reportFailure('This island exceeds the save limit. Island saving is blocked; the saved data is retained.')
        return
      }
      if (Number.isInteger(saved?.level) && saved.level >= 1 && saved.level <= gameLevelCount) {
        level = Math.max(level, saved.level)
      }
      frame.contentWindow?.postMessage({ type: 'edenia-study-level', session, level, layout: saved ?? null }, location.origin)
    }
    function checkReplacement(force = false) {
      if (saving) return
      if (force || identity(persistence()?.read()) !== expected) mountFrame()
      else sendStudyLevel()
    }
    window.addEventListener('edenia-profile-persisted', event => checkReplacement(event.detail?.replacement))
    window.addEventListener('edenia-profile-access', () => checkReplacement())
    window.addEventListener('storage', () => checkReplacement())
    window.addEventListener('message', async event => {
      if (event.origin !== location.origin || event.source !== frame.contentWindow) return
      const data = event.data
      if (data?.type === 'edenia-game-progression' && Array.isArray(data.thresholds)) {
        gameLevelCount = data.thresholds.length
        for (const [index, threshold] of data.thresholds.entries()) {
          if (index < CITY_LEVELS.length || !Number.isFinite(threshold)) continue
          CITY_LEVELS.push({ threshold, label: `Level ${index + 1}` })
        }
        const state = persistence()?.read()
        if (state) renderCity(getCurrentCityScore(state), state)
        sendStudyLevel()
      }
      if (data?.type === 'edenia-page-scroll' && Number.isFinite(data.x) && Number.isFinite(data.y)) {
        window.scrollBy({ left: data.x, top: data.y, behavior: 'instant' })
      }
      if (data?.type === 'edenia-game-ui') controls.hidden = data.celebrating === true
      if (data?.type === 'edenia-tiny-ready') sendStudyLevel()
      if (data?.session !== session) return
      if (data.type === 'edenia-tiny-restored') {
        restored = data.accepted === true
        if (!restored) reportFailure('This island could not be restored. Island saving is blocked; the saved data is retained.')
      }
      if (data.type === 'edenia-tiny-layout') {
        const target = frame
        const targetSession = session
        let persisted = false
        if (restored && !saving && persistence()) {
          saving = true
          try { persisted = await persistence().save(data.layout, expected) } catch {}
          saving = false
          if (persisted) {
            expected = identity(persistence().read())
            if (legacy) { try { localStorage.removeItem(layoutKey) } catch {} }
            legacy = false
          }
        }
        target.contentWindow?.postMessage({ type: 'edenia-tiny-saved', session: targetSession, id: data.id, persisted }, location.origin)
        if (target !== frame) return
        status.textContent = persisted ? '' : 'Island changes could not be saved.'
        if (!persisted && identity(persistence()?.read()) !== expected) checkReplacement()
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
    const cameraObserver = new ResizeObserver(matchCameraCursor)
    for (const button of controls.querySelectorAll('[data-city-zoom-action]')) {
      button.addEventListener('click', event => {
        event.stopImmediatePropagation()
        frame.contentWindow?.postMessage({ type: 'edenia-camera', command: button.dataset.cityZoomAction }, location.origin)
      })
    }
    document.querySelector('.city-image-wrap').append(status)
    mountFrame()
    new MutationObserver(sendStudyLevel).observe(document.getElementById('cityCurrentLevel'), { childList: true, characterData: true, subtree: true })
  }, { once: true })
}
