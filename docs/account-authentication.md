# Account authentication

Edenia's general account work reuses the existing Supabase Auth integration.
The browser client uses the pinned `@supabase/supabase-js` dependency with a
persistent PKCE session and a public publishable key. A Supabase secret or
service-role key must never be included in the static application.

## Current foundation

The main application initializes the generic account controller only when all
of these conditions are true:

1. `EDENIA_ACCOUNT_FEATURES_ROLLOUT` admits the current audience;
2. the page is not in sandbox mode;
3. both public Supabase runtime values are available.

During the internal rollout, this limits initialization to
`/?internal_test=1`. The query parameter is a public release boundary, not an
authentication or authorization control.

The generic controller owns only the browser session lifecycle:

- restore the current Supabase session;
- publish `loading`, `signed-out`, `signed-in`, or `unavailable` state;
- expose only the user ID and email to application presentation code;
- observe sign-in, sign-out, token-refresh, and user-update events;
- refresh the session on demand;
- sign out only the current browser session; and
- unsubscribe when the page is discarded.

The app-facing state never retains access tokens, refresh tokens, or user
metadata. Supabase still persists its PKCE session in the existing isolated
Auth storage key. The neutral `accountAuthStorageKey` deliberately aliases the
historic Plus key so an existing Plus user is not signed out or split into a
second Edenia identity.

## Sign-in providers and return destinations

The controller supports Google OAuth and retains an email magic-link fallback.
Both methods can return only to one of these exact application URLs:

- `https://bricechivu.github.io/Edenia/?internal_test=1&account=1`
- `http://localhost:8000/?internal_test=1&account=1`

The production URL must be added verbatim to Supabase Auth's redirect allow
list. The localhost URL is for development only. Edenia refuses to start a
sign-in from any other origin, path, protocol, or port instead of constructing
a callback from untrusted page input.

In Google Cloud, the authorized JavaScript origin is the Edenia origin, while
the authorized redirect URI is the Supabase project's Google callback URL.
That provider callback is different from the Edenia return destinations above.

OAuth cancellation and provider errors are read from the callback URL, exposed
as presentation-safe controller states, and then removed from browser history.
Email addresses are normalized before requesting a magic link and never become
an authorization or analytics identifier.

## Analytics identity

When analytics is enabled, a signed-in session identifies PostHog with the
normalized Supabase user UUID only. Edenia rejects email addresses and malformed
IDs at both the application and classic analytics boundaries. Repeated auth
events are deduplicated, logout calls `posthog.reset()`, and an unexpected
account switch resets before identifying the next UUID so two users are not
merged. Analytics failure never blocks account rendering.

This identity bridge does not read or write Edenia study state and does not
start a cloud upload, migration, restore, merge, or sync operation.

Supabase Auth callbacks remain synchronous. Edenia schedules state updates
outside the callback because making asynchronous Supabase calls inside
`onAuthStateChange` can deadlock the client.

## Security boundary

Browser session state is suitable for presentation, but it is not an
authorization decision. Future database tables and Edge Functions must verify
the authenticated user independently and enforce ownership with row-level
security. User-editable metadata must never grant access. A signed-in state
also does not opt a learner into reminders or cloud progress storage.

## Later staged layers

The authentication layer itself still performs no reminder preference,
delivery, progress, migration, or sync operation. Later internal-only changes
added an owner-isolated reminder preference, a private occurrence ledger, a
manual dry-run dispatcher, and provider-neutral suppression safety around this
controller. They do not upload or bind local study progress and cannot send
email. See [Internal account and reminder operations](account-reminder-operations.md)
for the current gates, acceptance test, and rollback procedure.
