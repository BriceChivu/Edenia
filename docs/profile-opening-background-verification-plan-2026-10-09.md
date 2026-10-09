# Background profile verification implementation plan

Keep an already verified learner studying while Edenia checks the same account and cloud progress in the background. Preserve the current lesson, video, scroll position, focus, and Tiny Swords instance during routine checks. Use the blocking profile-opening surface when there is no safe active profile or when an account change, expired verification, or progress conflict requires intervention.

Deliver and deploy the removal of “Private learner content stays hidden until the active profile is ready.” alongside this behavior change. Removing the sentence alone does not reduce interruptions.

## Existing work and starting point

The sentence removal is committed locally as `0a9dd4d9` on `codex/profile-opening-ux`, in `/Users/brice/.codex/worktrees/profile-opening-ux/Edenia`. Its base was `28927106` from `origin/master`. At preparation time, the removal was neither pushed nor deployed. It covers both HTML experiences, the shared profile-access view and CSS, all five locales in both experiences, and existing test expectations.

The removal passed `npm run build`, 28 focused contract checks, and four desktop/mobile browser checks. Those results establish the copy change only; the background behavior remains to be implemented.

In the later chat, fetch current repository state and inspect attached worktrees and active work before editing. Continue the existing task branch in its isolated worktree and integrate current `origin/master` according to the repository Git workflow. Verify whether the removal has since merged or deployed; retain its contents exactly once. If the existing worktree is unavailable, create an isolated branch from current `origin/master` and recover the commit from local Git. Preserve unrelated work.

Read `AGENTS.md`, `CONTEXT.md`, `docs/adr/0001-signed-in-profile-opening-recovery.md`, and `docs/deployment-and-releases.md`. Use the GitHub issue tracker if a matching implementation issue exists, and record the final implementation and delivery there. Do not inherit unrelated historical canary programs merely because they mention profile opening.

## Current interruption path

`src/integrations/learner-profile-reverification.js` listens for window focus and reconnection. Focus attempts are limited to once per 60 seconds, rather than running on a repeating timer; reconnecting after offline can force a check. Attempts are single flight.

`startLearnerProfileReverification()` in `src/app.js` refreshes authentication and then calls `learnerProfileLifecycleAuthority.refresh()` for the same active owner, except during an existing Settings import interaction. `refresh()` calls `evaluate()` in `src/state/learner-profile-lifecycle.js`, which releases the active profile and resolves the cloud head again.

`handleLearnerProfileAccessStateChange()` in `src/app.js` hides the main application and parks learner DOM when access leaves `active`. The notice waits two seconds before becoming visible, but the application disappears immediately. Increasing that delay would leave the interruption intact.

Important: `cloudPersistence.resolve()` is an opening and reconciliation operation, not a read-only check. Its branches can change sync bookkeeping, reconcile state, and perform recovery work. Keeping the DOM visible while calling this path unchanged would leave activation and save behavior unsafe.

## Intended behavior

| Situation | Learner experience |
| --- | --- |
| Startup, reload, or sign-in without an active verified profile | Existing protected opening flow, with “Getting your progress ready…” after the quiet delay and no privacy sentence. |
| Routine check of the same active verified owner | Continue studying with the same activation and UI instances. Fast checks are silent. |
| Check lasts at least two seconds | Show a small accessible status in the existing progress-sync surface, without an overlay, focus change, or toast. |
| Temporary network failure with still-valid owner verification | Continue local study under the existing verified/offline policy; show quiet retryable status and retain pending saves. |
| Sign-out, confirmed revoked authentication, different owner, expired verification, or lost activation ownership | Immediately revoke access and use the existing protected authentication or account-change path. |
| Genuine divergent progress or a remote reset that cannot be reconciled safely | Preserve local work and use the existing explicit conflict or protected recovery flow. |

The indicator must distinguish checking from saving: do not announce that progress is backed up merely because authentication succeeded. Reuse `src/features/profile-access/sync-view.js`, its header/settings surfaces, and existing translations where the meaning fits. Preserve higher-priority conflict and backup-failure guidance. Slow checks may use a concise localized “Checking progress…” status; success clears the check status without a completion toast. Preserve reduced-motion behavior and avoid repeated screen-reader announcements on focus events.

