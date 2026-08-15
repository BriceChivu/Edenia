const VARIANTS = Object.freeze([
  { key: 'A', name: 'Dedicated progress page' },
  { key: 'B', name: 'Guarded Edenia shell' },
  { key: 'C', name: 'Focused side panel' }
])

const SCENARIOS = new Set([
  'checking',
  'first-link',
  'cloud-empty',
  'offline-link',
  'ongoing',
  'attention',
  'signed-out'
])

const state = {
  variant: readVariant(),
  scenario: readScenario(),
  pendingChoice: null,
  syncDetailOpen: false,
  ongoingStatus: 'up-to-date'
}

const stage = document.querySelector('[data-prototype-stage]')
const variantLabel = document.querySelector('[data-variant-label]')

function readVariant() {
  const requested = new URLSearchParams(window.location.search).get('variant')?.toUpperCase()
  return VARIANTS.some(({ key }) => key === requested) ? requested : 'A'
}

function readScenario() {
  const requested = new URLSearchParams(window.location.search).get('scenario')
  return SCENARIOS.has(requested) ? requested : 'checking'
}

function updateUrl() {
  const url = new URL(window.location.href)
  url.searchParams.set('variant', state.variant)
  url.searchParams.set('scenario', state.scenario)
  window.history.replaceState(null, '', url)
}

function setVariant(nextVariant) {
  state.variant = nextVariant
  state.pendingChoice = null
  state.syncDetailOpen = false
  updateUrl()
  render()
}

function cycleVariant(offset) {
  const index = VARIANTS.findIndex(({ key }) => key === state.variant)
  const next = (index + offset + VARIANTS.length) % VARIANTS.length
  setVariant(VARIANTS[next].key)
}

function setScenario(nextScenario) {
  if (!SCENARIOS.has(nextScenario)) return
  state.scenario = nextScenario
  state.pendingChoice = null
  state.syncDetailOpen = false
  state.ongoingStatus = 'up-to-date'
  updateUrl()
  render()
}

function profileSummary(kind, compact = false) {
  const device = kind === 'device'
  return `
    <article class="profile-summary">
      <header>
        <h3>${device ? 'This device' : 'Cloud progress'}</h3>
        <span>${device ? 'Accountless original' : 'Signed-in profile'}</span>
      </header>
      <div class="profile-stats">
        <div><strong>${device ? '42' : '28'}</strong><span>study days</span></div>
        <div><strong>${device ? '86' : '61'}</strong><span>videos studied</span></div>
        <div><strong>${device ? '7' : '4'}</strong><span>channels</span></div>
      </div>
      <footer>${device ? 'Last studied today on this browser' : 'Last synced Tuesday on another device'}${compact ? '' : ' · Both contain meaningful progress'}</footer>
    </article>
  `
}

function safetyBanner(type = 'safe') {
  const className = type === 'danger' ? 'danger-banner' : type === 'warning' ? 'warning-banner' : ''
  const icon = type === 'danger' ? '!' : type === 'warning' ? '↻' : '✓'
  const copy = type === 'danger'
    ? '<strong>Nothing was changed</strong>Your device progress and last good cloud version are still intact.'
    : type === 'warning'
      ? '<strong>Saved on this device</strong>Cloud sync is paused. Edenia will retry only for this signed-in profile.'
      : '<strong>Rollback protected</strong>Edenia verifies a recovery copy before it replaces or combines anything. Your accountless original stays intact.'
  return `<div class="safety-banner ${className}"><span aria-hidden="true">${icon}</span><span>${copy}</span></div>`
}

