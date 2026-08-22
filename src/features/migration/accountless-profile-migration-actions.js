const boundControls = new WeakSet()

const ACTIONS = Object.freeze([
  ['begin', 'begin'],
  ['later', 'later'],
  ['confirm', 'confirm'],
  ['open-sign-in', 'openSignIn'],
  ['retry', 'retry']
])

export function bindAccountlessProfileMigrationActions(root, callbacks) {
  if (!root || typeof root.querySelector !== 'function') {
    throw new TypeError('Accountless-profile migration requires a queryable root')
  }
  if (
    !callbacks
    || ACTIONS.some(([, callback]) => typeof callbacks[callback] !== 'function')
  ) {
    throw new TypeError('Accountless-profile migration actions are required')
  }

  let installedCount = 0
  for (const [action, callback] of ACTIONS) {
    const control = root.querySelector(
      `[data-accountless-profile-migration-action="${action}"]`
    )
    if (!control || boundControls.has(control)) continue
    control.addEventListener('click', () => callbacks[callback]())
    boundControls.add(control)
    installedCount += 1
  }
  return installedCount
}
