# Internal canary Codex execution plan — Codex-ready revision — 2026-09-04

## Status, identity, and purpose

- **Plan ID:** `internal-canary-codex-ready-2026-09-04-v1`.
- **Specification status:** Review-ready successor to the corrected draft; product-owner approval is not yet recorded.
- **Purpose:** Turn the September 4 exploratory findings into tracker packets that Codex can diagnose, implement, validate, review, deliver, and close without routine manual inspection.
- **Basis:** [the exploratory record](internal-canary-exploratory-2026-09-04.md), current repository guidance, ADR-0001, the release-readiness runbook, current source, and current tracker state.
- **Tracker:** GitHub Issues for `BriceChivu/Edenia`.
- **Evidence boundary:** September 4 observations are incident and reproduction evidence. They are not complete #196 release-readiness records.
- **Execution boundary:** This specification is not standing authority. Codex acts only under the stage and external-action authority recorded in the invoking task.
- **Publication boundary:** This file supersedes the earlier execution-plan drafts only after approval of this exact Plan ID. Earlier local planning drafts remain historical working material and are not publication dependencies.

All diagnosis, implementation, review, tracker work, provider operation, and verification described here is intended to be performed by Codex. The product owner is needed only to approve this specification, choose an irreducible product or trust decision, authorize sensitive external actions, and complete authentication or confirmation that a provider prevents Codex from completing.

## Activation and kickoff

Approval and execution authority are distinct:

1. **Specification approval** adopts the product and safety contracts in this Plan ID. Record it in the invoking task as an explicit user statement naming this Plan ID. Approval alone starts no work.
2. **Execution authority** names the target packets, stages, and external actions Codex may perform. One user message may authorize several stages and packets at once. Codex must not ask again for an action already named in the active task's authority record.
3. **Irreducible holds** remain separate even when earlier stages were granted: product/trust choices, merge, deployment, provider mutation, hosted account access, learner-profile mutation, and server-gate changes require the exact authority defined below.

Recommended kickoff form:

```text
Approve plan internal-canary-codex-ready-2026-09-04-v1.
Execute Packets <numbers> through stages <stage names>.
Tracker authority: <exact create/edit/comment/label/dependency/close operations>.
Delivery authority: <local branch, local commit, push, open/update PR, wait for CI, merge PR, deploy — list only those allowed>.
Review authority: authorize a separate read-only Codex reviewer for each final candidate identity.
Provider authority: <none, decision only, or exact approved surfaces>.
Hosted authority: <none, or exact route, account class, actions, guard, and pre/post checks>.
Stop for: <decisions or actions deliberately withheld>.
```

If the invocation is less explicit than this template, Codex may execute only the unambiguous subset and must report the missing authority once, at the first actual boundary.

## Authority contract

A Codex task must name the active stage and target packet or issue. A single invocation may grant multiple named stages; authority for an unnamed stage is not implied.

| Stage | Codex may do | Required authority | Completion boundary |
| --- | --- | --- | --- |
| `tracker-preparation` | Reconcile labels; create or edit named issues; add comments, links, labels, dependencies, or closures | An explicit request listing the permitted tracker operations and targets | The named tracker mutations and a sanitized mutation receipt are complete; no source, provider, or hosted state changed |
| `local-diagnosis` | Inspect source/history; fetch remote refs; create isolated worktrees; install dependencies; run existing tests; use disposable browser/database fixtures without editing tracked source | An explicit request to diagnose the named issue | The evidence and recommendation are recorded; no tracked source, tracker, provider, or hosted state changed |
| `local-diagnostic-edits` | Add a failing test, test-only seam, or behavior-preserving diagnostic needed to isolate the named issue | Explicit authorization for local diagnostic edits | The refusal or failure is deterministic; production behavior remains unchanged |
| `local-implementation` | Edit isolated local source and tests to satisfy the proven contract | An explicit request to implement or fix the named issue | The local work, exact validation matrix, and independent Codex review are complete; no remote, tracker, provider, or hosted state changed |
| `delivery` | Create or update a local branch; commit; push; open/update a PR; wait for CI; merge a PR; deploy | The request must explicitly name the permitted delivery actions | Only the named delivery actions are complete; deployment is not implied by PR authority |
| `provider-decision` | Inspect current non-secret Google/Supabase configuration read-only; compare supported options; recommend one | An explicit request to prepare the decision | One concise recommendation, rollback, and exact proposed surfaces are ready for product-owner choice |
| `provider-execution` | Use the approved Google/Supabase operator surfaces to apply and inspect the chosen configuration | A recorded product-owner choice plus an explicit request authorizing the exact provider surfaces | Provider configuration and rollback evidence are recorded; repository edits require `local-implementation`, and live checks require `hosted-safe-smoke` |
| `hosted-safe-smoke` | Perform only the named non-destructive hosted actions against the exact approved route/account | Explicit authorization naming the route, account class, allowed actions, and pre/post checks | The narrow smoke reaches a safe terminal outcome and pre/post state is unchanged where required |
| `hosted-destructive-or-gate` | Change a server gate or perform Start over, import, restore, conflict resolution, backup retry, a potentially mutating resolver canary, or another hosted state-changing canary | Separate explicit authorization for the exact target and recovery plan | The runbook-required postconditions and recovery evidence are complete |

