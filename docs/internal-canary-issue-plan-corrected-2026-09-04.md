# Internal canary issue plan — corrected review — 2026-09-04

## Review status

- **Status:** Corrected draft for product-owner review.
- **Basis:** [the reviewed revision](internal-canary-issue-plan-revised-2026-09-04.md), [the original issue plan](internal-canary-issue-plan-2026-09-04.md), the [September 4 exploratory record](internal-canary-exploratory-2026-09-04.md), current source, current tracker state, ADR-0001, and the release-readiness runbook.
- **Tracker:** GitHub Issues for `BriceChivu/Edenia`.
- **Safety boundary:** This document is planning only. Preparing it did not create or modify a GitHub issue, comment, label, dependency, pull request, provider configuration, deployment, database row, or learner profile.
- **Evidence boundary:** The September 4 observations are incident and reproduction evidence. They are not complete #196 release-readiness records.

## Tracker preparation boundary

One prerequisite blocks creation of the new tracker items:

1. **Reconcile triage labels.** Reconcile the repository's canonical triage labels with the live GitHub label set. Human-owned work must be classifiable as `ready-for-human`; unresolved work must be classifiable as `needs-triage` or `needs-info`.

A separate publication prerequisite applies only before posting incident evidence or updating #196:

- **Publish the sanitized exploratory record.** The September 4 exploratory record and this plan are local, untracked files at review time. Before linking the record from GitHub, publish its reviewed, sanitized contents at a stable repository commit URL or include the sanitized record directly in the relevant issue comment. Do not publish credentials, endpoints, emails, UUIDs, tokens, sessions, raw rows, or learner-profile contents.

The following decisions belong inside their proposed tracker items and do not block creating the other issues:

- **Google localhost strategy:** Create Issue 2 as `needs-triage`. Choose the Google and Supabase trust model inside that issue before any provider mutation, then replace `needs-triage` with `ready-for-human`.
- **Failed-backup blocker status:** Create Issue 3 and link it from #196. Map it to a specific #196 acceptance outcome before adding a native dependency.
- **Start-over diagnosis:** Create Issue 6 as diagnosis-first work. Reproduce and identify the refusal boundary before applying `ready-for-agent` or authorizing a behavior change.

No provider mutation, destructive hosted canary, gate change, deployment, or release-evidence claim is authorized by this plan.

## Recommendation

