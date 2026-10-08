# Mandatory sign-in and persistence tests — 2026-10-08

## Outcome

The selected-account mode-1 trial was audited from `origin/master` at
`d8047e3e`. Two defects were reproduced and repaired in
[PR #406](https://github.com/BriceChivu/Edenia/pull/406): valid large-library
imports exceeded the database RPC timeout, and a lost conflict-choice
acknowledgment could leave opening stuck after the protected comparison expired.
Public mandatory-entry and migration cutover remain outside this trial.

The supplied private sync file successfully imported in the user's existing
macOS Chrome mode-1 tab after the tested SQL migration was applied. The product
showed **Sync file imported** and **Up to date**. Reload restored the rendered
island and study history. A subsequent product export passed portable integrity
verification and retained all 1,665 video records and their study/organization
facts, all 42 Anki days and their created/reviewed totals, and the exact opaque
island. Configuration, onboarding, learner preferences and city progress also
matched. Catalogue refresh changed thumbnails and one title; Anki refreshed one
observation timestamp. The bounded activity log changed with normal background
refreshes; its retained original entries were unchanged, and no study activity
was lost. This is a semantic round trip, not identical envelope bytes after
background activity.

Read-only backend verification found the new import's previous and imported
versions both retained, with at least 30 days of protection. The migration itself
left complete head/version aggregate fingerprints unchanged before the user
requested import was retried. It changes a private serialization function; it
does not widen access, alter audience, skip validation or increase timeouts.
Migration history is reconciled to source version `20261008103444`.
Private files, identities, screenshots and envelope/log contents stay in local
operator artifacts and are not included in this public report.

## Repairs

### Large valid imports

The supplied file was canonical, had a verified digest, and was below the 2 MiB
cloud limit. Its failed import produced PostgreSQL `57014` (statement timeout).
The retained stack located repeated SQL-function startup in
`private.canonical_jsonb_text`, called by the envelope validator during
`import_my_learner_profile`. The authenticated statement budget is 8 seconds.

The additive migration uses cached PL/pgSQL recursion and direct scalar returns.
Object ordering, array ordering, scalar representation and the special Godot
snapshot serialization boundary are retained. The helper remains invoker-only
with an empty search path and no direct execution grant to API roles. The real
database regression imports a generated, serializer-verified profile with 1,600
videos and over 1 MiB of JSON under an 8-second statement timeout, reads its exact
protected predecessor, and rolls back to it.

An isolated PGlite diagnostic using a stub for the external JSON-schema extension
measured canonicalization at 887 → 244 ms, validation at 1,258 → 433 ms and an
import path at 3,702 → 1,261 ms. Those numbers explain the mechanism; they are
not Supabase latency promises or evidence for the schema extension. The full
Supabase CI database job and successful actual-file hosted import establish the
real acceptance result.

### Expired lost-choice acknowledgment

When the exact owner-scoped request resolves to an expired comparison, the client
keeps its verified durable device candidate, records one new operation ID before
the RPC, and asks for a fresh comparison with the current cloud profile. It does
not reactivate an old selection or choose a side automatically. Both profiles
remain exportable and the app remains behind the comparison gate until an
explicit choice. A second expiry is bounded; storage rejection or owner/profile
change leaves the retained request intact and performs no fresh cloud write.

Twelve contract regressions cover prepared/finalized requests, fresh open/expired
responses, ownership replacement and rejected local writes. The new browser case
uses the current mode-1 client and verifies the comparison, Export both, hidden
learner content, unchanged accepted revision and absence of any choice RPC.

## Validation receipts

- All **1,837 client contracts** passed after both repairs.
- All **139 shared Edge-function tests** and the retained Deno function checks
  passed during the audit.
- **79 desktop Chrome browser cases** passed across auth methods, first signed-in
  profile, access gating, trial lifecycle, protected import, conflict choices,
  onboarding and real Godot restoration for both island choices.
- **24 phone/tablet trial cases** passed. Ten explicit skips are desktop-only
  Godot scenarios, not passing mobile-device evidence.
- **41 desktop storage/migration cases** passed, including IndexedDB quota and
  readback failures, concurrent changes and local/profile backup migration.
- After the client repair, **31 focused desktop cases** passed, including the
  new expired-acknowledgment regression and both Godot choice paths. This run
  overlaps the earlier matrix; the counts above must not be summed as distinct
  scenarios.
- The SQL-only candidate `7d5d77d2e844daae2cf7d606da861156c289c346`
  passed [CI database checks](https://github.com/BriceChivu/Edenia/actions/runs/37796217130):
  **30 suites, 1,020 assertions**, with the real validator and authenticated RPC
  path. Browser and Godot jobs were scope-skipped for that SQL-only candidate.
- The integrated preview was rebuilt using
  `node scripts/build-experience-tiny-swords.mjs --project godot/tiny-swords`.

Local browser responses used synthetic Auth/RPC fixtures and installed Chrome.
They do not claim real provider acceptance on every device. The hosted import
used the already signed-in, already admitted account; no other account was
admitted and no provider configuration was changed.

## Environment and remaining acceptance boundaries

A local Docker database rehearsal failed during bootstrap because the existing
shared runtime was out of disk and later returned I/O errors. A separate
task-owned runtime attempt also exceeded available host disk. Neither attempt
counts as database acceptance. The task-owned runtime, failed container and
volume were removed; the shared runtime and other tasks' resources were not
restarted or pruned. The real CI database receipt supplies the completed SQL
validation.

Safari and physical iPhone/Android provider acceptance, hosted outage/containment
rehearsal and prolonged soak are still separate release gates. These tests and
repairs do not establish those gates or authorize public mandatory sign-in.
