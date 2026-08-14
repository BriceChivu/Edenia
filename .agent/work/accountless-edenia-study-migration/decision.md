# Decision: Accountless migration to www.edenia.study

## Objective

Move Edenia's canonical browser application from `https://bricechivu.github.io/Edenia/` to `https://www.edenia.study/` without requiring authentication and without silently losing browser-local study progress. Existing users should receive their usable normal-mode state at the new origin through an automatic but disclosed migration. New users should reach the existing trailer and onboarding after Edenia has conclusively determined that no legacy state is available or after they explicitly choose to continue without that check.

## Confirmed user decisions

- Authentication, durable cloud sync, and PostHog account identity are separate future work. This work item must not make signup or login part of the domain migration.
- `https://www.edenia.study/` is the one canonical Edenia deployment. A separate, narrowly scoped helper remains at `https://bricechivu.github.io/edenia-migrate/`; Edenia must not maintain two full application deployments.
- Migration correctness outranks perfect invisibility. The first launch at `www` may show a brief migration gate and, when automation cannot prove the outcome, one recovery click. A blocked helper must never be interpreted as proof that no old progress exists.
- The normal path is zero-click with clear disclosure and a Cancel control. The user accepted temporary accountless server processing for this purpose.
- The helper may use a short-lived, one-time relay. The relay is transport, not account storage: it must not associate the payload with email, an Edenia account, or a PostHog person.
- Migrate only the current usable normal-mode state. Exclude sandbox state, internal-test state, authentication/session storage, caches, cookies, and temporary UI state. If `edenia_v1` is invalid, the helper may use the newest verified local or IndexedDB backup. Do not migrate the complete backup archive.
- Leave all data on the old origin untouched. Successful migration creates a fresh recovery point at the new origin before the imported document becomes authoritative.
- Automatic migration may write only into an empty destination. If the destination hash matches, the operation is an idempotent success. If `www` already has different nonempty progress, keep it active and preserve the incoming old document as a named recovery backup; do not merge or silently overwrite.
- If the helper or relay cannot conclusively check migration, show `Try again`, manual sync-file import, and an explicit reversible `Continue without checking old progress` action. Continuing records migration as deferred, not completed, and leaves recovery accessible from Settings.
- Keep the helper available for at least five months. At or after month five, retirement is eligible only when the preceding 90 days contain no successful migrations. A later migration resets that rolling quiet period. Retirement requires advance notice and manual approval; the helper URL becomes a static manual-recovery page instead of disappearing.
- Before the first verified public migration, a DNS/custom-domain rollback is allowed. After public migration begins, `www` remains canonical and ordinary rollback replaces code or disables migration at `www`; DNS reversion is emergency-only because new-origin progress is origin-scoped.
- The user delegated exact engineering validation and circuit-breaker details to the agent after receiving a plain-language explanation. The governing policy is conservative: prove source/destination equality before success, and pause only automatic migration on any sign of overwrite, corruption, token reuse, or cross-origin disclosure while keeping Edenia and manual recovery available.

## Agent-recommended defaults

These defaults were recommended during the grill and accepted as part of the overall safety policy, but evidence discovered during implementation may refine numeric values if the ExecPlan records why.

- Use a high-entropy random transfer token, store only its hash server-side, put only the opaque token in the URL fragment, make it single-use, and expire it after approximately 15 minutes.
- Keep relay data in a private Supabase boundary with no direct browser table access. Restrict helper and consumer endpoints to exact origins, bound and validate payloads, rate-limit abuse, never log raw state or tokens, delete successful transfers immediately, and independently clean expired rows.
- A migration is complete only after `www` validates the document, creates a rollback backup when required, persists it, reads it back, obtains the same normalized content hash, removes transfer material from the URL/history, and acknowledges relay consumption.
- Make automatic migration independently disableable without changing DNS. If new relay creation is disabled, valid in-flight consumption should remain available long enough to drain safely.
- Treat any confirmed overwrite, progress loss, cross-origin disclosure, token reuse, schema-validation bypass, or success without a matching read-back hash as an immediate stop signal for new automatic transfers. Use rate/latency metrics as investigation signals rather than proof of data loss.

