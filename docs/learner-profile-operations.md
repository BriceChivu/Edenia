# Learner profile retention and disaster recovery

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

The scheduled workflow extracts the artifact, verifies `SHA256SUMS`, starts a
fresh local Supabase database, applies `schema.sql` and `data.sql`, and checks
only aggregate profile-head and profile-version counts. A failed rehearsal
fails the workflow while the uploaded artifact remains available for the
operator. The workflow pins Supabase CLI `2.116.0` so the isolated Auth and
Storage schemas match the hosted dump format exercised by this rehearsal.

For a manual rehearsal, install that Supabase CLI version plus `psql` and `jq`,
download one artifact from the Actions run, and run:

```sh
restore_dir="${TMPDIR:-/tmp}/edenia-restore"
mkdir -p "$restore_dir"
tar -xzf edenia-database-backup.tar.gz -C "$restore_dir"
(
  cd "$restore_dir"
  sha256sum -c SHA256SUMS
)
supabase start > /dev/null 2>&1
restore_db_url="$(
  supabase status -o json 2>/dev/null |
    jq -er '.DB_URL
      | select(test("^postgres(?:ql)?://postgres:"))
      | sub("://postgres:"; "://supabase_admin:")'
)"
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
supabase stop --no-backup > /dev/null 2>&1 || true
```

The archive name in the example is intentionally generic. Replace it with the
downloaded artifact path. Do not open the SQL files in a terminal or paste
their contents into a ticket. The rehearsal proves that the external logical
copy can initialize an isolated project; it does not modify the production
Supabase project. The derived URL selects the isolated database's local
`supabase_admin` role because a complete data dump contains managed Auth and
Storage tables that the ordinary local `postgres` role cannot restore. The URL
is held only in a shell variable and must never be printed.