Completing one stage may produce a recommendation for the next stage, but it never authorizes an unnamed stage. An issue label is classification, not authority. Every tracker mutation—including adding a label or dependency, posting a comment, or closing an issue—requires `tracker-preparation` authority. Absence of authority is not issue uncertainty and must not be represented by `needs-info`. If a task lacks the next authority, Codex stops, records what is complete, and asks only for the missing authority.

## Mandatory issue execution capsule

Every newly created issue body begins with this capsule. An existing issue places it first inside the plan-managed block defined under Tracker preparation. Replace bracketed fields before posting:

```text
Execution contract: internal-canary-codex-ready-2026-09-04-v1
Packet: [number]
Initial eligible stage: [diagnosis | implementation | provider decision | provider execution]

This issue is a complete technical specification, not standing authority. The invoking Codex task must name every authorized stage and external action. One invocation may authorize multiple stages. Work runs in an isolated worktree against a freshly verified remote base; unrelated changes and planning drafts are excluded. Local, CI, deployed-schema, provider, live-browser, and product-owner evidence remain separate. The implementing Codex cannot self-attest final review: a separate Codex reviewer must report no unresolved P0/P1 Standards or Spec finding at the exact final candidate identity. Secrets, identities, sessions, profile contents, and private endpoints never enter issues, PRs, logs, or evidence artifacts.
```

The capsule is intentionally short and duplicated so an issue remains safe when consumed without this plan. The Plan ID makes later drift detectable.

## Workspace and branch contract

This contract is part of every local stage:

1. Read `AGENTS.md`, `CONTEXT.md`, applicable ADRs, the target issue with comments, and the packet before source exploration.
2. Read the server's current `master` SHA with `gh api repos/BriceChivu/Edenia/commits/master --jq .sha`, run `git fetch --prune origin master`, and require `git rev-parse origin/master` to equal the server SHA. Record that full SHA as `remoteBaseSha`.
3. Inspect the current checkout and every proposed source worktree with `git status --short --branch`. Preserve every pre-existing tracked or untracked change. Never use destructive reset or checkout commands.
4. Create one isolated worktree per implementation packet. Create a `codex/` branch only when the invoking task grants the `branch` delivery action; otherwise use a detached worktree and the candidate patch identity defined below. Start Packets 3–5 and any implemented Packet 7 follow-up from the recorded `origin/master`. Do not stack independent packets in one PR.
5. For Packet 1, preserve commits `276038c`, `cd93969`, and `4b48df6`. With `branch` authority, create a new uniquely named branch at `4b48df6c051971d13a28bbda5aa4d37801f94e1d` in an isolated worktree, then merge the recorded current `origin/master`. Without `branch` authority, use a detached worktree at `4b48df6c051971d13a28bbda5aa4d37801f94e1d` and run `git merge --no-commit --no-ff origin/master` under `local-implementation` to prepare the same candidate without creating a ref or commit. Never rewrite or clean the original checkout. Resolve any conflict only under the merge-conflict procedure and re-run the complete Packet 1 matrix.
6. For Packet 6 A/B/C attribution, create three detached disposable worktrees at the recorded immutable SHAs. Use one fixed mocked server contract for the pre-RPC client comparison. A live/local database comparison is allowed only when each worktree receives its own reset database built from that SHA's migrations and records the migration identity.
7. If dependencies are absent in a fresh Darwin/ARM worktree, run `npm ci --os=darwin --cpu=arm64`. Treat missing `esbuild` as an environment gap, not a product defect.
8. Build `_site` before a browser run and keep it stable until that run ends. Run builds and browser suites sequentially.
9. Stage only explicit packet files with `git add -- <paths>`. Never use blanket staging. Planning drafts are excluded unless their publication is separately authorized.
10. Before delivery, require `git diff --check`, a scoped diff against `remoteBaseSha`, the packet's exact tests, `npm run test:ci`, and the independent review gate below. A later commit must have the same tree as the reviewed local candidate or be reviewed again.

## Tracker preparation

### 1. Choose stable supporting evidence

Tracker items may be created from the self-contained packet text without publishing either planning document. Before adding a source-document link to a public issue or #196, choose one of these evidence paths:

1. With separate `delivery` authority, publish this Plan ID and the sanitized exploratory record, then use stable commit-bound URLs; or
2. Embed the required sanitized evidence directly in the issue/comment and omit local-document links.

In either case, each issue body must contain its own baseline, starting points, acceptance criteria, validation, and stop conditions. Publish no credentials, private provider/project endpoints, emails, UUIDs, tokens, sessions, raw database rows, learner-profile contents, or local filesystem paths. The public Edenia route and official documentation URLs may remain.

