# Account authentication

Edenia uses Supabase Auth for identity while keeping the public study path
accountless. The static browser client uses the pinned
`@supabase/supabase-js` dependency, a persistent PKCE session, and a public
publishable key. Supabase secrets, Google client secrets, Turnstile secrets,
Resend credentials, and service-role keys must never enter the static build.

## Audience and transport controls

The account controller starts only when `EDENIA_ACCOUNT_FEATURES_ROLLOUT`
admits the current audience, the page is not sandboxed, and both public
Supabase runtime values exist. `internal` limits the UI to
`/?internal_test=1`; that query parameter is a release selector, not an
authorization boundary.

Four independent public settings control the new transport:

| Setting | Safe default | Purpose |
| --- | --- | --- |
| `EDENIA_GOOGLE_SIGN_IN_MODE` | `oauth_redirect` | `off`, legacy redirect rollback, or `id_token` GIS exchange |
| `EDENIA_GOOGLE_ONE_TAP_ENABLED` | `false` | Allows the post-onboarding Google prompt |
| `EDENIA_GOOGLE_IDENTITY_CLIENT_ID` | empty | Public Google Web client ID used by GIS |
| `EDENIA_TURNSTILE_SITE_KEY` | empty | Public site key for email-request challenges |

Missing new values preserve the previous Google redirect and do not load
Google Identity Services or Turnstile. Invalid deployment values fail the
runtime-config build; invalid browser values normalize to the safe fallback.
The global account rollout still owns the audience. In particular, the
ordinary public root loads no account provider script while the rollout
remains `internal`.

## Google Identity Services

In `id_token` mode, Edenia renders Google's official button and exchanges the
ephemeral credential through:

```js
client.auth.signInWithIdToken({ provider: 'google', token, nonce })
```

The controller owns one active nonce opportunity at a time. It creates 32
random bytes, sends the SHA-256 digest to Google, sends the raw nonce only to
Supabase, ignores a duplicate or stale callback, clears both credential and
nonce after the exchange, and creates a fresh opportunity after a failure.
Neither value is decoded, logged, stored, put in analytics, or exposed to app
view state.

Google's official button may be mounted in Settings and the optional final
onboarding step. One Tap and cancelable automatic sign-in have a narrower
policy: the learner must be signed out on the exact production root with the
internal audience selected, onboarding must be complete, the first-study
walkthrough must be completed or skipped, and no walkthrough may be active.
The app uses the existing durable `setupCompleted && walkthroughCompleted`
state. A manual replay suppresses the prompt until it ends. Explicit sign-out
cancels the prompt and calls `disableAutoSelect()` before clearing the local
Supabase session.

The previous `signInWithOAuth` route remains only as an explicit internal
rollback. Edenia never silently falls back to it after a GIS failure because
that would reintroduce the opaque project hostname into top-level navigation.

## Email link and confirmation

When a Turnstile site key is configured, Settings and onboarding render the
official challenge explicitly. The form remains disabled until a valid token
is available. A token is bounded to 2,048 characters, kept only in memory,
valid for at most five minutes, consumed for one request, and reset after every
response. A failed or unavailable challenge sends no email request.

The account controller normalizes the address and calls:

```js
client.auth.signInWithOtp({
  email,
  options: {
    captchaToken,
    emailRedirectTo,
    shouldCreateUser: true
  }
})
```

Only these confirmation destinations are accepted:

- `https://www.edenia.study/auth/confirm/`
- `http://localhost:8000/auth/confirm/`

A successful request starts a one-minute browser cooldown. Supabase and the
email provider remain authoritative for server quotas.

`/auth/confirm/` is a standalone, analytics-free page. The branded template
must place `TokenHash` and `type=email` in an Edenia URL fragment. A tiny first
script captures the fragment and removes it from browser history before public
configuration or the confirmation bundle runs. Page load and scanner visits
perform no verification. Only **Continue to Edenia** calls:

```js
client.auth.verifyOtp({ token_hash: tokenHash, type: 'email' })
```

The parser accepts exactly one bounded URL-safe token hash and the exact email
type. A transient or offline failure retains it only in closure memory for a
deliberate retry; success or a definitive invalid/used response discards it.
The page has no main-app, PostHog, Google, Turnstile, or study-state import, and
uses `no-referrer`, `noindex`, and a restrictive exact-host CSP. A framed copy
discards the captured capability and never enables confirmation.

