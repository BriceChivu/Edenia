# Internal account and reminder operations

This runbook covers Edenia's current internal-only account and reminder system.
It is deliberately written for the system that exists now, not the future live
email design.

## Current safety state

- The account interface is available only when
  `EDENIA_ACCOUNT_FEATURES_ROLLOUT=internal` and the visitor uses
  `/?internal_test=1`.
- The controller offers Google OAuth and email magic links through Supabase
  Auth. Production Google OAuth is verified for one approved test account;
  production SMTP for the magic-link fallback is not yet verified.
- An authenticated user can save only their own `reminder_preferences` row.
- The private tester allowlist stores Supabase user UUIDs, never email
  addresses.
- `reminder_delivery_enabled` is an independent server-side switch and must
  remain `false`.
- `dispatch-study-reminders` is manual, secret-key authenticated, bounded to 25
  claims, and dry-run only. It logs intended occurrences and contacts no email
  provider.
- `unsubscribe-study-reminders` is a public confirmation endpoint. A `GET`
  never reads or changes reminder state; a valid opaque capability submitted by
  `POST` can perform only the service-owned unsubscribe operation.
- There is no Cron schedule, email-provider key, sender domain, or live delivery
  adapter. No current worker generates or stores unsubscribe capabilities.

The `internal_test=1` query parameter is a public rollout selector. It is not
an authorization or security boundary. Supabase Auth, row-level security,
server-only RPC grants, the UUID allowlist, and the independent delivery switch
are the security boundaries.

## Internal acceptance test

Use a browser profile whose local Edenia progress can be inspected before and
after the test.

1. Export or record the current internal-test progress if it matters.
2. Open
   `https://bricechivu.github.io/Edenia/?internal_test=1&account=1`.
3. Open **Settings**, then **Account & reminders**.
4. Select **Continue with Google** and use an approved Google OAuth test user.
5. Confirm the Settings section shows the signed-in account.
6. Configure reminder days, local time, and timezone. Saving an enabled
   preference requires explicit reminder-email consent.
7. Sign out and confirm the study progress in that browser is unchanged.
8. Sign in again and confirm the account session and saved reminder preference
   restore independently of local study progress.

No email should arrive. A saved preference proves only authenticated storage;
delivery remains impossible while there is no provider and the live switch is
off.

