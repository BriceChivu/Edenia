// Resolve a removed anchor against its previous neighbors, preferring the next
// item at an equal distance. Ordering always comes from the new collection.
export function resolveWindowAnchor(previousIds, nextIds, index) {
  const nextIndexes = new Map(nextIds.map((id, i) => [id, i]))
  for (let distance = 0; distance < previousIds.length; distance++) {
    for (const candidate of distance ? [index + distance, index - distance] : [index]) {
      const nextIndex = nextIndexes.get(previousIds[candidate])
      if (nextIndex !== undefined) return nextIndex
    }
  }
  return nextIds.length ? 0 : -1
}

export function captureWindowFocus(root) {
  const active = document.activeElement
  if (!root.contains(active)) return null
  const card = active.closest('.video-card')
  if (!card) return null
  return { id: card.dataset.videoId, selector: active.matches('button')
    ? `button.${[...active.classList].find(name => name !== 'action-btn' && name.endsWith('-btn')) || [...active.classList][0]}` : '.thumb-link' }
}

export function restoreWindowFocus(root, focus, node) {
  if (!focus || root.contains(document.activeElement)) return
  const target = node?.querySelector(focus.selector) || node?.querySelector('a, button') || root
  if (target === root && !root.hasAttribute('tabindex')) root.tabIndex = -1
  target.focus({ preventScroll: true })
}