The historical evidence anchors are:

- local exploratory checkout: `4b48df6c051971d13a28bbda5aa4d37801f94e1d` on `codex/issue-286-profile-ready-recovery`;
- hosted incident deployment: `018d256beac9910cfdbccc1da7ac725d4e88d166`;
- #286 local work: commits `276038c`, `cd93969`, and `4b48df6`, with no pull request at the time of the September 4 review.

These are historical anchors, not instructions to build on a stale base. At execution time, Codex must fetch the current remote state, record the current `origin/master` SHA, and compare the target branch against that exact base without discarding unrelated user work.

Tracker preparation is not globally blocked on document publication. Only a step that intends to cite a source document waits for a stable URL. Authority to create or update tracker items does not authorize committing or publishing documents, and earlier local planning drafts must not be published merely to satisfy a reference.

### 2. Reconcile the exact triage labels

The repository contract requires these five label names and meanings. Preserve the complete metadata of every existing matching label. Create only a missing label, using the defaults below; do not rewrite an existing description or color merely to match this table.

| Label | Description | Suggested color |
| --- | --- | --- |
| `needs-triage` | Maintainer needs to evaluate this issue | `FBCA04` |
| `needs-info` | Waiting on reporter for more information | `D876E3` |
| `ready-for-agent` | Fully specified, ready for an AFK agent | `0E8A16` |
| `ready-for-human` | Requires human implementation | `1D76DB` |
| `wontfix` | Will not be actioned | `FFFFFF` |

Do not remap the repository documentation to semantically different existing labels. Verify that all five live names exist and that their operational use matches `docs/agents/triage-labels.md`; descriptions and colors are not an equality gate for labels that already existed. This label reconciliation is tracker administration only; it authorizes no issue creation or implementation unless the invoking task explicitly includes that operation under `tracker-preparation`.

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

Every newly created issue begins with the **Mandatory issue execution capsule**. For existing #286, preserve its complete current body verbatim and append one plan-managed block whose first content is the capsule; delimit it with `<!-- codex-plan:internal-canary-codex-ready-2026-09-04-v1:start -->` and `<!-- codex-plan:internal-canary-codex-ready-2026-09-04-v1:end -->`. A later update may replace only the content between those exact markers. For Packets 1, 3, 4, and 5, the remainder is the complete packet plus the **Shared implementation contract** below. Packet 6 includes both shared contracts, with the implementation contract explicitly conditional on `local-implementation` authority. Packet 7 includes the Shared diagnostic contract and the same conditional implementation contract. Packet 2 includes its full decision/execution packet, provider-specific preconditions, and the conditional implementation contract for any repository change. Stamp every body with this Plan ID and the exact packet number.

Include the applicable contract in the issue itself; a link to this plan is supporting context, not a substitute. Do not create an issue from only the tracker-inventory row, proposed title, or summary.

### 5. Apply tracker mutations in a recoverable order

Under authority that names these exact targets and operation types, Codex performs the following sequence:

1. Read the live bodies, comments, labels, dependency summaries, and state of #196 and #286. Save a sanitized before-state receipt in the task output; do not publish identities or profile contents.
2. Update #286 in place by appending or replacing only the delimited plan-managed block containing the capsule, Packet 1, and the Shared implementation contract. Preserve its title, complete pre-existing body, comments, and issue number. Add `bug` and `ready-for-agent`, then add #286 as a native blocker of #196.
3. Create Packets 2–7 from their complete issue text and applicable contracts. Capture each returned issue number and URL before constructing later links.
4. Add one coordination comment to #196 containing the Plan ID, sanitized historical baseline, created issue links, and blocker rationale. Do not rewrite #196's body or check its acceptance boxes. Add only the native dependencies justified by this plan and the then-current evidence.
5. Re-read every changed issue and dependency summary. Post a sanitized tracker receipt listing the exact creates, body edits, comments, label changes, dependencies, and closures performed. A partial failure stops the sequence before dependent operations and is reported; Codex does not guess an issue number or repeat a mutation blindly.

### 6. Issue and auto-close lifecycle

