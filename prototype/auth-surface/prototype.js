const VARIANTS = Object.freeze([
  { key: 'A', name: 'Garden welcome' },
  { key: 'B', name: 'Study passport' },
  { key: 'C', name: 'Friendly guide' }
])

const SURFACES = new Set(['form', 'signup', 'magic', 'confirm'])
const LOCALES = new Set(['en', 'es', 'fr', 'zh-Hans', 'zh-Hant'])
const TURNSTILE_STATES = new Set(['frictionless', 'challenge'])
const ENTRY_POINTS = new Set(['settings', 'onboarding'])

const COPY = Object.freeze({
  en: {
    signIn: 'Sign in to Edenia',
    signInBody: 'Keep your study progress with you, while this browser stays ready for accountless study.',
    emailLabel: 'Email address',
    emailPlaceholder: 'you@example.com',
    sendLink: 'Email me a sign-in link',
    emailHint: 'No password. The one-time link expires automatically.',
    challenge: 'Please complete the security check',
    challengeBody: 'Cloudflare is checking this request.',
    signupTitle: 'Confirm your Edenia email',
    signupBody: 'One small step, then your signed-in profile is ready for account-backed services.',
    signupAction: 'Confirm my email',
    magicTitle: 'Your Edenia sign-in link',
    magicBody: 'Open the secure confirmation page, then continue to Edenia on that browser.',
    magicAction: 'Open Edenia sign-in',
    expiry: 'If you did not request this, you can safely ignore it. This one-time link expires automatically.',
    confirmTitle: 'Confirm your Edenia sign-in',
    confirmBody: 'The link is ready. Continue to finish signing in on this browser.',
    confirmAction: 'Continue to Edenia',
    secure: 'Secure one-time link',
    stepRequest: 'Request',
    stepEmail: 'Email',
    stepConfirm: 'Confirm',
    duckLine: 'Your study space is waiting.',
    settings: 'Settings',
    account: 'Account',
    settingsSignedOutBody: 'Use Google for the quickest sign-in, or get a secure link by email.',
    language: 'Language',
    google: 'Continue with Google',
    emailFallback: 'Or use email',
    closeSettings: 'Close settings',
    onboardingProgress: 'Step 5 of 5',
    onboardingPromise: 'Turn YouTube and Anki into visible language-learning progress.',
    onboardingTitle: 'One last step',
    onboardingBody: 'Sign up for a more personalized Edenia experience. It’s free!',
    onboardingBack: 'Back',
    onboardingSkip: 'Skip for now',
    inbox: 'Inbox',
    toMe: 'to me',
    today: 'Today',
    stepSignedIn: 'Signed in'
  },
  es: {
    signIn: 'Inicia sesión en Edenia',
    signInBody: 'Lleva contigo tu progreso de estudio, mientras este navegador sigue listo para estudiar sin cuenta.',
    emailLabel: 'Correo electrónico',
    emailPlaceholder: 'tu@ejemplo.com',
    sendLink: 'Enviarme un enlace de acceso',
    emailHint: 'Sin contraseña. El enlace de un solo uso caduca automáticamente.',
    challenge: 'Completa la verificación de seguridad',
    challengeBody: 'Cloudflare está comprobando esta solicitud.',
    signupTitle: 'Confirma tu correo de Edenia',
    signupBody: 'Un pequeño paso y tu perfil con sesión iniciada estará listo para los servicios de cuenta.',
    signupAction: 'Confirmar mi correo',
    magicTitle: 'Tu enlace de acceso a Edenia',
    magicBody: 'Abre la página segura de confirmación y continúa a Edenia en ese navegador.',
    magicAction: 'Abrir acceso a Edenia',
    expiry: 'Si no solicitaste este mensaje, puedes ignorarlo. Este enlace de un solo uso caduca automáticamente.',
    confirmTitle: 'Confirma tu acceso a Edenia',
    confirmBody: 'El enlace está listo. Continúa para terminar de iniciar sesión en este navegador.',
    confirmAction: 'Continuar a Edenia',
    secure: 'Enlace seguro de un solo uso',
    stepRequest: 'Solicitud',
    stepEmail: 'Correo',
    stepConfirm: 'Confirmar',
    duckLine: 'Tu espacio de estudio te espera.',
    settings: 'Ajustes',
    account: 'Cuenta',
    settingsSignedOutBody: 'Usa Google para iniciar sesión rápidamente o recibe un enlace seguro por correo.',
    language: 'Idioma',
    google: 'Continuar con Google',
    emailFallback: 'O usa el correo',
    closeSettings: 'Cerrar ajustes',
    onboardingProgress: 'Paso 5 de 5',
    onboardingPromise: 'Convierte YouTube y Anki en un progreso visible en el aprendizaje de idiomas.',
    onboardingTitle: 'Un último paso',
    onboardingBody: 'Regístrate para disfrutar de una experiencia de Edenia más personalizada. ¡Es gratis!',
    onboardingBack: 'Atrás',
    onboardingSkip: 'Omitir por ahora',
    inbox: 'Recibidos',
    toMe: 'para mí',
    today: 'Hoy',
    stepSignedIn: 'Sesión iniciada'
  },
  fr: {
    signIn: 'Connectez-vous à Edenia',
    signInBody: 'Emportez votre progression, tout en gardant ce navigateur prêt pour étudier sans compte.',
    emailLabel: 'Adresse e-mail',
    emailPlaceholder: 'vous@exemple.com',
    sendLink: 'M’envoyer un lien de connexion',
    emailHint: 'Aucun mot de passe. Le lien à usage unique expire automatiquement.',
    challenge: 'Effectuez la vérification de sécurité',
    challengeBody: 'Cloudflare vérifie cette demande.',
    signupTitle: 'Confirmez votre e-mail Edenia',
    signupBody: 'Une petite étape, puis votre profil connecté sera prêt pour les services de compte.',
    signupAction: 'Confirmer mon e-mail',
    magicTitle: 'Votre lien de connexion Edenia',
    magicBody: 'Ouvrez la page de confirmation sécurisée, puis continuez vers Edenia dans ce navigateur.',
    magicAction: 'Ouvrir la connexion Edenia',
    expiry: 'Si vous n’avez rien demandé, ignorez ce message. Ce lien à usage unique expire automatiquement.',
    confirmTitle: 'Confirmez votre connexion à Edenia',
    confirmBody: 'Le lien est prêt. Continuez pour terminer la connexion dans ce navigateur.',
    confirmAction: 'Continuer vers Edenia',
    secure: 'Lien sécurisé à usage unique',
    stepRequest: 'Demande',
    stepEmail: 'E-mail',
    stepConfirm: 'Confirmer',
    duckLine: 'Votre espace d’étude vous attend.',
    settings: 'Réglages',
    account: 'Compte',
    settingsSignedOutBody: 'Utilisez Google pour vous connecter rapidement ou recevez un lien sécurisé par e-mail.',
    language: 'Langue',
    google: 'Continuer avec Google',
    emailFallback: 'Ou utilisez votre e-mail',
    closeSettings: 'Fermer les réglages',
    onboardingProgress: 'Étape 5 sur 5',
    onboardingPromise: 'Transformez Youtube et Anki en progrès visibles.',
    onboardingTitle: 'Une dernière étape',
    onboardingBody: 'Inscrivez-vous pour profiter d’une expérience Edenia plus personnalisée. C’est gratuit !',
    onboardingBack: 'Retour',
    onboardingSkip: 'Ignorer pour le moment',
    inbox: 'Boîte de réception',
    toMe: 'à moi',
    today: 'Aujourd’hui',
    stepSignedIn: 'Connecté'
  },
  'zh-Hans': {
    signIn: '登录 Edenia',
    signInBody: '随身同步学习进度，同时这个浏览器仍可随时免账号学习。',
    emailLabel: '电子邮箱',
    emailPlaceholder: 'you@example.com',
    sendLink: '向我发送登录链接',
    emailHint: '无需密码。一次性链接会自动过期。',
    challenge: '请完成安全验证',
    challengeBody: 'Cloudflare 正在检查此请求。',
    signupTitle: '确认你的 Edenia 邮箱',
    signupBody: '只差一步，你的已登录学习档案就能使用账号服务。',
    signupAction: '确认我的邮箱',
    magicTitle: '你的 Edenia 登录链接',
    magicBody: '打开安全确认页面，然后在该浏览器中继续前往 Edenia。',
    magicAction: '打开 Edenia 登录页面',
    expiry: '如果你没有发出此请求，可以放心忽略。此一次性链接会自动过期。',
    confirmTitle: '确认登录 Edenia',
    confirmBody: '链接已就绪。继续即可在此浏览器中完成登录。',
    confirmAction: '继续前往 Edenia',
    secure: '安全的一次性链接',
    stepRequest: '申请',
    stepEmail: '邮件',
    stepConfirm: '确认',
    duckLine: '你的学习空间正在等你。',
    settings: '设置',
    account: '账户',
    settingsSignedOutBody: '使用 Google 可快速登录，也可以通过电子邮箱获取安全登录链接。',
    language: '语言',
    google: '使用 Google 继续',
    emailFallback: '或使用电子邮箱',
    closeSettings: '关闭设置',
    onboardingProgress: '第 5 步，共 5 步',
    onboardingPromise: '把 YouTube 和 Anki 转化为看得见的语言学习进步。',
    onboardingTitle: '最后一步',
    onboardingBody: '注册即可获得更个性化的 Edenia 体验。完全免费！',
    onboardingBack: '返回',
    onboardingSkip: '暂时跳过',
    inbox: '收件箱',
    toMe: '发给我',
    today: '今天',
    stepSignedIn: '已登录'
  },
  'zh-Hant': {
    signIn: '登入 Edenia',
    signInBody: '隨身同步學習進度，同時這個瀏覽器仍可隨時免帳號學習。',
    emailLabel: '電子郵件',
    emailPlaceholder: 'you@example.com',
    sendLink: '寄送登入連結給我',
    emailHint: '不需密碼。一次性連結會自動到期。',
    challenge: '請完成安全驗證',
    challengeBody: 'Cloudflare 正在檢查此要求。',
    signupTitle: '確認你的 Edenia 電子郵件',
    signupBody: '只差一步，你的已登入學習檔案就能使用帳號服務。',
    signupAction: '確認我的電子郵件',
    magicTitle: '你的 Edenia 登入連結',
    magicBody: '開啟安全確認頁面，然後在該瀏覽器中繼續前往 Edenia。',
    magicAction: '開啟 Edenia 登入頁面',
    expiry: '如果你沒有提出此要求，可以放心忽略。此一次性連結會自動到期。',
    confirmTitle: '確認登入 Edenia',
    confirmBody: '連結已就緒。繼續即可在此瀏覽器中完成登入。',
    confirmAction: '繼續前往 Edenia',
    secure: '安全的一次性連結',
    stepRequest: '要求',
    stepEmail: '郵件',
    stepConfirm: '確認',
    duckLine: '你的學習空間正在等你。',
    settings: '設定',
    account: '帳戶',
    settingsSignedOutBody: '使用 Google 可快速登入，也可以透過電子郵件取得安全登入連結。',
    language: '語言',
    google: '使用 Google 繼續',
    emailFallback: '或使用電子郵件',
    closeSettings: '關閉設定',
    onboardingProgress: '第 5 步，共 5 步',
    onboardingPromise: '把 YouTube 和 Anki 轉化為看得見的語言學習進步。',
    onboardingTitle: '最後一步',
    onboardingBody: '註冊即可獲得更個人化的 Edenia 體驗。完全免費！',
    onboardingBack: '返回',
    onboardingSkip: '暫時略過',
    inbox: '收件匣',
    toMe: '寄給我',
    today: '今天',
    stepSignedIn: '已登入'
  }
})

