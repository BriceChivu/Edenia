# Account email operations

Issue [#521](https://github.com/BriceChivu/Edenia/issues/521) implements optional
streak and discovery emails on the existing free infrastructure. Implementation
and deployment do not authorize sending. The new migrations force delivery off
and create no reminder Cron job. No account rollout or learner records are changed.

## Implemented policy

Both Settings choices default on. Saved off choices survive reads and upgrades.
A checked choice is a saved preference; **Enable emails** is the disclosed owner
action that enrolls the displayed choices. Reads never enroll anyone. Disabling
a type removes its enrollment. Enabling a previously unenrolled type requires
Enable emails again. Default/migration consent from older versions does not qualify.

Preferences use independent choice versions and an enrollment epoch. Conflicting
same-choice saves refresh Settings; stale saves and stale enable actions cannot
reverse unsubscribe. Ordinary unsubscribe stops both choices and both enrollments.
A verified owner may deliberately enroll again. Hard bounce, complaint, manual
and provider suppression remain effective. Settings reports paused delivery,
pending saves, failures, saved preferences and enrollment separately.

Streak eligibility requires yesterday to have at least **10 Study XP** and today
to have less than 10. It uses accepted cloud Study facts, preserving the Study day
assigned to each fact. Browser-only totals are not authority. The projection names
the current accepted owner/profile/generation/revision; missing, stale or invalid
provenance skips delivery. Unchanged relevant inputs carry forward through cosmetic
record revisions. Relevant changes/reset/restore invalidate the projection for
bounded recomputation away from gameplay. Email wording remains conditional because
offline or unsynced progress is invisible to the server.

The saved IANA timezone determines 19:00 and a one-hour send window. There is no
next-day catch-up. Across both types, an owner gets at most one email per local
date and per rolling 24 hours; streak takes priority. Discovery is at most once
per seven local dates, from the reviewed catalog in the recipient's selected
learning languages. Current and previously deleted channel IDs are excluded.
Channels outside the onboarding catalog rank first by the number of distinct
other learners who added them; onboarding channels fill only remaining slots,
ranked the same way. A learner counts once per channel, regardless of repeated
adds; the recipient never counts toward popularity. Missing slots are left empty.
The reviewed email catalog is a migration-owned snapshot of the application
catalogs and must be updated through a reviewed migration when coverage changes.

Channel history is private and derived from accepted profile config. Typed config
changes update it in the existing transaction; legacy head changes reuse the
config already extracted by the existing eligibility trigger. A small fingerprint
cache skips unchanged channel lists. Island/video records are rejected before
reading their JSON. Backfill uses bounded owner locks with `skip locked`, including
peers who did not enroll in emails. Deletion markers survive re-add and subsequent
profile versions. Complete ownership is checked separately from the bounded video
follow projection, so channels beyond that projection cannot be recommended.

Each occurrence freezes up to six channel cards, or the streak's accepted count,
remaining whole watch minutes and optional new/continue video. Every card is
rechecked against current languages, ownership, permanent deletions, reviewed
metadata and prior potentially sent recommendations at the existing final send
fence. An eligibility change invalidates the occurrence; it never rebuilds a retry.
The existing 90-day channel history applies to every card, and the normal weekly,
daily, capacity and suppression gates still apply. Old scalar history remains
recognized. Historical/provider-started inserts retain their original metadata.

A channel card opens Edenia's Add field with the reviewed name filled in. The
Add all button adds reviewed IDs sequentially through the ordinary channel-save
path, shows progress at the bottom, skips owned/currently removed channels and
stops after a failed save or lost active profile. It does not replace a profile,
change an account, bypass channel allowances or upgrade a subscription. Canary
mail must use `REMINDER_APP_URL=https://www.edenia.study/?internal_test=1` while
account services are restricted to that route; public rollout remains separate.

## Email redesign deployment

The account settings explanation/enrollment-status lines are removed in both
app presentations. The Auth templates and both reminder types share Edenia's
rounded white card, blue background, palette and raster wordmark. The code email
keeps one contiguous six-digit token and has no duck/welcome hero. The production
renderer is also used by the offline mailbox preview; fixture counts and additions
are never inputs to production delivery.

This release is explicitly held until PR #526 has merged and its merge commit
has a successful Pages deployment with matching live release metadata. Never
merge or apply production changes based on its green PR checks alone.

Deploy the additive migration with sending off, then the matching
`dispatch-study-reminders` function. The v4 worker claims frozen design fields
through `claim_due_typed_reminder_design`; prior claim RPCs remain for compatibility.
Publish Pages before installing both `supabase/templates/confirmation.html` and
`supabase/templates/magic_link.html` in hosted Auth so the wordmark asset exists.
Patch only the two template bodies through the Management API and verify their
hashes; do not replace Auth configuration or SMTP secrets with a broad config push.
Run bounded `refresh_reminder_eligibility_snapshots` batches to drain private
history backfill before sending resumes. Record the pre-upgrade switch and admission mode. If
delivery was already enabled, pause for the upgrade and restore only that prior
state after verification; preserve its audience and schedule. A previously disabled
deployment stays disabled. Deployment sends no real canary message.


## Free capacity and dispatch

The only provider send endpoint is the retained Resend `/emails` adapter.
There is no paid fallback, provisioning, upgrade, subscription or billing API.
Product caps are 60 reservations per UTC day and 1,800 in a rolling 31 days,
across both email types; shared provider usage can stop sending sooner. These
caps leave headroom but cannot guarantee capacity for Auth or other senders.

Before sending, the operator must independently verify the actual Free account,
no paid overage/upgrade, and verified sender domain. Record that evidence through
the service-only `record_reminder_free_capacity` RPC, bound to SHA-256 digests of
the exact API key and From address. Never place the key itself in SQL, logs or
this runbook. Reverify that independent evidence after an API-key, sender, account,
or billing-configuration change; it has no arbitrary daily expiry. Provider usage
expires after 10 minutes. The dispatcher refreshes account-wide sent **and received** usage
through the bounded read-only [Resend usage API](https://resend.com/docs/api-reference/usage/retrieve-usage).
Usage limits alone do not establish plan or billing settings. Unknown/stale
capacity, exhausted quota, readback errors and provider quota errors stop optional
mail and retain an operator reason. Exact provider-observed delivery IDs can
reconcile reservations without subtracting an aggregate estimate. Uncertain
attempts stay charged; an expired lease does not release capacity. Provider
aggregate counters do not prove that a particular receipt is included. Until
exact observed IDs are reconciled, the conservative path can count a potentially
sent email in both shared usage and outstanding reservations and stop below 60;
for example, 30 shared sends plus 30 unobserved reservations exhausts the product
headroom. The cap is a ceiling, not promised throughput. Do not erase uncertainty
or infer receipt inclusion just to fill the allowance.

Provider monthly usage may reset on the account's billing date rather than the
first UTC date of a calendar month. Monthly provider headroom therefore also
subtracts every unreleased, unobserved reservation from the last 31 days,
including the previous calendar month. Reservations exactly 31 days old expire
from this uncertainty horizon; exact provider-observed reservations are not
subtracted from shared usage a second time. This can conservatively retain
uncertainty from an earlier provider billing period and stop optional mail early.
Do not infer that period's start from the next reset timestamp. The product caps
remain 60 reservations per UTC day and 1,800 in a rolling 31 days.

### Read-only activation preflight and configuration changes

Before enabling delivery, invoke `dispatch-study-reminders` with the existing
dedicated `reminder_dispatcher` secret capability in the `apikey` header,
`Content-Type: application/json`, and this exact POST body:

```json
{"action":"capacity-check"}
```

The same named-secret authorization protects both actions. This action validates
the complete live configuration and performs only the bounded read-only Resend
usage request. It does not read or change the delivery switch, read recipients,
evaluate candidates, enroll anyone, create occurrences, reserve quota, attest
billing settings, or send mail. It works while delivery is disabled. Missing or
invalid configuration and unknown provider usage fail closed.

The response contains `mode: "capacity_check"`, admission mode, provider-wide
daily/monthly usage and validated limits (100/3,000), reset/observation timestamps,
the normalized sender domain, and the exact API-key/From-address SHA-256 digests
as hexadecimal strings. It contains no API key, recipient, From localpart,
unsubscribe secret or token. Compare the returned sender domain to the independently
verified domain and use the returned digests when recording the attestation.
Keep the key in Supabase; do not export it to inspect usage.

Independently inspect the current Resend team's actual Free transactional plan,
disabled paid overage, and verified sender domain in the dashboard, then record
that observation through `record_reminder_free_capacity`. Reverify after an API-key,
sender, account, or billing-configuration change. This evidence does not require a
daily renewal or a separate scheduled dashboard check. A successful preflight or
automatic usage refresh updates neither that independent evidence nor enrollment.
The live worker still requires fresh usage with the exact Free limits and stops
on unknown or exhausted capacity, provider errors, or changed key/sender binding.
A safe operator status query is:

```sql
select attested_at, verified_free, overage_disabled, sender_verified,
       observed_at, stop_reason
from private.reminder_free_capacity
where singleton;
```

If any dashboard setting or sender verification is unknown or fails the check,
disable delivery and retain the ledgers. Do not replace independent configuration
evidence with an inference from quota limits alone.

The live worker materializes its own occurrences; shadow evaluation is read-only
and consumes no real occurrence identity, enrollment, cooldown, history or quota.
Daily admission ranks all known timezone windows before due selection and rotates
by least recent admission/send, with stable owner-hash ties. Each tick claims at
most ten occurrences and has a bounded deadline. Repeated/overlapping ticks use
leases and the same delivery UUID. The final provider-begin fence rechecks current
accepted progress, enrollment, choices, recipient, suppression, switch and quota.
An unsubscribe after that fence can race with network I/O; an accepted email
cannot be recalled.

Retries retain the exact payload, normalized verified recipient digest, sender,
locale/template version and unsubscribe-key version under the original delivery
UUID. A changed recipient or payload stops that occurrence. Retry only before
both the one-hour occurrence cutoff and the conservative 23-hour provider retry
boundary. Afterward use signed callbacks or read-only receipt reconciliation;
never invent a fresh ID to force a late send. API accepted, delivered, bounced,
suppressed and ambiguous remain distinct outcomes. See [Resend idempotency](https://resend.com/docs/dashboard/emails/idempotency-keys).

## Separate future activation

Do not run these steps merely because this branch is deployed. Obtain explicit
send authorization and an exact canary recipient first, then verify the deployed
source/migrations, actual Free account/domain/billing settings, shared usage,
enrollment, and signed webhook/unsubscribe behavior. Initial canary mode requires
both the server UUID allowlist and exact normalized recipient allowlist. Public
mode is an explicit database admission mode plus server environment choice;
`internal_test` is never permission to send.

Server configuration includes the dedicated `reminder_dispatcher` capability,
`RESEND_API_KEY`, `REMINDER_FROM_ADDRESS`, `REMINDER_UNSUBSCRIBE_SECRET`,
`REMINDER_UNSUBSCRIBE_KEY_VERSION`, exact allowed app/unsubscribe URLs, and
`REMINDER_ADMISSION_MODE` (canary by default). Canary also requires
`REMINDER_LIVE_RECIPIENT_EMAIL`. Store secrets only in the existing secret stores.

Scheduler plumbing is inert: `private.invoke_reminder_dispatcher()` reads
`reminder_dispatcher_url` and `reminder_dispatcher_api_key` from Vault. Only the
database operator may call `configure_reminder_dispatch_schedule(boolean)`.
When explicitly activated it installs a five-minute Cron command containing only
the private function call; the secret is never embedded in `cron.job`. Its
migration never invokes the activation function. The dispatcher capability
cannot install its own schedule. See [Supabase Cron](https://supabase.com/docs/guides/cron).

The scheduler requires the installed `pg_net` extension and its `net.http_post`
transport. The transport migration installs the extension without enabling
delivery, creating a Cron job, or queuing a request. Schedule activation checks
transport availability before changing any prior job and fails closed with
`reminder_scheduler_transport_unavailable` when it is missing. Unscheduling
continues to work without the extension. Supabase manages `pg_net` object
privileges; project-level revokes do not isolate the request queue. Its queued
headers contain the dispatcher capability and are visible to database roles
with the extension's standard access. Keep `net` outside exposed Data API
schemas and review direct SQL login access before activation. The private
Vault-backed helper and schedule configuration remain operator-only. See
[Supabase pg_net](https://supabase.com/docs/guides/database/extensions/pg_net) and
[Supabase's pg_net privilege limitation](https://supabase.com/docs/guides/troubleshooting/revoking-access-to-pg_net-objects-has-no-effect-0bbc16).
After explicit activation, verify a completed Cron invocation and its matching
`net._http_response` row with HTTP 200 and no timeout or transport error. Retain
only redacted diagnostic fields; queued request headers contain the capability.

Rollback: disable delivery first, unschedule through the operator function,
expire/fence outstanding claims, retain unsubscribe/webhook services and ledgers,
and verify no further provider requests. Retain quota reservations and ambiguous
outcomes. A browser flag must never enable delivery implicitly.

## Local validation

Run the Node contracts/backend suite and frozen Deno checks. Run all reminder
pgTAP files listed in CI against an isolated database, including accepted-head,
free quota/fairness and inert scheduler tests. Generate shared threshold cases
with `node scripts/generate-reminder-policy-fixtures.mjs` and execute
`.cache/reminder-policy-fixtures.test.sql`. Browser acceptance covers both main
and retained production Settings, desktop/phone, all five locales, destination
handling and analytics-free unsubscribe. Fake providers and offline rendered
previews prove application behavior; they do not prove inbox delivery or actual
account billing settings. Keep real canary evidence separate.

Three disposable-database diagnostic scripts exercise the complete dispatcher with
an injected fake provider and two actual concurrent PostgreSQL workers:
`scripts/diagnostics/test-reminder-e2e.mjs`,
`scripts/diagnostics/test-reminder-quota-concurrency.mjs`, and
`scripts/diagnostics/test-reminder-unsubscribe-concurrency.mjs`. They require an empty
local `supabase_db_...` container named by `REMINDER_TEST_DATABASE_CONTAINER`;
the real provider is never invoked. CI runs all three after the pgTAP suites.

The active signed-in authentication-trial route uses the shared 10-Study-XP
policy. The retained accountless production experience keeps its historical raw
points timeline; legacy accepted heads without credited Study facts qualify for
no streak email. Do not convert old raw activity into retroactive XP. Discovery
can still use accepted settings. Both browser source routes retain the same
preference/enrollment controls and preserve already credited facts.


> **Historical archive: do not execute the procedures below as the current
> activation runbook.** These sections preserve pre-#521 account canary procedures
> and receipts, including the settings and implementation status observed then.
> Their rollout, paused-state, worker, retry and scheduler statements are not
> current configuration evidence. Use [Separate future activation](#separate-future-activation)
> and [Free capacity and dispatch](#free-capacity-and-dispatch) above for current
> operations, then verify the actual deployed source and server controls.

<a id="authentication-canary-preflight-and-activation"></a>

## Historical: Authentication canary preflight and activation

This archived authentication procedure does not authorize or configure #521
reminder delivery. The [current activation procedure](#separate-future-activation)
supersedes its rollout and reminder-state assumptions.

The authentication provider canary is separate from reminder delivery. It
must not change `reminder_delivery_enabled`, add a Cron schedule, broaden the
tester UUID allowlist, or enable a reminder recipient.

Before configuring any provider, prove the exact merged Pages SHA contains the
inert client capability and confirm these non-secret settings:

```text
EDENIA_ACCOUNT_FEATURES_ROLLOUT=internal
EDENIA_GOOGLE_SIGN_IN_MODE=off
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
3. Supabase email templates: install the reviewed
   `supabase/templates/confirmation.html` source into **Confirm signup** and
   `supabase/templates/magic_link.html` into **Magic Link**. Verify both render
   only the six-digit `{{ .Token }}`, contain no link or token hash, and expose
   no opaque project reference while CAPTCHA is still disabled. Preview all
   five bounded locale variants plus the multilingual legacy-account fallback.
4. Turnstile: create a Free widget restricted to `www.edenia.study` and the
   approved local host, deploy the public site key, verify explicit rendering
   and one-use token forwarding, then store the secret only in Supabase Auth.
5. CAPTCHA and GIS: enable CAPTCHA and immediately prove missing-token email
   rejection, valid-token email success, token replay rejection, official
   Google button sign-in, and same-device code verification. If email breaks,
   disable CAPTCHA before investigating.
6. Internal runtime: set Google mode to `id_token` without
   changing the account rollout from `internal`.

All messages during this canary go only to an already approved internal test
address. Never record the complete address, ID token, nonce, email code,
Turnstile token, session cookie, SMTP password, or provider secret in Git,
terminal output, PR text, or this runbook.

The switch-off rehearsal is also ordered: Google off, CAPTCHA off if required,
then account rollout off. At each stage ordinary study
must remain usable and the public root must remain accountless. Restore the
intended internal state only after the rehearsal passes.

### Historical link-flow canary evidence (2026-08-15)

This evidence records the retired magic-link and One Tap flow. It is retained
for audit history and is not the current acceptance procedure after issue #179.

- Provider setup completed on Free plans. The Supabase project remained Free;
  Resend's Free allowance was 3,000 transactional messages per month and 100
  per day; and the Free Turnstile widget allowed unlimited challenges. No paid
  feature or charge was enabled.
- Implementation repair PR #149 merged as `8a69ca8` after exact-head required
  `verify` run 31852621407 passed. Pages run 31853264898 deployed that exact
  merge. The duplicate Turnstile render warning is absent and a fresh hosted
  page contains one widget.
- A cross-device branded magic link signed in only the confirming browser. The
  requesting browser remained signed out, the fragment was absent after entry,
  the session survived browser recreation, and explicit sign-out survived a
  reload. The two browser profiles retained their separate 45-card and 40-card
  local study feeds.
- The approved address authenticated through Google and email as one Supabase
  UUID and one PostHog person. Live Auth retains one Google identity for this
  user even after a same-email magic-link sign-in, so current auth method must
  be derived from verified session `amr`, not from the retained provider list.
  Repair PR #150 passed exact-head `verify` run 31856369518, merged as
  `18dd46f`, and was deployed by Pages run 31856872515. A new cross-device
  magic-link canary then updated that one PostHog person to
  `auth_method=email`; the requesting browser stayed signed out, and the
  confirming browser was signed out again after verification.
- PostHog's default Persons view excludes the Internal tests cohort. Remove
  that exclusion before auditing the approved canary person; after doing so,
  searching the normalized approved address returned exactly one person.
- The switch-off rehearsal succeeded in order: One Tap off, Google legacy,
  and the global account rollout off. Ordinary study remained available at
  each stage. The internal state was restored in Pages run 31854276819 with
  account rollout `internal`, Google `id_token`, and One Tap enabled.
- GitHub Pages serves `config.local.js` with a ten-minute browser cache. Use
  the exact workflow source SHA plus a cache-busted configuration fetch when
  verifying a switch change; an already-open tab can otherwise display the
  preceding state temporarily.
- PR #152 removed the forced anonymous-CORS request from the GIS classic
  script and enabled Google's ITP support. Exact head `f77e2e9` passed required
  `verify` run 31859092136, merged as `3c1a443`, and was deployed by Pages run
  31859597726. Google's official button then rendered in both Chrome and Safari.
- The first real button credential exposed a separate nonce-representation
  mismatch: Edenia sent Google a Base64URL digest while Supabase expected the
  lowercase hexadecimal SHA-256 digest. PR #153 changed only that representation,
  passed exact-head `verify` run 31860058903, merged as `8abccf4`, and was deployed
  by exact Pages run 31860487920. A hosted Chrome identity chooser then completed
  without top-level Supabase navigation, and the Auth server recorded a clean
  status-200 `id_token` exchange.
- The final hosted One Tap canary passed on exact deployment `8abccf4`. A fresh
  eligible Chrome lifecycle visibly displayed Google's browser-owned identity
  prompt only after onboarding and walkthrough resolution; native dismissal left
  Edenia usable and signed out. A separate eligible Chromium profile then signed
  in automatically without a manual-button click, with a matching status-200
  Supabase `id_token` exchange. Its 40-card local feed remained present through
  automatic sign-in and explicit sign-out. Safari's ITP experience was not used
  as automatic-sign-in evidence.
- Evidence closeout PR #151 exact head `d643992` passed required `verify` run
  31861852918, merged through protection as `600121b`, and was deployed by exact
  Pages run 31862379844. The authentication internal-canary work item is complete.

One earlier canary inspection exposed a one-time magic-link capability in
ephemeral tool output. It was immediately consumed by the intended
confirmation and is no longer usable. No durable credential was exposed. Do
not inspect or record future message bodies or links; transfer a capability
directly into the confirming browser without rendering it in logs or output.

<a id="internal-acceptance-test"></a>

## Historical: Internal acceptance test

This archived test checks the older preference-storage flow. Current reminder
activation also requires the disclosed authenticated **Enable emails** action
described in [Implemented policy](#implemented-policy).

Use a browser profile whose local Edenia progress can be inspected before and
after the test.

1. Export or record the current internal-test progress if it matters.
2. Open
   `https://www.edenia.study/?internal_test=1&account=1`.
3. Open **Settings**, then **Account**.
4. Use Google's official button and select an approved Google test user.
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

<a id="operator-preflight"></a>

## Historical: Operator preflight

Do not use the archived rollout values or paused-state assumptions below for
activation. Follow the [current activation procedure](#separate-future-activation)
and inspect current server controls.

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

<a id="manage-the-tester-allowlist"></a>

## Historical: Manage the tester allowlist

The examples below preserve the earlier manual procedure. The
[current activation procedure](#separate-future-activation) requires an explicitly
authorized exact recipient as well as its verified account UUID; an allowlist row
alone is insufficient.

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

<a id="invoke-the-manual-dispatcher"></a>

## Historical: Invoke the manual dispatcher

This archived request/response contract may differ from the deployed handler.
Use the [current activation procedure](#separate-future-activation) and current
source before invoking the dispatcher. Never enable delivery merely to test
configuration or key access.

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

Normal dispatch accepts only `POST`, `Content-Type: application/json`, and the
exact body `{}`. The separate read-only preflight accepts only
`{"action":"capacity-check"}` as described above. Do not add caller-controlled
batch, time-window, lease, or switch values.

Dry-run logs may contain Supabase user UUIDs and occurrence IDs. Treat those
logs as internal operational data. They must not contain email addresses,
session tokens, secret keys, or claim fencing tokens.

<a id="live-dispatch-canary-configuration"></a>

## Historical: Live-dispatch canary configuration

The seven-setting, five-claim, fifteen-minute procedure below predates #521.
Its token-only binding description is also superseded. Use the current
[activation configuration](#separate-future-activation) and
[dispatch and retry policy](#free-capacity-and-dispatch).

At the time of this canary, the deployed function contained a fail-closed live
path and production had these Edge Function secrets or settings:

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

<a id="emergency-stop-and-rollback"></a>

## Historical: Emergency stop and rollback

The archived statements below that the worker is pending and no schedule exists
are not current evidence. Use the [current rollback procedure](#separate-future-activation),
including disabling delivery and unscheduling through the operator function.

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

<a id="provider-hand-off-and-retry-invariants"></a>

## Historical: Provider hand-off and retry invariants

This archived implementation description predates #521's frozen payload binding,
durable retry scheduling and one-hour occurrence cutoff. The
[current dispatch policy](#free-capacity-and-dispatch) supersedes the older
23-hour-only retry instructions and paused-state claims below.

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

<a id="provider-event-invariants"></a>

## Historical: Provider event invariants

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

<a id="verify-the-provider-webhook"></a>

## Historical: Verify the provider webhook

These archived checks are not a current deployment receipt. Verify the deployed
handler and configuration under the [current activation procedure](#separate-future-activation).

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

<a id="suppression-and-unsubscribe-invariants"></a>

## Historical: Suppression and unsubscribe invariants

The [current enrollment policy](#implemented-policy) supersedes this older
description: ordinary unsubscribe revokes both enrollments, and a verified owner
may deliberately enroll again; hard suppressions remain effective.

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

<a id="verify-the-inert-unsubscribe-endpoint"></a>

## Historical: Verify the inert unsubscribe endpoint

This archived procedure does not establish current delivery or suppression
state. Use disposable local fixtures for mutation tests and the
[current activation procedure](#separate-future-activation) for hosted verification.

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

<a id="known-verification-gaps"></a>

## Historical: Known verification gaps

- The deployed dispatcher rejects unauthenticated production requests. Repeat
  a positive hosted invocation after every named-key rotation before creating
  any schedule.
- Production Google ID-token sign-in has been exercised with one approved
  Google test account in one desktop browser. Cross-device, private-window,
  Safari, mobile, and a second-account switch still need acceptance coverage.
- The Google Cloud consent screen remains restricted to test users. That is
  suitable for internal testing, not public launch.
- Google's official button exposes no supported popup-cancellation callback.
  The product owner accepted the platform exception on 2026-08-27: closing the
  provider UI safely leaves Edenia signed out with the authentication surface
  available for retry and no fabricated cancellation feedback. Revisit this
  only if GIS adds an explicit supported cancellation result; do not infer it
  from focus, popup polling, or timeout heuristics.
- A sanitized hosted Supabase Auth canary on 2026-08-27, bound to deployed
  commit `20ea9d049deed41fa98e6e39be86710fdd8a21e1`, confirmed that missing,
  invalid, replayed, and expired CAPTCHA tokens are rejected; one fresh token
  produced exactly one delivery; and its six-digit code verified successfully.
  The evidence records no email address, CAPTCHA token, verification code,
  session, API URL/key, provider secret, or raw provider response.
- Resend transport, the verified sender domain, and real signed production
  callbacks have been observed. A genuine tagged reminder, one-click
  unsubscribe, bounce, complaint, and provider-suppression event have not yet
  been exercised in production.
- The five reminder locales and confirmation pages have automated structural
  coverage, but their copy has not yet been reviewed by native speakers or
  exercised across real email clients.

<a id="gates-before-any-live-email"></a>

## Historical: Gates before any live email

The list below records the earlier release gates. It is not a current readiness
receipt or an instruction to bypass the [current activation procedure](#separate-future-activation),
including Free-account evidence, owner enrollment and natural eligibility.

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

<a id="revised-implementation-sequence"></a>

## Historical: Revised implementation sequence

The implementation states below describe their historical stages, not the
current deployed worker. Follow the [current activation procedure](#separate-future-activation)
for any separately authorized sending or scheduling.

The original live-delivery PR is split so each safety boundary can be reviewed
without an active sender:

1. **Provider-neutral ledger (status at this stage):** add durable provider-attempt,
   acceptance, failure, and ambiguity state plus the 23-hour retry boundary.
   No network path exists.
2. **Unreachable Resend adapter (status at this stage):** lock the deterministic request,
   privacy, timeout, idempotency, error, and unsubscribe-header contracts in a
   pure shared module. The deployed dispatcher does not import it.
3. **Live database prerequisites (status at this stage):** require the current claim token
   when storing a capability and provide one truthful `recipient_unavailable`
   terminal outcome before any provider request. No sender imports the adapter.
4. **Fail-closed live orchestration (status at this stage):** the adapter is wired behind
   strict configuration checks and immediate switch, allowlist, consent,
   suppression, and lease fences. Missing configuration or any failed fence
   results in zero provider calls. No credential or schedule is added.
5. **Provider event ledger (status at this stage):** persist no provider payload or address,
   deduplicate `svix-id`, reconcile acceptance races, and atomically suppress
   bounce, complaint, and provider-suppressed recipients.
6. **Verified webhook endpoint (status at this stage):** verify raw-body Svix signatures,
   require the fixed source and delivery tags, pass only bounded metadata to
   the event RPC, and acknowledge unsupported or untagged events without a
   database mutation.
7. **Canary readiness (status at this stage):** the isolated sending subdomain, send-only
   key, exact-recipient allowlist, From address, unsubscribe secret, and signed
   webhook are configured. A transport-only message and callbacks succeeded.
8. **Manual allowlisted canary:** only when one genuine due occurrence exists,
   enable the switch briefly, send to the one verified tester, inspect the
   provider and suppression ledgers, then turn the switch off again. Never
   manufacture study activity or queue state to force this test.
9. **Scheduling:** create Cron only after repeated manual canaries and an
   operator rollback drill. Public rollout remains a separate later decision.

<a id="public-readiness-audit-2026-08-12"></a>

## Historical: Public-readiness audit (2026-08-12)

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
  requests per IP per five minutes, and 30 email-code verifications per IP per
  five minutes. CAPTCHA is disabled.
- The client uses only Google ID-token exchange and email codes. It does not
  offer passwords, anonymous sign-in, or manual identity linking.

Do not raise the email limit or enable CAPTCHA as a standalone console change.
Both Auth code templates, the client CAPTCHA token path, error states,
accessibility, and recovery behavior must be verified together before either
change. The current two-email limit is a useful internal-stage brake, but it
also means the fallback can be exhausted quickly during testing.

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
offered, test the same verified address through Google's official button and
an email code, different addresses across providers, an existing Plus account,
and unlink/recovery behavior. Do not infer account equivalence from an email
address in application code.

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

<a id="public-readiness-items-still-deferred"></a>

## Historical: Public-readiness items still deferred

- Subscription-aware account deletion, retention choices, and recovery after
  partial deletion.
- Email-change and identity-linking behavior across Google, email OTP and
  existing Plus accounts.
- A deliberate email-code rate-limit decision beyond the current browser
  cooldown and provider quotas.
- Google consent-screen publication, branding, privacy/terms URLs and domain
  verification outside the repository.

Supabase database advisors should be recorded after each schema change. An INFO
notice that a private, grant-revoked table has RLS but no policies is intentional
deny-all behavior. Other warnings must be triaged separately rather than hidden
inside an unrelated reminder PR.
