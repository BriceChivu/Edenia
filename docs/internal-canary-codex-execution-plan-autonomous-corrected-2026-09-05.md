# Internal canary Codex execution plan — corrected autonomous execution — 2026-09-05

## Status, identity, and purpose

- **Plan ID:** `internal-canary-codex-autonomous-2026-09-05-v3`.
- **Specification status:** Approved by the product owner on 2026-09-05; tracker preparation completed and verified. This v3 supersedes the earlier execution-plan drafts. No ticket execution has started.
- **Purpose:** Turn the September 4 exploratory findings into tracker packets that Codex can diagnose, implement, validate, independently review, deliver, verify, audit, and close one at a time without routine owner approvals or manual inspection.
- **Basis:** [the exploratory record](internal-canary-exploratory-2026-09-04.md), current repository guidance, ADR-0001, the release-readiness runbook, current source, and current tracker state.
- **Tracker:** GitHub Issues for `BriceChivu/Edenia`.
- **Evidence boundary:** September 4 observations are incident and reproduction evidence. They are not complete #196 release-readiness records.
- **Execution boundary:** This specification does not start work by itself. After this exact Plan ID is approved, one invocation naming a ticket—or saying `Execute the next ticket under internal-canary-codex-autonomous-2026-09-05-v3`—authorizes the complete bounded ticket workflow defined below for one selected top-level ticket, including the bounded derived repairs defined below. Codex must not ask again for an operation already included in that workflow.
- **Publication boundary:** This file supersedes the earlier execution-plan drafts only after approval of this exact Plan ID. Earlier local planning drafts remain historical working material and are not publication dependencies.

All diagnosis, implementation, review, tracker work, provider operation, verification, delivery, failure recovery, acceptance auditing, and closure described here is performed by Codex. The product owner approves this specification once, reviews each closed ticket, and asks Codex to execute the next ticket. Packet 0 establishes whether the required device, provider, authentication, and recovery capabilities can actually run unattended. Any unavoidable private setup interaction is disclosed and completed there before claiming readiness. A later expired credential or newly required private challenge remains an Exceptional pause; this plan cannot guarantee that external providers will never require human authentication. Codex never assigns acceptance testing or routine technical decisions to the owner. Public promotion, billing, legal acceptance, and a decision that knowingly weakens ownership or progress-safety guarantees remain outside this plan.

## Approval and tracker-preparation record

The product owner approved this exact Plan ID on 2026-09-05:

> Approve plan internal-canary-codex-autonomous-2026-09-05-v3 and prepare its tracker items.