const stage = document.querySelector('[data-prototype-stage]')
const variantLabel = document.querySelector('[data-variant-label]')
const localeControl = document.querySelector('[data-locale-control]')
const turnstileControl = document.querySelector('[data-turnstile-control]')
const entryControl = document.querySelector('[data-entry-control]')

function readState() {
  const params = new URLSearchParams(window.location.search)
  const rawVariant = String(params.get('variant') || 'A').toUpperCase()
  const rawSurface = params.get('surface') || 'form'
  const rawLocale = params.get('locale') || 'en'
  const rawTurnstile = params.get('turnstile') || 'frictionless'
  const rawEntry = params.get('entry') || 'settings'
  return {
    variant: VARIANTS.some(item => item.key === rawVariant) ? rawVariant : 'A',
    surface: SURFACES.has(rawSurface) ? rawSurface : 'form',
    locale: LOCALES.has(rawLocale) ? rawLocale : 'en',
    turnstile: TURNSTILE_STATES.has(rawTurnstile) ? rawTurnstile : 'frictionless',
    entry: ENTRY_POINTS.has(rawEntry) ? rawEntry : 'settings'
  }
}

let state = readState()
let disposeConfirmationPhysics = null

function duck({ className = '', decorative = false } = {}) {
  const alt = decorative ? '' : 'Edenia duck'
  const hidden = decorative ? ' aria-hidden="true"' : ''
  return `<img class="edenia-duck ${className}" src="../../Edenia_favicon_round.png" alt="${alt}"${hidden}>`
}

