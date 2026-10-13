// Local, explicit diagnostic capture; no learner state or network upload.
(() => {
  if (window.edeniaLagCapture || !window.edeniaFrameTest) return
  const canvas = document.querySelector('#canvas')
  let active = false, recording = null, stream = null, video = null, report = null
  let frames = [], tasks = [], markers = [], probes = [], chunks = [], events = []
  let bytes = 0, began = 0, last = null, started = 0, timer = null, status = 'Ready'
  let captureId = '', videoError = '', hasVideo = false, generation = 0
  const observers = []
  let syncObserver = null, lastSyncStatus = null
  const syncStatus = () => {
    const status = parent.document.querySelector('#learnerProfileSyncStatus')?.dataset.syncStatus || 'unavailable'
    return ['idle','checking','waiting-check','conflicting','needs-attention','not-backed-up','not-yet-backed-up','syncing','up-to-date','waiting','unavailable'].includes(status) ? status : 'unavailable'
  }
  const persisted = () => { if (active) limit(events,{type:'local-profile-persisted',atEpochMs:epoch()},100) }
  const supportedScopes = []
  const epoch = () => performance.timeOrigin + performance.now()
  const limit = (items, value, max) => { items.push(value); if (items.length > max) items.shift() }
  const environment = () => ({ userAgent: navigator.userAgent,
    canvas: { width: canvas.width, height: canvas.height, dpr: devicePixelRatio },
    viewport: { width: innerWidth, height: innerHeight },
    targetFps: window.edeniaFrameTest.getState().targetFps, progressSyncStatus:syncStatus(),
    release: location.pathname, hardwareConcurrency: navigator.hardwareConcurrency,
    deviceMemoryGiB: navigator.deviceMemory,
    connection: navigator.connection ? { effectiveType: navigator.connection.effectiveType,
      downlinkMbps: navigator.connection.downlink, rttMs: navigator.connection.rtt,
      saveData: navigator.connection.saveData } : null,
    audioState: typeof GodotAudio === 'object' ? GodotAudio.ctx?.state : null,
    visibleVideoCards: parent.document.querySelectorAll('.video-card').length,
    longTaskObserverScopes: supportedScopes.slice() })
  const stopObservers = () => {
    for (const observer of observers) observer.disconnect()
    observers.length = 0; syncObserver?.disconnect(); syncObserver = null
    parent.removeEventListener('edenia-profile-persisted',persisted)
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
        observer.observe({ type: 'longtask', buffered: false })
        observers.push(observer); supportedScopes.push(scope)
      } catch {}
    }
  }
  const finish = reason => {
    if (!active) return false
    active = false
    clearTimeout(timer); stopObservers()
    status = hasVideo ? 'Finishing clip…' : 'Report ready'
    limit(events, { type: 'stop', reason, atEpochMs: epoch() }, 100)
    report = { version: 1, captureId, startedAtEpochMs: began, endedAtEpochMs: epoch(),
      environment: environment(), video: { requested: hasVideo, mimeType: recording?.mimeType || null,
        error: videoError, bytes, includesMicrophone: false, includesHostPage: false },
      frames, longTasks: tasks, lagMarkers: markers, probes, events,
      measurement: 'Actual engine frame intervals and synchronous loop work. Recording can add load; use Log lag for a comparison without video. A visible gap over 50ms is a stall. Hidden/offscreen capture stops. No profile, credentials or upload.' }
    if (recording?.state === 'recording') recording.stop()
    else { for (const track of stream?.getTracks() || []) track.stop(); stream = null; status = 'Report ready' }
    return true
  }
  const start = withVideo => {
    if (active || recording?.state === 'recording' || status === 'Finishing clip…'
      || document.hidden || window.edeniaPresentationSuspended || window.edeniaFrameTest.getState().running) return false
    generation++
    video = null; report = null; frames = []; tasks = []; markers = []; probes = []; chunks = []; events = []
    began = epoch(); last = null; started = null; bytes = 0; videoError = ''; hasVideo = Boolean(withVideo)
    captureId = `tiny-swords-lag-${new Date().toISOString().replace(/[:.]/g, '-')}`
    if (withVideo) {
      try {
        if (typeof MediaRecorder !== 'function' || typeof canvas.captureStream !== 'function') throw Error('Video unsupported; use Log lag and Android screen recorder.')
        // Capture the game directly: no per-frame JS pixel readback/drawImage.
        // Browser encoding is asynchronous; bitrate/time/bytes bound retained data.
        stream = canvas.captureStream(0)
        if (typeof stream.getVideoTracks()[0]?.requestFrame !== 'function') {
          for (const track of stream.getTracks()) track.stop()
          stream = canvas.captureStream(60)
        }
        const mimeType = ['video/webm;codecs=vp8', 'video/webm', 'video/mp4'].find(type => MediaRecorder.isTypeSupported(type))
        if (!mimeType) throw Error('No supported video encoder; use Log lag.')
        recording = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: 1500000 })
        const version = generation
        recording.ondataavailable = event => {
          if (version !== generation || !event.data.size) return
          bytes += event.data.size; chunks.push(event.data)
          if (bytes >= 16 * 1024 * 1024 && active) finish('16 MB clip limit')
        }
        recording.onerror = () => { videoError = 'Video encoder failed'; if (active) finish(videoError) }
        recording.onstop = () => {
          if (version !== generation) return
          video = chunks.length ? new Blob(chunks, { type: recording.mimeType }) : null
          chunks = []
          if (report) { report.video.bytes = bytes; report.video.error = videoError || (video ? '' : 'No video frames received') }
          for (const track of stream?.getTracks() || []) track.stop()
          stream = null; recording = null; status = video ? 'Clip and report ready' : 'Report ready; video unavailable'
        }
        recording.start(1000)
      } catch (error) {
        videoError = error.message
        for (const track of stream?.getTracks() || []) track.stop()
        stream = null; recording = null; hasVideo = false
        status = videoError
        return false
      }
    }
    active = true; status = withVideo ? 'Recording · 60s max' : 'Logging · 3 min max'
    watchTasks()
    parent.addEventListener('edenia-profile-persisted',persisted)
    const syncHeader = parent.document.querySelector('#learnerProfileSyncStatus')
    lastSyncStatus = syncStatus()
    if (syncHeader && typeof parent.MutationObserver === 'function') {
      syncObserver = new parent.MutationObserver(() => {
        const status = syncStatus()
        if (active && status !== lastSyncStatus) { limit(events,{type:'progress-sync',status,atEpochMs:epoch()},100); lastSyncStatus = status }
      })
      syncObserver.observe(syncHeader,{attributes:true,attributeFilter:['data-sync-status']})
    }
    events.push({ type: 'start', atEpochMs: began, withVideo, targetFps:window.edeniaFrameTest.getState().targetFps, progressSyncStatus:lastSyncStatus })
    timer = setTimeout(() => finish('time limit'), withVideo ? 60000 : 180000)
    return true
  }
  MainLoop.preMainLoop.push(() => { if (active) started = performance.now() })
  MainLoop.postMainLoop.push(() => {
    if (!active || started === null) return
    if (document.hidden || window.edeniaPresentationSuspended || window.edeniaHostVisible === false) { finish('hidden or offscreen'); return }
    if (recording?.state === 'recording') stream?.getVideoTracks()[0]?.requestFrame?.()
    if (last !== null) limit(frames, { atEpochMs: performance.timeOrigin + started,
      intervalMs: started - last, workMs: performance.now() - started }, 12000)
    last = started
  })
  const save = (blob, name) => {
    const url = URL.createObjectURL(blob), link = document.createElement('a')
    link.href = url; link.download = name; link.click()
    setTimeout(() => URL.revokeObjectURL(url), 60000)
  }
  window.edeniaLagCapture = {
    start, stop: () => finish('user stopped'), pause: reason => finish(reason),
    mark() { if (active) limit(markers, { atEpochMs: epoch(), seconds: (epoch() - began) / 1000 }, 100) },
    probe(operation, durationMs, details = null) {
      if (!active || !['obstacle-search','replay-copy','target-fps'].includes(operation) || !Number.isFinite(durationMs)) return
      const safe = {}
      for (const key of ['workMs','wallMs','fps']) if (Number.isFinite(details?.[key])) safe[key] = details[key]
      if (typeof details?.cancelled === 'boolean') safe.cancelled = details.cancelled
      limit(probes, {operation,durationMs,details:safe,atEpochMs:epoch()},500)
    },
    getState: () => ({ active, status, hasReport: Boolean(report), hasVideo: Boolean(video), recording: active && hasVideo,
      elapsedSeconds: active ? (epoch() - began) / 1000 : 0, markers: markers.length }),
    saveReport() { if (report) save(new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' }), `${captureId}.json`) },
    saveVideo() { if (video) save(video, `${captureId}.${video.type.includes('mp4') ? 'mp4' : 'webm'}`) }
  }
  addEventListener('visibilitychange', () => { if (document.hidden) finish('page hidden') })
  addEventListener('pagehide', () => { finish('page retired'); stopObservers(); video = null; chunks = []; generation++
    for (const track of stream?.getTracks() || []) track.stop(); stream = null; recording = null; if (report?.video.requested) report.video.error = 'Clip interrupted by page retirement'; status = 'Report ready; clip interrupted' })
})()
