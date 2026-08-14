const ACTION_SELECTOR = '[data-legacy-progress-action]'

export function createLegacyProgressMigrationView({
  clearTimeoutImpl = globalThis.clearTimeout,
  root,
  setTimeoutImpl = globalThis.setTimeout,
  translate
}) {
  if (!root || typeof root.getElementById !== 'function') {
    throw new TypeError('Legacy progress view requires a document root')
  }
  if (typeof translate !== 'function') {
    throw new TypeError('Legacy progress view requires translations')
  }
  const elements = {
    gate: root.getElementById('legacyProgressMigrationGate'),
    title: root.getElementById('legacyProgressMigrationTitle'),
    body: root.getElementById('legacyProgressMigrationBody'),
    status: root.getElementById('legacyProgressMigrationStatus'),
    actions: [...root.querySelectorAll(ACTION_SELECTOR)]
  }
  if (
    !elements.gate
    || !elements.title
    || !elements.body
    || !elements.status
    || elements.actions.length !== 4
  ) throw new Error('Legacy progress migration markup is incomplete')

  let activeActions = Object.freeze({})
  let disclosureTimer = null
  let queuedNotice = null

  function setActionVisibility(names) {
    const visible = new Set(names)
    elements.actions.forEach(control => {
      control.hidden = !visible.has(control.dataset.legacyProgressAction)
    })
  }

  function show({ titleKey, bodyKey, statusKey, actions = [], focus = null }) {
    elements.title.textContent = translate(titleKey)
    elements.body.textContent = translate(bodyKey)
    elements.status.textContent = translate(statusKey)
    setActionVisibility(actions)
    elements.gate.classList.remove('hidden')
    if (focus) {
      elements.actions.find(control => (
        control.dataset.legacyProgressAction === focus
      ))?.focus()
    }
  }

  elements.actions.forEach(control => {
    control.addEventListener('click', () => {
      activeActions[control.dataset.legacyProgressAction]?.()
    })
  })

  return Object.freeze({
    hide() {
      if (disclosureTimer !== null) clearTimeoutImpl(disclosureTimer)
      disclosureTimer = null
      activeActions = Object.freeze({})
      elements.gate.classList.add('hidden')
    },
    consumeNotice() {
      const notice = queuedNotice
      queuedNotice = null
      return notice
    },
    showConflict() {
      queuedNotice = 'conflict'
    },
    showFailure(actions) {
      activeActions = Object.freeze({
        continue: actions.onContinue,
        manual: actions.onManualImport,
        retry: actions.onRetry
      })
      show({
        titleKey: 'migration.failure.title',
        bodyKey: 'migration.failure.body',
        statusKey: 'migration.failure.status',
        actions: ['retry', 'manual', 'continue'],
        focus: 'retry'
      })
    },
    showPendingCleanup() {
      queuedNotice = 'pending'
    },
    showRecovered({ alreadyPresent }) {
      queuedNotice = alreadyPresent ? 'alreadyPresent' : 'recovered'
    },
    showWorking() {
      activeActions = Object.freeze({})
      show({
        titleKey: 'migration.working.title',
        bodyKey: 'migration.working.body',
        statusKey: 'migration.working.status'
      })
    },
    waitForDisclosure({ delayMs }) {
      return new Promise(resolve => {
        let settled = false
        const settle = value => {
          if (settled) return
          settled = true
          if (disclosureTimer !== null) clearTimeoutImpl(disclosureTimer)
          disclosureTimer = null
          activeActions = Object.freeze({})
          resolve(value)
        }
        activeActions = Object.freeze({ cancel: () => settle(false) })
        show({
          titleKey: 'migration.disclosure.title',
          bodyKey: 'migration.disclosure.body',
          statusKey: 'migration.disclosure.status',
          actions: ['cancel'],
          focus: 'cancel'
        })
        disclosureTimer = setTimeoutImpl(() => settle(true), delayMs)
      })
    }
  })
}