const CHOICES = Object.freeze({
  device: {
    label: 'Keep this device',
    summary: 'Copy this browser’s accountless progress into the signed-in profile. Keep cloud progress as recovery.',
    consequence: 'Edenia will verify rollback copies, then make this device’s progress the current signed-in profile. The accountless original remains available after sign-out.'
  },
  cloud: {
    label: 'Use cloud progress',
    summary: 'Open the signed-in cloud profile here. Leave this browser’s accountless progress unchanged.',
    consequence: 'Edenia will verify rollback protection, then activate the cloud progress for this identity. This browser’s accountless profile stays untouched for sign-out.'
  },
  combine: {
    label: 'Combine safely',
    summary: 'Preserve compatible study facts from both and apply Edenia’s field-aware rules.',
    consequence: 'Edenia will compute a new signed-in profile without mutating either input, validate it, and apply it only after rollback protection succeeds. If any check fails, neither input changes.'
  }
})

function directChoiceButtons() {
  return Object.entries(CHOICES).map(([key, choice]) => `
    <button class="choice-button ${key === 'combine' ? 'recommended' : ''}" type="button" data-choice="${key}">
      <strong>${choice.label}</strong>
      <span>${choice.summary}</span>
    </button>
  `).join('')
}

function radioChoices() {
  return Object.entries(CHOICES).map(([key, choice]) => `
    <label class="radio-choice">
      <input type="radio" name="profile-choice" value="${key}" ${key === 'combine' ? 'checked' : ''}>
      <span><strong>${choice.label}${key === 'combine' ? ' · Recommended' : ''}</strong><br><span>${choice.summary}</span></span>
    </label>
  `).join('')
}

function confirmation() {
  if (!state.pendingChoice) return ''
  const choice = CHOICES[state.pendingChoice]
  return `
    <section class="confirmation" aria-label="Confirm profile choice">
      <p class="eyebrow">Confirm before anything changes</p>
      <h3>${choice.label}</h3>
      <p class="lead">${choice.consequence}</p>
      <ul>
        <li>No profile changes until recovery protection is verified.</li>
        <li>Your accountless original is not deleted or reassigned.</li>
        <li>You can recover the pre-change signed-in version if needed.</li>
      </ul>
      <div class="confirmation-actions">
        <button class="primary" type="button" data-confirm-choice>Confirm ${choice.label.toLowerCase()}</button>
        <button class="quiet" type="button" data-cancel-choice>Go back</button>
      </div>
    </section>
  `
}

function choiceCompleted() {
  return `
    <section class="confirmation">
      <p class="eyebrow">Ready</p>
      <h3>Your signed-in profile is open</h3>
      <p class="lead">The protected change finished. Local saving is active again and cloud sync is up to date.</p>
      ${safetyBanner()}
      <button class="primary" type="button" data-reset-scenario>Review the choice again</button>
    </section>
  `
}

function checkingContent() {
  return {
    eyebrow: 'Profile ownership',
    title: 'Preparing your study space…',
    body: 'Edenia is verifying which learner profile belongs to this session. No learner profile is visible or saving yet.'
  }
}

function offlineContent() {
  return {
    eyebrow: 'Connection needed',
    title: 'We can’t check cloud progress yet',
    body: 'This is a first link, so Edenia cannot safely choose a signed-in profile while ownership and cloud progress are unknown.'
  }
}

function attentionContent() {
  return {
    eyebrow: 'Needs attention',
    title: 'Sync stopped before making a change',
    body: 'This profile is 2.3 MiB, above the internal-canary 2 MiB portable-profile limit. Local study can continue, but Edenia will not truncate or partially upload it.'
  }
}

