# Internal canary issue plan — 2026-09-04

## Review status

- **Status:** Draft for product-owner review.
- **Source:** [`internal-canary-exploratory-2026-09-04.md`](internal-canary-exploratory-2026-09-04.md).
- **Tracker:** GitHub Issues for `BriceChivu/Edenia`.
- **Safety boundary:** This document is planning only. No GitHub issue, comment, label, dependency, pull request, provider configuration, deployment, database row, or learner profile was created or modified while preparing it.

## Recommendation

Do not create another umbrella issue. Existing issue [#196 — Prove release readiness with deployment-bound canaries](https://github.com/BriceChivu/Edenia/issues/196) already owns the release-readiness outcome.

The report should produce the following tracker work:

| Report finding | Tracker treatment |
| --- | --- |
| Hosted signed-in profile opening is stuck | Update existing [#286](https://github.com/BriceChivu/Edenia/issues/286); do not create a duplicate |
| Google rejects the localhost canary origin | Create one operator-owned provider-configuration issue |
| `Later` does not dismiss a failed backup notice | Create one code defect |
| Hidden heatmap tooltip remains exposed | Create one accessibility defect |
| Local email sign-in shows false Turnstile guidance | Create one code defect |
| `Start over` can silently no-op | Create one high-priority code defect |
| Historical AnkiConnect null-target entry | Create one investigation issue, explicitly not a confirmed current defect |

The manual paths that passed are not separate issues. They become focused non-regression checks for the affected tickets and evidence for the eventual #196 canary rerun.

## Issue 1 — Update existing profile-opening defect

### Existing issue

[#286 — Internal-test signed-in profile opening can remain stuck in generic recovery](https://github.com/BriceChivu/Edenia/issues/286)

### Tracker treatment

- Do not create a duplicate.
- Keep the existing `bug` label.
- Add #286 as a native blocker of #196.
- Add a sanitized September 4 evidence comment.
- Keep #286 open until the fix has been reviewed, merged, deployed, and verified on the exact hosted internal route.

### Suggested evidence update

#### September 4 hosted reproduction

The failure was reproduced again on the exact internal-canary route:

- URL: `https://www.edenia.study/?internal_test=1`
- Deployed commit: `018d256beac9910cfdbccc1da7ac725d4e88d166`
- Browser: Chrome

Observed sequence:

1. Sign in with the approved Google account.
2. Observe `We need to check your progress`.
3. Select `Try again`.
4. The same generic recovery screen returns.
5. Sign out, sign in again, retry, and reload; the failure remains reproducible.

Sanitized boundary evidence:

- Google authentication returned HTTP 200.
- Every `resolve_my_learner_profile` request returned HTTP 200.
- A read-only database shape check found the current envelope had the expected five top-level keys, schema/version, profile object, SHA-256 metadata, 43-character digest, and matching row digest and byte-length metadata.
- The hosted learner-profile head remained generation 4, revision 2, with 88 retained versions before and after testing.

This narrows the live failure to the client-side profile-opening path after successful authentication and owner-scoped profile resolution. It is not evidence of Auth failure, database unavailability, a missing profile head, or a malformed current cloud envelope.

The current local branch reaches commit `4b48df6`. It contains focused work for opening a valid cloud profile past malformed durable metadata, but it has no pull request and is not present in the deployed release above.

### Completion criteria

- [ ] Review the current local fix against ADR-0001, especially its activation fence and the distinction between an empty local namespace and meaningful local progress.
- [ ] Prove that a verified, structurally valid cloud profile opens despite malformed durable import or sync bookkeeping.
- [ ] Preserve fail-closed behavior when a non-empty local profile has unverified ownership, lineage, or meaningful progress that must not be overwritten.
- [ ] Cover the exact `?internal_test=1` route and its isolated storage namespace.
- [ ] Cover stale requests, changed durable values, storage-write failure, and both relevant cross-tab completion orders where the metadata-repair path is affected.
- [ ] Prove that the ordinary public route remains accountless and unchanged.
- [ ] Run the focused profile-opening contracts and browser scenarios, followed by the complete repository verification before release.
- [ ] Merge and deploy the reviewed fix before claiming hosted success.
- [ ] After deployment, verify in hosted Chrome that initial sign-in, `Try again`, and reload all reach the valid cloud town.
- [ ] Do not close #286 based only on local tests, a green CI job, or a healthy public-root town.

### Safety boundary

Hosted verification for this ticket should remain limited to the already approved internal-canary account and the minimum sign-in, retry, reload, and sign-out actions. Do not use hosted channel, video, history, reminder, import, restore, or Start-over actions as part of this ticket.

## Issue 2 — Authorize the localhost internal-canary origin for Google sign-in

### Proposed title

> Authorize the localhost internal-canary origin for Google sign-in

### Proposed classification

- Label: `bug`
- Execution owner: human/operator
- Do not apply `ready-for-agent`; the essential mutation is in the Google provider console.
- Reference completed Auth issue #179 and release-readiness issue #196 without reopening #179.

### Draft issue body

#### Summary

Google Identity Services rejects Edenia's supported local internal-canary origin before any credential flow begins.

Environment:

- `http://localhost:8000/?internal_test=1`
- localhost temporarily using the hosted public Google and Supabase configuration

Observed provider message:

```text
[GSI_LOGGER]: The given origin is not allowed for the given client ID.
```

The official Google control produces no account chooser. Email-code authentication remains usable locally, and the same Google flow works on the hosted internal origin. This points to the Google Web client's Authorized JavaScript origins rather than learner-profile storage.

#### Expected behavior

The approved local test origin opens Google's official account chooser and can complete the supported ID-token exchange, while unrelated origins remain unauthorized and the hosted origin continues to work.

#### Acceptance criteria

- [ ] Confirm which Google Web client ID the internal-canary runtime uses without recording any client secret, provider secret, access token, ID token, nonce, or session value.
- [ ] Recheck Google's current localhost-origin requirements at execution time.
- [ ] Add only the narrow localhost origins required by current provider guidance. Current guidance calls for `http://localhost` and `http://localhost:8000`; do not add wildcards or unrelated ports.
- [ ] Preserve `https://www.edenia.study` as an authorized production origin.
- [ ] Do not rotate credentials or modify the Supabase Google provider secret merely to change the origin list.
- [ ] On the exact localhost internal route, the official Google button renders and opens the account chooser without the origin error.
- [ ] The approved account can authenticate and sign out without changing its learner-profile generation, revision, or retained-version count.
- [ ] The hosted internal origin continues to authenticate successfully.
- [ ] An unrelated localhost port remains unauthorized.
- [ ] Record only sanitized provider configuration and browser evidence.
- [ ] Update the non-secret Google-origin checklist in `docs/deployment-and-releases.md`.

#### Non-goals

- Do not change learner-profile database behavior.
- Do not replace Google's official button.
- Do not add Google One Tap, automatic account selection, new OAuth scopes, or another Auth method.
- Do not broaden the issue to a code or header change unless origin authorization succeeds and new evidence proves a separate application defect. Split that defect into another issue if necessary.

#### Current documentation references

- [Google Identity Services — Get your Google API client ID](https://developers.google.com/identity/gsi/web/guides/get-google-api-clientid?hl=en)
- [Supabase Auth — Login with Google](https://supabase.com/docs/guides/auth/social-login/auth-google)

## Issue 3 — Make `Later` snooze a failed accountless-profile backup

### Proposed title

> Make “Later” snooze a failed accountless-profile backup notice

### Proposed classification

- Labels: `bug`, `ready-for-agent`
- Regression follow-up to #187.
- Add as a native blocker of #196 because #196 explicitly requires the first-backup-failure path.

### Draft issue body

#### Summary

After a failed accountless-profile migration backup, the `Not backed up yet` notice offers `Try backup again` and `Later`. Selecting `Later` currently leaves the notice fully visible and interactive. A second semantic click produces the same no-op.

The controller writes a future `nextNoticeAt`, but deliberately preserves the `backup-failed` attempt. Publication gives any attempt precedence over `nextNoticeAt`, so the visible state immediately returns to `backup-failed`.

#### User impact

An accountless learner remains obstructed by a notice after choosing the offered deferral action, even though the local town remains usable and the learner explicitly asked to postpone the backup.

#### Expected behavior

`Later` should snooze the notice without discarding the durable failed attempt or starting another upload. The learner should be able to continue locally, and a later retry should resume the same idempotent protected operation.

#### Acceptance criteria

- [ ] Selecting `Later` from `backup-failed` immediately hides the notice and leaves the accountless town usable.
- [ ] The notice remains hidden after reload until the persisted snooze deadline.
- [ ] The failed attempt's operation ID, protected envelope, retry count, and other retry state remain durable.
- [ ] Selecting `Later` does not issue a backup, migration, catch-up, sync, or other network request.
- [ ] When the snooze expires, the failed-backup notice can return and `Try backup again` resumes the same idempotent operation.
- [ ] The final seven-day countdown and mandatory final gate remain non-dismissible.
- [ ] A failed storage write does not falsely claim that the notice was durably snoozed.
- [ ] Local profile contents and the last accepted cloud head remain unchanged by `Later`.
- [ ] Update the controller contract that currently expects `backup-failed` immediately after `later()`.
- [ ] Add a fake-clock contract covering dismissal, reload, expiry, and retry-state preservation.
- [ ] Add a browser regression that produces a failed backup, selects `Later`, verifies that the notice is hidden, reloads, and proves the town and local profile remain intact.

#### Safety boundary

Do not use `Try backup again` against the hosted learner profile while verifying dismissal. Hosted verification should select only `Later` and should confirm that no network backup request occurred.

## Issue 4 — Remove dismissed heatmap details from the accessibility tree

### Proposed title

> Remove dismissed Study History heatmap details from the accessibility tree

### Proposed classification

- Labels: `bug`, `ready-for-agent`

### Draft issue body

#### Summary

A selected Study History Heatmap day populates `#heatmapTooltip`. Returning to `Summary` removes only the `show` class. CSS makes the tooltip transparent and non-interactive, but the element remains displayed and retains the previously selected day's details in the accessibility tree.

Existing browser coverage verifies that the `show` class is absent. It does not assert semantic hiding, so the accessibility regression passes unnoticed.

#### User impact

A screen-reader user can encounter stale details for a heatmap day after leaving the Heatmap view.

#### Expected behavior

A dismissed tooltip must not remain exposed to assistive technology or retain stale readable details. Showing another day must restore only the current day's information.

#### Acceptance criteria

- [ ] When a heatmap tooltip is dismissed, it is excluded from the accessibility tree.
- [ ] Previously selected day details are not left as readable stale content after dismissal.
- [ ] Semantic hiding applies to Summary/Heatmap switching, blur, pointer exit, outside click, toggle-close, rerender, and other existing transient-UI closing paths.
- [ ] Showing a new day restores semantic visibility and presents only that day's details.
- [ ] Tooltip position and desktop/coarse-pointer behavior remain unchanged.
- [ ] Summary/Heatmap keyboard selection, saved view preference, and day-detail opening continue to work.
- [ ] Extend the exact Heatmap-day-to-Summary reproduction in the Study History browser coverage.
- [ ] Assert semantic hiding through `hidden`, `aria-hidden`, or a direct accessibility-tree assertion; absence of the `show` class is insufficient.
- [ ] Verify keyboard and pointer dismissal.
- [ ] Check the ordinary local route as well as `?internal_test=1`, because the implementation is shared.

#### Evidence boundary

The current report confirms the failure only on localhost's internal route. Do not claim that it was reproduced on the hosted public route unless that route is separately and safely tested.

## Issue 5 — Hide Turnstile status when no security check is configured

### Proposed title

> Hide Turnstile status when email sign-in has no configured security check

### Proposed classification

- Labels: `bug`, `ready-for-agent`
- Regression follow-up to implementation issue #179 and the research in #165.

### Draft issue body

#### Summary

On localhost without a Turnstile site key or controller, the email sign-in form says `Complete the security check to continue.` even though no challenge is rendered and `Email me a code` is enabled. Requesting and verifying a local code succeeds.

The synchronization code iterates the hidden Turnstile placeholder, defaults its status to `pending`, and publishes pending guidance without first determining whether Turnstile is configured.

#### User impact

The supported local sign-in flow presents misleading and apparently blocking guidance for a security step that does not exist in that environment.

#### Expected behavior

When Turnstile is not configured, there should be no Turnstile widget or Turnstile status copy. When it is configured, the existing pending, interactive, ready, expired, unavailable, and error behavior must remain enforced.

#### Acceptance criteria

- [ ] With no configured Turnstile controller, the widget and status remain hidden and the status content is empty.
- [ ] The email button remains governed only by normal busy, unavailable, and input-validation states.
- [ ] Email-code requests use `captchaRequired: false`, send no CAPTCHA token, and continue to work against supported local Auth.
- [ ] With Turnstile configured, pending or interactive state shows appropriate guidance and submission remains disabled until a fresh token is ready.
- [ ] Configured expired, unavailable, and error states remain visible.
- [ ] Configured tokens remain memory-only, bounded, single-use, and reset after every request.
- [ ] Cover every email-auth surface that reuses the Turnstile placeholder, including Settings and the locked/onboarding account surface.
- [ ] Add a contract for “placeholder exists, controller absent.”
- [ ] Add a localhost internal-route browser test with no site key.
- [ ] Retain the configured-Turnstile browser test as a positive control.
- [ ] Preserve all five locale strings; this is a visibility/state fix rather than a copy rewrite.

#### Non-goals and safety boundary

- Do not weaken hosted CAPTCHA enforcement.
- Do not change Cloudflare or Supabase provider configuration in this issue.
- Do not log CAPTCHA tokens, email codes, sessions, Auth responses, or secret-bearing URLs.

## Issue 6 — Prevent confirmed `Start over` from silently doing nothing

### Proposed title

> Prevent “Start over” from silently doing nothing on an “Up to date” signed-in profile

### Proposed classification

- Labels: `bug`, `ready-for-agent`
- High-priority regression follow-up to completed issue #190.
- Add as a native blocker of #196.

### Draft issue body

#### Summary

A signed-in profile displayed `Up to date`, offered `Start over`, accepted the destructive confirmation, and returned to the town without resetting anything.

No `start_over_my_learner_profile` request appeared in the local Kong access log. No September 4 reset receipt was created. After reload, the profile remained on generation 11 and retained its September 1 Anki history and Study Insight. A later ordinary synchronization advanced only revision 21 to 22 while retaining one Anki Study day.

The persisted-state verification returned:

```text
11|22|1|0
```

for generation, revision, Anki-day count, and reset-receipt count for the day, rather than the expected relative outcome of generation `N+1`, revision 1, no prior Anki Study day in the blank profile, and a new reset receipt.

Undo of an older protected reset worked independently. That successful Undo was not an Undo of the attempted September 4 reset because the new reset was never created.

#### Likely boundary

The client returned before invoking the RPC. `canReplaceSynchronizedHead()` uses stricter readiness checks than the visible header communicates, including active binding, current activation, cloud-head knowledge, the exact sync record, pending and queued work, and dirty state.

The precise rejecting condition was not available after reload and is not yet proven. It must be identified before any fence is relaxed.

#### User impact

A learner can explicitly confirm a destructive reset, return to the town, and still retain the profile they asked to reset. This makes the action's visible contract unreliable even though no progress was lost.

#### Expected behavior

If Edenia presents the profile as `Up to date` and allows the learner to confirm `Start over`, the operation must either create and activate the next protected profile generation or clearly explain why it cannot proceed. It must never appear successful while silently preserving the old profile.

#### Acceptance criteria

- [ ] Begin with a deterministic failing regression matching the observed state:
  - signed-in active profile;
  - visible `Up to date` status;
  - meaningful current Study facts;
  - an older unexpired protected Start-over generation already available;
  - a second confirmed `Start over`.
- [ ] Identify and record the exact client-side rejection condition before changing behavior.
- [ ] Do not broadly relax owner, profile, generation, revision, activation, pending-work, queued-work, dirty-state, or connectivity fences.
- [ ] Make the visible Progress sync state and destructive-action readiness predicate agree.
- [ ] If the action is not yet safe, hold or reject it with clear actionable feedback instead of silently returning to the town.
- [ ] A successful confirmation invokes `start_over_my_learner_profile` exactly once with the active owner-derived profile ID, generation, and accepted revision.
- [ ] Success creates generation `N+1`, revision 1, installs a blank portable profile, and creates a new protected reset receipt.
- [ ] The previously protected generation is not silently deleted; the newest applicable reset becomes the Undo target according to the existing retention contract.
- [ ] Reload retains the blank profile and new generation.
- [ ] If a race makes replacement unsafe after confirmation, the prior profile remains active and unchanged and the UI clearly reports failure.
- [ ] Expose a privacy-safe internal refusal reason or equivalent diagnostic without placing profile contents or identifiers in analytics.
- [ ] Add focused cloud-persistence and lifecycle contracts for consecutive Start-over generations.
- [ ] Add a browser test for starting over while an older protected reset is still available.
- [ ] Keep the existing Start-over-then-Undo coverage green.
- [ ] Run `supabase/tests/learner_profile_start_over.test.sql` if RPC or database behavior changes, and verify that CI still routes and executes it.
- [ ] Prove that the ordinary public accountless route remains unchanged.

#### Safety boundary

Destructive verification for this fix remains local. A hosted Start-over test belongs to #196 and requires separate explicit authorization, exact-target confirmation, pre-action recovery evidence, and post-action generation/revision verification.

## Issue 7 — Investigate the historical AnkiConnect null-target failure

### Proposed title

> Investigate historical AnkiConnect null-target failure during UI refresh

### Proposed classification

- Label: `ready-for-agent`
- Classification: investigation, not a confirmed current defect

### Draft issue body

#### Historical signal

The local Activity log contains a September 1 entry:

```text
AnkiConnect failed: Cannot set properties of null (setting 'textContent')
```

The September 4 exploratory session did not reproduce it. This ticket must preserve that evidence boundary and determine whether current source can still produce the secondary DOM error during `refreshAnkiStats()` or a subsequent Study History rerender.

#### Investigation question

Can an Anki refresh success or failure complete while an affected UI element has been removed or replaced, causing current code to assign `textContent` through a stale or missing target? Alternatively, was the log entry produced by an older build whose unsafe call no longer exists?

#### Acceptance criteria

- [ ] Identify the application or deployment commit associated with the September 1 entry if that can be recovered without exposing learner or integration data.
- [ ] Audit the Anki refresh failure path and the Study History rerenders it triggers for stale or unguarded element references.
- [ ] Exercise deterministic local cases with AnkiConnect unavailable or returning an error.
- [ ] Cover Settings open and closed, Summary and Heatmap views, and a view change or rerender while an Anki refresh is in flight.
- [ ] Cover locale or profile transitions during an in-flight refresh where those transitions can replace affected DOM.
- [ ] Capture a source location and stack trace if reproduced, excluding deck names, card contents, learner data, tokens, or local integration secrets.
- [ ] If reproduced, add a failing regression before fixing the relevant lifecycle or null-target problem.
- [ ] Ensure Edenia records the original Anki availability error without replacing it with a secondary UI exception.
- [ ] Ensure repeated background refresh failures do not create an uncontrolled Activity-log flood.
- [ ] If it cannot be reproduced, document the tested matrix and whether later commits removed the suspected call, then close the investigation without speculative code changes.

#### Safety boundary

Do not enable or exercise Anki integration on the hosted site as part of this investigation.

## Coordination update for #196

After the issues have been reviewed and created, update #196 with:

- a link to the September 4 exploratory record;
- local source commit `4b48df6c0519` and hosted deployed commit `018d256beac9910cfdbccc1da7ac725d4e88d166`;
- the hosted read-only safety boundary;
- the automated baseline of 1,385 contract tests, 139 shared backend/function tests, passing Deno checks, and 311 passed/798 intentionally skipped Playwright cases;
- links to every new ticket;
- a statement that the green baseline did not detect the interface defects and is not acceptance proof.

Use GitHub's native issue dependencies to make #196 blocked by:

1. Existing #286.
2. The new Start-over defect.
3. The new failed-backup `Later` defect.

Link the Google-origin, Turnstile, heatmap, and Anki tickets from #196, but do not automatically make them release blockers unless their implementation or investigation invalidates an explicit #196 acceptance criterion.

## Recommended execution order

### Wave 1 — Liveness and destructive-action integrity

1. Complete, review, and deploy #286.
2. Diagnose and fix the Start-over no-op.
3. Fix failed-backup `Later` behavior.

These are the direct release-readiness blockers. Profile opening prevents the canary account from reaching the town, Start over violates an explicit destructive-action contract, and the failed-backup notice violates the required legacy first-backup-failure path.

### Parallel operator task

4. Correct the Google Web client's localhost Authorized JavaScript origins.

This can proceed independently because it is provider configuration rather than application code. It should not be folded into an application PR.

### Wave 2 — Focused interface correctness

5. Fix the false Turnstile guidance when no controller exists.
6. Remove dismissed heatmap tooltip content from the accessibility tree.

These are independent and should remain narrow rather than sharing a general UI refactor.

### Wave 3 — Historical investigation

7. Investigate the AnkiConnect null-target entry.

This should not delay the confirmed defects unless it becomes reproducible on current source or reveals a broader lifecycle problem.

### Final gate

8. Rerun only the affected #196 scenarios after the corresponding changes are deployed, then run the complete release-readiness gate.

## Verification policy across the issue set

The pre-existing green test run is only a regression baseline. For each code defect:

- add a focused failing regression before changing behavior;
- prove the regression turns green;
- run the nearest affected contract and browser suites;
- run database tests when an RPC, schema, grant, RLS policy, or database contract changes;
- run the full `npm run test:ci` gate before deployment;
- distinguish local proof, hosted CI proof, hosted provider proof, and product-owner proof explicitly.

The following adjacent paths from the exploratory report should remain green where relevant:

- email-code sign-in, sign-out, reload while signed out, and second sign-in;
- Summary/Heatmap switching and day-detail opening;
- Settings Account expansion and Progress sync status;
- accountless local-town continuity after failed backup;
- Start over confirmation and independently successful Undo;
- hosted Google sign-in and persistent sign-out;
- exact internal/public route isolation.

Do not rerun unrelated destructive hosted scenarios merely because a focused local fix changed.

## Label note

The repository's triage documentation defines `ready-for-human`, `needs-triage`, and `needs-info`, but those labels are not currently present in the live GitHub label list.

Until the label set is reconciled:

- keep the Google provider issue labelled `bug` and state its human/operator ownership in the issue body;
- use `ready-for-agent` only for work that is fully specified and safe for an unattended agent;
- do not silently substitute `ready-for-agent` for human-owned provider mutation.

## References

- [`internal-canary-exploratory-2026-09-04.md`](internal-canary-exploratory-2026-09-04.md)
- [`CONTEXT.md`](../CONTEXT.md)
- [`docs/adr/0001-signed-in-profile-opening-recovery.md`](adr/0001-signed-in-profile-opening-recovery.md)
- [`docs/agents/issue-tracker.md`](agents/issue-tracker.md)
- [`docs/agents/triage-labels.md`](agents/triage-labels.md)
- [#196 — Prove release readiness with deployment-bound canaries](https://github.com/BriceChivu/Edenia/issues/196)
- [#286 — Internal-test signed-in profile opening can remain stuck in generic recovery](https://github.com/BriceChivu/Edenia/issues/286)
- [#190 — Start over and undo across devices](https://github.com/BriceChivu/Edenia/issues/190)
- [#187 — Keep local study available when cloud backup is rejected](https://github.com/BriceChivu/Edenia/issues/187)
- [#179 — Replace email magic links with same-device verification codes](https://github.com/BriceChivu/Edenia/issues/179)
- [#165 — Verify frictionless Turnstile protection across Edenia's email sign-in flow](https://github.com/BriceChivu/Edenia/issues/165)
- [Google Identity Services — Get your Google API client ID](https://developers.google.com/identity/gsi/web/guides/get-google-api-clientid?hl=en)
- [Supabase Auth — Login with Google](https://supabase.com/docs/guides/auth/social-login/auth-google)
