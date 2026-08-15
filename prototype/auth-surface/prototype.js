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
    sendLink: 'Email me a secure link',
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
    language: 'Language',
    google: 'Continue with Google',
    emailFallback: 'Or use email',
    closeSettings: 'Close settings',
    onboardingProgress: 'Step 5 of 5',
    onboardingTitle: 'One last step',
    onboardingBody: 'Sign up for a more personalized Edenia experience. It’s free!',
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
    sendLink: 'Enviarme un enlace seguro',
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
    language: 'Idioma',
    google: 'Continuar con Google',
    emailFallback: 'O usa el correo',
    closeSettings: 'Cerrar ajustes',
    onboardingProgress: 'Paso 5 de 5',
    onboardingTitle: 'Un último paso',
    onboardingBody: 'Regístrate para disfrutar de una experiencia de Edenia más personalizada. ¡Es gratis!',
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
    sendLink: 'Recevoir un lien sécurisé',
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
    language: 'Langue',
    google: 'Continuer avec Google',
    emailFallback: 'Ou utilisez votre e-mail',
    closeSettings: 'Fermer les réglages',
    onboardingProgress: 'Étape 5 sur 5',
    onboardingTitle: 'Une dernière étape',
    onboardingBody: 'Inscrivez-vous pour profiter d’une expérience Edenia plus personnalisée. C’est gratuit !',
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
    sendLink: '向我发送安全链接',
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
    language: '语言',
    google: '使用 Google 继续',
    emailFallback: '或使用电子邮箱',
    closeSettings: '关闭设置',
    onboardingProgress: '第 5 步，共 5 步',
    onboardingTitle: '最后一步',
    onboardingBody: '注册即可获得更个性化的 Edenia 体验。完全免费！',
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
    sendLink: '傳送安全連結給我',
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
    language: '語言',
    google: '使用 Google 繼續',
    emailFallback: '或使用電子郵件',
    closeSettings: '關閉設定',
    onboardingProgress: '第 5 步，共 5 步',
    onboardingTitle: '最後一步',
    onboardingBody: '註冊即可獲得更個人化的 Edenia 體驗。完全免費！',
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

function gardenAccountAuth(copy, { onboarding = false } = {}) {
  return `
    <section class="garden-account-auth">
      <div class="garden-account-intro">
        ${duck({ className: 'garden-account-duck', decorative: true })}
        <div>
          <h2>${onboarding ? copy.onboardingTitle : copy.signIn}</h2>
          <p>${onboarding ? copy.onboardingBody : copy.signInBody}</p>
        </div>
      </div>
      <button class="google-context-button" type="button"><span aria-hidden="true">G</span>${copy.google}</button>
      <div class="account-context-divider"><span>${copy.emailFallback}</span></div>
      ${emailForm(copy)}
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
            ${gardenAccountAuth(copy)}
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
        <p class="onboarding-context-promise">Turn YouTube and Anki into visible language-learning progress.</p>
        <div class="onboarding-context-progress"><span>${copy.onboardingProgress}</span><i><b></b></i></div>
        ${gardenAccountAuth(copy, { onboarding: true })}
        <button class="onboarding-context-skip" type="button">${copy.onboardingSkip}</button>
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
      <div class="garden-browser-page">
        <div class="garden-sky" aria-hidden="true"><span></span><span></span><span></span></div>
        <section class="garden-card confirm-card">
          ${duck({ className: 'garden-duck', decorative: true })}
          <span class="security-pill">✓ ${copy.secure}</span>
          <h2>${copy.confirmTitle}</h2>
          <p class="lead">${copy.confirmBody}</p>
          <button class="primary-action" type="button">${copy.confirmAction}</button>
        </section>
      </div>
    </section>
  `
}

function gardenWelcome(copy) {
  if (state.surface === 'form') {
    return `
      <article class="direction direction-a contextual-direction surface-form">
        ${authJourney(copy, 0)}
        ${state.entry === 'onboarding' ? onboardingAccountContext(copy) : settingsAccountContext(copy)}
        <p class="direction-caption"><strong>Step 1 · In Edenia</strong> — the compact Garden welcome treatment lives inside ${state.entry === 'onboarding' ? 'the optional final onboarding step' : 'the existing Settings → Account drawer'}.</p>
      </article>
    `
  }

  if (state.surface === 'confirm') {
    return `
      <article class="direction direction-a contextual-direction surface-confirm">
        ${authJourney(copy, 2)}
        ${confirmationBrowserContext(copy)}
        <p class="direction-caption"><strong>Step 3 · Standalone confirmation</strong> — the email opens an analytics-free Edenia page in the learner’s browser; only its button verifies the link.</p>
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
  document.documentElement.lang = state.locale
  document.body.dataset.variant = state.variant
  stage.innerHTML = state.variant === 'A'
    ? gardenWelcome(copy)
    : state.variant === 'B'
      ? studyPassport(copy)
      : friendlyGuide(copy)

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