function renderVariantA() {
  if (state.scenario === 'signed-out') return renderEmptyAccountless('A')

  let content = ''
  if (state.scenario === 'checking') {
    const copy = checkingContent()
    content = `<section class="a-content a-centered"><div class="spinner" aria-hidden="true"></div><p class="eyebrow">${copy.eyebrow}</p><h2>${copy.title}</h2><p class="lead">${copy.body}</p><div class="loading-lines" aria-hidden="true"><span></span><span></span></div><p class="fine-print">If the check cannot finish, Edenia will offer retry or sign-out—not guess.</p></section>`
  } else if (state.scenario === 'first-link') {
    content = `<section class="a-content"><div class="a-title"><p class="eyebrow">First link · both have progress</p><h2>Choose what this signed-in profile should use</h2><p class="lead">Signing in did not move anything. Compare the two sources, then choose a protected action.</p></div><div class="a-comparison">${profileSummary('device')}${profileSummary('cloud')}</div>${safetyBanner()}${state.pendingChoice === 'complete' ? choiceCompleted() : confirmation() || `<div class="a-choice-grid">${directChoiceButtons()}</div>`}</section>`
  } else if (state.scenario === 'cloud-empty') {
    content = state.pendingChoice === 'complete'
      ? `<section class="a-content">${choiceCompleted()}</section>`
      : `<section class="a-content"><div class="a-title"><p class="eyebrow">First link · cloud is meaningfully empty</p><h2>Use this device’s progress with your account?</h2><p class="lead">There is no cloud study progress to compare, so the three-way choice is skipped. Linking still requires one deliberate confirmation.</p></div>${profileSummary('device')}${safetyBanner()}<div class="a-actions"><button class="primary" type="button" data-single-link>Use this device’s progress</button><button class="quiet" type="button" data-scenario-jump="signed-out">Sign out and study accountlessly</button></div></section>`
  } else if (state.scenario === 'offline-link') {
    const copy = offlineContent()
    content = `<section class="a-content a-centered"><p class="eyebrow">${copy.eyebrow}</p><h2>${copy.title}</h2><p class="lead">${copy.body}</p>${safetyBanner('danger')}<div class="a-actions"><button class="primary" type="button" data-scenario-jump="checking">Try again</button><button class="quiet" type="button" data-scenario-jump="signed-out">Sign out and study accountlessly</button></div></section>`
  } else if (state.scenario === 'ongoing') {
    content = renderAStatus()
  } else if (state.scenario === 'attention') {
    const copy = attentionContent()
    content = `<section class="a-content"><div class="a-title"><p class="eyebrow">${copy.eyebrow}</p><h2>${copy.title}</h2><p class="lead">${copy.body}</p></div>${safetyBanner('danger')}<div class="profile-summary"><h3>What you can do</h3><p class="lead">Export a recovery copy, keep studying locally, or retry after the profile is within the supported limit. The last good cloud version stays untouched.</p><div class="a-actions"><button class="secondary" type="button">Export recovery copy</button><button class="quiet" type="button" data-scenario-jump="ongoing">Keep studying locally</button></div></div></section>`
  }

  return `<section class="variant-a"><header class="a-header"><p class="wordmark">EDENIA</p><ol class="step-list"><li class="active"><span>1</span>Check</li><li class="${state.scenario !== 'checking' ? 'active' : ''}"><span>2</span>Choose</li><li><span>3</span>Open</li></ol></header>${content}</section>`
}

function renderAStatus() {
  const statuses = {
    'up-to-date': ['Up to date', 'Everything saved here is also in cloud progress.', ''],
    'saved-local': ['Saved on this device', 'Local saving finished. Cloud sync will start next.', 'syncing'],
    syncing: ['Syncing…', 'Local study remains available while Edenia uploads safely.', 'syncing'],
    offline: ['Offline · saved on this device', 'Keep studying. Edenia will retry for this profile when the connection returns.', 'offline']
  }
  const [label, description, dotClass] = statuses[state.ongoingStatus]
  return `<section class="a-content"><div class="a-title"><p class="eyebrow">Ongoing status · dedicated page direction</p><h2>Progress sync</h2><p class="lead">The compact header status opens this focused detail page only when the learner asks.</p></div><div class="profile-summary"><header><div><h3>${label}</h3><p class="fine-print">Signed in as brice@example.com</p></div><span class="status-dot ${dotClass}" aria-hidden="true"></span></header><p class="lead">${description}</p><div class="a-actions"><button class="secondary" type="button" data-cycle-status>Simulate next status</button><button class="quiet" type="button" data-scenario-jump="attention">Show Needs attention</button></div></div>${state.ongoingStatus === 'offline' ? safetyBanner('warning') : safetyBanner()}</section>`
}

