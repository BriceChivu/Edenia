# Deliver an accountless, loss-resistant migration to www.edenia.study

This ExecPlan is a living document. The sections `Progress`, `Surprises & Discoveries`, `Decision Log`, and `Outcomes & Retrospective` must be kept current as work proceeds.

This repository stores its planning contract at `.agent/PLANS.md`. Maintain this document in accordance with that file. The provenance record for the product choices is `.agent/work/accountless-edenia-study-migration/decision.md`; this plan repeats the decisions needed for implementation so that a new contributor can execute it without the conversation that produced them.

## Purpose / Big Picture

After this work, Edenia will live canonically at `https://www.edenia.study/`. A person who previously studied at `https://bricechivu.github.io/Edenia/` will be taken through a disclosed, normally zero-click transfer that reads normal-mode progress from a small helper at `https://bricechivu.github.io/edenia-migrate/`, carries an encrypted short-lived copy through Supabase, and installs it at `www` only under conservative conflict rules. A new user with no legacy progress will return from the helper and see the same trailer and onboarding that Edenia shows today. Authentication remains optional and is not part of this migration.

The observable safety promise is stronger than a redirect. Old-origin bytes remain untouched; transferred bytes are authenticated before use; the new origin creates and verifies a recovery copy before making imported progress authoritative; a nonempty or divergent destination is never overwritten; and an inconclusive check leads to explicit recovery choices rather than silently starting onboarding. After the first public migration, ordinary rollback keeps `www` canonical so newly created new-origin progress does not become hidden behind a DNS reversal.

The current application makes this difficult because startup, import normalization, backup orchestration, and UI rendering meet in the 16,000-line `src/app.js`, while the IndexedDB reader needed by a helper is private inside `src/state/indexed-db-backups.js`. The implementation will concentrate migration sequencing behind one startup controller and concentrate portable-state selection, validation, cryptography, and hashing behind shared state modules. The main application should need to ask one question—whether startup may continue—rather than understand redirects, relay tokens, conflict policy, backup ordering, or retry markers.

## Progress

- [x] (2026-08-13 12:32Z) Distilled the completed Grill Me decisions into `decision.md` and initialized the durable work item.
- [x] (2026-08-13 12:36Z) Read the current startup, import, localStorage, IndexedDB backup, build, runtime configuration, GitHub Pages, Supabase function, database, and test paths that constrain this plan.
- [x] (2026-08-13 12:50Z) Refreshed `origin`, confirmed the only upstream delta from local `master` was `data/channel-catalog.discovered.json`, created `codex/accountless-domain-migration` from remote SHA `efb5399911e0eb3832bffd14bd9f53799a098432`, and set `meta.json` to implementation-active before product edits.
- [x] (2026-08-13 12:50Z) Established the baseline with Node `v24.19.0`: `npm run build`, 991 contract tests, 119 Supabase shared tests, and four Chromium/WebKit IndexedDB backup tests all passed.
- [x] (2026-08-13 12:59Z) Extracted the dormant portable-state and imported-state boundaries, added read-only existing-IndexedDB backup access and supplied-state backup verification, and kept normal startup unchanged. Verification passed with a sequential build, 1,011 contract tests, 119 Supabase tests, and four Chromium/WebKit storage tests.
- [x] (2026-08-13 13:02Z) Proved the cross-origin storage boundary in Chromium and WebKit: a different legacy-origin path read exact normal primary, local-backup, and IndexedDB bytes through the real read-only module; the destination origin could read none of them; and the legacy bytes/store list remained unchanged. Milestone 1 verification is a sequential build, 1,011 contract tests, 119 Supabase tests, and six combined storage/browser cases.
- [x] (2026-08-13 13:23Z) Built the standalone legacy-origin helper artifact with exact production/local URL policy, a 1.5-second disclosed cancel window, client-side AES-256-GCM, opaque relay requests, bounded recovery evidence, safe placeholder configuration, and no analytics or account code. Verification passed with a sequential build, 1,023 contract tests, 119 Supabase tests, a dummy production-config build, and 20 combined Chromium/WebKit storage and helper cases.
- [x] (2026-08-13 13:45Z) Added the encrypted, one-use Supabase relay behind independent acceptance/consumption controls seeded off. Local verification passed with Supabase CLI 2.111.0: `npm test` built both artifacts and passed 1,026 contracts, 129 shared backend tests, and all Deno checks; 61 database assertions exercised grants, true concurrent claim, transitions, drain mode, capacity, rate limits, cleanup, and idempotence; database lint plus security/performance advisors returned no issues; and 22 combined Chromium/WebKit storage/helper cases passed. No remote migration, function, Cron job, or control was deployed or enabled.
- [x] (2026-08-13 14:10Z) Added the default-off canonical startup gate, pre-analytics fragment escrow, exact relay consumer, verified backup-before-authority transaction, one-claim retry state, durable completion/defer markers, five-locale recovery UI, and independent Settings recovery. `npm test` passed 1,048 contracts, 129 shared backend tests, and every Deno check; eight Chromium/WebKit full round trips passed for restore, no-state onboarding, switch-off, and conflict backup with byte-identical destination primary. The helper and app remain unpublished and the runtime flag remains false by default.
- [x] (2026-08-13 14:42Z) Updated domain-dependent source surfaces to exact `https://www.edenia.study` policy while keeping authentication optional: PostHog, account returns/CORS, reminder URLs/CORS, live billing root validation, YouTube/Anki guidance, and the approval-gated Pages/DNS/provider checklist. Added a fail-closed enabled-runtime assertion, canonical startup recovery when relay config is missing, and an executable exact-origin helper CSP regression. `npm test` passed 1,057 contracts, 131 shared backend tests, and every Deno check; the stable Chromium/WebKit migration matrix passed 10/10. No provider or public setting changed.
- [x] (2026-08-13 15:03Z) Completed the local final review and composite release evidence. On the fixed pre-review source snapshot, `CI=1 npm run test:ci` passed the build, 1,057 contracts, 131 shared backend tests, every Deno check, and 717 of 718 serial browser cases; its sole persistent failure was an unchanged stale feedback test that expected both sides of a localhost analytics bypass. The test now uses the same loopback server through `localhost.` so the bypass is intentionally off, and the corrected case passed 1/1. The earlier migration matrix passed 10/10 in Chromium/WebKit, the dummy production helper CSP build was exact, diff/secret/log review was clean, and generated artifacts were restored to inert defaults. No live or real-device claim is made.
- [x] (2026-08-13 15:09Z) Completed a no-write launch-readiness audit. The old Pages app still returned `200`; the Edenia Pages site was a built public Actions deployment with no custom domain; the domain-verification TXT record was absent; the apex and `www` still resolved to Namecheap parking; and the helper URL returned `404` because no `edenia-migrate` repository exists. The linked `Edenia Plus` Supabase project was active and its exact URL plus active `sb_publishable_` key matched the GitHub Pages variables, while the relay migration and both relay functions were absent and the public migration variable was absent. Current Supabase guidance also exposed a local gap: `verify_jwt = false` does not validate a publishable API key. Both entrypoints now require `auth: 'publishable:default'` through the existing server wrapper; three focused contracts and both frozen Deno checks passed. No GitHub, DNS, Supabase, helper, provider, or public runtime state changed.
- [x] (2026-08-13 15:11Z) Stopped at the external-release boundary after a requirement-by-requirement completion audit. Local source, default-off behavior, automated proxy evidence, documentation, and review were present, but the outcome remained incomplete without remote CI/review, a published helper, an applied disabled relay plus cleanup proof and hosted advisors, Pages/DNS/provider configuration, backed-up real-browser canaries, live URL/hash/byte evidence, explicit public enablement, and the five-month plus rolling 90-day retirement evidence. The immediate unblock was owner approval to publish the branch for draft review.
- [x] (2026-08-13 15:18Z) Owner approved only the immediate remote-review step. Refreshed `origin/master`, confirmed it remained `efb5399911e0eb3832bffd14bd9f53799a098432`, proved the worktree clean and no duplicate head/base pull request existed, pushed `codex/accountless-domain-migration`, and opened draft PR #140 against `master`: `https://github.com/BriceChivu/Edenia/pull/140`. The initial remote head matched local `a16550045f1f321bb988b0225330b14b89bee5c5`; `verify` started and was still in progress when this record was written. Supabase, helper repository, Pages, DNS, provider, canary, public-enable, external-message, merge, and retirement actions remain unapproved.
- [x] (2026-08-13 15:37Z) Diagnosed PR #140's exact-head `verify` failure at `5eec64dd77579f15a424371746d1cff1dcfa962d`. Build, 1,057 contracts, 131 Supabase shared tests, all Deno checks, and 61 isolated relay database assertions passed. The browser step passed 204 selected cases and failed 11 because CI serves the normal app on configured port `4173`, while the exact migration/feedback test surfaces deliberately navigate to fixed `localhost:8000`; every failure was `Connection refused`, not an application assertion. A no-source-change reproduction kept CI's `4173` topology, added one temporary `_site` server on `8000`, and passed all 11 affected Chromium/WebKit cases in 49.2 seconds.
- [x] (2026-08-13 15:37Z) Reached the explicit approval boundary for the GitHub CI-fix workflow's smallest remedy: conditionally start the fixed `localhost:8000` `_site` test server in `playwright.config.mjs` only when the ordinary configured port differs. The owner subsequently approved the config-only repair, focused validation, commit, and push without broadening approval to product or provider changes.
- [x] (2026-08-13 15:45Z) Implemented the approved Playwright-only server-topology repair without changing product runtime or test assertions. A fresh build passed; the exact CI topology (`EDENIA_TEST_NORMAL_PORT=4173`) passed all 11 previously failing Chromium/WebKit migration and feedback cases in 46.3 seconds without a manually started server; and the default local topology passed all 10 Chromium/WebKit migration cases in 29.1 seconds, proving that the conditional does not start port `8000` twice. Exact-head remote verification remains pending until the approved push.
- [ ] With explicit approval, publish and verify the helper and relay while disabled, configure the domain and provider allowlists, run a backed-up canary, then enable automatic migration.
- [ ] Maintain the operational evidence needed for the five-month minimum and rolling 90-day quiet-period retirement rule; retirement itself remains a separately approved future action.

## Surprises & Discoveries