The [canonical approval and tracker-preparation receipt](https://github.com/BriceChivu/Edenia/issues/196#issuecomment-5552413464) records the original specification hash, sanitized historical evidence, complete issue mapping, label reconciliation, native dependencies, and verified preservation of the original #196 and #286 content. The self-contained contracts and evidence are embedded in the issues; earlier local drafts were not published.

| Execution order | Packet | Prepared issue |
| --- | --- | --- |
| 0 | Packet 0 — unattended execution capabilities | [#290](https://github.com/BriceChivu/Edenia/issues/290) |
| 1 | Packet 6 — Start-over attribution | [#295](https://github.com/BriceChivu/Edenia/issues/295) |
| 2 | Packet 1 — profile-opening recovery | [#286](https://github.com/BriceChivu/Edenia/issues/286) |
| 3 | Packet 3 — failed-backup Later | [#292](https://github.com/BriceChivu/Edenia/issues/292) |
| 4 | Packet 4 — heatmap accessibility | [#293](https://github.com/BriceChivu/Edenia/issues/293) |
| 5 | Packet 5 — Turnstile configuration state | [#294](https://github.com/BriceChivu/Edenia/issues/294) |
| 6 | Packet 7 — historical AnkiConnect diagnosis | [#296](https://github.com/BriceChivu/Edenia/issues/296) |
| 7 | Packet 2 — localhost Google trust | [#291](https://github.com/BriceChivu/Edenia/issues/291) |
| 8 | Final release-readiness gate | [#196](https://github.com/BriceChivu/Edenia/issues/196) |

All nine issues remain open and unassigned. Preparation preserved the ten original #196 acceptance checkbox states and assigned audit IDs `196-AC-01` through `196-AC-10`. Approval and tracker preparation start no ticket; the first subsequent generic execution invocation selects Packet 0, #290.

## Revision boundary

This revision preserves the product contracts, local validation matrices, attribution rules, provider-choice rule, and delivery discipline from v2. It corrects six execution gaps: real deployed-browser proof for #286; explicit gate handoffs; a capability prerequisite and executable #196 scenario matrix; a self-contained #196 tracker contract; durable scheduled continuation; and autonomous bounded derived repairs.

Creating or reviewing this document authorizes no tracker, implementation, provider, gate, scheduling, or deployment operation. Approval of v2 does not silently approve v3. When v3 is adopted, tracker preparation replaces only the previously recognized plan-managed blocks, preserves unrelated issue content, and records the version transition.

## Activation and kickoff

Approval and ticket execution are distinct but intentionally simple:

1. **Specification approval** adopts the product, safety, provider-choice, delivery, evidence, and closure contracts in this Plan ID. Record one explicit owner statement naming this Plan ID. Approval alone starts no ticket.
2. **Tracker preparation** may be authorized in the same approval statement. It creates or updates the plan-managed issues and dependencies but implements none of them.
3. **One-ticket invocation** is either `Execute the next ticket under internal-canary-codex-autonomous-2026-09-05-v3` or an equivalent request naming one packet or issue. That single request grants the Standard ticket authority below for the selected ticket. It does not select a second top-level ticket. A derived repair required to finish the active ticket follows the Derived repair contract without a new invocation.
4. **Autonomous continuation** means Codex selects every branch already resolved by this specification, makes routine engineering judgments, remedies its own review and candidate-caused CI failures, and continues through explicit issue closure without seeking intermediate approval.
5. **Owner review boundary** begins only after Codex has closed the ticket and posted its durable completion receipt. Codex then stops. The owner reviews that completed top-level ticket and separately asks Codex to execute the next one. Derived repair receipts are included in that review; their closure does not stop the parent execution.

Recommended activation and recurring invocation:

```text
Approve plan internal-canary-codex-autonomous-2026-09-05-v3 and prepare its tracker items.

After reviewing each completed ticket:
Execute the next ticket under internal-canary-codex-autonomous-2026-09-05-v3.
```

The recurring invocation is deliberately sufficient by itself. Codex must not reinterpret it as diagnosis-only, local-only, PR-only, or permission to stop before closure. An owner may narrow a particular invocation explicitly; only that explicit narrowing overrides Standard ticket authority.

## Authority contract

### Standard ticket authority

The one-ticket invocation expressly authorizes Codex to perform every applicable operation below for the selected ticket:

| Phase | Authorized operations | Required result before continuing |
| --- | --- | --- |
| Preflight | Read instructions, issue/comments/dependencies, current remote state, provider documentation, and non-secret configuration; fetch refs; inspect dirty state; create isolated worktrees; install locked dependencies | Exact target, current base, relevant gates, required tools, review capability, and privacy boundary are known |
| Tracker | Claim or assign the ticket when supported; edit its plan-managed block; add or remove labels; add justified dependencies; post sanitized receipts; create only a follow-up explicitly required by a terminal decision table or a bounded derived repair | Tracker reflects the current technical state without changing unrelated issue text |
| Diagnosis | Run existing tests; add the smallest deterministic failing test, test-only seam, or behavior-preserving diagnostic; use disposable synthetic browser/database fixtures | Failure or terminal no-reproduction result is deterministic and evidence is durable |
| Implementation | Edit source, tests, documentation, migrations, and CI routing within the packet's stated scope; preserve every ownership, lineage, generation, revision, RLS, privacy, and public-path boundary | Packet criteria are met locally on the current base |
| Review | Automatically delegate the final Standards and Spec review to a separate Codex reviewer; send follow-ups; wait for its result; repair every P0/P1 finding and review the new candidate | Exact final candidate has no unresolved P0/P1 finding |
| Delivery | Create a `codex/` branch; commit explicit files; push; open or update a narrow PR; respond to review comments; refresh the base; repair candidate-caused CI; wait for required checks; merge; wait for required deployment | Final merged/deployed identities and checks satisfy the ticket |
| Provider | For Packet 2 only, inspect and mutate the exact Google Auth and Supabase Google-provider surfaces allowed by its deterministic decision rule; record rollback first; verify and roll back automatically on failure | Selected provider model passes its complete acceptance matrix |
| Hosted | Perform only the ticket's named account, route, verifier, gate, smoke, and recovery operations. Packet 1's guarded real-browser canary and gate handoff, and #196's ordered `off -> developer-canary -> off` sequence are conditionally authorized by their packet contracts | Preflight, postflight, rollback, and sanitized evidence all pass |
| Closure | Audit every acceptance criterion, update plan-managed checkboxes and the explicitly mapped original #196 acceptance boxes, post the canonical completion receipt, remove waiting labels, close the issue explicitly, and verify its final state | The issue is closed with queryable evidence; top-level closure stops for owner review and derived closure resumes its parent |

This authority is bounded to one selected top-level ticket and the Derived repair contract. Packet 0 may deliver the reviewed automation support needed by this plan; Packet 1 owns its hosted-opening harness. All other support work must be necessary for a named active-ticket criterion. It never authorizes public `signed-in-public` promotion, #197 cutover, billing or legal acceptance, unrelated provider changes, credential rotation, new authentication methods, relaxed ownership/RLS/generation/revision fences, or operations outside the packet.

### Exceptional pauses

Codex pauses only when one of these concrete conditions occurs:

1. A required private authentication interaction cannot be completed through the verified approved mechanism. Resolve anticipated setup interactions in Packet 0. If access expires later, contain any live canary, identify only the necessary private interaction, and resume the same execution automatically after it completes. Never bypass a challenge or substitute fabricated provider evidence.
2. The only available change would weaken ownership, RLS, lineage, generation, revision, integrity, progress-preservation, privacy, or public-route containment. Codex records the exact conflict and does not weaken the guarantee.
3. A required account, credential, tool, reviewer mechanism, or provider surface is unavailable after the bounded recovery loop below. Codex identifies the missing prerequisite precisely.
4. The work proves that resolution requires public rollout, billing, legal acceptance, or a materially different product contract outside the ticket.
5. The approved recovery cannot restore the scenario’s declared safe postcondition, or a live preflight reports ambiguous ownership or learner-profile state. For Packet 1 that postcondition is the unchanged head; intentional #196 reset/restore operations preserve protected history and may legitimately advance revisions. Restoring logical progress never means rewriting audit history to pretend an operation did not occur.

Routine ambiguity, a failing test, a merge conflict, a moving base, review findings, candidate-caused CI failures, provider-option selection covered by Packet 2, and a need for a packet-authorized regression seam are not exceptional pauses.

## Mandatory issue execution capsule

Every newly created issue body begins with this capsule; #196 also receives it inside its managed execution block. An existing issue places it first inside the plan-managed block defined under Tracker preparation. Replace bracketed fields before posting:

```text
Execution contract: internal-canary-codex-autonomous-2026-09-05-v3
Packet: [0–7, #196, or derived repair ID]
Execution mode: one top-level ticket with autonomous bounded derived repairs

This issue is a complete technical specification. After this Plan ID is approved, a user request to execute this issue—or the next ticket under this Plan ID—authorizes the complete Standard ticket authority for this issue, including its applicable tracker, diagnosis, implementation, independent Codex review, delivery, CI repair, merge, deployment, packet-bounded provider/hosted verification, acceptance audit, and explicit closure operations. Codex chooses every branch resolved by this issue and pauses only for an Exceptional pause defined by the plan. Work runs in an isolated worktree against a freshly verified remote base; unrelated changes and planning drafts are excluded. Local, CI, deployed-schema, provider, live-browser, and product-owner evidence remain separate. A separate Codex reviewer must report no unresolved P0/P1 Standards or Spec finding at the exact final candidate identity. Secrets, identities, sessions, profile contents, and private endpoints never enter issues, PRs, logs, or evidence artifacts.
```

The capsule is duplicated so an issue remains executable and safe when consumed without the rest of this document. The Plan ID makes later drift detectable.

## Workspace and branch contract

This contract is part of every ticket with local work:

1. Read `AGENTS.md`, `CONTEXT.md`, applicable ADRs, the target issue with comments, and the packet before source exploration. On resumption, first load the durable execution checkpoint and reconcile actual state; preserve the existing active worktree/PR rather than starting another.
2. Read the server's current `master` SHA with `gh api repos/BriceChivu/Edenia/commits/master --jq .sha`, run `git fetch --prune origin master`, and require `git rev-parse origin/master` to equal the server SHA. Record that full SHA as `remoteBaseSha`.
3. Inspect the current checkout and every proposed source worktree with `git status --short --branch`. Preserve every pre-existing tracked or untracked change. Never use destructive reset or checkout commands.
4. Create one isolated worktree and one uniquely named `codex/` branch per source-changing ticket. Start Packet 0, Packets 2–5, each derived repair, and every source-changing outcome of Packets 6–7 from the recorded `origin/master`. Do not stack independent tickets in one PR.
5. For Packet 1, preserve commits `276038c`, `cd93969`, and `4b48df6`. Create a new uniquely named `codex/` branch at `4b48df6c051971d13a28bbda5aa4d37801f94e1d` in an isolated worktree, then merge the recorded current `origin/master`. Never rewrite or clean the original checkout. Resolve any conflict through the merge-conflict procedure and re-run the complete Packet 1 matrix.
6. For Packet 6 A/B/C attribution, create three detached disposable worktrees at the recorded immutable SHAs. Use one fixed mocked server contract for the pre-RPC client comparison. A live/local database comparison is allowed only when each worktree receives its own reset database built from that SHA's migrations and records the migration identity.
7. If dependencies are absent in a fresh Darwin/ARM worktree, run `npm ci --os=darwin --cpu=arm64`. Treat missing `esbuild` as an environment gap, not a product defect.
8. Build `_site` before a browser run and keep it stable until that run ends. Run builds and browser suites sequentially.
9. Stage only explicit packet files with `git add -- <paths>`. Never use blanket staging. Planning drafts are excluded from ticket branches unless publication of this exact Plan ID was included in tracker preparation.
10. Before the first candidate commit, require `git diff --check`, a scoped diff against `remoteBaseSha`, the packet's exact tests, and `npm run test:ci`. Commit only the explicit ticket files, then run the independent review against that exact commit SHA.
11. Immediately before merge, re-read the server `master` SHA. If it differs from `remoteBaseSha`, fetch it, incorporate it without rewriting unrelated history, rerun every affected focused/full check, create a new candidate commit, and obtain independent review of that exact SHA. Merge only the reviewed, CI-green final candidate.

## Autonomous recovery loop

Routine failures remain inside the active ticket:

1. **Red reproduction does not fail:** verify the exact fixture, route, build, clock, browser project, and historical/current SHA. Run the packet's bounded no-reproduction matrix. Follow its terminal decision table instead of inventing a fix.
2. **Review finding:** repair every P0/P1 finding, rerun affected focused tests plus `npm run test:ci` after production-code changes, commit, and obtain a new independent review. Resolve P2 findings when they affect a packet criterion, safety boundary, or likely maintenance correctness; otherwise record them without expanding scope.
3. **Candidate-caused CI failure:** inspect the exact failed job and log, reproduce locally when possible, repair narrowly, rerun the affected local test and full required gate, review the new commit, push, and wait again.
4. **Likely infrastructure or flaky failure:** rerun the exact failed job once when the provider supports it. If the same failure recurs, diagnose it. Repair it only when evidence ties it to the candidate; otherwise record the external blocker after no more than three evidence-gathering attempts.
5. **Merge conflict or moving base:** refresh `master`, resolve through the repository merge-conflict procedure, rerun affected and full validation, review the resulting SHA, and update the same PR.
6. **Deployment failure:** inspect the exact deployment log, repair candidate-caused failures through the same loop, and retry a provider-side transient once. Never claim deployment from a green source PR alone.
7. **Provider verification failure:** execute the packet's rollback immediately, verify the rollback, diagnose from sanitized evidence, and continue with the packet's defined fallback when one exists.

8. **A new in-scope defect blocks acceptance:** contain live effects, preserve evidence, and execute the Derived repair contract. Discovery is not itself an Exceptional pause.

Codex posts concise progress to the active task while this loop runs. It does not request owner approval for any branch above.

## Derived repair contract

A derived repair is part of the selected top-level execution, not the next top-level ticket. Create one only for a reproduced defect that prevents a named active-ticket criterion and has a narrow repair preserving this plan’s product, ownership, privacy, gate, and progress guarantees. Unrelated improvements stay outside the execution.

1. Stop the affected live scenario; return the server gate to `off`, remove the designated canary owner, disable the bounded monitor canary, and perform only the already reviewed scenario recovery. Verify the safe postcondition before repair work proceeds. An unresolved live-state ambiguity is an Exceptional pause.
2. Search existing linked issues before creating a duplicate. Create or adopt a native blocker with the execution capsule, inherited bounded authority, exact parent criterion, sanitized reproduction, acceptance tests, delivery requirements, and terminal receipt. An unrelated existing blocker does not become executable merely because it is linked.
3. Record the suspended parent phase and invalidated evidence. Give each source-changing repair its own worktree, branch, PR, exact-SHA independent review, checks, and explicit closure. Apply the same scope and evidence rules as a normal packet. Repair work remains sequential; no second live executor may act concurrently.
4. After repair closure, automatically resume the parent. Re-inspect the merged/deployed candidate, use the runbook’s rerun planner, and restart the gate-off soak whenever the changed surface requires it. For #196, the original invocation conditionally covers this newly reviewed candidate produced by a bounded repair; bind renewed authority to its exact identity before gate activation.
5. Post each derived completion receipt and include its link and criterion mapping in the parent receipt. Continue automatically until the selected top-level ticket closes. Only then stop for owner review.

If a repair exceeds the defined contract, evidence establishes an external prerequisite is unavailable after bounded recovery, or recovery cannot establish a safe state, use an Exceptional pause with the parent open. Do not repeatedly ask the owner to invoke an already authorized repair. A repeated failure triggers diagnosis of the prior repair and fixture, not duplicate issues or blind repeated live actions.

## Tracker preparation

### 1. Choose stable supporting evidence

Tracker items may be created from the self-contained packet text without publishing either planning document. Before adding a source-document link to a public issue or #196, choose one of these evidence paths:

1. When tracker preparation explicitly includes publishing this Plan ID and the sanitized exploratory record, publish only those two documents and use stable commit-bound URLs; or
2. Embed the required sanitized evidence directly in the issue/comment and omit local-document links.

In either case, each issue body must contain its own baseline, starting points, acceptance criteria, validation, and stop conditions. Publish no credentials, private provider/project endpoints, emails, UUIDs, tokens, sessions, raw database rows, learner-profile contents, or local filesystem paths. The public Edenia route and official documentation URLs may remain.

The historical evidence anchors are:

- local exploratory checkout: `4b48df6c051971d13a28bbda5aa4d37801f94e1d` on `codex/issue-286-profile-ready-recovery`;
- hosted incident deployment: `018d256beac9910cfdbccc1da7ac725d4e88d166`;
- #286 local work: commits `276038c`, `cd93969`, and `4b48df6`, with no pull request at the time of the September 4 review.

These are historical anchors, not instructions to build on a stale base. At execution time, Codex must fetch the current remote state, record the current `origin/master` SHA, and compare the target branch against that exact base without discarding unrelated user work.

Tracker preparation is not globally blocked on document publication. Only a step that intends to cite a source document waits for a stable URL. Earlier local planning drafts must not be published merely to satisfy a reference.

### 2. Reconcile the exact triage labels

The repository contract requires these five label names and meanings. Preserve the complete metadata of every existing matching label. Create only a missing label, using the defaults below; do not rewrite an existing description or color merely to match this table.

| Label | Description | Suggested color |
| --- | --- | --- |
| `needs-triage` | Maintainer needs to evaluate this issue | `FBCA04` |
| `needs-info` | Waiting on reporter for more information | `D876E3` |
| `ready-for-agent` | Fully specified, ready for an AFK agent | `0E8A16` |
| `ready-for-human` | Requires human implementation | `1D76DB` |
| `wontfix` | Will not be actioned | `FFFFFF` |

Do not remap the repository documentation to semantically different existing labels. Verify that all five live names exist and that their operational use matches `docs/agents/triage-labels.md`; descriptions and colors are not an equality gate for labels that already existed. Label reconciliation during tracker preparation starts no ticket implementation.

### 3. Tracker inventory

Do not create another umbrella issue. Existing [#196](https://github.com/BriceChivu/Edenia/issues/196) owns the release-readiness outcome.

| Finding | Tracker treatment | Initial execution state | #196 relationship |
| --- | --- | --- | --- |
| Hosted profile opening is stuck | Update [#286](https://github.com/BriceChivu/Edenia/issues/286); preserve its original scope and add Packet 1 | `bug`, `ready-for-agent` after the update | Native blocker |
| Google rejects localhost | Create Packet 2 with the deterministic provider-choice rule below | `bug`, `ready-for-agent` | Link; not automatically a blocker |
| Failed-backup `Later` does not dismiss | Create Packet 3 | `bug`, `ready-for-agent` | Link; blocker only after exact criterion mapping |
| Hidden heatmap details remain exposed | Create Packet 4 | `bug`, `ready-for-agent` | Link; not automatically a blocker |
| False Turnstile guidance | Create Packet 5 | `bug`, `ready-for-agent` | Link; not automatically a blocker |
| Confirmed Start over did not reach its RPC | Create Packet 6 as attribution plus conditional implementation work; execute it before #286 | `bug`, `ready-for-agent` | Link initially; native blocker only after clean-base reproduction |
| Historical AnkiConnect null-target entry | Create Packet 7 as bounded diagnosis plus behavior-preserving repair when reproduced | `bug`, `ready-for-agent` | Link only if current reproduction invalidates a #196 criterion |

Manual paths that passed are not separate issues. They are adjacent non-regression checks for affected packets and context for a later #196 rerun.

### 4. Assemble self-contained issue bodies

Every newly created issue begins with the **Mandatory issue execution capsule** and encloses all plan-owned content between `<!-- codex-plan:internal-canary-codex-autonomous-2026-09-05-v3:start -->` and `<!-- codex-plan:internal-canary-codex-autonomous-2026-09-05-v3:end -->`. For existing #286 and #196, preserve the complete pre-existing body and append one such plan-managed execution block. During migration from v2, replace its exact known marker pair with the v3 block; never append conflicting active contracts. The original #196 checkbox state may change only during its final criterion audit as specified below. A later update may replace only content between those exact markers.

Each plan-managed block is self-contained. Copy into it the complete Standard ticket authority, Exceptional pauses, applicable Workspace and branch contract, Autonomous recovery loop, Derived repair contract, applicable Durable continuation contract, complete packet, applicable shared diagnostic/implementation contracts, Independent Codex review gate, Evidence receipt, and that ticket's lifecycle row. Packets 6 and 7 receive both shared contracts because their terminal rules may proceed directly from diagnosis to implementation. Packet 2 receives its full deterministic decision/execution packet and provider preconditions. Packet 0 receives its complete capability contract and the full #196 executable scenario matrix as its required deliverable specification. #196 receives the capsule, shared authority and recovery contracts, Derived repair contract, durable continuation contract, complete Final #196 release gate, scenario execution matrix, evidence/closure rules, and the actual packet-number-to-issue mapping and order. Stamp every body with this Plan ID and exact packet number. Do not replace any of this executable content with a link back to the plan.

Include the applicable contract in the issue itself; a link to this plan is supporting context, not a substitute. Do not create an issue from only the tracker-inventory row, proposed title, or summary.

### 5. Apply tracker mutations in a recoverable order

When Plan approval includes tracker preparation, Codex performs this sequence without another approval:

1. Read the live bodies, comments, labels, dependency summaries, and state of #196 and #286. Keep a sanitized before-state receipt in the task while preparing the mutation; do not publish identities or profile contents.
2. Update #286 in place by appending or replacing only the delimited plan-managed block containing the capsule, Packet 1, and the Shared implementation contract. Preserve its title, complete pre-existing body, comments, and issue number. Add `bug` and `ready-for-agent`, then add #286 as a native blocker of #196.
3. Create Packet 0 and Packets 2–7 from their complete issue text and applicable contracts. Reconcile existing items by Plan ID, packet number, and prior preparation receipt before creating anything. Capture each returned issue number and URL before constructing later links.
4. Add one coordination comment to #196 containing the Plan ID, sanitized historical baseline, created issue links, and blocker rationale. Append or replace only #196’s managed execution block; preserve the original body and leave its acceptance boxes unchanged during preparation. Add the execution prerequisites Packet 0 -> each remaining plan ticket and Packet 6 -> #286 as native blocked-by relationships, plus the #196 release blockers justified below. Store the full ordered packet-to-issue mapping in #196’s execution block so a fresh task can resolve “next ticket” from the tracker alone.
5. Re-read every changed issue and dependency summary. Append a sanitized tracker-preparation receipt to the #196 coordination comment listing the exact creates, body edits, labels, and dependencies performed. A partial failure stops before dependent operations; Codex reads the resulting state and resumes only missing idempotent operations rather than guessing an issue number or repeating a mutation blindly.

### 6. Issue lifecycle and explicit closure

| Item | Commit/PR reference | Closure rule |
| --- | --- | --- |
| Packet 0 | Always use `Refs #<n>` | Close after reviewed support delivery, all capability checks and local recovery/resumption rehearsals pass, and the complete executable scenario manifest is durably recorded; unavailable required devices or access leave it open |
| #286 / Packet 1 | Always use `Refs #286` | Close after reviewed merge/deployment, synthetic smoke, real deployed-browser activation/reload/retry proof, unchanged head verification, and verified gate-off handoff |
| Packet 2 | Always use `Refs #<n>` | Close explicitly after the deterministic provider configuration is applied and verified, required repository documentation is delivered, and localhost plus hosted-origin checks pass; an automatically rolled-back failed model proceeds to its defined fallback |
| Packets 3–5 | Always use `Refs #<n>` | Close explicitly after the final reviewed PR is merged, or after an independently reviewed current-base audit proves every criterion already satisfied with durable regression coverage; post the canonical receipt in either case. These packets require no separate hosted proof |
| Packet 6 | Always use `Refs #<n>` | Close after the A/B/C attribution is durable and either the independently reviewed bounded matrix does not reproduce, the current-base repair is merged, or a branch-only/historical regression test is merged and its #286 handoff is embedded in #286's managed block |
| Packet 7 | Always use `Refs #<n>` | If not reproduced, close with the independently reviewed bounded matrix and history receipt. If reproduced and behavior-preserving, repair, merge, then close the same issue. Create a follow-up only when the required behavior is outside the packet's explicit contract |
| #196 | Never use an auto-close keyword from a packet PR | Close explicitly when the runbook report is complete and validated, the no-known-defect assertion and separate Codex review pass, and the report records `awaiting-product-owner-approval`; public promotion remains a separate #197 owner decision |

Before any close, Codex re-reads the live issue, linked PR, dependency summary, and required evidence. It updates the applicable acceptance boxes supported by evidence, posts the canonical completion receipt, closes explicitly, and re-reads the final state. A top-level closure stops for owner review; a derived closure resumes its parent. Auto-close keywords are prohibited because they can close an issue before this audit.

## Shared diagnostic contract

Every packet that begins with diagnosis uses this process:

1. Record the exact historical, current-base, and working SHAs required by the packet.
2. Reproduce with existing tests and disposable synthetic fixtures first.
3. Preserve the named route, namespace, locale, identity, and lifecycle boundaries.
4. Add only the smallest failing regression, test-only seam, or behavior-preserving diagnostic needed for a deterministic result.
5. Report the exact commands, fixtures, result, evidence class, uncertainty, and selected terminal branch in the evidence receipt format below.
6. Continue automatically into the packet's implementation, tracker, delivery, or closure branch. Stop only for an Exceptional pause.

## Shared implementation contract

Every source-changing packet uses this process in addition to its packet-specific criteria:

1. Record the current remote base SHA and the exact working SHA before diagnosis.
2. Reproduce the defect with the smallest deterministic local contract or browser fixture before changing behavior. Record the failing assertion and prove that the same assertion turns green after the change. If the historical symptom does not reproduce on current base, audit every packet criterion: when any criterion fails, use it as the red contract; when all pass, identify the resolving change through a bounded history check, add only missing regression coverage, obtain independent review of the current-base audit or test-only commit, and close as already resolved without speculative production edits.
3. Preserve the exact internal/public route, storage namespace, locale, and lifecycle boundaries named by the packet.
4. Make the narrowest behavior change that satisfies the packet. Preserve unrelated user changes.
5. Prove the focused regression turns green, then run the nearest affected contract and browser suites.
6. Run database tests when an RPC, schema, grant, RLS policy, or database contract changes. Confirm CI routes and invokes every relevant pgTAP file; a green job name alone is not proof.
7. Run `npm run test:ci` before delivery. Do not rebuild `_site` while a browser suite is using it.
8. For shared or gated code, identify the central gate and prove the ordinary public path remains unchanged.
9. Commit the candidate, then run the independent Codex review gate below against that exact commit SHA. Resolve every correctness or scope finding before delivery or completion, then rerun affected validation and review the new commit after any change.
10. Emit the evidence receipt below. Report local proof, hosted CI proof, deployed-schema proof, hosted-provider proof, live-browser proof, and product-owner approval as separate evidence classes. `npm run test:ci` does not run repository pgTAP files, so it cannot satisfy a named database test requirement.

Local completion is an intermediate state. Standard ticket authority requires Codex to continue through every applicable tracker, delivery, provider, hosted, and closure phase.

### Independent Codex review gate

Before making a tracked behavior change, the implementing Codex verifies that it can automatically delegate to another agent or create, message, and wait for one separate read-only Codex review task. The one-ticket invocation explicitly authorizes creation and coordination of that reviewer. If neither mechanism exists, this is an initial Exceptional pause; it must not be discovered after implementation.

The implementing Codex may perform iterative self-review, but final completion requires a separate Codex reviewer that did not author the candidate. Give it the complete issue body, repository instructions, `remoteBaseSha`, and exact final commit SHA. For a no-change diagnosis, give it `remoteBaseSha` plus the complete diagnosis receipt. The reviewer independently reads the candidate and compares it with `remoteBaseSha`, then performs two explicit passes:

1. **Standards:** repository instructions, privacy, isolation, security, test, gate, and change-scope compliance.
2. **Spec:** every packet criterion, prohibited behavior, evidence class, and route/namespace/lifecycle boundary.

The reviewer reports findings with severity, file, line, and rationale, or explicitly reports no findings for each pass. Completion requires no unresolved P0 or P1 finding. The implementing Codex sends the reviewer the new exact SHA after every repair and waits for the renewed result. The final review text is copied into the PR and canonical issue receipt; a platform's generic approval state or an inaccessible task reference is not a substitute.

### Evidence receipt

Every diagnosis, implementation, review, delivery, provider, hosted-smoke, and closure stage appends evidence to a durable tracker surface as the stage completes:

- source-changing work records commands, CI, and review in the PR and links that record from the issue;
- provider or hosted work records a sanitized issue comment, with links to provider/deployment evidence where those links are safe and stable; and
- every ticket ends with one canonical completion receipt in the issue before closure. A private task reference, local transcript, or final chat message is not durable evidence.

Use this schema for the canonical completion receipt:

```text
Plan ID and packet/issue:
Ticket invocation:
remoteBaseSha / startingSha / final commit SHA / merge SHA / deployed identity, as applicable:
Changed files (or none):
Red reproduction: exact command, fixture, failing assertion, result:
Focused validation: exact commands and results:
Full local validation: exact command and result:
Database validation: exact pgTAP command/file and CI invocation proof, or not applicable:
Autonomous recovery-loop events and resolutions, or none:
Independent Codex review: mechanism, exact reviewed identity, Standards result, Spec result:
Acceptance audit: one PASS/FAIL line per applicable packet and original issue criterion with an evidence pointer; conditional criteria may be NOT APPLICABLE only with the exact terminal-branch rule:
Tracker/PR/CI/deployment/provider/live evidence: separate durable URLs or not applicable:
Privacy and public-path containment checks:
Remaining blockers: none, or the exact Exceptional pause condition:
Execution checkpoint / scenario manifest / derived repair receipts, as applicable:
Verified final gate and automation shutdown state, as applicable:
Closure state and timestamp:
```

For Packet 0, the red reproduction field records a failing capability/support contract when code is added, or a verified existing-capability audit when no change is needed. The setup ticket follows the shared delivery checks for any repository changes.

For `Ticket invocation`, record only the Plan ID, ticket number, and UTC invocation time; do not expose a private task URL or private message. Never replace exact commands and results with “tests pass.” Use `not applicable` only when the packet does not require that evidence class; do not use it to hide an omitted required stage. Before closing, re-read the rendered issue and PR, verify every plan-managed checkbox against the linked evidence, post the canonical receipt, close the ticket explicitly, and confirm that the tracker shows the intended final state.

## Packet 0 — Prove unattended execution capabilities

### Purpose and authority

Proposed title: **Prepare and verify Codex execution, device, evidence, and recovery capabilities for the internal canary plan**.

Create this setup ticket during tracker preparation with `ready-for-agent`; it is an execution prerequisite, not an application bug. The first generic invocation selects it. Its Standard ticket authority covers narrow repository tooling/documentation, local synthetic rehearsals, independent review, delivery, read-only capability checks against approved operator surfaces, and a temporary task-heartbeat rehearsal. It does not change provider trust configuration, enable the profile-data gate, mutate hosted learner profiles, run destructive hosted scenarios, purchase services, or execute another packet’s live acceptance tests.

Codex must build missing local support needed by this plan rather than merely listing missing tools. Read the server gate without changing it during operator capability checks. If it is not off, limit hosted checks to read-only operator metadata and harmless neutral-page/device checks; prove application-operation mechanics locally and securely verify that the required capabilities are present. Do not navigate an authenticated hosted learner surface during setup. Existing live gate state is not authority to take over another execution. Packet 1’s contained entry procedure handles the designated pre-existing canary when that ticket starts. Packet 0 records the observed handoff state rather than requiring a gate transition it cannot perform.

### Required deliverables

Deliver one version-controlled execution manifest and reviewed runner/verifier/recovery entry points, using existing repository equivalents where practical. Codex selects concrete filenames and commands, records them in this issue and #196’s managed block, and validates their existence at the delivered SHA. Placeholder commands or “Codex will figure this out later” do not satisfy this ticket.

Each scenario manifest row contains:

- exact scenario/subcase IDs and mapped issue criterion;
- executable command or bounded browser/device procedure and required runner/browser/OS;
- secure capability references and approved target derivation; public receipts contain opaque classes only, never credential locations or private endpoints;
- gate/runtime prerequisites, allowed operations, fixture creation and disposal rules;
- observable assertions, expected request/delivery counts, timeout, retry limit, and zero-skip requirement;
- sanitized result-artifact location, schema, content hash, and retention/access mechanism usable by an independent reviewer;
- idempotency/reconciliation checks, cleanup, exact recovery command/procedure, expected safe postcondition, and escalation condition;
- current capability-check result, runner/recovery review SHA, and local rehearsal evidence.

The manifest covers every row in the #196 scenario matrix below, Packet 1’s real-browser requirements, and Packet 2’s two-origin provider checks. Capability readiness does not require the application defects to be fixed or localhost Google trust to exist already: verify provider access and executable verification mechanics here; Packet 2 implements and validates that trust configuration. A real browser procedure may use computer-use tools; it need not be implemented as a new framework. It must still state exact assertions and produce reviewable evidence. Support code must remain narrow and must not alter application behavior or weaken security to make automation easier.

### Capability acceptance

- [ ] GitHub read/write, PR checks, merge, deployment inspection, and independent reviewer mechanisms are available to the intended execution environment. Verify privileges through read-only metadata where possible; actual writes occur only during authorized delivery.
- [ ] The approved operator capability can read the exact server gate, securely designate the approved owner, perform the permitted conditional transitions, and restore gate-off state. Rehearse transition/cleanup commands against a disposable local stack; hosted checks remain read-only.
- [ ] Actual macOS Chrome, macOS Safari, current iPhone Safari, the required paired second device, and applicable private-browsing mode are accessible to Codex. Verify browser/device identity and a harmless local or neutral-page interaction. Desktop WebKit or phone emulation does not substitute for required real-device evidence.
- [ ] The designated canary authentication route, approved inbox/notification evidence access, provider configuration access, and backup/operator verification surfaces have been capability-checked. Complete any anticipated private login or challenge setup before marking unattended readiness; store no secrets in receipts. Reuse existing approved access; do not create accounts, buy a device service, or rotate credentials implicitly.
- [ ] Scenarios that require distinct identities, missing heads, protected versions, or failure injection have explicit disposable fixture and restoration procedures consistent with the single designated canary boundary. Local synthetic identities may be created freely in disposable fixtures; hosted target expansion is outside this plan. If a required live scenario cannot be proved within the approved target boundary, record the exact prerequisite conflict and keep this ticket open.
- [ ] Each manifest row has executable steps and measurable assertions; every required subflow maps to an original #196 criterion. The manifest has no unresolved device, runner, evidence-access, or recovery placeholder.
- [ ] Recovery and mutation guards pass local synthetic success, failure, timeout, and interruption rehearsals. Recovery verifies logical progress/protected history and expected revision effects, not a destructive rewrite of audit history.
- [ ] The Durable continuation contract passes duplicate-wakeup, interrupted-phase, completed-mutation-with-missing-receipt, candidate-change, and gate-cleanup rehearsals without a second mutation or executor.
- [ ] Start one temporary heartbeat that reads a harmless rehearsal checkpoint, demonstrate continuation in the same task, then cancel it and verify cancellation. Record the actual scheduler and persistence mechanism; a proposed schedule is insufficient.
- [ ] Independent Standards and Spec review covers the manifest, commands, sanitizer, recoveries, device evidence, and rehearsal artifacts at the exact final SHA. Deliver any repository changes under the shared validation/delivery contract.

A runner’s local rehearsal proves execution mechanics, not hosted acceptance. Revalidate expiring capabilities at each affected ticket’s preflight. If a prerequisite cannot be established through bounded autonomous setup, leave Packet 0 open and identify it precisely; do not mark later live work ready based on an assumed manual owner check. Once Packet 0 closes, the owner reviews its receipt and invokes the next ticket normally.

## Durable continuation contract

Apply this contract before any unattended wait or live mutation in Packet 1, Packet 2, #196, or a derived repair. Packet 0 delivers and tests the concrete mechanism. The selected task heartbeat observes external evidence and resumes the same top-level execution; it is not the Independent Auth monitor and cannot manufacture missing soak observations.

Persist a sanitized checkpoint in a durable execution store available to the runner, with tracker receipts pointing to reviewable evidence. Keep private capabilities in the approved secure store. The checkpoint contains Plan ID, top-level/derived issue, invocation time, manifest/review identity, current phase, base/candidate/deployment identities, expected gate state, completed scenario artifact hashes, soak window bounds and source cursor, outstanding mutation intent, recovery state, and heartbeat/lease references. Public receipts redact private references.

Use an exclusive execution lease acquired atomically in the execution store. It must fence duplicate wakeups and cover hosted gate/provider/profile actions across the active parent and derived repair. A GitHub assignee alone is not a lease. A resumed executor must reconcile actual state before taking over an expired lease; expiration never proves a previous remote mutation failed. The manifest specifies the tested lease backend, renewal/expiry policy, and independent emergency containment mechanism. No hosted mutation is allowed until those are verified.

Persist phases in order:

`preflight -> local-work -> reviewed -> delivered -> waiting-soak (when required) -> live-scenario -> cleanup -> acceptance-audit -> closed`

Use `repairing-derived` to suspend the parent with its phase/evidence pointer. A phase may be skipped only when the selected terminal branch explicitly makes it inapplicable. Checkpoints are written before remote mutation intent and after observed completion.

On every wakeup or restart:

1. Acquire/revalidate the lease, load the checkpoint, and re-read the live issue, PR/deployment identity, gate, and pending operation status. Resume the existing worktree/PR; do not select a new ticket or issue duplicate provider operations.
2. If the issue is already closed with a valid receipt, cancel the heartbeat and verify safe cleanup, then stop. If another healthy executor owns the lease, perform no mutation.
3. If a remote action may have completed before its receipt was saved, query the outcome using its idempotency marker and pre/post invariants. Record the observed result. Retry only when the approved operation is proven idempotent or proven not to have occurred. Ambiguous destructive outcome requires containment and an Exceptional pause.
4. Revalidate candidate and gate identity before continuing. Changes invalidate affected evidence through the runbook planner; never copy old observations onto a new candidate.
5. During the soak, read both independent external-check history and aggregate records from the saved cursor, calculating the complete window’s bounds, counts, gaps, and failures. Reconstruct missed observations from the authoritative histories when available; missing source evidence remains a gap. A missed heartbeat alone is not a provider failure and a heartbeat cannot substitute for a missing external check.
6. Before each live phase, verify reviewed recovery capability and an independently effective timeout/lease-loss containment path. Packet 0 must rehearse the chosen mechanism (for example a narrowly scoped watchdog). On runner loss it must be able to set the gate off and disable the bounded canary; it must never guess a destructive data recovery. Reconciliation follows on resumption.

The manifest names the scheduler, cadence, host and availability requirements, persistent store, and failure notification route. Local work requires the host powered on and its scheduling application running. If that availability cannot be assured, establish an already authorized compatible runner or keep the capability prerequisite open. Do not silently provision a paid runner. Notify only on actionable failure, required private input, or top-level completion; routine soak progress remains quiet.

When closing a top-level ticket, first verify gate-off/owner removal where applicable, disabled bounded canary, completed safe cleanup, and stopped emergency watchdog. Change the heartbeat to closure-reconciliation-only, with no provider/gate/profile mutation authority. Post the completion receipt and close/verify the issue; then release the lease, cancel the heartbeat, verify cancellation, and append those final results to the canonical receipt. This ordering lets a wakeup finish an interrupted closure without repeating a live action. Packet 0 only cleans up the rehearsal mechanisms it created; local-only tickets do not change hosted state. If execution stops exceptionally, retain only bounded read-only continuation needed for recovery; never leave a scheduled callback authorized to repeat an ambiguous mutation.

## Packet 1 — Complete existing #286 profile-opening recovery

### Tracker action and classification

- Update, do not duplicate, [#286 — Internal-test signed-in profile opening can remain stuck in generic recovery](https://github.com/BriceChivu/Edenia/issues/286).
- Keep `bug` and add `ready-for-agent` after the self-contained update below is posted.
- Add #286 as a native blocker of #196.
- Packet 6 must already be closed. Consume its canonical A/B/C diagnosis receipt, retain any regression it produced as an explicit #286 acceptance test, and otherwise rerun its exact bounded matrix on the final #286 candidate.
- Keep #286 open through local completion, delivery, deployment, the synthetic smoke, the real deployed-browser acceptance matrix, and the verified gate-off handoff. The standard #286 invocation authorizes those packet-bounded stages; no additional stage approval is required.

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

Local completion continues through push, PR, CI, independent review repair, merge, and deployment under the standard invocation. Packet 1 delivers `scripts/hosted-profile-opening-smoke.mjs`, its focused contracts, synthetic fixture, and an owner-scoped pre/post verifier, or names an existing reviewed equivalent. Packet 0 proves the access and runner capabilities; Packet 1 reviews the final harness against its final candidate before live use.

#### Gate handoff and preflight

The standard Packet 1 invocation conditionally authorizes a narrow `off -> developer-canary -> off` server profile-data gate sequence for the securely designated owner, solely for the checks below. This is defect verification, not #196 soak or release evidence. Keep the deployed account rollout internal and the required lifecycle runtime enabled; any required contained runtime preparation belongs to this ticket’s reviewed deployment and must preserve the ordinary public accountless path.

1. Reconcile the current server gate and owner using the approved operator surface. If `off`, require no configured owner. If already `developer-canary` for this exact approved owner with no competing operator, contain it to `off` first. Any other owner, public gate, or ambiguous active operation is an Exceptional pause; never commandeer another canary.
2. Record the exact deployed SHA, asset version, cache-busted runtime hash, gate state, verifier identity, and reviewed rollback procedure. Confirm exclusive execution ownership, independent emergency gate-off capability, and disabled bounded Auth-monitor canary. Record invalidation of any prior #196 soak/evidence affected by this ticket.
3. Privately verify that the exact owner-derived current head is valid and recoverable. Capture head/profile identity, generation, revision, full digest, byte length, retained-version set/count, and protected-state invariants inside the secure verifier. Emit only allowlisted counts and equality/validity results; never profile contents, credentials, identities, or raw snapshots.
4. Complete the synthetic smoke below while the gate remains off. Then enable `developer-canary` for only that owner for the real browser canary. Record and read back the transition before allowing the real resolver request.
5. On success or failure, return the gate to `off`, remove its owner, keep the bounded monitor canary disabled, verify fail-closed behavior, and release the live-operation lease. Packet 2 must receive this gate-off exit receipt. No hosted ticket closes with an active canary or an unverified cleanup.

#### Synthetic deployed-client smoke

Launch an isolated Chrome/Chromium context on exactly `https://www.edenia.study/?internal_test=1`. Install interception before navigation, block service workers and unclassified profile traffic, and default-deny learner-profile REST mutations and RPCs. Permit only explicitly classified authentication/session operations, logout, and provably read-only calls.

Fulfill the expected null-onboarding resolver request in-browser from the version-controlled synthetic `profile_ready` fixture. Seed only synthetic malformed/stale bookkeeping in the isolated internal namespace and prove the corresponding repair/activation behavior. Use a fresh context for each case. Require one expected intercepted resolver per declared navigation/attempt, no unexpected profile attempts, and no profile operation reaching the provider. Reload and retry counts belong to their own declared phases; a global one-request assertion must not contradict required reloads.

Record only request names/statuses, phase counts, UI assertions, and deployed identity. Deterministic contracts cover request classification, null-onboarding validation, service-worker interception policy, sanitizer/redaction, rejected unknown operations, and failure cleanup. This smoke supplies deployed-code evidence with synthetic data and cannot satisfy real-account activation.

#### Real deployed-browser acceptance

Use a separately isolated approved Chrome context and the same network guard, but allow the actual null-onboarding `resolve_my_learner_profile` response to reach the deployed client unchanged. A direct RPC result alone does not satisfy this stage. The resolver may restore a predecessor server-side; permit it only after the valid-head preflight and reviewed recovery rehearsal above. Block sync/catch-up writes, backup retries, Start over, import, conflict choice, and every other learner-profile mutation. If the application attempts one, stop and diagnose it; never broaden the allowlist merely to obtain a pass.

Run this named matrix on the exact deployed candidate:

- **Real head opens:** authenticate the designated owner, consume the actual resolver response, and assert the lifecycle reaches `active`, the town is usable, and the generic recovery gate is absent.
- **Malformed bookkeeping:** in an empty disposable internal namespace, seed the synthetic malformed import/sync bookkeeping cases accepted by the local contract. Consume the real head and assert safe repair and activation.
- **Stale bookkeeping:** inject only synthetic payload-free stale metadata with the owner/lineage relationship established privately by the harness; prove safe reconciliation. Keep protected or meaningful state fixtures local.
- **Reload:** reload after each successful activation, declare the expected resolver count for that phase, and prove the same head and town open again with no attempted write.
- **Retry:** inject one bounded transport failure without fabricating a successful resolver response, assert retryable feedback, select the deployed retry action, then allow the real response and assert activation. Record this as an injected-failure/live-success phase, not an observed provider outage.

For every phase assert exact expected resolver counts, zero unauthorized operations, and safe UI outcome without storing rendered learner content. The private verifier must compare the full pre/post head identity and digest, generation, revision, byte length, retained versions, and protected state, then emit `headUnchanged`, `retainedVersionsUnchanged`, and bounded metadata. Row-internal digest agreement alone is insufficient proof of no change.

If the result is not `profile_ready`, activation fails, an unexpected operation occurs, or any invariant changes, stop the canary, contain the gate, and use only the reviewed recovery. Resume diagnosis/repair under the existing invocation, using a derived repair when appropriate. If the head cannot be verified/restored safely, leave #286 open with an Exceptional pause. Repeat the complete required hosted matrix after a candidate change.

Closure requires all original #286 acceptance criteria and the packet criteria to have evidence, both synthetic and real-browser matrices to pass, and the gate-off exit receipt. Do not copy these results into #196 as final-candidate evidence without the runbook’s explicit retention eligibility.

## Packet 2 — Decide and configure localhost Google trust

### Proposed title

> Decide and configure the narrow Google and Supabase trust model for localhost Google sign-in

### Classification and ownership

- Labels: `bug`, `ready-for-agent`.
- Codex owns the current-documentation check, sanitized investigation, deterministic model selection, exact provider operation, repository changes, verification, rollback when required, delivery, evidence, and closure under the standard one-ticket invocation.
- The product owner does not choose between equivalent safe implementations. A user-only provider login, OTP, passkey, CAPTCHA, or confirmation screen may cause one Exceptional pause; after that action, Codex resumes the same ticket without requesting a new implementation decision.
- The decision rule below is the product contract. Any provider UI wording or layout change is handled by inspecting the current state and mapping it to this contract, not by returning the choice to the owner.

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
4. Make no repository header change unless the captured failure and current GIS documentation require it. If the origin fix exposes a separate browser-policy defect, handle that as a narrow source change within this same ticket; do not silently fold a broad security-header rewrite into provider execution.

### Deterministic decision stage

Codex must recheck the current Supabase changelog and official Google/Supabase guidance, inspect only sanitized non-secret configuration, and select the first safe supported model:

1. **Primary — dedicated localhost Google Web client with hosted Supabase Auth.** Select this when the existing Google Cloud project and consent screen permit a dedicated Web client using only `http://localhost` and `http://localhost:8000`, and Supabase can accept its public client ID without replacing the production primary client, rotating/changing a secret, weakening nonce verification, or changing production Google origins. Local runtime uses only the dedicated public client ID. Keep the production Web client first in Supabase's accepted list.
2. **Automatic fallback — narrow localhost origins on the production Google Web client.** If the primary model is unsupported or cannot satisfy all primary constraints, add only `http://localhost` and `http://localhost:8000` to the existing production Web client. Preserve `https://www.edenia.study`; do not change the Supabase audience unless current primary documentation and captured evidence require it. Record removal when localhost-to-hosted canary work is retired or a dedicated client becomes safely supportable.

Record why the primary was selected or rejected and why the resulting model satisfies the trust boundary. Do not add a wildcard, `127.0.0.1`, another port, or a completely local Supabase project: each would test or trust a different objective.

The decision is complete only when it identifies the exact non-secret current state, selected model, rejected alternative, trust difference, provider surfaces, rollback, and verification plan. Continue directly to execution when the preconditions pass.

If Phase 0 proves that current repository behavior also violates a required GIS browser policy, the decision record must name the exact policy, the precise server/header/meta or GIS option to change, its FedCM/non-FedCM applicability, and a focused automated regression. Preserve existing CSP and security headers unless the cited failure requires a narrow change.

### Provider-execution safety preconditions

- [ ] Codex recorded the selected model under the deterministic rule and the exact Google and, if applicable, Supabase Auth surfaces to mutate.
- [ ] The server profile-data gate is verified `off` and no developer-canary owner is configured.
- [ ] The browser context is a fresh isolated context with no accountless or signed-in Edenia profile state.
- [ ] The hosted learner-profile generation, revision, and retained-version count are captured through the owner-scoped read-only verifier before authentication.
- [ ] Existing production origins, accepted audiences, primary client, and secret placement are recorded in sanitized form for rollback.
- [ ] The exact rollback is prepared and can restore the sanitized pre-mutation state without deleting an unrelated client or origin.

### Acceptance criteria

The standard Packet 2 invocation authorizes the exact provider mutation and the localhost-to-hosted and hosted-origin authentication checks below for the designated internal-canary account. It authorizes no learner-profile operation and no profile-data gate change.

- [ ] Confirm the Edenia `signInWithIdToken` flow, client ID selected by each runtime, receiving Supabase project, nonce behavior, and exact non-secret accepted-audience set.
- [ ] Record the selected model, rejected alternative, trust rationale, exact changes, removal trigger where applicable, and rollback before mutation.
- [ ] If using a dedicated client, keep the production Google client's origins unchanged, select the dedicated ID only in local runtime, preserve all approved Supabase audiences, and do not replace the production primary client or secret.
- [ ] If using the production client, add only `http://localhost` and `http://localhost:8000`, preserve `https://www.edenia.study`, and change no Supabase audience unless current evidence requires it.
- [ ] Add no wildcard, unrelated host, `127.0.0.1`, or unrelated port.
- [ ] Rotate no credential and change no provider secret merely to alter JavaScript origins or token audiences.
- [ ] On the exact localhost internal route, Google's official button renders and opens the chooser without the origin error.
- [ ] The local response's effective referrer policy matches the current GIS requirement for HTTP localhost, and the applicable FedCM or popup path is recorded rather than assumed.
- [ ] If the non-FedCM popup path is used, popup/opener behavior satisfies the current GIS COOP guidance with no blank popup; if FedCM is used, record why that popup-specific condition is not applicable.
- [ ] The approved account authenticates through the intended hosted Supabase project and signs out while the server profile-data gate remains off.
- [ ] Post-authentication read-only verification proves learner-profile generation, revision, and retained-version count did not change.
- [ ] The hosted internal origin still authenticates through the production client.
- [ ] An unrelated localhost port remains unauthorized.
- [ ] Only sanitized provider and browser evidence is recorded.
- [ ] Where the selected contract changes repository configuration or documentation, update, validate, review, and deliver it within this ticket.

For any repository change produced by this packet, run and record:

```bash
node --test tests/contracts/google-identity-services-controller.test.mjs tests/contracts/local-runtime-config.test.mjs tests/contracts/runtime-config-flags.test.mjs
npm run build
npx playwright test tests/e2e/account-settings.spec.mjs --project=desktop-standard
npm run test:ci
```

The browser regression uses a deterministic GIS mock for local CI; live verification supplies provider/browser evidence and is never replaced by the mock.

### Non-goals and stop conditions

- No learner-profile database change, new Auth method, custom Google button, One Tap, automatic selection, added scope, or broad header refactor.
- If a post-mutation check fails, roll back automatically to the captured pre-mutation state, verify the hosted production origin again, and continue the autonomous recovery loop from sanitized evidence.
- Use an Exceptional pause before mutation only if neither decision branch can preserve the production client, accepted audiences, nonce/secret boundaries, and exact rollback.
- If authentication would require enabling the profile-data gate, do not enable it; use an Exceptional pause naming the incompatible requirement. If any learner-profile count changes, execute only the prepared containment/rollback, record the invariant breach, and pause.

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

- A snooze lasts exactly 24 hours (`24 * 60 * 60 * 1000` milliseconds) from the accepted `Later` action and hides only `backup-failed` presentation while more than seven days remain.
- The failed-backup notice is hidden while `now < nextNoticeAt`. At `now >= nextNoticeAt`, it is eligible to return unless the final seven-day countdown or day-zero gate supplies the stricter presentation.
- Active migration or attachment work keeps its existing state.
- The final seven-day countdown and day-zero gate override a snooze.
- `Later` is unavailable once that final period begins, including while a failed attempt remains durable.
- Retry identity, protected data, and the failed operation remain durable while presentation is hidden.

### Acceptance criteria

- [ ] More than seven days before the gate, `Later` immediately hides `backup-failed` and leaves the accountless town usable.
- [ ] The notice stays hidden after reload for exactly 24 hours unless the final seven-day period begins first, and returns at the deadline rather than one tick before it.
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

The standard invocation authorizes local implementation, validation, review, delivery, and closure. Hosted interaction is deferred to the later #196 run; that run must never select `Try backup again` merely to verify this UI fix.

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

## Packet 6 — Attribute and resolve Start-over pre-RPC refusal

### Proposed title and initial classification

> Attribute and resolve why confirmed “Start over” can be refused before its RPC while Progress sync says “Up to date”

- Labels: `bug`, `ready-for-agent`.
- Scope: immutable A/B/C attribution, the smallest deterministic regression, a safe current-base repair when one is proven, delivery, evidence, and explicit closure.
- Execute and close this packet before #286. Its final receipt and regression are mandatory #286 inputs.
- Link from #196 as a candidate blocker. If current clean-base B reproduces, add the native dependency and repair the current-base defect in this ticket.
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

The canonical A/B/C comparison is the pre-RPC client decision and therefore uses one fixed mocked server transcript, not a shared mutable database. Before the first run, record a sanitized fixture manifest and content hash covering: authenticated owner state, accepted generation/revision, current head, protected prior reset, activation state, pending/queued/dirty state, connectivity, fixed clock, confirmation actions, and expected request count. Reuse those exact bytes at A, B, and C. If current test seams cannot inject that transcript without tracked edits, add one reusable test-only fixture within this ticket; do not substitute three ad hoc mocks.

Use a real local database only as a follow-on when the mock matrix reaches an RPC or proves a database-dependent difference. Run the database comparisons one SHA at a time. For each SHA, start from that worktree, reset a fresh disposable database from that SHA's migrations, record the migration identity, seed a new synthetic Auth owner, run once, and discard the database before the next SHA. Never reuse rows, tokens, or a migrated-forward database across A/B/C.

- [ ] Freeze three immutable comparison identities before new diagnosis or implementation work: A, historical incident commit `4b48df6c051971d13a28bbda5aa4d37801f94e1d`; B, the exact freshly fetched `origin/master` SHA; and C, the exact #286 candidate-head SHA before diagnostic or repair edits. If A and C are identical, record that explicitly.
- [ ] Reproduce the same deterministic fixture in detached/disposable worktrees at A, B, and C. Do not substitute a later mutable branch name for any recorded SHA.
- [ ] Keep runtime config, browser project, serialized storage fixture, mock transcript, confirmation actions, and clock byte-equivalent between comparisons; where the optional database follow-on applies, rebuild rather than reuse its schema/seed.
- [ ] Prove whether the click handler runs exactly once in each comparison.
- [ ] Record pre-action activation, sync projection, accepted generation/revision, pending/queued/dirty presence, cloud-head-known state, and protected-reset presence using synthetic identifiers only.
- [ ] If #286 changes after the matrix, rerun the regression on its exact final candidate identity before #286 is considered locally complete.

#### Attribution outcomes

- **B fails:** Record an independent current-base defect, add this issue as a native #196 blocker, proceed through Phase 1, implement the narrow safe repair in this ticket, and close only after delivery and evidence.
- **B passes and C fails:** Record a #286 candidate regression. Add and deliver the smallest current-base regression that passes on B and demonstrates the failure on C, append its exact command and repair criterion to #286's plan-managed body, and close Packet 6 after that transfer. #286 owns the repair and must rerun the regression on its final candidate.
- **A fails while B and C pass:** Record a historical branch regression absent from the current candidate. Deliver the smallest durable regression when it adds coverage on current base, require it to pass on final #286, and close this ticket as historical after independent review.
- **A does not reproduce:** Record the exact missing historical fixture or evidence without discarding any independent B/C result. Follow the B/C outcome; do not treat it as exonerating the recorded incident.
- **Non-deterministic after the exact matrix:** Repeat the byte-identical matrix up to three total runs and inspect only the named state boundaries. If no current B defect is reproducible, close as non-reproduced with the uncertainty and all run evidence after independent review; if a concrete required fixture cannot be obtained through the repository or disposable local state, use one Exceptional pause naming that fixture.

Proceed automatically to Phase 1 for a current-base failure. A C-only branch regression transfers to #286 after its durable regression and receipt; it is not repaired twice.

### Phase 1 — Exact refusal diagnosis

- [ ] Capture confirmation visibility, toast, focus, and `aria-live` feedback after refusal.
- [ ] Identify one exact refusal status and predicate: activation, owner/profile/generation/revision mismatch, unknown cloud head, pending, queued, dirty, connectivity, stale request, storage failure, or another named boundary.
- [ ] Prefer a test-only seam or a pure typed predicate result. Any retained diagnostic must be privacy-safe, behavior-preserving, independently tested, and contain no identifiers or profile contents.
- [ ] Produce the smallest red contract or browser regression that fails for the proven reason.
- [ ] Preserve all owner, profile, generation, revision, activation, pending, queued, dirty, and connectivity fences during diagnosis.

Phase 1 is complete only when the failure is deterministic and one exact boundary is proven.

### Post-diagnosis decision table

| Proven cause | Next state |
| --- | --- |
| Branch-associated regression from #286 | Preserve and deliver the regression, append the exact repair criterion to #286, and close this ticket after the transfer receipt; #286 performs the repair |
| Presentation says `Up to date` while the stricter safety state correctly refuses | Preserve every fence and implement compatible status/action availability plus persistent actionable feedback in this ticket |
| Behavior-preserving defect in request propagation, stale handler state, or a predicate that demonstrably contradicts the already accepted owner/generation/revision state | Implement the proven narrow contract and regression in this ticket |
| A proposed fix would relax ownership, lineage, generation, accepted-revision, pending, queued, dirty, connectivity, or activation safety | Reject that fix. First attempt a safety-preserving availability/presentation repair. If the existing product contract still cannot be satisfied without weakening a fence, use an Exceptional pause with the exact incompatible predicates; do not weaken the fence |
| Database/RPC defect | Implement the narrow repair in this ticket with migration, RLS/grant, pgTAP, rollback, and deployed-schema evidence. If it necessarily changes a public database contract beyond this behavior, use an Exceptional pause before that expansion |

### Behavior contract for an implemented repair

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

### Local validation for an implemented repair

```bash
node --test tests/contracts/learner-profile-cloud-persistence.test.mjs tests/contracts/learner-profile-lifecycle.test.mjs tests/contracts/learner-profile-start-over-ui.test.mjs
npm run build
npx playwright test tests/e2e/first-signed-in-profile.spec.mjs --project=desktop-standard --grep "Start over"
npm run test:ci
```

If database/RPC behavior changes, also run `supabase test db supabase/tests/learner_profile_start_over.test.sql --local` against a reset database and prove the selected CI job invokes that exact file.

### Hosted boundary

No hosted Start over belongs to this packet. Destructive hosted verification occurs only in the later #196 ticket under its packet-bounded authority, exact-target confirmation, pre-action recoverability check, prepared recovery, and generation/revision verification after the action.

## Packet 7 — Bound and resolve the historical AnkiConnect investigation

### Proposed title and classification

> Determine whether current source can reproduce and safely repair the historical AnkiConnect null-target failure

- Labels: `bug`, `ready-for-agent`.
- Scope: bounded current-base diagnosis and, when reproduced, a direct behavior-preserving repair in this same issue.
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

When reproduced, add the smallest deterministic browser regression to `tests/e2e/preservation-smoke.spec.mjs` with a unique title, record that exact title in the evidence receipt, and rerun it by exact `--grep`. Implement the narrow behavior-preserving repair, then run `npm run test:ci`, independent Codex review, delivery, and closure. A no-reproduction diagnosis records the baseline and all five matrix results; it does not require a speculative new test or production edit, but it does require independent review of the complete diagnosis receipt before closure.

### Terminal outcomes

- **Reproduced:** Preserve the red fixture, identify the exact source location, and repair it in this ticket. Retain the original Anki availability/error outcome, avoid the secondary null-target exception, and change no Activity-log policy. Close only after the regression, full validation, independent review, delivery, and canonical receipt pass.
- **Not reproduced:** Report all five cases, Settings states, tested browser project, contract coverage, and history result. Close without speculative production changes after independent review of that evidence.

### Boundary

The Shared diagnostic and implementation contracts apply. Keep the investigation local. Do not enable or exercise Anki integration on the hosted site. Logging suppression, deduplication, or coalescing is outside this behavior-preserving ticket; create a linked follow-up only if the repair proves that separate product-policy work is necessary, and do not block this ticket on that follow-up.

## #196 coordination

After this Plan ID is approved with tracker preparation and either stable source URLs exist or the required sanitized evidence is embedded directly:

1. Update #286 with Packet 1 and its sanitized incident evidence.
2. Create Packet 0 and Packets 2–7 as independent issues using the capsule, their complete packet text, and applicable shared contract—not summaries from the tracker table.
3. Add one coordination comment to #196 with stable evidence links or embedded sanitized evidence, every issue link, and the exact dependency rules below. Preserve its original body and acceptance boxes during preparation, and append the complete #196 managed execution contract required above.
4. Record the September 4 baseline as historical local evidence bound to `4b48df6c051971d13a28bbda5aa4d37801f94e1d`: 1,385 contracts, 139 shared backend/function tests, passing Deno checks, and 311 passed/798 intentionally skipped Playwright cases.
5. State that this green baseline did not detect the interface defects and satisfies no #196 acceptance checkbox.
6. Append and verify the canonical tracker-preparation receipt in that same #196 coordination comment.

### Dependency rules

- Make #196 natively blocked by Packet 0 and #286; make every other plan packet blocked by Packet 0 and #286 blocked by Packet 6. Execution prerequisites are distinct from defect-to-release-criterion classification.
- Link Packet 6 initially without a dependency. Add it as a native blocker only after reproduction on the then-current clean base.
- Add Packet 3 as a native blocker only after documenting the exact #196 criterion it prevents.
- Link Packets 2, 4, 5, and 7. Promote any one to a blocker only when current evidence maps it to an explicit #196 criterion.
- Use GitHub native dependencies according to `docs/agents/issue-tracker.md`; do not rely on prose alone when native dependencies are available.

## Deterministic ticket order

Tracker preparation is a one-time setup operation under specification approval, not a partial execution of any packet. After preparation, `Execute the next ticket under internal-canary-codex-autonomous-2026-09-05-v3` selects the first open eligible item below. If an item is already closed, Codex verifies its canonical receipt and skips it. A request naming a later ticket may select it only when its prerequisites are already satisfied.

0. **Packet 0 — automation readiness.** Deliver and verify the execution capabilities and recovery/continuation mechanisms before selecting a bug ticket.
1. **Packet 6 first among bug tickets.** Complete its entire A/B/C attribution and terminal repair/transfer branch, deliver any source change, post the receipt, and close it. Do not run Packet 6 as a hidden preliminary phase of #286.
2. **#286 / Packet 1 second.** Consume Packet 6's closed-ticket receipt and any retained regression, rerun its required final-candidate matrix, complete the existing candidate against current `master`, deliver, deploy, run the synthetic and real deployed-browser matrices and verify the gate-off handoff, post the receipt, and close #286.
3. **Packets 3, 4, and 5, in that order.** Each is one independent worktree, branch, PR, review, receipt, and closure. No ticket borrows another ticket's green checks.
4. **Packet 7.** Complete either its reviewed no-reproduction closure or its direct behavior-preserving repair and closure.
5. **Packet 2.** Apply the deterministic provider model, verify both localhost and hosted-origin behavior, deliver any repository change, post the receipt, and close it.
6. **#196 final release-readiness ticket.** Start only after every plan-managed packet is closed, every native blocker is closed, and no release-relevant PR is open or waiting to deploy.

Exactly one top-level item above is selected per invocation. Its bounded derived repairs execute sequentially within the same invocation. Codex must not split diagnosis, implementation, review, delivery, provider verification, hosted verification, and closure into separate approval stages. After the selected top-level ticket’s explicit closure and final-state verification, Codex stops for owner review.

A defect proved during #196 follows the Derived repair contract: suspend live scenarios, contain and verify recovery, execute the bounded blocker, then resume #196 automatically with the runbook’s rerun planner. The owner does not invoke the blocker or resume the parent. If an execution is interrupted, a generic invocation resumes its recorded active top-level ticket and phase before selecting any new top-level item.

## Final #196 release gate

`docs/release-readiness-canaries.md` and `scripts/release-readiness.mjs` are the authoritative procedure and dependency model. This document does not restate their scenario definitions, metadata allowlist, rerun planner, or validation rules.

### #196 invocation and approval overlay

The one-ticket invocation for #196 is the separate, conditional product-owner authorization required by the runbook for only these operations on the exact release candidate selected by the preflight:

1. prepare and deploy the final Internal canary runtime while the server profile-data gate remains `off`; complete the reviewed bounded monitoring-failure/recovery exercise and disable that canary before beginning the uninterrupted soak;
2. after the mandatory uninterrupted gate-off soak passes, set only that gate to `developer-canary` for the securely designated internal-canary owner;
3. perform the seven named developer-canary scenarios and the other required live Auth, browser, deployed-schema, backup/restore, monitoring, and rollback scenarios in the execution matrix below, each only at its required gate and with its reviewed fixture and recovery; collect the seven profile records in the developer-canary phase and the final-context records only after switch-off, as the runbook requires;
4. return the gate to `off`, disable the bounded canary, run the switch-off/rerun plan, validate the final report, and confirm the no-known-defect assertion after independent Codex review.

This conditional authorization becomes operative at each step only when the runbook's preceding evidence and the preconditions below pass. Codex records the Plan ID, #196 invocation, exact candidate identity, sanitized gate state, and preflight result before each gate-changing operation; it does not ask for another approval already granted by that invocation. This overlay does not authorize `signed-in-public`, #197, a different tester, or an operation outside the approved scenario manifest. A candidate changed by a bounded derived repair must pass renewed review, deployment inspection, affected reruns, and any required fresh soak before this same conditional authority applies to it.

The final gate may start only when the queryable evidence below has been verified and the judgment-dependent records are complete. Those records are produced and checked by Codex; they are not inferred from green CI, closed issues, or the absence of labels.

### Queryable evidence

- [ ] Packet 0 is closed with a complete reviewed scenario manifest, verified access, recovery rehearsal, durable continuation proof, and current capability revalidation.
- [ ] #286 is closed, its named release PR is merged, and its deployed narrow-smoke record is bound to the exact deployed identity.
- [ ] Packets 2–7 are closed with canonical receipts, and every branch-specific transfer or follow-up that became a blocker is closed.
- [ ] Every issue classified as a #196 blocker is closed and bound to its final merged and deployed change.
- [ ] No release-relevant PR is open or waiting to merge.
- [ ] The server profile-data gate is `off`, no developer-canary owner is configured, and the bounded Auth-monitor canary is disabled.
- [ ] The release-readiness inspector records the exact deployed source SHA, asset version, runtime-config hash, UTC time, and sanitized gates.
- [ ] Those inspector identities match the intended final release candidate exactly.

### Recorded decisions and attestations

- [ ] Packet 6 records the immutable A/B/C attribution matrix and the exact final-candidate regression or repeated-matrix result; any resulting blocker is closed.
- [ ] Packet 3 records a blocker/non-blocker decision mapped to a named #196 criterion.
- [ ] Packet 2 records the chosen provider state and verification, or an explicit decision that no provider change is required.
- [ ] Codex records the complete release-relevant issue and PR set used by the checks above for the release owner to inspect.
- [ ] A separate Codex reviewer records Standards and Spec results against the exact final release-candidate SHA and reports no unresolved P0/P1 correctness, ownership, integrity, privacy, scope, or progress-loss finding.

### #196 executable scenario matrix

Packet 0 delivers the concrete execution manifest for these rows. #196 revalidates it against the actual candidate, available devices, approved owner, and current runbook before starting the soak. This table specifies required coverage; the delivered manifest supplies exact commands/procedures and reviewed recovery. Add no `pass` record until the underlying operation and assertions have completed and a sanitized runner artifact is durably available.

The authoritative runbook fixes gate phases and evidence retention. The complete named operations in this table are conditionally authorized by the #196 invocation within the designated target and reviewed recovery boundaries. This includes the deployed-schema denial checks, isolated external restore rehearsal, bounded notification canary, and emergency rollback exercise needed by the existing criteria. Preparation of fixtures or a provider/operator operation is not authorized merely because it could be useful: it must be named in the reviewed manifest, necessary for a row below, and preserve the target/public boundaries.

| Scenario | Required execution and assertions | Gate / evidence |
| --- | --- | --- |
| `deployment-identity` | Inspect actual served source SHA, asset version, runtime hash and server gate; bind all artifacts to the expected candidate | Final `off`; release inspector |
| `browser-matrix` | Operate actual current macOS Chrome, macOS Safari, iPhone Safari, fresh Chrome paired with another device, and applicable private mode; record versions and concrete UI assertions | Final `off`; live device/browser artifacts |
| `auth-google` | Use the official button and actual provider flow; prove accepted authentication and sign-out | Final `off`; live browser/provider assertions |
| `auth-email-otp-turnstile` | Complete actual same-device OTP and accepted Turnstile with one delivery; exercise missing/expired/replayed/invalid-token cases and independently verify zero deliveries | Final `off`; live browser plus approved delivery evidence |
| `auth-method-equivalence` | Exercise Google-to-email and email-to-Google continuity; compare verified UUIDs privately in both directions, emit only equality results | Final `off`; live browser/provider assertions |
| `profile-lifecycle` | Demonstrate new and returning routing, reload, exact 30-day boundary with explicitly recorded controlled clock method, local/global sign-out, shared-browser replacement, and no cross-profile rendering/writes | `developer-canary`; live browser artifacts |
| `profile-sync-conflict` | Use distinct approved device contexts, prove local-first save, sequential propagation, competing accepted revisions and explicit conflict choice; compare protected study-fact invariants | `developer-canary`; paired-device artifacts |
| `profile-failure-preservation` | Exercise reviewed bounded backup/write rejection and oversized/corrupt input; assert preserved accepted heads/local progress and bounded retry behavior | `developer-canary`; live browser and private invariant verifier |
| `profile-portability` | Export/import through product UI using protected approved fixtures; prove validation, displaced-version protection, and unchanged source on failure | `developer-canary`; live browser and invariant verifier |
| `profile-recovery` | Use the exact reviewed recoverable missing/unusable-head fixture procedure; prove only owner-bound trusted local/protected state restores and displaced history stays protected | `developer-canary`; live browser and invariant verifier |
| `profile-start-over-undo` | Execute product UI Start over and Undo with exact-target confirmation and prepared recovery; verify generation advance, protected prior generation, restored study facts and accepted revision semantics | `developer-canary`; live browser and invariant verifier |
| `database-security` | Execute authenticated-role ownership, grant/RLS, unsafe direct-write denial and operator-isolation checks against deployed schema; isolate/rollback any synthetic fixture writes | Final `off`; deployed-schema artifacts |
| `database-fences-idempotency` | Execute stale/corrupt/cross-generation/duplicate cases through reviewed deployed-schema procedures; distinguish gate denial from actual fence coverage and prove no unintended durable mutation | Final `off`; deployed-schema artifacts |
| `backup-retention-restore` | Verify protected versions, exact retention counts and capacity, and restore an external backup into an approved isolated restoration target; never replace production with the rehearsal | Final `off`; operator and deployed-schema artifacts |
| `legacy-final-gate` | Exercise voluntary migration, deadline routing, inherited-session confirmation, cloud conflict and failed first backup with approved fixture/clock methods; preserve public containment | `developer-canary`; live browser artifacts |
| `emergency-rollback` | Exercise only the runbook’s bounded rollback for explicitly marked legacy fixtures; verify owner isolation and return runtime/gates to required state | Final `off`; live/operator artifacts and affected reruns |
| `operations-monitoring` | Capture real DOWN/UP delivery from the approved bounded failure/recovery canary before the soak; disable it, verify watchdog/backup/capacity, then measure uninterrupted five-minute external and aggregate histories for 24 hours | `off`; operator/deployed-schema artifacts; bounded canary disabled throughout soak |
| `switch-off-and-rerun` | Verify actual gate-off switch and bounded rollback behavior, then collect all affected final-context evidence in runbook order | Final `off`; live/operator artifacts |

A gate-off denial does not prove an ownership or generation fence. The deployed-schema manifest must identify a safe transaction/role-scoped procedure that reaches the relevant predicate while leaving the externally visible gate off and no durable test writes. If none exists within the approved boundary, Packet 0 must surface that capability conflict rather than assert coverage from `access_disabled`. Likewise, a single approved hosted owner is not evidence of a two-owner isolation scenario unless the reviewed negative-test mechanism actually proves isolation without expanding hosted access.

Every injected clock, transport error, fixture, mocked component, and real provider interaction is labeled at subcase level. Local mocks cannot replace live provider/device requirements. Recovery preconditions and acceptable postconditions are specific to each scenario; rehearse them before any live mutation. If new support changes the release artifact or runtime, deliver and review it before starting a new soak.

The manifest’s artifact schema must contain scenario/subcase ID, run/runner identity, command/procedure version, observed timestamps, actual browser/OS/device class, candidate/gate identity, assertion results, expected/observed operation counts, cleanup outcome, and redacted source-evidence hashes. Separate raw private operational state from reviewer-safe evidence. Sanitized artifacts must be retrievable by the separate reviewer; a local transcript or self-authored PASS label is insufficient. The reviewer validates evidence provenance and coverage before `confirm-no-known-defect`.

### Autonomous soak and recovery behavior

- Codex verifies the runbook’s Independent Auth monitor is producing scheduled evidence and activates the Packet 0-tested task heartbeat using the Durable continuation contract. The external five-minute monitor supplies the soak evidence; the task heartbeat only observes it and resumes the active execution. The heartbeat remains quiet on unchanged state and follows closure reconciliation and automatic cancellation after verified top-level closure.
- A deployment, runtime-config change, unexplained gap, `provider_unavailable`, or `network_error` restarts the soak exactly as the runbook specifies. Codex updates the evidence and keeps waiting; a restart is not an approval boundary.
- Before changing the gate, Codex re-verifies the exact deployment identity, valid completed soak, gate `off`, disabled bounded canary, exact designated owner, recoverability of every scenario, and the ability to return the gate to `off` immediately.
- If a scenario reports ownership exposure, wrong-profile rendering, unsafe accepted write, silent overwrite, missing backup, integrity mismatch, uncontrolled retry, wrong-target cleanup, or unresolved head, Codex immediately stops scenarios, returns the gate to `off`, disables the bounded canary, executes only the applicable prewritten recovery, and records sanitized pre/post invariants. After safe containment/recovery is verified, it creates or adopts a self-contained blocker and runs the Derived repair contract without another owner invocation. #196 remains open while the repair executes and resumes automatically after its closure. An Exceptional pause is reserved for unresolved live-state ambiguity, unavailable prerequisites, or repair outside the approved scope.
- If the required monitoring, gate-control, verifier, or recovery mechanism remains unavailable after the bounded recovery loop, Codex uses an Exceptional pause before exposing profile data. It never substitutes manual inference or an unguarded live action.

After all ordered evidence passes, Codex initializes and validates the report, has a separate Codex reviewer audit the complete report and exact candidate, and runs `confirm-no-known-defect`. It completes the original-criteria audit below, restricts the heartbeat to closure reconciliation, posts the canonical #196 completion receipt, and explicitly closes #196 with report status `awaiting-product-owner-approval`. It then verifies closure, releases the lease, cancels and verifies the heartbeat, and appends the final shutdown evidence to the receipt. That status means the internal evidence ticket is complete; it does not approve public rollout. The product owner may review the closed ticket and separately decide whether to invoke #197.

### Original #196 acceptance audit and closure

Tracker preparation preserves the original ten acceptance criteria verbatim and assigns stable audit IDs `196-AC-01` through `196-AC-10` in the managed block. Record a hash of their text excluding checkbox state. Before closure, re-read the live issue and reconcile any changed criterion; do not overwrite concurrent edits.

Map each original criterion and every managed criterion to the exact scenario artifacts and reviewed result. The #196 invocation authorizes changing only those original ten acceptance checkbox states whose mapped evidence passes, plus the managed acceptance boxes. Preserve their wording, ordering, and all unrelated text. If criteria have changed materially outside this plan, identify the exact scope conflict before continuing.

A passing report alone is insufficient. The separate reviewer reads the underlying sanitized runner artifacts, verifies all required devices and subflows actually ran, confirms injected versus live evidence is accurately labeled, verifies no required case was skipped, and audits the final gate/monitor cleanup. Conditional non-applicability requires a named runbook rule and rationale; missing access is a failure to complete, not non-applicability.

Closure requires all ten original criteria and all applicable managed criteria to pass, all bounded blockers closed, a validated report requesting product-owner cutover approval, no known ownership/progress defect, verified gate `off` with no owner, disabled bounded canary, and the heartbeat restricted to closure reconciliation. Verified automation cancellation and lease release complete the receipt immediately after closure. Post the exact report/artifact identities and criterion mapping before closing, then verify the rendered issue and checkbox state. This closes internal evidence collection only; #197 remains a separate owner decision.

## References

- [Previous autonomous execution plan, v2](internal-canary-codex-execution-plan-autonomous-2026-09-05.md)
- [Internal-canary exploratory record](internal-canary-exploratory-2026-09-04.md)
- [Superseded Codex-ready execution plan](internal-canary-codex-execution-plan-codex-ready-2026-09-04.md)
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
- [OpenAI — Latest model guide](https://developers.openai.com/api/docs/guides/latest-model)
- [WAI-ARIA Authoring Practices — Tooltip Pattern (contrast material only for Packet 4)](https://www.w3.org/WAI/ARIA/apg/patterns/tooltip/)
