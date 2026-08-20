# Verify frictionless Turnstile protection across Edenia's email sign-in flow

Date: 2026-08-15

## Question

What must Edenia's specification require to prove that Cloudflare Turnstile protects email-code requests in Chrome and Safari when the widget uses `interaction-only` appearance, including invisible success, visible challenges, missing, expired, and replayed tokens, failure states, and the requirement that an invisible widget leave no empty layout space?

## Decision

Not seeing a checkbox in Chrome is expected behavior, not evidence of a bypass. In `interaction-only` mode, Cloudflare says the widget becomes visible only when the visitor must interact and that most visitors never see it. Turnstile adapts its outcome to the visitor and browser, so Safari may present a checkbox while Chrome completes a non-interactive challenge. [Cloudflare: widget configurations](https://developers.cloudflare.com/turnstile/get-started/client-side-rendering/widget-configurations/#appearance-modes) and [Cloudflare: Turnstile overview](https://developers.cloudflare.com/turnstile/)

Edenia must nevertheless prove two separate properties:

1. **Frictionless presentation:** an invisible or automatically successful challenge leaves the email button at the form's normal spacing, while a genuinely interactive challenge expands a visible, usable security region.
2. **Server enforcement:** Supabase Auth rejects an OTP request whose Turnstile token is missing, expired, invalid, or already used. A visible checkbox and Edenia's client-side disabled button are not security boundaries.

The current source supports the intended token path, but the current styling definitely causes the reported Chrome gap: `.account-turnstile` reserves `65px` even when Cloudflare shows no interactive widget. [`src/styles/20-settings-onboarding.css`](../../src/styles/20-settings-onboarding.css#L510-L545)

## Provider guarantees and boundaries

### Visibility and browser variation

- `interaction-only` is the correct low-friction appearance for this requirement. It deliberately hides a Managed or Non-Interactive widget unless visitor interaction is required. Appearance does not control when verification executes; Edenia keeps Cloudflare's default automatic execution at render time. [Cloudflare: appearance and execution modes](https://developers.cloudflare.com/turnstile/get-started/client-side-rendering/widget-configurations/#appearance-modes)
- Cloudflare exposes `before-interactive-callback` and `after-interactive-callback` specifically for entering and leaving interactive mode. The specification should require Edenia's controller to expose equivalent presentation state, without prescribing the final CSS structure. [Cloudflare: configuration reference](https://developers.cloudflare.com/turnstile/get-started/client-side-rendering/widget-configurations/#complete-configuration-reference)
- Current and two previous major Chrome and Safari releases are officially supported. Cloudflare explicitly says browser automation and headless browsers are unsupported and recommends real devices for challenge testing, so Playwright against the production widget is not valid proof of the genuine Chrome-versus-Safari experience. [Cloudflare: supported browsers](https://developers.cloudflare.com/cloudflare-challenges/reference/supported-browsers/)

### Token security

Cloudflare requires server-side Siteverify validation because client tokens can be forged. Tokens are at most 2,048 characters, expire after 300 seconds, and are single-use; expired and replayed tokens are rejected with `timeout-or-duplicate`. A fresh challenge is required after expiry or use. [Cloudflare: server-side validation](https://developers.cloudflare.com/turnstile/get-started/server-side-validation/)

Supabase's documented CAPTCHA flow supports Cloudflare Turnstile and requires the provider secret to be enabled under Auth bot and abuse protection. The browser passes the CAPTCHA result as `options.captchaToken`. [Supabase: CAPTCHA protection](https://supabase.com/docs/guides/auth/auth-captcha)

Edenia pins `@supabase/supabase-js` 2.110.7. In that exact version, `signInWithOtp` serializes `options.captchaToken` into the `/otp` request as `gotrue_meta_security.captcha_token`. [Supabase JS 2.110.7 source](https://github.com/supabase/supabase-js/blob/v2.110.7/packages/core/auth-js/src/GoTrueClient.ts#L2218-L2246) Supabase Auth's own documentation states that, when CAPTCHA middleware is enabled, Auth reads `captcha_token` from the request and asks the configured CAPTCHA provider to verify it. [Supabase Auth CAPTCHA configuration](https://github.com/supabase/auth/blob/master/README.md#captcha)

Therefore the browser can collect and forward a token, but only the enabled Supabase Auth middleware plus Cloudflare validation makes the email endpoint resistant to direct requests.

## Current Edenia evidence

### Source and automated coverage

Edenia currently:

- explicitly renders one widget with `appearance: 'interaction-only'`, `size: 'flexible'`, no hidden response field, and success, error, expiry, timeout, and unsupported-browser callbacks; [`src/integrations/turnstile-controller.js`](../../src/integrations/turnstile-controller.js#L143-L213)
- stores the token only in controller memory, bounds it to 2,048 characters and less than 300 seconds, clears it when consumed, and resets expired or invalid tokens; [`src/integrations/turnstile-controller.js`](../../src/integrations/turnstile-controller.js#L216-L246)
- disables email submission unless the widget status is `ready`; [`src/app.js`](../../src/app.js#L5021-L5060)
- consumes the token, passes `captchaRequired: true` whenever the live Turnstile site key is configured, and resets the widget after the Supabase call; [`src/app.js`](../../src/app.js#L5539-L5554)
- refuses to call `signInWithOtp` when CAPTCHA is required but no token is present, and forwards a bounded token as `options.captchaToken`; [`src/integrations/account-auth-controller.js`](../../src/integrations/account-auth-controller.js#L389-L468)
- has contract tests for explicit rendering, single-use in-memory tokens, five-minute age bounds, and callback failure states, plus a stubbed browser test proving that the Supabase `/otp` body receives `gotrue_meta_security.captcha_token`. [`tests/contracts/turnstile-controller.test.mjs`](../../tests/contracts/turnstile-controller.test.mjs#L31-L155) and [`tests/e2e/account-auth-methods.spec.mjs`](../../tests/e2e/account-auth-methods.spec.mjs)

With a configured Turnstile controller, Edenia's submit button becomes enabled only after Cloudflare invokes the success callback. Thus the reported enabled Chrome button strongly implies that Chrome obtained a token non-interactively. This is a source-based inference, not proof that the live Supabase server validated that token.

The existing tests do **not** yet prove the missing-token client branch, interactive layout transitions, provider error recovery, or real Supabase rejection of missing, expired, and replayed tokens.

### Read-only production snapshot

On 2026-08-15, a read-only inspection of [the internal account URL](https://www.edenia.study/?internal_test=1&account=1), its versioned app and CSS assets, and public runtime configuration found:

- account rollout remained `internal`;
- a non-test Turnstile site key and Supabase public configuration were present;
- the deployed app requested `interaction-only`, consumed a token before the OTP call, and reset afterward; and
- the deployed stylesheet still reserved `65px` for `.account-turnstile`.

No email request was made and no challenge was solved. Supabase's public Auth `/settings` response did not expose CAPTCHA enablement, so this inspection cannot confirm the server-side toggle or secret. No key or token value was recorded.

## Required specification

### 1. Presentation state contract

The email form must have an explicit distinction between **verification state** and **widget visibility**:

- `loading` or non-interactive `pending`: token absent, email button disabled, no reserved widget row; compact status may be exposed accessibly without creating an empty challenge-sized gap.
- `interactive`: the security region enters normal layout before Cloudflare presents the challenge; the button remains disabled; the checkbox, provider messages, keyboard focus, and touch target remain unobstructed.
- `ready`: token present, button enabled, security region collapsed if Cloudflare is no longer interactive, and the measured email-input-to-button distance equals the form's normal gap.
- `expired`, `timeout`, `error`, or `unsupported`: token cleared, button disabled, concise localized status shown, and a recoverable retry or widget reset path available. No `/otp` request occurs.
- `consumed`: token cleared immediately; one request may proceed; the widget is reset after success or failure before another request can be attempted.

Acceptance must be geometry-based rather than tied to one CSS technique. In Chrome's non-interactive success case there must be no challenge-sized blank area and no extra empty grid rows. In Safari's interactive case the form must expand without overlap, clipping, horizontal overflow, or covering the submit button. Validate both Settings and onboarding, desktop and phone widths, and all supported Edenia locales.

### 2. Client request contract

- When a Turnstile site key is configured, an empty, oversized, expired, errored, timed-out, unsupported, or already-consumed token must stop before `signInWithOtp`.
- The accepted token must be passed only as `options.captchaToken`, never persisted, logged, placed in application state, analytics, the URL, or issue/CI output.
- The browser cooldown begins only after Supabase accepts the request. Every request attempt resets the widget, and another send requires a fresh token.
- Provider errors must remain generic to the learner while retaining enough non-secret state for an operator to distinguish widget failure from Supabase rejection.

### 3. Supabase enforcement contract

- Supabase Auth CAPTCHA protection must be enabled with provider `Turnstile`; the secret remains only in Supabase, and the public site key remains restricted to approved production hosts.
- A direct `/auth/v1/otp` request without `gotrue_meta_security.captcha_token` must fail and send no email.
- A valid, unexpired production token must permit exactly one OTP request.
- Reusing the same token must fail and send no second email.
- Submitting the token after 300 seconds must fail and send no email.
- Invalid provider responses and provider timeouts must fail closed. Rate limits remain a separate abuse-control layer, not evidence that CAPTCHA passed.

Proof must include the Supabase response class and email-provider delivery count without recording the address, CAPTCHA token, email code, session, publishable key, or provider secret.

### 4. Proportionate proof for one developer

Use three small layers rather than maintaining a second permanent cloud stack:

1. **Deterministic contracts:** extend the current controller and account-auth tests for missing-token refusal, every callback transition, token clearing, interactive visibility events, and retry/reset behavior.
2. **Stubbed browser geometry:** use provider callbacks under Playwright to prove collapsed and expanded layouts in Chromium and WebKit at desktop and phone widths. This proves Edenia's UI logic, not Cloudflare risk assessment.
3. **One controlled live canary:** on real, current Chrome and Safari, using only the approved tester address, prove non-interactive success when Cloudflare chooses it, visible interaction when Cloudflare chooses it, and the server rejection matrix. Keep email counts and sanitized result classes only. Do not call a browser difference a regression merely because one browser receives an interactive challenge.

Cloudflare publishes test site keys for always-pass visible and invisible widgets, always-fail widgets, and a forced interactive challenge, plus server test secrets for pass, fail, and already-spent outcomes. They are suitable for deterministic local or disposable-environment tests; production secrets reject dummy tokens, so test and production credentials must never be mixed. [Cloudflare: testing Turnstile](https://developers.cloudflare.com/turnstile/troubleshooting/testing/)

If local Supabase Auth can be configured with the matching public Cloudflare test secret, use it for deterministic server rejection without external email delivery. Otherwise, keep server rejection as a narrowly documented operator canary; do not rotate the production secret merely to run automated tests.

## Pass criteria

The ticket's implementation can be called proven only when all of these are true:

- real Chrome can complete the ordinary low-friction path with no visible widget and no reserved challenge-sized gap;
- real Safari can complete either Cloudflare-selected path, and an interactive challenge expands cleanly;
- the submit button never enables before a valid callback and never sends without a fresh token;
- missing, expired, invalid, and replayed tokens are rejected by Supabase Auth with zero corresponding email deliveries;
- exactly one email is sent for the one accepted token;
- error, timeout, expiry, unsupported-browser, blocked-script, and offline states fail closed with understandable localized feedback; and
- no sensitive value appears in logs, screenshots, test reports, analytics, commits, or tracker comments.

## Newly surfaced decision

The remaining decision is where deterministic **server** rejection tests live: a short-lived/local Supabase Auth environment configured with Cloudflare's official test credential pairs, or a manual operator-only production canary. The first gives repeatability but adds setup; the second is simpler for a solo developer but must be rerun carefully after auth configuration changes. This does not affect the UI decision: the current fixed-height widget reservation should be removed and layout should follow actual interactive visibility.