| Item | Commit/PR reference | Closure rule |
| --- | --- | --- |
| #286 / Packet 1 | Use `Refs #286`; never an auto-close keyword | Close only after its final reviewed SHA is merged and deployed, the guarded deployed-client smoke passes, and a separately authorized exact live-resolver canary finishes with unchanged pre/post head state |
| Packet 2 | Use `Refs #<n>` | Close after the approved provider configuration is applied and verified, required repository documentation is delivered, and both localhost and hosted-origin checks pass; a rollback after failed verification leaves it open unless the product owner explicitly chooses a no-change terminal outcome |
| Packets 3–5 | `Closes #<n>` is allowed only in the final PR once the exact final SHA has passed independent review and CI | If no PR delivery is authorized, keep the issue open and record local-complete evidence; close after the final PR is merged because these packets require no separate hosted proof |
| Packet 6 | Use `Refs #<n>` during diagnosis | Close as historical/consolidated only after the final #286 candidate passes the retained regression; a current-base defect remains open until its final repair is merged and any required deployment evidence exists |
| Packet 7 | Use `Refs #<n>` | If not reproduced, close with the bounded matrix and history receipt; if reproduced, create or link a repair only with tracker authority, then close the bounded diagnosis after its terminal outcome is recorded |
| #196 | Never use an auto-close keyword from a packet PR | Close only through the authoritative release-readiness runbook after every queryable gate, separate Codex review, and explicit product-owner approval |

Before any close, Codex re-reads the live issue, linked PR, dependency summary, and required evidence. Closing an issue is always a separately named `tracker-preparation` operation, even when the table says the technical closure condition has been met.

## Shared diagnostic contract

Every diagnosis-only packet uses this process:

1. Record the exact historical, current-base, and working SHAs required by the packet.
2. Reproduce with existing tests and disposable synthetic fixtures first.
3. Preserve the named route, namespace, locale, identity, and lifecycle boundaries.
4. If `local-diagnostic-edits` is separately authorized, limit edits to the smallest failing regression, test-only seam, or behavior-preserving diagnostic.
5. Report the exact commands, fixtures, result, evidence class, uncertainty, and recommended next stage in the evidence receipt format below.
6. Stop before product behavior changes, tracker mutations, delivery, provider mutation, or hosted access unless that next stage is independently authorized.

## Shared implementation contract

Every authorized source-changing packet uses this process in addition to its packet-specific criteria:

1. Record the current remote base SHA and the exact working SHA before diagnosis.
2. Reproduce the defect with the smallest deterministic local contract or browser fixture before changing behavior. Record the failing assertion and prove that the same assertion turns green after the change.
3. Preserve the exact internal/public route, storage namespace, locale, and lifecycle boundaries named by the packet.
4. Make the narrowest behavior change that satisfies the packet. Preserve unrelated user changes.
5. Prove the focused regression turns green, then run the nearest affected contract and browser suites.
6. Run database tests when an RPC, schema, grant, RLS policy, or database contract changes. Confirm CI routes and invokes every relevant pgTAP file; a green job name alone is not proof.
7. Run `npm run test:ci` before delivery. Do not rebuild `_site` while a browser suite is using it.
8. For shared or gated code, identify the central gate and prove the ordinary public path remains unchanged.
9. Run the independent Codex review gate below against the exact final candidate identity. Resolve every correctness or scope finding before claiming local completion, then rerun affected validation and the review if production code changes.
10. Emit the evidence receipt below. Report local proof, hosted CI proof, deployed-schema proof, hosted-provider proof, live-browser proof, and product-owner approval as separate evidence classes. `npm run test:ci` does not run repository pgTAP files, so it cannot satisfy a named database test requirement.

Local completion never implies tracker updates, delivery, provider work, or hosted verification. Those steps use the authority contract above.

### Independent Codex review gate

The implementing Codex may perform iterative self-review, but final completion requires a separate read-only Codex reviewer—another task or delegated agent that did not author the final patch. Give it the complete issue body, repository instructions, `remoteBaseSha`, and exact final candidate identity. That identity is the commit SHA when a local commit is authorized. Before a commit exists, it is the worktree's `startingSha` plus a SHA-256 digest of `git diff --binary HEAD` and a sorted manifest of every untracked candidate file with its SHA-256 digest; the implementing and reviewing Codex must independently obtain the same digest. The reviewer also compares the resulting candidate tree with `remoteBaseSha`. The reviewer then performs two explicit passes:

1. **Standards:** repository instructions, privacy, isolation, security, test, gate, and change-scope compliance.
2. **Spec:** every packet criterion, prohibited behavior, evidence class, and route/namespace/lifecycle boundary.

The reviewer reports findings with severity, file, line, and rationale, or explicitly reports no findings for each pass. Local completion requires no unresolved P0 or P1 finding. If a finding changes production code, the implementing Codex reruns the affected focused matrix and `npm run test:ci`, records a new candidate identity, and obtains review of that exact identity. If delivery creates a commit whose tree is not byte-identical to the reviewed candidate, review must run again at the final commit SHA. A PR platform's generic approval state is not a substitute for this receipt.

### Evidence receipt

Every diagnosis, implementation, delivery, provider, hosted-smoke, and closure handoff records:

```text
Plan ID and packet/issue:
Authorized stage(s) and operations:
remoteBaseSha / startingSha / final commit SHA or candidate patch identity:
Changed files (or none):
Red reproduction: exact command, fixture, failing assertion, result:
Focused validation: exact commands and results:
Full local validation: exact command and result:
Database validation: exact pgTAP command/file and CI invocation proof, or not applicable:
Independent Codex review: reviewer task, reviewed candidate identity, Standards result, Spec result:
Delivery/CI/deployment/provider/live evidence: separate URLs or not performed:
Privacy and public-path containment checks:
Remaining blockers and next authority required:
```