- Observation: The local branch is not a reliable implementation base yet. Local `master` and its cached `origin/master` point to `d275ef0`, while `git ls-remote origin refs/heads/master` returned `efb5399911e0eb3832bffd14bd9f53799a098432` during planning.
  Evidence: The first implementation step must fetch and inspect the remote diff before creating the branch; it must preserve the untracked `.agent/` work item while doing so.

- Observation: `loadState()` is not a safe way to decide whether the destination is empty. It can synthesize a default state from the configuration cookie, and `init()` immediately creates and saves a default state when no primary value exists.
  Evidence: The migration gate must run after backup storage is ready but before the first `loadState()` call in `src/app.js:2189`; it must inspect the raw normal primary key and valid new-origin backups directly.

- Observation: The existing IndexedDB database is intentionally the normal-backup destination even when internal-test code initiates its migration. Internal-test and sandbox backup stores do not become separate transferable archives.
  Evidence: `initializeStateBackupStorage()` opens `edenia_state_backups_v1` with `NORMAL_STATE_BACKUP_KEY` in the internal-test migration path, while the helper must still reject entries whose `sandbox` marker is not exactly `false` and must never inspect internal-test localStorage keys.

- Observation: Current manual sync export/import and backup preparation share policy only indirectly through functions embedded in `src/app.js`. A helper that copied those rules would drift.
  Evidence: `exportSyncFile()`, `getImportedSyncState()`, and `prepareStateForBackup()` are in `src/app.js`, while structural validation and configuration sanitization are in `src/state/persistence-contract.js`.

- Observation: An exact CORS origin cannot include a path. The source Edge Function can restrict browser reads to `https://bricechivu.github.io`, but it cannot distinguish `/edenia-migrate/` from another page on the same origin, and a non-browser client can forge an `Origin` header.
  Evidence: CORS is a browser disclosure control, not endpoint authentication. Confidentiality must come from client-side encryption and an unguessable capability; abuse protection must not rely on CORS alone.

- Observation: Edenia's PostHog bootstrap runs inline in `index.html` before deferred `config.local.js`, `analytics.js`, and `app.js`. A controller inside bundled `app.js` is therefore too late to guarantee that the transfer fragment was absent when PostHog initialized.
  Evidence: The first inline script must escrow only the recognized transfer fragment in a short-lived in-memory global and immediately call `history.replaceState`; the controller must consume and delete that global before normal startup.

- Observation: The current runtime environment has exact localhost semantics for ports 8000 and 8001 but no arbitrary host injection mechanism, which is a useful safety property.
  Evidence: Migration end-to-end tests should use fixed `http://localhost:8000` as the destination and `http://localhost:8002` as the legacy origin, enabled only by an exact localhost-only test query. Do not add a production runtime field that accepts arbitrary helper or return URLs.

- Observation: Edenia's existing `private` schema deliberately revokes schema and table access from `service_role`; privileged public RPCs use `security definer`, an empty search path, and explicit execute revocation/grant. A new `security invoker` RPC cannot touch new private tables unless the migration broadens service-role access to the schema.
  Evidence: Follow the established private reminder ledger pattern instead: keep direct tables inaccessible even to the service role and use narrowly validated `security definer` RPCs whose default execute privilege is revoked before only `service_role` receives execute.

- Observation: Browser base64url expands ciphertext by roughly one third, and the initial 8 MiB transfer ceiling took about 2.7 seconds in a local exact-maximum handler test even after memory-safe encoding work.
  Evidence: The implemented protocol distinguishes plaintext, ciphertext, and encoded-request caps and lowers the migration envelope ceiling to 2 MiB, with 16 bytes of AES-GCM overhead and a 3 MiB JSON-body cap. The exact 2 MiB maximum completes in a retained local test; the approved Supabase environment must still confirm real CPU, memory, and request behavior before enablement. Larger progress is never truncated or replaced with an older state; it follows the helper's explicit recovery-evidence path.

- Observation: `saveImportedState()` already accepts `preserveBackupId` and prunes older backups one at a time on quota errors. A migration-specific primary writer would duplicate and likely weaken this behavior.
  Evidence: The migration transaction must insert and verify the supplied incoming backup, then call the existing `saveImportedState(state, { preserveBackupId: incomingBackup.id })`; tests must prove the protected incoming recovery copy is never the quota victim.

- Observation: Settings sync controls have a strict binder that requires exactly export and import callbacks, while the app uses small feature-specific binders throughout. Adding an optional third callback would widen an established interface and its tests.
  Evidence: Add a dedicated `src/features/settings/legacy-progress-recovery-actions.js` binder and button near the existing sync actions instead of overloading `bindSettingsSyncActions()`.

- Observation: Several contract tests consume generated `_site` files while `npm run build` deletes and recreates that directory. Running the build and contract suite concurrently can produce false `ENOENT` failures even when both commands are independently healthy.
  Evidence: A concurrent verification run produced four missing-output failures; rebuilding first and then running `npm run test:contracts` sequentially passed all 1,011 tests. Keep build-output verification sequential.

- Observation: The actual read-only IndexedDB module can be exercised from the legacy-origin browser fixture without copying its implementation by serving repository source only on the test-only port and dynamically importing the module from the helper-path page.
  Evidence: Both Chromium and WebKit read the seeded `backups` store, left the deliberately absent `metadata` store absent, and returned the exact primary and local-backup strings, while an abort-on-upgrade probe at the destination reported the database absent.

- Observation: Edenia validates complete translation parity across English, Traditional Chinese, Simplified Chinese, Spanish, and French.
  Evidence: Every migration gate, helper, Settings recovery, backup reason, status, and failure message must add keys to all five locale modules and keep `getMissingI18nKeys()` empty.

- Observation: Current hosted Supabase publishable keys are meant to be sent in the `apikey` header; copying the same new publishable key into `Authorization: Bearer` can trigger legacy JWT parsing and fail before the Edge Function runs.
  Evidence: The helper relay client sends an exact `apikey` plus JSON content type, explicitly omits `Authorization`, and has a contract test for that request shape. Production configuration accepts only the current `sb_publishable_` key family. Because the platform does not validate that key when `verify_jwt = false`, the two relay entrypoints additionally use `@supabase/server` with `auth: 'publishable:default'`; a syntactically valid key from another project no longer reaches the handler.

- Observation: A valid empty normal local-backup array is conclusive evidence of no local backup, not corrupt evidence.
  Evidence: The helper tests exposed the distinction while exercising the no-state path. `selectPortableProgressCandidate()` now treats the exact valid `[]` representation as `none`, while malformed or non-array backup data remains corrupt.

- Observation: Chromium may block a localhost cross-port iframe at the browser's private-network boundary before helper JavaScript executes, whereas WebKit permits the document and exercises the helper's own top-level frame gate.
  Evidence: The retained framed-helper test accepts Chromium's stronger browser refusal or the application's refusal, requires WebKit to exercise the application gate, and proves zero relay calls and unchanged legacy bytes in both engines.

- Observation: The relay has no privacy-safe, stable, provider-authenticated client identity available in the current local handler boundary for a per-client abuse limit.
  Evidence: The implementation stores no raw IP, user agent, installation identifier, account, or derived browser identity. It instead serializes create/claim/complete operations through the private control row and enforces conservative global request, live-row, and live-byte budgets. This is a documented availability trade-off, not an authentication claim; approved hosted-environment review may add a secret-keyed rotating provider identity only if its provenance and retention are proven safe.

- Observation: Local database execution is strong evidence for SQL syntax, grants, row locking, and state transitions, but it does not prove hosted Edge Function memory/CPU behavior, gateway request limits, deployed grants, or production control state.
  Evidence: The exact 2 MiB maximum handler fixture completes locally in roughly 0.25 seconds and the local advisors are clean, but a separately approved test-project deployment and advisor/protocol run remain required before any public enablement.

- Observation: A relay claim is deliberately one-use, so a local backup or quota retry after a successful claim must not call `claim` again. A lost claim response is different because the browser cannot prove whether it owns the row.
  Evidence: The destination controller retains a verified decrypted transaction only in memory for local retries; tests prove it claims once while retrying backup/save, and returns to the helper for a fresh transfer after a lost claim response.

- Observation: The exact localhost destination test gate requires `?legacy_migration_test=1`, but the original helper test return removed that query and therefore could not exercise the real destination controller after a fragment round trip.
  Evidence: The fixed local-only helper return is now `http://localhost:8000/?legacy_migration_test=1`; the first inline script removes only the fragment and preserves that query. Production remains fixed at `https://www.edenia.study/`.

- Observation: Canonical destination eligibility and valid relay configuration are different facts. Collapsing both into one `valid` bit lets a bad production configuration bypass migration startup and launch onboarding on an empty destination.
  Evidence: Relay derivation now retains exact-root `destinationEligible` independently, the controller blocks with explicit recovery when public migration is enabled but the relay is invalid, and the production config writer refuses to emit an enabled build without an exact hosted Supabase root plus current publishable-key format.

- Observation: The helper's inert artifact correctly has `connect-src 'self'`, but a production helper must call a different Supabase origin. A localhost-only round trip cannot prove that production CSP rewrite.
  Evidence: The production writer replaces exactly one safe marker with the one configured Supabase origin. A new pure regression test proves that exact result and rejects a missing marker; a dummy production build emitted `connect-src https://project-ref.supabase.co`, then the generated artifact was restored to its inert placeholder.

- Observation: A full Playwright run cannot remain valid if another verification rebuilds `_site` while its servers are using that directory.
  Evidence: One overlapped run reported 29 scattered timeouts/failures after `_site` changed during execution. It is excluded from acceptance evidence; subsequent focused tests used one stable build, and the final broad run must start only after source and the generated artifact are fixed.

- Observation: The existing feedback browser test expected analytics-disabled localhost to reject a submission even though Edenia intentionally treats exact `http://localhost:8000` as a successful feedback test surface; it later expected mocked analytics on the same bypassed origin. Both the contradiction and the bypass predated this branch.
  Evidence: The release-style run passed or recovered 717 browser cases and failed only this case twice. Running it through `http://localhost.:8000/` reaches the same bound loopback server but does not activate the exact-origin bypass, so the test now exercises unavailable and mocked-analytics behavior as written. The network guard explicitly allows that one additional loopback hostname, and the corrected case passed.

- Observation: CI's ordinary Playwright server intentionally uses port `4173`, but the new migration test gate and feedback test surface intentionally require the fixed browser-visible origin `http://localhost:8000`.
  Evidence: PR #140's exact-head run passed every non-browser stage, then all ten migration cases plus the one feedback case failed on connection refusal to port `8000` while 204 other browser cases passed. Keeping the `4173` server and adding a temporary `8000` server made the exact same 11-case selection pass. The repair belongs in the test-server topology, not product runtime or assertions.

