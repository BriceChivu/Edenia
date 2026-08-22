# Account authentication

Edenia uses Supabase Auth for identity. The default-off learner-profile
lifecycle keeps the existing accountless study path unchanged. When that
lifecycle is enabled, the landing page and onboarding remain public, but sign-in
is the final action before Edenia creates or displays durable learner state.
The browser client uses the pinned `@supabase/supabase-js` dependency,
persistent PKCE sessions, and a public publishable key. Supabase secrets, Google
client secrets, Turnstile secrets, SMTP credentials, email codes, and session
tokens must never enter the static build or application state.

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

## Learner-profile lifecycle boundary

`EDENIA_LEARNER_PROFILE_LIFECYCLE_ENABLED` is a separate, default-off
prefactor gate. When it is off, the existing accountless landing, onboarding,
study, persistence, sandbox, backup, and recovery path continues through the
original store and render flow. Keep this gate off in public configuration
until the database migration and signed-in profile resolution operation are
deployed and verified together.

When enabled, the application can reach learner state only through the
learner-profile lifecycle authority. The authority alone publishes
`resolving`, `locked`, `active`, `waiting-authentication`, `waiting-cloud`,
`migrating`, `conflicting`, or `recovering`. Authentication contributes only a
normalized session observation; it never activates, claims, uploads, replaces,
clears, or displays a profile by itself. Local persistence, cloud persistence,
clock, connectivity, export/download, and analytics are explicit adapters at
the authority seam.

Each active profile receives a browser-storage activation fence. Reads, saves,
imports, exports, analytics synchronization, and queued cloud work must still
hold that fence. A newer tab or later activation invalidates the earlier
profile object and its delayed callbacks. Every non-active state hides the
durable learner UI and pauses autosave. A learner who signs in from an already
visible onboarding step may keep that draft visible while first-profile
resolution finishes. A restored signed-in session starts behind the
identity-neutral gate until the current cloud head or a safe recovery state is
known.

## First signed-in profile creation

With the lifecycle enabled, pre-authentication onboarding writes only a bounded
version-1 draft under the environment-specific onboarding-draft key. It carries
locale, the intro and account-step timestamps, one language, one optional
level, and at most five catalog channel IDs. It contains no videos, Anki data,
study facts, town progress, session, email, provider metadata, or owner ID. The
draft survives authentication. The learner can discard it with **Start over**;
otherwise Edenia removes it only after an owned profile, whether new or
returning, is installed behind a local ownership fence.

The authenticated browser calls only:

```js
client.rpc('resolve_my_learner_profile', {
  p_onboarding_profile: portableOnboardingEnvelope
})
```

The browser supplies no ownership parameter. The public RPC is an invoker
wrapper around a private security-definer resolver with an empty search path.
The resolver uses `auth.uid()`, confirms that exact UUID against a verified,
non-anonymous, non-deleted `auth.users` row, and requires server-recorded
new-account evidence. A trigger records that evidence only for Auth UUIDs
created after this migration; existing UUIDs are never backfilled. A UUID with
legacy `state_backups`, a current head, or any historical learner-profile
revision routes to its existing profile or recovery instead of blank creation.
Successful creation consumes the new-account evidence in the same transaction,
so it cannot authorize a second first profile after later data loss.
The resolver validates the exact portable schema, its SHA-256 integrity value,
its UTF-8 byte length, bounded learner choices, and the absence of study data.
Creation writes one immutable version and one current head at generation 1,
revision 1, in the same database transaction.

A restored session calls the same owner-derived resolver before Edenia renders
or saves any learner state. An existing current head takes precedence over an
incidental onboarding draft. Missing-head history returns recovery instead of
creating a blank profile. Network and server unavailability remain
`waiting-cloud`; rejected or unverifiable profile data enters `recovering`.
Both states preserve local data and expose retry plus local sign-out without
revealing the learner's email, profile, or town.

After a successful online ownership check, the browser stores only the verified
Supabase UUID and the verification time. A matching owner may continue studying
through a network or Auth outage for at most 30 days, including the exact
30-day boundary. The local profile remains authoritative and cloud writes stay
queued. Expiry, a mismatched owner, a rejected or revoked session, an invalid
profile response, or an ownership conflict locks the profile immediately. None
of those outcomes delete the retained owner-bound local copy.

While a verified profile is open, Edenia revalidates the session and reconciles
the cloud head after focus returns or connectivity is restored. Rechecks are
coalesced and focus checks are rate-limited. A successful online check renews
the 30-day window; a transient transport failure does not. The verification
record never contains an email, credential, provider response, access token,
refresh token, or profile data.

`public.learner_profile_heads` and
`public.learner_profile_versions` have owner-read RLS policies. Authenticated
clients receive `SELECT` plus execute access to the narrow resolver, but no
direct write grant. The resolver derives all ownership server-side.

`private.learner_profile_access_control` is the independent server gate. Its
states are `off`, `developer-canary`, and `signed-in-public`; it defaults to
`off`. Developer canary admits only the UUID stored in
`developer_user_id`. The browser runtime flag controls whether the UI attempts
the flow, but it cannot admit a UUID or override this server gate.

