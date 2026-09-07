# Internal canary Codex execution plan — corrected — 2026-09-04

## Status and purpose

- **Status:** Corrected execution-oriented draft for product-owner approval.
- **Purpose:** Turn the September 4 exploratory findings into tracker packets that Codex can diagnose, implement, validate, and deliver with minimal product-owner intervention.
- **Basis:** [the exploratory record](internal-canary-exploratory-2026-09-04.md), current repository guidance, ADR-0001, the release-readiness runbook, current source, and current tracker state.
- **Tracker:** GitHub Issues for `BriceChivu/Edenia`.
- **Evidence boundary:** September 4 observations are incident and reproduction evidence. They are not complete #196 release-readiness records.
- **Execution boundary:** This document defines scope and safe transitions. It is not standing authorization for tracker writes, external-provider mutation, push, pull request creation, merge, deployment, gate changes, hosted learner-profile access, or destructive canaries.
- **Publication boundary:** This document is self-contained. Earlier local planning drafts are historical working material and do not need to be published or linked.

All implementation and provider operation described here is intended to be performed by Codex. The product owner should be needed only to choose an irreducible product or trust decision, explicitly authorize sensitive external actions, and complete authentication or confirmation that a provider prevents Codex from completing.

## Authority contract

A Codex task must name the active stage and the target issue. Authority for one stage does not imply authority for another.

| Stage | Codex may do | Required authority | Completion boundary |
| --- | --- | --- | --- |
| `tracker-preparation` | Reconcile labels; create or update named issues, comments, links, dependencies, and closures | An explicit request to perform the exact tracker operations | The authorized tracker mutations are complete; no source, provider, or hosted state changed |
| `local-diagnosis` | Inspect source/history; run existing tests; use disposable browser/database fixtures read-only with respect to repository source | An explicit request to diagnose the named issue | The evidence and recommendation are recorded; no repository, tracker, provider, or hosted state changed |
| `local-diagnostic-edits` | Add a failing test, test-only seam, or behavior-preserving diagnostic needed to isolate the named issue | Explicit authorization for local diagnostic edits | The refusal or failure is deterministic; production behavior remains unchanged |
| `local-implementation` | Edit local product source and tests to satisfy the proven contract | An explicit request to implement or fix the named issue | The local work is complete and reviewed; no remote, tracker, provider, or hosted state changed |
| `delivery` | Create or update a branch; commit; push; open/update a PR; wait for CI; merge; deploy | The request must explicitly name the permitted delivery actions | Only the named delivery actions are complete; deployment is not implied by PR authority |
| `provider-decision` | Inspect current non-secret Google/Supabase configuration read-only; compare supported options; recommend one | An explicit request to prepare the decision | One concise recommendation, rollback, and exact proposed surfaces are ready for product-owner choice |
| `provider-execution` | Use the approved Google/Supabase operator surfaces to apply and inspect the chosen configuration | A recorded product-owner choice plus an explicit request authorizing the exact provider surfaces | Provider configuration and rollback evidence are recorded; repository edits require `local-implementation`, and live checks require `hosted-safe-smoke` |
| `hosted-safe-smoke` | Perform only the named non-destructive hosted actions against the exact approved route/account | Explicit authorization naming the route, account class, allowed actions, and pre/post checks | The narrow smoke reaches a safe terminal outcome and pre/post state is unchanged where required |
| `hosted-destructive-or-gate` | Change a server gate or perform Start over, import, restore, conflict resolution, backup retry, or another hosted state-changing canary | Separate explicit authorization for the exact target and recovery plan | The runbook-required postconditions and recovery evidence are complete |

Completing one stage may produce a recommendation for the next stage, but it never authorizes that stage. An issue label is classification, not authority. Every tracker mutation—including adding a label or dependency, posting a comment, or closing an issue—requires `tracker-preparation` authority. If a task lacks the next authority, Codex stops, records what is complete, and asks only for the missing authority.

## Tracker preparation

### 1. Choose stable supporting evidence

Tracker items may be created from the self-contained packet text without publishing either planning document. Before adding a source-document link to a public issue or #196, choose one of these evidence paths:

1. With separate `delivery` authority, publish this corrected plan and the sanitized exploratory record, then use stable commit-bound URLs; or
2. Embed the required sanitized evidence directly in the issue/comment and omit local-document links.

In either case, each issue body must contain its own baseline, starting points, acceptance criteria, validation, and stop conditions. Publish no credentials, private provider/project endpoints, emails, UUIDs, tokens, sessions, raw database rows, learner-profile contents, or local filesystem paths. The public Edenia route and official documentation URLs may remain.

The historical evidence anchors are:

- local exploratory checkout: `4b48df6c051971d13a28bbda5aa4d37801f94e1d` on `codex/issue-286-profile-ready-recovery`;
- hosted incident deployment: `018d256beac9910cfdbccc1da7ac725d4e88d166`;
- #286 local work: commits `276038c`, `cd93969`, and `4b48df6`, with no pull request at the time of the September 4 review.

These are historical anchors, not instructions to build on a stale base. At execution time, Codex must fetch the current remote state, record the current `origin/master` SHA, and compare the target branch against that exact base without discarding unrelated user work.

Tracker preparation is not globally blocked on document publication. Only a step that intends to cite a source document waits for a stable URL. Authority to create or update tracker items does not authorize committing or publishing documents, and earlier local planning drafts must not be published merely to satisfy a reference.

### 2. Reconcile the exact triage labels

The repository contract requires these five labels. Preserve existing matching labels and create only missing ones:

| Label | Description | Suggested color |
| --- | --- | --- |
| `needs-triage` | Maintainer decision required | `FBCA04` |
| `needs-info` | Reporter or product-owner information required | `D876E3` |
| `ready-for-agent` | Fully specified, ready for an AFK agent | `0E8A16` |
| `ready-for-human` | Requires human implementation | `1D76DB` |
| `wontfix` | Will not be actioned | `FFFFFF` |

Do not remap the repository documentation to semantically different existing labels. Verify the final live names and descriptions against `docs/agents/triage-labels.md`. This label reconciliation is tracker administration only; it authorizes no issue creation or implementation unless `tracker-preparation` authority also exists.

### 3. Tracker inventory

Do not create another umbrella issue. Existing [#196](https://github.com/BriceChivu/Edenia/issues/196) owns the release-readiness outcome.

| Finding | Tracker treatment | Initial execution state | #196 relationship |
| --- | --- | --- | --- |
| Hosted profile opening is stuck | Update [#286](https://github.com/BriceChivu/Edenia/issues/286); preserve its original scope and add Packet 1 | `bug`, `ready-for-agent` after the update | Native blocker |
| Google rejects localhost | Create Packet 2 | `bug`, `needs-triage` | Link; not automatically a blocker |
| Failed-backup `Later` does not dismiss | Create Packet 3 | `bug`, `ready-for-agent` | Link; blocker only after exact criterion mapping |
| Hidden heatmap details remain exposed | Create Packet 4 | `bug`, `ready-for-agent` | Link; not automatically a blocker |
| False Turnstile guidance | Create Packet 5 | `bug`, `ready-for-agent` | Link; not automatically a blocker |
| Confirmed Start over did not reach its RPC | Create Packet 6 as attribution and diagnosis work | `bug`, `ready-for-agent` for diagnosis | Link initially; native blocker only after clean-base reproduction |
| Historical AnkiConnect null-target entry | Create Packet 7 | `ready-for-agent` | Link only if current reproduction invalidates a #196 criterion |

Manual paths that passed are not separate issues. They are adjacent non-regression checks for affected packets and context for a later #196 rerun.

### 4. Assemble self-contained issue bodies

For Packets 1, 3, 4, and 5, the GitHub issue body is the complete packet plus the **Shared implementation contract** below. Packet 6 includes the **Shared diagnostic contract** for Phases 0–1 and the implementation contract only after implementation is explicitly authorized. Packet 7 includes only the diagnostic contract unless a separately authorized follow-up is implemented. Packet 2 includes the Authority contract, its full decision/execution packet, and its provider-specific preconditions.

Include the applicable contract in the issue itself; a link to this plan is supporting context, not a substitute. Do not create an issue from only the tracker-inventory row, proposed title, or summary.

## Shared diagnostic contract

Every diagnosis-only packet uses this process:

1. Record the exact historical, current-base, and working SHAs required by the packet.
2. Reproduce with existing tests and disposable synthetic fixtures first.
3. Preserve the named route, namespace, locale, identity, and lifecycle boundaries.
4. If `local-diagnostic-edits` is separately authorized, limit edits to the smallest failing regression, test-only seam, or behavior-preserving diagnostic.
5. Report the exact result, evidence class, uncertainty, and recommended next stage.
6. Stop before product behavior changes, tracker mutations, delivery, provider mutation, or hosted access unless that next stage is independently authorized.

## Shared implementation contract

Every authorized source-changing packet uses this process in addition to its packet-specific criteria:

1. Record the current remote base SHA and the exact working SHA before diagnosis.
2. Reproduce the defect with the smallest deterministic local contract or browser fixture before changing behavior.
3. Preserve the exact internal/public route, storage namespace, locale, and lifecycle boundaries named by the packet.
4. Make the narrowest behavior change that satisfies the packet. Preserve unrelated user changes.
5. Prove the focused regression turns green, then run the nearest affected contract and browser suites.
6. Run database tests when an RPC, schema, grant, RLS policy, or database contract changes. Confirm CI routes and invokes every relevant pgTAP file; a green job name alone is not proof.
7. Run `npm run test:ci` before delivery. Do not rebuild `_site` while a browser suite is using it.
8. For shared or gated code, identify the central gate and prove the ordinary public path remains unchanged.
9. Review the final diff against the packet and repository standards. Resolve every correctness or scope finding before claiming local completion.
10. Report local proof, hosted CI proof, deployed-schema proof, hosted-provider proof, live-browser proof, and product-owner approval as separate evidence classes.

Local completion never implies tracker updates, delivery, provider work, or hosted verification. Those steps use the authority contract above.

## Packet 1 — Complete existing #286 profile-opening recovery

### Tracker action and classification

- Update, do not duplicate, [#286 — Internal-test signed-in profile opening can remain stuck in generic recovery](https://github.com/BriceChivu/Edenia/issues/286).
- Keep `bug` and add `ready-for-agent` after the self-contained update below is posted.
- Add #286 as a native blocker of #196.
- Keep #286 open through local completion, delivery, deployment, and its separately authorized narrow hosted smoke.

### Historical evidence

- Route: `https://www.edenia.study/?internal_test=1`.
- Hosted incident deployment: `018d256beac9910cfdbccc1da7ac725d4e88d166`.
- Browser family: Chrome.
- Google authentication and every `resolve_my_learner_profile` request returned HTTP 200.
- A sanitized database shape check found the expected envelope structure, schema/version, profile object, SHA-256 metadata, 43-character digest, and matching row digest and byte-length metadata.
- The hosted head remained generation 4, revision 2, with 88 retained versions before and after testing.
- `Try again`, reload, sign-out/sign-in, and a second retry returned to the generic recovery gate.
- The local #286 branch reached `4b48df6c051971d13a28bbda5aa4d37801f94e1d`; it was neither pushed nor deployed at review time.

This evidence narrows the incident to profile opening after successful authentication and owner-scoped resolution. It does not prove every client-side semantic or integrity check passed, and it is not a #196 canary record.

### Start here

- `docs/adr/0001-signed-in-profile-opening-recovery.md`
- `src/integrations/learner-profile-cloud-persistence.js`
  - `readDurableImport`
  - `readStoredSyncRecord` / `readSyncRecord`
  - durable-recovery and `profile_ready` resolution paths
- `src/state/learner-profile-lifecycle.js`
  - activation and committed metadata-repair fencing
- `tests/contracts/learner-profile-cloud-persistence.test.mjs`
- `tests/contracts/learner-profile-lifecycle.test.mjs`
- `tests/e2e/learner-profile-access.spec.mjs`

### Local implementation scope

- Review the existing branch against current `origin/master`, preserving its commits and incorporating the current base without destructive reset.
- Resolve the three known P1 classes: unreadable storage, valid-but-stale durable metadata, and activation/concurrency fencing.
- Keep malformed, stale, unavailable, data-bearing, owner-mismatched, and lineage-mismatched states distinct.
- Preserve `?internal_test=1` storage isolation and the ordinary public accountless path.

### Completion criteria

- [ ] A verified, structurally valid cloud profile opens past malformed durable import or sync bookkeeping only when the local namespace is meaningfully empty and the exact captured malformed bytes remain current.
- [ ] Storage read exceptions are distinct from absent and successfully read malformed records. Storage unavailability triggers no cleanup, replacement, or activation that assumes unknown bytes are disposable.
- [ ] Focused read-failure regressions cover durable import and sync storage and prove unknown bytes are neither deleted nor replaced.
- [ ] Structurally valid but stale metadata is covered, including a valid import with a missing or stale sync binding and an obsolete valid sync identity.
- [ ] Only payload-free stale bindings proven safe are reconciled. Pending, queued, dirty, owner-mismatched, lineage-mismatched, and otherwise data-bearing state remains protected and fail-closed.
- [ ] Non-empty local progress with unverified ownership or lineage is never overwritten.
- [ ] Stale requests, changed durable values, storage-write failure, storage-read failure, and both metadata-repair cross-tab completion orders have explicit expected results and regressions.
- [ ] A valid current cloud head opens normally.
- [ ] An unusable current head restores only a verified same-generation trusted profile predecessor.
- [ ] Automatic recovery never crosses a Start-over generation boundary.
- [ ] `recovery_required` with no trusted state enters language-selection onboarding.
- [ ] A genuine local or protected recovery candidate remains actionable.
- [ ] Valid divergent profiles use the progress-conflict path.
- [ ] Transient provider or network failure remains retryable as `waiting-cloud`.
- [ ] Unverified ownership requires reauthentication and never activates a fallback profile.
- [ ] Retry exhaustion cannot leave generic `recovering` as the only path.
- [ ] The exact internal route uses its isolated namespace, while the ordinary public route remains accountless and unchanged.

### Local validation

- Run the two focused persistence/lifecycle contract files.
- Build once, then run the focused learner-profile-access browser cases against the stable build.
- Run the complete contract and relevant desktop learner-profile-access suites.
- Run the shared completion contract, including `npm run test:ci`.

### Delivery and hosted boundary

Local completion ends with a reviewed diff and evidence. Push, PR, merge, and deployment require `delivery` authority.

After deployment, `hosted-safe-smoke` authority may allow only the approved internal-canary account to sign in, retry profile opening, reload, and sign out. Before the smoke, record a sanitized owner-scoped snapshot of the exact valid current head: generation, revision, digest/byte-length agreement, and retained-version count. Also install an approved browser/network guard that blocks and reports any write-capable learner-profile request before it reaches the provider. If that guard cannot be enforced, this is not a safe smoke and must not run under `hosted-safe-smoke`. Record the same server fields afterward and require them to be unchanged.

The safe smoke may call the ordinary owner-scoped resolver, but it must not invoke Start over, import, backup retry, sync/catch-up writes, conflict resolution, or another write-capable learner-profile operation. It must not construct malformed metadata, restore a predecessor, corrupt records, or change study content. If the flow proposes or begins an automatic trusted-predecessor restoration—or any other profile mutation—stop: that is outside `hosted-safe-smoke` and requires `hosted-destructive-or-gate` authority with an exact recovery plan. Hosted success is claimed only when the deployed fix SHA opens the unchanged valid current head to the active UI.

## Packet 2 — Decide and configure localhost Google trust

### Proposed title

> Decide and configure the narrow Google and Supabase trust model for localhost Google sign-in

### Classification and ownership

- Initial labels: `bug`, `needs-triage`.
- Within separately authorized stages, Codex owns the investigation, recommendation, provider operation, verification, and documentation.
- The product owner chooses the trust model and explicitly authorizes the exact provider surfaces. The product owner does not manually implement the configuration.
- While waiting for that choice, replace `needs-triage` with `needs-info` only after Codex has posted its recommendation and exact rollback and `tracker-preparation` authorizes the label change.
- Do not apply `ready-for-agent`: an AFK label is not authority to mutate Google or production Supabase Auth.
- After the explicit choice and execution request, use separate `tracker-preparation` authority to remove the waiting label, assign the interactive task to Codex, and retain `bug` until verified.

### Historical evidence

- Route: `http://localhost:8000/?internal_test=1`.
- Localhost temporarily used the hosted public Google client ID and hosted Supabase project.
- Google reported `[GSI_LOGGER]: The given origin is not allowed for the given client ID.` before showing an account chooser.
- Local email-code authentication remained available, and the hosted internal Google flow worked.

This proves an origin/client mismatch. It does not choose the Google client or Supabase accepted-audience model.

### Start here

- `src/integrations/google-identity-services-controller.js`
- `src/integrations/account-auth-controller.js`
- `src/integrations/runtime-config.js`
- `scripts/local-runtime-config.mjs`
- `docs/account-authentication.md`
- `docs/account-reminder-operations.md`
- `docs/deployment-and-releases.md`
- [Google Identity Services client-ID guidance](https://developers.google.com/identity/gsi/web/guides/get-google-api-clientid?hl=en)
- [Supabase Google Auth guidance](https://supabase.com/docs/guides/auth/social-login/auth-google)

### Decision stage

Codex must recheck the current Supabase changelog and official Google/Supabase guidance, inspect only sanitized non-secret configuration, and recommend one of these models:

1. **Dedicated localhost Google Web client with hosted Supabase Auth.** Local runtime uses the dedicated public client ID. Production Google JavaScript origins remain unchanged. The hosted Supabase accepted client-ID list keeps the production Web client first and adds only the approved localhost audience if current provider support and secret semantics are verified.
2. **Narrow localhost origins on the production Google Web client.** Add only Google's documented `http://localhost` and `http://localhost:8000` JavaScript origins, preserve the production origin, and record an owner, removal trigger, and rollback. Supabase keeps the production audience unless current documentation proves another change is required.

Reject an option explicitly if current provider behavior cannot support it. Do not substitute a completely local Supabase project: that tests a different objective.

The recommendation is complete only when it identifies the exact non-secret current state, chosen recommendation, rejected alternative, trust difference, provider surfaces, rollback, and verification plan. Then request one product-owner choice.

### Provider-execution safety preconditions

- [ ] The product owner recorded the selected model and authorized the exact Google and, if applicable, Supabase Auth surfaces.
- [ ] The server profile-data gate is verified `off` and no developer-canary owner is configured.
- [ ] The browser context is a fresh isolated context with no accountless or signed-in Edenia profile state.
- [ ] The hosted learner-profile generation, revision, and retained-version count are captured through an approved read-only verifier before authentication.
- [ ] Existing production origins, accepted audiences, primary client, and secret placement are recorded in sanitized form for rollback.

### Acceptance criteria

The live localhost-to-hosted and hosted-origin authentication checks below require both `provider-execution` and `hosted-safe-smoke` authority. Provider configuration authority alone does not authorize signing in to an account.

- [ ] Confirm the Edenia `signInWithIdToken` flow, client ID selected by each runtime, receiving Supabase project, nonce behavior, and exact non-secret accepted-audience set.
- [ ] Record the chosen model, rejected alternative, trust rationale, exact changes, owner, removal trigger where applicable, and rollback before mutation.
- [ ] If using a dedicated client, keep the production Google client's origins unchanged, select the dedicated ID only in local runtime, preserve all approved Supabase audiences, and do not replace the production primary client or secret.
- [ ] If using the production client, add only `http://localhost` and `http://localhost:8000`, preserve `https://www.edenia.study`, and change no Supabase audience unless current evidence requires it.
- [ ] Add no wildcard, unrelated host, `127.0.0.1`, or unrelated port without separate evidence and approval.
- [ ] Rotate no credential and change no provider secret merely to alter JavaScript origins or token audiences.
- [ ] On the exact localhost internal route, Google's official button renders and opens the chooser without the origin error.
- [ ] The approved account authenticates through the intended hosted Supabase project and signs out while the server profile-data gate remains off.
- [ ] Post-authentication read-only verification proves learner-profile generation, revision, and retained-version count did not change.
- [ ] The hosted internal origin still authenticates through the production client.
- [ ] An unrelated localhost port remains unauthorized.
- [ ] Only sanitized provider and browser evidence is recorded.
- [ ] Where the chosen contract changes repository documentation, update it in a separate source diff under `local-implementation` authority and deliver it only under `delivery` authority.

### Non-goals and stop conditions

- No learner-profile database change, new Auth method, custom Google button, One Tap, automatic selection, added scope, or broad header refactor.
- Stop before mutation if the current provider UI/API cannot preserve the production client, accepted audiences, and rollback exactly as approved.
- Stop and return to `needs-info` if authentication requires enabling the profile-data gate or if any learner-profile count changes.

## Packet 3 — Make `Later` snooze failed backup presentation

### Proposed title and classification

> Make “Later” snooze a failed accountless-profile backup notice without bypassing the final gate

- Labels: `bug`, `ready-for-agent`.
- Regression follow-up to #187.
- Link from #196 immediately. Add a native dependency only after identifying the exact #196 criterion this defect prevents.

### Historical evidence

On the hosted internal route, an existing accountless internal-test town had a persisted failed backup attempt. `Not backed up yet` offered `Try backup again` and `Later`; selecting `Later` left the notice visible and interactive. No retry was selected.

### Start here

- `src/state/accountless-profile-migration.js`
  - `publish`
  - `later`
- `src/features/migration/accountless-profile-migration-view.js`
- `tests/contracts/accountless-profile-migration.test.mjs`
- `tests/contracts/accountless-profile-migration-view.test.mjs`
- `tests/e2e/accountless-profile-migration.spec.mjs`

### State contract

- A snooze hides only `backup-failed` presentation while more than seven days remain.
- Active migration or attachment work keeps its existing state.
- The final seven-day countdown and day-zero gate override a snooze.
- `Later` is unavailable once that final period begins, including while a failed attempt remains durable.
- Retry identity, protected data, and the failed operation remain durable while presentation is hidden.

### Acceptance criteria

- [ ] More than seven days before the gate, `Later` immediately hides `backup-failed` and leaves the accountless town usable.
- [ ] The notice stays hidden after reload until the snooze deadline unless the final seven-day period begins first.
- [ ] Entering the final seven-day period overrides an unexpired snooze.
- [ ] During the final period, `Later` is unavailable and cannot extend `nextNoticeAt`.
- [ ] Operation ID, protected envelope, retry count, and all retry state remain durable.
- [ ] `Later` issues no backup, migration, catch-up, sync, or other network request.
- [ ] After ordinary expiry, `backup-failed` can return and retry resumes the same idempotent operation.
- [ ] A storage-write failure does not claim a durable snooze.
- [ ] Local profile contents and any accepted cloud head remain unchanged.
- [ ] The existing contract expecting immediate `backup-failed` after `later()` is replaced.
- [ ] Fake-clock contracts cover dismissal, reload, ordinary expiry, crossing seven days, day zero, retry, and storage failure.
- [ ] A browser regression produces a mocked failed backup, selects `Later`, reloads, and proves the town and local profile remain intact.

### Boundary

The issue scope is local implementation and validation only; the `ready-for-agent` label does not authorize the work. Hosted interaction is deferred to a separately authorized #196 rerun; it must never select `Try backup again` merely to verify this UI fix.

## Packet 4 — Remove dismissed heatmap details from accessibility

### Proposed title and classification

> Keep Study History heatmap details accessible through the day while making the visual tooltip stale-free

- Labels: `bug`, `ready-for-agent`.

### Historical evidence

Selecting a Heatmap day populates `#heatmapTooltip`. Returning to Summary removes only `show`; CSS makes the element transparent and non-interactive while stale text remains in the accessibility tree. Existing browser coverage asserts that Escape leaves the tooltip open.

### Chosen semantic contract

Use the heatmap day's accessible name as the only screen-reader presentation, but first make it semantically complete. It must include every distinct datum shown by the visual tooltip, including the localized streak length when `streakDayCount > 0`; omit the streak phrase when the count is zero. Keep `#heatmapTooltip` a visual-only element with `aria-hidden="true"` at all times. Do not add `role="tooltip"` or `aria-describedby` and do not duplicate the day details in two accessible presentations.

While visually closed, the tooltip is hidden from layout/interaction as appropriate, contains no stale day content, and has no retained target. Escape closes it without moving focus from the heatmap-day button. The element remains non-focusable and non-interactive.

### Start here

- `index.html` — `#heatmapTooltip`
- `src/app.js`
  - `renderHistoryHeatmap`
  - `showHeatmapTooltip`
  - `hideHeatmapTooltip`
  - `clearHeatmapTooltip`
  - view-switch and outside-click paths
- `src/features/study-history/heatmap-tooltip-actions.js`
- `tests/e2e/preservation-smoke.spec.mjs`

### Acceptance criteria

- [ ] The visual tooltip is always excluded from the accessibility tree, including while visually shown.
- [ ] The active day's accessible name is the single complete accessible presentation and includes date, points, time, videos, reviewed items, created items, and positive streak length whenever each datum is visually present.
- [ ] Positive-streak and zero-streak accessible-name contracts pass in all five locales with the product's existing terminology and pluralization.
- [ ] Dismissal clears the previous day content and target in addition to hiding the visual surface.
- [ ] Summary/Heatmap switching, blur, pointer exit, outside click, toggle-close, rerender, and Escape use the same stale-free close contract.
- [ ] Escape closes an open tooltip while focus remains on its triggering day.
- [ ] Replace the contrary Escape assertion with the required behavior.
- [ ] Showing another day renders only that day's visual information.
- [ ] No `role="tooltip"`, `aria-describedby`, focusable descendant, or duplicate announcement is introduced.
- [ ] Position, motion, pointer/coarse-pointer behavior, saved view preference, and keyboard day selection remain unchanged except for Escape dismissal.
- [ ] Extend the exact Heatmap-to-Summary reproduction and assert semantic state directly; class absence alone is insufficient.
- [ ] Check the ordinary local route and `?internal_test=1` because the code is shared.

### Boundary

Local and CI proof are sufficient for this ticket. Do not claim hosted-public reproduction from the localhost observation.

## Packet 5 — Distinguish unconfigured and unavailable Turnstile

### Proposed title and classification

> Distinguish unconfigured Turnstile from configured-but-unavailable email protection

- Labels: `bug`, `ready-for-agent`.
- Regression follow-up to #179 and research issue #165.

### Historical evidence

On localhost with no Turnstile site key, the email form displayed `Complete the security check to continue.` even though no challenge rendered and `Email me a code` was enabled. Request and verification against supported local Auth succeeded. Static widget placeholders were treated as `pending` even though no controller existed.

### Required branches

1. **Unconfigured:** No runtime site key. Widget and status remain absent or hidden, requests use `captchaRequired: false`, and no CAPTCHA token is sent.
2. **Configured and ready:** A controller is mounted and a fresh token exists. Existing one-use token enforcement applies.
3. **Configured but unavailable:** A site key exists but the controller, script, mount, browser support, or token is unavailable. Status remains visible, submission stays blocked, and no tokenless request occurs.

Controller absence is never proof of the unconfigured branch; runtime configuration is authoritative.

### Start here

- `index.html` — static Turnstile widget/status placeholders
- `src/app.js`
  - `TURNSTILE_READY`
  - `getTurnstileStatusView`
  - `synchronizeTurnstileControls`
  - `mountTurnstileWidgets`
  - `requestAccountEmailCode`
- `src/integrations/runtime-config.js`
- `src/integrations/turnstile-controller.js`
- `src/integrations/account-auth-controller.js`
- `tests/contracts/turnstile-controller.test.mjs`
- `tests/contracts/onboarding-account-integration.test.mjs`

### Acceptance criteria

- [ ] With no runtime key, widget and status remain hidden and status text is empty.
- [ ] Unconfigured submission is governed only by normal busy, unavailable, and validation states.
- [ ] Unconfigured requests set `captchaRequired: false`, send no token, and work against supported local Auth.
- [ ] Configured pending or interactive state shows guidance and blocks submission until a fresh token is ready.
- [ ] Configured missing-controller/widget, expired, timed-out, unsupported, unavailable, and error states remain visible and fail closed.
- [ ] Configured tokens remain memory-only, bounded, single-use, and reset after every request.
- [ ] Settings and locked/onboarding email surfaces are covered.
- [ ] Separate contracts cover “placeholder exists, runtime unconfigured” and “runtime configured, controller unavailable.”
- [ ] A localhost internal-route browser test covers no site key.
- [ ] Existing configured success and fail-closed tests remain positive controls.
- [ ] All five locale strings remain unchanged; this is a state/visibility repair.

### Boundary

Keep Cloudflare and Supabase provider configuration unchanged. Hosted CAPTCHA enforcement and all token/privacy boundaries remain unchanged. No live email or hosted Turnstile canary belongs to this local issue task.

## Packet 6 — Attribute and diagnose Start-over pre-RPC refusal

### Proposed title and initial classification

> Attribute and diagnose why confirmed “Start over” can be refused before its RPC while Progress sync says “Up to date”

- Initial labels: `bug`, `ready-for-agent`.
- Scope at creation: attribution and diagnosis only.
- The labels classify the work but authorize no diagnostic edits, implementation, or tracker transition.
- Link from #196 as a candidate blocker. Do not add a native dependency until current clean-base reproduction succeeds.
- Regression follow-up context: completed issue #190.

### Historical evidence and uncertainty

The observation occurred on local checkout `4b48df6c051971d13a28bbda5aa4d37801f94e1d`, an unmerged #286 branch that modifies learner-profile cloud persistence and lifecycle activation.

A local signed-in profile showed `Up to date`, contained meaningful Study facts and an older protected Start-over generation, accepted a second confirmed Start over, and did not reset. No `start_over_my_learner_profile` request appeared in local Kong logs and no same-day reset receipt appeared. Reload retained generation 11 and prior Study facts; a later ordinary sync advanced revision 21 to 22. The verifier returned `11|22|1|0` rather than the expected relative outcome `N+1|1|0|1`.

Current source already shows `Could not start over. Your existing progress was not changed.` when lifecycle Start over returns false. The exploratory session did not establish whether that feedback appeared, whether the click reached the current handler, or which replacement predicate refused the operation.

This is a confirmed failure on the exploratory branch, not yet a confirmed independent defect on current `master`.

### Start here

- `src/app.js`
  - `resetApp`
  - Progress sync rendering
- `src/integrations/learner-profile-cloud-persistence.js`
  - `canReplaceSynchronizedHead`
  - `startOver`
- `src/state/learner-profile-lifecycle.js`
  - `startOverProfile`
- `tests/contracts/learner-profile-cloud-persistence.test.mjs`
- `tests/contracts/learner-profile-lifecycle.test.mjs`
- `tests/e2e/first-signed-in-profile.spec.mjs`
- `supabase/tests/learner_profile_start_over.test.sql`

### Phase 0 — Attribution

Use disposable local fixtures and test identities. Do not repeat the destructive action on the user's real local or hosted profile.

- [ ] Freeze three immutable comparison identities before new diagnosis or implementation work: A, historical incident commit `4b48df6c051971d13a28bbda5aa4d37801f94e1d`; B, the exact freshly fetched `origin/master` SHA; and C, the exact #286 candidate-head SHA before diagnostic or repair edits. If A and C are identical, record that explicitly.
- [ ] Reproduce the same deterministic fixture in detached/disposable worktrees at A, B, and C. Do not substitute a later mutable branch name for any recorded SHA.
- [ ] Keep runtime config, local Supabase schema/seed, browser project, storage fixture, and clock equivalent between comparisons.
- [ ] Prove whether the click handler runs exactly once in each comparison.
- [ ] Record pre-action activation, sync projection, accepted generation/revision, pending/queued/dirty presence, cloud-head-known state, and protected-reset presence using synthetic identifiers only.
- [ ] If #286 changes after the matrix, rerun the regression on its exact final candidate SHA before #286 is considered locally complete.

#### Attribution outcomes

- **B fails:** Report an independent current-base defect and recommend adding this issue as a native #196 blocker. The dependency mutation requires `tracker-preparation` and is not a prerequisite for local Phase 1 diagnosis.
- **B passes and C fails:** Report a #286 candidate regression and recommend folding the failing regression and repair into #286. Removing the candidate-blocker link or closing this ticket requires `tracker-preparation`; adding the regression requires `local-diagnostic-edits`; repairing it requires `local-implementation`.
- **A fails while B and C pass:** Report a historical branch regression that is absent from the recorded candidate. Preserve a regression for the historical failure when authorized, require it to pass on the final #286 candidate, and recommend tracker consolidation only after that proof.
- **A does not reproduce:** The historical attribution is incomplete; report the exact missing fixture or evidence without discarding any independent B/C result. Do not treat a later branch result as exonerating the recorded incident.
- **Non-deterministic after the exact matrix:** Recommend retaining `ready-for-agent` only while a concrete missing fixture is known; otherwise recommend `needs-info` and name only the missing evidence. Any label/comment change requires `tracker-preparation`.

Proceed to Phase 1 for the failing state selected by the recorded outcome, but do not mutate the tracker or implement a repair without the corresponding independent authority.

### Phase 1 — Exact refusal diagnosis

- [ ] Capture confirmation visibility, toast, focus, and `aria-live` feedback after refusal.
- [ ] Identify one exact refusal status and predicate: activation, owner/profile/generation/revision mismatch, unknown cloud head, pending, queued, dirty, connectivity, stale request, storage failure, or another named boundary.
- [ ] Under `local-diagnostic-edits` authority, prefer a test-only seam or a pure typed predicate result. Any retained diagnostic must be privacy-safe, behavior-preserving, independently tested, and contain no identifiers or profile contents.
- [ ] Under that same authority, produce the smallest red contract or browser regression that fails for the proven reason.
- [ ] Preserve all owner, profile, generation, revision, activation, pending, queued, dirty, and connectivity fences during diagnosis.

Phase 1 is complete only when the failure is deterministic and one exact boundary is proven.

### Post-diagnosis decision table

| Proven cause | Next state |
| --- | --- |
| Branch-associated regression from #286 | Recommend repair inside #286; implementation requires `local-implementation`, and tracker consolidation requires `tracker-preparation` |
| Presentation says `Up to date` while the stricter safety state correctly refuses | Recommend preserving the fences and aligning status/action availability plus persistent actionable feedback; implementation requires `local-implementation` |
| Behavior-preserving defect in request propagation, stale handler state, or a predicate that demonstrably contradicts the already accepted owner/generation/revision state | Recommend the proven narrow contract; tracker updates and implementation require their respective authorities |
| Any fix would relax ownership, lineage, generation, accepted-revision, pending, queued, dirty, connectivity, or activation safety | Recommend `needs-triage`, present the exact tradeoff, and wait for product-owner direction; changing the label requires `tracker-preparation` |
| Database/RPC defect | Recommend a separate database ticket with explicit migration, RLS/grant, pgTAP, rollback, and deployed-schema requirements; do not create or implement it without the corresponding authorities |

### Behavior contract when implementation is authorized

- [ ] If the proven safe replacement predicate remains true through confirmation, invoke `start_over_my_learner_profile` exactly once.
- [ ] If safety becomes false, send no RPC, retain the prior active profile, keep the confirmation context understandable, and show persistent actionable feedback naming what must finish.
- [ ] Progress sync presentation and Start-over availability derive from compatible state.
- [ ] Success uses the active owner-derived profile ID, generation, and accepted revision.
- [ ] Success creates generation `N+1`, revision 1, installs a blank portable profile, and creates a protected reset receipt.
- [ ] Existing protected generations follow the retention contract; the newest applicable reset is the Undo target.
- [ ] Reload retains the blank profile and new generation.
- [ ] A post-confirmation race leaves the previous profile unchanged and reports failure.
- [ ] Focused persistence/lifecycle contracts cover consecutive Start-over generations.
- [ ] A browser regression covers Start over while an older protected reset is available.
- [ ] Existing Start-over-then-Undo coverage remains green.
- [ ] If RPC/database behavior changes, run `supabase/tests/learner_profile_start_over.test.sql` and prove the selected CI database job invokes that exact pgTAP file.
- [ ] The ordinary public accountless path remains unchanged.

### Hosted boundary

No hosted Start over is authorized by this packet. Destructive hosted verification belongs to #196 and requires `hosted-destructive-or-gate` authority, exact-target confirmation, a pre-action recoverability check, and generation/revision verification after the action.

## Packet 7 — Bound the historical AnkiConnect investigation

### Proposed title and classification

> Determine whether current source can reproduce the historical AnkiConnect null-target failure

- Labels: `ready-for-agent`.
- Diagnosis-only; not a confirmed current defect.
- Not a #196 blocker unless current reproduction proves a lifecycle defect that invalidates an explicit criterion.

### Historical signal

The local Activity log contained a September 1 entry:

```text
AnkiConnect failed: Cannot set properties of null (setting 'textContent')
```

The September 4 session did not reproduce it. The independent observation that `refreshAnkiStats({ silent: true })` can still append failure Activity entries is not part of this ticket.

### Start here

- `src/app.js`
  - `refreshAnkiStats`
  - `renderAnkiStatus`
  - `renderStudyHistoryPanel`
- AnkiConnect fetch/normalization modules reached by `fetchAnkiStats`
- Study History rerender and locale/profile-transition paths
- existing Anki and Study History contract/browser tests

### Bounded diagnosis matrix

Record the current remote-base SHA. Use deterministic mocks only; do not require a live AnkiConnect service.

1. AnkiConnect unavailable with a network-style failure.
2. AnkiConnect returns a supported error response.
3. A refresh resolves after Settings or the relevant History surface closes or rerenders.
4. A refresh resolves while Summary/Heatmap changes.
5. A refresh resolves across one non-English locale rerender and one profile/state replacement fixture.

For each case, assert that the original availability/error outcome is preserved and no secondary DOM exception replaces it. Cover Settings open and closed. One desktop browser project plus focused contracts is sufficient unless reproduction is geometry- or engine-specific.

Inspect source history touching the Anki refresh and Study History render paths from 2026-08-31 through the recorded current-base SHA. If no commit can be associated with the local entry after that bounded history check, record `source commit unavailable`; do not continue an unbounded search.

### Terminal outcomes

- **Reproduced:** Report the smallest fixture and exact source location. If `local-diagnostic-edits` is authorized, preserve the red fixture. Recommend a narrow `ready-for-agent` follow-up only if the contract is behavior-preserving: retain the original Anki error, avoid the secondary null-target exception, and change no Activity-log policy. Creating the issue or applying a label requires `tracker-preparation`; fixing it requires `local-implementation`.
- **Not reproduced:** Report all five cases, Settings states, tested browser project, contract coverage, and history result. Recommend closure without speculative production changes; closing the issue requires `tracker-preparation`.

### Boundary

The Shared diagnostic contract applies. Keep the investigation local. Do not enable or exercise Anki integration on the hosted site. Logging suppression, deduplication, or coalescing requires a separate product contract and separately authorized ticket.

## #196 coordination

After `tracker-preparation` is authorized and either stable source URLs exist or the required sanitized evidence is embedded directly:

1. Update #286 with Packet 1 and its sanitized incident evidence.
2. Create Packets 2–7 as independent issues using their complete packet text, not summaries from the tracker table.
3. Update #196 with stable evidence links or embedded sanitized evidence, every issue link, and the exact dependency rules below.
4. Record the September 4 baseline as historical local evidence bound to `4b48df6c051971d13a28bbda5aa4d37801f94e1d`: 1,385 contracts, 139 shared backend/function tests, passing Deno checks, and 311 passed/798 intentionally skipped Playwright cases.
5. State that this green baseline did not detect the interface defects and satisfies no #196 acceptance checkbox.

### Dependency rules

- Make #196 natively blocked by #286.
- Link Packet 6 initially without a dependency. Add it as a native blocker only after reproduction on the then-current clean base.
- Add Packet 3 as a native blocker only after documenting the exact #196 criterion it prevents.
- Link Packets 2, 4, 5, and 7. Promote any one to a blocker only when current evidence maps it to an explicit #196 criterion.
- Use GitHub native dependencies according to `docs/agents/issue-tracker.md`; do not rely on prose alone when native dependencies are available.

## Execution order

### Evidence and tracker stage

1. Review this corrected plan and the sanitized exploratory record.
2. Choose the stable-URL or embedded-evidence path. Publish documents only with separately named `delivery` authority.
3. With `tracker-preparation` authority, reconcile the exact five labels, update #286, create Packets 2–7, and update #196 using the rules above.

### Diagnosis and implementation stages

4. Before changing or completing #286, freeze Packet 6 identities A/B/C and run Phase 0 under `local-diagnosis` authority.
5. If the result is branch-associated, obtain `local-diagnostic-edits` and `local-implementation` authority as needed, repair inside #286, and rerun the regression on the exact final #286 candidate SHA.
6. Complete #286 against the current base only under `local-implementation` authority.
7. Diagnose and implement Packets 3, 4, and 5 independently under their respective authorities once their current-base red reproductions exist.
8. Run Packet 7's bounded diagnosis without delaying confirmed defects; stop at its reported terminal outcome unless another stage is authorized.
9. Run Packet 2's read-only `provider-decision` stage; request the single trust-model choice only after Codex posts a recommendation and rollback.

### Delivery, provider, and hosted stages

10. Deliver each source issue through a narrow PR only when `delivery` authority names the permitted operations.
11. Execute approved provider configuration only with `provider-execution` authority. Make any repository documentation change under separate `local-implementation` and `delivery` authority.
12. Perform only ticket-specific non-destructive hosted smokes that receive `hosted-safe-smoke` authority. Use `hosted-destructive-or-gate` for every write-capable canary or gate change.

## Final #196 release gate

`docs/release-readiness-canaries.md` and `scripts/release-readiness.mjs` are the authoritative procedure and dependency model. This document does not restate their scenario definitions, metadata allowlist, rerun planner, or validation rules.

The final gate may start only when the queryable evidence below has been verified and the judgment-dependent decisions have been explicitly recorded. Human judgments must not be inferred from green CI, closed issues, or the absence of labels.

### Queryable evidence

- [ ] #286 is closed, its named release PR is merged, and its deployed narrow-smoke record is bound to the exact deployed identity.
- [ ] Every issue classified as a #196 blocker is closed and bound to its final merged and deployed change.
- [ ] No release-relevant PR is open or waiting to merge.
- [ ] The server profile-data gate is `off`, no developer-canary owner is configured, and the bounded Auth-monitor canary is disabled.
- [ ] The release-readiness inspector records the exact deployed source SHA, asset version, runtime-config hash, UTC time, and sanitized gates.
- [ ] Those inspector identities match the intended final release candidate exactly.

### Recorded decisions and attestations

- [ ] Packet 6 records the immutable A/B/C attribution matrix and the exact final-candidate regression result; any resulting blocker is closed.
- [ ] Packet 3 records a blocker/non-blocker decision mapped to a named #196 criterion.
- [ ] Packet 2 records the chosen provider state and verification, or an explicit decision that no provider change is required.
- [ ] The release owner records the complete release-relevant issue and PR set used by the checks above.
- [ ] A named reviewer attests that no unresolved P0/P1 correctness, ownership, integrity, or progress-loss finding remains.

Only then follow the runbook's ordered gate-off monitoring, explicitly authorized developer-canary evidence, gate-off switch-off/rerun, final validation, no-known-defect confirmation, and product-owner approval request. Any restart or invalidation decision comes from the runbook and rerun planner, not from manual copying or this plan.

## References

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
- [#165 — Verify frictionless Turnstile protection](https://github.com/BriceChivu/Edenia/issues/165)
- [Google Identity Services — Get your Google API client ID](https://developers.google.com/identity/gsi/web/guides/get-google-api-clientid?hl=en)
- [Supabase Auth — Login with Google](https://supabase.com/docs/guides/auth/social-login/auth-google)
- [WAI-ARIA Authoring Practices — Tooltip Pattern](https://www.w3.org/WAI/ARIA/apg/patterns/tooltip/)