## Decision Log

- Decision: Keep authentication, cloud account sync, and account-based PostHog identity out of this work item.
  Rationale: The user explicitly decoupled domain migration from signup. The migration must work for accountless users and must not make account state a precondition for progress recovery.
  Date/Author: 2026-08-13 / user and Codex

- Decision: Use one full Edenia deployment at `www` and one minimal helper deployment at `bricechivu.github.io/edenia-migrate/`.
  Rationale: A page on the old origin can read the old origin's browser storage even at a different path, while keeping a second full Edenia deployment would multiply release and state-divergence risk.
  Date/Author: 2026-08-13 / user

- Decision: Encrypt the transfer document in the helper with a random 256-bit browser-generated secret, place that secret only in the destination URL fragment, and send only its SHA-256 digest plus authenticated ciphertext to Supabase.
  Rationale: The relay then transports opaque bytes and cannot read study progress. The URL fragment is not sent in the HTTP request or referrer, and the destination can authenticate and decrypt the document locally. This is a stronger implementation of the accepted short-lived token relay without changing the user flow.
  Date/Author: 2026-08-13 / Codex

- Decision: Use two hashes with different jobs instead of pretending source and normalized destination bytes are identical. The encrypted envelope carries a SHA-256 hash of the exact source transfer document for transport integrity. The destination separately hashes the normalized state it intends to save and requires the same hash after reading it back.
  Rationale: Edenia legitimately normalizes imported older state. Requiring the raw legacy JSON and current persisted JSON to be byte-identical would either disable normalization or report safe upgrades as corruption.
  Date/Author: 2026-08-13 / Codex

- Decision: Treat destination progress as nonempty when either the normal primary key or any valid normal backup exists at `www`.
  Rationale: A deleted or unreadable primary may still have recoverable new-origin progress. Automatic migration must not cover it. A user-initiated recovery may preserve the incoming legacy document as a named backup without changing the active destination.
  Date/Author: 2026-08-13 / Codex

- Decision: Make relay completion a separate idempotent acknowledgement after verified local persistence.
  Rationale: Delivery is not success. The relay needs an anonymous daily completion count for the rolling quiet period, and the app must not mark migration complete until the local read-back hash matches. Completed records retain only a short-lived digest tombstone, not ciphertext, so a lost response can be retried without double-counting.
  Date/Author: 2026-08-13 / Codex

- Decision: Default transfer lifetime is 15 minutes; completed digest tombstones may remain for at most 24 hours; expired or abandoned ciphertext is removed independently by a cleanup job before public enablement.
  Rationale: Fifteen minutes is long enough for a top-level browser round trip and short enough to limit exposure. A short tombstone window makes completion retries idempotent without turning the relay into durable identity storage.
  Date/Author: 2026-08-13 / Codex

- Decision: Put automatic migration behind a new independent runtime boolean that defaults false. Relay acceptance and relay consumption also have independent server-side controls; turning acceptance off must continue to permit valid in-flight consumption and completion during a drain window.
  Rationale: DNS and the main application must stay available if the migration path is unhealthy. Independent controls make rollback narrow and reversible.
  Date/Author: 2026-08-13 / user and Codex

- Decision: Treat any recognized migration-return page as analytics-ineligible for its full page lifetime, even after the fragment is removed from browser history.
  Rationale: PostHog initializes before the application controller. Testing only the cleaned URL could start a session recording on the same load that briefly held the decryption capability in memory. The bootstrap checks only whether the escrow variable exists; it never reads or reports the value.
  Date/Author: 2026-08-13 / Codex

- Decision: Keep source code canonical-only for account APIs, reminders, and live billing, and keep transition mechanics in an explicit approval-gated runbook rather than widening production allowlists.
  Rationale: The old application does not need those account surfaces for the accountless helper flow. Exact new-origin source contracts reduce ambiguity, while deployment order and temporary Supabase Auth callback overlap remain visible operator steps.
  Date/Author: 2026-08-13 / Codex

## Outcomes & Retrospective

Planning outcome as of 2026-08-13: the user flow and loss-prevention policy are decided, and the repository-specific implementation path is documented below.

Milestone 1 outcome as of 2026-08-13: Edenia now has reusable, tested boundaries for sanitizing and hashing portable progress, selecting a normal primary or conservative backup candidate, reading an existing IndexedDB archive without creating stores, preserving a supplied incoming state as a reason-specific backup, and reusing the existing import behavior outside the monolithic app module. A retained two-origin Chromium/WebKit test proves why the helper must live on the old origin and that the destination cannot directly read old progress. The product code is intentionally dormant: no migration gate, runtime switch, helper navigation, relay call, or public startup behavior uses it yet. No live Supabase resource, helper repository, Pages setting, DNS record, or provider configuration has changed. The next gap is the standalone helper artifact and its encryption/client boundary.

Milestone 2 outcome as of 2026-08-13: the repository can now build a separate, static `edenia-migrate` helper artifact that refuses unknown origins, paths, configuration, and framed execution; reads only the normal Edenia primary and backup stores; selects progress through the shared portable-state policy; encrypts a canonical envelope locally with an unguessable fragment-only capability; and uploads only authenticated opaque fields through a bounded request. No-state, cancel, corrupt, oversized, unavailable, retry, and recovery-download paths are non-destructive. The ordinary build emits only a deliberately unusable placeholder configuration, the current Pages workflow still uploads only `_site`, and no helper repository, Supabase resource, domain, or public path has changed. The next gap is the disabled relay schema and Edge Functions that implement the tested request contract.

Milestone 3 outcome as of 2026-08-13: the repository now contains an additive private relay migration, two exact-origin unauthenticated Edge Function entrypoints, one dependency-injected protocol handler, and retained Node/SQL/CI verification. The database stores only a capability digest and opaque AES-GCM transport fields, gives browser roles and `service_role` no direct private-table access, returns ciphertext from one claim, removes payload bytes on one idempotent completion, retains only a bounded digest tombstone, and records one anonymous UTC-day count. Independent controls begin off and permit stopping new creation while draining existing transfers; no Cron schedule is present. The tested limit is 2 MiB rather than the original 8 MiB because the exact larger fixture exceeded the target CPU budget. This milestone is local source and database evidence only: no Supabase project, function, schedule, secret, or public application path changed. The next gap is the default-off canonical-origin startup controller and conflict-safe import transaction.

Milestone 4 outcome as of 2026-08-13: the canonical application now has a small startup-controller boundary before the first state load, onboarding, account initialization, and live integrations. A strict pre-PostHog inline escrow removes recognized transfer fragments from history; the consumer sends only a capability digest and publishable key; and the controller verifies decryption, normalized source backup, intended primary, raw read-back, and relay completion in that order. Nonempty destinations are never automatically sent to the helper, manual conflicts preserve the active primary byte-for-byte, and completion uncertainty stores only a digest for later cleanup. The release flag and relay runtime remain safely off/unusable by default. Full local Chromium and WebKit round trips prove restored-state, no-state, switch-off, and conflict paths; no public domain, provider, helper repository, or Supabase deployment changed. The next gap is the coordinated source-level domain and provider allowlist update, followed by a fresh security/cleanup review.

Milestone 5 outcome as of 2026-08-13: every reviewed source-level domain contract now names the canonical `www` origin or the intentionally retained legacy helper origin. PostHog starts only at the canonical application root and is suppressed for a migration-return load; account, reminder, billing, YouTube, and Anki surfaces use exact new-origin policy without making accounts public or mandatory. Production builds fail before publication when migration is enabled without a hosted Supabase root and current publishable key, while an empty canonical browser also fails closed if configuration is unexpectedly absent. The runbook records GitHub verification, Pages, Namecheap DNS, HTTPS, provider sequencing, rollback, the five-full-month minimum, and the rolling 90-day quiet window. These are source and proxy checks only: no provider setting, DNS record, deployment, helper repository, relay control, or public flag changed. Local implementation, documentation, focused browser coverage, final review, and composite release evidence are complete; the remaining launch gap requires separate owner approvals, hosted relay proof, real-browser canaries, provider changes, and live URL verification.

Completion audit outcome as of 2026-08-13: the branch proves the reviewable local implementation but does not prove the user-visible production outcome. Functional items 1 through 5 and switch-off item 7 have automated Chromium/WebKit evidence; item 6 still lacks an approved hosted cleanup run; item 8 lacks the real domain and provider configuration. The local security review and disposable-database tests are strong, but hosted grants, function behavior, advisor results, and operational controls remain unverified. The required Chrome, Safari on macOS and iOS, Firefox, and Edge matrix, backed-up canary, deployed SHA, live runtime configuration, callback/referrer checks, circuit-breaker rehearsal, public owner approval, and retention observations are all missing by design. None can be manufactured locally or obtained through read-only inspection. Work therefore stops at the explicit approval boundary with working public behavior unchanged.

Draft-review outcome as of 2026-08-13: PR #140 is open, draft, and mergeable, but its last required `verify` check is red on a deterministic test-server topology mismatch. The failure does not contradict the migration logic: exact-head remote evidence passed the build, contract, shared backend, Deno, and isolated database layers. The owner approved the config-only repair, and local validation now proves both the exact CI topology and the default local topology pass without a temporary server. Commit, push, and exact-head remote verification are the remaining actions in this approved repair step.

## Context and Orientation

Edenia is a browser-first static application. `.github/workflows/deploy-pages.yml` runs `npm run build:production`, uploads `_site`, and deploys it with GitHub Pages. `scripts/build-site.mjs` bundles `src/app.js` into a classic browser script, writes `config.local.js`, and copies static assets. `scripts/write-runtime-config.mjs`, `scripts/runtime-config-flags.mjs`, and `src/integrations/runtime-config.js` carry late-bound public flags and the public Supabase URL and publishable key. A "runtime flag" in this plan means a public boolean written at deployment time that can keep shipped code dormant without rebuilding it.

The normal browser state lives in localStorage key `edenia_v1`. `src/core/storage-keys.js` derives that key and separate internal-test and sandbox keys. Normal backup metadata uses `edenia_v1_backups`; when IndexedDB backups are active, `src/state/indexed-db-backups.js` migrates and stores the backup entries in database `edenia_state_backups_v1`. IndexedDB and localStorage are both scoped by web origin: data written at `https://bricechivu.github.io` is not directly readable by JavaScript at `https://www.edenia.study`.

