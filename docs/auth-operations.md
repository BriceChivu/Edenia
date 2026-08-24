# Auth and profile incident operations

This runbook covers the production Auth probe, serious learner-profile recovery,
and the bounded response when Edenia gains actual knowledge that a learner is
under 13. It is an operator procedure, not a browser feature. Never paste a
database URL, publishable key, session value, email address, or profile
envelope into a command, issue, chat, or log.

## Auth health monitoring

`.github/workflows/auth-health-monitor.yml` runs every five minutes and can be
run manually before a release. It calls the Supabase Auth health endpoint at
`/auth/v1/health`. The probe records only this bounded result in the private
database table:

Configure repository variable `SUPABASE_URL`, repository variable
`SUPABASE_PUBLISHABLE_KEY`, and secret `SUPABASE_DB_URL` before enabling the
workflow. A missing value fails the check without attempting a probe.

| Result | Meaning | Alert effect |
| --- | --- | --- |
| `available` | Auth returned a 2xx response | Clears consecutive provider failures |
| `expected_client_error` | Auth returned a 4xx response | Proves the endpoint answered; no outage alert |
| `provider_unavailable` | Auth returned a 5xx response | Adds one outage failure |
| `network_error` | The request timed out or could not connect | Adds one outage failure |

Three consecutive provider or network failures open the aggregate alert. A
fresh successful response closes it. The workflow emits a failed run with the
next action in its annotation. A stale probe older than ten minutes is not
healthy, even if its last recorded result was good.

Before mandatory-account launch, configure GitHub notifications for this
workflow and run it manually once. Confirm that a deliberately recorded
expected client error does not page the operator and that a three-sample
provider failure opens the alert. Do not use a real sign-in request as a
synthetic probe.

## Serious profile recovery

Recovery starts with the server profile-data gate. Do this before listing or
inspecting any candidate. The gate remains `off` until the fresh-browser check
at the end of this procedure passes.

1. Create an incident ID and write down the exact deployed lowercase commit
   SHA. Read the non-secret runtime values from the deployment without copying
   credentials. Confirm the target UUID aloud or in the private operator
   record. The confirmation must be exactly `RECOVER <target UUID>`.
2. Run `private.begin_learner_profile_recovery` with the incident kind
   `profile-recovery`, the target UUID, the exact commit, the four runtime gate
   values, and the observed session status. The function locks the server gate
   row, records its previous state, and sets `rollout_state` to `off` before it
   returns.
3. Record the returned incident ID, previous gate state, new gate state, commit,
   and start time. Do not record a profile document or Auth response.
4. Call `private.list_learner_profile_operator_candidates` for the incident.
   Select a known-good version from its `profile_id`, `generation`, `revision`,
   `payload_sha256`, `payload_bytes`, `created_at`, and current-head marker.
   These fields are enough to compare candidates. Do not query or print an
   envelope.
5. Confirm the selected version exactly as `RESTORE <version ID>`. Call
   `private.restore_learner_profile_from_operator_candidate` with a new
   operation ID. The operation validates the stored envelope and integrity
   metadata, writes a new revision through the protected recovery ledger, and
   protects the displaced head for at least 30 days. It never patches a head,
   deletes a write receipt, or removes a candidate to force a retry.
6. Keep the server gate off. Open a fresh browser with the exact deployed
   commit, authenticate as the confirmed owner, and verify that the resulting
   current head has the returned profile ID, generation, revision, integrity
   digest, byte count, and update time. Verify that an unrelated owner sees no
   change. This is the fresh-browser verification exercise, not a check of an
   existing cached tab.
7. Record whether issued sessions remained valid, were rejected, or were
   revoked. If sessions were revoked, verify the fresh browser can establish a
   new session. Re-enable the server gate only after the browser and unrelated-
   owner checks pass, using the separately approved runtime values.
8. If any check fails, leave the gate off, preserve the incident and protected
   head, and use the smallest rollback that returns the deployment to the
   recorded known-good commit.

Immediate rollback triggers are ownership exposure, wrong-profile rendering,
an unsafe accepted write, silent overwrite, a missing mandatory backup,
integrity mismatch, uncontrolled retries, or cleanup outside the exact target.
They also include a changed current head during restore, a missing recovery
receipt, a fresh browser that cannot resolve the returned head, or any output
that contains profile contents or credentials.

The database operation is idempotent for the same incident and operation ID.
Changing the candidate, target, or operation identity raises an error. Never
delete a receipt or a protected version to make a retry pass.

