# Internal canary issue plan — reviewed revision — 2026-09-04

## Review status

- **Status:** Revised draft for product-owner review.
- **Basis:** [the original issue plan](internal-canary-issue-plan-2026-09-04.md), the [September 4 exploratory record](internal-canary-exploratory-2026-09-04.md), current source, current tracker state, and ADR-0001.
- **Tracker:** GitHub Issues for `BriceChivu/Edenia`.
- **Safety boundary:** This document is planning only. Preparing it did not create or modify a GitHub issue, comment, label, dependency, pull request, provider configuration, deployment, database row, or learner profile.
- **Evidence boundary:** The September 4 observations are incident and reproduction evidence. They are not complete #196 release-readiness records.

## Decisions required before tracker execution

Resolve these gates before creating or updating issues from this plan:

1. **Triage labels:** Reconcile the repository's canonical triage labels with the live GitHub label set. Human-owned work must be classifiable as `ready-for-human`; unresolved work must be classifiable as `needs-triage` or `needs-info`.
2. **Google localhost strategy:** Choose explicitly between a dedicated local Google Web client and an approved localhost exception on the production Web client. Do not treat provider mutation as pre-authorized by this plan.
3. **Failed-backup blocker status:** Map the `Later` defect to a specific #196 acceptance outcome before adding a native dependency. Proximity to the first-backup-failure scenario is not sufficient by itself.
4. **Start-over diagnosis:** Reproduce the action-time state and identify the client-side refusal before treating the Start-over item as implementation-ready.

## Recommendation

