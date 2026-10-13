// Explicit local diagnostics: one retained package, no learner data or upload.
(() => {
  if (window.edeniaLagCapture || !window.edeniaFrameTest) return
  const canvas = document.querySelector('#canvas'), store = window.edeniaLagCaptureStore
  let active = false, busy = true, recording = null, stream = null, video = null, report = null
  let frames = [], tasks = [], markers = [], probes = [], chunks = [], events = [], stalls = [], actions = []
  let bytes = 0, began = 0, last = null, started = null, timer = null, status = 'Loading saved captures…'
  let captureId = '', videoError = '', hasVideo = false, session = null, selectedId = '', phase = '', phaseMs = 0
  let lastActivity = '', input = {}, lastInputFlush = 0
  const observers = [], listeners = [], supportedScopes = []
  let syncObserver = null, lastSyncStatus = null
  const epoch = () => performance.timeOrigin + performance.now()
  const limit = (items, value, max) => { items.push(value); if (items.length > max) items.shift() }
  const syncStatus = () => {
    const status = parent.document.querySelector('#learnerProfileSyncStatus')?.dataset.syncStatus || 'unavailable'
    return ['idle','checking','waiting-check','conflicting','needs-attention','not-backed-up','not-yet-backed-up','syncing','up-to-date','waiting','unavailable'].includes(status) ? status : 'unavailable'
  }
  const pageUrl = () => {
    // Keep route/experiment identity, omit arbitrary query strings and auth fragments.
    try {
      const url = new URL(parent.location.href)
      const query = new URLSearchParams()
      for (const key of ['internal_test', 'tiny_swords_fps']) {
        const value = url.searchParams.get(key)
        if (/^\d{1,2}$/.test(value || '')) query.set(key, value)
      }
      return `${url.origin}${url.pathname}${query.size ? `?${query}` : ''}`
    } catch { return '' }
  }
  const environment = () => ({ userAgent: navigator.userAgent, pageUrl: pageUrl(),
    canvas: { width: canvas.width, height: canvas.height, dpr: devicePixelRatio },
    viewport: { width: innerWidth, height: innerHeight },
    targetFps: window.edeniaFrameTest.getState().targetFps, progressSyncStatus: syncStatus(),
    release: location.pathname, hardwareConcurrency: navigator.hardwareConcurrency, deviceMemoryGiB: navigator.deviceMemory,
    connection: navigator.connection ? { effectiveType: navigator.connection.effectiveType, downlinkMbps: navigator.connection.downlink,
      rttMs: navigator.connection.rtt, saveData: navigator.connection.saveData } : null,
    audioState: typeof GodotAudio === 'object' ? GodotAudio.ctx?.state : null,
    visibleVideoCards: parent.document.querySelectorAll('.video-card').length, longTaskObserverScopes: supportedScopes.slice() })
  const persisted = () => { if (active) limit(events, { type: 'local-profile-persisted', atEpochMs: epoch() }, 100) }
  const flushInput = () => {
    if (Object.values(input).some(count => count > 0)) limit(actions, { type: 'interaction-counts', atEpochMs: epoch(), counts: input }, 600)
    input = {}; lastInputFlush = epoch()
  }
  const listen = (target, name, callback) => {
    target.addEventListener(name, callback, true)
    listeners.push(() => target.removeEventListener(name, callback, true))
  }
  const count = name => { input[name] = (input[name] || 0) + 1 }
  const watchActions = () => {
    listen(canvas, 'pointermove', () => count('gamePointerMoves'))
    listen(canvas, 'pointerdown', event => count(event.pointerType === 'touch' ? 'gameTouches' : 'gameClicks'))
    listen(canvas, 'wheel', () => count('gameWheelEvents'))
    listen(parent.document, 'pointerdown', event => {
      if (event.target?.closest?.('.video-card')) count('videoCardClicks')
      else count('pageClicks')
    })
    listen(parent.document, 'scroll', () => count('pageScrollEvents'))
    for (const name of ['play', 'pause', 'seeked']) listen(parent.document, name, event => {
      if (event.target?.tagName === 'VIDEO') limit(actions, { type: `video-${name}`, atEpochMs: epoch() }, 600)
    })
  }
  const stopObservers = () => {
    for (const observer of observers) observer.disconnect()
    observers.length = 0; syncObserver?.disconnect(); syncObserver = null
    parent.removeEventListener('edenia-profile-persisted', persisted)
    for (const cleanup of listeners.splice(0)) cleanup()
  }
  const watchTasks = () => {
    supportedScopes.length = 0
    for (const [scope, context] of [['game', window], ['host', parent]]) {
      try {
        const observer = new context.PerformanceObserver(list => {
          if (!active) return
          for (const task of list.getEntries()) limit(tasks, { scope,
            atEpochMs: context.performance.timeOrigin + task.startTime, durationMs: task.duration }, 500)
        })
        observer.observe({ type: 'longtask', buffered: false }); observers.push(observer); supportedScopes.push(scope)
      } catch {}
    }
  }
  const visible = () => !document.hidden && !window.edeniaPresentationSuspended && window.edeniaHostVisible !== false
  const releaseTracks = () => { for (const track of stream?.getTracks() || []) track.stop(); stream = null }
  const completeSession = async () => {
    const finished = session
    busy = true; status = 'Preparing capture package…'
    const json = value => new Blob([JSON.stringify(value, null, 2)], { type: 'application/json' })
    const fileNames = finished.runs.map(run => `${finished.id}-${run.phase}.json`)
    const files = finished.runs.map((run, index) => ({ name: fileNames[index], blob: json(run) }))
    if (finished.clip) files.push({ name: `${finished.id}.${finished.clip.type.includes('mp4') ? 'mp4' : 'webm'}`, blob: finished.clip })
    const summary = {
      version: 2, captureId: finished.id, pageUrl: finished.pageUrl, mode: finished.mode,
      comparisonComplete: Boolean(finished.clip) && finished.runs.some(run => run.phase === 'recorded') && finished.runs.some(run => run.phase === 'log-only'),
      interrupted: finished.runs.some(run => !['phase complete','time limit','user stopped'].includes(run.stopReason)),
      runs: finished.runs.map((run, index) => ({ phase: run.phase, reportFile: fileNames[index],
        durationSeconds: (run.endedAtEpochMs - run.startedAtEpochMs) / 1000, frames: run.frames.length,
        stalls: run.stalls.length, worstGapMs: Math.max(0, ...run.stalls.map(stall => stall.intervalMs)),
        userMarks: run.lagMarkers.length, videoError: run.video.error })),
      comparisonNote: 'Sequential real-user runs. Repeat similar actions in the log-only phase; this is not identical-input replay or proof that recording caused a difference.',
      privacy: 'Game-only clip, route/experiment URL, named gameplay modes and interaction counts. No microphone, typed text, learner profile, arbitrary URL parameters, credentials or upload.'
    }
    files.push({ name: `${finished.id}-summary.json`, blob: json(summary) })
    files.push({ name: 'README.txt', blob: new Blob(['Share this ZIP as one file. The game clip and reports belong to the same capture.\n\n' + summary.comparisonNote + '\n\n' + summary.privacy + '\n\nStalls are frame intervals over 50 ms. Host/game long-task entries may describe the same main-thread task; do not sum both scopes.\n']) })
    try {
      const blob = await store.packageFiles(files)
      const durable = await store.put({ id: finished.id, createdAt: finished.createdAt, summary, blob })
      selectedId = finished.id
      status = durable ? 'Package saved on this device' : 'Package kept in this tab · download before leaving'
    } catch {
      status = 'Could not package capture · try Save package again'
      // Keep all raw data available for a retry; a new run must not replace it.
      busy = false; return false
    }
    session = null; busy = false; return true
  }
  const finish = async (reason, nextPhase = false) => {
    if (!active) return false
    active = false; busy = true; clearTimeout(timer); flushInput(); stopObservers()
    status = hasVideo ? 'Finishing recording…' : 'Preparing capture…'
    limit(events, { type: 'stop', reason, atEpochMs: epoch() }, 100)
    report = { version: 2, captureId, phase, stopReason: reason, startedAtEpochMs: began, endedAtEpochMs: epoch(),
      environment: environment(), video: { requested: hasVideo, mimeType: recording?.mimeType || null, error: videoError,
        bytes, includesMicrophone: false, includesHostPage: false }, frames, longTasks: tasks, lagMarkers: markers, stalls, actions, probes, events,
      measurement: 'Actual engine intervals and synchronous loop work. Gaps over 50 ms are automatically marked. Recording can add load. Host/game long-task scopes may overlap.' }
    if (recording?.state === 'recording') {
      await new Promise(resolve => {
        const recorder = recording
        const timeout = setTimeout(() => { videoError = 'Encoder did not finish'; resolve() }, 5000)
        recorder.onstop = () => { clearTimeout(timeout); resolve() }
        recorder.stop()
      })
      video = chunks.length ? new Blob(chunks, { type: recording.mimeType }) : null
      report.video.bytes = bytes; report.video.error = videoError || (video ? '' : 'No video frames received')
      if (video) session.clip = video
      chunks = []; recording = null
    }
    releaseTracks()
    session.runs.push(report)
    if (nextPhase && session.mode === 'record-and-compare' && phase === 'recorded' && visible()) {
      startPhase(false, 'log-only', phaseMs)
      return true
    }
    return completeSession()
  }
  const startPhase = (withVideo, name, duration) => {
    phase = name; phaseMs = duration
    frames = []; tasks = []; markers = []; probes = []; chunks = []; events = []; stalls = []; actions = []; input = {}
    began = epoch(); last = null; started = null; lastActivity = ''; lastInputFlush = began
    bytes = 0; videoError = ''; hasVideo = Boolean(withVideo)
    if (withVideo) {
      try {
        if (typeof MediaRecorder !== 'function' || typeof canvas.captureStream !== 'function') throw Error('Video unavailable; capturing diagnostics only')
        stream = canvas.captureStream(0)
        if (typeof stream.getVideoTracks()[0]?.requestFrame !== 'function') { releaseTracks(); stream = canvas.captureStream(60) }
        const mimeType = ['video/webm;codecs=vp8','video/webm','video/mp4'].find(type => MediaRecorder.isTypeSupported(type))
        if (!mimeType) throw Error('Video unavailable; capturing diagnostics only')
        recording = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: 1500000 })
        const recorder = recording
        recorder.ondataavailable = event => {
          if (recording !== recorder || !event.data.size) return
          bytes += event.data.size; chunks.push(event.data)
          if (bytes >= 16 * 1024 * 1024 && active) void finish('16 MB clip limit')
        }
        recorder.onerror = () => { videoError = 'Video encoder failed'; if (active) void finish(videoError) }
        recorder.start(1000)
      } catch (error) { videoError = error.message; releaseTracks(); recording = null; hasVideo = false }
    }
    active = true; busy = false
    status = phase === 'recorded' ? '1/2 · recording · play normally' : session.mode === 'record-and-compare' ? '2/2 · no recording · repeat similar actions' : 'Logging · play normally'
    if (videoError) status = `${videoError} · play normally`
    watchTasks(); watchActions(); parent.addEventListener('edenia-profile-persisted', persisted)
    const syncHeader = parent.document.querySelector('#learnerProfileSyncStatus')
    lastSyncStatus = syncStatus()
    if (syncHeader && typeof parent.MutationObserver === 'function') {
      syncObserver = new parent.MutationObserver(() => {
        const value = syncStatus()
        if (active && value !== lastSyncStatus) { limit(events, { type: 'progress-sync', status: value, atEpochMs: epoch() }, 100); lastSyncStatus = value }
      })
      syncObserver.observe(syncHeader, { attributes: true, attributeFilter: ['data-sync-status'] })
    }
    events.push({ type: 'start', atEpochMs: began, withVideo: hasVideo, targetFps: window.edeniaFrameTest.getState().targetFps, progressSyncStatus: lastSyncStatus })
    timer = setTimeout(() => { void finish('phase complete', true) }, duration)
    return true
  }
  const begin = (withVideo, paired = false, duration) => {
    if (active || busy || session || !visible() || window.edeniaFrameTest.getState().running) return false
    if (store.list().length >= store.archiveLimit) { status = 'Five captures kept · delete an earlier capture to make room'; return false }
    video = null; report = null
    captureId = `tiny-swords-lag-${new Date().toISOString().replace(/[:.]/g, '-')}`
    session = { id: captureId, createdAt: epoch(), pageUrl: pageUrl(), mode: paired ? 'record-and-compare' : withVideo ? 'record-only' : 'log-only', runs: [], clip: null }
    // Test-only shorter durations still exercise the same encoder and phase flow.
    const milliseconds = Number.isFinite(duration) ? Math.max(1000, Math.min(60000, duration)) : paired ? 20000 : withVideo ? 60000 : 180000
    return startPhase(withVideo, withVideo ? 'recorded' : 'log-only', milliseconds)
  }
  MainLoop.preMainLoop.push(() => { if (active) started = performance.now() })
  MainLoop.postMainLoop.push(() => {
    if (!active || started === null) return
    if (!visible()) { void finish('hidden or offscreen'); return }
    if (recording?.state === 'recording') stream?.getVideoTracks()[0]?.requestFrame?.()
    if (last !== null) {
      const frame = { atEpochMs: performance.timeOrigin + started, intervalMs: started - last, workMs: performance.now() - started }
      limit(frames, frame, 12000)
      if (frame.intervalMs > 50) limit(stalls, { ...frame, seconds: (frame.atEpochMs - began) / 1000, source: 'automatic' }, 500)
    }
    last = started
    if (epoch() - lastInputFlush >= 1000) flushInput()
  })
  const save = (blob, name) => {
    const url = URL.createObjectURL(blob), link = document.createElement('a')
    link.href = url; link.download = name; link.click()
    setTimeout(() => URL.revokeObjectURL(url), 60000)
  }
  store.ready.then(() => { busy = false; selectedId = store.list()[0]?.id || ''; status = selectedId ? 'Saved captures ready' : 'Ready · automatic pauses and action context' })
  window.edeniaLagCapture = {
    start: withVideo => begin(withVideo), startComparison: options => begin(true, true, options?.phaseMs),
    stop: () => finish('user stopped'), pause: reason => finish(reason),
    mark() { if (active) limit(markers, { atEpochMs: epoch(), seconds: (epoch() - began) / 1000, source: 'user' }, 100) },
    activity(mode) {
      if (!active || mode === lastActivity || !['idle','walking','planning-route','harvesting','construction','building','water','carrying-chicken'].includes(mode)) return
      lastActivity = mode; limit(actions, { type: 'gameplay', mode, atEpochMs: epoch() }, 600)
    },
    probe(operation, durationMs, details = null) {
      if (!active || !['obstacle-search','replay-copy','target-fps'].includes(operation) || !Number.isFinite(durationMs)) return
      const safe = {}
      for (const key of ['workMs','wallMs','fps']) if (Number.isFinite(details?.[key])) safe[key] = details[key]
      if (typeof details?.cancelled === 'boolean') safe.cancelled = details.cancelled
      limit(probes, { operation, durationMs, details: safe, atEpochMs: epoch() }, 500)
    },
    getState: () => ({ active, busy, status, phase, paired: session?.mode === 'record-and-compare', hasReport: Boolean(report), hasVideo: Boolean(video), recording: active && hasVideo,
      canStart: !active && !busy && !session && store.list().length < store.archiveLimit,
      canSave: !active && !busy && Boolean(session || store.list().find(item => item.id === selectedId)),
      captures: store.list().map(item => ({ id: item.id, createdAt: item.createdAt, durable: item.durable, runs: item.summary.runs.length })), selectedId,
      navigationSearches: probes.filter(probe => probe.operation === 'obstacle-search').length,
      elapsedSeconds: active ? (epoch() - began) / 1000 : 0,
      remainingSeconds: active ? Math.max(0, Math.ceil((phaseMs - epoch() + began) / 1000)) : 0, markers: markers.length, stalls: stalls.length }),
    select(id) { if (store.list().some(item => item.id === id)) selectedId = id },
    async deleteSelected() {
      if (active || busy || session) return false
      busy = true
      const removed = await store.remove(selectedId)
      if (removed) selectedId = store.list()[0]?.id || ''
      busy = false; status = removed ? 'Capture deleted' : 'Could not delete saved capture'; return removed
    },
    savePackage() {
      if (active || busy) return false
      if (session) { void completeSession(); return false }
      const item = store.list().find(item => item.id === selectedId)
      if (!item) return false
      save(item.blob, `${item.id}.zip`); return true
    },
    // Retained only for existing diagnostics automation, not exposed as separate UI steps.
    saveReport() { if (report) save(new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' }), `${captureId}.json`) },
    saveVideo() { if (video) save(video, `${captureId}.${video.type.includes('mp4') ? 'mp4' : 'webm'}`) }
  }
  addEventListener('visibilitychange', () => { if (document.hidden) void finish('page hidden') })
  addEventListener('pagehide', () => { void finish('page retired'); stopObservers(); releaseTracks() })
})()