`src/state/store.js` owns primary load/save behavior. `src/state/backups.js` owns up to eight validated backup entries. `src/state/persistence-contract.js` contains the existing narrow state-shape check and removes private or device-local configuration fields such as a legacy YouTube API key. `src/app.js` wires those modules together, but also contains import normalization in `getImportedSyncState()`, verified backup flushing in `createVerifiedStateBackup()`, and startup in `init()`. The first startup call currently waits for backup storage, calls `loadState()`, and creates a default state before onboarding. The migration check must interpose at precisely that boundary.

The existing manual sync document has `app: "edenia"`, `syncVersion: 1`, an export time, a sandbox boolean, and `state`. That file remains the permanent user-controlled fallback. This work introduces a versioned transfer envelope for the cross-origin path but reuses the same portable state policy; it must not migrate Supabase sessions, PostHog identifiers, caches, cookies, `sessionStorage`, internal-test state, sandbox state, or the complete backup archive. In-memory UI selections already remain outside persisted state. Persisted undo/redo history and study settings are part of the usable state unless a code-grounded test proves a field is device-secret or invalid across origins.

The separate helper is a static artifact built from this repository but published, after approval, from a separate GitHub Pages repository at `/edenia-migrate/`. It needs the old origin in order to read old browser storage. It is not a second Edenia application: it has one migration screen, one portable-state reader, one encrypted transfer client, a manual evidence download for corrupt local data, and fixed navigation back to the allowlisted destination. Source for the helper remains in this repository so its data contract changes in the same reviewed commit as the canonical application. The build produces a standalone directory that can be copied verbatim into the helper repository.

The relay uses Supabase Edge Functions and Postgres. An "Edge Function" is a small TypeScript HTTP handler under `supabase/functions/`. An "RPC" here is a Postgres function called through Supabase's Data API. The browser never receives a service-role key. Edge Functions use the repository's pinned `@supabase/server` `withSupabase({ auth: 'none', cors: false })` pattern and call service-role-only, narrowly validated `security definer` RPCs that atomically create, claim, complete, and clean transfer rows in the non-exposed `private` schema. This matches the existing reminder ledger without granting `service_role` direct private-schema/table access. The `anon` and `authenticated` roles receive no table or function rights. All exposed-schema tables, if any are unavoidable, must have row-level security enabled and no browser policy; prefer no exposed table at all.

The transfer capability is a random 32-byte value generated by Web Crypto in the helper and encoded as 43 base64url characters. The helper imports those bytes as an AES-256-GCM key, serializes the bounded transfer envelope, encrypts it with a unique 12-byte initialization vector, and sends the capability digest, initialization vector, ciphertext, and byte counts to the source endpoint. AES-GCM both encrypts the data and detects modification. The raw capability travels only after `#` in the top-level navigation to `www`; JavaScript removes it from visible history before doing other work. The destination hashes the capability to claim the opaque row, decrypts locally, verifies the exact-document hash and schema, then applies the import policy.

The relay state machine is `created -> claimed -> completed`. `created` rows contain ciphertext and expire 15 minutes after creation. A claim is atomic and returns ciphertext only once, then clears or makes it unavailable to subsequent claims. After verified local save, completion atomically removes ciphertext, increments a day-level anonymous success counter, and leaves only the digest and completion time for at most 24 hours so duplicate completion calls return `already_completed` without incrementing again. Expired or abandoned rows are deleted by an approved scheduled SQL cleanup and opportunistically during other RPC calls. Daily metrics contain only UTC day, bounded outcome name, count, and update time—never a capability, state hash, email, account ID, PostHog ID, raw IP, page URL, or study data.

The source endpoint can use a short-lived rotating hash of trusted platform request metadata for abuse throttling only if current Supabase documentation and a test prove which header is platform-authentic. It must never persist or log a raw IP address. If no trustworthy request subject exists, use global capacity limits plus strict body, row-count, and time-to-live controls rather than accepting a spoofable client identifier as security. Record the chosen approach and evidence in this plan before public deployment.

Several domain-dependent integrations must change in coordination. `index.html` currently enables PostHog only for the old origin and `/Edenia/`. `src/integrations/account-auth-controller.js` allows only the old internal-test callback and localhost. Supabase account export and reminder handlers have exact-origin CORS lists. Reminder email configuration, Stripe/Paddle return configuration through `APP_URL`, YouTube API referrer restrictions, AnkiConnect documentation, README privacy text, and `/plus/` and `/unsubscribe/` paths also refer to the current deployment. Changing source code is not proof that provider dashboards changed; each external setting has its own approval and live verification step.

## Plan of Work

### Milestone 0: establish a current, reversible implementation base

Begin in `/Users/brice/Documents/Coding/Edenia`. Preserve the untracked `.agent/` directory, fetch `origin`, inspect `origin/master..master` and `master..origin/master`, and create `codex/accountless-domain-migration` from the refreshed remote master without discarding planning artifacts. Do not use `git reset --hard` or broad checkout commands. Before code changes, update this plan's Progress and Surprises sections and set `.agent/work/accountless-edenia-study-migration/meta.json` to `stage="implementation"`, `state="active"`, with the current timestamp and existing artifacts.

Run the existing targeted baseline first: `npm ci --os=darwin --cpu=arm64` only if dependencies are missing or native optional packages are wrong, then `npm run build`, `npm run test:contracts`, `npm run test:supabase`, and the current storage-focused Playwright project. Record exact commands and results here. A pre-existing failure is not permission to weaken a test; isolate it, record it, and stop if it undermines the migration evidence.

Acceptance for this milestone is a focused branch based on the current remote SHA, no unrelated file changes, a recorded baseline, and no live provider changes. Make a local planning/baseline commit only if the work-item workflow requires it; do not push or open a pull request without explicit approval.

### Milestone 1: prove the browser boundary and create one portable progress contract

First add a disposable, automated feasibility test before building the full UI. Extend `playwright.config.mjs` with a migration-only legacy helper server on a distinct localhost port. Seed normal `edenia_v1` and IndexedDB backup data on that origin, navigate top-level to the new-origin test server, and prove that a page at another path on the legacy origin can read the seeded origin storage while the new origin cannot. The production helper assumption is promoted only when Chromium and WebKit pass; Firefox and real Safari/iOS remain separately recorded manual checks. Delete any throwaway spike code after the proof, but retain the test as a contract if it is stable and cheap.

Refactor portable-state policy out of `src/app.js` without changing current manual import/export behavior. Add `src/state/portable-state.js` as the deep boundary for transfer document versioning, JSON cloning, structural checks, portable configuration sanitization, deterministic JSON canonicalization, SHA-256 hashing, size calculation, and source candidate selection. Portable sanitization must deep-clone the state and replace `state.config` with the existing `sanitizeConfigForStorage(state.config)`, thereby excluding the legacy API key and device-local Anki resume fields while retaining study history, persisted undo/redo history, onboarding, channels, video progress, streak, city, and settings. The source selector accepts only explicit normal-primary bytes, parsed normal local-backup entries, and parsed normal IndexedDB entries; it prefers a valid primary and otherwise the newest valid non-sandbox backup across the deduplicated stores. It returns a discriminated result such as `primary`, `backup`, `none`, `corrupt`, or `too_large`, including no secret or analytics keys. An oversized but otherwise valid primary must not silently fall back to an older smaller backup; it requires manual export/recovery so recent progress is not hidden. The module never reads storage by itself; callers supply the exact candidates, which makes origin and namespace choices visible at one boundary and easy to test.

Add `readIndexedDbBackupEntries()` to `src/state/indexed-db-backups.js` as a read-only exported operation that opens the existing database and returns cloned entries without creating stores, writing metadata, or migrating localStorage. Opening a missing database with the current `open()` code would create it, so the reader must use a safe existence check where supported or open-and-close without treating the newly created empty database as evidence; tests must prove it performs no backup writes and does not delete legacy bytes. Keep database and store names defined once in that module.

Move the body and tests for `getImportedSyncState()` to a new `src/state/imported-state.js` factory that accepts Edenia's `defaultState` constructor and the one legacy-cleanup callback it needs. `src/app.js` creates the importer once and uses it for manual import, backup preparation, and migration import. Do not copy the large collection of app normalizers into the helper. The helper validates and encrypts the portable source document; the destination importer upgrades it and computes a separate intended-persistence hash.

Extend `src/state/backups.js` with one primitive that inserts a validated supplied state as a named backup and returns the exact entry it wrote. In `src/app.js`, expose this through an async verified wrapper that flushes IndexedDB and reads the entry back, paralleling `createVerifiedStateBackup()`. This operation is needed both to preserve an incoming state before an empty-destination import and to retain legacy state during a destination conflict. It must respect the eight-entry limit, prune only after verification rules permit it, and never remove the only recovery copy because the primary write hit quota.

Add contract tests beside `tests/contracts/state-persistence-contract.test.mjs`, `tests/contracts/state-backups.test.mjs`, and `tests/contracts/state-store.test.mjs`. Cover deterministic hashes across object-key order, different hashes for semantically different state, deep-cloned sanitized config, excluded API key/device-local Anki fields and non-state keys, primary-over-backup precedence, local/IndexedDB backup deduplication and newest valid fallback, corrupt/no-state/too-large distinction, no oversized-primary fallback, sandbox rejection, supplied-state backup verification, quota behavior, protected `preserveBackupId`, and current manual import/export parity. The existing public-mode and internal/sandbox isolation tests must remain unchanged in behavior.

Acceptance is an unchanged Edenia UI and manual sync flow, plus a reusable transfer contract whose unit tests fail if a future helper and destination would select, sanitize, or hash progress differently. Commit this independently reviewable refactor before adding network behavior.

### Milestone 2: build the standalone old-origin helper

Create `legacy-migration-helper/index.html` and a small helper stylesheet, plus `src/legacy-migration-helper.js`. Add `scripts/build-legacy-migration-helper.mjs` to bundle the helper and its shared state modules into `_legacy_migration_site/`. Refuse to clean any unexpected directory, emit versioned assets and a safe placeholder `config.local.js`, and add `npm run build:migration-helper`. Add a separate `scripts/write-legacy-migration-helper-config.mjs --require-supabase` and `npm run build:migration-helper:production` command that write only the public Supabase URL/publishable key, exact function URLs, exact return URL, and a CSP whose `connect-src` contains the one project function origin. The ordinary `npm run build` should produce both `_site` and the safe-placeholder `_legacy_migration_site` so CI cannot validate the app while silently skipping the helper. `.github/workflows/deploy-pages.yml` must continue uploading only `_site`; publishing a production-configured helper artifact is a separate approved repository action.

