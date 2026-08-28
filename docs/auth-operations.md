# Auth and profile incident operations

This runbook covers the production Auth probe, serious learner-profile recovery,
and the bounded response when Edenia gains actual knowledge that a learner is
under 13. It is an operator procedure, not a browser feature. Never paste a
database URL, publishable key, session value, email address, or profile
envelope into a command, issue, chat, or log.

## Auth health monitoring

The production clock is an Independent Auth monitor operated through Pulsetic
Free Website Monitoring.
Every five minutes it sends an authenticated `POST` to the deployed
`auth-health-monitor` Edge Function, pinned to `ap-northeast-1` with
`forceFunctionRegion=ap-northeast-1`. The function calls Supabase Auth at
`/auth/v1/health`, records only the bounded result below through a service-only
database bridge, and returns HTTP 200 for an available provider response or an
expected client error. It returns HTTP 503 for provider, network, recorder, or
function failures. The HTTP monitor uses this status-code boundary, confirms a
failure with its own retries, and sends the attached operator notification.

Detection SLA: a continuously failing Auth endpoint must produce a confirmed
DOWN incident and deliver the operator notification within ten minutes of the
last healthy Independent Auth monitor check. During healthy operation,
aggregate probe records must likewise have no gap over ten minutes. The 24-hour
proof below verifies both the configured five-minute interval and this
ten-minute outer bound.

Supabase otherwise runs an Edge Function near each caller. Pulsetic scheduled
checks and confirmation retries can originate from different locations, so an
unpinned invocation can take a different cross-region path to the Tokyo Auth
and database services than a direct operator check. The production monitor URL
therefore pins every invocation to the project's deployed region. Verify the
sanitized `x-sb-edge-region` response header is `ap-northeast-1`; do not record
the endpoint, capability, response body, request headers, or execution ID.

GitHub Actions is not the production clock. The scheduled job in
`.github/workflows/auth-health-monitor.yml` is an independent secondary
watchdog: it sends an authenticated `GET` to the function and fails when the
latest aggregate record is older than ten minutes, the aggregate alert is
open, or the function/database is unavailable. GitHub scheduled events are
best-effort, so this job supplements the Independent Auth monitor and never
replaces it. `workflow_dispatch` retains the original direct probe as a manual
diagnostic.

