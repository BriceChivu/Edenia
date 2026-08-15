# Internal account and reminder operations

This runbook covers Edenia's current internal-only account and reminder system.
It is deliberately written for the system that exists now.

## Current safety state

- The account interface is available only when
  `EDENIA_ACCOUNT_FEATURES_ROLLOUT=internal` and the visitor uses
  `/?internal_test=1`.
- The deployed source can select legacy Google OAuth, Google Identity Services
  ID-token exchange, and Turnstile-protected email links independently. Until
  the new provider canary is complete, Google remains legacy or off, One Tap
  remains off, Supabase CAPTCHA remains off, and production custom SMTP and the
  branded token-hash template must be treated as unverified.
- The standalone `/auth/confirm/` page is analytics-free, scrubs its token-hash
  fragment before unrelated work, and requires a deliberate confirmation
  action. It reads no local study state.
- After an OAuth callback, the controller confirms the shared client session
  before it publishes signed-in state to protected-data consumers. The
  production acceptance test must not use **Try loading again** to make the
  first reminder-preference read succeed.
- An authenticated user can save only their own `reminder_preferences` row.
- The server has a read-only account-export API, but Settings deliberately does
  not offer an account-data download control.
- Account exports allow five requests per ten-minute fixed window. The server
  hashes the verified UUID before using the service-only rate-limit bucket; the
  browser cannot choose the scope, owner, window, or limit.
- The export explicitly marks current-device progress as excluded. Starting a
  download never reads, uploads, replaces, or binds progress from the browser.
- The private tester allowlist stores Supabase user UUIDs, never email
  addresses.
- `reminder_delivery_enabled` is an independent server-side switch and must
  remain `false`.
- `dispatch-study-reminders` is manual and authenticated by the dedicated
  `reminder_dispatcher` secret key. With the server switch off it remains
  bounded to 25 dry-run claims, logs intended occurrences, and contacts no
  email provider.
- The private delivery ledger can represent a provider attempt, API acceptance,
  a bounded permanent failure, or an ambiguous outcome. The live worker is
  compiled into the dispatcher but cannot claim live work while the database
  switch is off.
- Unsubscribe-token binding requires the current claim token and rechecks the
  tester allowlist, saved schedule and consent, suppression state, and lease.
  A narrow no-send RPC can end a current claim as `recipient_unavailable`
  without falsely recording a provider attempt.
- `/unsubscribe/` is a static, analytics-free confirmation page on Edenia's
  GitHub Pages origin. It removes the capability from the address bar before
  the user can act and never reads local study state.
- `unsubscribe-study-reminders` is a JSON-only mutation API. A valid opaque
  capability submitted by `POST` can perform only the service-owned
  unsubscribe operation; `GET` returns `405` without checking the capability.
- There is no Cron schedule. Resend is configured with a send-only key scoped
  to the verified `mail.edenia.study` domain, an Edenia From address, an exact
  single-recipient server allowlist, and an independent unsubscribe secret.
  The worker rechecks the database switch before claiming and again through the
  provider-begin RPC immediately before network I/O. With the switch off, no
  worker generates or stores unsubscribe capabilities.
- A private provider-event ledger can deduplicate bounded event metadata and
  atomically apply bounce, complaint, or provider suppression.
- `resend-reminder-webhook` verifies Resend's raw-body Svix signature before it
  interprets or persists an event. Resend is configured to send only the seven
  supported email events to that exact endpoint. A production transport test
  received successful signed `email.sent` and `email.delivered` callbacks; the
  handler intentionally ignored them because the transport test had no Edenia
  reminder tags.

The `internal_test=1` query parameter is a public rollout selector. It is not
an authorization or security boundary. Supabase Auth, row-level security,
server-only RPC grants, the UUID allowlist, and the independent delivery switch
are the security boundaries.

## Authentication canary preflight and activation

The authentication provider canary is separate from reminder delivery. It
must not change `reminder_delivery_enabled`, add a Cron schedule, broaden the
tester UUID allowlist, or enable a reminder recipient.

Before configuring any provider, prove the exact merged Pages SHA contains the
inert client capability and confirm these non-secret settings:

```text
EDENIA_ACCOUNT_FEATURES_ROLLOUT=internal
EDENIA_GOOGLE_SIGN_IN_MODE=oauth_redirect or off
EDENIA_GOOGLE_ONE_TAP_ENABLED=false
Supabase Auth CAPTCHA=disabled
reminder_delivery_enabled=false
```

Activate in this order:

1. Google Web client: exact JavaScript origins for production and the approved
   local test origin, basic identity scopes only, existing Supabase provider
   configuration preserved, public client ID in Pages.
2. Resend SMTP: reuse the verified `mail.edenia.study` domain and Free account,
   create a dedicated Auth SMTP credential when possible, use sender name
   `Edenia` and `accounts@mail.edenia.study`, and do not modify the reminder
   send-only credential.
3. Supabase email template: install the reviewed
   `supabase/templates/magic_link.html` source and use only the branded Edenia
   fragment URL documented in `docs/account-authentication.md`; verify HTML and
   plain text contain no opaque project reference while CAPTCHA is still
   disabled.
4. Turnstile: create a Free widget restricted to `www.edenia.study` and the
   approved local host, deploy the public site key, verify explicit rendering
   and one-use token forwarding, then store the secret only in Supabase Auth.
5. CAPTCHA and GIS: enable CAPTCHA and immediately prove missing-token email
   rejection, valid-token email success, token replay rejection, official
   Google button sign-in, and eligible One Tap. If Google breaks, disable
   CAPTCHA before investigating.
6. Internal runtime: set Google mode to `id_token` and One Tap to `true` without
   changing the account rollout from `internal`.

All messages during this canary go only to an already approved internal test
address. Never record the complete address, ID token, nonce, magic-link token,
Turnstile token, session cookie, SMTP password, or provider secret in Git,
terminal output, PR text, or this runbook.

The switch-off rehearsal is also ordered: One Tap off, Google legacy or off,
CAPTCHA off if required, then account rollout off. At each stage ordinary study
must remain usable and the public root must remain accountless. Restore the
intended internal state only after the rehearsal passes.

## Internal acceptance test

Use a browser profile whose local Edenia progress can be inspected before and
after the test.

1. Export or record the current internal-test progress if it matters.
2. Open
   `https://www.edenia.study/?internal_test=1&account=1`.
3. Open **Settings**, then **Account**.
4. Select **Continue with Google** and use an approved Google OAuth test user.
5. Confirm the Settings section shows the signed-in account.
6. Confirm **Daily streak reminder** and **Discover new channels** are both on for a
   first-time account. Turn each switch off and on once; each change should save
   without a separate Save button. There must be no day, time, frequency, or
   account-download control.
7. Sign out and confirm the study progress in that browser is unchanged.
8. Sign in again and confirm the account session and saved reminder preference
   restore independently of local study progress.

No reminder email should arrive while the live switch is off. A saved
preference proves only authenticated storage; it does not enable delivery.

On a shared browser, signing out removes the Edenia account session but does not
erase local study progress. Do not use account switching as proof that local
progress belongs to the signed-in user.

An export contains personal account and server history. Store it privately and
delete it when it is no longer needed. If the account changes while an export
is in flight, Edenia discards the result instead of downloading data from the
previous account.

## Operator preflight

Before any database or function operation:

1. Confirm the target Supabase project and environment.
2. Confirm `EDENIA_ACCOUNT_FEATURES_ROLLOUT` is still `internal` in the GitHub
   repository variables.
3. Confirm the live-delivery switch is off:

   ```sql
   select delivery_enabled, updated_at
   from private.reminder_delivery_control
   where singleton;
   ```

4. Confirm queue and consent counts without selecting email addresses:

   ```sql
   select jsonb_build_object(
     'testers', (select count(*) from private.reminder_delivery_testers),
     'preferences', (select count(*) from public.reminder_preferences),
     'deliveries', (select count(*) from private.reminder_deliveries),
     'suppressions', (select count(*) from private.reminder_suppressions),
     'provider_events', (select count(*) from private.reminder_provider_events),
     'unsubscribe_digests', (
       select count(*) from private.reminder_unsubscribe_tokens
     )
   ) as reminder_state;
   ```

