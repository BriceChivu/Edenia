const boundLists = new WeakSet()
const resultSelector = '[data-video-search-action="select-result"]'

export function bindVideoSearchResultActions(root, actions) {
  if (!root || typeof root.querySelector !== 'function') {
    throw new TypeError('Video search result actions require a queryable root')
  }
  if (!actions || typeof actions.selectResult !== 'function') {
    throw new TypeError(
      'Video search result actions require a selectResult callback'
    )
  }

  const list = root.querySelector('#videoSearchResults')
  if (!list || boundLists.has(list)) return 0
  list.addEventListener('click', event => {
    const control = event.target.closest?.(resultSelector)
    if (!control || !list.contains(control)) return
    const videoId = control.dataset.videoId
    actions.selectResult(videoId)
  })
  boundLists.add(list)
  return 1
}