Operational assumptions are pinned to the provider documentation: the
[Pulsetic Free plan includes ten monitors, five-minute checks, and email
alerts](https://pulsetic.com/pricing/), its
[saved Advanced Settings expose HTTP methods, request headers, and exact
expected statuses](https://help.pulsetic.com/article/21-how-to-use-the-advanced-settings),
and monitors can be
[paused and resumed while retaining their configuration](https://help.pulsetic.com/article/281-using-bulk-actions-on-monitors).
[Pulsetic pauses Free monitors after more than three months without an account
login](https://help.pulsetic.com/article/352-monitor-paused). Maintain a monthly
operator reminder and sign in at least every 80 days; do not treat the reminder
itself as monitor evidence.
GitHub documents that [scheduled events can be delayed or dropped](https://docs.github.com/en/actions/how-tos/troubleshoot-workflows#scheduled-workflows-running-at-unexpected-times),
which is why it is only the secondary watchdog.

The dedicated 64-character lowercase hexadecimal
`EDENIA_AUTH_MONITOR_TOKEN` is stored in exactly three places: the Supabase
Edge Function secrets, the Pulsetic monitor's `Authorization` request header,
and the GitHub Actions secret of the same name. It is never a Pages variable, URL
parameter, issue value, command-line argument, or log field. The optional
`EDENIA_AUTH_MONITOR_CANARY_ENABLED` Edge Function secret is exactly `true` or
`false` and remains `false` outside a supervised alert rehearsal. Run
`scripts/setup-auth-monitoring.sh` after the migration and function are merged
to provision these values without printing them.

| Result | Meaning | Alert effect |
| --- | --- | --- |
| `available` | Auth returned a 2xx response | Clears consecutive provider failures |
| `expected_client_error` | Auth returned a 4xx response | Proves the endpoint answered; no outage alert |
| `provider_unavailable` | Auth returned a 5xx response | Adds one outage failure |
| `network_error` | The request timed out or could not connect | Adds one outage failure |

Three consecutive provider or network failures open the aggregate alert. A
fresh successful response closes it. A failed monitor run does not by itself
prove an Auth outage: the Pulsetic incident and secondary-watchdog
annotation are deliberately neutral, and the sanitized result class identifies
the failed boundary.
`Auth health recorder schema is not deployed` means the production migration
chain does not yet contain the private recorder. Keep the profile-data gate
off, reconcile all pending migrations in order, obtain approval for the
production schema change, and rerun the monitor after deployment.
`Auth health recorder failed` means the recorder could not complete for another
reason; verify the database connection and deployed schema without printing the
URL or credentials. A stale probe older than ten minutes is not healthy, even
if its last recorded result was good.

### Provision and prove the Independent Auth monitor

Before mandatory-account launch:

1. Apply `20260828041926_add_external_auth_monitor_bridge.sql`, deploy
   `auth-health-monitor` from the same commit, and keep
   `EDENIA_AUTH_MONITOR_CANARY_ENABLED=false`.
2. Run `scripts/setup-auth-monitoring.sh`. In Pulsetic create a temporary
   Website Monitoring monitor for `https://example.com`. Keep the Free-plan
   five-minute interval, zero notification delay, and Email Alert enabled.
   Save it without entering the production endpoint or Auth monitor capability.
3. Open the temporary monitor's saved Advanced Settings. In one update, set
   Name to `Edenia production Auth`, replace the URL with the exact function
   URL ending in `?forceFunctionRegion=ap-northeast-1`, set Request → HTTP Method
   to `POST`, add request header
   `Authorization` = `Bearer <Auth monitor capability>`, and set Response and
   Keywords → Expected statuses to `200`. The saved update converts the
   temporary monitor; there must not be a separate `example.com` monitor left
   behind. Keep the HTTP status check: HTTP 200 is UP and HTTP 503 is DOWN. Do
   not add response-body assertions; the Edge Function owns the sanitized
   outcome classification and exposes only the status-code boundary.
4. Run one Pulsetic check, wait for the converted monitor to become Online,
   confirm the response `x-sb-edge-region` is `ap-northeast-1`, and confirm a
   new aggregate record exists.
   Do not print the token, endpoint response body, database URL, or raw table.
5. Rehearse the provider-failure path. Set the canary flag to `true`, add the
   request header `X-Edenia-Auth-Monitor-Canary: provider_unavailable` to the
   Independent Auth monitor, and wait for its confirmation retries to produce a
   DOWN incident and open the three-failure database alert. Confirm receipt of the
   real DOWN notification. Remove the canary header **before** setting the flag
   back to `false`; the next real probe must return UP, close the aggregate
   alert, and deliver the recovery notification. These real canary DOWN and
   recovery notifications are the operator-delivery proof; verify them at the
   destination, not from dashboard state alone. Stop and keep the profile-data
   gate off if any cleanup or recovery step is ambiguous.
6. Prove the stale-record path separately by pausing the Independent Auth
   monitor for more than ten minutes while the server profile-data gate is off. The
   authenticated function `GET` must return non-2xx, and the secondary GitHub
   watchdog must fail when it next runs. Resume the Independent Auth monitor and
   verify that a fresh record returns both paths to healthy.
7. Observe at least 24 continuous hours after the rehearsal. The Independent
   Auth monitor must show its configured five-minute checks with no unexplained
   gap, and private aggregate records must show no gap over ten minutes. Record
   only the window start/end, check count, largest gap, incident/recovery times,
   notification channel class, deployed commit, and pass/fail result.

Do not use a real sign-in request as a synthetic probe. Never enable the canary
flag on an ordinary learner-facing path; it exists only on the bearer-protected
operator endpoint and fails closed when disabled.

### Monitoring rollback

If the new function or recorder bridge is defective, keep the profile-data gate
off and point the Independent Auth monitor directly at `/auth/v1/health` while
a revert PR is prepared. This temporarily preserves provider-availability
alerts but does not satisfy aggregate recording or freshness evidence. Revert
the function and workflow together, leave the additive service-only bridge in
place until nothing calls it, rotate `EDENIA_AUTH_MONITOR_TOKEN`, and repeat the
full alert/recovery rehearsal before claiming readiness again.

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