5. Read the service-owned health snapshot. It contains only aggregate counts
   and timestamps—never a user UUID, address, provider payload, or message ID:

   ```sql
   select public.get_reminder_operational_metrics(now());
   ```

   The versioned result reports the live switch, due queue count and oldest
   queue age, provider acceptances, permanent failures, ambiguous outcomes,
   exact provider-event replays prevented, and sticky suppressions. The replay
   counter covers signed provider webhook duplicates; scheduled-occurrence
   duplication remains prevented by the existing unique user/local-date key.
   Query this snapshot before and after every manual canary. Browser roles
   cannot call the metrics function.

Never copy a Supabase secret key into source control, a GitHub repository
variable used by Pages, SQL text, issue comments, pull-request text, or chat.

## Manage the tester allowlist

Copy the user's UUID from **Supabase Auth > Users**. Verify the intended account
before changing the allowlist. Do not add an email column or paste an email into
the private reminder tables.

Add one tester idempotently:

```sql
insert into private.reminder_delivery_testers (user_id)
values ('00000000-0000-0000-0000-000000000000'::uuid)
on conflict (user_id) do nothing;
```

Remove one tester:

```sql
delete from private.reminder_delivery_testers
where user_id = '00000000-0000-0000-0000-000000000000'::uuid;
```

Removing a tester prevents that UUID from entering subsequent claims. The live
provider-begin fence also rechecks the allowlist, so a claimed occurrence that
has not reached provider I/O cannot send. An already in-flight provider request
cannot be recalled; turn the delivery switch off as well.

## Invoke the manual dispatcher

Use the current `sb_secret_...` key named `reminder_dispatcher`. It exists only
for this function and must be rotated immediately if exposed. Supabase secret
keys are not JWTs: send the key only in the `apikey` header. The function has
platform JWT verification disabled and performs named secret-key authorization
inside the handler.

The following pattern keeps the secret out of the command line and shell
history:

```bash
read -r -s EDENIA_REMINDER_SECRET_KEY
curl --fail-with-body --silent --show-error \
  --request POST \
  --header "apikey: ${EDENIA_REMINDER_SECRET_KEY}" \
  --header 'Content-Type: application/json' \
  --data '{}' \
  'https://PROJECT_REF.supabase.co/functions/v1/dispatch-study-reminders'
unset EDENIA_REMINDER_SECRET_KEY
```

Do not add an `Authorization: Bearer sb_secret_...` header. Opaque secret keys
must use `apikey`.

A healthy empty result resembles:

```json
{
  "mode": "dry_run",
  "status": "completed",
  "live_delivery_enabled": false,
  "claimed": 0,
  "observed": 0,
  "completion_failed": 0
}
```

The request accepts only `POST`, `Content-Type: application/json`, and the exact
body `{}`. Do not add caller-controlled batch, time-window, or lease values.

Dry-run logs may contain Supabase user UUIDs and occurrence IDs. Treat those
logs as internal operational data. They must not contain email addresses,
session tokens, secret keys, or claim fencing tokens.

## Live-dispatch canary configuration

The deployed function contains a fail-closed live path. Production currently
has all of these Edge Function secrets or settings:

- `RESEND_API_KEY`
- `REMINDER_FROM_ADDRESS`
- `REMINDER_UNSUBSCRIBE_SECRET` (at least 32 bytes)
- `REMINDER_APP_URL` (the exact internal-test Edenia URL)
- `REMINDER_UNSUBSCRIBE_PAGE_URL` (the exact Edenia unsubscribe-page base URL)
- `REMINDER_LIVE_RECIPIENT_EMAIL` (one exact normalized canary address)
- `SUPABASE_URL` (provided by Supabase and used to derive the unsubscribe API)

The live route validates all seven values before it claims anything. It then uses
a batch size of 5, a 15-minute due window, and a 5-minute lease. It loads the
current confirmed recipient from Supabase Auth, binds only the deterministic
unsubscribe-token digest, and calls `begin_reminder_provider_attempt`
immediately before Resend. Any failed token, switch, tester, consent,
preference, suppression, or lease fence results in zero provider calls.

Do not put these values in Pages runtime configuration, GitHub Pages variables,
source control, SQL, a command line, issue text, or pull-request text. They
belong only in the Supabase Edge Function secret store.

