const boundControls = new WeakSet()

export function bindSettingsReplayActions(root, actions) {
  if (!root || typeof root.querySelector !== 'function') {
    throw new TypeError('Settings replay actions require a queryable root')
  }
  if (
    !actions
    || typeof actions.walkthrough !== 'function'
    || typeof actions.trailer !== 'function'
  ) {
    throw new TypeError(
      'Settings replay actions require walkthrough and trailer callbacks'
    )
  }

  const bindings = [
    [
      '.walkthrough-replay-btn[data-settings-replay-action="walkthrough"]',
      () => actions.walkthrough()
    ],
    [
      '.walkthrough-replay-btn[data-settings-replay-action="trailer"]',
      () => actions.trailer()
    ]
  ]

  let installedCount = 0
  bindings.forEach(([selector, listener]) => {
    const control = root.querySelector(selector)
    if (!control || boundControls.has(control)) return
    control.addEventListener('click', listener)
    boundControls.add(control)
    installedCount += 1
  })
  return installedCount
}