Do not create another umbrella issue. Existing issue [#196 — Prove release readiness with deployment-bound canaries](https://github.com/BriceChivu/Edenia/issues/196) owns the release-readiness outcome.

The exploratory report should produce this tracker work:

| Report finding | Tracker treatment | #196 relationship |
| --- | --- | --- |
| Hosted signed-in profile opening is stuck | Update existing [#286](https://github.com/BriceChivu/Edenia/issues/286); preserve all original acceptance criteria | Native blocker |
| Google rejects the localhost canary origin | Create one human-owned provider decision/configuration issue after the strategy decision | Link; not automatically a blocker |
| `Later` does not dismiss a failed backup notice | Create one code defect with explicit deadline precedence | Candidate blocker pending criterion mapping |
| Hidden heatmap tooltip remains exposed | Create one accessibility defect | Link; not automatically a blocker |
| Local email sign-in shows false Turnstile guidance | Create one fail-closed code defect | Link; not automatically a blocker |
| Confirmed `Start over` does not reach its RPC | Create one diagnosis-first defect; do not apply `ready-for-agent` yet | Native blocker |
| Historical AnkiConnect null-target entry | Create one bounded investigation issue, explicitly not a confirmed current defect | Link; not a blocker |

Manual paths that passed are not separate issues. They become focused non-regression checks for affected tickets and context for a later #196 rerun.

## Issue 1 — Update existing profile-opening defect

### Existing issue

[#286 — Internal-test signed-in profile opening can remain stuck in generic recovery](https://github.com/BriceChivu/Edenia/issues/286)

### Tracker treatment

- Do not create a duplicate.
- Keep the existing `bug` label.
- Add #286 as a native blocker of #196.
- Add a sanitized September 4 incident-evidence comment.
- Treat the criteria below as **additive**. They do not replace #286's existing acceptance criteria or ADR-0001.
- Keep #286 open until every original and additive criterion has been reviewed, merged, deployed, and verified on the exact hosted internal route.

### Suggested incident-evidence update

#### September 4 hosted reproduction

The failure was reproduced again on the exact internal-canary route:

- URL: `https://www.edenia.study/?internal_test=1`
- Deployed commit reported by the exploratory record: `018d256beac9910cfdbccc1da7ac725d4e88d166`
- Browser family: Chrome

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

This narrows the observed live failure to the profile-opening path after successful authentication and owner-scoped profile resolution. It is not evidence of Auth failure, database unavailability, a missing profile head, or a malformed current cloud envelope.

The local checkout used by the exploratory record reached `4b48df6`. It contains focused work for opening a valid cloud profile past malformed durable metadata, but it had no pull request and was not present in the deployed release above.

This comment is incident evidence only. It must not be counted as a #196 canary record because it does not contain the complete deployment-identity, UTC, browser/OS-version, runtime-config-hash, and gate-state fields required by the release-readiness format.

### Additive completion criteria

- [ ] Review the local fix against ADR-0001, especially its activation fence and the distinction between an empty local namespace and meaningful local progress.
- [ ] Prove that a verified, structurally valid cloud profile opens despite malformed durable import or sync bookkeeping.
- [ ] Preserve fail-closed behavior when a non-empty local profile has unverified ownership, lineage, or meaningful progress that must not be overwritten.
- [ ] Cover the exact `?internal_test=1` route and its isolated storage namespace.
- [ ] Cover stale requests, changed durable values, storage-write failure, and both relevant cross-tab completion orders where metadata repair is affected.
- [ ] Prove that the ordinary public route remains accountless and unchanged.

### Original-scope closure criteria

These are mandatory for closure even if the hosted September 4 symptom is fixed:

- [ ] A valid current cloud head opens normally.
- [ ] An unusable current head restores only a verified, same-generation trusted profile predecessor.
- [ ] Recovery never crosses an intentional Start-over generation boundary.
- [ ] `recovery_required` with no trusted state enters language-selection onboarding rather than generic recovery.
- [ ] A genuine local or protected recovery candidate remains actionable.
- [ ] Valid divergent profiles use the progress-conflict path.
- [ ] Transient provider or network failure remains retryable as `waiting-cloud`.
- [ ] Unverified ownership requires reauthentication and never activates a fallback profile.
- [ ] Retry exhaustion cannot leave generic `recovering` as the learner's only path.
- [ ] Focused contracts and browser scenarios pass, followed by complete repository verification.
- [ ] The reviewed fix is merged and deployed before hosted success is claimed.
- [ ] Hosted Chrome verification proves initial sign-in, `Try again`, and reload reach the correct terminal outcome.
- [ ] #286 is not closed from local tests, a green CI job, or a healthy public-root town alone.

### Safety boundary

Hosted verification remains limited to the approved internal-canary account and the minimum sign-in, retry, reload, and sign-out actions. Channel, video, history, reminder, import, restore, and Start-over actions are outside this ticket's hosted verification.

## Issue 2 — Restore supported localhost Google sign-in without broadening trust implicitly

### Proposed title

> Decide and configure the narrow Google Web client strategy for localhost internal-canary sign-in

### Proposed classification

- Initial labels after label reconciliation: `bug`, `needs-triage`.
- Execution owner: human/operator.
- Replace `needs-triage` with `ready-for-human` only after the client strategy is explicitly chosen.
- Never apply `ready-for-agent`; the essential mutation is in Google and may also require approved Supabase configuration.
- Reference completed Auth issue #179 and release-readiness issue #196 without reopening #179.

### Draft issue body

#### Summary

Google Identity Services rejected Edenia's localhost internal-canary origin before any credential flow began.

Observed environment:

- `http://localhost:8000/?internal_test=1`
- localhost temporarily using the hosted public Google and Supabase configuration

Observed provider message:

```text
[GSI_LOGGER]: The given origin is not allowed for the given client ID.
```

The official Google control produced no account chooser. Email-code authentication remained usable locally, and the same Google flow worked on the hosted internal origin. This establishes an origin/client mismatch; it does not decide which Google client should trust localhost.

#### Required decision

Compare and explicitly choose one:

1. **Dedicated local client:** Use a separate Google Web client ID in local runtime and configure supported local Supabase Auth to accept that audience without changing the hosted production client's origins.
2. **Production-client exception:** Add only Google's required localhost origins to the existing production Web client, document why that broader client trust is acceptable, and define its removal trigger and rollback.

Prefer the smallest trust surface that supports the actual GIS ID-token exchange. Record the chosen option and rejected alternative without recording client secrets, provider secrets, tokens, nonces, sessions, or learner identifiers.

#### Acceptance criteria

- [ ] Confirm the current GIS and Supabase ID-token flow and the exact public Web client ID used in each environment.
- [ ] Recheck current Google and Supabase localhost guidance at execution time.
- [ ] Record the chosen client strategy and its trust-boundary rationale before provider mutation.
- [ ] If using a dedicated local client, prove local Supabase accepts only the intended Web-client audience and the hosted client/configuration remains unchanged.
- [ ] If using the production-client exception, add only `http://localhost` and `http://localhost:8000`, preserve `https://www.edenia.study`, and record an explicit removal/rollback trigger.
- [ ] Do not add wildcards, unrelated hosts, `127.0.0.1`, or unrelated ports without separate evidence and approval.
- [ ] Do not rotate credentials or change the Supabase Google provider secret merely to alter JavaScript origins.
- [ ] On the exact localhost internal route, the official Google button renders and opens the account chooser without the origin error.
- [ ] The approved account can authenticate and sign out without changing learner-profile generation, revision, or retained-version count.
- [ ] The hosted internal origin continues to authenticate successfully.
- [ ] An unrelated localhost port remains unauthorized.
- [ ] Record only sanitized provider configuration and browser evidence.
- [ ] Update the canonical non-secret provider checklists in `docs/account-authentication.md`, `docs/account-reminder-operations.md`, and `docs/deployment-and-releases.md` where the chosen strategy changes their stated contract.

#### Non-goals

- Do not change learner-profile database behavior.
- Do not replace Google's official button.
- Do not add Google One Tap, automatic account selection, new OAuth scopes, or another Auth method.
- Do not broaden the issue to application code or headers unless origin authorization succeeds and new evidence proves a separate application defect.

#### Current documentation references

- [Google Identity Services — Get your Google API client ID](https://developers.google.com/identity/gsi/web/guides/get-google-api-clientid?hl=en)
- [Supabase Auth — Login with Google](https://supabase.com/docs/guides/auth/social-login/auth-google)

## Issue 3 — Make `Later` snooze a failed accountless-profile backup

### Proposed title

> Make “Later” snooze a failed accountless-profile backup notice without bypassing the final gate

### Proposed classification

- Labels after reconciliation: `bug`, `ready-for-agent`.
- Regression follow-up to #187.
- Link from #196 immediately.
- Add as a native blocker only after the product owner identifies the exact #196 criterion that cannot pass while this defect remains.

### Draft issue body

#### Summary

After a failed accountless-profile migration backup, the `Not backed up yet` notice offers `Try backup again` and `Later`. Selecting `Later` currently leaves the notice visible and interactive.

The controller writes a future `nextNoticeAt` while preserving the durable `backup-failed` attempt. Publication gives the attempt precedence over `nextNoticeAt`, so the visible state immediately returns to `backup-failed`.

#### State precedence

- A snooze may hide only the `backup-failed` presentation while more than seven days remain.
- Active migration/attachment work keeps its existing state.
- The final seven-day countdown and day-zero final gate override a snooze.
- `Later` is unavailable once the final seven-day period begins, including when a failed attempt remains durable.
- Retry identity and protected data remain durable while presentation is snoozed.

#### Expected behavior

`Later` should snooze the failed-backup notice without discarding the durable attempt or starting another upload. The learner can continue locally, and a later retry resumes the same idempotent protected operation. A snooze can never suppress the mandatory countdown or final gate.

#### Acceptance criteria

- [ ] More than seven days before the final gate, selecting `Later` immediately hides `backup-failed` and leaves the accountless town usable.
- [ ] The notice remains hidden after reload until the persisted snooze deadline, unless the final seven-day period begins first.
- [ ] Crossing into the final seven-day period overrides an unexpired snooze and presents the mandatory state.
- [ ] Within the final seven-day period, `Later` is unavailable and cannot extend `nextNoticeAt`.
- [ ] The failed attempt's operation ID, protected envelope, retry count, and other retry state remain durable.
- [ ] Selecting `Later` issues no backup, migration, catch-up, sync, or other network request.
- [ ] After ordinary snooze expiry, `backup-failed` can return and `Try backup again` resumes the same idempotent operation.
- [ ] A failed storage write does not falsely claim that the notice was durably snoozed.
- [ ] Local profile contents and the last accepted cloud head remain unchanged.
- [ ] Update the controller contract that currently expects `backup-failed` immediately after `later()`.
- [ ] Add fake-clock contracts for dismissal, reload, ordinary expiry, crossing the seven-day boundary, day zero, and retry-state preservation.
- [ ] Add a browser regression that produces a failed backup, selects `Later`, verifies the notice is hidden, reloads, and proves the town and local profile remain intact.

### Safety boundary

Hosted verification may select only `Later` and confirm that no network backup request occurred. It must not select `Try backup again` against the hosted learner profile.

## Issue 4 — Remove dismissed heatmap details from the accessibility tree

### Proposed title

> Remove dismissed Study History heatmap details from the accessibility tree

### Proposed classification

- Labels after reconciliation: `bug`, `ready-for-agent`.

### Draft issue body

#### Summary

A selected Study History Heatmap day populates `#heatmapTooltip`. Returning to `Summary` removes only the `show` class. CSS makes the tooltip transparent and non-interactive, but the element remains displayed and retains the previously selected day's details in the accessibility tree.

Existing browser coverage verifies only that the `show` class is absent.

#### Expected behavior

A dismissed tooltip is absent from the accessibility tree and retains no stale readable details. When shown, only the active day's information is exposed through an appropriate tooltip relationship or equivalent accessible presentation.

#### Acceptance criteria

- [ ] Dismissal excludes the tooltip from the accessibility tree.
- [ ] Dismissal clears or semantically hides previously selected day details.
- [ ] Summary/Heatmap switching, blur, pointer exit, outside click, toggle-close, rerender, and other existing close paths use the same semantic hiding contract.
- [ ] Showing a new day restores semantic visibility and exposes only that day's information.
- [ ] A positive accessibility assertion proves the visible tooltip is associated with or announced for the active day through `role="tooltip"`, `aria-describedby`, or an equivalent tested pattern.
- [ ] Tooltip position, motion, and desktop/coarse-pointer behavior remain unchanged.
- [ ] Summary/Heatmap keyboard selection, saved view preference, and day-detail opening continue to work.
- [ ] Extend the exact Heatmap-day-to-Summary browser reproduction.
- [ ] Assert semantic state directly; absence of the `show` class is insufficient.
- [ ] Verify keyboard and pointer dismissal.
- [ ] Check the ordinary local route and `?internal_test=1`, because the implementation is shared.

#### Evidence boundary

The current report confirms the failure only on localhost's internal route. Do not claim hosted-public reproduction without separate safe evidence.

## Issue 5 — Hide Turnstile status only when security checks are unconfigured

### Proposed title

> Distinguish unconfigured Turnstile from configured-but-unavailable email protection

### Proposed classification

- Labels after reconciliation: `bug`, `ready-for-agent`.
- Regression follow-up to #179 and the research in #165.

### Draft issue body

#### Summary

On localhost with no Turnstile site key, the email sign-in form says `Complete the security check to continue.` even though no challenge is rendered and `Email me a code` is enabled. Local code request and verification succeed.

The synchronization code can iterate static Turnstile placeholders, default their status to `pending`, and publish guidance even when runtime configuration says no security check exists.

#### Required fail-closed branches

1. **Unconfigured:** No Turnstile runtime site key. Widget and status are absent or hidden, email requests use `captchaRequired: false`, and no CAPTCHA token is sent.
2. **Configured and ready:** A controller is mounted and a fresh token is available. Existing one-use token enforcement applies.
3. **Configured but unavailable:** A site key exists but the controller, script, widget mount, browser support, or token is unavailable. Status remains visible, submission remains blocked, and no tokenless email request is issued.

Controller absence must never be treated as proof that CAPTCHA is unconfigured.

#### Acceptance criteria

- [ ] With no Turnstile runtime configuration/site key, widget and status remain hidden and status content is empty.
- [ ] In the unconfigured branch, the email button is governed only by normal busy, unavailable, and input-validation states.
- [ ] Unconfigured email requests use `captchaRequired: false`, send no CAPTCHA token, and work against supported local Auth.
- [ ] With a site key configured, pending or interactive state shows appropriate guidance and submission remains disabled until a fresh token is ready.
- [ ] With a site key configured but no usable controller/widget, the unavailable or error state is visible and submission remains blocked.
- [ ] Configured expired, timed-out, unsupported, unavailable, and error states remain visible and fail closed.
- [ ] Configured tokens remain memory-only, bounded, single-use, and reset after every request.
- [ ] Cover Settings and locked/onboarding email-auth surfaces.
- [ ] Add separate contracts for “placeholder exists, runtime unconfigured” and “runtime configured, controller unavailable.”
- [ ] Add a localhost internal-route browser test with no site key.
- [ ] Retain configured-Turnstile success and failure browser tests as positive and fail-closed controls.
- [ ] Preserve all five locale strings; this is a visibility/state fix rather than a copy rewrite.

#### Non-goals and safety boundary

- Preserve hosted CAPTCHA enforcement.
- Keep Cloudflare and Supabase provider configuration unchanged in this code issue.
- Keep CAPTCHA tokens, email codes, sessions, Auth responses, and secret-bearing URLs out of logs and persisted application state.

## Issue 6 — Diagnose and repair the Start-over pre-RPC refusal

### Proposed title

> Diagnose why confirmed “Start over” can be refused before its RPC while Progress sync says “Up to date”

### Proposed classification

- Initial labels after reconciliation: `bug`, `needs-triage`.
- Native blocker of #196 because the required Start-over canary did not produce a reset.
- Do not apply `ready-for-agent` until Phase 1 produces a deterministic failing regression and identifies the refusal boundary.
- Regression follow-up to completed issue #190.

### Draft issue body

#### Confirmed observation

A signed-in local profile displayed `Up to date`, offered `Start over`, accepted the destructive confirmation, and did not reset.

No `start_over_my_learner_profile` request appeared in the local Kong access log. No September 4 reset receipt was created. After reload, the profile remained on generation 11 and retained its prior Anki history and Study Insight. A later ordinary synchronization advanced revision 21 to 22 without creating a new generation.

The persisted-state verifier returned:

```text
11|22|1|0
```

for generation, revision, Anki-day count, and reset-receipt count for the day. The expected successful relative outcome was generation `N+1`, revision 1, no prior Anki Study day in the blank profile, and a new reset receipt.

Undo of an older protected reset worked independently. It was not an Undo of the September 4 attempt because that reset was never created.

#### Source/evidence tension

Current source already handles a false lifecycle result by retaining the existing profile and publishing `Could not start over. Your existing progress was not changed.` The exploratory observation did not establish whether that toast appeared, was hidden or transient, whether the confirmation surface remained open, whether the click reached the current handler, or which replacement fence rejected the operation.

The confirmed defect is therefore “the required reset did not reach its RPC while the visible sync state said `Up to date`.” Silent failure, missing feedback, and a specific readiness-predicate defect remain hypotheses until Phase 1 proves them.

#### Phase 1 — Diagnosis completion criteria

- [ ] Reproduce the exact state deterministically on the tested source SHA:
  - signed-in active profile;
  - visible `Up to date`;
  - meaningful Study facts;
  - an older unexpired protected Start-over generation;
  - a second confirmed `Start over`.
- [ ] Prove whether the current click handler runs exactly once.
- [ ] Capture whether the confirmation surface, toast, focus, and `aria-live` feedback are visible after refusal.
- [ ] Identify the exact refusal status and predicate: activation, owner/profile/generation/revision mismatch, unknown cloud head, pending work, queued work, dirty state, connectivity, stale request, or another boundary.
- [ ] Add privacy-safe typed refusal propagation or an internal test seam where needed; do not put identifiers or profile contents in analytics.
- [ ] Produce a failing contract or browser regression matching the observed refusal.
- [ ] Preserve all owner, profile, generation, revision, activation, pending-work, queued-work, dirty-state, and connectivity fences during diagnosis.

Phase 1 is complete only when the failure is deterministic and one exact refusal boundary is proven. At that point, replace `needs-triage` with `ready-for-agent` or split a narrower implementation ticket.

#### Phase 2 — Behavior contract

- [ ] When `Up to date` is shown and the replacement predicate remains safe through confirmation, `start_over_my_learner_profile` is invoked exactly once.
- [ ] If safety becomes false before invocation, no RPC occurs, the prior profile remains active, the confirmation context remains understandable, and persistent actionable feedback explains that synchronization must finish before retry.
- [ ] The visible Progress sync state and Start-over readiness derive from compatible state rather than contradictory approximations.
- [ ] Success invokes the RPC with the active owner-derived profile ID, generation, and accepted revision.
- [ ] Success creates generation `N+1`, revision 1, installs a blank portable profile, and creates a protected reset receipt.
- [ ] The previously protected generation is retained according to the existing retention contract; the newest applicable reset becomes the Undo target.
- [ ] Reload retains the blank profile and new generation.
- [ ] A post-confirmation race leaves the prior profile unchanged and reports failure.
- [ ] Add focused persistence and lifecycle contracts for consecutive Start-over generations.
- [ ] Add a browser test for Start over while an older protected reset remains available.
- [ ] Keep existing Start-over-then-Undo coverage green.
- [ ] Run `supabase/tests/learner_profile_start_over.test.sql` only if RPC or database behavior changes, and prove CI routes and executes it.
- [ ] Prove the ordinary public accountless route remains unchanged.

#### Safety boundary

Destructive verification remains local. A hosted Start-over canary belongs to #196 and requires separate explicit authorization, exact-target confirmation, pre-action recovery evidence, and post-action generation/revision verification.

## Issue 7 — Investigate the historical AnkiConnect null-target failure

### Proposed title

> Investigate historical AnkiConnect null-target failure during UI refresh

### Proposed classification

- Labels after reconciliation: `ready-for-agent`.
- Classification: bounded investigation, not a confirmed current defect.
- Not a #196 blocker unless current-source reproduction proves a broader lifecycle defect.

### Draft issue body

#### Historical signal

The local Activity log contains a September 1 entry:

```text
AnkiConnect failed: Cannot set properties of null (setting 'textContent')
```

The September 4 session did not reproduce it. Determine whether current source can still produce a secondary DOM exception while `refreshAnkiStats()` or a later Study History rerender completes, or whether an older build produced the entry.

#### Acceptance criteria

- [ ] Identify the application/deployment commit associated with the entry if recoverable without exposing learner or integration data.
- [ ] Audit the Anki refresh success and failure paths plus the rerenders they trigger for stale or unguarded element references.
- [ ] Exercise deterministic local cases with AnkiConnect unavailable or returning an error.
- [ ] Cover Settings open/closed, Summary/Heatmap, an in-flight rerender, and relevant locale/profile transitions.
- [ ] Capture a source location and stack trace if reproduced, excluding deck names, card contents, learner data, tokens, and local integration secrets.
- [ ] If reproduced, add a failing regression before fixing the lifecycle or null-target defect.
- [ ] Preserve the original Anki availability error rather than replacing it with a secondary UI exception.
- [ ] Ensure repeated background refresh failures cannot flood the Activity log.
- [ ] If not reproduced, document the tested matrix and whether later source removed the suspected call, then close without speculative code changes.

#### Safety boundary

Keep this investigation local. Do not enable or exercise Anki integration on the hosted site.

## Coordination update for #196

After the issues have been reviewed and tracker labels reconciled, update #196 with:

- a link to the September 4 exploratory record, labelled **incident/reproduction evidence only**;
- local source commit `4b48df6c0519` and reported hosted deployed commit `018d256beac9910cfdbccc1da7ac725d4e88d166`;
- the hosted read-only safety boundary;
- the local automated baseline of 1,385 contract tests, 139 shared backend/function tests, passing Deno checks, and 311 passed/798 intentionally skipped Playwright cases;
- links to every created or updated ticket;
- a statement that the green baseline did not detect the interface defects and is not acceptance proof;
- a statement that none of the September 4 observations should satisfy a #196 checkbox without a fresh conforming release-readiness record.

Use GitHub's native issue dependencies to make #196 blocked by:

1. Existing #286.
2. The Start-over diagnosis/repair ticket.

Add the failed-backup `Later` defect as a native blocker only after documenting which #196 criterion it makes impossible to pass.

Link the Google-origin, Turnstile, heatmap, and Anki tickets from #196. Do not make them blockers unless current evidence shows they invalidate an explicit #196 criterion.

## Recommended execution order

### Prerequisite — Tracker contract

1. Reconcile the canonical triage labels with the live tracker.

### Wave 1 — Release blockers and diagnosis

2. Review and complete #286 against its full original and additive scope.
3. Complete Start-over Phase 1 diagnosis, then approve or split the narrow implementation.
4. Decide whether the failed-backup `Later` defect is a #196 blocker and implement its deadline-safe state behavior.

### Parallel human decision

5. Choose and implement the narrow Google Web client strategy.

This work is independent provider configuration and must not be folded into an application PR.

### Wave 2 — Focused interface correctness

6. Fix Turnstile's unconfigured/configured-unavailable distinction.
7. Fix heatmap tooltip accessibility state.

Keep these independent; they do not justify a general authentication or transient-UI refactor.

### Wave 3 — Historical investigation

8. Investigate the AnkiConnect null-target entry.

Do not delay confirmed defects unless current-source reproduction reveals a broader lifecycle problem.

### Final gate

9. After relevant fixes are deployed, capture a fresh deployment identity using the release-readiness inspector.
10. Rerun only invalidated #196 scenarios, then run the complete release-readiness gate.

## Verification policy

The pre-existing green run is a regression baseline only. For each code defect:

- add a focused failing regression before changing behavior;
- prove it turns green;
- run the nearest affected contract and browser suites;
- run database tests when an RPC, schema, grant, RLS policy, or database contract changes;
- run the full `npm run test:ci` gate before deployment;
- distinguish local proof, hosted CI proof, hosted provider proof, deployed-schema proof, live-browser proof, and product-owner approval;
- for gated/shared changes, identify the central gate and prove the ordinary public path remains unchanged.

Keep these adjacent paths green where relevant:

- email-code sign-in, sign-out, reload while signed out, and second sign-in;
- Summary/Heatmap switching, visible day details, and dismissal;
- Settings Account expansion and Progress sync status;
- accountless local-town continuity after failed backup;
- Start-over confirmation, refusal feedback, success, and independently successful Undo;
- hosted Google sign-in and persistent sign-out;
- exact internal/public route isolation.

Do not rerun unrelated destructive hosted scenarios merely because a focused local fix changed.

## #196 evidence policy

Every acceptance record used for #196 must be generated against the exact candidate and contain:

- full deployed source SHA and asset version;
- SHA-256 of cache-busted runtime-config bytes;
- UTC observation time;
- browser and OS versions where applicable;
- sanitized non-secret client and server gate states;
- named evidence source and bounded result metadata.

Local tests, the September 4 exploratory record, provider HTTP 200 responses, issue comments, and a healthy public route remain supporting context. They are not substitutes for conforming release-readiness records.

## Label contract

The repository defines these canonical roles:

- `needs-triage`: maintainer decision required;
- `needs-info`: reporter information required;
- `ready-for-agent`: fully specified and safe for unattended execution;
- `ready-for-human`: human/operator implementation required;
- `wontfix`: intentionally not actioned.

At the time of review, `needs-triage`, `needs-info`, and `ready-for-human` were absent from the live label list. Recheck before tracker work. If still absent, reconcile the tracker labels or the repository mapping before creating these issues. Do not substitute `ready-for-agent` for diagnosis, product decisions, or provider mutation.

## References

- [Original internal-canary issue plan](internal-canary-issue-plan-2026-09-04.md)
- [Internal-canary exploratory record](internal-canary-exploratory-2026-09-04.md)
- [Edenia domain language](../CONTEXT.md)
- [ADR-0001: signed-in profile-opening recovery](adr/0001-signed-in-profile-opening-recovery.md)
- [Release-readiness canaries](release-readiness-canaries.md)
- [Issue tracker conventions](agents/issue-tracker.md)
- [Triage labels](agents/triage-labels.md)
- [#196 — Prove release readiness with deployment-bound canaries](https://github.com/BriceChivu/Edenia/issues/196)
- [#286 — Internal-test signed-in profile opening can remain stuck in generic recovery](https://github.com/BriceChivu/Edenia/issues/286)
- [#190 — Start over and undo across devices](https://github.com/BriceChivu/Edenia/issues/190)
- [#187 — Keep local study available when cloud backup is rejected](https://github.com/BriceChivu/Edenia/issues/187)
- [#179 — Replace email magic links with same-device verification codes](https://github.com/BriceChivu/Edenia/issues/179)
- [#165 — Verify frictionless Turnstile protection across Edenia's email sign-in flow](https://github.com/BriceChivu/Edenia/issues/165)
- [Google Identity Services — Get your Google API client ID](https://developers.google.com/identity/gsi/web/guides/get-google-api-clientid?hl=en)
- [Supabase Auth — Login with Google](https://supabase.com/docs/guides/auth/social-login/auth-google)