## Emergency stop and rollback

The live-delivery switch must stay off until a separately reviewed live worker
exists. To force or restore the safe state:

```sql
update private.reminder_delivery_control
set delivery_enabled = false,
    updated_at = now()
where singleton;
```

Then verify the row reads `false`. For defense in depth, remove all tester UUIDs
and stop any future Cron schedule. No Cron exists in the current release.

The dispatcher selects dry-run only while the live switch is `false`. Never
turn the switch on to test the route: with missing live settings it returns
`503` before a claim, while fully configured settings would make provider I/O
possible for allowlisted due reminders.

Database migrations are additive. During rollback, leave their unused tables
and columns in place, keep the switch off, and redeploy the last known-good Edge
Function commit. Dropping tables while a newer function is deployed is less
safe than leaving unreachable state.

## Provider hand-off and retry invariants

The delivery ledger separates these facts deliberately:

- `send_started_at` means a provider request may have left Edenia. It is written
  before a future adapter performs network I/O and is never reset by a retry.
- `provider_accepted` means the provider API returned a durable message ID. It
  does not mean the receiving mailbox accepted or displayed the email.
- `permanent_failure` is reserved for a small reviewed set of failures that are
  safe not to retry. Network errors and timeouts are not permanent failures.
- `outcome_ambiguous` means Edenia cannot prove whether the provider accepted
  the request before its deduplication guarantee expired. Never reset or resend
  such an occurrence manually; investigate it as a possible send.

The first possible provider attempt fixes a 23-hour retry deadline. This leaves
one hour of safety inside Resend's documented 24-hour idempotency-key lifetime.
The Resend adapter reuses one deterministic idempotency key derived
from the reminder occurrence ID on every retry. If the result is still unknown
at the 23-hour boundary, Edenia intentionally prefers one missed reminder over
a possible duplicate email.

Resend is the configured provider because Supabase documents an Edge Function
integration, the send API accepts idempotency keys, and webhook requests use
Svix signatures and event IDs. The sender domain, send-only API key, From
address, and webhook signing secret are active. Product reminder delivery is
still inert because the independent database switch is off and there is no
schedule.

The shared Resend adapter reads no environment variables itself. The dispatcher
can reach it only through the live runner after the server switch, strict
configuration validation, a live claim, unsubscribe-token binding, and the
provider-begin database fence. Its contract is:

- `POST https://api.resend.com/emails` is the only allowed destination.
- The idempotency key is exactly
  `edenia-study-reminder-v1/<stable-delivery-uuid>` and must never be replaced
  during a retry.
- The payload always contains the same normalized single recipient, localized
  subject, text and HTML, and RFC 8058 `List-Unsubscribe` headers.
- Two non-personal tags identify the Edenia reminder source and stable delivery
  UUID so a signed webhook can correlate an event without persisting or trusting
  the recipient address from the provider payload.
- Provider bodies, messages, email addresses, and secrets are never returned in
  adapter results. Results contain only bounded reason codes and, after a
  validated success, the provider message ID.
- Network failures, timeouts, rate limits, server failures, concurrent requests,
  and malformed success bodies may be retried only with the same key and payload
  inside the database's 23-hour horizon.
- Reusing a key with a changed payload is an operator-visible
  `idempotency_conflict`. Edenia must not work around it by changing the key,
  because that could send a duplicate.

The provider-state RPCs are executable only by `service_role`. They require the
current lease token, preserve the original retry horizon, and refuse a first
provider attempt unless the independent live-delivery switch, UUID tester
allowlist, current preference and consent, and suppression checks all pass.
Turning the switch off prevents the next provider call. A response already in
flight may still be recorded as accepted or failed so it is not accidentally
retried later.

The same fencing rule now applies before storing an unsubscribe capability. A
crashed worker's claim token cannot bind or rebind a digest after another worker
reclaims the occurrence. Retries can reuse only the one deterministic digest
already attached to that occurrence. Changing the token secret between a first
attempt and a retry therefore fails closed instead of silently rotating the
unsubscribe link.

