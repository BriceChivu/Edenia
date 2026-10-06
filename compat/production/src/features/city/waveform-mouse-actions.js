const boundWaveforms = new WeakSet()

export function bindCityWaveformMouseActions(root, actions) {
  if (!root || typeof root.querySelector !== 'function') {
    throw new TypeError('City waveform mouse actions require a queryable root')
  }
  if (
    !actions
    || typeof actions.move !== 'function'
    || typeof actions.clear !== 'function'
  ) {
    throw new TypeError('City waveform mouse actions require move and clear callbacks')
  }

  const waveform = root.querySelector(
    '[data-city-waveform-action="mouse-preview"]'
  )
  if (!waveform || boundWaveforms.has(waveform)) return 0

  waveform.addEventListener('mouseenter', event => actions.move(event))
  waveform.addEventListener('mousemove', event => actions.move(event))
  waveform.addEventListener('mouseleave', () => actions.clear())
  boundWaveforms.add(waveform)
  return 1
}
