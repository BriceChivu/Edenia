# Learner profile retention and disaster recovery

The September 27 experiment pause is historical; see [the pause record](auth-operations.md#internal-experiment-pause-2026-09-27). [PR #422](https://github.com/BriceChivu/Edenia/pull/422) restored bounded Free-tier retention during the restricted trial. Verify the live maintenance and rollout configuration before changing operator settings.

This runbook covers the operator boundary for signed-in learner profiles. The browser does not call private maintenance functions.

## Restricted-trial device handoff

Apply `20261012132414_bounded_profile_handoff.sql` before serving the revised frontend. The new protocol is enabled only through the existing authentication trial (`internal_test=1` with trial admission). It adds owner-scoped receipt inspection and conditional handoff commits. Retained production shares the adapter with pinned serializers and its previous client cadence; existing clients retain their original API. The revised coalescing and server budget apply to the current trial. This migration does not enable mandatory public accounts.

Ordinary uploads remain coalesced at 30 seconds. When a session hides, the browser first waits for pending local saves and attempts one final cloud upload. The server permits at most one **early** session flush per current owner/profile allowance in five minutes, serializing the allowance across devices. A normally eligible upload consumes no early-flush allowance. Server deferrals persist in the local outbox and cannot be bypassed by repeated hiding, focus, reload or explicit retry. Local changes keep accumulating while delivery waits. Acknowledgements start the next ordinary coalescing interval; queued or later animal-only movement does not cause another full-profile upload. Only locally completed saves enter the trial outbox.

Return checks use visibility restoration, back/forward restoration, focus and reconnect. Before a trial upload, the client checks the current owner head. Exact accepted receipts repair lost acknowledgements without replaying an old profile. Compatible pending changes combine from a verified base within the same owner, profile and generation. Dated playback observations keep resume positions paired with their timestamps; ambiguous or tied observations retain the protected choice. Imports, restores, Undo and explicit conflict choices establish a durable replacement boundary. Generation changes fence older pending work.

The existing outbox holds the upload candidate. Its sparse before-value journal is capped at 128 KiB and 2,048 entries. A second bounded before-value journal bridges the crash window between installing a reconciled IndexedDB profile and updating the outbox; it contains no additional full profile. Unsupported, corrupt or oversized evidence retains the protected resolver. Godot declares ambient animal arrays; Edenia transports that declaration while comparing other island fields.

Browser suspension can prevent completion of any final network request. Keep local durability and deferred reconciliation as the recovery path; do not promise that an offline or immediately suspended phone has already delivered its last save to the cloud.

For rollout acceptance, run `tests/e2e/profile-handoff.spec.mjs` on Chromium and WebKit, the profile contract suites, and `supabase/tests/learner_profile_handoff.test.sql`. Then check a physical Pixel 7a with Chrome: leave both tabs open, study on the phone and immediately lock it, study on the computer, then unlock the phone. Repeat with a slow connection, offline phone, a lost acknowledgement and studying the same video. Confirm both sessions' study remains, no compatible handoff prompts appear, and pending delivery eventually reaches Up to date. Automated lifecycle suspension does not substitute for this hardware check. For issue #450, ADB did not detect the connected phone, and the user explicitly accepted completion without it; the physical lock-button check remains unverified.

## What the maintenance job protects

The database keeps the current head and up to eight eligible ordinary recovery
versions for each profile lineage. Conflict, import, Start over, and recovery
records keep their referenced versions for at least 30 days. Open conflicts stay
protected until the learner resolves them. Cleanup removes only expired
protection records and the oldest ordinary versions beyond the configured cap.

The job never prunes `learner_profile_write_receipts` or
`learner_profile_accountless_migration_receipts`. It does not delete a current
head, a protected version, or a profile's study contents. The maintenance
function locks the profile tables while it selects and deletes candidates, so a
concurrent profile write waits for a complete dry run or apply operation.

## Cloud-save validation performance

Profile acceptance keeps the existing canonical bytes, byte-length limit, SHA-256
integrity, schema and study-fact checks. Recursive serialization handles scalar
values directly, and validation reuses one canonical profile traversal for both
the full-envelope byte length and the integrity payload. Stored profiles and
operation receipts retain their byte format; no profile rewrite is required.

Use `scripts/diagnostics/cloud-profile-save.mjs` against an isolated local
Supabase Docker database with current migrations. It generates a 1.74 MB profile,
measures validation, serialization, an authenticated commit and its exact retry,
and verifies the complete saved envelope, revision, retained predecessor and
receipt count. Fixture writes and optional baseline function definitions roll
back together. The default 500 ms commit budget is a local diagnostic threshold,
not a production latency guarantee or a CI wall-clock gate.

```sh
node scripts/diagnostics/cloud-profile-save.mjs \
  --container=supabase_db_edenia-cloud-save-perf --docker-context=colima
```

Add `--baseline-ref=763670ddd37e03a7acc53e1a0c8c573c213d7af9` to compare the
pre-optimization functions on the same input and database. The baseline is
expected to exceed the diagnostic budget. Use `--max-ms` to set an explicit budget
for a different local machine, and keep its value identical for both runs.

## Capacity gate

The initial policy records the current Free database limit as 500 MiB, warns at
70%, and pauses cleanup at 85%. These are Edenia operating thresholds, not a
promise that a different Supabase plan has the same limit. Supabase documents
the current Free database-size limit and read-only behavior in its
[database-size guide](https://supabase.com/docs/guides/platform/database-size)
and recommends regular off-site `db dump` exports for Free projects in its
[backup guide](https://supabase.com/docs/guides/platform/backups).

Run the following with the database URL held in an environment variable. Never
paste the URL into a shell transcript or issue comment.

First record the plan and the pause/restore review. Use the exact limit shown
for the current Supabase plan. This resets cleanup to off whenever the policy
changes:

```sh
psql "$SUPABASE_DB_URL" -c \
  "select * from private.record_learner_profile_capacity_policy('Free', 524288000, 'read-only at the database limit', 'dashboard restore required after a pause');"
```

The pause and restore arguments record the constraints confirmed in the
Supabase dashboard. The policy record expires after seven days, just like the
capacity evidence.

```sh
psql "$SUPABASE_DB_URL" -c \
  "select * from private.record_learner_profile_capacity_check();"
```

The result contains only database size, profile counts, payload-size
percentiles, projected protected-version cost, relation sizes, thresholds, and the
read-only flag. It does not return a profile, email address, UUID, token, or
credential. Review the result before enabling cleanup. The policy call records
the plan limit and pause/restore review timestamp; the capacity check records
the current aggregate usage and profile-size evidence.

Enable the guarded apply path only after that review:

```sh
psql "$SUPABASE_DB_URL" -c \
  "select * from private.set_learner_profile_cleanup_enabled(true);"
```

If the project is read-only, paused, above the pause threshold, or the evidence
is older than seven days, this call returns `not_enabled`. Restore the project
from the Supabase dashboard, verify that it accepts writes again, record a new
capacity check, and retry the enablement call. Do not run cleanup against a
read-only database.

The scheduled job records a fresh check, creates the external dump, and calls:

```sql
select * from private.run_learner_profile_maintenance(null, true);
```

With cleanup disabled or evidence stale, this is a report-only operation. A
warning emits an aggregate GitHub Actions warning. A pause threshold fails the
job without deleting anything.

## Weekly external dump

Configure the private repository secret `SUPABASE_DB_URL` with the percent-
encoded Postgres connection URL. The workflow
`.github/workflows/learner-profile-disaster-backup.yml` runs every Sunday and
can also be started manually. It creates a schema dump, a data dump, a checksum
file, and a compressed GitHub Actions artifact retained for 35 days. The
artifact is the external copy. Keep Actions artifacts restricted to repository
operators because the data dump contains account and study data.

The checksum manifest uses archive-relative names, so it continues to verify
after the artifact is downloaded into a different directory. The data dump
includes Auth and Supabase-managed database records in addition to Edenia's
schemas. Supabase Storage objects themselves are not database rows and require
their own recovery process if Edenia starts using Storage.

The workflow never prints the dump, a connection URL, or a row-level query. Its
capacity alert contains only an aggregate status. The local restore commands
also suppress the local Supabase startup output, which includes development
credentials.

## Restore rehearsal

The scheduled workflow extracts the artifact, verifies `SHA256SUMS`, initializes
a temporary Supabase project with no Edenia migrations, starts Postgres and Auth
to apply managed Auth migrations, stops Auth, applies `schema.sql` and `data.sql`, and checks only aggregate
profile-head and profile-version counts. A failed rehearsal fails the workflow
while the uploaded artifact remains available for the operator. The workflow
pins Supabase CLI `2.120.0` so the isolated Auth and Storage schemas match the
hosted dump format exercised by this rehearsal.

For a manual rehearsal, install that Supabase CLI version plus `psql` and `jq`,
download one artifact from the Actions run, and run:

```sh
set -euo pipefail

restore_dir="${TMPDIR:-/tmp}/edenia-restore"
restore_project="$(mktemp -d "${TMPDIR:-/tmp}/edenia-restore-project.XXXXXX")"
cleanup_restore() {
  supabase stop --workdir "$restore_project" --no-backup > /dev/null 2>&1 || true
}
trap cleanup_restore EXIT

mkdir -p "$restore_dir"
tar -xzf edenia-database-backup.tar.gz -C "$restore_dir"
(
  cd "$restore_dir"
  sha256sum -c SHA256SUMS
)
supabase init --workdir "$restore_project" > /dev/null
restore_project="$(cd "$restore_project" && pwd -P)"
supabase start \
  --workdir "$restore_project" \
  --exclude realtime,storage-api,imgproxy,kong,mailpit,postgrest,postgres-meta,studio,edge-runtime,logflare,vector,supavisor \
  > /dev/null 2>&1
restore_db_url="$(
  supabase status --workdir "$restore_project" -o json 2>/dev/null |
    jq -er '.DB_URL
      | select(test("^postgres(?:ql)?://postgres:"))
      | sub("://postgres:"; "://supabase_admin:")'
)"
restore_auth_container="$(docker ps \
  --filter "label=com.supabase.cli.workdir=$restore_project" \
  --filter 'name=supabase_auth_' --format '{{.ID}}')"
[[ "$restore_auth_container" =~ ^[a-f0-9]+$ ]]
docker stop "$restore_auth_container" > /dev/null
test "$(psql "$restore_db_url" -At --variable ON_ERROR_STOP=1 \
  --command "select to_regclass('auth.mfa_recovery_code_sets') is not null;")" = 't'
psql "$restore_db_url" \
  --single-transaction \
  --variable ON_ERROR_STOP=1 \
  --file "$restore_dir/schema.sql" \
  --command 'SET session_replication_role = replica' \
  --file "$restore_dir/data.sql" \
  > /dev/null
psql "$restore_db_url" \
  --csv \
  --variable ON_ERROR_STOP=1 \
  --command "select count(*) as profile_heads, (select count(*) from public.learner_profile_versions) as profile_versions from public.learner_profile_heads;"
unset restore_db_url
cleanup_restore
trap - EXIT
```

The archive name in the example is intentionally generic. Replace it with the
downloaded artifact path. Do not open the SQL files in a terminal or paste
their contents into a ticket. The rehearsal proves that the external logical
copy can initialize an isolated project; it does not modify the production
Supabase project. The derived URL selects the isolated database's local
`supabase_admin` role because a complete data dump contains managed Auth and
Storage tables that the ordinary local `postgres` role cannot restore. The URL
is held only in a shell variable and must never be printed. Starting only
Postgres and briefly Auth avoids depending on unrelated local API, Studio or
Storage services. Auth performs its own managed schema migrations before it is
stopped; it must not run against restored identities and sessions. The explicit
recovery-code-table check catches the schema gap that prevented the October 4
archive from restoring with CLI 2.116.0. This is a local rehearsal, not a provider
sign-in or a production restore.

### Background browser storage recovery

When the durable browser profile cannot open or an actual save fails, the app
continues through a separate recovery workspace. It preserves the original
profile, ownership record and immutable cloud operation ledger. Recovery
writes try a separate localStorage record, then sessionStorage. If these stores
cannot retain the full workspace, the app uses a separate IndexedDB recovery
journal when available. Only a failure of all durable stores leaves progress in
memory for the current tab. This does not change account authentication or cloud resolution.
An unreadable signed-in profile is reopened from the verified owner's cloud
profile; an arbitrary local backup is never relabelled as that owner's profile.

Memory recovery compares newly observed local and session copies before writing.
Compatible changes rebase against the last acknowledged copy; incompatible
ownership, generation, or replacement scopes remain protected separately. Each
intentional replacement has its own fence. Pending conflict candidates persist
inside the workspace and reopen after reload, with a fresh choice fence after
startup bookkeeping. Background bookkeeping keeps an existing selection when
the compared progress copies are unchanged. If the original saved version changes while its comparison
is open, the comparison refreshes instead of repeating an unverifiable choice.
Previously shown original versions remain in `protectedOriginalProfiles`. If
primary storage fails during confirmation, the choice is retained locally and
the learner continues. Later promotion checks ownership and the exact saved
version again; an intervening version requires a fresh comparison. A choice can
continue in memory while durable writes are unavailable; both candidates persist
when a later save succeeds. Failures of the recovery copy itself also submit
automatic diagnostics, including when quota forces a session or memory fallback.
An import that activates recovery retains its acknowledged revision for ordinary
UI updates instead of opening an unbased conflict against its own saved copy.
Later recovery episodes retain earlier protected versions, and a newer archived copy takes
precedence over a stale active fallback.

The Web Storage recovery workspace is `<mode-specific storage key>_recovery_workspace_v1`.
The IndexedDB journal is `edenia_profile_recovery_v1`; its `heads` store uses the
mode-specific storage key as its namespace. `candidates` retains stale writers
whose transaction could not advance the head. A later transaction retires only
the candidates incorporated into its protected workspace. On startup, compatible
native and journal edits merge, and interrupted competing candidates reopen a
progress choice. Archive writes require transaction completion and readback
before promotion. Edits made during asynchronous archive completion keep the
workspace active. Journal failures use the existing automatic diagnostic path.
A closed recovery connection is discarded and reopened once when a transaction
cannot start (`InvalidStateError`). The reopened transaction checks the head and
ownership fence again. A transaction that times out is aborted and its connection
discarded; it is not replayed, because its commit outcome may be uncertain. The
next attempt uses a fresh connection and retains conflicting candidates.
An active workspace resumes on reload. Focus, connectivity restoration and a
one-minute timer attempt reconciliation without a storage-error screen.
Accountless progress uses a three-way comparison against the acknowledged
baseline. Compatible changes merge automatically; competing changes show
"Recent progress" and "Saved progress" with study-detail comparisons. Choices
and automatic promotion retain both copies in the archived workspace.
Intentional replacements require a choice if old progress changed meanwhile.
Independent additions to the activity log merge by immutable entry ID, retaining
the normal history limits. Editing, clearing or reordering existing history is
still a conflict. This prevents starter-feed preparation and ordinary automatic
feed refreshes from rejecting an otherwise compatible learner save solely because
both operations appended a log. Browser regressions exercise both paths with a
simultaneous study save and verify that study facts, fetched videos and both log
entries survive reload.
Automatic study-summary observations use the same per-key history merge in the
island and retained town bundles. Different observation times must not reject an
otherwise compatible study or preference change.
Independent initialization of a missing Anki-disabled timestamp retains the
earliest observation; concurrent edits to an existing timestamp remain a conflict.
Signed-in progress first passes existing verified cloud replay, conflict and
generation checks. Original ownership or reset-generation changes prevent local
promotion. Exact metadata, workspace and IndexedDB revision checks cancel a
promotion when another operation changes its inputs. Interrupted promotion
keeps its acknowledged profile and metadata so a later opening can finish.
The existing localStorage metadata fence is not a transaction across tabs.

Every new storage incident automatically submits a sanitized JSON diagnostic as
`feedback_submitted`, source `automatic_storage_recovery`, to the existing
**Edenia Feedback → Discord** PostHog destination. This path runs on both
`edenia.study` and `www.edenia.study`, including the internal sign-in trial where
product analytics is disabled. It does not depend on the analytics SDK. Reports
include the stable error category, affected operation, release, runtime mode,
recovery storage tier, browser/OS versions, capabilities and viewport. They
exclude exception payloads, learner progress, account identifiers, credentials,
URL parameters and replay links. No Discord webhook secret is shipped.

Failed deliveries retain up to 20 sanitized reports per available browser store
and retry after reload, on connectivity restoration and while the page remains
online. Each report has its own storage key, so different tabs cannot replace
each other's pending reports or erase them when one report succeeds. Legacy
array outboxes migrate only after verified copying; quota pressure preserves the
uncopied legacy reports. Invalid queue entries cannot suppress valid ones.
Retries keep the original event UUID. The UI does not ask the learner to
copy or submit diagnostics. If every durable browser store is blocked, memory
can keep the current tab usable; it cannot survive closing that tab. Signed-in
cloud synchronization still uses its ordinary verified account path.


Recovery reports include a random `incidentId` stored with the recovery workspace.
It stays the same across reloads and links failures to a `storage-recovered`
completion after verified promotion. Event UUIDs still identify individual
reports and remain stable on delivery retries. Completions use category `other`
and the message heading "Storage recovery completed". The incident ID is not
part of portable learner progress. Storage errors include bounded `storageTarget`
and `phase` fields at the failing database or transaction boundary; arbitrary
exception text remains excluded.

Synthetic recovery checks must explicitly set `window.EDENIA_CONFIG.storageRecoveryTestRunId`
to a short run identifier before app initialization. Only letters, digits, dots,
underscores and hyphens are accepted (maximum 80 characters). These messages
begin `[TEST: <run identifier>]`, with `storage_recovery_is_test: true` and
`storage_recovery_test_run_id` on the event. Their persisted workspace and outbox
retain the original marker through reload and delivery retries. Runtime mode
(`auth-trial`, `tiny-swords-test`, `public`) alone never establishes test provenance.
Do not set this option in the shared production runtime configuration. Ordinary
incidents have `storage_recovery_is_test: false`; older unmarked reports require
a matching injection receipt before classifying them as tests.
