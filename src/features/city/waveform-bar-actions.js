const boundBars = new WeakSet()

export function bindCityWaveformBarActions(root, actions) {
  if (!root || typeof root.querySelectorAll !== 'function') {
    throw new TypeError('City waveform bar actions require a queryable root')
  }
  if (
    !actions
    || typeof actions.select !== 'function'
    || typeof actions.preview !== 'function'
  ) {
    throw new TypeError('City waveform bar actions require select and preview callbacks')
  }

  let installedCount = 0
  root.querySelectorAll('[data-city-wave-action="select"]').forEach(bar => {
    if (boundBars.has(bar)) return
    bar.addEventListener('click', () => actions.select(bar))
    ;['mouseenter', 'mousemove', 'focus'].forEach(eventName => {
      bar.addEventListener(eventName, () => actions.preview(bar))
    })
    boundBars.add(bar)
    installedCount += 1
  })
  return installedCount
}
