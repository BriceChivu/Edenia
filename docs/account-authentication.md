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

Supabase Auth callbacks remain synchronous. Edenia schedules state updates
outside the callback because making asynchronous Supabase calls inside
`onAuthStateChange` can deadlock the client.

## Security boundary

Browser session state is suitable for presentation, but it is not an
authorization decision. Future database tables and Edge Functions must verify
the authenticated user independently and enforce ownership with row-level
security. User-editable metadata must never grant access. A signed-in state
also does not opt a learner into reminders or cloud progress storage.

## Deliberately not included yet

This foundation adds no sign-up button, Google provider action, reminder
preference, email delivery, progress table, migration, or sync operation. Those
capabilities should arrive in later focused changes and continue to use the
same controller and rollout policy.
