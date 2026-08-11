const boundControls = new WeakSet()

export function readReminderPreferenceForm(form) {
  return {
    enabled: form.querySelector('#reminderEnabled')?.checked === true,
    days: [...form.querySelectorAll('input[name="reminderDay"]:checked')]
      .map(input => Number(input.value)),
    localTime: form.querySelector('#reminderLocalTime')?.value || '',
    timezone: form.querySelector('#reminderTimezone')?.value || '',
    consent: form.querySelector('#reminderConsent')?.checked === true
  }
}

export function bindReminderPreferenceActions(root, actions) {
  if (!root || typeof root.querySelector !== 'function') {
    throw new TypeError('Reminder preference actions require a queryable root')
  }
  if (
    !actions
    || typeof actions.save !== 'function'
    || typeof actions.cancel !== 'function'
    || typeof actions.retry !== 'function'
    || typeof actions.validate !== 'function'
  ) {
    throw new TypeError('Reminder preference actions require save, cancel, retry, and validate callbacks')
  }

  let installedCount = 0
  const form = root.querySelector('[data-reminder-action="form"]')
  if (form && !boundControls.has(form)) {
    form.addEventListener('submit', event => {
      event.preventDefault()
      actions.save(readReminderPreferenceForm(form))
    })
    form.addEventListener('change', () => {
      actions.validate(readReminderPreferenceForm(form))
    })
    boundControls.add(form)
    installedCount += 1
  }

  const controls = [
    ['cancel', actions.cancel],
    ['retry', actions.retry]
  ]
  for (const [name, callback] of controls) {
    const control = root.querySelector(`[data-reminder-action="${name}"]`)
    if (!control || boundControls.has(control)) continue
    control.addEventListener('click', () => callback())
    boundControls.add(control)
    installedCount += 1
  }
  return installedCount
}
