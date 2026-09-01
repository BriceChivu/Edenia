# ADR-0001: Keep signed-in profile opening from becoming a dead end

- Status: Accepted
- Date: 2026-09-01

## Context

Profile opening currently has a generic `recovering` outcome for several
different failures. In that outcome, the learner can retry or sign out, but
cannot reach the town or begin again. This is a production liveness failure:
the learner is authenticated but the product has no usable terminal path.

This state is not the same as a progress conflict. A progress conflict has two
owner-verified, structurally valid profile states with a known relationship
that Edenia can reconcile or present for an explicit choice. The dead-end
state means Edenia cannot safely identify the current active profile. Examples
include an unusable current head, missing or invalid version data, malformed
activation metadata, or lineage metadata that cannot be connected by trusted
evidence.

Edenia already retains protected profile versions and supports explicit
recovery-copy restore in some missing or unusable-head cases. It also has an
operator repair path. It does not currently use the newest trusted previous
state as an automatic browser fallback, and generic recovery without
candidates does not enter onboarding.

## Decision

Profile opening will use this ordered outcome model:

1. If the verified owner's current profile is valid, open it.
2. If the failure is transient, remain retryable as `waiting-cloud`; do not
   roll back or start onboarding.
3. If multiple valid states disagree, use the existing progress-conflict
   flow; do not treat the conflict as profile corruption.
4. If the current profile is invalid, automatically restore the newest
   trusted profile predecessor within the current profile generation. The
   predecessor must be owner-bound, structurally valid, and connected to the
   lineage by verified revision evidence.
5. If no trusted state exists within the current generation, show normal
   language-selection onboarding. Create a fresh signed-in profile only after
   the learner completes that onboarding. This includes a verified account
   that has no profile history because it predates the creation-eligibility
   trigger.
6. If the owner cannot be verified, require authentication again. Do not
   create or activate a fallback profile.

Automatic fallback must never cross an intentional Start-over reset boundary.
An older profile generation remains available only through explicit recovery.
Edenia will not create an isolated signed-in profile as the normal fallback.

Every profile-opening attempt must reach a bounded terminal outcome: an active
profile, a trusted-predecessor restore, language-selection onboarding, an
explicit progress-conflict choice, retryable cloud waiting, or
reauthentication. The generic `recovering` screen must not remain the only
user path after retry exhaustion.

Invalid and displaced records remain protected for operator repair and audit,
but their preservation must not block the learner's safe path forward.

This behavior applies to signed-in production users. The ordinary accountless
public route remains unchanged, and changing the current rollout exposure is a
separate release decision.

## Consequences

Positive consequences:

- Authenticated learners cannot be trapped indefinitely by profile metadata
  damage.
- A recoverable town is restored automatically without asking learners to
  understand profile generations or revisions.
- Genuine progress conflicts remain distinguishable from invalid profile
  lineage.
- Fresh-town creation is explicit through the familiar onboarding experience,
  rather than an unexplained shadow town.
- Existing protected versions remain available for later operator repair or
  explicit cross-generation recovery.

Costs and risks:

- The resolver must distinguish transient failures, conflicts, invalid current
  state, and missing trusted history instead of collapsing them into generic
  recovery.
- Automatic restoration needs an owner-scoped, idempotent operation that
  preserves the displaced head and records the restoration.
- A signed-in fresh-profile path is needed for an existing owner whose current
  generation has no trusted state, including accounts created before the
  creation-eligibility trigger existed.
- Regression coverage must prove both recovery liveness and accountless-route
  containment.

## Narrow implementation plan

1. Add a server-side trusted-predecessor resolution/restore path that searches
   only the verified owner's current generation and validates the portable
   envelope before activation.
2. Add a distinct no-trusted-state outcome that routes the browser to
   language-selection onboarding rather than generic recovery.
3. Keep transient cloud failures retryable and keep genuine valid-state
   conflicts on the conflict path.
4. Replace the indefinite generic recovery escape with bounded retry handling
   and the terminal outcomes above.
5. Add privacy-safe aggregate diagnostics for which terminal outcome was
   selected; do not record profile contents, identifiers, or recovery payloads.
6. Keep the existing public accountless route and rollout exposure unchanged
   until separately authorized.

## Regression-test matrix

- Current valid head opens normally.
- Invalid current head with a valid same-generation predecessor automatically
  restores that predecessor and reaches the town.
- Invalid current head with only a pre-Start-over predecessor does not cross
  the reset boundary automatically.
- No trusted state in the current generation enters language-selection
  onboarding and creates a fresh signed-in profile only after completion.
- Two valid divergent states use progress-conflict UI and do not trigger
  rollback or onboarding.
- Transient network/server failure remains `waiting-cloud` and retryable.
- Unverified ownership requires reauthentication and never activates a
  fallback profile.
- Repeated retry failure cannot leave the learner indefinitely on generic
  `recovering`.
- The ordinary accountless public route remains accountless and unchanged.