## Assumptions

- A helper served anywhere under the exact `https://bricechivu.github.io` origin can read normal Edenia localStorage and IndexedDB data regardless of path. This must be proven in real browsers rather than assumed from path layout alone.
- The current project continues to use GitHub Actions for the canonical Pages deployment. The helper is a separate Pages artifact/repository so attaching the custom domain to Edenia does not move the helper away from the old origin.
- The new origin keeps Edenia's existing local-first persistence model. The relay never becomes the authoritative copy and does not solve cross-device sync.
- Manual sync-file export/import remains a permanent recovery path.
- Privacy copy will accurately describe temporary relay processing. Provider/network logs and applicable legal obligations require review; the plan must not promise that infrastructure sees no IP address unless that is verified.
- The implementation begins from a refreshed current remote base. At GrillCraft setup, local `master` was clean at `d275ef0`, while remote `master` was `efb5399911e0eb3832bffd14bd9f53799a098432`.

## Open questions and required approvals

There are no unresolved product-flow decisions from the grill. The following external actions require explicit approval at the point of execution: creating or publishing the helper repository, deploying Supabase migrations or Edge Functions, changing GitHub Pages settings, editing DNS, modifying provider allowlists or API restrictions, enabling the public migration switch, and retiring the helper. Legal/privacy wording also needs owner review before public transfer begins.

The implementation may choose precise internal module, RPC, function, table, flag, timeout, and metric names after inspecting current conventions, but it must not change the behavioral decisions above.

## Accepted risks and failure modes

- Some users may see a short cross-origin migration screen or need one explicit recovery action.
- Helper, relay, DNS, or browser-privacy failures can delay migration. They must degrade to the explicit recovery screen, not silent onboarding or a total Edenia outage.
- Old tabs can continue writing old-origin state after cutover. Re-running recovery must preserve both documents when the destination has diverged.
- Corrupt primary state may require the newest valid backup; if neither is valid, Edenia must preserve downloadable evidence and let the user continue only through an explicit choice.
- Once users create progress at `www`, returning DNS to the old application can hide that newer progress. This is why post-commit rollback normally remains at `www`.
- The helper and relay remain an operational/security responsibility through the retention window.

## Validation expectations

- Cover valid legacy state, no state, corrupt primary with valid backup, fully corrupt state, cancel, offline, helper/relay timeout, lost response, duplicate/expired token, destination conflict, and manual fallback.
- Exercise Chrome, Safari on macOS and iOS, Firefox, and Edge, including restrictive/private modes where practical. Label unavailable real-device checks honestly.
- Prove old-origin bytes are unchanged, new-origin persisted bytes normalize to the transferred hash, backups exist at the required boundaries, retries are idempotent, and payload/token material does not enter app analytics or application logs.
- Test minimum, typical, observed high-percentile, and maximum accepted payload sizes. Verify relay cleanup and independently test the kill switch/drain behavior.
- Smoke-test the complete domain surface: `www`, apex redirect, old URL, helper, HTTPS, root-relative assets, refreshes, `/plus/`, `/unsubscribe/`, PostHog origin gating, AnkiConnect copy, YouTube referrer restrictions, Supabase CORS/redirects, and billing/email return URLs. Authentication remains behaviorally unchanged and optional.
- Complete a backed-up real-browser canary before public enablement and a fresh review-style pass before declaring the work item complete.

## Source notes

This decision artifact distills the completed Grill Me session in the current Codex conversation on 2026-08-13. Repository evidence includes `src/core/storage-keys.js`, `src/state/store.js`, `src/state/indexed-db-backups.js`, `src/app.js`, `index.html`, `.github/workflows/deploy-pages.yml`, existing Supabase Edge Function and migration patterns, and the current test suites. Prior read-only analysis established the origin-scoped storage and integration-cutover surface; all drift-prone provider and live-deployment facts must be reverified during execution.