function securityChallenge(copy) {
  if (state.turnstile === 'frictionless') {
    return '<span class="sr-only" role="status">Security check complete.</span>'
  }
  return `
    <section class="turnstile-challenge" aria-label="${copy.challenge}">
      <span class="turnstile-check" aria-hidden="true"></span>
      <span><strong>${copy.challenge}</strong><small>${copy.challengeBody}</small></span>
      <span class="turnstile-cloud">CLOUDFLARE<br><small>Privacy · Help</small></span>
    </section>
  `
}

function emailForm(copy) {
  return `
    <form class="auth-form" onsubmit="return false">
      <label>${copy.emailLabel}<input type="email" inputmode="email" autocomplete="email" placeholder="${copy.emailPlaceholder}"></label>
      ${securityChallenge(copy)}
      <button type="submit">${copy.sendLink}</button>
      <p class="form-hint">${copy.emailHint}</p>
    </form>
  `
}

function emailContent(copy, kind) {
  const signup = kind === 'signup'
  return {
    title: signup ? copy.signupTitle : copy.magicTitle,
    body: signup ? copy.signupBody : copy.magicBody,
    action: signup ? copy.signupAction : copy.magicAction
  }
}

function steps(copy, active = 0) {
  const labels = [copy.stepRequest, copy.stepEmail, copy.stepConfirm]
  return `<ol class="journey-steps">${labels.map((label, index) => `
    <li class="${index <= active ? 'active' : ''}"><span>${index + 1}</span>${label}</li>
  `).join('')}</ol>`
}

