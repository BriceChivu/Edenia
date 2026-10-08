// The announcement shares the page's modal, button and localization surfaces.
// It belongs to the active learner profile, including portable export/restore.
export function createIslandAnnouncement({ root, enabled, read, save }) {
  const modal = root.getElementById('islandAnnouncement')
  const button = root.getElementById('islandAnnouncementContinue')
  const main = root.getElementById('mainApp')
  let previousFocus = null
  let dismissing = false

  button?.addEventListener('click', async () => {
    if (dismissing) return
    dismissing = true
    try {
      const state = read()
      if (state) {
        state.onboarding.islandAnnouncementSeenAt = new Date().toISOString()
        await save(state)
      }
    } finally {
      modal.classList.add('hidden')
      root.body.classList.remove('island-announcement-open')
      main.inert = false
      if (previousFocus?.isConnected && previousFocus !== root.body) previousFocus.focus()
      else root.querySelector('[data-settings-shell-action="open"]')?.focus()
      dismissing = false
    }
  })
  root.addEventListener('keydown', event => {
    if (!modal || modal.classList.contains('hidden')) return
    // Exactly one action. Keep Tab on Continue and leave Escape on the dialog.
    if (event.key === 'Tab' || event.key === 'Escape') {
      event.preventDefault()
      event.stopImmediatePropagation()
      button.focus()
    }
  }, true)
  return {
    show(state) {
      if (!enabled || !modal || !state?.onboarding?.setupCompleted
        || !state.onboarding.walkthroughCompleted || state.onboarding.islandAnnouncementSeenAt
        || root.body.classList.contains('walkthrough-active')) return false
      // Nested dialogs can live under a hidden overlay, so check actual visibility.
      if ([...root.querySelectorAll('[aria-modal="true"]')].some(node => node.getClientRects().length)) return false
      previousFocus = root.activeElement
      modal.classList.remove('hidden')
      root.body.classList.add('island-announcement-open')
      main.inert = true
      button.focus()
      return true
    }
  }
}
