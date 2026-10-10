# Learner profile retention and disaster recovery

During the internal Auth experiment pause, weekly external dumps and 35-day
retention remain enabled. Restore rehearsal and guarded retention steps require
`EDENIA_AUTH_EXPERIMENT_ENABLED=true`; they are paused independently of backup
creation. Server profile cleanup is disabled. See
[the pause record](auth-operations.md#internal-experiment-pause-2026-09-27).


This runbook covers the operator boundary for signed-in learner profiles. The
browser does not call these private maintenance functions.

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
writes try a separate localStorage record, then sessionStorage, then memory for
the current tab. This does not change account authentication or cloud resolution.
An unreadable signed-in profile is reopened from the verified owner's cloud
profile; an arbitrary local backup is never relabelled as that owner's profile.

Memory recovery compares newly observed local and session copies before writing.
Compatible changes rebase against the last acknowledged copy; incompatible
ownership, generation, or replacement scopes remain protected separately. Each
intentional replacement has its own fence. Pending conflict candidates persist
inside the workspace and reopen after reload, with a fresh choice fence after
startup bookkeeping. A choice can continue in memory while durable writes are
unavailable; both candidates persist when a later save succeeds. Later recovery
episodes retain earlier protected versions, and a newer archived copy takes
precedence over a stale active fallback.

The recovery workspace is `<mode-specific storage key>_recovery_workspace_v1`.
An active workspace resumes on reload. Focus, connectivity restoration and a
one-minute timer attempt reconciliation without a storage-error screen.
Accountless progress uses a three-way comparison against the acknowledged
baseline. Compatible changes merge automatically; competing changes show
"Recent progress" and "Saved progress" with study-detail comparisons. Choices
and automatic promotion retain both copies in the archived workspace.
Intentional replacements require a choice if old progress changed meanwhile.
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
