const boundControls = new WeakSet()

export function readReminderPreferenceForm(form) {
  return {
    streakRemindersEnabled:
      form.querySelector('#streakRemindersEnabled')?.checked === true,
    discoveryEmailsEnabled:
      form.querySelector('#discoveryEmailsEnabled')?.checked === true
  }
}

export function bindReminderPreferenceActions(root, actions) {
  if (!root || typeof root.querySelector !== 'function') {
    throw new TypeError('Reminder preference actions require a queryable root')
  }
  if (
    !actions
    || typeof actions.save !== 'function'
    || typeof actions.retry !== 'function'
  ) {
    throw new TypeError('Reminder preference actions require save and retry callbacks')
  }

  let installedCount = 0
  const form = root.querySelector('[data-reminder-action="form"]')
  if (form && !boundControls.has(form)) {
    form.addEventListener('change', () => {
      actions.save(readReminderPreferenceForm(form))
    })
    boundControls.add(form)
    installedCount += 1
  }

  const retry = root.querySelector('[data-reminder-action="retry"]')
  if (retry && !boundControls.has(retry)) {
    retry.addEventListener('click', () => actions.retry())
    boundControls.add(retry)
    installedCount += 1
  }
  return installedCount
}