function authJourney(copy, activeStep, branch = '') {
  const labels = [copy.account, copy.inbox, copy.stepConfirm, copy.stepSignedIn]
  const notes = [
    state.entry === 'onboarding' ? copy.onboardingTitle : `${copy.settings} → ${copy.account}`,
    branch || copy.stepEmail,
    'edenia.study/auth/confirm/',
    'Edenia'
  ]
  return `
    <ol class="auth-journey-overview" aria-label="Authentication journey">
      ${labels.map((label, index) => `
        <li class="${index === activeStep ? 'current' : ''} ${index < activeStep ? 'complete' : ''}">
          <span class="journey-number">${index + 1}</span>
          <span><strong>${label}</strong><small>${notes[index]}</small></span>
        </li>
      `).join('')}
    </ol>
  `
}

function productionEmailForm(copy) {
  return `
    <form class="auth-form production-email-form" onsubmit="return false">
      <label>${copy.emailLabel}<input type="email" inputmode="email" autocomplete="email" placeholder="${copy.emailPlaceholder}"></label>
      ${securityChallenge(copy)}
      <button type="submit">${copy.sendLink}</button>
    </form>
  `
}

function productionProviderControls(copy) {
  return `
    <section class="production-account-auth">
      <button class="google-context-button" type="button"><span aria-hidden="true">G</span>${copy.google}</button>
      <div class="account-context-divider"><span>${copy.emailFallback}</span></div>
      ${productionEmailForm(copy)}
    </section>
  `
}

function settingsAccountContext(copy) {
  const localeName = {
    en: 'English',
    es: 'Español',
    fr: 'Français',
    'zh-Hans': '简体中文',
    'zh-Hant': '繁體中文'
  }[state.locale]
  return `
    <section class="edenia-app-window" aria-label="Edenia Settings context">
      <header class="app-context-header">
        <span class="wordmark">EDENIA</span>
        <span class="app-context-streak">🔥 12</span>
        <span class="app-context-avatar">B</span>
      </header>
      <div class="app-context-workspace">
        <div class="app-context-dashboard" aria-hidden="true">
          <span class="dashboard-title">Your study city</span>
          <div class="dashboard-city"><span></span><span></span><span></span><span></span></div>
          <div class="dashboard-cards"><span></span><span></span><span></span></div>
        </div>
        <div class="settings-context-overlay" aria-hidden="true"></div>
        <aside class="settings-context-drawer">
          <header><span>${copy.settings}</span><button type="button" aria-label="${copy.closeSettings}">×</button></header>
          <section class="settings-context-language">
            <label>${copy.language}</label>
            <button type="button">${localeName}<span aria-hidden="true">⌄</span></button>
          </section>
          <section class="settings-context-account">
            <header><strong>${copy.account}</strong><span aria-hidden="true">⌃</span></header>
            <div class="settings-production-account">
              <div class="settings-production-intro">
                <h2>${copy.signIn}</h2>
                <p>${copy.settingsSignedOutBody}</p>
              </div>
              ${productionProviderControls(copy)}
            </div>
          </section>
          <div class="settings-context-row"><span>Short videos</span><span aria-hidden="true">●</span></div>
          <div class="settings-context-row"><span>How to</span><span aria-hidden="true">⌄</span></div>
        </aside>
      </div>
    </section>
  `
}