## Implementation sequence

1. **Capture the interruption in a focused browser regression.** Seed a verified signed-in profile, begin an active lesson/video, and delay the focus-triggered cloud response. Assert that the current implementation hides the application or replaces the active session. Record request counts and keep fixtures synthetic. Add a lifecycle test for retaining the activation during the intended background path.

2. **Separate opening from background verification in the lifecycle authority.** Add one explicit operation for rechecking an eligible active signed-in profile. Keep opening, retry, import, account replacement, Start over, and recovery on their existing explicit transitions. Routine checks retain `active`, the activation object, active profile, and local save capability. Model check progress separately from access; do not weaken DOM protection by ignoring non-active access states. If eligibility changes during a check, use the existing blocking transition immediately.

3. **Prepare background reconciliation without replacing live state prematurely.** Audit the existing cloud adapter and sync pump and reuse their reconciliation rules. Introduce a narrow prepare/commit seam if needed; do not start a second independent save pipeline or invoke opening side effects speculatively. Coordinate head checks with pending/queued saves, dirty records, imports, reset operations, and island checkpoints. A matching head is a no-op for activation and rendering. For a changed head, commit only through the existing protected rules and a current fence; retain or recompute the candidate if study state changed while the response was in flight. Never install a captured snapshot over newer local work. A remote generation change must respect intentional reset boundaries.

4. **Handle authentication outcomes without unnecessary teardown.** Successful verification of the unchanged owner uses the background operation. A transient authentication transport failure retains a still-authorized active session under the existing verification policy rather than turning it into an initial opening. Confirmed sign-out/revocation, owner changes, expiry, and invalid activation ownership still revoke access promptly. Keep the current verification lifetime and offline trust policy; this task does not extend either.

5. **Connect the quiet status and preserve the learning session.** Route focus/reconnect checks through the background operation and preserve the current single-flight and 60-second focus bounds. Preserve the Settings import deferral. Do not park DOM, rerender the active profile, recreate the player, move focus, reload the page, or notify Tiny Swords of a false access loss for a matching result. If remote state must be applied, use a safe interaction boundary and reconcile it with current local work; genuine conflicts can interrupt for the explicit choice.

6. **Apply equivalent behavior to both shipped experiences.** Inspect `compat/production/manifest.json` and `scripts/build-production-experience.mjs`: the retained production experience overrides `src/app.js`, lifecycle, cloud persistence, HTML, and locale modules, while some views and integrations are shared. Test both selected experiences; a fix only in `src/` is insufficient. Keep the sentence removal in both and update locale snapshots when copy changes.

## Required protection against stale results

Bind each request and commit to the verified owner, profile, activation, generation, and current request identity. Recheck local changes and durable bookkeeping immediately before committing a prepared result. Sign-out, owner replacement, Start over, import, another tab taking ownership, or a newer request must invalidate the old result. Background status timers must also be cancelled or ignored after invalidation.

Local learning continues while a check is pending, so tests must save new study facts, video progress, and an island checkpoint during that interval. Those changes must survive completion and reload. Preserve the existing write fences, operation idempotency, protected versions, and ADR recovery outcomes. Do not make the existing `resolve()` result admissible solely because its owner matches.

Godot owns gameplay and in-game UI. Read `godot/tiny-swords/README.md#game-ownership-and-edenia-integration` before touching its source or the bridge. Host persistence/access coordination may change only where needed for this integration; do not move gameplay into JavaScript. If the Godot project or Edenia bridge changes, rebuild the integrated preview with `node scripts/build-experience-tiny-swords.mjs --project godot/tiny-swords` before reporting completion.

## Acceptance checks