Do not create another umbrella issue. Existing issue [#196 — Prove release readiness with deployment-bound canaries](https://github.com/BriceChivu/Edenia/issues/196) owns the release-readiness outcome.

The exploratory report should produce this tracker work:

| Report finding | Tracker treatment | #196 relationship |
| --- | --- | --- |
| Hosted signed-in profile opening is stuck | Update existing [#286](https://github.com/BriceChivu/Edenia/issues/286); preserve all original acceptance criteria and add the uncovered fail-closed cases below | Native blocker |
| Google rejects the localhost test origin | Create one human-owned provider decision/configuration issue before choosing or changing a client | Link; not automatically a blocker |
| `Later` does not dismiss a failed backup notice | Create one code defect with explicit deadline precedence | Candidate blocker pending criterion mapping |
| Hidden heatmap tooltip remains exposed | Create one accessibility defect with an explicit Escape contract | Link; not automatically a blocker |
| Local email sign-in shows false Turnstile guidance | Create one fail-closed code defect | Link; not automatically a blocker |
| Confirmed `Start over` does not reach its RPC | Create one diagnosis-first defect; do not apply `ready-for-agent` yet | Native blocker |
| Historical AnkiConnect null-target entry | Create one bounded, diagnosis-only investigation; do not authorize an unknown implementation fix | Link; not a blocker |

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
- Keep #286 open until the full local/CI matrix passes, the reviewed fix is merged and deployed, and the separate narrow hosted verification reaches a safe terminal outcome.

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

This narrows the observed live failure to profile opening after successful authentication and owner-scoped profile resolution. The observation did not establish Auth failure, database unavailability, or a missing profile head. The shape check was not a substitute for every client-side semantic and integrity validation performed while opening the profile.

The local checkout used by the exploratory record reached `4b48df6c051971d13a28bbda5aa4d37801f94e1d`. It contains focused work for opening a valid cloud profile past malformed durable metadata, but it had no pull request and was not present in the deployed release above.

This comment is incident evidence only. It must not be counted as a #196 canary record because it does not contain the complete deployment-identity, UTC, browser/OS-version, runtime-config-hash, and gate-state fields required by the release-readiness format.

### Additive completion criteria

- [ ] Review the local fix against ADR-0001, especially its activation fence and the distinction between an empty local namespace and meaningful local progress.
- [ ] Prove that a verified, structurally valid cloud profile opens past malformed durable import or sync bookkeeping only when the local namespace is meaningfully empty and the exact captured malformed bytes remain current.
- [ ] Distinguish a storage read exception from an absent or successfully read malformed record. Storage unavailability must not trigger cleanup, metadata replacement, or profile activation that assumes the unknown record is safe to discard.
- [ ] Add focused read-failure regressions for both durable import and sync storage, and prove the unknown bytes are neither deleted nor replaced.
- [ ] Cover structurally valid but stale durable metadata, including a valid import with a missing or stale sync binding and an obsolete valid sync identity.
- [ ] Reconcile only payload-free stale bindings that can be proven safe. Preserve and fail closed around pending, queued, dirty, owner-mismatched, lineage-mismatched, or otherwise data-bearing state.
- [ ] Preserve fail-closed behavior when a non-empty local profile has unverified ownership, lineage, or meaningful progress that must not be overwritten.
- [ ] Cover the exact `?internal_test=1` route and its isolated storage namespace.
- [ ] Cover stale requests, changed durable values, storage-write failure, storage-read failure, and both relevant cross-tab completion orders where metadata repair is affected.
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

### Verification allocation and safety boundary

Local contracts and browser fixtures own malformed/stale metadata, storage exceptions, cross-tab ordering, invalid heads, recovery candidates, conflicts, retries, and all other state construction that would be unsafe or impractical to manufacture against the hosted learner profile.

Hosted verification is a separate, narrow smoke limited to the approved internal-canary account and the minimum sign-in, retry, reload, and sign-out actions. It proves that the deployed fix reaches the correct terminal outcome for the existing incident state. Channel, video, history, reminder, import, restore, metadata corruption, and Start-over actions are outside this ticket's hosted verification.

## Issue 2 — Restore supported localhost Google sign-in without broadening trust implicitly

### Proposed title

> Decide and configure the narrow Google and Supabase trust model for localhost Google sign-in

### Proposed classification

- Initial labels after label reconciliation: `bug`, `needs-triage`.
- Execution owner: human/operator.
- Create the issue before the strategy is chosen so it can hold the decision record.
- Replace `needs-triage` with `ready-for-human` only after the Google client, Supabase project, accepted audiences, verification steps, and rollback are explicitly chosen.
- Never apply `ready-for-agent`; the essential mutation is in Google and may also require approved production Supabase Auth configuration.
- Reference completed Auth issue #179 and release-readiness issue #196 without reopening #179.

### Draft issue body

#### Summary

Google Identity Services rejected Edenia's localhost test origin before any credential flow began.

Observed environment:

- `http://localhost:8000/?internal_test=1`
- localhost temporarily using the hosted public Google client ID and hosted Supabase project

Observed provider message:

```text
[GSI_LOGGER]: The given origin is not allowed for the given client ID.
```

The official Google control produced no account chooser. Email-code authentication remained usable locally, and the same Google flow worked on the hosted internal origin. This establishes an origin/client mismatch; it does not decide which Google client and Supabase audience configuration should trust localhost.

#### Test objective and trust boundary

The requested path is a localhost UI using the hosted Supabase Auth project so it can exercise the production-backed Internal account flow. A completely local Supabase project is a different test objective: it can test local Auth integration, but it cannot prove the local-to-hosted canary path or operate on the approved hosted canary identity.

Compare and explicitly choose one supported model:

1. **Dedicated localhost Google Web client with hosted Supabase Auth.** Local runtime uses a separate public Google Web client ID. The production Google client's JavaScript origins remain unchanged. The hosted Supabase Google provider must be explicitly configured to accept both the production Web-client audience and the dedicated localhost Web-client audience, using the current provider-supported client-ID list and ordering. The primary production client and its secret must not be overwritten merely to admit the additional ID-token audience.
2. **Narrow localhost origins on the production Google Web client.** Local runtime continues to use the production public client ID. Add only Google's required `http://localhost` and `http://localhost:8000` JavaScript origins, preserve the production origin, and define the exception's owner, removal trigger, and rollback. The hosted Supabase accepted-audience configuration remains the single production client ID unless current provider requirements prove otherwise.

If current Google or Supabase configuration cannot safely support model 1 for a second Web-client ID, reject that option explicitly rather than silently substituting a local Supabase project. Prefer the smallest trust surface that still proves the stated test objective.

Record the chosen option and rejected alternative without recording client secrets, provider secrets, tokens, nonces, sessions, emails, UUIDs, or learner identifiers.

#### Acceptance criteria

- [ ] Confirm the current Edenia GIS `signInWithIdToken` flow, the Google Web client ID selected by each runtime, the Supabase Auth project receiving the token, and the exact non-secret accepted audience set.
- [ ] Recheck current Google and Supabase localhost, ID-token, nonce, and multiple-client-ID guidance at execution time.
- [ ] Record the chosen model, rejected alternative, trust-boundary rationale, exact provider surfaces to change, owner, and rollback before mutation.
- [ ] If using the dedicated localhost client, keep the production Google client's JavaScript origins unchanged; use the dedicated client only in local runtime; and prove the hosted Supabase provider preserves every existing approved audience, adds only the intended localhost audience, and does not replace the primary production client or secret.
- [ ] If using the production-client exception, add only `http://localhost` and `http://localhost:8000`, preserve `https://www.edenia.study`, and record an explicit removal/rollback trigger.
- [ ] Do not add wildcards, unrelated hosts, `127.0.0.1`, or unrelated ports without separate evidence and approval.
- [ ] Do not rotate credentials or change a provider secret merely to alter JavaScript origins or accepted ID-token audiences.
- [ ] On the exact localhost internal route, the official Google button renders and opens the account chooser without the origin error.
- [ ] The approved account can authenticate through the intended hosted Supabase project and sign out without changing learner-profile generation, revision, or retained-version count.
- [ ] The hosted internal origin continues to authenticate successfully through the production client.
- [ ] An unrelated localhost port remains unauthorized.
- [ ] Record only sanitized provider configuration and browser evidence.
- [ ] Update the canonical non-secret provider checklists in `docs/account-authentication.md`, `docs/account-reminder-operations.md`, and `docs/deployment-and-releases.md` where the chosen strategy changes their stated contract.

#### Non-goals

- Do not change learner-profile database behavior.
- Do not treat a completely local Supabase project as proof of the production-backed localhost canary objective.
- Do not replace Google's official button.
- Do not add Google One Tap, automatic account selection, new OAuth scopes, or another Auth method.
- Do not broaden the issue to unrelated application code or headers unless origin authorization succeeds and new evidence proves a separate application defect.

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

> Make Study History heatmap details semantically visible, dismissible, and stale-free

### Proposed classification

- Labels after reconciliation: `bug`, `ready-for-agent`.

### Draft issue body

#### Summary

A selected Study History Heatmap day populates `#heatmapTooltip`. Returning to `Summary` removes only the `show` class. CSS makes the tooltip transparent and non-interactive, but the element remains displayed and retains the previously selected day's details in the accessibility tree.

Existing browser coverage verifies only visual class state and currently asserts that pressing Escape leaves the tooltip open. That assertion conflicts with the keyboard-dismissal contract for a tooltip shown on hover or focus.

#### Expected behavior

A dismissed tooltip is absent from the accessibility tree and retains no stale readable details. Escape dismisses an open tooltip without moving focus from its triggering heatmap day. When shown, the active day has one clear accessible description; the implementation must not double-announce identical details from both the existing day `aria-label` and a new tooltip relationship.

Choose and test one coherent semantic pattern:

1. Keep the heatmap day's existing complete accessible label as the canonical screen-reader presentation and keep the visual tooltip hidden from assistive technology; or
2. Use a real `role="tooltip"` relationship such as `aria-describedby` only while the tooltip is relevant, adjusting the trigger's accessible name so the same details are not announced twice.

Do not create a focusable or interactive tooltip. If future content must receive focus, that is a different non-modal disclosure/dialog pattern and outside this issue.

#### Acceptance criteria

- [ ] Dismissal excludes the tooltip and all stale day details from the accessibility tree.
- [ ] Dismissal clears or semantically hides previously selected day details.
- [ ] Summary/Heatmap switching, blur, pointer exit, outside click, toggle-close, rerender, and Escape use the same semantic hiding contract.
- [ ] Escape dismisses the open tooltip while focus remains on the triggering heatmap day.
- [ ] Replace the existing browser assertion that Escape leaves the tooltip open with a regression for the required dismissal behavior.
- [ ] Showing a new day restores the chosen semantic presentation and exposes only that day's information.
- [ ] A positive accessibility assertion proves exactly one coherent accessible presentation for the active day's details; absence of the `show` class is insufficient.
- [ ] Tooltip position, motion, and desktop/coarse-pointer behavior remain unchanged except for the deliberate Escape behavior.
- [ ] Summary/Heatmap keyboard selection, saved view preference, and day-detail opening continue to work.
- [ ] Extend the exact Heatmap-day-to-Summary browser reproduction.
- [ ] Verify keyboard, pointer, outside-click, view-switch, and rerender dismissal.
- [ ] Check the ordinary local route and `?internal_test=1`, because the implementation is shared.

#### Evidence boundary

The current report confirms the stale accessibility-tree failure only on localhost's internal route. Do not claim hosted-public reproduction without separate safe evidence.

#### Accessibility reference

- [WAI-ARIA Authoring Practices — Tooltip Pattern](https://www.w3.org/WAI/ARIA/apg/patterns/tooltip/)

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

- Initial labels after label reconciliation: `bug`, `needs-triage`.
- Native blocker of #196 because the required Start-over canary did not produce a reset.
- Create this diagnosis issue before the refusal boundary is known.
- Do not apply `ready-for-agent` or authorize Phase 2 implementation until Phase 1 produces a deterministic failing regression and identifies the exact refusal boundary.
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
- [ ] Add only the minimum privacy-safe typed refusal propagation or internal test seam needed to make the refusal observable; do not change the refusal behavior during diagnosis and do not put identifiers or profile contents in analytics.
- [ ] Produce a failing contract or browser regression matching the observed refusal.
- [ ] Preserve all owner, profile, generation, revision, activation, pending-work, queued-work, dirty-state, and connectivity fences during diagnosis.

Phase 1 is complete only when the failure is deterministic and one exact refusal boundary is proven. At that point, revise this issue with a narrow behavior contract and replace `needs-triage` with `ready-for-agent`, or split a narrower implementation ticket. Phase 1 completion alone does not authorize an unspecified fence relaxation.

#### Phase 2 — Behavior contract to confirm after diagnosis

- [ ] When `Up to date` is shown and the proven replacement predicate remains safe through confirmation, `start_over_my_learner_profile` is invoked exactly once.
- [ ] If safety becomes false before invocation, no RPC occurs, the prior profile remains active, the confirmation context remains understandable, and persistent actionable feedback explains what must finish before retry.
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

> Determine whether current source can reproduce the historical AnkiConnect null-target failure

### Proposed classification

- Labels after reconciliation: `ready-for-agent`.
- Classification: bounded, diagnosis-only investigation; not a confirmed current defect.
- The issue does not authorize a production-code fix whose root cause and behavior contract are not yet known.
- Not a #196 blocker unless current-source reproduction proves a broader lifecycle defect that invalidates an explicit criterion.

### Draft issue body

#### Historical signal

The local Activity log contains a September 1 entry:

```text
AnkiConnect failed: Cannot set properties of null (setting 'textContent')
```

The September 4 session did not reproduce it. Determine whether current source can still produce a secondary DOM exception while `refreshAnkiStats()` or a later Study History rerender completes, or whether an older build produced the entry.

#### Diagnosis acceptance criteria

- [ ] Identify the application/deployment commit associated with the entry if recoverable without exposing learner or integration data.
- [ ] Audit the Anki refresh success and failure paths plus the rerenders they trigger for stale or unguarded element references.
- [ ] Exercise deterministic local cases with AnkiConnect unavailable or returning an error.
- [ ] Cover Settings open/closed, Summary/Heatmap, an in-flight rerender, and relevant locale/profile transitions.
- [ ] Capture a source location and stack trace if reproduced, excluding deck names, card contents, learner data, tokens, and local integration secrets.
- [ ] If reproduced, preserve the smallest deterministic failing regression or fixture and document the exact lifecycle/null-target boundary.
- [ ] If reproduced, stop at diagnosis, change the issue back to `needs-triage`, and define or split a narrow implementation issue before changing production behavior.
- [ ] If not reproduced, document the tested matrix and whether later source removed the suspected call, then close without speculative code changes.

#### Explicitly separate observation

`refreshAnkiStats({ silent: true })` currently passes a `silent` option while the visible catch path can append an Activity-log warning on every background failure. Log suppression, deduplication, or coalescing is independent of the historical null-target signal and has no approved behavior contract in this plan. Do not add it to this investigation's acceptance criteria. If the product owner wants that behavior changed, first decide whether silent failures should be omitted, coalesced by cause/time window, or retained with a bounded count, then create a separate issue.

#### Safety boundary

Keep this investigation local. Do not enable or exercise Anki integration on the hosted site.

## Coordination update for #196

After the tracker labels are reconciled, the sanitized exploratory record has a stable reviewable URL or is included directly in the comment, and the proposed issues have been reviewed, update #196 with:

- the stable September 4 exploratory record, labelled **incident/reproduction evidence only**;
- local source commit `4b48df6c051971d13a28bbda5aa4d37801f94e1d` and reported hosted deployed commit `018d256beac9910cfdbccc1da7ac725d4e88d166`;
- the hosted read-only safety boundary;
- the September 4 local automated baseline, explicitly bound to local source `4b48df6c051971d13a28bbda5aa4d37801f94e1d`: 1,385 contract tests, 139 shared backend/function tests, passing Deno checks, and 311 passed/798 intentionally skipped Playwright cases;
- links to every created or updated ticket;
- a statement that the green baseline did not detect the interface defects and is not acceptance proof;
- a statement that none of the September 4 observations should satisfy a #196 checkbox without a fresh conforming release-readiness record.

Do not post a local relative Markdown link or an untracked filesystem path to GitHub.

Use GitHub's native issue dependencies to make #196 blocked by:

1. Existing #286.
2. The Start-over diagnosis/repair ticket.

Add the failed-backup `Later` defect as a native blocker only after documenting which #196 criterion it makes impossible to pass.

Link the Google-origin, Turnstile, heatmap, and Anki tickets from #196. Do not make them blockers unless current evidence shows they invalidate an explicit #196 criterion.

## Recommended execution order

### Prerequisite — Tracker contract

1. Reconcile the canonical triage labels with the live tracker.

### Tracker creation

2. Create Issues 2–7 with the classifications and boundaries above.

### Evidence publication and coordination

3. Review and publish the sanitized exploratory record at a stable URL, or include its sanitized contents directly in the issue updates.
4. Update #286 with the incident evidence and additive criteria.
5. Update #196 with the published evidence link or included record, issue links, and only the approved native dependencies.

### Wave 1 — Release blockers and diagnosis

6. Review and complete #286 against its full original and additive local/CI scope, then perform only its narrow hosted smoke after deployment.
7. Complete Start-over Phase 1 diagnosis, then approve, revise, or split the narrow implementation.
8. Decide whether the failed-backup `Later` defect is a #196 blocker and implement its deadline-safe state behavior.

### Parallel human decision

9. Choose and implement the narrow Google Web-client and Supabase-audience strategy.

This is independent provider configuration and must not be folded into an application PR. It may change Google only or both Google and the hosted Supabase Auth accepted-audience configuration, depending on the approved model.

### Wave 2 — Focused interface correctness

10. Fix Turnstile's unconfigured/configured-unavailable distinction.
11. Fix heatmap tooltip accessibility state, including Escape dismissal and the contrary existing regression.

Keep these independent; they do not justify a general authentication or transient-UI refactor.

### Wave 3 — Historical investigation

12. Run the diagnosis-only AnkiConnect investigation.

Do not delay confirmed defects unless current-source reproduction reveals a broader lifecycle problem. Do not implement an unknown Anki fix or activity-log policy inside the investigation ticket.

### Final #196 gate — exact required sequence

After every release-relevant application, provider, database, and runtime change is final:

13. Keep the server profile-data gate `off`, remove any developer-canary owner, and keep the bounded Auth-monitor canary disabled.
14. Deploy the final candidate and capture a fresh deployment identity with the release-readiness inspector.
15. Start a new 24-hour `operations-monitoring` soak at the first healthy naturally scheduled post-inspection check. Restart the full window after any deployment, runtime-config change, relevant provider/database/operations change, unexplained gap over ten minutes, `provider_unavailable`, or `network_error` result.
16. After the soak passes, obtain separate authorization to set only the server profile-data gate to `developer-canary` for the exact approved tester. Do not change Pages bytes or runtime configuration.
17. Re-inspect and prove that the deployed commit, asset version, and runtime-config hash still match the soak candidate. Collect the seven developer-canary profile scenarios in the order required by the runbook.
18. Return the server profile-data gate to `off`, remove the developer owner, run `switch-off-and-rerun`, and collect every final-context scenario marked invalid by the repository's rerun planner.
19. Re-inspect the final gate-off candidate, validate the complete report, confirm no known progress-loss or ownership defect only when supported, and request explicit product-owner cutover approval.

Do not describe step 15 as merely a focused rerun: an artifact or runtime-config change invalidates the prior deployment-bound soak. Do not manually retain records that the rerun planner marks invalid.

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
- Summary/Heatmap switching, visible day details, Escape, and other dismissal paths;
- Settings Account expansion and Progress sync status;
- accountless local-town continuity after failed backup;
- Start-over confirmation, refusal feedback, success, and independently successful Undo;
- hosted Google sign-in and persistent sign-out;
- exact internal/public route isolation.

Do not rerun unrelated destructive hosted scenarios merely because a focused local fix changed. The release-readiness rerun planner, exact candidate identity, and approved hosted safety boundary determine what must run.

## #196 evidence policy

Every acceptance record used for #196 must be generated against the exact candidate and contain:

- full deployed source SHA and asset version;
- SHA-256 of cache-busted runtime-config bytes;
- UTC observation time;
- browser and OS versions where applicable;
- sanitized non-secret client and server gate states;
- named evidence source and bounded result metadata.

Local tests, the September 4 exploratory record, provider HTTP 200 responses, issue comments, and a healthy public route remain supporting context. They are not substitutes for conforming release-readiness records.

The gate phases are ordered and distinct: gate-off monitoring, approved developer-canary profile evidence, then gate-off switch-off/final-context evidence. A new deployment or runtime configuration restarts the deployment-bound soak even when the code change is narrow.

## Label contract

The repository defines these canonical roles:

- `needs-triage`: maintainer decision required;
- `needs-info`: reporter information required;
- `ready-for-agent`: fully specified and safe for unattended execution;
- `ready-for-human`: human/operator implementation required;
- `wontfix`: intentionally not actioned.

At the time of review, `needs-triage`, `needs-info`, and `ready-for-human` were absent from the live label list. Recheck before tracker work. If still absent, reconcile the tracker labels or the repository mapping before creating these issues. Do not substitute `ready-for-agent` for diagnosis, product decisions, provider mutation, destructive hosted verification, or product-owner approval.

## References

- [Reviewed internal-canary issue plan](internal-canary-issue-plan-revised-2026-09-04.md)
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
- [WAI-ARIA Authoring Practices — Tooltip Pattern](https://www.w3.org/WAI/ARIA/apg/patterns/tooltip/)
