# Edenia Architecture

## Architectural boundary

Edenia is a browser-first static application. `index.html` loads the deployed
entry filenames, runtime configuration, analytics entry, and application
bundle. The build assembles source into `_site` without changing those public
filenames.

The architecture migration improves ownership while deliberately preserving the
existing product. It does not introduce a framework, TypeScript, a state
migration, new functionality, or an approved visual change.

## Source ownership

| Source area | Responsibility |
|---|---|
| `src/core/` | Pure shared helpers, storage/runtime contracts, responsive capabilities, and the empty global-action contract |
| `src/domain/` | Product rules that are independent of rendering, including video state and watch-progress coverage |
| `src/state/` | State normalization, persistence boundaries, backups, history, activity, onboarding, Anki, and insight state |
| `src/i18n/` | One complete dictionary per locale plus locale registry and rendering interface |
| `src/integrations/` | Runtime configuration, analytics boundary, and YouTube parsing |
| `src/features/` | Feature-scoped models and DOM action adapters grouped by product surface |
| `src/app.js` | Composition entry and remaining tightly coupled rendering, lifecycle, and integration orchestration |
| `analytics.js` | Separately loaded production analytics entry retained for deployment compatibility |

Feature action adapters own listeners for static and generated controls. There
are no application inline event attributes or global action aliases.
`src/core/global-action-contract.js` remains an intentionally empty frozen
contract so tests reject their reintroduction.

## State and compatibility contracts

The migration retains:

- `window.EDENIA_CONFIG` and the existing runtime load order;
- normal, internal-test, and sandbox storage domains and keys;
- persisted state shape, normalization, backups, imports/exports, and Undo/Redo;
- PostHog event and property identities and production/internal-test isolation;
- deployed `app.js`, `style.css`, `analytics.js`, and GitHub Pages behavior;
- exact locale copy, placeholders, fallback behavior, and `data-i18n` rendering.

State mutation continues through the existing store and feature boundaries.
Viewport size never rewrites product state or changes persistence domains.

### Durable browser profiles

`indexedDbProfileEnabled` is an opt-in runtime flag, generated from
`EDENIA_INDEXED_DB_PROFILE_ENABLED`. It defaults to false. Enabling it also
enables verified IndexedDB recovery backups and retirement of their verified
localStorage copies. Account and Auth rollout settings remain independent.

The Pages build passes `EDENIA_INDEXED_DB_PROFILE_ENABLED` from the repository
variable of the same name. Validate tester-mode imports with a large regular
profile sharing the origin before enabling the variable. Each mode migrates
only its own active profile when opened: opening mode 2 does not retire the
regular profile. Opening the regular experience later migrates that profile
and frees its localStorage allocation. Disabling the variable stops new
migrations; it does not revert migrated profiles to localStorage. Rollback
releases must retain the IndexedDB reader and recovery behavior.

The application opens the durable repository before starting. It retains a
hydrated snapshot for existing synchronous reads; saves await a strict
IndexedDB transaction and exact readback before rendering success, updating
configuration cookies, or emitting persistence effects. Failed mutations
restore the durable snapshot. An existing profile remains readable if a
startup maintenance write fails.

Each storage domain uses `${storageKey}_profiles_indexed_db_v1`, with an
`active` profile and revision in the `profiles` object store. Migration retains
the exact original profile and captured access metadata as `legacy-recovery`.
It verifies the primary through a reopened database and compares the captured
legacy values before retiring their duplicates. When localStorage is full, a
verified legacy primary can be replaced atomically by a small IndexedDB
pointer; interruption before writing the marker still leaves a recoverable
opening route. A changed legacy value is retained.

The localStorage `${storageKey}_indexed_db_v1` marker uses `empty` until the
first profile is saved and `1` afterward. An existing marker or pointer keeps
using IndexedDB even when the rollout flag is later disabled. An unavailable
or missing migrated head opens storage recovery instead of silently reverting
to an older backup. If migrated backups cannot reopen, a readable primary
remains available, while actions requiring a verified recovery backup fail
without recreating legacy copies. Database opens and transactions have bounded
waits.

Writes compare the captured profile revision inside the transaction. Stale
tabs fail and refresh the winning revision through a storage signal,
BroadcastChannel, or focus event. Backup writes apply their own changes without
clearing entries created by another adapter. Ownership and reset fences are
checked before writing and after readback. If readback fails or a fence is lost after commit,
the repository compensates only while its exact written head is still current;
a newer transaction wins. Access metadata remains in localStorage, retaining
the non-atomic metadata boundary described in ADR-0001.

Within one repository, concurrent independent mutations can start from the
same hydrated revision. If every intervening revision was written by that
repository, it rebases only disjoint changes against the captured snapshot.
Conflicting values and concurrent array edits fail. Any intervening revision
from another tab stops this rebase, as does a full-profile replacement. Queued
mutations of the same object preserve the earlier acknowledgment and cannot
proceed after a failed predecessor.

Byte budgets use a conservative UTF-16 serialized size, independent of
`navigator.storage.estimate()`. Replaceable channel-search results are bounded
to 64 KiB, video metadata to 2 MiB, recent activity to 128 KiB, and each Undo or
Redo stack to 256 KiB, targeting 75% of those limits when trimming. Undo keeps
complete recent actions; a newest action above its hard limit rejects the
mutation rather than removing its only meaningful Undo. Watched and partial
progress, Anki facts, favorites, watch-later and removal flags, channel/language
selections, duration used in scoring, and video classification remain owned
profile data and are not evicted for cache space.

Portable exports and verified imports retain the existing profile format.
Small access records, migration markers, and existing account-cloud transport
and recovery bookkeeping remain in localStorage. In particular, account-cloud
queued envelopes are outside this primary-profile migration and retain their
existing bounds and failure behavior; enabling account sync needs its own
storage-capacity review. This change does not enable that rollout.

## Responsive architecture

JavaScript uses named capabilities from
`src/core/responsive-capabilities.js`. Layout decisions, pointer/hover support,
coarse input, reduced motion, and viewport-positioning checks remain distinct.
The existing query values are preserved.

The stylesheet cascade stays ordered:

1. `00-foundations.css`
2. feature files `10` through `95`
3. `96-responsive-page-flows.css`
4. `97-responsive-input.css`
5. `98-responsive-phone.css`
6. `99-responsive-wide.css`

The final four files separate full-screen/page composition, coarse input,
phone component composition, and tablet/desktop/capability rules. Their split
preserves the prior responsive source byte-for-byte and does not authorize
breakpoint or design changes. See `docs/responsive-review-matrix.md`.

## Build flow

```text
index.html + src/ + analytics.js + data/assets
                    |
             scripts/build-site.mjs
                    |
                  _site
                    |
             GitHub Pages artifact
```

Asset cache versions are generated during the build. `_site` and generated
bundles are not source-controlled.

## Verification boundaries

Node contract tests cover pure rules, state/persistence, translations, feature
listener ownership, responsive queries, build output, and public compatibility
interfaces. The CI browser suite owns end-to-end and visual acceptance. The
current preservation inventory and responsive matrix define what unexplained
differences block merging.