The reviewed hosted-template source is
`supabase/templates/magic_link.html`. Copy that source into Supabase's hosted
magic-link editor only after custom SMTP is active. Its action must link
exactly to:

```text
https://www.edenia.study/auth/confirm/#token_hash={{ .TokenHash }}&type=email
```

It must not contain `{{ .ConfirmationURL }}` or the Supabase project hostname
in visible text, HTML links, or the plain-text alternative.

## Session and application boundary

The generic controller owns only the browser session lifecycle. It restores
and refreshes the session, publishes `loading`, `signed-out`, `signed-in`, or
`unavailable`, observes auth events, signs out the current browser scope, and
unsubscribes when the page is discarded. App-facing state contains only the
normalized user UUID, normalized email, fixed `google` or `email` auth method,
busy action, and safe status. It never contains tokens, session objects,
metadata, identities, or Google subjects.

For every Google-capable session, the controller asks Supabase to verify the
session claims and reduces the current `amr` method to `google` or `email`.
This is necessary even when app metadata lists only Google: Supabase can
authenticate an email magic link into that same user without adding email to
the provider list. Email-only sessions remain unambiguous and need no extra
claim request. This avoids mistaking the account's retained provider metadata
for the method used by the current session. If claim verification is
unavailable, the fixed trusted provider in Supabase app metadata remains the
bounded fallback.

Supabase Auth callbacks stay synchronous. Edenia schedules the subsequent
`getSession()` outside `onAuthStateChange` and publishes signed-in state to
account consumers only after the shared client confirms the installed session.
This avoids racing the first protected request after sign-in.

Authentication does not upload, merge, restore, replace, or clear the full
browser-local study document. Existing reminder preferences and the bounded
reminder-eligibility snapshot remain separate account consumers behind their
current gates; this authentication change does not widen those payloads or
enable reminder delivery.

## PostHog identity

On a confirmed session, PostHog is identified with the normalized Supabase UUID
as the only `distinct_id`. The allowlisted person properties are normalized
`email` and `auth_method`. Email and Google subject are never passed as the
identifier or copied into events or the local analytics state snapshot.

Repeated identical auth events are deduplicated. Changed properties for the
same UUID update without a reset. Logout resets once, and an unexpected account
switch resets before identifying the next UUID so two learners are not merged.
Analytics failure cannot block auth rendering.

## Provider dependency order and rollback

Provider activation begins only after the inert client build is merged and its
exact Pages deployment is proven:

1. Keep the account rollout `internal`, Google on legacy or off, One Tap off,
   and Supabase CAPTCHA off.
2. Configure the Google Web client and deploy only its public client ID.
3. Configure dedicated Supabase custom SMTP on the existing verified Resend
   domain, then install the branded token-hash template and test it while
   CAPTCHA is still off.
4. Create the restricted Free Turnstile widget, deploy its public site key,
   and verify the browser token path.
5. Put the Turnstile secret only in Supabase Auth, enable CAPTCHA, and test
   missing-token rejection, one-use email success, token replay rejection, and
   Google ID-token sign-in immediately.
6. Set Google to `id_token`, enable One Tap for the internal canary, and run the
   desktop, phone, cross-device email, same-email UUID, PostHog, and local-data
   checks.

Production Auth URLs and the non-secret email/MFA invariants are mirrored in
`supabase/config.toml`. `supabase config push` is a full-service mutation, not
a preview command: review the intended file diff first, keep paid-only Storage
features explicitly disabled, then verify that a second push reports every
service up to date. The confirmation allowlist contains only the exact
production and localhost `/auth/confirm/` URLs; it contains no wildcard.

Rollback is dependency ordered: disable One Tap; set Google to legacy or off;
disable Supabase CAPTCHA if either auth method regresses; then set the global
account rollout off if the whole surface must disappear. Do not delete users,
linked identities, PostHog persons, verified domains, or shared reminder
credentials during a transport rollback.

See [Internal account and reminder operations](account-reminder-operations.md)
for live gates, reminder separation, and provider canary evidence.