The helper has a small explicit state machine: disclosure and cancel window, reading progress, encrypting and uploading, return-with-token, no-progress return, corrupt/too-large recovery, and retryable failure. It reads only `edenia_v1`, `edenia_v1_backups`, and the exported read-only normal IndexedDB backup reader. It validates source size before encryption. Use a 2 MiB UTF-8 transfer-envelope ceiling. The initial 8 MiB ceiling matched the repository's account-export response cap but exceeded the target two-second function CPU budget in a retained local exact-maximum handler test; the smaller limit leaves margin for JSON decoding, base64 conversion, digest verification, and PostgREST encoding. Never truncate state to fit or silently select older progress merely because it is smaller; use the helper's recovery-evidence path.

Generate the capability with `crypto.getRandomValues`, use native Web Crypto AES-GCM, and encode binary values with strict base64url helpers from `src/state/portable-state.js`. The plaintext envelope includes an exact schema identifier, creation time, source kind, source document SHA-256, and portable normal state. The server request contains no plaintext fields from that document. Use `Referrer-Policy: no-referrer`, a restrictive Content Security Policy that allows only the exact Supabase function origin configured at build time, `Cache-Control: no-store` where hosting permits it, no third-party scripts, no PostHog, and no account code.

Production navigation destinations are constants, not arbitrary query parameters: success goes to `https://www.edenia.study/` with the raw capability in a namespaced fragment; no-state and deferred outcomes use non-sensitive namespaced fragment states. Local tests use fixed `http://localhost:8002` and `http://localhost:8000` constants that are reachable only through an exact localhost-only migration test mode. Do not introduce a deployable arbitrary return URL. Reject every other destination. A Cancel control returns to `www` with `deferred`, not `complete`.

When the primary is corrupt and no valid backup exists, do not upload it. Render `Try again`, `Download local recovery evidence`, and `Return without completing the check`. The evidence download is a clearly labeled JSON file containing the exact corrupt normal primary string and/or invalid normal backup string plus timestamps and schema labels; it must not contain cookies, other localStorage keys, IndexedDB databases, PostHog keys, auth keys, cache entries, internal-test state, or sandbox state. Test its field allowlist directly.

Add helper build-output contract tests and migration-specific Playwright tests. Assert zero PostHog or unexpected external requests, keyboard/focus behavior, localized or plain-language accessible status announcements, cancel before navigation, primary and backup selection, no-state return, corrupt evidence download, encrypted request body with no known study marker, raw token present only in the fragment, and old storage byte-for-byte unchanged after every outcome.

Acceptance is a standalone artifact that can be hosted under the old origin, reads the old origin's normal progress in Chromium and WebKit, cannot expose plaintext to the relay request, and does not modify any legacy storage.

### Milestone 3: add a private, encrypted, single-use Supabase relay while all controls remain off

Before editing Supabase code, fetch the current official changelog and relevant Edge Function, CORS, secrets, RLS, database-function, Cron, and platform-limit documentation as required by the repository's Supabase workflow. Record breaking changes and actual CLI version from `supabase --version`; discover every CLI command with `--help`. Do not guess current deployment flags. Use the CLI's `supabase migration new legacy_progress_transfer_relay` command to create the migration filename; never invent it manually.

The migration creates `private.legacy_progress_transfers`, `private.legacy_progress_transfer_control`, and `private.legacy_progress_transfer_daily_metrics`. Enable row-level security as defense in depth and revoke all privileges from `public`, `anon`, `authenticated`, and `service_role`; do not weaken the existing `private` schema revocation. Store capability digest, initialization vector, ciphertext, and ciphertext digest as `bytea`, not base64 text, after the Edge Function strictly decodes the wire fields. The transfer table also stores state (`created`, `claimed`, or `completed`), ciphertext byte count, and created/claimed/completed/expiry/purge times. Add checks for exact 32-byte digests, a 12-byte AES-GCM initialization vector, bounded ciphertext length, valid time ordering, allowed states, one-way state transitions, and ciphertext/IV nulling after completion. Do not store source state hashes, browser IDs, accounts, emails, PostHog IDs, raw tokens, raw IPs, user agents, or URLs.

Create public-schema, `security definer`, service-role-only RPCs for the HTTP operations because the existing Edge Functions call PostgREST RPCs and the private schema is intentionally inaccessible to `service_role`. Each function must validate every argument before privileged work, set an empty search path, schema-qualify every object, and avoid dynamic SQL. Revoke execute from `PUBLIC`/`public`, `anon`, `authenticated`, and `service_role` immediately after creation, then grant only the exact signature to `service_role`; add a database test that a browser role receives permission denied. An atomic create locks/reads the private control row, enforces acceptance enabled, opportunistically removes expired data, enforces global row/byte capacity in the same transaction, inserts a new row, and treats an identical unexpired retry as success. An atomic claim reads the consumption control, changes one unexpired `created` row to `claimed`, returns ciphertext exactly once, and records no success metric. An atomic completion accepts only a claimed row, clears ciphertext and IV, records exactly one UTC-day `completed` count, and retains the minimal digest tombstone; a repeat returns `already_completed`. A private cleanup function deletes expired created/claimed rows and old tombstones. Keep operator control changes and retention queries in approved SQL/dashboard operations rather than exposing browser or public HTTP administration endpoints.

Add two unauthenticated Edge Functions to `supabase/config.toml` with `verify_jwt = false` and pinned `@supabase/server` import maps matching the current unauthenticated reminder handler: `create-legacy-progress-transfer` for the exact legacy browser origin and `consume-legacy-progress-transfer` for the exact canonical origin. Wrap each entrypoint with `withSupabase({ auth: 'none', cors: false })` and pass only `context.supabaseAdmin` into the dependency-injected shared handler. The destination handler accepts two exact JSON actions, `claim` and `complete`; it is still one CORS surface. Put framework-independent request parsing and response policy in `supabase/functions/_shared/legacy-progress-transfer.ts`, following the dependency-injected test style of `_shared/account-export.ts` and the generic structured error logging of `unsubscribe-study-reminders/index.ts`. Each handler enforces method, exact origin, exact allowed request headers, JSON content type, declared and actual body size, exact body keys, base64url lengths, generic error responses, `Cache-Control: no-store`, `Referrer-Policy: no-referrer`, `X-Content-Type-Options: nosniff`, and `Vary: Origin`. Do not reuse the current wildcard `_shared/cors.ts` or the SDK wildcard CORS helper. The source allows `https://bricechivu.github.io` and `http://localhost:8002`; the destination allows `https://www.edenia.study` and `http://localhost:8000`.

Treat CORS as disclosure protection, not authentication. Add layered abuse controls: a 2 MiB plaintext-envelope ceiling plus the 16-byte AES-GCM tag, a 3 MiB JSON body ceiling that includes base64 expansion and fixed overhead, a maximum global count/byte budget for live ciphertext, fixed TTL, per-window request limits, and a server-side control that defaults both acceptance and consumption false in the migration. The handler must reject on declared `Content-Length` before reading and reject again on actual UTF-8 bytes. Confirm the current hosted request and 256 MiB memory/2-second CPU limits in the approved environment with minimum, typical, high-percentile, and maximum fixtures; if the 2 MiB transfer cannot be processed reliably, lower the published maximum or design a separately reviewed chunk protocol rather than silently truncating or relying on compression. If current platform-authenticated request metadata can be used safely, rate-limit on a secret-keyed rotating digest without storing raw input; otherwise document the limitation and retain global fail-closed capacity controls. Never trust a browser-provided installation ID for enforcement. Do not log request bodies, capabilities, digests, ciphertext, RPC error messages, or exception messages that could contain them.

Create Node unit tests for all shared handler branches, SQL-level tests or an approved local database harness for grants and transitions, and Deno checks for both entrypoints. Prove missing/forged origins, wrong methods, widened headers, oversized declared and streamed bodies, malformed encoding, bytea conversion, acceptance off, consumption drain, duplicate create, duplicate/concurrent claim, expired claim, duplicate/concurrent completion, completion-before-claim, cleanup, global capacity serialization, and dependency failures. Test RPC privileges as `anon`, `authenticated`, and `service_role`, and query `information_schema`/catalog privileges to prove there is no direct table path. Run Supabase database advisors after applying the migration in the approved test surface. A function compile or mocked unit test is proxy evidence only; it is not proof that database grants, row locks, state transitions, or capacity accounting work.

Do not schedule Cron or deploy anything live during this milestone without approval. Before public enablement, obtain approval to deploy the additive migration and functions with acceptance and consumption still false, then separately install a named cleanup job. The job runs a bounded cleanup function, remains under the documented concurrency/runtime guidance, and has a tested inspection and unschedule command. Acceptance is a test-project relay that stores only ciphertext, refuses browser table access, cannot return a claim twice, records completion once, cleans expiry independently, and can stop new creation while draining valid transfers.

### Milestone 4: interpose a conflict-safe migration transaction before Edenia startup

Add `src/state/legacy-progress-migration.js` as the single deep controller for canonical-origin migration. It owns fragment parsing and immediate history cleanup, eligibility checks, redirect timing and cancellation, relay claim/decryption, envelope verification, destination classification, backup-before-authority ordering, persistence read-back hashing, relay completion acknowledgement, durable status markers, retry/defer semantics, and the state it exposes to the view. Its public interface should be small, for example a factory with `runBeforeApplicationStart()` and `startRecoveryFromSettings()`. Pass it exact storage, backup, importer, relay client, navigation, clock, and view dependencies so unit tests do not require global browser mutation.

Add a migration view module and narrowly scoped markup/styles to `index.html` and the ordered style system. The gate must appear before the main app or onboarding. Before rendering it, call `applyLocale(loadConfigCookie()?.locale || getBrowserDefaultLocale())` so the pre-state screen uses the best available locale. On an eligible empty `www` visit with no conclusive marker, display a plain-language disclosure and Cancel button for a short, tested window, then top-level navigate to the helper. The exact delay may be 1.5 seconds initially; record any accessibility-driven adjustment. The automatic gate is enabled only on exact `https://www.edenia.study/` in normal mode when the new public runtime boolean is true. It is always off for sandbox and internal-test except the explicit local Playwright test configuration. The user-initiated Settings recovery action is a separate path and may remain available on canonical `www` during the five-month support window even when the automatic gate is switched off, provided relay acceptance is healthy; this is how the circuit breaker pauses automation without deleting recovery.

