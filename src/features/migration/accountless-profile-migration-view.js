import {
  ACCOUNTLESS_PROFILE_MIGRATION_STATES
} from '../../domain/accountless-profile-migration.js'

const STATE_COPY = Object.freeze({
  [ACCOUNTLESS_PROFILE_MIGRATION_STATES.NOTICE]:
    'accountlessProfileMigration.notice',
  [ACCOUNTLESS_PROFILE_MIGRATION_STATES.COUNTDOWN]:
    'accountlessProfileMigration.countdown',
  [ACCOUNTLESS_PROFILE_MIGRATION_STATES.AWAITING_AUTHENTICATION]:
    'accountlessProfileMigration.authentication',
  [ACCOUNTLESS_PROFILE_MIGRATION_STATES.CONFIRMING_SESSION]:
    'accountlessProfileMigration.confirmation',
  [ACCOUNTLESS_PROFILE_MIGRATION_STATES.ATTACHING]:
    'accountlessProfileMigration.attaching',
  [ACCOUNTLESS_PROFILE_MIGRATION_STATES.BACKUP_FAILED]:
    'accountlessProfileMigration.backupFailed',
  [ACCOUNTLESS_PROFILE_MIGRATION_STATES.SIGNED_IN_PROFILE_PRESENT]:
    'accountlessProfileMigration.signedInProfilePresent'
})

const DIALOG_STATES = new Set([
  ACCOUNTLESS_PROFILE_MIGRATION_STATES.ATTACHING,
  ACCOUNTLESS_PROFILE_MIGRATION_STATES.CONFIRMING_SESSION
])

export function createAccountlessProfileMigrationView({ root, translate }) {
  const gate = root.getElementById('accountlessProfileMigrationNotice')
  const title = root.getElementById('accountlessProfileMigrationTitle')
  const body = root.getElementById('accountlessProfileMigrationBody')
  const status = root.getElementById('accountlessProfileMigrationStatus')
  const actions = {
    begin: root.getElementById('accountlessProfileMigrationBackup'),
    later: root.getElementById('accountlessProfileMigrationLater'),
    confirm: root.getElementById('accountlessProfileMigrationConfirm'),
    openSignIn: root.getElementById('accountlessProfileMigrationSignIn'),
    retry: root.getElementById('accountlessProfileMigrationRetry')
  }

  function hideActions() {
    for (const control of Object.values(actions)) control.hidden = true
  }

  function showActions(state) {
    hideActions()
    if ([
      ACCOUNTLESS_PROFILE_MIGRATION_STATES.NOTICE,
      ACCOUNTLESS_PROFILE_MIGRATION_STATES.COUNTDOWN
    ].includes(state)) actions.begin.hidden = false
    if (
      [
        ACCOUNTLESS_PROFILE_MIGRATION_STATES.NOTICE,
        ACCOUNTLESS_PROFILE_MIGRATION_STATES.AWAITING_AUTHENTICATION,
        ACCOUNTLESS_PROFILE_MIGRATION_STATES.CONFIRMING_SESSION,
        ACCOUNTLESS_PROFILE_MIGRATION_STATES.BACKUP_FAILED,
        ACCOUNTLESS_PROFILE_MIGRATION_STATES.SIGNED_IN_PROFILE_PRESENT
      ].includes(state)
    ) actions.later.hidden = false
    if (
      state === ACCOUNTLESS_PROFILE_MIGRATION_STATES.CONFIRMING_SESSION
    ) actions.confirm.hidden = false
    if (
      state === ACCOUNTLESS_PROFILE_MIGRATION_STATES.AWAITING_AUTHENTICATION
    ) actions.openSignIn.hidden = false
    if (
      state === ACCOUNTLESS_PROFILE_MIGRATION_STATES.BACKUP_FAILED
    ) actions.retry.hidden = false
  }

  function render(viewState) {
    const state = STATE_COPY[viewState?.status]
      ? viewState.status
      : ACCOUNTLESS_PROFILE_MIGRATION_STATES.HIDDEN
    root.documentElement.dataset.accountlessProfileMigrationState = state
    if (state === ACCOUNTLESS_PROFILE_MIGRATION_STATES.HIDDEN) {
      delete root.documentElement.dataset.accountlessProfileMigrationUrgency
      gate.classList.add('hidden')
      hideActions()
      return
    }

    const params = {
      days: viewState.daysRemaining,
      email: viewState.email || ''
    }
    const key = STATE_COPY[state]
    const titleKey = state === ACCOUNTLESS_PROFILE_MIGRATION_STATES.COUNTDOWN
      ? viewState.daysRemaining <= 0
        ? `${key}.titleNow`
        : viewState.daysRemaining === 1
          ? `${key}.titleSingular`
          : `${key}.title`
      : `${key}.title`
    title.textContent = translate(titleKey, params)
    body.textContent = translate(`${key}.body`, params)
    status.textContent = translate(`${key}.status`, params)
    root.documentElement.dataset.accountlessProfileMigrationUrgency = String(
      Number.isSafeInteger(viewState.urgencyLevel)
        ? viewState.urgencyLevel
        : 0
    )
    gate.classList.toggle(
      'accountless-profile-migration-dialog',
      DIALOG_STATES.has(state)
    )
    gate.setAttribute('role', DIALOG_STATES.has(state) ? 'dialog' : 'region')
    gate.setAttribute('aria-modal', String(DIALOG_STATES.has(state)))
    gate.setAttribute('aria-busy', String(
      state === ACCOUNTLESS_PROFILE_MIGRATION_STATES.ATTACHING
    ))
    showActions(state)
    gate.classList.remove('hidden')
  }

  return Object.freeze({ render })
}
