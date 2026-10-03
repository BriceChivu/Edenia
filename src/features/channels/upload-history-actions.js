// Browse saved cards first. Retry bounded history batches silently only while
// this shelf is visible near its saved boundary in an active tab.
export function bindUploadHistoryActions(track, { load }) {
  let busy = false
  let exhausted = false
  let alive = true
  let timer
  let retryAt = 0
  let lastAttemptLeft = -1
  const shelf = track.closest('.channel-shelf')
  function browsing() {
    const rect = track.getBoundingClientRect()
    return track.isConnected && !document.hidden && rect.bottom > 0 && rect.top < innerHeight
      && rect.height > 0 && track.scrollLeft + track.clientWidth >= track.scrollWidth - track.clientWidth
  }
  function schedule() {
    clearTimeout(timer)
    timer = setTimeout(() => { void attempt() }, Math.min(2147483647, Math.max(0, retryAt - Date.now())))
  }
  async function attempt() {
    if (!alive || busy || exhausted || !browsing()) return
    if (retryAt > Date.now()) { schedule(); return }
    if (!retryAt && lastAttemptLeft >= 0 && track.scrollLeft <= lastAttemptLeft + 2) return
    clearTimeout(timer)
    retryAt = 0
    lastAttemptLeft = track.scrollLeft
    busy = true
    let result
    try {
      result = await load()
    } finally {
      busy = false
    }
    if (!alive) return
    if (!result) { lastAttemptLeft = -1; return }
    exhausted = result.exhausted === true
    track.dataset.historyExhausted = String(exhausted)
    if (exhausted) {
      const next = shelf.querySelector('[data-shelf-direction="1"]')
      if (next && track.scrollLeft + track.clientWidth >= track.scrollWidth - 2) next.disabled = true
    } else if (result.retryAt || result.failed || result.busy || result.matched === false) {
      // Keep provider cooldowns; avoid rapidly scanning nonmatching formats.
      retryAt = result.retryAt || Date.now() + 30_000
      schedule()
    }
  }
  const scroll = () => { void attempt() }
  const resume = () => { if (retryAt) scroll() }
  const keyboard = event => {
    if (['ArrowRight', 'End', 'Tab'].includes(event.key) && !event.shiftKey) scroll()
  }
  track.addEventListener('scroll', scroll, { passive: true })
  track.addEventListener('wheel', scroll, { passive: true })
  track.addEventListener('touchend', scroll, { passive: true })
  track.addEventListener('keydown', keyboard)
  const click = event => { if (event.target.closest('[data-shelf-direction="1"]')) scroll() }
  shelf.addEventListener('click', click)
  window.addEventListener('scroll', resume, { passive: true })
  window.addEventListener('resize', resume, { passive: true })
  document.addEventListener('visibilitychange', resume)
  return {
    destroy() {
      alive = false
      clearTimeout(timer)
      track.removeEventListener('scroll', scroll)
      track.removeEventListener('wheel', scroll)
      track.removeEventListener('touchend', scroll)
      track.removeEventListener('keydown', keyboard)
      shelf.removeEventListener('click', click)
      window.removeEventListener('scroll', resume)
      window.removeEventListener('resize', resume)
      document.removeEventListener('visibilitychange', resume)
      delete track.dataset.historyExhausted
    }
  }
}
