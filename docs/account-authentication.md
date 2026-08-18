# Account authentication

Edenia uses Supabase Auth for identity while keeping the public study path
accountless. The browser client uses the pinned `@supabase/supabase-js`
dependency, persistent PKCE sessions, and a public publishable key. Supabase
secrets, Google client secrets, Turnstile secrets, SMTP credentials, email
codes, and session tokens must never enter the static build or application
state.

## Audience and transport controls

The account controller starts only when `EDENIA_ACCOUNT_FEATURES_ROLLOUT`
admits the current audience, the page is not sandboxed, and both public
Supabase runtime values exist. `internal` limits the interface to
`/?internal_test=1`; the query is a release selector, not an authorization
boundary.

The remaining transport settings are:

| Setting | Safe default | Purpose |
| --- | --- | --- |
| `EDENIA_GOOGLE_SIGN_IN_MODE` | `id_token` | `id_token` enables the official GIS button; `off` disables Google |
| `EDENIA_GOOGLE_IDENTITY_CLIENT_ID` | empty | Public Google Web client ID used by GIS |
| `EDENIA_TURNSTILE_SITE_KEY` | empty | Public site key for email-request challenges |

There is no OAuth redirect mode, One Tap flag, automatic account selection,
separate sign-up action, or connected-methods interface. Missing provider
configuration hides that provider. Invalid deployment values fail the runtime
config build. The global account rollout still owns the audience, so the
ordinary public root loads no account provider script while the rollout is
`internal`.

## Google Identity Services

Edenia renders Google's official button and exchanges its ephemeral credential
through:

```js
client.auth.signInWithIdToken({ provider: 'google', token, nonce })
```

The controller owns one nonce opportunity at a time. It creates 32 random
bytes, sends the SHA-256 digest to Google, sends the raw nonce only to
Supabase, ignores duplicate or stale callbacks, and creates a fresh opportunity
after failure. It never calls `prompt()`, enables auto-selection, or renders a
custom imitation of Google's button.

Neither the ID token nor nonce is decoded, logged, persisted by Edenia, placed
in analytics, or exposed to view state. The official button may appear in
Settings and the optional final onboarding step. The classic GIS script is
loaded without a forced CORS mode and with ITP support enabled.

## Same-device email verification codes

Settings and onboarding offer one email path: request a six-digit code, then
enter it in the same form and browser. The controller normalizes the address
and requests the code without any redirect destination:

```js
client.auth.signInWithOtp({
  email,
  options: { captchaToken, shouldCreateUser: true }
})
```

After a successful request, the normalized address remains only in controller
memory for the pending verification and a one-minute resend cooldown begins.
The six-digit code is verified on the same device:

```js
client.auth.verifyOtp({ email, token: code, type: 'email' })
```

The address and code are never placed in a URL. There is no permanent magic
link, scanner-sensitive action link, cross-device confirmation, or
`/auth/confirm/` route. The hosted source at
`supabase/templates/magic_link.html` renders `{{ .Token }}` as plain text and
must not contain `{{ .ConfirmationURL }}`, `{{ .TokenHash }}`, a link, or a
Supabase project hostname.

Invalid, expired, rate-limited, offline, and provider-failure results map to
safe localized feedback. The code and provider response details never enter
view state. The pending address is cleared when a session is established. A
page reload therefore requires a fresh request, while an established Supabase
session persists normally.

## Turnstile boundary

When a Turnstile site key is configured, each email-request form renders the
official challenge explicitly with `appearance: 'interaction-only'`. The form
remains disabled until a valid token exists. The security region reserves no
challenge-sized blank area when Cloudflare needs no interaction.

A token is bounded to 2,048 characters, kept only in controller memory, valid
for less than five minutes, consumed for one request, and reset after every
request outcome. Missing, expired, failed, timed-out, unsupported, replayed, or
oversized tokens stop before the email request.

Client checks are presentation safeguards, not the security boundary.
Supabase Auth CAPTCHA protection must be enabled with the Turnstile secret so
the server rejects forged, expired, and replayed tokens. The secret remains
only in Supabase; the browser receives only the restricted public site key.

## Session and application boundary

The generic controller restores and refreshes the persistent Supabase session,
publishes `loading`, `signed-out`, `signed-in`, or `unavailable`, observes auth
events, signs out only the current browser, and unsubscribes on discard.
App-facing state contains only the normalized user UUID, normalized email,
fixed `google` or `email` method, busy action, and safe status. It never
contains codes, tokens, session objects, provider metadata, identities, or
Google subjects.

For Google-capable sessions, verified session claims reduce the current `amr`
method to `google` or `email`. This prevents retained provider metadata from
being mistaken for the method used by the current session. Account equivalence
is always the exact Supabase UUID; Edenia never matches users by email.

Authentication does not upload, merge, restore, replace, or clear the complete
browser-local study document. Reminder preferences and the bounded study
snapshot are separate consumers behind their existing gates.

## Analytics and replay privacy

Auth forms carry PostHog's `ph-no-capture` class. Email and code inputs are not
autocaptured or included in session replay. The code, Google credential,
nonce, CAPTCHA token, session, and provider response metadata are never sent to
analytics.

On a confirmed session, PostHog identifies only the normalized Supabase UUID.
The existing allowlisted person properties are normalized `email` and
`auth_method`; neither is used as the distinct ID. Logout resets once, and an
account switch resets before identifying the next UUID.

## Provider activation and rollback

Activate the internal canary in dependency order:

1. Keep the account rollout `internal`, Google `off`, and Supabase CAPTCHA off.
2. Configure the exact Google Web origins and deploy only its public client ID.
3. Configure dedicated Auth SMTP and install the reviewed six-digit-code
   template while CAPTCHA is still off.
4. Create the restricted Turnstile widget, deploy its public site key, then
   store its secret only in Supabase Auth.
5. Enable server-side CAPTCHA and prove missing, expired, replayed, and valid
   token behavior without recording any sensitive value.
6. Enable Google `id_token` mode and prove official-button and email-code
   sign-in on desktop, tablet, and phone while the public route stays
   accountless.

Rollback is dependency ordered: set Google to `off`; disable Supabase CAPTCHA
if email requests regress; then set the global account rollout to `off` if the
whole surface must disappear. Do not delete users, identities, PostHog persons,
verified domains, or shared reminder credentials during a transport rollback.

See [Internal account and reminder operations](account-reminder-operations.md)
for live gates, reminder separation, and sanitized canary evidence.