function onboardingAccountContext(copy) {
  return `
    <section class="onboarding-context-window" aria-label="Optional Edenia onboarding context">
      <span class="onboarding-cloud cloud-one" aria-hidden="true"></span>
      <span class="onboarding-cloud cloud-two" aria-hidden="true"></span>
      <section class="onboarding-context-card">
        <header><span class="wordmark">EDENIA</span><button type="button">${state.locale === 'en' ? 'English' : state.locale}</button></header>
        <p class="onboarding-context-promise">${copy.onboardingPromise}</p>
        <div class="onboarding-context-progress"><span>${copy.onboardingProgress}</span><i><b></b></i></div>
        <div class="onboarding-production-heading">
          <h2>${copy.onboardingTitle}</h2>
          <p>${copy.onboardingBody}</p>
        </div>
        <div class="onboarding-production-auth">${productionProviderControls(copy)}</div>
        <div class="onboarding-production-actions">
          <button type="button">${copy.onboardingBack}</button>
          <button class="onboarding-context-skip" type="button">${copy.onboardingSkip}</button>
        </div>
      </section>
    </section>
  `
}

function emailClientContext(copy, kind) {
  const email = emailContent(copy, kind)
  return `
    <section class="mail-client-window" aria-label="Email inbox context">
      <header class="mail-client-topbar"><span class="mail-logo">M</span><span>Mail</span><label><span aria-hidden="true">⌕</span><input aria-label="Search mail" placeholder="Search mail"></label><span class="mail-avatar">B</span></header>
      <div class="mail-client-body">
        <aside class="mail-sidebar"><strong>＋</strong><span class="active">▣ ${copy.inbox}</span><span>☆ Starred</span><span>◷ Snoozed</span><span>➤ Sent</span></aside>
        <article class="mail-message">
          <header class="mail-message-header">
            <a href="#" aria-label="Back to inbox">←</a>
            <div><h2>${email.title}</h2><p><strong>Edenia</strong> &lt;hello@edenia.study&gt; · ${copy.today}<br><small>${copy.toMe}</small></p></div>
            <span>☆</span>
          </header>
          <section class="email-preview garden-email">
            <div class="email-brand-band">${duck({ decorative: true })}<span>EDENIA</span></div>
            <div class="email-body">
              <span class="security-pill">✓ ${copy.secure}</span>
              <h3>${email.title}</h3>
              <p>${email.body}</p>
              <a href="#" role="button">${email.action}</a>
              <p class="email-fine-print">${copy.expiry}</p>
            </div>
          </section>
        </article>
      </div>
    </section>
  `
}

function confirmationBrowserContext(copy) {
  return `
    <section class="browser-context-window" aria-label="Standalone browser confirmation context">
      <header class="browser-context-chrome">
        <div class="browser-context-tabbar"><span class="browser-dot red"></span><span class="browser-dot amber"></span><span class="browser-dot green"></span><span class="browser-tab">${duck({ decorative: true })} Edenia</span></div>
        <div class="browser-context-toolbar"><span>‹</span><span>›</span><span>↻</span><div>🔒 www.edenia.study/auth/confirm/</div><span>☆</span></div>
      </header>
      <div class="edenia-confirm-page" data-confirmation-physics-root>
        <canvas class="confirmation-physics-canvas" data-confirmation-physics aria-hidden="true"></canvas>
        <section class="garden-card confirm-card">
          ${duck({ className: 'garden-duck', decorative: true })}
          <h2>${copy.confirmTitle}</h2>
          <p class="lead">${copy.confirmBody}</p>
          <button class="primary-action" type="button">${copy.confirmAction}</button>
        </section>
      </div>
    </section>
  `
}

