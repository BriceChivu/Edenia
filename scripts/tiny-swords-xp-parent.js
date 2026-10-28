import { createIslandStartupController } from './tiny-swords-startup.js'

// Resolve every game asset beside this exact version of the parent adapter.
let tinySwordsReleaseUrl = new URL('.', document.currentScript.src)
const tinySwordsManifestUrl = new URL('../../tiny-swords-current.json', tinySwordsReleaseUrl)
const tinySwordsStartupCompatibility = ''
// The builder supplies only disposable assets from this exact game release.
const tinySwordsPreloadAssets = []
if (window.edeniaTinySwordsEnabled === true) {
  // Start only disposable downloads while profile opening runs. Hand their
  // streams to the worker once, including in private browsers whose HTTP cache
  // may not retain the engine. No learner data or game frame is needed here.
  const preloads = new Map()
  const preloadAborts = new Set(), preloadHandles = new Set()
  let preloadsRetired = false
  function cancelPreloads() {
    preloadsRetired = true
    for (const abort of preloadAborts) abort.abort()
    for (const handle of [...preloadHandles]) handle.cancel()
    for (const pending of preloads.values()) pending.then(source => source?.response.body?.cancel().catch(() => {}))
    preloads.clear()
  }
  const canPreload = typeof Worker === 'function' && typeof MessageChannel === 'function'
  for (const asset of canPreload ? tinySwordsPreloadAssets : []) {
    const url = new URL(asset, tinySwordsReleaseUrl).href
    preloads.set(url, (async () => {
      if (url.includes('/tiny-swords-engine/')) {
        let timer
        try {
          const cached = await Promise.race([
            caches.open('edenia-tiny-swords-engine-v1').then(cache => cache.match(url)),
            new Promise(resolve => { timer = setTimeout(resolve, 1000) })
          ])
          if (cached) {
            if (preloadsRetired) { cached.body?.cancel().catch(() => {}); return null }
            return { response: cached, cached: true }
          }
        } catch {} finally { clearTimeout(timer) }
      }
      const abort = new AbortController()
      if (preloadsRetired) return null
      preloadAborts.add(abort)
      const timer = setTimeout(() => abort.abort(), 15000)
      try { return { response: await fetch(url, { priority: 'low', signal: abort.signal }), cached: false } }
      finally { clearTimeout(timer); preloadAborts.delete(abort) }
    })().catch(() => null))
  }
  window.edeniaTakeTinySwordsPreload = url => {
    const prepared = preloads.get(url)
    if (!prepared) return null
    preloads.delete(url)
    const channel = new MessageChannel()
    let reader, remaining, offset = 0, canceled = false
    const cancel = () => {
      preloadHandles.delete(handle)
      canceled = true
      reader?.cancel().catch(() => {})
      remaining = null
      prepared.then(source => { if (!reader) source?.response.body?.cancel().catch(() => {}) })
      channel.port1.close()
    }
    channel.port1.onmessage = async ({ data }) => {
      if (data.type === 'cancel') { cancel(); return }
      try {
        if (data.type === 'headers') {
          const source = await prepared
          if (!source?.response.body) throw new Error('Asset preload unavailable')
          if (canceled) { source.response.body.cancel().catch(() => {}); return }
          reader = source.response.body.getReader()
          channel.port1.postMessage({ type: 'headers', status: source.response.status,
            headers: [...source.response.headers], cached: source.cached })
        } else if (data.type === 'pull') {
          if (!remaining) {
            const chunk = await reader.read()
            if (chunk.done) { channel.port1.postMessage({ type: 'done' }); channel.port1.close(); return }
            remaining = chunk.value; offset = 0
          }
          const end = Math.min(offset + 64 * 1024, remaining.byteLength)
          const buffer = remaining.slice(offset, end).buffer
          offset = end
          if (offset === remaining.byteLength) remaining = null
          if (!canceled) channel.port1.postMessage({ type: 'chunk', buffer }, [buffer])
        }
      } catch {
        reader?.cancel().catch(() => {})
        channel.port1.postMessage({ type: 'error' })
        channel.port1.close()
      }
    }
    const handle = { port: channel.port2, cancel }
    preloadHandles.add(handle)
    return handle
  }
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
    let frameAttempt = null
    let suspended = false
    let releaseLookup = null, releaseLookupTried = false, releaseGeneration = 0
    let healthBackgrounded = document.hidden
    document.addEventListener('visibilitychange', () => { if (document.hidden) healthBackgrounded = true })
    const diagnostics = []
    window.edeniaIslandStartupDiagnostics = () => diagnostics.map(row => ({ ...row }))
    let failed = false
    let blocked = false
    let statusKey = 'island.preparing'
    let progressPercent = 0
    let preparing = false
    let preparationFloor = 60
    let preparationCeiling = 80
    let preparationStartedAt = 0
    let progressTimer = null
    function stopProgress() { clearInterval(progressTimer); progressTimer = null }
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
      if (!preparing || restored || failed || !visible()) return
      const elapsed = performance.now() - preparationStartedAt
      const value = preparationFloor + (preparationCeiling - preparationFloor) * (1 - Math.exp(-elapsed / 6000))
      const next = Math.max(progressPercent, Math.min(preparationCeiling - 1, Math.floor(value)))
      if (next === progressPercent) return
      progressPercent = next
      renderProgress()
    }
    function setLoadState(state, key) {
      surface.dataset.gameState = state
      surface.setAttribute('aria-busy', String(state === 'loading' || state === 'retry-wait'))
      statusKey = key
      loadMessage.dataset.i18n = key
      loadMessage.textContent = translate(key)
      loadStatus.hidden = !['loading', 'retry-wait'].includes(state)
      retry.hidden = true
      loadProgress.hidden = !['loading', 'retry-wait'].includes(state)
      renderProgress()
    }
    function failStartup(reason = 'engine', detail = {}) {
      return startup.fail(frameAttempt, { reason, ...detail })
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
      if (frame && inactive && document.activeElement === frame) {
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
    let session = 0
    let gameLevelCount = null
    let expected = 'absent'
    let expectedAccess = null
    let restored = false
    let saving = false
    let replacementPending = false
    let legacy = false
    const initialBounds = surface.getBoundingClientRect?.()
    let intersects = !initialBounds || (initialBounds.width > 0 && initialBounds.height > 0
      && initialBounds.bottom > 0 && initialBounds.top < window.innerHeight
      && initialBounds.right > 0 && initialBounds.left < window.innerWidth)
    let reportedVisibility = null
    let activeInteraction = true
    let checkpointRequest = null
    let checkpointRequestId = 0
    function finishCheckpointRequest(persisted) {
      if (!checkpointRequest) return
      const request = checkpointRequest
      checkpointRequest = null
      clearTimeout(request.timer)
      request.resolve(persisted)
    }
    // Explicit Sync/export capture the current safe Godot contacts. The ticket
    // follows that snapshot through coalescing; an unrelated older ACK cannot
    // finish this request. Closing a page remains best effort in the browser.
    window.edeniaFlushTinySwordsCheckpoint = () => {
      if (checkpointRequest) return checkpointRequest.promise
      if (!frame || !restored || failed) return Promise.resolve(true)
      const request = { id: ++checkpointRequestId, session, resolve: null, timer: null }
      request.promise = new Promise(resolve => { request.resolve = resolve })
      checkpointRequest = request
      request.timer = setTimeout(() => { reportFailure('island.saveFailed'); finishCheckpointRequest(false) }, 10000)
      frame.contentWindow?.postMessage({ type: 'edenia-checkpoint-request', session, requestId: request.id }, location.origin)
      return request.promise
    }
    function reportSyncActivity() {
      window.dispatchEvent(new CustomEvent('edenia-tiny-swords-activity', {
        detail: { visible: reportedVisibility === true, active: activeInteraction }
      }))
    }
    const layoutKey = 'edenia_tiny_swords_xp_layout_v1'
    const persistence = () => window.edeniaTinySwordsPersistence
    const accessIdentity = () => persistence()?.readAccessIdentity?.() ?? null
    const readIsland = () => {
      const adapter = persistence()
      return adapter?.readIsland ? adapter.readIsland() : adapter?.read()
    }
    const identity = state => JSON.stringify(state?.tinySwordsIsland) ?? 'absent'
    const visible = () => !suspended && document.visibilityState !== 'hidden'
    const startup = createIslandStartupController({
      visible, eligible: () => visible() && intersects && window.navigator?.onLine !== false,
      valid: () => Boolean(readIsland()) && accessIdentity() === expectedAccess,
      begin: mountFrame, retire: retireFrame, recover: refreshRelease,
      state(value) {
        if (value === 'waiting-profile' || value === 'disposed') {
          releaseGeneration++; releaseLookup?.abort(); releaseLookup = null
        }
        setLoadState(value, 'island.preparing')
        if (!['loading', 'ready'].includes(value)) {
          stopProgress(); controls.hidden = true; syncInput()
        }
      },
      record(row) {
        diagnostics.push({ ...row }); if (diagnostics.length > 48) diagnostics.shift()
        const outcome = row.outcome === 'recovered' ? 'success' : row.outcome
        try { window.edeniaHealth?.report('island', outcome, {
          reason: outcome === 'slow' ? 'startup-slow' : outcome === 'failure' ? row.reason === 'restore' ? 'restore-failed' : 'startup-failed' : 'none',
          duration: row.duration, backgrounded: healthBackgrounded,
          startup: { ...row }
        }) } catch {}
      }
    })
    async function refreshRelease(detail) {
      if (releaseLookupTried || typeof fetch !== 'function' || !tinySwordsStartupCompatibility
        || !(['script', 'http-missing'].includes(detail.reason) || (detail.reason === 'timeout' && detail.stage === 'document'))) return
      releaseLookupTried = true
      const generation = releaseGeneration, abort = new AbortController()
      releaseLookup = abort
      const timer = setTimeout(() => abort.abort(), 2000)
      try {
        const response = await fetch(tinySwordsManifestUrl, { cache: 'no-store', signal: abort.signal })
        if (!response.ok || !response.body) return
        const reader = response.body.getReader(), chunks = []
        let length = 0
        for (;;) {
          const chunk = await reader.read()
          if (chunk.done) break
          length += chunk.value.byteLength
          if (length > 4096) { abort.abort(); return }
          chunks.push(chunk.value)
        }
        const bytes = new Uint8Array(length)
        let offset = 0
        for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length }
        const manifest = JSON.parse(new TextDecoder().decode(bytes))
        if (generation !== releaseGeneration || manifest.schema !== 1
          || manifest.compatibility !== tinySwordsStartupCompatibility || !/^[a-f0-9]{64}$/.test(manifest.release)) return
        const next = new URL(`../${manifest.release}/`, tinySwordsReleaseUrl)
        if (next.origin === location.origin) tinySwordsReleaseUrl = next
      } catch {} finally {
        clearTimeout(timer)
        if (releaseLookup === abort) releaseLookup = null
      }
    }
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
      const target = frame, targetSession = session
      reportedVisibility = visible
      reportSyncActivity()
      if (frame !== target || session !== targetSession) return
      frame?.contentWindow?.postMessage({ type: 'edenia-host-visibility', session, visible }, location.origin)
    }
    const visibilityObserver = typeof IntersectionObserver === 'function'
      ? new IntersectionObserver(entries => {
        for (const entry of entries) {
          if (entry.target !== surface) continue
          intersects = entry.isIntersecting && entry.intersectionRect.width > 0 && entry.intersectionRect.height > 0
          sendVisibility()
          startup.reconcile()
        }
      }) : null
    function reconcileStartup() {
      sendVisibility(); startup.reconcile()
      if (!visible()) stopProgress()
      else if (frame && startup.state === 'loading' && progressTimer === null) progressTimer = setInterval(advancePreparation, 100)
    }
    document.addEventListener?.('visibilitychange', reconcileStartup)
    for (const event of ['online', 'offline', 'pageshow']) window.addEventListener(event, () => {
      if (event === 'pageshow') suspended = false
      reconcileStartup()
    })
    window.addEventListener('pagehide', () => { suspended = true; healthBackgrounded = true; reconcileStartup() })
    document.addEventListener?.('freeze', () => { suspended = true; healthBackgrounded = true; reconcileStartup() })
    document.addEventListener?.('resume', () => { suspended = false; reconcileStartup() })
    function mountFrame(attempt) {
      finishCheckpointRequest(false)
      healthBackgrounded = document.hidden
      stopProgress()
      frameAttempt = attempt
      frame = document.createElement('iframe')
      const mounted = frame
      const gameUrl = new URL('index.html', tinySwordsReleaseUrl)
      if (attempt.number > 1) gameUrl.searchParams.set('startup_retry', '1')
      if (attempt.delivery === 'ordinary') gameUrl.searchParams.set('startup_delivery', 'ordinary')
      // Transport the hosted internal rollout context.
      const parameters = new URLSearchParams(location.search)
      if (parameters.get('internal_test') === '1') gameUrl.searchParams.set('internal_test', '1')
      frame.src = gameUrl.href
      frame.title = translate('island.frameTitle')
      frame.className = 'tiny-swords-frame'
      session += 1
      restored = false
      activeInteraction = true
      reportedVisibility = null
      reportSyncActivity()
      if (frame !== mounted || frameAttempt !== attempt) return
      failed = false
      progressPercent = 0
      preparing = false
      preparationFloor = 0
      legacy = false
      gameLevelCount = null
      reportedVisibility = null
      expected = identity(readIsland())
      expectedAccess = accessIdentity()
      reportFailure('')
      controls.hidden = true
      controls.classList.remove('tiny-swords-editing')
      cameraObserver.observe(frame)
      frame.addEventListener('load', () => { if (frame === mounted && frameAttempt === attempt) sendStudyLevel() })
      frame.addEventListener('error', () => startup.fail(attempt, { reason: 'script', asset: 'script' }))
      surface.append(frame)
      setLoadState('loading', 'island.preparing')
      syncInput()
      progressTimer = setInterval(advancePreparation, 100)
    }
    function sendStudyLevel() {
      sendLocale()
      if (failed || gameLevelCount === null || !persistence()) return
      const state = readIsland()
      if (!state) {
        disposeFrame()
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
          failStartup('restore')
          return
        }
      }
      if (new TextEncoder().encode(JSON.stringify(saved) || '').length > 512 * 1024) {
        failStartup('restore')
        return
      }
      // Godot restores the saved game level itself. Only claimed study progress
      // is a progression floor; test levels must not turn into study claims.
      frame?.contentWindow?.postMessage({ type: 'edenia-study-level', session, level, layout: saved ?? null }, location.origin)
      startup.advance(frameAttempt, 'restore')
      sendVisibility()
    }
    function retireFrame() {
      finishCheckpointRequest(false)
      stopProgress()
      if (frame) {
        try { frame.contentWindow?.edeniaCancelGameStartup?.() } catch {}
        cameraObserver.unobserve(frame)
        frame.remove()
      }
      cancelPreloads()
      frame = null
      frameAttempt = null
      failed = true
      reportedVisibility = false
      restored = false
      preparing = false
      controls.hidden = true
      reportSyncActivity()
    }
    function disposeFrame() {
      releaseGeneration++; releaseLookup?.abort(); releaseLookup = null
      startup.stop('waiting-profile')
    }
    function checkReplacement(force = false) {
      // Ownership loss retires the iframe immediately, including while a save
      // is awaiting acknowledgment. A new owner gets a fresh restore session.
      if (!readIsland()) { disposeFrame(); return }
      const changedOwner = accessIdentity() !== expectedAccess
      if (changedOwner) disposeFrame()
      if (saving) { replacementPending ||= force || !frame; return }
      if (force || changedOwner || identity(readIsland()) !== expected
        || ['waiting-profile', 'disposed'].includes(startup.state)) {
        releaseGeneration++; releaseLookup?.abort(); releaseLookup = null; releaseLookupTried = false
        expected = identity(readIsland()); expectedAccess = accessIdentity()
        startup.start()
      }
      else sendStudyLevel()
    }
    window.addEventListener('edenia-profile-persisted', event => {
      // Another tab's checked pose does not replace a live world. Accept its
      // durable CAS baseline for the next local capture; gameplay replacements
      // and saves already in flight retain the ordinary retirement checks.
      if (event.detail?.animalCheckpoint === true && !event.detail?.replacement
        && frame && restored && !saving && accessIdentity() === expectedAccess && readIsland()) {
        expected = identity(readIsland())
        return
      }
      checkReplacement(event.detail?.replacement)
    })
    window.addEventListener('edenia-profile-access', () => checkReplacement())
    window.addEventListener('storage', () => checkReplacement())
    window.addEventListener('message', async event => {
      if (event.origin !== location.origin || (!frame || event.source !== frame.contentWindow)) return
      const data = event.data
      if (data?.type === 'edenia-game-startup-failed') { failStartup(data.reason, { asset: data.asset }); return }
      if (failed && data?.type !== 'edenia-tiny-layout') return
      if (data?.type === 'edenia-game-loading-progress') {
        if (restored || !Number.isFinite(data.current) || !Number.isFinite(data.total)
          || data.total <= 0 || data.current < 0 || data.current > data.total) return
        startup.activity(frameAttempt, data.current)
        if (data.current === data.total) { startup.advance(frameAttempt, 'engine'); prepareIsland() }
        else if (!preparing) {
          progressPercent = Math.max(progressPercent, Math.floor(data.current / data.total * 60))
          renderProgress()
        }
        return
      }
      if (data?.type === 'edenia-game-engine-initialized') {
        startup.advance(frameAttempt, 'scene')
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
        if (typeof data.active === 'boolean') {
          activeInteraction = data.active
          reportSyncActivity()
        }
        controls.hidden = !restored || data.celebrating === true
        controls.classList.toggle('tiny-swords-editing', data.editing === true)
      }
      if (data?.type === 'edenia-tiny-ready') { startup.advance(frameAttempt, 'assets'); prepareIsland(); sendStudyLevel() }
      if (data?.session !== session) return
      if (data.type === 'edenia-checkpoint-flushed' && checkpointRequest
        && checkpointRequest.session === session && data.requestId === checkpointRequest.id) {
        finishCheckpointRequest(data.persisted === true)
        return
      }
      if (data.type === 'edenia-game-focus-exit' && !blocked && restored && !failed) {
        (touchDevice ? document.querySelector('.gear-btn[data-settings-shell-action="open"]') : controls.querySelector('[data-city-zoom-action="reset"]'))?.focus()
      }
      if (data.type === 'edenia-tiny-restored') {
        if (startup.state !== 'loading') return
        if (data.accepted !== true) { failStartup('restore'); return }
        if (!startup.ready(frameAttempt)) return
        restored = data.accepted === true
        failed = !restored
        stopProgress()
        if (restored) progressPercent = 100
        setLoadState('ready', 'island.loading')
        controls.hidden = !restored
        frame?.contentWindow?.postMessage({ type: 'edenia-startup-complete', session }, location.origin)
        syncInput()
      }
      if (data.type === 'edenia-tiny-layout') {
        const target = frame
        const targetSession = session
        let persisted = false
        if (restored && !saving && persistence()) {
          saving = true
          try { persisted = await persistence().save(data.layout, expected, { syncCloud: data.checkpoint === true ? false : undefined }) } catch {}
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
      || window.matchMedia?.('(any-pointer: coarse)')?.matches === true
    if (touchDevice) {
      controls.style.setProperty('--tiny-swords-camera-cursor', 'none')
      for (const button of controls.querySelectorAll('[data-city-zoom-action]')) {
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
      let viewport
      try { viewport = frame?.contentWindow?.edeniaCamera }
      catch (error) {
        // A failed iframe can have an opaque browser-error document.
        if (error?.name !== 'SecurityError') throw error
        return
      }
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
        if (touchDevice || blocked || !restored || failed) return
        frame?.contentWindow?.postMessage({ type: 'edenia-camera', command: button.dataset.cityZoomAction }, location.origin)
      })
    }
    surface.append(status)
    visibilityObserver?.observe(surface)
    checkReplacement()
  }
  if (document.readyState === 'loading' || !document.readyState) {
    window.addEventListener('DOMContentLoaded', initializeIsland, { once: true })
  } else {
    initializeIsland()
  }
}