Define durable status values under a new normal storage key derived in `src/core/storage-keys.js`: `completed`, `checked_none`, `deferred`, `destination_present`, and `local_saved_pending_ack`, each with schema version and timestamp. A completed or checked-none marker prevents repeat automatic trips. Deferred and destination-present do not erase recovery access. Store no raw capability or progress hash in the durable marker. A pending acknowledgement stores only the capability digest and retries completion before declaring success; after a bounded retry window it leaves the state locally safe and exposes a Settings retry without blocking study.

When a transfer fragment arrives, the first inline script in `index.html` must recognize only the exact migration fragment grammar, copy the raw fragment value to `window.EDENIA_LEGACY_PROGRESS_FRAGMENT`, and immediately remove it from the address with `history.replaceState` before the PostHog loader runs. Unknown fragments remain under the current application policy. The migration controller consumes and deletes this global before initializing analytics-dependent state, auth, reminders, YouTube, or the main app. Never copy it to localStorage, sessionStorage, cookies, DOM attributes, console output, analytics properties, or exception text. Claim the ciphertext with only the digest, decrypt locally, enforce AES-GCM authentication, validate the transfer schema and source-document hash, reject sandbox or oversized state, then import through the shared current importer. Compute the intended normalized state hash after `normalizeLoadedState()` and before any migration activity-log entry that would make the hash self-referential.

For an empty destination, first normalize the incoming state and compute its normalized-source hash. Write that exact normalized state, without a migration activity entry, as a named `legacy origin recovery` backup; flush IndexedDB, read the entry back, and require the normalized-source hash. Clone the normalized state, append one deterministic localized activity entry describing the legacy recovery, run the existing streak/pre-save normalization, and compute the intended-primary hash. Then call `saveImportedState(intendedState, { preserveBackupId: incomingBackup.id })`, read the raw primary back through the importer/normalizer, and require the intended-primary hash. Complete the relay and persist `completed` only after all required local verification succeeds. A matching existing primary hash is idempotent success, but still requires a verified recovery backup or evidence that the same normalized-source hash already exists under a legacy recovery reason. This fixed ordering prevents a self-referential hash and ensures quota pruning cannot remove the only incoming recovery copy.

For a nonempty destination, automatic startup does not launch the helper. It writes `destination_present`, keeps the destination active, and makes `Recover progress from the old Edenia address` available beside the existing export/import controls in Settings. Add a dedicated `src/features/settings/legacy-progress-recovery-actions.js` binder rather than changing the strict sync binder. When the user explicitly runs that recovery and returns with a different document, save the incoming normalized state only as a named `legacy origin conflict` backup, flush/read/hash-verify it, leave the active primary byte-for-byte unchanged, complete the relay, and explain how to inspect/restore the backup. When hashes match, treat it as idempotent and do not create repeated identical backups or activity entries.

Any missing helper result, relay failure, decrypt failure, corrupt schema, quota failure, backup verification failure, primary read-back mismatch, or completion uncertainty maps to a specific non-destructive state. Render `Try again`, the existing manual sync-file import path, and `Continue without checking old progress`. Continue records `deferred`; it never records `completed` or `checked_none`. On a local-save failure after claim, old-origin bytes remain available and a new helper run can create a new transfer. On local-save success but completion failure, launch the app with a prominent nonfatal cleanup-pending notice and retain retry state.

Insert the controller in `src/app.js:init()` after `stateBackupStorageInitialization` has completed and before the first `loadState()`. Split the remainder into a clearly named continuation such as `startApplicationFromLocalState()` so recursive initialization cannot run the migration twice. Do not initialize PostHog identity, account auth, reminder reads, onboarding, or live integrations before migration has decided that startup may continue. Add a contract test over `index.html` that proves the escrow-and-cleanup inline block precedes the PostHog bootstrap, accepts only the namespaced grammar, calls `replaceState` before `posthog.init`, and never persists or renders the raw fragment. Add a Playwright assertion that neither captured analytics calls nor page diagnostics contain a known token marker.

Extend runtime configuration end to end with `EDENIA_LEGACY_PROGRESS_MIGRATION_ENABLED`, parsed strictly, written to both safe test defaults and production config, forwarded in `.github/workflows/deploy-pages.yml`, and read through `src/integrations/runtime-config.js`. Add searchable release metadata in the eventual commit message: `Experiment: legacy progress origin migration`, `Gate: EDENIA_LEGACY_PROGRESS_MIGRATION_ENABLED`, and an accurate public-path statement. Switch-off tests must prove the public app behaves exactly as it does now.

Extend `src/core/runtime-environment.js` only with an exact derived `isLegacyMigrationTest` value for `http://localhost:8000/?legacy_migration_test=1`; near-miss origins, ports, paths, parameter values, duplicate first values, internal test, and sandbox remain false. Production eligibility still requires exact `https://www.edenia.study/`, normal mode, and the release flag. The fixed local helper origin is `http://localhost:8002`. This retains the current exact-origin style and prevents a runtime-config typo from navigating users to an attacker-selected helper.

Add migration copy to all five files under `src/i18n/` and assert `getMissingI18nKeys()` stays empty. Extend `formatBackupReason()` for `legacy origin recovery` and `legacy origin conflict`. Add unit and Playwright coverage for every decision case: valid primary, no state, corrupt primary with valid local backup, corrupt primary with valid IndexedDB backup, fully corrupt state, oversized valid primary, cancel, helper offline/timeout, relay timeout, lost claim response, duplicate/expired capability, tampered ciphertext, destination backup without primary, destination same hash, destination conflict, quota failure with protected incoming backup, pending completion retry, manual import, Settings recovery with automatic gate off, and gate off. Assert old-origin bytes are unchanged; app analytics and application logs contain no token, digest, ciphertext, or serialized state; onboarding starts only after a conclusive none/defer decision; translations have no fallback key leakage; and every success has the required new-origin backup and read-back hash.

Acceptance is a fully testable, default-off canonical-origin flow that can recover valid old progress without authentication and cannot silently overwrite either origin.

### Milestone 5: make the whole application domain-ready without coupling domain migration to account rollout

Inventory every old-domain occurrence again with `rg` so no planning-time list becomes stale. Update `index.html` analytics gating to exact `https://www.edenia.study/` root behavior while keeping analytics off on the helper, localhost, alternate paths, and sandbox. Do not identify users by email in this work. Ensure the inline bootstrap cannot read or report the transfer fragment. Update README privacy text to describe the new canonical analytics origin and the temporary encrypted migration relay accurately.

Update domain allowlists and return URLs in source while preserving optional account behavior: `src/integrations/account-auth-controller.js`, its tests, account export CORS, reminder unsubscribe CORS, reminder email URL allowlists, account/reminder documentation, and any Plus billing configuration tests. During transition, keep the exact old origin only where an old page or helper still legitimately calls an endpoint; remove it from canonical-only operations. Do not broaden to wildcard subdomains or arbitrary return URLs.

Treat the repository's GitHub Pages environment/custom-domain setting as authoritative for this Actions-based deployment. Do not add a tracked or generated `CNAME` file unless refreshed official guidance and a test of this exact Actions workflow prove it is required; the prior repository analysis found it unnecessary. Document the required apex behavior—redirect `https://edenia.study/` to `https://www.edenia.study/` using the DNS/registrar or a narrowly scoped redirect service—and verify it separately. Confirm relative assets, hard refreshes, `/plus/`, and `/unsubscribe/` work at the root domain. Preserve GitHub Pages' redirect from the old project URL after the custom domain is attached; do not replace the old full app with a JavaScript redirect that would skip the helper path.

Prepare, but do not perform without approval, the external configuration checklist: GitHub Pages custom-domain verification and HTTPS enforcement; Namecheap DNS records and apex redirect; Supabase Auth site/redirect URLs; Edge Function deployment and controls; reminder `REMINDER_APP_URL` and unsubscribe URL; billing/Paddle/Stripe `APP_URL` or approved-return settings; YouTube API browser referrer restrictions including `https://www.edenia.study/*`; PostHog authorized domains or toolbar settings if applicable; AnkiConnect copy instructing users to add `https://www.edenia.study`; and email links. Record before/after values without printing secrets.

Automated acceptance is a successful production build and full relevant suite with the migration switch both off and on in the test surface. Manual acceptance before live configuration is a local root-path smoke test with all external traffic stubbed. None of these proxy checks authorizes a provider write.

### Milestone 6: review, stage, canary, and cut over in a rollback-safe order

Perform a fresh review-style pass before any live action. Inspect the complete branch diff for copied state policy, shallow wrappers, raw logs, wildcard CORS, exposed tables/functions, leaked public secrets, unbounded payloads, URL-fragment capture, race conditions, destination overwrite, and untested switch-off behavior. Remove abandoned spike code and generated artifacts that should not be committed. Run focused tests after each slice, then `npm test` and the migration Playwright matrix; run `npm run test:ci` once when the focused suite is green. Record exact pass counts rather than predicting them in advance.

With explicit approval, create or use the separate helper repository and publish the reviewed `_legacy_migration_site` artifact. Verify HTTPS, exact path, CSP/referrer behavior, no analytics, and same-origin access with a backed-up test browser. With separate approval, deploy the additive Supabase migration and functions to an approved test project, run advisors and live protocol tests, then deploy to production with acceptance and consumption controls false and install the cleanup job. Verify table/function grants and that browser roles cannot access relay data.

Update provider allowlists to accept `www` before changing DNS. Attach `www.edenia.study` to GitHub Pages, configure DNS and the apex redirect, enable HTTPS, and smoke-test the site with automatic migration still off. Confirm the old `/Edenia/` URL redirects to `www` and the old-origin `/edenia-migrate/` helper remains directly reachable. Verify Pages output SHA/build identity and the actual live runtime config rather than assuming source defaults are deployed.

Back up one real browser's old normal primary and backups using manual export and an out-of-band copy. Enable relay consumption, then acceptance for a private canary while the app migration flag remains scoped off publicly. Exercise no-state and valid-state canaries, prove old bytes unchanged, new backup and primary hashes verified, completion metrics incremented once, ciphertext removed, no PostHog payload leakage, and onboarding behavior correct. Only after review of this packet may the owner approve enabling `EDENIA_LEGACY_PROGRESS_MIGRATION_ENABLED` publicly.