function mountConfirmationPhysics() {
  const root = stage.querySelector('[data-confirmation-physics-root]')
  const canvas = root?.querySelector('[data-confirmation-physics]')
  const context = canvas?.getContext('2d', { alpha: true })
  if (!root || !canvas || !context) return null

  const radius = 130
  const particles = []
  const activeParticles = new Set()
  const pointer = {
    x: -radius,
    y: -radius,
    vx: 0,
    vy: 0,
    lastX: 0,
    lastY: 0,
    lastEventAt: 0,
    hasPosition: false,
    activeUntil: 0
  }
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
  let width = 0
  let height = 0
  let pixelRatio = 1
  let spacing = 20
  let columns = 0
  let rows = 0
  let frame = null
  let lastFrameAt = 0

  function draw() {
    context.setTransform(1, 0, 0, 1, 0, 0)
    context.clearRect(0, 0, canvas.width, canvas.height)
    context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0)
    context.fillStyle = 'rgba(5, 5, 5, 0.095)'
    context.beginPath()
    for (const particle of particles) {
      context.moveTo(particle.x + 1, particle.y)
      context.arc(particle.x, particle.y, 1, 0, Math.PI * 2)
    }
    context.fill()
  }

  function resetParticles() {
    const bounds = root.getBoundingClientRect()
    width = Math.max(1, bounds.width)
    height = Math.max(1, bounds.height)
    pixelRatio = Math.min(window.devicePixelRatio || 1, 1.5)
    spacing = Math.max(18, Math.min(34, Math.sqrt((width * height) / 2600)))
    columns = Math.ceil(width / spacing) + 1
    rows = Math.ceil(height / spacing) + 1
    canvas.width = Math.ceil(width * pixelRatio)
    canvas.height = Math.ceil(height * pixelRatio)
    particles.length = 0
    activeParticles.clear()
    for (let row = 0; row < rows; row += 1) {
      for (let column = 0; column < columns; column += 1) {
        const homeX = (column * spacing) + (spacing * 0.5)
        const homeY = (row * spacing) + (spacing * 0.5)
        particles.push({ homeX, homeY, x: homeX, y: homeY, vx: 0, vy: 0 })
      }
    }
    draw()
  }

  function activateParticlesNearPointer() {
    const minColumn = Math.max(0, Math.floor((pointer.x - radius) / spacing))
    const maxColumn = Math.min(columns - 1, Math.ceil((pointer.x + radius) / spacing))
    const minRow = Math.max(0, Math.floor((pointer.y - radius) / spacing))
    const maxRow = Math.min(rows - 1, Math.ceil((pointer.y + radius) / spacing))
    const radiusSquared = radius * radius
    for (let row = minRow; row <= maxRow; row += 1) {
      for (let column = minColumn; column <= maxColumn; column += 1) {
        const particle = particles[(row * columns) + column]
        if (!particle) continue
        const dx = particle.homeX - pointer.x
        const dy = particle.homeY - pointer.y
        if ((dx * dx) + (dy * dy) <= radiusSquared) activeParticles.add(particle)
      }
    }
  }

  function tick(now) {
    const timeStep = Math.min(2, Math.max(0.5, (now - lastFrameAt) / 16.67 || 1))
    const pointerIsActive = now < pointer.activeUntil
    const radiusSquared = radius * radius
    const damping = Math.pow(0.82, timeStep)
    lastFrameAt = now
    pointer.vx *= Math.pow(0.72, timeStep)
    pointer.vy *= Math.pow(0.72, timeStep)

    for (const particle of activeParticles) {
      if (pointerIsActive) {
        const dx = particle.x - pointer.x
        const dy = particle.y - pointer.y
        const distanceSquared = (dx * dx) + (dy * dy)
        if (distanceSquared < radiusSquared) {
          const distance = Math.max(1, Math.sqrt(distanceSquared))
          const influence = 1 - (distance / radius)
          const push = influence * influence * 1.8 * timeStep
          particle.vx += ((dx / distance) * push) + (pointer.vx * influence * 0.16)
          particle.vy += ((dy / distance) * push) + (pointer.vy * influence * 0.16)
        }
      }
      particle.vx = (particle.vx + ((particle.homeX - particle.x) * 0.055 * timeStep)) * damping
      particle.vy = (particle.vy + ((particle.homeY - particle.y) * 0.055 * timeStep)) * damping
      particle.x += particle.vx * timeStep
      particle.y += particle.vy * timeStep
      const distanceHome = Math.abs(particle.homeX - particle.x) + Math.abs(particle.homeY - particle.y)
      const speed = Math.abs(particle.vx) + Math.abs(particle.vy)
      if (!pointerIsActive && distanceHome < 0.08 && speed < 0.04) {
        particle.x = particle.homeX
        particle.y = particle.homeY
        particle.vx = 0
        particle.vy = 0
        activeParticles.delete(particle)
      }
    }
    draw()
    frame = activeParticles.size ? window.requestAnimationFrame(tick) : null
  }

  function requestTick() {
    if (frame !== null) return
    lastFrameAt = performance.now()
    frame = window.requestAnimationFrame(tick)
  }

  function handlePointerMove(event) {
    const bounds = root.getBoundingClientRect()
    const now = performance.now()
    const x = event.clientX - bounds.left
    const y = event.clientY - bounds.top
    if (pointer.hasPosition) {
      const elapsedFrames = Math.max(0.5, (now - pointer.lastEventAt) / 16.67)
      pointer.vx = Math.max(-18, Math.min(18, (x - pointer.lastX) / elapsedFrames))
      pointer.vy = Math.max(-18, Math.min(18, (y - pointer.lastY) / elapsedFrames))
    }
    pointer.x = x
    pointer.y = y
    pointer.lastX = x
    pointer.lastY = y
    pointer.lastEventAt = now
    pointer.hasPosition = true
    pointer.activeUntil = now + 90
    activateParticlesNearPointer()
    requestTick()
  }

  const resizeObserver = new ResizeObserver(resetParticles)
  resizeObserver.observe(root)
  if (!reducedMotion) root.addEventListener('pointermove', handlePointerMove, { passive: true })
  resetParticles()

  return () => {
    resizeObserver.disconnect()
    root.removeEventListener('pointermove', handlePointerMove)
    if (frame !== null) window.cancelAnimationFrame(frame)
  }
}

