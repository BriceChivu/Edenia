const boundRoots = new WeakSet()
const fallbackSelector = '[data-image-fallback-action="hide"]'

export function bindImageFallbackActions(root) {
  if (!root || typeof root.addEventListener !== 'function') {
    throw new TypeError('Image fallback actions require an event target root')
  }
  if (boundRoots.has(root)) return false

  root.addEventListener('error', event => {
    const image = event.target
    if (
      !image
      || typeof image.matches !== 'function'
      || !image.matches(fallbackSelector)
    ) return
    image.hidden = true
  }, true)
  boundRoots.add(root)
  return true
}