function renderVariantB() {
  if (state.scenario === 'signed-out') return `<section class="variant-b"><header class="b-shell-header"><p class="wordmark">EDENIA</p></header>${renderEmptyAccountlessBody()}</section>`

  let modal = ''
  if (state.scenario === 'checking') {
    const copy = checkingContent()
    modal = `<div class="spinner" aria-hidden="true"></div><p class="eyebrow">${copy.eyebrow}</p><h2>${copy.title}</h2><p class="lead">${copy.body}</p><p class="fine-print">The shell is identity-neutral: brand, gradient, and motion only.</p>`
  } else if (state.scenario === 'first-link') {
    modal = `<p class="eyebrow">First link · both have progress</p><h2>Which progress should open?</h2><p class="lead">Signing in did not move anything. Choose an action, then confirm its exact result.</p><div class="profile-comparison-compact">${profileSummary('device', true)}${profileSummary('cloud', true)}</div>${safetyBanner()}${state.pendingChoice === 'complete' ? choiceCompleted() : confirmation() || `<div class="choice-list">${directChoiceButtons()}</div>`}`
  } else if (state.scenario === 'cloud-empty') {
    modal = state.pendingChoice === 'complete'
      ? choiceCompleted()
      : `<p class="eyebrow">First link · cloud is empty</p><h2>Bring this device’s progress with you</h2><p class="lead">No cloud study progress exists, so Edenia offers one deliberate link action instead of three confusing choices.</p>${profileSummary('device', true)}${safetyBanner()}<button class="primary" type="button" data-single-link>Use this device’s progress</button><button class="text-action" type="button" data-scenario-jump="signed-out">Sign out and study accountlessly</button>`
  } else if (state.scenario === 'offline-link') {
    const copy = offlineContent()
    modal = `<p class="eyebrow">${copy.eyebrow}</p><h2>${copy.title}</h2><p class="lead">${copy.body}</p>${safetyBanner('danger')}<button class="primary" type="button" data-scenario-jump="checking">Try again</button><button class="quiet" type="button" data-scenario-jump="signed-out">Sign out and study accountlessly</button>`
  } else if (state.scenario === 'attention') {
    const copy = attentionContent()
    modal = `<p class="eyebrow">${copy.eyebrow}</p><h2>${copy.title}</h2><p class="lead">${copy.body}</p>${safetyBanner('danger')}<button class="secondary" type="button">Export recovery copy</button><button class="text-action" type="button" data-scenario-jump="ongoing">Keep studying locally</button>`
  }

  const status = state.ongoingStatus === 'offline'
    ? { label: 'Offline · saved here', dot: 'offline', body: 'Cloud sync will retry when this profile is online again.' }
    : { label: 'Up to date', dot: '', body: 'Everything saved on this device is also in cloud progress.' }

  if (state.scenario === 'ongoing') {
    return `<section class="variant-b"><header class="b-shell-header"><p class="wordmark">EDENIA</p><span class="shell-note">Active profile resolved · local saving enabled</span><button class="sync-chip" type="button" data-toggle-sync-detail><span class="status-dot ${status.dot}"></span>${status.label}</button>${state.syncDetailOpen ? `<aside class="b-popover"><h3>${status.label}</h3><p class="fine-print">${status.body}</p><p class="fine-print">Signed in as brice@example.com</p><button class="secondary" type="button" data-cycle-status>Simulate ${state.ongoingStatus === 'offline' ? 'online' : 'offline'}</button><button class="text-action" type="button" data-scenario-jump="attention">Show Needs attention</button></aside>` : ''}</header><div class="b-shell-body neutral-canvas"></div></section>`
  }

  return `<section class="variant-b"><header class="b-shell-header"><p class="wordmark">EDENIA</p><span class="shell-note">Learner profile hidden · autosave paused</span></header><div class="b-shell-body neutral-canvas"></div><div class="b-modal-wrap"><section class="b-modal">${modal}</section></div></section>`
}

