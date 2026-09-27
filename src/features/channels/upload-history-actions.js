// A browsing gesture can start one bounded attempt. Nonmatching results require
// explicit continuation, rather than an observer draining an entire playlist.
export function bindUploadHistoryActions(track, { load, text }) {
  const status = document.createElement('div')
  status.dataset.uploadHistoryStatus = ''
  status.setAttribute('role', 'status')
  status.hidden = true
  track.after(status)
  let busy = false
  let paused = false
  let exhausted = false
  let alive = true
  let timer
  let lastAttemptLeft = -1
  function show(message, retry = false, retryAt = 0) {
    clearTimeout(timer)
    status.hidden = false
    status.replaceChildren(document.createTextNode(message))
    if (!retry) return
    const button = document.createElement('button')
    button.type = 'button'
    button.className = 'btn-ghost'
    button.textContent = text('continue')
    button.disabled = retryAt > Date.now()
    button.addEventListener('click', () => attempt(true))
    status.append(button)
    if (button.disabled) timer = setTimeout(() => { button.disabled = false }, Math.min(2147483647, retryAt - Date.now()))
  }
  async function attempt(explicit = false) {
    if (!alive || busy || exhausted || (paused && !explicit)) return
    if (track.scrollLeft + track.clientWidth < track.scrollWidth - track.clientWidth) return
    if (!explicit && lastAttemptLeft >= 0 && track.scrollLeft <= lastAttemptLeft + 2) return
    lastAttemptLeft = track.scrollLeft
    busy = true
    let result
    try {
      result = await load(() => show(text('loading')))
    } finally {
      busy = false
    }
    if (!alive) return
    if (!result) { lastAttemptLeft = -1; status.hidden = true; return }
    exhausted = result.exhausted === true
    paused = Boolean(result.retryAt || result.failed || result.matched === false)
    track.dataset.historyExhausted = String(exhausted)
    if (exhausted) {
      show(text('exhausted'))
      const next = track.closest('.channel-shelf').querySelector('[data-shelf-direction="1"]')
      if (next && track.scrollLeft + track.clientWidth >= track.scrollWidth - 2) next.disabled = true
    }
    else if (paused) show(text(result.busy ? 'loading' : result.failed ? 'failed' : 'limited'), true, result.retryAt)
    else status.hidden = true
  }
  const scroll = () => { void attempt() }
  const keyboard = event => {
    if (['ArrowRight', 'End', 'Tab'].includes(event.key) && !event.shiftKey) scroll()
  }
  track.addEventListener('scroll', scroll, { passive: true })
  track.addEventListener('wheel', scroll, { passive: true })
  track.addEventListener('touchend', scroll, { passive: true })
  track.addEventListener('keydown', keyboard)
  const shelf = track.closest('.channel-shelf')
  const click = event => { if (event.target.closest('[data-shelf-direction="1"]')) scroll() }
  shelf.addEventListener('click', click)
  return {
    destroy() {
      alive = false
      clearTimeout(timer)
      track.removeEventListener('scroll', scroll)
      track.removeEventListener('wheel', scroll)
      track.removeEventListener('touchend', scroll)
      track.removeEventListener('keydown', keyboard)
      shelf.removeEventListener('click', click)
      delete track.dataset.historyExhausted
      status.remove()
    }
  }
}