During public launch, watch error outcomes, row/byte capacity, claim-to-completion ratio, latency, cleanup runs, and support reports. Counts are investigation signals, not proof that data is safe. Any confirmed overwrite, loss, cross-origin disclosure, token reuse, schema bypass, or success without verified read-back immediately disables new relay acceptance and the app's automatic redirect while leaving valid consumption/completion available for a bounded drain. Keep `www` live and manual recovery visible. Revert application code at `www` if necessary; do not normally revert DNS after public new-origin progress exists.

Acceptance for launch is a signed-off evidence packet covering the real URLs, a backed-up migration canary, exact live configuration, provider callbacks, root/subpaths, browser matrix, kill-switch test, and rollback instructions. Pushing, PR creation, merging, Pages changes, Supabase deployment, DNS changes, public enabling, and external messages each remain inside the user's approval boundary.

### Milestone 7: operate the helper through its retention window

Document a monthly read-only check in `docs/deployment-and-releases.md`: helper availability and certificate, relay controls, cleanup job history, expired-row count, ciphertext capacity, daily anonymous completions, recovery-page behavior, and manual export/import. Do not create a recurring automation unless the user explicitly requests it. Preserve the reviewed helper artifact so it can be republished without rebuilding unrelated Edenia code.

The helper cannot be retired before five full months after public enablement. At or after that date, query the anonymous daily completion table for the immediately preceding 90 days. Any completion resets the quiet window. Prepare a retirement report with the launch date, earliest eligible date, 90-day query result, support evidence, and replacement static manual-recovery page. Do not disable or delete the helper, relay, cleanup job, or data by inference; obtain explicit owner approval.

Approved retirement first disables new acceptance, drains claims, replaces the helper with a static page explaining manual sync recovery, waits through the stated notice interval, and only then removes relay infrastructure in a separate reversible change. The canonical `www` app and permanent manual import remain. Update this plan and `meta.json` to complete only when the implemented scope and evidence are actually complete; if retention operations intentionally extend beyond the coding goal, record them as an explicit operational follow-up rather than falsely keeping implementation active.

## Concrete Steps

All commands begin in `/Users/brice/Documents/Coding/Edenia` unless the plan is updated with a new approved worktree path.

Refresh and branch safely:

    git status --short --branch
    git fetch origin
    git log --oneline --decorate --max-count=12 --all
    git diff --stat master..origin/master
    git switch -c codex/accountless-domain-migration origin/master
    git status --short --branch

Expect the new branch to point at the fetched remote master and `.agent/` to remain present. Stop if untracked planning files would be overwritten or unrelated tracked changes appear.

Install only if needed and establish the baseline:

    node --version
    npm --version
    npm ci --os=darwin --cpu=arm64
    npm run build
    npm run test:contracts
    npm run test:supabase
    npx playwright test tests/e2e/indexed-db-backups.spec.mjs --project=desktop-standard --project=webkit-storage

The Node version must satisfy `>=24.18.0 <25`. Record actual test totals in Progress when run.

During implementation, use focused checks after their related slice:

    node --test tests/contracts/portable-state.test.mjs tests/contracts/state-backups.test.mjs tests/contracts/state-store.test.mjs
    npm run build:migration-helper
    npm run build:migration-helper:production
    node --test tests/contracts/legacy-migration-helper-build.test.mjs
    node --test supabase/functions/_shared/legacy-progress-transfer.test.ts
    deno check --frozen --config supabase/functions/create-legacy-progress-transfer/deno.json supabase/functions/create-legacy-progress-transfer/index.ts
    deno check --frozen --config supabase/functions/consume-legacy-progress-transfer/deno.json supabase/functions/consume-legacy-progress-transfer/index.ts
    npx playwright test tests/e2e/legacy-progress-migration.spec.mjs --project=desktop-standard --project=webkit-storage

Use the actual generated migration filename in local Supabase commands. Discover commands rather than guessing:

    supabase --version
    supabase migration --help
    supabase migration new legacy_progress_transfer_relay
    supabase db --help
    supabase functions --help

Before a final code handoff, run:

    npm test
    npm run test:e2e
    npm run test:ci
    git diff --check
    git status --short --branch
    git diff --stat origin/master...HEAD
    git diff origin/master...HEAD -- . ':(exclude)data/channel-catalog.discovered.json'

Do not repeat the full browser suite if `npm run test:ci` already ran it against the same unchanged SHA. If test dependencies or environment prevent one command, record the exact failure and distinguish compile/unit proxy evidence from browser, database, provider, and production proof.

External operations are deliberately not written as paste-and-run commands until the responsible provider, project ID, CLI version, current live state, and user approval are confirmed. At that point, add exact, redacted commands and expected results to this living plan before executing them.

## Validation and Acceptance

The fast evaluator after each change is the nearest unit or contract test plus `npm run build`. The slower final evaluator is the full Node/Deno suite, migration-focused Chromium and WebKit flows, the broader Playwright suite, database permission/atomicity tests in an approved Supabase surface, a backed-up real-browser canary, and live-domain smoke tests. Passing a lower layer never substitutes for the next layer.

Functional acceptance requires these human-observable behaviors:

1. With valid legacy progress and an empty destination, visiting `www` shows a brief disclosure, visits the helper without a click unless cancelled, returns, creates a named recovery backup, restores the same usable channels/videos/streak/Anki/city/onboarding state, and opens Edenia without rerunning onboarding. Old storage remains byte-identical.
2. With no legacy state and an empty destination, the helper conclusively returns `none`; only then does Edenia launch its current trailer and onboarding.
3. With a corrupt primary and newest valid normal backup, the backup migrates and the UI tells the user it recovered a backup. With no valid source, nothing uploads and the helper offers recovery evidence and an explicit deferred return.
4. With any valid destination primary or backup, automatic startup never overwrites it. User-initiated recovery preserves a different incoming legacy document as a verified named backup while the active destination stays unchanged.
5. Offline, blocked, expired, duplicated, tampered, oversized, quota, and response-loss cases never become `checked_none` or `completed` without their required proof. They expose retry, manual import, and reversible continue choices.
6. The relay receives ciphertext rather than recognizable state, returns a claim once, records a completed migration once after local verification, erases ciphertext on completion, and removes expired rows through an independently observed cleanup run.
7. With every migration control off, Edenia behaves as the current public application does: normal startup and onboarding, no helper navigation, no relay call, and no migration UI.
8. At live cutover, `https://www.edenia.study/`, `https://edenia.study/`, the old `/Edenia/` URL, `/edenia-migrate/`, `/plus/`, and `/unsubscribe/` have their intended HTTPS/redirect behavior; PostHog runs only on the canonical app; authentication remains optional; and provider returns point to approved exact URLs.

Security acceptance requires an explicit review showing no service-role key in `_site` or `_legacy_migration_site`; no wildcard CORS on relay functions; no browser grants to relay tables/RPCs; no plaintext, raw token, state hash, email, account, PostHog ID, raw IP, or study data in relay logs/metrics; no transfer fragment in analytics; strict payload and row capacity; cryptographic tamper rejection; and tested independent kill/drain controls. Run Supabase advisors on the applied test database and retain the findings or zero-finding output.

Browser acceptance covers current Chromium and WebKit automation, then manually records Chrome, Safari on macOS, Safari on iOS, Firefox, and Edge in normal browsing. Test restrictive/private modes where practical. If a real device or provider surface is unavailable, label it unverified; do not convert a desktop emulator or source inspection into a claim of real-device success.

Release acceptance requires exact remote check status on the final SHA, focused commit scope, reviewed provider/DNS changes, a real canary export backup, before/after live URL evidence, deployed runtime config evidence, rollback and circuit-breaker rehearsal, and owner approval for the public flag. The work item cannot be marked complete because code exists, tests unrelated to migration pass, time elapsed, or the goal budget is low.

## Idempotence and Recovery

All repository refactors and builds are repeatable. `_site` and `_legacy_migration_site` are generated from reviewed sources and may be rebuilt; their scripts must validate the exact output directory before cleaning. Database migrations are additive and use `create`/constraint/grant statements appropriate for a once-applied migration; use a new corrective migration rather than editing a migration already applied outside local disposable environments.

Helper retry never changes old storage. A repeated create with the same capability and ciphertext is idempotent while unexpired; a new page run may create a fresh capability. Claim is single-return. Complete is idempotent through a short tombstone and never increments daily success twice. Cleanup can run repeatedly and only deletes rows past their explicit expiry or purge times.

Destination import is restartable. It never writes automatically when valid destination evidence exists. It writes and verifies the incoming recovery backup before the primary. If backup creation fails, the primary is untouched. If primary persistence fails, the verified incoming backup remains at `www` and old-origin data remains untouched. If primary succeeds but relay completion fails, local progress remains usable with `local_saved_pending_ack`; retry only acknowledges cleanup and does not reimport. Matching hashes do not generate duplicate recovery backups or activity entries.

Before the first verified public migration, custom-domain/DNS rollback may return traffic to the old application if the owner approves. After that point, normal rollback disables new relay acceptance and the app migration flag, drains in-flight claims, and redeploys prior application code at `www`. DNS reversion is emergency-only because it would hide new-origin progress. Never delete relay tables, helper assets, or old browser data as a rollback shortcut.

The source of truth remains on the user devices. Before canary, export and separately preserve both origins. Never run broad `localStorage.clear()`, delete the IndexedDB database, or mutate old-origin bytes during tests outside a disposable browser context. Any destructive provider or retirement action must resolve its exact target read-only and receive explicit approval.

## Artifacts and Notes

Planning-time repository evidence:

    Local planning HEAD: d275ef0
    Remote master observed: efb5399911e0eb3832bffd14bd9f53799a098432
    Normal primary key: edenia_v1
    Normal backup key: edenia_v1_backups
    IndexedDB database: edenia_state_backups_v1
    Current backup limit: 8
    Existing manual envelope: app="edenia", syncVersion=1
    Existing account-export maximum response: 8 MiB

Required launch evidence should eventually be summarized here with secrets redacted:

    source commit and deployed Pages SHA
    helper artifact SHA and helper repository deployment
    Supabase migration version, function versions, advisor output, and control state
    cleanup job name and latest successful run
    canary source hash, intended destination hash, read-back hash, and backup ID
    old-origin before/after byte comparison
    relay created/claimed/completed/cleanup observations without identifiers
    DNS, TLS, redirect, subpath, callback, analytics, and API-referrer checks
    browser/device matrix and explicitly unverified cells