function gardenWelcome(copy) {
  if (state.surface === 'form') {
    return `
      <article class="direction direction-a contextual-direction surface-form">
        ${authJourney(copy, 0)}
        ${state.entry === 'onboarding' ? onboardingAccountContext(copy) : settingsAccountContext(copy)}
        <p class="direction-caption"><strong>Step 1 · In Edenia</strong> — ${state.entry === 'onboarding' ? 'the optional final onboarding step' : 'Settings → Account'} keeps its production design; only the invisible Turnstile space collapses.</p>
      </article>
    `
  }

  if (state.surface === 'confirm') {
    return `
      <article class="direction direction-a contextual-direction surface-confirm">
        ${authJourney(copy, 2)}
        ${confirmationBrowserContext(copy)}
        <p class="direction-caption"><strong>Step 3 · Standalone confirmation</strong> — the card sits over Edenia’s gradient and pointer-reactive particle field only; no town or channel surfaces are loaded.</p>
      </article>
    `
  }

  return `
    <article class="direction direction-a contextual-direction email-canvas">
      ${authJourney(copy, 1, state.surface === 'signup' ? copy.signupTitle : copy.magicTitle)}
      ${emailClientContext(copy, state.surface)}
      <p class="direction-caption"><strong>Step 2 · In the inbox</strong> — Supabase sends the new-account or returning-account version; both use the same email-safe Garden welcome system.</p>
    </article>
  `
}

function studyPassport(copy) {
  if (state.surface === 'form') {
    return `
      <article class="direction direction-b surface-form">
        <section class="passport-shell">
          <aside class="passport-aside">
            <p class="wordmark">EDENIA</p>
            ${duck({ className: 'passport-duck', decorative: true })}
            <p>${copy.duckLine}</p>
            ${steps(copy, 0)}
          </aside>
          <section class="passport-content">
            <span class="passport-stamp">01 / SIGN IN</span>
            <h2>${copy.signIn}</h2>
            <p class="lead">${copy.signInBody}</p>
            ${emailForm(copy)}
          </section>
        </section>
        <p class="direction-caption"><strong>B · Study passport</strong> — a split layout makes sign-in feel like a clear, bounded step in a journey.</p>
      </article>
    `
  }

  if (state.surface === 'confirm') {
    return `
      <article class="direction direction-b surface-confirm">
        <section class="passport-shell confirm-passport">
          <aside class="passport-aside">
            <p class="wordmark">EDENIA</p>
            ${duck({ className: 'passport-duck', decorative: true })}
            ${steps(copy, 2)}
          </aside>
          <section class="passport-content">
            <span class="passport-stamp">03 / CONFIRM</span>
            <h2>${copy.confirmTitle}</h2>
            <p class="lead">${copy.confirmBody}</p>
            <button class="primary-action" type="button">${copy.confirmAction}</button>
            <span class="passport-security">✓ ${copy.secure}</span>
          </section>
        </section>
        <p class="direction-caption"><strong>B · Study passport</strong> — the confirmation page visibly completes the three-step journey.</p>
      </article>
    `
  }

  const email = emailContent(copy, state.surface)
  return `
    <article class="direction direction-b email-canvas">
      <section class="email-preview passport-email">
        <div class="passport-email-rail">
          <span>EDENIA</span>
          ${duck({ decorative: true })}
          <b>02</b>
        </div>
        <div class="email-body">
          <span class="passport-stamp">02 / EMAIL</span>
          <h2>${email.title}</h2>
          <p>${email.body}</p>
          <a href="#" role="button">${email.action}</a>
          <p class="email-fine-print">${copy.expiry}</p>
        </div>
      </section>
      <p class="direction-caption"><strong>B · Study passport</strong> — the email uses a durable numbered rail instead of decorative scenery.</p>
    </article>
  `
}

