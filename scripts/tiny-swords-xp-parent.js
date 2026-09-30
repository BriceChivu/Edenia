// Loaded only by the explicitly requested local test build.
if (['localhost', '127.0.0.1'].includes(location.hostname) && location.port === '8037') {
  document.documentElement.classList.add('tiny-swords-preview')
  window.addEventListener('DOMContentLoaded', () => {
    const frame = document.createElement('iframe')
    frame.src = 'tiny-swords/index.html'
    frame.title = 'Tiny Swords island: earn XP by studying to unlock building'
    frame.className = 'tiny-swords-frame'
    const layoutKey = 'edenia_tiny_swords_xp_layout_v1'
    function sendStudyLevel() {
      const state = loadState()
      const level = Math.min(3, Math.max(1, (state?.cityProgress?.maxLevelIndex || 0) + 1))
      let saved = null
      try { saved = JSON.parse(localStorage.getItem(layoutKey)) } catch {}
      frame.contentWindow?.postMessage({ type: 'edenia-study-level', level, layout: saved }, location.origin)
    }
    window.addEventListener('message', event => {
      if (event.origin !== location.origin || event.source !== frame.contentWindow) return
      if (event.data?.type === 'edenia-tiny-ready') sendStudyLevel()
      if (event.data?.type === 'edenia-tiny-layout') {
        const level = (loadState()?.cityProgress?.maxLevelIndex || 0) + 1
        const layout = event.data.layout
        if (layout && Number.isInteger(layout.level) && layout.level >= 1 && layout.level <= Math.min(3, level)) {
          localStorage.setItem(layoutKey, JSON.stringify(layout))
        }
      }
    })
    document.querySelector('.city-image-wrap').append(frame)
    new MutationObserver(sendStudyLevel).observe(document.getElementById('cityCurrentLevel'), { childList: true, characterData: true, subtree: true })
    frame.addEventListener('load', sendStudyLevel)
  }, { once: true })
}