function renderVariantC() {
  if (state.scenario === 'signed-out') return `<section class="variant-c"><div class="c-context neutral-canvas"><div class="c-context-copy"><p class="wordmark">EDENIA</p><h2>Ownership resolved</h2><p class="lead">The accountless profile is now active.</p></div></div>${renderEmptyAccountlessBody()}</section>`

  const context = `<div class="c-context neutral-canvas"><div class="c-context-copy"><p class="wordmark">EDENIA</p><h2>Your progress stays private to its profile.</h2><p class="lead">This neutral context carries no learner data and never autosaves.</p></div></div>`
  let panel = ''

  if (state.scenario === 'checking') {
    const copy = checkingContent()
    panel = `<div class="spinner" aria-hidden="true"></div><p class="eyebrow">${copy.eyebrow}</p><h2>${copy.title}</h2><p class="lead">${copy.body}</p><div class="loading-lines" aria-hidden="true"><span></span><span></span></div><p class="fine-print">If the check cannot finish, Edenia will offer retry or sign-out—not guess.</p>`
  } else if (state.scenario === 'first-link') {
    panel = `<p class="eyebrow">First link · both have progress</p><h2>Choose the signed-in starting point</h2><p class="lead">Review the two sources, select one outcome, then confirm on a separate step.</p><div class="profile-comparison-stack">${profileSummary('device', true)}${profileSummary('cloud', true)}</div>${safetyBanner()}${state.pendingChoice === 'complete' ? choiceCompleted() : confirmation() || `<div class="choice-list">${radioChoices()}<button class="primary" type="button" data-radio-continue>Review this choice</button></div>`}`
  } else if (state.scenario === 'cloud-empty') {
    panel = state.pendingChoice === 'complete'
      ? choiceCompleted()
      : `<p class="eyebrow">First link · cloud is empty</p><h2>Use this device’s progress?</h2><p class="lead">The empty case skips source comparison, but never the learner’s deliberate link action.</p>${profileSummary('device', true)}${safetyBanner()}<button class="primary" type="button" data-single-link>Use this device’s progress</button><button class="text-action" type="button" data-scenario-jump="signed-out">Sign out and study accountlessly</button>`
  } else if (state.scenario === 'offline-link') {
    const copy = offlineContent()
    panel = `<p class="eyebrow">${copy.eyebrow}</p><h2>${copy.title}</h2><p class="lead">${copy.body}</p>${safetyBanner('danger')}<button class="primary" type="button" data-scenario-jump="checking">Try again</button><button class="quiet" type="button" data-scenario-jump="signed-out">Sign out and study accountlessly</button>`
  } else if (state.scenario === 'ongoing') {
    const offline = state.ongoingStatus === 'offline'
    panel = `<p class="eyebrow">Ongoing status · Account only</p><h2>Settings</h2><section class="c-account-card"><header><div><h3>Account</h3><p class="fine-print">brice@example.com</p></div><button class="text-action" type="button">Sign out</button></header><div class="c-status-row"><span class="status-dot ${offline ? 'offline' : ''}" aria-hidden="true"></span><p><strong>${offline ? 'Offline · saved on this device' : 'Progress is up to date'}</strong><small>${offline ? 'Cloud sync will retry when the connection returns.' : 'Everything saved here is also in cloud progress.'}</small></p><button class="text-action" type="button" data-cycle-status>${offline ? 'Retry' : 'Details'}</button></div><button class="quiet" type="button" data-scenario-jump="attention">Simulate Needs attention</button></section><p class="fine-print">This direction uses a brief toast after saves, but no permanent status in the global header.</p>`
  } else if (state.scenario === 'attention') {
    const copy = attentionContent()
    panel = `<p class="eyebrow">${copy.eyebrow}</p><h2>${copy.title}</h2><p class="lead">${copy.body}</p>${safetyBanner('danger')}<button class="secondary" type="button">Export recovery copy</button><button class="text-action" type="button" data-scenario-jump="ongoing">Keep studying locally</button>`
  }

  return `<section class="variant-c">${context}<section class="c-panel">${panel}</section></section>`
}