On success, Edenia verifies the returned portable envelope again, installs the
signed-in profile locally with pending-finalization evidence, claims a new
activation fence, clears the draft, and only then reveals the town. If draft
deletion fails, Edenia releases the activation and retries the pending deletion
without revealing the profile. Database validation and creation failures roll
back the head and version together.

Cloud progress writes accept a complete canonical version-1 learner-profile
envelope of at most 2,097,152 UTF-8 bytes. The browser checks the schema,
canonical content, SHA-256 integrity, and byte count before transport; the
database independently repeats those checks before it changes a head, creates
a version, or records an idempotency receipt. The larger 8 MiB recovery-file
limit is separate, so a profile rejected by cloud acceptance can still be
exported locally. The evidence and selection rationale for both limits are in
[Learner-profile cloud transport bound](research/learner-profile-transport-bound.md).

An unknown cloud head is shown as **Not yet backed up**. An invalid, oversized,
corrupt, unsupported, quota-rejected, or provider-rejected candidate is shown
as **Not backed up**. Neither outcome truncates, compacts, replaces, or discards
the local profile, and a failed write leaves the last accepted cloud head and
receipts unchanged. The learner can continue studying, export a recovery copy,
or retry from Account settings. Transient retries use bounded exponential
backoff and stop after five failed attempts until the learner explicitly tries
again. A permanent rejection stops automatic retries immediately; later local
study replaces only the queued candidate and does not restart transport until
the learner explicitly tries again.

When a provisional owned profile has no cloud generation or revision yet, a
successful retry adopts only the resolved cloud identity metadata. Edenia keeps
the current local study state unchanged and uploads that state as the next
revision instead of replacing it with the older cloud snapshot.
After a queue-storage or preparation failure, reload compares the canonical
local profile with the last accepted cloud head. A mismatch follows the same
local-preserving backup path even when no pending candidate could be stored.

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

Google's official button exposes a successful credential callback but no
popup-cancellation callback. Closing that provider-owned UI therefore leaves
Edenia safely signed out without a fabricated error. The controller still
scrubs and safely maps a legacy OAuth cancellation fragment if an old callback
URL is opened during the transition.

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
  options: {
    captchaToken,
    data: { edenia_auth_locale: locale },
    shouldCreateUser: true
  }
})
```

After a successful request, the normalized address remains only in controller
memory for the pending verification and a one-minute resend cooldown begins.
The locale is normalized to one of the five supported UI locales and is stored
only as an untrusted email-presentation hint in Supabase user metadata. It is
never application-facing identity or learner-profile authority.
The six-digit code is verified on the same device:

```js
client.auth.verifyOtp({ email, token: code, type: 'email' })
```

The address and code are never placed in a URL. There is no permanent magic
link, scanner-sensitive action link, cross-device confirmation, or
`/auth/confirm/` route. Supabase sends its separate **Confirm signup** template
to a new address and its **Magic Link** template to an existing address. The
versioned `supabase/templates/confirmation.html` and
`supabase/templates/magic_link.html` sources both render `{{ .Token }}` as
plain text and must not contain `{{ .ConfirmationURL }}`, `{{ .TokenHash }}`,
a link, or a Supabase project hostname. Both sources select one of the five
localized copies from the bounded hint and show a multilingual fallback when
an older account has no hint.

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
events, and unsubscribes on discard. **Sign out** requests Supabase's local
scope and immediately locks the retained local profile in this browser.
**Sign out everywhere** requests the global scope. Other browsers lock when
Supabase definitively rejects their session, when they reconnect, or when their
session expires. Both actions clear the local ownership-verification record;
neither action deletes the owner-bound study copy.
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

Auth forms carry PostHog's `ph-no-capture` class, and session replay masks all
input values while leaving ordinary non-input product behavior available. The
code, Google credential, nonce, CAPTCHA token, session, cookies, and provider
response metadata are never sent to analytics. Captured URLs omit fragments and
replace secret-bearing query values with `[REDACTED]` while preserving ordinary
campaign and product parameters. The live callback URL remains available until
Supabase consumes its PKCE values; the analytics sanitizer never rewrites that
browser input. Session replay starts paused on any URL with an authentication
secret key and resumes only after the live URL is safe.

On a confirmed session, PostHog identifies only the normalized Supabase UUID.
The sole allowlisted account person property is normalized `email`; it is not
copied into ordinary event payloads. Auth method, provider subject, provider
labels, and names do not cross the analytics identity boundary. Logout resets
once, and an account switch resets before identifying the next UUID.

## Provider activation and rollback

Activate the internal canary in dependency order:

1. Keep the account rollout `internal`, Google `off`, and Supabase CAPTCHA off.
2. Configure the exact Google Web origins and deploy only its public client ID.
3. Configure dedicated Auth SMTP and install the reviewed six-digit-code
   sources into both **Confirm signup** and **Magic Link** while CAPTCHA is
   still off.
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
