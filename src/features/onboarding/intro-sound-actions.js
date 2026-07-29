const boundControls = new WeakSet()
const controlSelector = '[data-intro-sound-toggle]'

export function bindIntroSoundActions(root, actions) {
  if (!root || typeof root.querySelectorAll !== 'function') {
    throw new TypeError('Intro sound actions require a queryable root')
  }
  if (!actions || typeof actions.toggle !== 'function') {
    throw new TypeError('Intro sound actions require a toggle callback')
  }

  let installedCount = 0
  root.querySelectorAll(controlSelector).forEach(control => {
    if (!control || boundControls.has(control)) return

    control.addEventListener('click', () => {
      actions.toggle()
    })
    boundControls.add(control)
    installedCount += 1
  })
  return installedCount
}