function renderEmptyAccountless(variant) {
  return `<section class="${variant === 'A' ? 'variant-a' : 'variant-b'}"><header class="${variant === 'A' ? 'a-header' : 'b-shell-header'}"><p class="wordmark">EDENIA</p><span class="fine-print">Signed out · accountless profile active</span></header>${renderEmptyAccountlessBody()}</section>`
}

function renderEmptyAccountlessBody() {
  return `<section class="empty-app"><div class="empty-app-header"><p class="eyebrow">Main page · after ownership resolution</p><strong>Town level 1</strong></div><div class="empty-badges"><span>No language selected</span><span>No channels</span><span>Accountless</span></div><div class="empty-app-town"><span aria-label="Level 1 town: one house"></span></div><aside class="walkthrough-card"><p class="eyebrow">Walkthrough · 1 of 4</p><h3>Welcome to your study town</h3><p>Add a language and channels when you’re ready. The trailer and personalized onboarding do not replay.</p><button class="primary" type="button">Start walkthrough</button></aside></section>`
}

function render() {
  document.body.dataset.variant = state.variant
  document.querySelectorAll('[data-scenario]').forEach((button) => {
    button.setAttribute('aria-pressed', String(button.dataset.scenario === state.scenario))
  })
  const variant = VARIANTS.find(({ key }) => key === state.variant)
  variantLabel.textContent = `${variant.key} — ${variant.name}`
  stage.innerHTML = state.variant === 'A' ? renderVariantA() : state.variant === 'B' ? renderVariantB() : renderVariantC()
}

document.addEventListener('click', (event) => {
  const scenarioButton = event.target.closest('[data-scenario]')
  if (scenarioButton) return setScenario(scenarioButton.dataset.scenario)

  if (event.target.closest('[data-variant-previous]')) return cycleVariant(-1)
  if (event.target.closest('[data-variant-next]')) return cycleVariant(1)

  const choiceButton = event.target.closest('[data-choice]')
  if (choiceButton) {
    state.pendingChoice = choiceButton.dataset.choice
    return render()
  }

  if (event.target.closest('[data-radio-continue]')) {
    const selected = document.querySelector('input[name="profile-choice"]:checked')
    state.pendingChoice = selected?.value || 'combine'
    return render()
  }

  if (event.target.closest('[data-confirm-choice]') || event.target.closest('[data-single-link]')) {
    state.pendingChoice = 'complete'
    return render()
  }

  if (event.target.closest('[data-cancel-choice]') || event.target.closest('[data-reset-scenario]')) {
    state.pendingChoice = null
    return render()
  }

  const jump = event.target.closest('[data-scenario-jump]')
  if (jump) return setScenario(jump.dataset.scenarioJump)

  if (event.target.closest('[data-toggle-sync-detail]')) {
    state.syncDetailOpen = !state.syncDetailOpen
    return render()
  }

  if (event.target.closest('[data-cycle-status]')) {
    if (state.variant === 'A') {
      const order = ['up-to-date', 'saved-local', 'syncing', 'offline']
      state.ongoingStatus = order[(order.indexOf(state.ongoingStatus) + 1) % order.length]
    } else {
      state.ongoingStatus = state.ongoingStatus === 'offline' ? 'up-to-date' : 'offline'
      state.syncDetailOpen = true
    }
    return render()
  }
})

document.addEventListener('keydown', (event) => {
  const target = event.target
  if (target instanceof HTMLElement && (target.matches('input, textarea, select') || target.isContentEditable)) return
  if (event.key === 'ArrowLeft') cycleVariant(-1)
  if (event.key === 'ArrowRight') cycleVariant(1)
})

window.addEventListener('popstate', () => {
  state.variant = readVariant()
  state.scenario = readScenario()
  state.pendingChoice = null
  state.syncDetailOpen = false
  render()
})

render()