function friendlyGuide(copy) {
  if (state.surface === 'form') {
    return `
      <article class="direction direction-c surface-form">
        <section class="guide-shell">
          <header class="guide-header"><span class="wordmark">EDENIA</span><span class="guide-status">● ${copy.secure}</span></header>
          <div class="guide-conversation">
            ${duck({ className: 'guide-duck', decorative: true })}
            <div class="speech-bubble"><h2>${copy.signIn}</h2><p>${copy.signInBody}</p></div>
          </div>
          <div class="guide-action-panel">${emailForm(copy)}</div>
        </section>
        <p class="direction-caption"><strong>C · Friendly guide</strong> — the duck speaks first, while the task stays in its own compact action panel.</p>
      </article>
    `
  }

  if (state.surface === 'confirm') {
    return `
      <article class="direction direction-c surface-confirm">
        <section class="guide-shell guide-confirm">
          <header class="guide-header"><span class="wordmark">EDENIA</span><span class="guide-status">● ${copy.secure}</span></header>
          <div class="guide-conversation">
            ${duck({ className: 'guide-duck', decorative: true })}
            <div class="speech-bubble"><h2>${copy.confirmTitle}</h2><p>${copy.confirmBody}</p></div>
          </div>
          <div class="guide-action-panel"><button class="primary-action" type="button">${copy.confirmAction}</button></div>
        </section>
        <p class="direction-caption"><strong>C · Friendly guide</strong> — the same dialogue pattern reassures before the security-sensitive click.</p>
      </article>
    `
  }

  const email = emailContent(copy, state.surface)
  return `
    <article class="direction direction-c email-canvas">
      <section class="email-preview guide-email">
        <header><span>EDENIA</span><span>● ${copy.secure}</span></header>
        <div class="guide-email-message">
          ${duck({ decorative: true })}
          <div><h2>${email.title}</h2><p>${email.body}</p></div>
        </div>
        <div class="email-body">
          <a href="#" role="button">${email.action}</a>
          <p class="email-fine-print">${copy.expiry}</p>
        </div>
      </section>
      <p class="direction-caption"><strong>C · Friendly guide</strong> — a conversational header preserves personality with an email-safe stacked body.</p>
    </article>
  `
}

function writeUrl() {
  const url = new URL(window.location.href)
  url.searchParams.set('variant', state.variant)
  url.searchParams.set('surface', state.surface)
  url.searchParams.set('locale', state.locale)
  url.searchParams.set('turnstile', state.turnstile)
  url.searchParams.set('entry', state.entry)
  window.history.replaceState({}, '', url)
}

function render() {
  const copy = COPY[state.locale]
  disposeConfirmationPhysics?.()
  disposeConfirmationPhysics = null
  document.documentElement.lang = state.locale
  document.body.dataset.variant = state.variant
  stage.innerHTML = state.variant === 'A'
    ? gardenWelcome(copy)
    : state.variant === 'B'
      ? studyPassport(copy)
      : friendlyGuide(copy)
  if (state.variant === 'A' && state.surface === 'confirm') {
    disposeConfirmationPhysics = mountConfirmationPhysics()
  }

  document.querySelectorAll('[data-surface]').forEach(button => {
    const selected = button.dataset.surface === state.surface
    button.setAttribute('aria-pressed', String(selected))
  })
  localeControl.value = state.locale
  turnstileControl.querySelector('select').value = state.turnstile
  turnstileControl.hidden = state.surface !== 'form'
  entryControl.querySelector('select').value = state.entry
  entryControl.hidden = state.variant !== 'A' || state.surface !== 'form'
  const variant = VARIANTS.find(item => item.key === state.variant)
  variantLabel.value = `${variant.key} — ${variant.name}`
  writeUrl()
}

function cycleVariant(delta) {
  const index = VARIANTS.findIndex(item => item.key === state.variant)
  state.variant = VARIANTS[(index + delta + VARIANTS.length) % VARIANTS.length].key
  render()
}

document.querySelector('[data-surface-control]').addEventListener('click', event => {
  const button = event.target.closest('[data-surface]')
  if (!button) return
  state.surface = button.dataset.surface
  render()
})

localeControl.addEventListener('change', event => {
  state.locale = event.target.value
  render()
})

turnstileControl.querySelector('select').addEventListener('change', event => {
  state.turnstile = event.target.value
  render()
})

entryControl.querySelector('select').addEventListener('change', event => {
  state.entry = event.target.value
  render()
})

document.querySelector('[data-variant-previous]').addEventListener('click', () => cycleVariant(-1))
document.querySelector('[data-variant-next]').addEventListener('click', () => cycleVariant(1))

window.addEventListener('keydown', event => {
  const tag = event.target.tagName?.toLowerCase()
  if (['input', 'textarea', 'select', 'button'].includes(tag) || event.target.isContentEditable) return
  if (event.key === 'ArrowLeft') cycleVariant(-1)
  if (event.key === 'ArrowRight') cycleVariant(1)
})

render()
