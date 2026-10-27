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
    || typeof actions.enroll !== 'function'
  ) {
    throw new TypeError('Reminder preference actions require save, retry and enrollment callbacks')
  }

  let installedCount = 0
  const form = root.querySelector('[data-reminder-action="form"]')
  if (form && !boundControls.has(form)) {
    form.addEventListener('change', event => {
      const field = event?.target?.id
      if (field === 'streakRemindersEnabled' || field === 'discoveryEmailsEnabled') {
        actions.save({ [field]: event.target.checked === true })
      }
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
  const enroll = root.querySelector('[data-reminder-action="enroll"]')
  if (enroll && !boundControls.has(enroll)) {
    enroll.addEventListener('click', () => actions.enroll())
    boundControls.add(enroll)
    installedCount += 1
  }
  return installedCount
}
