// Resolve every game asset beside this exact version of the parent adapter.
const tinySwordsReleaseUrl = new URL('.', document.currentScript.src)
if (window.edeniaTinySwordsEnabled === true) {
  document.documentElement.classList.add('tiny-swords-integrated')
  const initializeIsland = () => {
    const surface = document.getElementById('tinySwordsSurface')
    const loadStatus = document.getElementById('tinySwordsLoadStatus')
    const loadMessage = document.getElementById('tinySwordsLoadMessage')
    const loadProgress = document.getElementById('tinySwordsLoadProgress')
    const loadBar = document.getElementById('tinySwordsLoadBar')
    const progressLabel = document.getElementById('tinySwordsLoadProgressLabel')
    const retry = document.getElementById('tinySwordsRetry')
    const controls = surface.querySelector('.tiny-swords-camera-controls')
    let frame
    let startupTimer
    let failed = false
    let blocked = false
    let statusKey = 'island.preparing'
    let progressPercent = 0
    let preparing = false
    let preparationFloor = 60
    let preparationCeiling = 80
    let preparationStartedAt = 0
    let progressTimer
    const translate = key => window.edeniaTranslate?.(key) || key
    function renderProgress() {
      loadProgress.dataset.phase = preparing ? 'preparing' : 'download'
      progressLabel.textContent = translate('island.preparing')
      loadBar.setAttribute('aria-valuenow', String(progressPercent))
      loadBar.style.setProperty('--island-load-progress', `${progressPercent}%`)
    }
    function prepareIsland(floor = 60, ceiling = 80) {
      if (restored || failed) return
      if (preparing && floor <= preparationFloor) return
      preparationFloor = floor
      preparationCeiling = ceiling
      preparationStartedAt = performance.now()
      progressPercent = Math.max(progressPercent, floor)
      preparing = true
      renderProgress()
    }
    // Downloads are measurable; compilation and rendering are not. Reserve
    // their share and ease forward within the current stage, never through its
    // next real milestone. Only Godot's drawn-island acknowledgment reaches 100.
    function advancePreparation() {
      if (!preparing || restored || failed || document.visibilityState === 'hidden') return
      const elapsed = performance.now() - preparationStartedAt
      const value = preparationFloor + (preparationCeiling - preparationFloor) * (1 - Math.exp(-elapsed / 6000))
      const next = Math.max(progressPercent, Math.min(preparationCeiling - 1, Math.floor(value)))
      if (next === progressPercent) return
      progressPercent = next
      renderProgress()
    }
    function setLoadState(state, key) {
      surface.dataset.gameState = state
      surface.setAttribute('aria-busy', String(state === 'loading' || state === 'slow'))
      statusKey = key
      loadMessage.dataset.i18n = key
      loadMessage.textContent = translate(key)
      loadStatus.hidden = state === 'ready'
      retry.hidden = !['slow', 'failed'].includes(state)
      loadProgress.hidden = !['loading', 'slow'].includes(state)
      renderProgress()
    }
    function failStartup(key = 'island.failed') {
      failed = true
      restored = false
      clearTimeout(startupTimer)
      clearInterval(progressTimer)
      controls.hidden = true
      setLoadState('failed', key)
      syncInput()
    }
    // Edenia owns page overlays. Inert removes the iframe from pointer and
    // keyboard navigation; host visibility lets Godot suspend its own effects.
    function syncInput() {
      const modal = [...document.querySelectorAll('[aria-modal="true"]')]
        .find(node => node.getClientRects().length && getComputedStyle(node).visibility !== 'hidden')
      blocked = Boolean(modal) || document.body.classList.contains('walkthrough-active')
      const inactive = blocked || !restored || failed
      if (frame && frame.inert !== inactive) frame.inert = inactive
      if (controls.inert !== inactive) controls.inert = inactive
      if (inactive && document.activeElement === frame) {
        frame.blur()
        modal?.querySelector('button, input, [tabindex="0"]')?.focus()
      }
      sendVisibility()
    }
    new MutationObserver(syncInput).observe(document.body, {
      subtree: true, childList: true, attributes: true,
      attributeFilter: ['class', 'hidden', 'aria-modal']
    })
    window.addEventListener('edenia-locale-changed', () => {
      loadMessage.textContent = translate(statusKey)
      renderProgress()
      if (frame) frame.title = translate('island.frameTitle')
      status.textContent = status.dataset.messageKey ? translate(status.dataset.messageKey) : ''
      sendLocale()
    })
    retry.addEventListener('click', () => checkReplacement(true))
    let session = 0
    let gameLevelCount = null
    let expected = 'absent'
    let expectedAccess = null
    let restored = false
    let saving = false
    let replacementPending = false
    let legacy = false
    let intersects = true
    let reportedVisibility = null
    const layoutKey = 'edenia_tiny_swords_xp_layout_v1'
    const persistence = () => window.edeniaTinySwordsPersistence
    const accessIdentity = () => persistence()?.readAccessIdentity?.() ?? null
    const readIsland = () => {
      const adapter = persistence()
      return adapter?.readIsland ? adapter.readIsland() : adapter?.read()
    }
    const identity = state => JSON.stringify(state?.tinySwordsIsland) ?? 'absent'
    const status = document.createElement('span')
    status.setAttribute('role', 'status')
    status.className = 'tiny-swords-save-status'
    function reportFailure(key) {
      status.dataset.messageKey = key
      status.textContent = key ? translate(key) : ''
    }
    function sendLocale() {
      frame?.contentWindow?.postMessage({ type: 'edenia-locale', session, locale: document.documentElement.lang }, location.origin)
    }
    function sendVisibility() {
      if (!frame || gameLevelCount === null) return
      const visible = intersects && !blocked && !failed && document.visibilityState !== 'hidden'
      if (visible === reportedVisibility) return
      reportedVisibility = visible
      frame?.contentWindow?.postMessage({ type: 'edenia-host-visibility', session, visible }, location.origin)
    }
    const visibilityObserver = typeof IntersectionObserver === 'function'
      ? new IntersectionObserver(entries => {
        for (const entry of entries) {
          if (entry.target !== frame) continue
          intersects = entry.isIntersecting && entry.intersectionRect.width > 0 && entry.intersectionRect.height > 0
          sendVisibility()
        }
      }) : null
    document.addEventListener?.('visibilitychange', sendVisibility)
    function mountFrame() {
      clearTimeout(startupTimer)
      clearInterval(progressTimer)
      const previous = frame
      if (previous) {
        cameraObserver.unobserve(previous)
        visibilityObserver?.unobserve(previous)
      }
      frame = document.createElement('iframe')
      frame.src = new URL('index.html', tinySwordsReleaseUrl).href
      frame.title = translate('island.frameTitle')
      frame.className = 'tiny-swords-frame'
      session += 1
      restored = false
      failed = false
      progressPercent = 0
      preparing = false
      preparationFloor = 0
      legacy = false
      gameLevelCount = null
      intersects = true
      reportedVisibility = null
      expected = identity(readIsland())
      expectedAccess = accessIdentity()
      reportFailure('')
      controls.hidden = true
      controls.classList.remove('tiny-swords-editing')
      cameraObserver.observe(frame)
      frame.addEventListener('load', sendStudyLevel)
      frame.addEventListener('error', () => failStartup())
      if (previous) previous.replaceWith(frame)
      else surface.append(frame)
      visibilityObserver?.observe(frame)
      setLoadState('loading', 'island.preparing')
      syncInput()
      progressTimer = setInterval(advancePreparation, 100)
      startupTimer = setTimeout(() => {
        if (!restored && !failed) setLoadState('slow', 'island.slow')
      }, 20000)
    }
    function sendStudyLevel() {
      sendLocale()
      if (failed || gameLevelCount === null || !persistence()) return
      const state = readIsland()
      if (!state) {
        restored = false
        reportFailure('island.profileRequired')
        return
      }
      const claimedLevel = persistence().readClaimedLevel()
      if (claimedLevel === null) return
      const level = Math.min(gameLevelCount, claimedLevel)
      let saved = state.tinySwordsIsland
      if (saved === undefined && window.edeniaTinySwordsLegacyPreview === true) {
        // Only the old integrated developer save can migrate. Native saves are separate.
        try {
          const raw = localStorage.getItem(layoutKey)
          if (raw !== null) {
            saved = JSON.parse(raw)
            if (saved === null) throw new Error('Invalid legacy island')
            legacy = true
          }
        } catch {
          failStartup('island.restoreFailed')
          return
        }
      }
      if (new TextEncoder().encode(JSON.stringify(saved) || '').length > 512 * 1024) {
        failStartup('island.restoreFailed')
        return
      }
      // Godot restores the saved game level itself. Only claimed study progress
      // is a progression floor; test levels must not turn into study claims.
      frame?.contentWindow?.postMessage({ type: 'edenia-study-level', session, level, layout: saved ?? null }, location.origin)
      sendVisibility()
    }
    function disposeFrame() {
      clearTimeout(startupTimer)
      clearInterval(progressTimer)
      if (frame) {
        cameraObserver.unobserve(frame)
        visibilityObserver?.unobserve(frame)
        frame.remove()
      }
      frame = null
      session += 1
      restored = false
      preparing = false
      controls.hidden = true
    }
    function checkReplacement(force = false) {
      // Ownership loss retires the iframe immediately, including while a save
      // is awaiting acknowledgment. A new owner gets a fresh restore session.
      if (!readIsland()) { disposeFrame(); return }
      if (frame && accessIdentity() !== expectedAccess) disposeFrame()
      if (saving) { replacementPending ||= force || !frame; return }
      if (!frame || force || identity(readIsland()) !== expected) mountFrame()
      else sendStudyLevel()
    }
    window.addEventListener('edenia-profile-persisted', event => checkReplacement(event.detail?.replacement))
    window.addEventListener('edenia-profile-access', () => checkReplacement())
    window.addEventListener('storage', () => checkReplacement())
    window.addEventListener('message', async event => {
      if (event.origin !== location.origin || (!frame || event.source !== frame.contentWindow)) return
      const data = event.data
      if (data?.type === 'edenia-game-startup-failed') { failStartup(); return }
      if (failed && data?.type !== 'edenia-tiny-layout') return
      if (data?.type === 'edenia-game-loading-progress') {
        if (restored || preparing || !Number.isFinite(data.current) || !Number.isFinite(data.total)
          || data.total <= 0 || data.current < 0 || data.current > data.total) return
        if (data.current === data.total) prepareIsland()
        else {
          progressPercent = Math.max(progressPercent, Math.floor(data.current / data.total * 60))
          renderProgress()
        }
        return
      }
      if (data?.type === 'edenia-game-engine-initialized') {
        prepareIsland(80, 89)
        return
      }
      if (data?.type === 'edenia-game-progression' && Array.isArray(data.thresholds)) {
        prepareIsland(90, 97)
        gameLevelCount = data.thresholds.length
        sendStudyLevel()
      }
      if (data?.type === 'edenia-page-scroll' && !blocked && Number.isFinite(data.x) && Number.isFinite(data.y)) {
        window.scrollBy({ left: data.x, top: data.y, behavior: 'instant' })
      }
      if (data?.type === 'edenia-game-ui') {
        controls.hidden = !restored || data.celebrating === true
        controls.classList.toggle('tiny-swords-editing', data.editing === true)
      }
      if (data?.type === 'edenia-tiny-ready') { prepareIsland(); sendStudyLevel() }
      if (data?.session !== session) return
      if (data.type === 'edenia-game-focus-exit' && !blocked && restored && !failed) {
        controls.querySelector('[data-city-zoom-action="reset"]')?.focus()
      }
      if (data.type === 'edenia-tiny-restored') {
        restored = data.accepted === true
        failed = !restored
        clearTimeout(startupTimer)
        clearInterval(progressTimer)
        if (restored) progressPercent = 100
        setLoadState(restored ? 'ready' : 'failed', restored ? 'island.loading' : 'island.restoreFailed')
        controls.hidden = !restored
        syncInput()
      }
      if (data.type === 'edenia-tiny-layout') {
        const target = frame
        const targetSession = session
        let persisted = false
        if (restored && !saving && persistence()) {
          saving = true
          try { persisted = await persistence().save(data.layout, expected) } catch {}
          saving = false
          persisted = persisted && target === frame && targetSession === session
            && Boolean(readIsland()) && accessIdentity() === expectedAccess
          if (persisted) {
            expected = identity({ tinySwordsIsland: data.layout })
            if (legacy) { try { localStorage.removeItem(layoutKey) } catch {} }
            legacy = false
          }
        }
        target.contentWindow?.postMessage({ type: 'edenia-tiny-saved', session: targetSession, id: data.id, persisted }, location.origin)
        if (target !== frame) { checkReplacement(); return }
        reportFailure(persisted ? '' : 'island.saveFailed')
        if (replacementPending) {
          replacementPending = false
          checkReplacement(true)
        } else checkReplacement()
      }
    })
    // Parent-owned controls reflect device capabilities; Godot owns pinch zoom.
    const touchDevice = (window.navigator?.maxTouchPoints || 0) > 0
    if (touchDevice) {
      controls.style.setProperty('--tiny-swords-camera-cursor', 'none')
      for (const button of controls.querySelectorAll('[data-city-zoom-action="in"], [data-city-zoom-action="out"]')) {
        button.disabled = true
        button.hidden = true
      }
    }
    // Godot draws its 64px cursor in viewport units; match that rendered size
    // when the pointer crosses from the game into the parent camera controls.
    const cursorImage = new Image()
    cursorImage.src = new URL('Cursor_02.png', tinySwordsReleaseUrl).href
    let cursorSize = 0
    function matchCameraCursor() {
      if (touchDevice) return
      const viewport = frame?.contentWindow?.edeniaCamera
      if (!cursorImage.complete || !cursorImage.naturalWidth || !viewport?.width) return
      const scale = frame?.getBoundingClientRect().width / viewport.width
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
        if (blocked || !restored || failed) return
        frame?.contentWindow?.postMessage({ type: 'edenia-camera', command: button.dataset.cityZoomAction }, location.origin)
      })
    }
    surface.append(status)
    checkReplacement()
  }
  if (document.readyState === 'loading' || !document.readyState) {
    window.addEventListener('DOMContentLoaded', initializeIsland, { once: true })
  } else {
    initializeIsland()
  }
}
