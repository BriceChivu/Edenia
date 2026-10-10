import { createLearnerProfileConflictView } from './conflict-view.js'

const labels = {
  'profileConflict.intro': 'progressRecovery.conflict',
  'profileConflict.thisDevice': 'progressRecovery.recent',
  'profileConflict.cloud': 'progressRecovery.saved',
  'profileConflict.chooseDevice': 'progressRecovery.chooseRecent',
  'profileConflict.chooseCloud': 'progressRecovery.chooseSaved',
  'profileConflict.confirmDevice': 'progressRecovery.confirmRecent',
  'profileConflict.confirmCloud': 'progressRecovery.confirmSaved'
}

export function createLocalRecoveryConflict({ document, translate, choose }) {
  const dialog = document.createElement('dialog')
  dialog.className = 'profile-recovery-conflict'
  dialog.id = 'localProgressConflict'
  dialog.setAttribute('aria-labelledby', 'localRecoverylearnerProfileConflictTitle')
  const panel = document.getElementById('learnerProfileConflict').cloneNode(true)
  for (const element of [panel, ...panel.querySelectorAll('[id]')]) {
    element.id = `localRecovery${element.id}`
  }
  for (const element of panel.querySelectorAll('[aria-labelledby]')) {
    element.setAttribute('aria-labelledby', `localRecovery${element.getAttribute('aria-labelledby')}`)
  }
  const t = (key, params) => translate(labels[key] || key, params)
  for (const element of panel.querySelectorAll('[data-i18n]')) {
    const key = element.dataset.i18n
    element.dataset.i18n = labels[key] || key
    element.textContent = t(key)
  }
  // Protected cloud copies belong to the normal cloud view, not this dialog.
  for (const id of ['learnerProfileConflictRecovery','learnerProfileConflictRecoveryList']) {
    const element = document.createElement('div')
    element.id = `localRecovery${id}`
    element.hidden = true
    panel.append(element)
  }
  dialog.append(panel)
  document.body.append(dialog)
  const root = {
    getElementById: id => dialog.querySelector(`#localRecovery${id}`),
    createElement: tag => document.createElement(tag)
  }
  const view = createLearnerProfileConflictView({ root, translate: t,
    formatNumber: value => new Intl.NumberFormat(document.documentElement.lang || 'en').format(value),
    formatDateTime: value => new Date(value).toLocaleString(document.documentElement.lang || 'en') })
  let conflict = null
  dialog.addEventListener('cancel', event => event.preventDefault())
  dialog.addEventListener('click', async event => {
    const button = event.target.closest('[data-profile-conflict-action]')
    if (!button) return
    const action = button.dataset.profileConflictAction
    if (action === 'choose-device' || action === 'choose-cloud') view.requestChoice(action.slice(7))
    else if (action === 'cancel-choice') view.cancelChoice()
    else if (action === 'confirm-choice' && conflict) {
      view.setBusy(true)
      const resolved = await choose(button.dataset.conflictSide, conflict)
      view.setBusy(false)
      if (resolved) { conflict = null; dialog.close() }
      else {
        view.cancelChoice()
        root.getElementById('learnerProfileConflictFeedback').textContent = t('profileConflict.choiceFailed')
      }
    }
  })
  return {
    show(value) {
      conflict = value
      view.renderConflict(value)
      if (!dialog.open) dialog.showModal()
    },
    hide() { conflict = null; view.hideConflict(); if (dialog.open) dialog.close() }
  }
}