## Actual knowledge that a learner is under 13

Edenia does not add an age questionnaire, child-targeting flow, or general
guardian-account flow. This procedure starts only when an operator has actual
knowledge about a specific learner.

1. Start an incident with kind `under-13` using the exact confirmation
   `UNDER-13 <target UUID>`. The same gate-first function records the deployed
   commit and non-secret runtime gate state, then sets the server profile-data
   gate to `off`.
2. Call `private.record_under_13_account_lock` with the exact confirmation.
   Without verified guardian consent it creates one exact-account lock and
   returns `manual_removal_required = true`. The lock is not a broad account
   switch. Do not search by email, name, provider, or browser contents.
3. Revoke issued sessions for the exact account through the approved Supabase
   Auth operator surface, or record that their validity is still unknown. Do
   not claim revocation from a local sign-out. Keep the server gate off until
   removal or verified guardian consent is complete.
4. With a second explicit confirmation of the same UUID, remove that account's
   Edenia profile rows in one transaction. Use an exact UUID variable and the
   current table inventory. Delete dependent recovery records first, then the
   current head, then the immutable versions. Use aggregate counts afterward
   to verify zero remaining rows for that UUID. Do not print row contents.
   Retain only the minimum incident record required by the approved retention
   policy.

   ```sql
   \set target_user_id 'paste-the-confirmed-uuid-here'
   begin;
   delete from private.learner_profile_recoveries
     where user_id = :'target_user_id'::uuid;
   delete from private.learner_profile_conflicts
     where user_id = :'target_user_id'::uuid;
   delete from private.learner_profile_import_backups
     where user_id = :'target_user_id'::uuid;
   delete from private.learner_profile_resets
     where user_id = :'target_user_id'::uuid;
   delete from private.learner_profile_accountless_migration_receipts
     where user_id = :'target_user_id'::uuid;
   delete from private.learner_profile_creation_eligibility
     where user_id = :'target_user_id'::uuid;
   delete from public.learner_profile_write_receipts
     where user_id = :'target_user_id'::uuid;
   delete from public.state_backups
     where user_id = :'target_user_id'::uuid;
   delete from public.learner_profile_heads
     where user_id = :'target_user_id'::uuid;
   delete from public.learner_profile_versions
     where user_id = :'target_user_id'::uuid;
   select 'heads' as record_type, count(*) as remaining
     from public.learner_profile_heads
     where user_id = :'target_user_id'::uuid
   union all
   select 'versions', count(*)
     from public.learner_profile_versions
     where user_id = :'target_user_id'::uuid;
   -- Review the aggregate counts before issuing COMMIT.
   ```

   If any count is nonzero or a delete affects an unexpected target, roll back
   the transaction and leave the server gate off. If the approved procedure
   allows a bounded partial cleanup, commit only after recording the aggregate
   counts; otherwise roll back. Do not delete the incident record or the lock
   record as a retry workaround. After a committed transaction, call
   `private.record_under_13_profile_removal` with the exact confirmation, the
   observed session status, and the aggregate remaining head/version counts.
   It records `incomplete` until both counts are zero, and records `completed`
   only for zero counts. Keep those counts and the removal time; do not retain
   deleted rows or their contents.

Guardian-consent branch: if verified guardian consent exists, call the same
lock function with `p_guardian_consent_verified = true`, record the session
status, and do not remove the profile through this procedure. Keep the
incident evidence private and do not expose the consent material in logs.

The exact account, session outcome, removal result, deployed commit, and gate
state belong in the private incident record. The operator log should contain
only incident IDs, sanitized metadata, timestamps, aggregate row counts, and
the final session status.

## Release-readiness exercises

Before claiming Auth launch readiness, retain evidence for each exercise:

- Auth alert test: expected client errors stay non-alerting, three provider or
  network failures open the alert, and a successful probe closes it.
- Database security test: browser roles cannot execute operator functions or
  read operator tables; recovery writes a new protected revision and preserves
  the displaced head and write receipts.
- Backup-restoration rehearsal: restore the external database dump into an
  isolated local Supabase database, run the profile security tests, and record
  only exit status and aggregate counts.
- Fresh-browser verification: use the exact deployed commit and a clean browser
  profile to resolve the restored head, then confirm an unrelated owner remains
  unchanged.

Each record names the deployed commit and the non-secret gate values. A source
test, `internal_test=1`, or a local browser alone is not production evidence.