- Delayed focus and reconnect checks keep the main application visible and interactive, preserve the activation and profile identity, and do not reveal the opening notice.
- A playing video retains its iframe/player instance, playback position, and session. Lesson selection, scroll, and keyboard focus remain stable. A matching check does not restart or reload Tiny Swords.
- Fast checks stay silent. Slow checks reveal the compact indicator only after the quiet delay and clear it on completion. Repeated render/events do not restart the delay or leave stale status behind.
- Study facts, video progress, local saves, queued cloud saves, and island checkpoints created during a check survive completion and reload without duplication or false save-warning messages.
- A changed cloud head plus concurrent local edits uses the established reconciliation/conflict behavior and preserves both versions where required. A remote Start-over never silently restores an older generation.
- Temporary authentication/cloud/network failure with valid verification allows continued local study and bounded retry. Expired verification and confirmed revocation still block.
- Sign-out, account replacement, import, Start over, and cross-tab activation loss during a delayed check prevent stale responses from changing profile state or restoring private content.
- Initial opening and reload still hide private content until activation. Retry, onboarding, trusted-predecessor recovery, conflict actions, and the ordinary accountless route retain their existing outcomes.
- Both the current experience and retained production experience omit the privacy sentence in all five locales, including during genuinely slow initial opening.

Use the existing lifecycle, cloud-persistence, owner-verification, reverification, access-view, sync-view, and i18n contract suites. Extend browser coverage in `tests/e2e/first-signed-in-profile.spec.mjs` and `tests/e2e/learner-profile-access.spec.mjs`, with desktop and phone projects. Add a focused player/island preservation case at an existing suitable seam. Exercise both page selections explicitly and check which built scripts were loaded; do not assume a query selects the same experience after a release change.

Run the focused regressions, `npm run build`, and the repository checks selected by CI for the changed paths. Use the Node version in `.nvmrc` and isolated locked dependencies. The previous shared install lacked `fflate`, and an npm `os=linux` setting selected the wrong esbuild binary on macOS; if this recurs, install for the actual host platform in the isolated worktree rather than changing shared dependencies or tracked lockfiles.

## Merge and deploy both changes

The later implementation includes delivery through the existing GitHub Pages workflow, including the sentence removal. Recheck the current branch, PR, deployment SHA, live runtime configuration, and selected route before release work. Preserve the existing restricted tester trial and public availability flags. This task does not authorize widening admission, enabling public account lifecycle, changing provider configuration, or altering the database schema merely to implement the UX.

1. Create a focused PR containing the verified sentence-removal contents and background behavior. Attach it to the implementation chat and describe the actual trigger, resulting behavior, protection against stale results, and validation. Require the repository's path-selected `verify` checks and resolve relevant failures.
2. Merge the reviewed change through the normal PR flow and wait for the Pages deployment associated with that merge. Do not report deployment complete from a successful source merge or build alone.
3. Verify the hosted `release.json` SHA and versioned assets match the deployed candidate. Check the relevant existing tester route and ordinary public route without changing rollout flags or using unsupported visual switches.
4. Verify that slow initial opening displays only “Getting your progress ready…” and that routine same-owner checks keep the active lesson visible. Check the current/retained experience as applicable to each deployed route. A hosted synthetic delayed-response check must be described as client behavior evidence; use the established owner-assisted path for any needed real tester verification, without storing credentials or private learner content.
5. Verify hosted sign-out/account-change protection, continued progress persistence, and the absence of unexpected new opening/completion toasts. Preserve the current offline/recovery paths.
6. Report the PR, merge commit, successful deployment, tested routes, and any remaining physical-device acceptance gap. After merge, delete finished local/remote branches and archive the task worktree only after preserving unfinished work and the handoff document.

Keep the copy removal and background behavior as separable commits. If the behavior fails acceptance, keep the removal deliverable and revert or repair only the behavior through the repository workflow; do not undo unrelated integrated work or widen flags as a workaround.

## Prompt for the later chat

Implement the background profile verification plan in `docs/profile-opening-background-verification-plan-2026-10-09.md`. Preserve the active learning session during routine same-account checks, use a quiet delayed status, and retain blocking protection for initial opening and genuine access/conflict transitions. Include the existing sentence-removal commit `0a9dd4d9` if it has not already landed. Complete the focused tests and required checks, then deliver both changes through PR, merge, GitHub Pages deployment, and hosted verification using the existing rollout scope. Follow current repository instructions and recheck branch, worktree, release, and runtime state before acting.
