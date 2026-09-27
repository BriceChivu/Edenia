const focusableSelector = 'a[href], button:not(:disabled), [tabindex="0"]'

function controlsWithin(root) {
  return [...root.querySelectorAll(focusableSelector)]
    .filter(control => control.getClientRects().length && !control.closest('[inert]'))
}

// Boundary sentinels let native Tab navigation enter the complete collection,
// including when its first/last card has been released from the DOM.
export function bindWindowKeyboard(root, { count, entries, reveal }) {
  function focusIndex(index, backwards) {
    const node = reveal(index)
    if (!node) return
    const controls = controlsWithin(node)
    ;(backwards ? controls.at(-1) : controls[0])?.focus()
  }

  function boundary(backwards) {
    const sentinel = document.createElement('span')
    sentinel.tabIndex = 0
    sentinel.style.cssText = 'position:absolute;width:1px;height:1px;clip-path:inset(50%);overflow:hidden;'
    sentinel.addEventListener('focus', event => {
      if (!count() || (root.contains(event.relatedTarget) && event.relatedTarget !== root)) {
        const controls = controlsWithin(document)
        const offset = backwards ? 1 : -1
        let index = controls.indexOf(sentinel) + offset
        while (controls[index] && root.contains(controls[index]) && controls[index] !== root) index += offset
        controls[index]?.focus()
        return
      }
      focusIndex(backwards ? count() - 1 : 0, backwards)
    })
    root.insertAdjacentElement(backwards ? 'afterend' : 'beforebegin', sentinel)
    return sentinel
  }

  const start = root.tabIndex < 0 ? boundary(false) : null
  const end = boundary(true)
  function keyboard(event) {
    if (event.key !== 'Tab' || event.altKey || event.ctrlKey || event.metaKey) return
    if (event.target === root && !event.shiftKey && count()) {
      event.preventDefault()
      focusIndex(0, false)
      return
    }
    const entry = [...entries()].find(([, node]) => node.contains(event.target))
    if (!entry) return
    const [index, node] = entry
    const controls = controlsWithin(node)
    const next = index + (event.shiftKey ? -1 : 1)
    if (event.target !== (event.shiftKey ? controls[0] : controls.at(-1)) || next < 0 || next >= count()) return
    event.preventDefault()
    focusIndex(next, event.shiftKey)
  }
  root.addEventListener('keydown', keyboard)
  function update() {
    if (start) start.tabIndex = count() ? 0 : -1
    end.tabIndex = count() ? 0 : -1
  }
  update()
  return {
    update,
    destroy() {
      root.removeEventListener('keydown', keyboard)
      start?.remove()
      end.remove()
    }
  }
}
