const VARIANTS = Object.freeze([
  { key: 'A', name: 'Focused replacement' },
  { key: 'B', name: 'Guided unlock' },
  { key: 'C', name: 'Reassurance split' }
])

const card = document.querySelector('[data-access-card]')
const variantLabel = document.querySelector('[data-variant-label]')
const stateLabel = document.querySelector('[data-state-label]')

function readVariant() {
  const requested = String(new URLSearchParams(location.search).get('variant') || 'A').toUpperCase()
  return VARIANTS.some(variant => variant.key === requested) ? requested : 'A'
}

let variant = readVariant()
let previewState = 'locked'

function brand() {
  return '<span class="brand" aria-hidden="true">EDENIA</span>'
}

function lockedMarkup() {
  return `
    ${brand()}
    <h1>Your profile is locked</h1>
    <p class="lead">Sign in again so Edenia can verify that this learner profile belongs to you.</p>
    <p class="privacy-status">Learner profile hidden · autosave paused</p>
    <div class="card-actions">
      <button class="btn-primary" type="button" data-open-sign-in>Open sign-in</button>
    </div>
  `
}

function authControls({ includeBack = false } = {}) {
  return `
    <button class="google-placeholder" type="button" data-google><span aria-hidden="true">G</span>Continue with Google</button>
    <div class="divider"><span>Or use email</span></div>
    <form class="auth-form" data-email-form novalidate>
      <label>Email address<input type="email" inputmode="email" autocomplete="email" placeholder="you@example.com" required></label>
      <button class="btn-secondary" type="submit">Email me a code</button>
    </form>
    ${includeBack ? '<button class="btn-ghost back-link" type="button" data-back>← Back to locked message</button>' : ''}
  `
}

function codeControls() {
  return `
    <form class="auth-form" data-code-form novalidate>
      <label>Six-digit code<input type="text" inputmode="numeric" autocomplete="one-time-code" pattern="[0-9]{6}" maxlength="6" placeholder="123456" required></label>
      <button class="btn-primary" type="submit">Verify code</button>
    </form>
    <p class="feedback" role="status">Code sent. Check your email, then enter it here.</p>
    <button class="btn-ghost back-link" type="button" data-back-to-auth>Use a different email</button>
  `
}

function checkingOwner() {
  return `
    <section class="checking-owner" role="status">
      <strong>Checking profile ownership…</strong>
      <p>Keep this page open. Your learner profile remains hidden and autosave stays paused.</p>
    </section>
  `
}

function currentAuthControls(options) {
  if (previewState === 'checking-owner') return checkingOwner()
  if (previewState === 'code') return codeControls()
  return authControls(options)
}

function variantA() {
  return `
    ${brand()}
    <div class="auth-heading">
      <h1>Sign in to unlock your profile</h1>
      <p class="lead">Use the account that owns this learner profile.</p>
    </div>
    ${currentAuthControls({ includeBack: true })}
    <p class="privacy-status">Your learner profile stays hidden until ownership checks succeed.</p>
  `
}

function variantB() {
  return `
    <div class="unlock-header">
      ${brand()}
      <h1>Unlock your learner profile</h1>
      <p class="lead">Sign in with its account to continue.</p>
    </div>
    <div class="unlock-steps" aria-label="Unlock progress">
      <span class="unlock-step complete">1 · Profile protected</span>
      <span class="unlock-step active">2 · Verify account</span>
    </div>
    ${currentAuthControls()}
    <div class="card-actions">
      <button class="btn-ghost" type="button" data-back>Back</button>
      <span class="privacy-status">Profile hidden · autosave paused</span>
    </div>
  `
}

function variantC() {
  return `
    ${brand()}
    <div class="split-auth">
      <section class="split-reassurance">
        <h2>Your progress is protected</h2>
        <p class="lead">Edenia has paused this profile while it verifies its owner.</p>
        <ul>
          <li>No learner details are visible.</li>
          <li>No autosaves run while locked.</li>
          <li>Sign-in alone does not replace progress.</li>
        </ul>
        <button class="btn-ghost back-link" type="button" data-back>← Back</button>
      </section>
      <section class="split-form">
        <h1>Sign in to continue</h1>
        <p class="lead">Use the account that owns this learner profile.</p>
        ${currentAuthControls()}
      </section>
    </div>
  `
}

function render() {
  document.body.dataset.variant = variant
  card.className = `access-card variant-${variant.toLowerCase()}`
  card.innerHTML = previewState === 'locked'
    ? lockedMarkup()
    : ({ A: variantA, B: variantB, C: variantC })[variant]()
  const current = VARIANTS.find(item => item.key === variant)
  variantLabel.textContent = `${current.key} — ${current.name}`
  stateLabel.textContent = `State: ${previewState}`
}

function updateVariant(direction) {
  const current = VARIANTS.findIndex(item => item.key === variant)
  variant = VARIANTS[(current + direction + VARIANTS.length) % VARIANTS.length].key
  const url = new URL(location.href)
  url.searchParams.set('variant', variant)
  history.replaceState(null, '', url)
  render()
}

document.addEventListener('click', event => {
  if (event.target.closest('[data-open-sign-in]')) previewState = 'auth'
  else if (event.target.closest('[data-back]')) previewState = 'locked'
  else if (event.target.closest('[data-back-to-auth]')) previewState = 'auth'
  else if (event.target.closest('[data-reset]')) previewState = 'locked'
  else if (event.target.closest('[data-variant-previous]')) return updateVariant(-1)
  else if (event.target.closest('[data-variant-next]')) return updateVariant(1)
  else if (event.target.closest('[data-google]')) previewState = 'checking-owner'
  else return
  render()
})

document.addEventListener('submit', event => {
  event.preventDefault()
  if (event.target.matches('[data-email-form]')) previewState = 'code'
  if (event.target.matches('[data-code-form]')) previewState = 'checking-owner'
  render()
})

document.addEventListener('keydown', event => {
  if (['INPUT', 'TEXTAREA'].includes(document.activeElement?.tagName) || document.activeElement?.isContentEditable) return
  if (event.key === 'ArrowLeft') updateVariant(-1)
  if (event.key === 'ArrowRight') updateVariant(1)
})

window.addEventListener('popstate', () => {
  variant = readVariant()
  render()
})

render()
