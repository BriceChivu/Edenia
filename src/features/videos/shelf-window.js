import { resolveWindowAnchor, captureWindowFocus, restoreWindowFocus } from './window-anchor.js'
import { bindWindowKeyboard } from './window-keyboard.js'

// Cards are transient views. The complete ordered library stays with the caller.
export function createShelfWindow(track, { videos, render, bind, empty, isPinned, patchPinned }) {
  let items = videos
  let pitch = 0
  let gap = 0
  let frame = 0
  let keyboardControls = null
  let revealedIndex = null
  let revealTimer = 0
  let windowKey = ''
  const mounted = new Map()
  const spacers = new Set()
  const markup = new WeakMap()

  function mount(index) {
    if (mounted.has(index)) return mounted.get(index)
    const template = document.createElement('template')
    const html = render(items[index], index)
    template.innerHTML = html
    const node = template.content.firstElementChild
    markup.set(node, html)
    mounted.set(index, node)
    bind(node)
    return node
  }

  function measure() {
    if (!items.length) return
    const sample = mounted.values().next().value || mount(0)
    if (!sample.isConnected) {
      track.append(sample)
      windowKey = ''
    }
    gap = parseFloat(getComputedStyle(track).columnGap) || 0
    pitch = sample.getBoundingClientRect().width + gap
    // Keep the row's geometry after all distant cards have been released.
    const style = getComputedStyle(track)
    track.style.minHeight = `${sample.getBoundingClientRect().height + parseFloat(style.paddingTop) + parseFloat(style.paddingBottom)}px`
  }

  function update() {
    frame = 0
    if (!items.length || !pitch) return
    const rect = track.getBoundingClientRect()
    const nearby = rect.bottom >= -300 && rect.top <= innerHeight + 300
    const first = Math.max(0, Math.floor(track.scrollLeft / pitch) - 3)
    const last = Math.min(items.length, Math.ceil((track.scrollLeft + track.clientWidth) / pitch) + 3)
    const wanted = new Set()
    if (nearby) for (let i = first; i < last; i++) wanted.add(i)
    if (revealedIndex !== null) wanted.add(revealedIndex)
    for (const [index, node] of mounted) {
      if (node.contains(document.activeElement) || isPinned(node)) wanted.add(index)
    }
    const indices = [...wanted].sort((a, b) => a - b)
    const nextKey = `${pitch}:${indices.join(',')}`
    if (windowKey === nextKey) return
    windowKey = nextKey
    for (const [index, node] of mounted) {
      if (!wanted.has(index)) {
        node.remove()
        mounted.delete(index)
      }
    }
    for (const spacer of spacers) spacer.remove()
    spacers.clear()
    let cursor = 0
    let previous = null
    function place(node) {
      const next = previous ? previous.nextSibling : track.firstChild
      if (next !== node) track.insertBefore(node, next)
      previous = node
    }
    function space(count) {
      if (!count) return
      const node = document.createElement('div')
      node.className = 'shelf-window-spacer'
      node.setAttribute('aria-hidden', 'true')
      node.style.flex = `0 0 ${count * pitch - gap}px`
      spacers.add(node)
      place(node)
    }
    for (const index of indices) {
      space(index - cursor)
      place(mount(index))
      cursor = index + 1
    }
    space(items.length - cursor)
  }

  function schedule() {
    if (!frame) frame = requestAnimationFrame(update)
  }

  function ensure(videoId) {
    const index = items.findIndex(video => String(video.id) === String(videoId))
    if (index < 0) return false
    revealedIndex = index
    update()
    // Retain the target while the caller smoothly scrolls the document to it.
    clearTimeout(revealTimer)
    revealTimer = setTimeout(() => { revealedIndex = null; schedule() }, 2500)
    return true
  }


  function replace(nextItems) {
    items = nextItems
    keyboardControls?.update()
    revealedIndex = null
    windowKey = ''
    clearTimeout(revealTimer)
    mounted.clear()
    spacers.clear()
    track.replaceChildren()
    track.style.minHeight = ''
    if (track.scrollLeft) track.scrollTo({ left: 0, behavior: 'instant' })
    if (!items.length) {
      track.innerHTML = empty()
      return
    }
    measure()
    update()
  }

  function reconcile(nextItems) {
    const focus = captureWindowFocus(track)
    const oldIds = items.map(video => String(video.id))
    const nextIds = nextItems.map(video => String(video.id))
    const activeIndex = oldIds.indexOf(focus?.id)
    const index = activeIndex >= 0 ? activeIndex : Math.min(items.length - 1, Math.ceil(track.scrollLeft / pitch))
    const offset = index * pitch - track.scrollLeft
    const nextIndex = resolveWindowAnchor(oldIds, nextIds, index)
    const nodes = new Map([...mounted].map(([i, node]) => [oldIds[i], node]))
    const revealedId = oldIds[revealedIndex]
    track.querySelectorAll('.channel-shelf-format-empty').forEach(node => node.remove())
    items = nextItems
    revealedIndex = revealedId ? nextIds.indexOf(revealedId) : null
    if (revealedIndex < 0) revealedIndex = null
    mounted.clear()
    nextIds.forEach((id, i) => {
      const node = nodes.get(id)
      if (!node) return
      nodes.delete(id)
      const html = render(items[i], i)
      if (markup.get(node) !== html) {
        if (isPinned(node) && patchPinned?.(items[i])) {
          markup.set(node, html)
        } else {
          node.remove()
          return
        }
      }
      mounted.set(i, node)
    })
    nodes.forEach(node => node.remove())
    windowKey = ''
    keyboardControls?.update()
    if (!items.length) {
      track.innerHTML = empty()
      spacers.clear()
      restoreWindowFocus(track, focus, null)
      return
    }
    // Build the complete spacer geometry before assigning the new scroll offset.
    if (!pitch) measure()
    update()
    const nextLeft = Math.max(0, nextIndex * pitch - offset)
    if (Math.abs(track.scrollLeft - nextLeft) > 1) {
      track.scrollTo({ left: nextLeft, behavior: 'instant' })
    }
    update()
    if (focus) {
      const focusIndex = nextIds.indexOf(focus.id)
      const destination = focusIndex >= 0 ? focusIndex : nextIndex
      if (destination >= 0) ensure(items[destination].id)
      restoreWindowFocus(track, focus, mounted.get(destination))
    }
  }

  track.addEventListener('scroll', schedule, { passive: true })

  track.addEventListener('focusout', schedule)
  window.addEventListener('scroll', schedule, { passive: true })
  const resize = new ResizeObserver(() => { measure(); schedule() })
  resize.observe(track)
  replace(items)
  keyboardControls = bindWindowKeyboard(track, {
    count: () => items.length,
    entries: () => mounted,
    reveal: index => {
      ensure(items[index].id)
      return mounted.get(index)
    }
  })
  return {
    ensure,
    replace,
    reconcile,
    updateVideo(video) {
      const index = items.findIndex(item => String(item.id) === String(video.id))
      if (index >= 0) items[index] = video
    },
    destroy() {
      cancelAnimationFrame(frame)
      clearTimeout(revealTimer)
      resize.disconnect()
      track.removeEventListener('scroll', schedule)
      keyboardControls.destroy()
      track.removeEventListener('focusout', schedule)
      window.removeEventListener('scroll', schedule)
    }
  }
}
