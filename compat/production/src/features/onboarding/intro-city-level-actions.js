const boundControls = new WeakSet()
const controlSelector = '[data-intro-city-level]'
const supportedLevels = new Set(['1', '4', '8', '12'])

export function bindIntroCityLevelActions(root, actions) {
  if (!root || typeof root.querySelectorAll !== 'function') {
    throw new TypeError('Intro city-level actions require a queryable root')
  }
  if (!actions || typeof actions.selectLevel !== 'function') {
    throw new TypeError(
      'Intro city-level actions require a selectLevel callback'
    )
  }

  let installedCount = 0
  root.querySelectorAll(controlSelector).forEach(control => {
    if (!control || boundControls.has(control)) return

    const levelValue = control.dataset?.introCityLevel
    if (!supportedLevels.has(levelValue)) return
    const level = Number(levelValue)

    control.addEventListener('click', () => {
      actions.selectLevel(level)
    })
    boundControls.add(control)
    installedCount += 1
  })
  return installedCount
}