Never replace exact commands and results with “tests pass.” Use `not performed` rather than implying evidence for an unauthorized or unavailable stage.

## Packet 1 — Complete existing #286 profile-opening recovery

### Tracker action and classification

- Update, do not duplicate, [#286 — Internal-test signed-in profile opening can remain stuck in generic recovery](https://github.com/BriceChivu/Edenia/issues/286).
- Keep `bug` and add `ready-for-agent` after the self-contained update below is posted.
- Add #286 as a native blocker of #196.
- Keep #286 open through local completion, delivery, deployment, the guarded deployed-client smoke, and the separately authorized exact live-resolver canary.

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

Packet 1 also delivers these support artifacts unless an existing reviewed equivalent is identified and named in the evidence receipt:

- `scripts/hosted-profile-opening-smoke.mjs`
- `tests/contracts/hosted-profile-opening-smoke.test.mjs`
- `tests/fixtures/learner-profile/profile-ready-smoke.json`

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

Run these commands in order and record each result:

```bash
node --test tests/contracts/learner-profile-cloud-persistence.test.mjs tests/contracts/learner-profile-lifecycle.test.mjs tests/contracts/hosted-profile-opening-smoke.test.mjs
npm run build
npx playwright test tests/e2e/learner-profile-access.spec.mjs --project=desktop-standard
npm run test:ci
```

If an RPC, migration, grant, RLS policy, or database contract changes, first inspect `supabase test db --help`, then run `supabase test db supabase/tests/learner_profile_recovery.test.sql --local` plus every other changed-contract pgTAP file, and prove from CI logs or workflow source that the final CI run invoked each exact file. Do not infer pgTAP coverage from `npm run test:ci`.

### Delivery and hosted boundary

Local completion ends with a reviewed diff and evidence. Push, PR, merge, and deployment require `delivery` authority.

After deployment, `hosted-safe-smoke` authority may allow only the approved internal-canary account to sign in, exercise the deployed-client recovery path against a synthetic resolver response, reload, and sign out. This stage is executable only through a committed and independently reviewed `scripts/hosted-profile-opening-smoke.mjs` (or an explicitly approved successor path) plus an approved owner-scoped pre/post verifier. Packet 1 owns delivery of that harness if it does not already exist. The harness must:

- launch an isolated Chrome/Chromium context on exactly `https://www.edenia.study/?internal_test=1` and install interception before the first navigation;
- default-deny every learner-profile REST mutation and RPC reaching the provider, with a tested explicit allowlist only for authentication/session operations, logout, and named provably read-only calls;
- block and report `resolve_my_learner_profile`, `commit_my_learner_profile`, `migrate_my_accountless_profile`, `choose_my_learner_profile_conflict`, `restore_my_learner_profile`, `start_over_my_learner_profile`, `import_my_learner_profile`, `rollback_my_learner_profile_import`, and any unclassified learner-profile operation;
- fulfill only the blocked resolver request in-browser from `tests/fixtures/learner-profile/profile-ready-smoke.json`, a version-controlled synthetic `profile_ready` fixture, with a null onboarding request; require the app to open that fixture and keep every other blocked operation as a hard failure;
- record zero blocked-attempt expectation, allowed-request names/statuses, the deployed source/asset identity, and no request or response body, bearer value, cookie, user ID, profile ID, email, or profile content; and
- have deterministic local tests for the request classifier, resolver input/status guard, redaction, and evidence sanitizer.

Immediately before and after the smoke, the separately approved verifier must return only generation, revision, digest/byte-length agreement, and retained-version count for the exact owner-derived head. Those fields must match. The harness must report that no learner-profile operation reached the provider; the intentionally intercepted synthetic resolver request is reported separately and is not counted as an escaped mutation. If either mechanism is missing, unreviewed, or cannot be enforced, report `hosted-safe-smoke mechanism unavailable`, keep #286 open, and do not improvise a live guard.

The ordinary `resolve_my_learner_profile` RPC may restore a trusted predecessor internally; browser interception cannot constrain those server-side effects after the request is allowed. Therefore the exact live-resolver canary is never classified as `hosted-safe-smoke`. It requires `hosted-destructive-or-gate` authority naming the account, null-onboarding resolver call, preflight head, recoverability proof, rollback plan, and postflight verifier. It must not invoke Start over, import, backup retry, sync/catch-up writes, conflict resolution, or another learner-profile operation. If the resolver result is anything other than `profile_ready`, or any pre/post field changes, stop and execute only the pre-authorized recovery plan. #286 hosted completion is claimed only when the deployed fix SHA passes both the guarded deployed-client smoke and this exact live-resolver canary with an unchanged valid current head.

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
- `tests/contracts/google-identity-services-controller.test.mjs`
- `tests/contracts/local-runtime-config.test.mjs`
- `tests/contracts/runtime-config-flags.test.mjs`
- `tests/e2e/account-settings.spec.mjs`
- `docs/account-authentication.md`
- `docs/account-reminder-operations.md`
- `docs/deployment-and-releases.md`
- [Google Identity Services client-ID guidance](https://developers.google.com/identity/gsi/web/guides/get-google-api-clientid?hl=en)
- [Supabase Google Auth guidance](https://supabase.com/docs/guides/auth/social-login/auth-google)

### Phase 0 — Establish the complete localhost browser failure

The origin/client error is the confirmed first blocker, not proof that it is the only blocker. Before recommending or mutating provider configuration, Codex must:

1. Re-read the current Google Identity Services Web setup guidance, supported-browser/FedCM guidance, popup troubleshooting guidance, Supabase Google Auth guidance, and relevant Supabase Auth changelog entries. Use current primary documentation, not recollection.
2. Record the exact Chrome version, whether GIS FedCM is enabled by application configuration and browser support, the page's effective `Referrer-Policy`, `Cross-Origin-Opener-Policy`, and CSP, and the selected non-secret client ID/audience class. Never record a token, secret, session, account identity, or full provider configuration dump.
3. Reproduce the exact `http://localhost:8000/?internal_test=1` flow in a clean context and capture the first failing console/network state. Distinguish origin rejection, missing or incorrect referrer policy on HTTP localhost, popup-window isolation/COOP failure when the non-FedCM popup path applies, CSP refusal, audience rejection, and downstream Supabase rejection.
4. Recommend no repository header change unless the captured failure and current GIS documentation require it. If the origin fix exposes a separate browser-policy defect, handle that as a narrow repository branch under `local-implementation`; do not silently fold a broad security-header rewrite into provider execution.

### Decision stage

Codex must recheck the current Supabase changelog and official Google/Supabase guidance, inspect only sanitized non-secret configuration, and recommend one of these models:

1. **Dedicated localhost Google Web client with hosted Supabase Auth.** Local runtime uses the dedicated public client ID. Production Google JavaScript origins remain unchanged. The hosted Supabase accepted client-ID list keeps the production Web client first and adds only the approved localhost audience if current provider support and secret semantics are verified.
2. **Narrow localhost origins on the production Google Web client.** Add only Google's documented `http://localhost` and `http://localhost:8000` JavaScript origins, preserve the production origin, and record an owner, removal trigger, and rollback. Supabase keeps the production audience unless current documentation proves another change is required.

Reject an option explicitly if current provider behavior cannot support it. Do not substitute a completely local Supabase project: that tests a different objective.

The recommendation is complete only when it identifies the exact non-secret current state, chosen recommendation, rejected alternative, trust difference, provider surfaces, rollback, and verification plan. Then request one product-owner choice.

If Phase 0 proves that current repository behavior also violates a required GIS browser policy, the recommendation must name the exact policy, the precise server/header/meta or GIS option to change, its FedCM/non-FedCM applicability, and a focused automated regression. Preserve existing CSP and security headers unless the cited failure requires a narrow change.

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
- [ ] The local response's effective referrer policy matches the current GIS requirement for HTTP localhost, and the applicable FedCM or popup path is recorded rather than assumed.
- [ ] If the non-FedCM popup path is used, popup/opener behavior satisfies the current GIS COOP guidance with no blank popup; if FedCM is used, record why that popup-specific condition is not applicable.
- [ ] The approved account authenticates through the intended hosted Supabase project and signs out while the server profile-data gate remains off.
- [ ] Post-authentication read-only verification proves learner-profile generation, revision, and retained-version count did not change.
- [ ] The hosted internal origin still authenticates through the production client.
- [ ] An unrelated localhost port remains unauthorized.
- [ ] Only sanitized provider and browser evidence is recorded.
- [ ] Where the chosen contract changes repository documentation, update it in a separate source diff under `local-implementation` authority and deliver it only under `delivery` authority.

For any repository change produced by this packet, run and record:

```bash
node --test tests/contracts/google-identity-services-controller.test.mjs tests/contracts/local-runtime-config.test.mjs tests/contracts/runtime-config-flags.test.mjs
npm run build
npx playwright test tests/e2e/account-settings.spec.mjs --project=desktop-standard
npm run test:ci
```

The browser regression uses a deterministic GIS mock for local CI; the separately authorized live verification supplies provider/browser evidence and is never replaced by the mock.

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

### Local validation

```bash
node --test tests/contracts/accountless-profile-migration.test.mjs tests/contracts/accountless-profile-migration-view.test.mjs
npm run build
npx playwright test tests/e2e/accountless-profile-migration.spec.mjs --project=desktop-standard --project=phone-standard
npm run test:ci
```

### Boundary

The issue scope is local implementation and validation only; the `ready-for-agent` label does not authorize the work. Hosted interaction is deferred to a separately authorized #196 rerun; it must never select `Try backup again` merely to verify this UI fix.

## Packet 4 — Remove dismissed heatmap details from accessibility

### Proposed title and classification

> Keep Study History heatmap details accessible through each day button while making the visual-only surface stale-free

- Labels: `bug`, `ready-for-agent`.

### Historical evidence

Selecting a Heatmap day populates `#heatmapTooltip`. Returning to Summary removes only `show`; CSS makes the element transparent and non-interactive while stale text remains in the accessibility tree. Existing browser coverage asserts that Escape leaves the tooltip open.

### Chosen semantic contract

Use the heatmap day's accessible name as the only screen-reader presentation, but first make it semantically complete. It must include every distinct datum shown by the visual tooltip, including the localized streak length when `streakDayCount > 0`; omit the streak phrase when the count is zero. Keep `#heatmapTooltip` a visual-only element with `aria-hidden="true"` at all times. Do not add `role="tooltip"` or `aria-describedby` and do not duplicate the day details in two accessible presentations.

The WAI-ARIA Tooltip Pattern is contrast material only: this chosen control is not an ARIA tooltip. Codex must implement the contract above, not mechanically copy that pattern.

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

### Local validation

```bash
node --test tests/contracts/history-heatmap-tooltip-actions.test.mjs tests/contracts/history-heatmap-tooltip-markup.test.mjs tests/contracts/i18n.test.mjs
npm run build
npx playwright test tests/e2e/preservation-smoke.spec.mjs --project=desktop-standard --project=phone-standard --grep "Study History heatmap"
npm run test:ci
```

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
- `tests/e2e/account-settings.spec.mjs`

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

### Local validation

```bash
node --test tests/contracts/turnstile-controller.test.mjs tests/contracts/onboarding-account-integration.test.mjs
npm run build
npx playwright test tests/e2e/account-settings.spec.mjs --project=desktop-standard
npm run test:ci
```

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

The canonical A/B/C comparison is the pre-RPC client decision and therefore uses one fixed mocked server transcript, not a shared mutable database. Before the first run, record a sanitized fixture manifest and content hash covering: authenticated owner state, accepted generation/revision, current head, protected prior reset, activation state, pending/queued/dirty state, connectivity, fixed clock, confirmation actions, and expected request count. Reuse those exact bytes at A, B, and C. If current test seams cannot inject that transcript without tracked edits, finish the read-only evidence available and request `local-diagnostic-edits` to add one reusable fixture; do not substitute three ad hoc mocks.

Use a real local database only as a follow-on when the mock matrix reaches an RPC or proves a database-dependent difference. Run the database comparisons one SHA at a time. For each SHA, start from that worktree, reset a fresh disposable database from that SHA's migrations, record the migration identity, seed a new synthetic Auth owner, run once, and discard the database before the next SHA. Never reuse rows, tokens, or a migrated-forward database across A/B/C.

- [ ] Freeze three immutable comparison identities before new diagnosis or implementation work: A, historical incident commit `4b48df6c051971d13a28bbda5aa4d37801f94e1d`; B, the exact freshly fetched `origin/master` SHA; and C, the exact #286 candidate-head SHA before diagnostic or repair edits. If A and C are identical, record that explicitly.
- [ ] Reproduce the same deterministic fixture in detached/disposable worktrees at A, B, and C. Do not substitute a later mutable branch name for any recorded SHA.
- [ ] Keep runtime config, browser project, serialized storage fixture, mock transcript, confirmation actions, and clock byte-equivalent between comparisons; where the optional database follow-on applies, rebuild rather than reuse its schema/seed.
- [ ] Prove whether the click handler runs exactly once in each comparison.
- [ ] Record pre-action activation, sync projection, accepted generation/revision, pending/queued/dirty presence, cloud-head-known state, and protected-reset presence using synthetic identifiers only.
- [ ] If #286 changes after the matrix, rerun the regression on its exact final candidate identity before #286 is considered locally complete.

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

### Local validation when implementation is authorized

```bash
node --test tests/contracts/learner-profile-cloud-persistence.test.mjs tests/contracts/learner-profile-lifecycle.test.mjs tests/contracts/learner-profile-start-over-ui.test.mjs
npm run build
npx playwright test tests/e2e/first-signed-in-profile.spec.mjs --project=desktop-standard --grep "Start over"
npm run test:ci
```

If database/RPC behavior changes, also run `supabase test db supabase/tests/learner_profile_start_over.test.sql --local` against a reset database and prove the selected CI job invokes that exact file.

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

Run the existing local baseline exactly:

```bash
node --test tests/contracts/state-anki.test.mjs tests/contracts/anki-setup-markup.test.mjs
npm run build
npx playwright test tests/e2e/preservation-smoke.spec.mjs --project=desktop-standard --grep "Anki|Study History"
```

If `local-diagnostic-edits` is authorized, add the smallest deterministic browser regression to `tests/e2e/preservation-smoke.spec.mjs` with a unique title, record that exact title in the evidence receipt, and rerun it by exact `--grep`. If a production repair is authorized, also run `npm run test:ci` and the independent Codex review gate before completion. A no-reproduction diagnosis records the baseline and all five matrix results; it does not require a speculative new test.

### Terminal outcomes

- **Reproduced:** Report the smallest fixture and exact source location. If `local-diagnostic-edits` is authorized, preserve the red fixture. Recommend a narrow `ready-for-agent` follow-up only if the contract is behavior-preserving: retain the original Anki error, avoid the secondary null-target exception, and change no Activity-log policy. Creating the issue or applying a label requires `tracker-preparation`; fixing it requires `local-implementation`.
- **Not reproduced:** Report all five cases, Settings states, tested browser project, contract coverage, and history result. Recommend closure without speculative production changes; closing the issue requires `tracker-preparation`.

### Boundary

The Shared diagnostic contract applies. Keep the investigation local. Do not enable or exercise Anki integration on the hosted site. Logging suppression, deduplication, or coalescing requires a separate product contract and separately authorized ticket.

## #196 coordination

After `tracker-preparation` is authorized and either stable source URLs exist or the required sanitized evidence is embedded directly:

1. Update #286 with Packet 1 and its sanitized incident evidence.
2. Create Packets 2–7 as independent issues using the capsule, their complete packet text, and applicable shared contract—not summaries from the tracker table.
3. Add one coordination comment to #196 with stable evidence links or embedded sanitized evidence, every issue link, and the exact dependency rules below. Preserve its body and acceptance boxes.
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

1. Require an approval record naming `internal-canary-codex-ready-2026-09-04-v1`, then parse the invoking task's exact stage and external-action authority. Stop only at an actual ungranted boundary.
2. Read this plan, the sanitized exploratory record, repository instructions, domain/ADR references, current tracker state, and current remote base. Establish the isolated worktrees required by the Workspace and branch contract.
3. Choose the stable-URL or embedded-evidence path. Publish documents only with separately named `delivery` authority.
4. With `tracker-preparation` authority naming the individual operations, perform the recoverable tracker sequence: reconcile missing labels, update #286, create Packets 2–7, add the #196 coordination comment and justified dependencies, then verify and emit the mutation receipt.

### Diagnosis and implementation stages

5. Before changing or completing #286, freeze Packet 6 identities A/B/C and run Phase 0 under `local-diagnosis` authority.
6. If the result is branch-associated, use `local-diagnostic-edits` and `local-implementation` authority as granted, repair inside #286, and rerun the regression on the exact final #286 candidate identity.
7. Complete #286 against the current base only under `local-implementation` authority, including its exact matrix, safe-smoke harness, evidence receipt, and separate Codex review.
8. Diagnose and implement Packets 3, 4, and 5 independently under their respective authorities once their current-base red reproductions exist. Each packet gets its own worktree, its own branch when that action is authorized, a focused matrix, receipt, and separate review.
9. Run Packet 7's bounded diagnosis without delaying confirmed defects; stop at its reported terminal outcome unless another stage is already granted.
10. Run Packet 2's read-only `provider-decision` stage; request the single trust-model choice only after Codex posts the Phase 0 evidence, recommendation, and rollback.

### Delivery, provider, and hosted stages

11. Deliver each source issue through a narrow PR only when `delivery` authority names the permitted operations. Bind CI and independent review to the exact final PR SHA before merge.
12. Apply the issue lifecycle table with separately authorized tracker operations; do not let a PR keyword close #286, Packet 2, Packet 6, Packet 7, or #196 prematurely.
13. Execute approved provider configuration only with `provider-execution` authority. Make any repository documentation change under separate `local-implementation` and `delivery` authority.
14. Perform only ticket-specific non-destructive hosted smokes that receive `hosted-safe-smoke` authority. Use `hosted-destructive-or-gate` for every write-capable canary or gate change.

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
- [ ] A separate Codex reviewer records Standards and Spec results against the exact final release-candidate SHA and reports no unresolved P0/P1 correctness, ownership, integrity, privacy, scope, or progress-loss finding.

Only then follow the runbook's ordered gate-off monitoring, explicitly authorized developer-canary evidence, gate-off switch-off/rerun, final validation, no-known-defect confirmation, and product-owner approval request. Any restart or invalidation decision comes from the runbook and rerun planner, not from manual copying or this plan.

## References

- [Internal-canary exploratory record](internal-canary-exploratory-2026-09-04.md)
- [Superseded corrected execution-plan draft](internal-canary-codex-execution-plan-corrected-2026-09-04.md)
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
- [WAI-ARIA Authoring Practices — Tooltip Pattern (contrast material only for Packet 4)](https://www.w3.org/WAI/ARIA/apg/patterns/tooltip/)
