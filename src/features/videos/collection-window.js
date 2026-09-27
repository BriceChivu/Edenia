import { resolveWindowAnchor, captureWindowFocus, restoreWindowFocus } from './window-anchor.js'
import { bindWindowKeyboard } from './window-keyboard.js'

// Compact Watched/Removed collections retain their complete grid geometry.
export function createCollectionWindow(grid, { videos, render, bind }) {
  let columns = 1
  let rowHeight = 59
  let gap = 8
  let frame = 0
  let revealedIndex = null
  let revealTimer = 0
  const mounted = new Map()
  const markup = new WeakMap()

  function mount(index) {
    if (mounted.has(index)) return mounted.get(index)
    const template = document.createElement('template')
    const html = render(videos[index])
    template.innerHTML = html
    const node = template.content.firstElementChild
    markup.set(node, html)
    mounted.set(index, node)
    // Bind while the fragment still includes the card itself as a descendant.
    bind(template.content)
    grid.append(node)
    return node
  }

  function measure() {
    if (!videos.length || !grid.getClientRects().length) return
    const style = getComputedStyle(grid)
    columns = style.gridTemplateColumns.split(' ').length
    gap = parseFloat(style.rowGap) || 0
    const sample = mounted.values().next().value || mount(0)
    sample.style.gridRow = ''
    sample.style.gridColumn = ''
    grid.style.gridTemplateRows = ''
    rowHeight = Math.max(59, sample.getBoundingClientRect().height)
    grid.style.gridTemplateRows = `repeat(${Math.ceil(videos.length / columns)}, ${rowHeight}px)`
  }

  function update() {
    frame = 0
    const rect = grid.getBoundingClientRect()
    const pitch = rowHeight + gap
    const startRow = Math.max(0, Math.floor((-rect.top - 200) / pitch))
    const endRow = Math.max(0, Math.ceil((innerHeight - rect.top + 200) / pitch))
    const wanted = new Set()
    for (let i = startRow * columns; i < Math.min(videos.length, endRow * columns); i++) wanted.add(i)
    if (revealedIndex !== null) wanted.add(revealedIndex)
    for (const [index, node] of mounted) {
      if (node.contains(document.activeElement)) wanted.add(index)
    }
    for (const [index, node] of mounted) {
      if (!wanted.has(index)) { node.remove(); mounted.delete(index) }
    }
    let previous = null
    for (const index of [...wanted].sort((a, b) => a - b)) {
      const node = mount(index)
      node.style.gridRow = String(Math.floor(index / columns) + 1)
      node.style.gridColumn = String(index % columns + 1)
      const next = previous ? previous.nextSibling : grid.firstChild
      if (next !== node) grid.insertBefore(node, next)
      previous = node
    }
  }

  function schedule() {
    if (!frame) frame = requestAnimationFrame(update)
  }

  function ensure(videoId) {
    const index = videos.findIndex(video => String(video.id) === String(videoId))
    if (index < 0) return false
    revealedIndex = index
    update()
    clearTimeout(revealTimer)
    revealTimer = setTimeout(() => { revealedIndex = null; schedule() }, 2500)
    return true
  }


  grid.replaceChildren()
  grid.style.gridTemplateRows = ''
  measure()
  update()
  const resize = new ResizeObserver(() => { measure(); update() })
  resize.observe(grid)
  window.addEventListener('scroll', schedule, { passive: true })

  grid.addEventListener('focusout', schedule)
  const keyboardControls = bindWindowKeyboard(grid, {
    count: () => videos.length,
    entries: () => mounted,
    reveal: index => {
      ensure(videos[index].id)
      return mounted.get(index)
    }
  })
  return {
    ensure,
    reconcile(definition) {
      const focus = captureWindowFocus(grid)
      const ids = videos.map(video => String(video.id))
      const focusedIndex = ids.indexOf(focus?.id)
      const index = focusedIndex >= 0 ? focusedIndex : Math.min(videos.length - 1,
        Math.max(0, Math.ceil(-grid.getBoundingClientRect().top / (rowHeight + gap))) * columns)
      const top = grid.getBoundingClientRect().top + Math.floor(index / columns) * (rowHeight + gap)
      const nextIds = definition.videos.map(video => String(video.id))
      const nextIndex = resolveWindowAnchor(ids, nextIds, index)
      const nodes = new Map([...mounted].map(([i, node]) => [ids[i], node]))
      const revealedId = ids[revealedIndex]
      videos = definition.videos
      render = definition.render
      bind = definition.bind
      revealedIndex = revealedId ? nextIds.indexOf(revealedId) : null
      if (revealedIndex < 0) revealedIndex = null
      mounted.clear()
      nextIds.forEach((id, i) => {
        const node = nodes.get(id)
        if (!node) return
        nodes.delete(id)
        if (markup.get(node) !== render(videos[i])) node.remove()
        else mounted.set(i, node)
      })
      nodes.forEach(node => node.remove())
      grid.style.gridTemplateRows = ''
      measure()
      keyboardControls.update()
      if (nextIndex >= 0 && (focus || (top >= 0 && top < innerHeight))) {
        const nextTop = grid.getBoundingClientRect().top + Math.floor(nextIndex / columns) * (rowHeight + gap)
        window.scrollBy({ top: nextTop - top, behavior: 'instant' })
      }
      update()
      if (focus) {
        const focusIndex = nextIds.indexOf(focus.id)
        const destination = focusIndex >= 0 ? focusIndex : nextIndex
        if (destination >= 0) ensure(videos[destination].id)
        restoreWindowFocus(grid, focus, mounted.get(destination))
      }
    },
    destroy() {
      cancelAnimationFrame(frame)
      clearTimeout(revealTimer)
      resize.disconnect()
      window.removeEventListener('scroll', schedule)
      keyboardControls.destroy()
      grid.removeEventListener('focusout', schedule)
      grid.style.gridTemplateRows = ''
    }
  }
}