If Supabase Auth confirms that a current claimed user has no usable recipient
address, the service-only `complete_reminder_without_send` RPC may record only
`recipient_unavailable`. It clears the lease while leaving `provider_name`,
`send_started_at`, and `send_retry_deadline` empty. Configuration, template, or
provider errors cannot use this path, and an occurrence whose provider attempt
already started cannot be rewritten as though no send was possible.

The worker stops the current batch after a provider defer, provider block, or
accepted response that could not be recorded. It never logs the recipient,
provider response body, provider message ID, capability, API key, or claim
token. A provider `Retry-After` value is logged as a bounded number but does not
yet extend the database lease; retry scheduling and backoff must be added before
Cron.

## Provider event invariants

[Resend requires verification against the raw request body](https://resend.com/docs/webhooks/verify-webhooks-requests)
using `svix-id`, `svix-timestamp`, and `svix-signature`. The endpoint uses the
pinned official Svix library, bounds the raw body to 64 KiB, and verifies the
signature before interpreting the payload or calling the database. Svix also
rejects stale signatures. The event ID is the database deduplication key;
Resend retries non-200 webhook responses.

Outgoing reminders include only two provider tags: the fixed source
`edenia-study-reminder` and the stable delivery UUID. A verified endpoint must
require both exact tags and ignore the provider payload's `to`, `from`, and
subject fields. The private event ledger persists only provider name, event ID,
event type, delivery ID, provider message ID, event timestamp, receive
timestamp, and the bounded action. It contains no raw payload or recipient
address.

The provider message identifier is `data.email_id`, which matches the ID
returned by the Resend send API. Do not substitute the RFC-style
`data.message_id`; it is a different value and may contain angle brackets and
an email-domain-shaped suffix. Signed events for another source tag or an
unsupported event type are acknowledged and ignored. Once the exact Edenia
source tag is present, malformed correlation fields return a non-200 response
so a schema or tagging regression stays visible in Resend's retry history.

The event RPC is service-only and idempotent. Exact replays return `duplicate`;
an event ID reused with changed content returns `event_conflict`. A provider
message ID cannot be rebound to another delivery. Signed `email.sent`,
`email.delivered`, `email.delivery_delayed`, and `email.failed` events are
observed. `email.bounced`, `email.complained`, and `email.suppressed` also add a
sticky local suppression and disable the preference. [Resend distinguishes
temporary delivery delays from permanent bounce events](https://resend.com/docs/webhooks/event-types),
so delayed events are never treated as a hard bounce.

A signed event may arrive before the dispatcher records the successful API
response or after an occurrence becomes `outcome_ambiguous`. The delivery tag
allows the RPC to reconcile either state to `provider_accepted` without trusting
an email address. This feedback processing remains valid while the emergency
delivery switch is off; turning off future sends must not prevent bounce or
complaint suppression for an already in-flight message.

The endpoint deliberately does not consult the live-delivery switch. A bounce
or complaint for an already accepted email must remain processable after the
operator turns future sends off. Browser roles still cannot execute the event
RPC, and the endpoint never accepts a Supabase user session as webhook proof.

## Verify the provider webhook

The Resend webhook and `RESEND_WEBHOOK_SECRET` are configured. An unsigned
production `POST` must return `400` with a generic JSON response and leave the
provider-event count unchanged:

```bash
curl --silent --show-error --include \
  --request POST \
  --header 'Content-Type: application/json' \
  --data '{}' \
  'https://PROJECT_REF.supabase.co/functions/v1/resend-reminder-webhook'
```

An unsigned or incorrectly signed request must never be used as a positive
webhook test. The production endpoint is registered for only the seven event
types in `REMINDER_PROVIDER_EVENT_TYPES`. A successful signed event for a real
tagged occurrence returns `200`; exact replays also return `200` without a
second mutation. A signed transport-test event without the exact source and
delivery tags returns `200` and is ignored.

## Suppression and unsubscribe invariants

- Suppression is server-sticky. Re-enabling a client preference cannot make a
  suppressed UUID claimable.
- Hard bounces, complaints, manual suppressions, and user unsubscribes disable
  the preference and fence pending or claimed work.
- An unsubscribe capability is a deterministic HMAC-SHA-256 value for one
  delivery. It is opaque, contains no user UUID or email, and is persisted only
  as a 32-byte SHA-256 digest. The HMAC secret must eventually exist only in an
  Edge Function secret.
- One occurrence can bind to only one token digest, and consuming it twice must
  not repeat the mutation.
- An email-link `GET` loads the static Edenia confirmation page rather than
  consuming the token; security scanners commonly follow links. A deliberate
  browser action sends the API `POST`. The API also accepts the standard exact
  `List-Unsubscribe=One-Click` form body, and the provider adapter adds the
  corresponding email headers.
- The endpoint intentionally requires no Supabase JWT. Possession of the
  256-bit capability authorizes only the narrow service-role token-consumption
  RPC. It cannot select users, email addresses, preferences, or private tables.
- The browser API path accepts only the exact Edenia production origin and the
  exact localhost development origin when an `Origin` header is present.
  Supabase's gateway may emit permissive CORS response headers and answer
  preflight itself, so CORS is not an authorization boundary; the handler still
  rejects an unrecognized origin on the mutation request.
- Token URLs are sensitive until consumed. The static page loads no analytics,
  uses a no-referrer policy, and removes the token from browser history. API
  responses use `no-store`. Never copy token URLs into logs, analytics, issue
  comments, or pull-request text.

The public endpoint exists before live delivery so its behavior can be tested
without sending mail. No token digest should exist in production until an
allowlisted live worker is separately reviewed.

## Verify the inert unsubscribe endpoint

After deploying Pages and the Edge Function, use a syntactically valid dummy
capability to verify only the public confirmation behavior:

```text
https://www.edenia.study/unsubscribe/?token=AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA&lang=en
```

The page must show a confirmation button, change its visible URL to
`/unsubscribe/?lang=en`, and leave the operator-preflight counts
unchanged. Submitting this dummy value should show a generic invalid-link
response and must not create a suppression.

Do not serve this UI directly from the shared Supabase function domain.
[Supabase documents that HTML responses are rewritten to plain text](https://supabase.com/docs/guides/functions/http-methods)
because Edge Functions on that domain are intended as APIs. A Supabase custom
domain could change that constraint, but it is a paid product/domain decision
and is unnecessary while Edenia already has a static Pages origin.

For a real local integration test, create a disposable user, preference,
claimed delivery, and matching token digest in the isolated local database.
Verify these transitions, then delete the fixture:

1. Loading the static page leaves the preference enabled and token unconsumed;
   a direct API `GET` returns JSON `405` without touching the database.
2. The first allowed-origin form `POST` returns JSON `200`, disables the
   preference, records an
   `unsubscribed` / `unsubscribe_token` suppression, consumes the digest, and
   changes claimed work to `suppressed` with its lease token cleared.
3. Repeating the form `POST` and sending the exact one-click form body both
   return `200` without applying another mutation.
4. Invalid, duplicate, oversized, or wrong-content-type input never calls the
   database mutation, and an unrecognized browser origin receives `403`.

## Known verification gaps

- The deployed dispatcher rejects unauthenticated production requests. Repeat
  a positive hosted invocation after every named-key rotation before creating
  any schedule.
- Production Google OAuth has been exercised with one approved Google test
  account in one desktop browser. Cross-device, private-window, Safari, mobile,
  cancellation, and a second-account switch still need acceptance coverage.
- The Google OAuth consent screen remains a test-user rollout. That is suitable
  for internal testing, not public launch.
- Resend transport, the verified sender domain, and real signed production
  callbacks have been observed. A genuine tagged reminder, one-click
  unsubscribe, bounce, complaint, and provider-suppression event have not yet
  been exercised in production.
- The five reminder locales and confirmation pages have automated structural
  coverage, but their copy has not yet been reviewed by native speakers or
  exercised across real email clients.

## Gates before any live email

Do not enable the live path or add a schedule until all of the following are
reviewed and verified:

1. The provider's idempotency guarantee is rechecked before release. Edenia's
   current design stops retries after 23 hours and makes an ambiguous occurrence
   terminal rather than risking a duplicate after Resend's documented 24-hour
   window.
2. A real tagged-reminder test confirms raw-body signature verification, idempotent
   event IDs, and sticky suppression for hard bounces, complaints, and
   provider-suppressed sends while temporary delays remain non-suppressing.
3. The existing five-locale text and HTML templates are reviewed by humans and
   in real email clients, including the plain-text alternative, confirmation
   flow, and provider-generated one-click headers.
4. The live worker rechecks the emergency switch, tester allowlist, current
   consent, and suppression immediately before every provider call.
5. Manual allowlisted delivery succeeds before any Cron schedule is created.
6. Queue age, accepted sends, provider failures, ambiguous sends, duplicate
   prevention, and suppressions are observable without logging email addresses.

## Revised implementation sequence

The original live-delivery PR is split so each safety boundary can be reviewed
without an active sender:

1. **Provider-neutral ledger (current):** add durable provider-attempt,
   acceptance, failure, and ambiguity state plus the 23-hour retry boundary.
   No network path exists.
2. **Unreachable Resend adapter (current):** lock the deterministic request,
   privacy, timeout, idempotency, error, and unsubscribe-header contracts in a
   pure shared module. The deployed dispatcher does not import it.
3. **Live database prerequisites (current):** require the current claim token
   when storing a capability and provide one truthful `recipient_unavailable`
   terminal outcome before any provider request. No sender imports the adapter.
4. **Fail-closed live orchestration (current):** the adapter is wired behind
   strict configuration checks and immediate switch, allowlist, consent,
   suppression, and lease fences. Missing configuration or any failed fence
   results in zero provider calls. No credential or schedule is added.
5. **Provider event ledger (current):** persist no provider payload or address,
   deduplicate `svix-id`, reconcile acceptance races, and atomically suppress
   bounce, complaint, and provider-suppressed recipients.
6. **Verified webhook endpoint (current):** verify raw-body Svix signatures,
   require the fixed source and delivery tags, pass only bounded metadata to
   the event RPC, and acknowledge unsupported or untagged events without a
   database mutation.
7. **Canary readiness (current):** the isolated sending subdomain, send-only
   key, exact-recipient allowlist, From address, unsubscribe secret, and signed
   webhook are configured. A transport-only message and callbacks succeeded.
8. **Manual allowlisted canary:** only when one genuine due occurrence exists,
   enable the switch briefly, send to the one verified tester, inspect the
   provider and suppression ledgers, then turn the switch off again. Never
   manufacture study activity or queue state to force this test.
9. **Scheduling:** create Cron only after repeated manual canaries and an
   operator rollback drill. Public rollout remains a separate later decision.

## Public-readiness audit (2026-08-12)

This is a read-only snapshot of production configuration, not approval to make
the account surface public.

- At the time of this pre-domain-migration snapshot, the Auth site URL was
  `https://bricechivu.github.io/Edenia/`. Before domain cutover it must become
  `https://www.edenia.study/` through the approval-gated checklist in
  `deployment-and-releases.md`.
- The redirect allowlist contains exactly the internal production callback and
  the localhost callback documented in `account-authentication.md`. It contains
  no wildcard.
- Google and email authentication are enabled. New-user signup and email
  confirmation are enabled. Anonymous sign-in and manual identity linking are
  disabled.
- Auth currently permits two project emails per hour, 30 sign-up/sign-in
  requests per IP per five minutes, and 30 OTP or magic-link verifications per
  IP per five minutes. CAPTCHA is disabled.
- The client uses only Google OAuth and email OTP. It does not offer passwords,
  anonymous sign-in, or manual identity linking.

Do not raise the email limit or enable CAPTCHA as a standalone console change.
The magic-link sender, client CAPTCHA token path, error states, accessibility,
and recovery behavior must be verified together before either change. The
current two-email limit is a useful internal-stage brake, but it also means the
fallback can be exhausted quickly during testing.

### Account-owned server data

The production ownership inventory has mixed deletion behavior:

| Data | Auth user reference | Current delete behavior |
| --- | --- | --- |
| Reminder preferences | foreign key | cascade |
| Reminder deliveries, testers, suppressions and unsubscribe tokens | foreign keys | cascade |
| State backups | foreign key | no action |
| Founding checkout reservations | foreign key | no action |
| Founding members | no Auth foreign key | application-owned history |
| Subscriptions | no Auth foreign key | application-owned history |

Therefore Edenia must not expose a direct `auth.admin.deleteUser` action yet.
Depending on the account, it could be blocked by retained rows or delete only
part of the user's server history. A complete lifecycle design must first
decide:

1. which billing, founding-member and backup records are exported, anonymized,
   retained, or deleted;
2. how an active Plus subscription is cancelled or transferred before Auth
   deletion;
3. how the browser-only sync export is presented separately from server data;
4. how deletion is reauthenticated, made idempotent, audited without storing
   sensitive payloads, and recovered after a partial external-provider failure;
5. how a second request reports completed, pending-retention, and failed states.

Account export should be implemented before deletion so these decisions can be
tested without destroying data. Export must keep browser-local study progress
separate: it is already available through **Export sync file** and is not owned
by the signed-in account.

The account export uses a private database implementation. Its privileged
implementation lives in the non-exposed `private` schema and browser roles
cannot execute it or use that schema. A service-role-only bridge accepts only
the owner UUID independently verified by the `export-account-data` Edge
Function; there is no browser-callable export RPC. That function revalidates
the signed-in session, rate-limits a hash of the stable user UUID, accepts only
an empty JSON request from the exact Edenia or localhost origin, and caps the
download before returning it with no-store headers. The versioned JSON document
includes the account identity, user-facing billing and founding status,
server-held backup snapshots, reminder choices and non-secret delivery history.
It explicitly marks current device progress as excluded.

The function deliberately omits operational capabilities and external-system
correlators: unsubscribe digests, delivery lease tokens, reservation email
hashes, Stripe customer/session/subscription identifiers, provider message
identifiers and webhook event identifiers. Anonymous and service-role callers
cannot use the private implementation directly, and browser roles cannot call
the service bridge. The internal Settings UI offers the download only to a
signed-in account, rejects mismatched or local-progress scope, discards a
response after account switching, and prevents concurrent downloads.

### Shared-browser and identity behavior

The account controller signs out with Supabase's local scope. The regression
suite signs out user A, switches the same browser to user B, and verifies that
user A's reminder preference is cleared before user B's preference loads. The
same test proves that selected local study evidence is unchanged. The Settings
copy warns that anyone using the browser profile can see its local progress.

Manual identity linking remains disabled. Before email changes or linking are
offered, test the same verified address through Google and magic link, different
addresses across providers, an existing Plus account, and unlink/recovery
behavior. Do not infer account equivalence from an email address in application
code.

### Advisor record

The post-schema security advisor reports intentional `rls_enabled_no_policy`
INFO notices for private, grant-revoked tables and older deny-all billing tables.
It also reports the pre-existing [leaked-password protection warning](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection).
Edenia does not currently offer password authentication, so this is not a reason
to enable a separate password flow.

Migration `20260811224323_optimize_account_owner_policies.sql` follows
Supabase's [select-wrapped Auth function guidance](https://supabase.com/docs/guides/database/postgres/row-level-security#call-functions-with-select)
for the two RLS initialization-plan warnings on `subscriptions` and
`founding_members`. Its database test preserves the two-user, unauthenticated,
service-role, no-write, policy-role and policy-command boundaries. The
post-deployment advisor rerun on 2026-08-12 reported neither initialization-plan
warning. The remaining performance notices are INFO-level unused indexes,
including indexes for dormant reminder delivery, account export, and restored
Stripe webhook paths; retain them until those paths have representative usage.

Newly created reminder indexes are still reported as unused because delivery
remains off and production has no reminder preferences. Do not remove safety or
queue indexes based on an unused-index INFO notice during the manual rollout.

## Public-readiness items still deferred

- Subscription-aware account deletion, retention choices, and recovery after
  partial deletion.
- Email-change and identity-linking behavior across Google, magic link and
  existing Plus accounts.
- CAPTCHA client integration and a deliberate magic-link rate-limit decision.
- Google consent-screen publication, branding, privacy/terms URLs and domain
  verification outside the repository.

Supabase database advisors should be recorded after each schema change. An INFO
notice that a private, grant-revoked table has RLS but no policies is intentional
deny-all behavior. Other warnings must be triaged separately rather than hidden
inside an unrelated reminder PR.