Read-only launch audit at 2026-08-13 15:09Z:

    GitHub Pages: built public Actions deployment; cname=null; old URL HTTP 200
    Domain ownership TXT: absent
    edenia.study apex: Namecheap parking A record, not GitHub Pages
    www.edenia.study: Namecheap parking CNAME, not bricechivu.github.io
    Canonical HTTPS: not yet available for www or apex
    Helper repository: absent; helper URL HTTP 404
    Supabase project: Edenia Plus ACTIVE_HEALTHY in ap-northeast-1
    Supabase Pages variables: exact project URL and active named publishable key match
    Public migration variable: absent, therefore disabled
    Relay database migration: absent from hosted migration history
    Relay Edge Functions: both absent from hosted function list
    Supabase advisors: relay-specific hosted findings unavailable until deployment;
      existing unrelated project findings remain to be reviewed separately
    approval timestamps for each live action

Do not paste state documents, capabilities, ciphertext, service keys, publishable-key values, emails, IP addresses, or provider secrets into this plan.

## Interfaces and Dependencies

Use only existing pinned dependencies plus browser Web Crypto unless implementation evidence proves a missing primitive. Do not add a cryptography package for AES-GCM, SHA-256, random bytes, or base64url. Keep `@supabase/supabase-js` pinned and committed through the existing lockfile. The helper must not import PostHog, account, reminder, billing, YouTube, or Anki modules.

In `src/state/portable-state.js`, provide stable pure interfaces equivalent to:

    export const LEGACY_PROGRESS_TRANSFER_SCHEMA = 'edenia-legacy-progress-transfer-v1'
    export const LEGACY_PROGRESS_TRANSFER_MAX_BYTES = 2 * 1024 * 1024

    export function selectPortableProgressCandidate({
      primaryRaw,
      localBackupRaw,
      indexedDbEntries
    }) -> { status, source, state, corruptEvidence, byteLength }

    export function createPortableProgressEnvelope({ state, source, now }) -> envelope
    export function parsePortableProgressEnvelope(value) -> envelope | null
    export function canonicalizeJson(value) -> string
    export async function sha256Base64Url(bytesOrString) -> string
    export function encodeBase64Url(bytes) -> string
    export function decodeBase64Url(value) -> Uint8Array

This module hides schema/version checks, exact allowed source policy, JSON canonicalization, hashing, byte limits, and binary encoding. It must not hide which origin or storage namespace the caller selected.

In `src/state/imported-state.js`, provide:

    export function createImportedStateReader({
      createDefaultState,
      removeLegacyVideoWatchReminderState
    }) -> function readImportedState(payload)

This module hides current sync-envelope unwrapping and default-state overlay. `src/app.js` remains responsible for running the existing full normalizers because they depend on app feature policy.

In `src/state/indexed-db-backups.js`, provide a read-only function equivalent to:

    export async function readIndexedDbBackupEntries({
      databaseName = STATE_BACKUP_DATABASE_NAME,
      indexedDb = globalThis.indexedDB,
      isValidEntry
    }) -> { exists, entries, error }

It hides IndexedDB transaction mechanics and never migrates, writes, or cleans storage.

In `src/state/backups.js`, deepen the existing store with:

    createStateBackupFromState(reason, state, options) -> entry | null

This owns entry construction, deduplication, limit handling, supplied-state validation, and storage writes. The async app wrapper owns repository flush and read-back verification.

In `src/state/legacy-progress-crypto.js`, or inside `portable-state.js` if that remains cohesive, provide:

    createEncryptedProgressTransfer(envelope, crypto) -> {
      capability,
      capabilityDigest,
      iv,
      ciphertext,
      ciphertextDigest,
      plaintextBytes
    }

    decryptProgressTransfer({ capability, iv, ciphertext }, crypto) -> envelope

This boundary hides key generation/import, AES-GCM, digesting, encoding, and tamper failures. Do not expose the capability to logs or durable application state.

In `supabase/functions/_shared/legacy-progress-transfer.ts`, export dependency-injected handlers or one action router whose external schemas are exact:

    POST create-legacy-progress-transfer
    { capability_digest, iv, ciphertext, ciphertext_digest, ciphertext_bytes }
    -> { status: 'created', expires_at }

    POST consume-legacy-progress-transfer
    { action: 'claim', capability_digest }
    -> {
      status: 'claimed',
      iv,
      ciphertext,
      ciphertext_digest,
      ciphertext_bytes,
      expires_at
    }

    POST consume-legacy-progress-transfer
    { action: 'complete', capability_digest }
    -> { status: 'completed' | 'already_completed' }

All binary fields are strict unpadded base64url. Exact field names may change once TypeScript conventions and SQL return types are implemented, but update this section before code so tests and clients share one contract.

In `src/state/legacy-progress-migration.js`, provide one controller factory whose caller-facing result is small:

    createLegacyProgressMigrationController(dependencies)
      .runBeforeApplicationStart()
      -> Promise<{ disposition: 'continue' | 'redirected' | 'waiting' }>

    controller.startRecoveryFromSettings()
      -> Promise<void>

The controller hides the state machine and transaction ordering. `src/app.js` must not branch on relay status codes or manually arrange migration backups.

The eventual revision history must append a note below each time this plan is materially revised.

Plan revision 2026-08-13: Created the first repository-grounded ExecPlan from the completed decision artifact. The plan introduces encrypted opaque relay storage, a two-hash integrity model, a single deep startup controller, a shared portable-state contract, exact approval boundaries, and observable rollout/retirement evidence because current startup and persistence code otherwise leak this sequencing into `src/app.js`.

Plan revision 2026-08-13 (improvement pass 1): Grounded fragment handling in the actual inline PostHog load order, fixed the localhost test origins instead of adding arbitrary URL configuration, and split helper test versus production configuration generation. These changes prevent a raw capability from reaching analytics and keep the helper destination policy closed by construction.

Plan revision 2026-08-13 (improvement pass 2): Replaced the infeasible private-table `security invoker` proposal with Edenia's established locked-down `security definer` RPC pattern, retained direct revocation from `service_role`, specified pinned `withSupabase` entrypoints, moved binary storage to checked `bytea`, and separated ciphertext from base64-expanded request limits. These changes are grounded in the existing reminder/founding migrations and unauthenticated function entrypoints.

Plan revision 2026-08-13 (improvement pass 3): Grounded the import transaction in `saveImportedState(...preserveBackupId)`, fixed deterministic backup/activity/hash ordering, kept the existing Settings sync binder narrow by adding a dedicated recovery binder, made five-locale parity explicit, and prohibited silent fallback from oversized current progress to an older smaller backup. These changes close quota, idempotence, localization, and hidden-data-loss gaps found in the current state and Settings code.

Plan revision 2026-08-13 (final consistency audit): Removed the assumed repository `CNAME` artifact and made the existing GitHub Pages Actions environment/custom-domain setting authoritative unless refreshed official evidence proves otherwise. This avoids adding a deployment mechanism the current workflow does not require.

Plan revision 2026-08-13 (Milestone 1 evidence): Recorded the dormant portable-state foundation, exact verification counts, the build-output sequencing constraint, and the retained Chromium/WebKit two-origin proof. This closes the feasibility milestone with observable evidence while leaving every public and live surface unchanged.

Plan revision 2026-08-13 (Milestone 2 evidence): Recorded the standalone helper, current Supabase publishable-key request rule, safe build-time configuration, encrypted transfer boundary, recovery-evidence policy, browser frame behavior, and exact automated evidence. This closes the helper milestone without publishing it or enabling any application path.

Plan revision 2026-08-13 (Milestone 3 evidence): Recorded the disabled private relay schema, exact-origin function protocol, service-only RPC grants, local concurrency and advisor evidence, global privacy-preserving abuse controls, and the evidence-driven reduction from an 8 MiB to 2 MiB envelope. This closes the local relay implementation milestone while retaining hosted-environment verification and every external action as explicit approval gates.

Plan revision 2026-08-13 (Milestone 4 evidence): Recorded the default-off canonical startup gate, pre-analytics fragment escrow, conflict-safe backup-before-authority transaction, one-claim local retry, completion acknowledgement marker, five-locale UI, Settings recovery, and Chromium/WebKit round-trip evidence. This closes the local application transaction while keeping the public flag, helper, and relay unpublished.

Plan revision 2026-08-13 (Milestone 5 evidence): Recorded the exact canonical PostHog/account/reminder/billing/YouTube/Anki source policy, production runtime and helper-CSP failure guards, provider/DNS runbook, five-month retention operations, stable focused verification, and the invalid overlapping-build browser run that cannot count as evidence. This closes local domain readiness and leaves one stable broad browser run plus every live operation behind explicit approval.

Plan revision 2026-08-13 (local final review): Recorded the stable release-style build/unit/backend/browser evidence, the one pre-existing contradictory feedback test and its loopback-origin repair, the clean diff/privacy review, and the explicit limit that no live or real-device evidence exists yet. This closes the local implementation phase without misrepresenting approval-gated launch work as complete.

Plan revision 2026-08-13 (approval-boundary completion audit): Mapped every remaining acceptance requirement to authoritative evidence and recorded that all missing proof now requires an explicitly forbidden external mutation or a post-launch observation window. This stops the active implementation honestly, names draft-PR publication as the immediate unblock, and preserves all later provider operations as separately approved actions.

Plan revision 2026-08-13 (draft-PR approval): Recorded the owner's narrow approval to publish the existing branch for remote review, refreshed the base and duplicate-PR checks, and resumed the work item without broadening authorization to any live migration or provider action.

Plan revision 2026-08-13 (draft PR #140): Recorded the successful branch push, draft pull-request target and URL, exact initial local/remote head identity, and pending remote verification while preserving every live migration operation as a separate approval gate.

Plan revision 2026-08-13 (PR #140 CI blocker): Recorded the exact-head remote pass/fail boundary, deterministic `4173` versus fixed-`8000` test-server mismatch, 11-of-11 no-source-change proof, smallest config-only repair, and repeated approval blocker. This prevents a harness failure from being misreported as a product regression while stopping before an unapproved PR update.

Plan revision 2026-08-13 (approved PR #140 CI repair): Recorded the owner's narrow approval, the conditional fixed-origin Playwright server, and passing validation in both CI and default local topologies. This resumes remote review without changing application behavior or authorizing any live migration/provider action.