On a shared browser, signing out removes the Edenia account session but does not
erase local study progress. Do not use account switching as proof that local
progress belongs to the signed-in user.

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
     'unsubscribe_digests', (
       select count(*) from private.reminder_unsubscribe_tokens
     )
   ) as reminder_state;
   ```

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

Removing a tester prevents that UUID from entering subsequent claims. The
current worker has no email side effect, so an occurrence already loaded by a
running dry run can at most be logged and marked observed.

## Invoke the manual dry run

Use a current `sb_secret_...` key named `default`. Supabase secret keys are not
JWTs: send the key only in the `apikey` header. The function has platform JWT
verification disabled and performs named secret-key authorization inside the
handler.

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

The current dispatcher intentionally refuses to run when the live switch is
`true`; changing the switch is not a way to test dry-run behavior.

Database migrations are additive. During rollback, leave their unused tables
and columns in place, keep the switch off, and redeploy the last known-good Edge
Function commit. Dropping tables while a newer function is deployed is less
safe than leaving unreachable state.

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
- An email-link `GET` shows confirmation rather than consuming the token;
  security scanners commonly follow links. A deliberate form `POST` performs
  the unsubscribe. The endpoint also accepts the standard exact
  `List-Unsubscribe=One-Click` form body; a future provider adapter still needs
  to add and verify the corresponding email headers.
- The endpoint intentionally requires no Supabase JWT. Possession of the
  256-bit capability authorizes only the narrow service-role token-consumption
  RPC. It cannot select users, email addresses, preferences, or private tables.
- Token URLs are sensitive until consumed. They use `no-referrer` and
  `no-store` responses and must never be copied into logs, analytics, issue
  comments, or pull-request text.

The public endpoint exists before live delivery so its behavior can be tested
without sending mail. No token digest should exist in production until an
allowlisted live worker is separately reviewed.

## Verify the inert unsubscribe endpoint

After deploying the Edge Function, use a syntactically valid dummy capability
to verify only its public confirmation behavior:

```text
https://PROJECT_REF.supabase.co/functions/v1/unsubscribe-study-reminders?token=AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA&lang=en
```

The page must show a confirmation button and the database counts in the
operator preflight must remain unchanged. Submitting this dummy value should
show a generic invalid-link response and must not create a suppression.

For a real local integration test, create a disposable user, preference,
claimed delivery, and matching token digest in the isolated local database.
Verify these transitions, then delete the fixture:

1. `GET` returns `200` and leaves the preference enabled and token unconsumed.
2. The first form `POST` returns `200`, disables the preference, records an
   `unsubscribed` / `unsubscribe_token` suppression, consumes the digest, and
   changes claimed work to `suppressed` with its lease token cleared.
3. Repeating the form `POST` and sending the exact one-click form body both
   return `200` without applying another mutation.
4. Invalid, duplicate, oversized, or wrong-content-type input never calls the
   database mutation.

## Known verification gaps

- The deployed dry-run function rejects unauthenticated production requests,
  and the named secret-key path passed through the real local Edge runtime. A
  positive hosted invocation with the current `sb_secret_...` key has not yet
  been completed; do that before creating any schedule.
- Production Google OAuth has been exercised with one approved Google test
  account in one desktop browser. Cross-device, private-window, Safari, mobile,
  cancellation, and a second-account switch still need acceptance coverage.
- The Google OAuth consent screen remains a test-user rollout. That is suitable
  for internal testing, not public launch.
- No email provider, sender domain, From address, webhook endpoint, or live
  provider credential has been selected or verified.
- The five reminder locales and confirmation pages have automated structural
  coverage, but their copy has not yet been reviewed by native speakers or
  exercised across real email clients.

## Gates before any live email

Do not add a live send path or schedule until all of the following are reviewed
and verified:

1. A transactional-email provider and data-processing terms are accepted by
   the account owner.
2. A sending domain and From address are verified, with SPF, DKIM, and DMARC
   reviewed.
3. The provider secret and webhook signing secret exist only in Edge Function
   secrets.
4. The provider supports request idempotency, and Edenia defines safe behavior
   after that provider's deduplication window expires. An ambiguous send should
   prefer a missed reminder over a possible duplicate.
5. Webhook signatures are checked against the raw request body, provider event
   IDs are processed idempotently, and only hard bounces or complaints create
   sticky suppression.
6. The existing five-locale text and HTML templates are reviewed by humans and
   in real email clients, including the plain-text alternative, confirmation
   flow, and provider-generated one-click headers.
7. The live worker rechecks the emergency switch, tester allowlist, current
   consent, and suppression immediately before every provider call.
8. Manual allowlisted delivery succeeds before any Cron schedule is created.
9. Queue age, accepted sends, provider failures, ambiguous sends, duplicate
   prevention, and suppressions are observable without logging email addresses.

## Public-readiness items still deferred

Account deletion and export need a complete server-data inventory and a clear
decision about subscriptions and historic cloud backups. Local Edenia progress
is not in the account and must be explained and exported separately before any
account deletion action.

Email changes and identity linking require tests across Google and magic-link
identities so one person is not split into two Supabase users. CAPTCHA and
magic-link rate limits, Google consent-screen publication and branding, the
production redirect list, privacy/terms URLs, and custom-domain ownership are
console and product decisions as well as code work.

Supabase database advisors should be recorded after each schema change. An INFO
notice that a private, grant-revoked table has RLS but no policies is intentional
deny-all behavior. Other warnings must be triaged separately rather than hidden
inside an unrelated reminder PR.
