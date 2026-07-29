# Edenia Migration Changes

This append-only ledger records every conceptual change made during the conservative
architecture and responsive migration. Each migration commit must add an entry whose
`MIG-###` identifier matches the commit subject.

Existing entries must not be silently rewritten or removed. Corrections, reversals,
release mappings, and follow-up findings are recorded as new entries.

## Entry format

- **ID:** `MIG-###`
- **Date:** `YYYY-MM-DD`
- **Phase:** Migration phase
- **Type:** Governance, tooling, tests, structure, compatibility, responsive, visual,
  documentation, release, or rollback
- **Status:** Implemented, verified, released, superseded, or rolled back
- **Intent:** Why the change exists
- **Conceptual change:** What changed, independent of individual code lines
- **Preservation contract:** What must remain unchanged
- **Risks:** Affected behavior and likely failure modes
- **Verification:** Checks performed and their result
- **Rollback:** How to reverse the change safely
- **Association:** Branch, pull request, commit, and release when available

---

## MIG-001 — Establish migration governance and stable baseline

- **Date:** 2026-07-28
- **Phase:** 1 — Stable baseline and safety harness
- **Type:** Governance and release
- **Status:** Implemented locally; remote publication pending GitHub authentication
- **Intent:** Give every migration change an auditable history and create an exact
  rollback point before application files are reorganized.
- **Conceptual change:** Declared the current `master` commit
  `0c3f98fb865acc7695c85579d90d730ceead607a` as the protected pre-migration
  baseline, created the annotated local tag `v1.0.0`, opened the sequential phase
  branch `codex/migration-01-safety-harness`, added this append-only ledger, and
  added a migration-focused pull-request checklist.
- **Preservation contract:** No application source, runtime behavior, deployed
  output, storage, analytics, localization, responsive behavior, or appearance is
  changed by this entry. Every current desktop, tablet, and phone surface remains
  **Keep** unless a later approved migration entry explicitly says otherwise.
- **Risks:** The baseline tag and branch are local until GitHub authentication is
  restored. Repository branch protection cannot yet be configured remotely.
- **Verification:** Confirmed the worktree was clean on `master`, confirmed the
  baseline commit identifier, confirmed no prior `v1.0.0` tag existed, and created
  the local tag and phase branch from that exact commit.
- **Rollback:** Before publication, delete the local phase branch and local tag.
  After publication, preserve the tag and revert migration merge commits through
  reviewed pull requests rather than rewriting history.
- **Association:** `codex/migration-01-safety-harness`; PR and GitHub Release pending.

---

## MIG-002 — Add a reproducible static-site build

- **Date:** 2026-07-28
- **Phase:** 1 — Stable baseline and safety harness
- **Type:** Tooling, deployment, and documentation
- **Status:** Implemented and locally build-verified; pinned CI verification pending
- **Intent:** Replace ad hoc deployment commands with one pinned, reproducible build
  used locally, in CI, and by GitHub Pages.
- **Conceptual change:** Added an npm project, pinned esbuild alongside the existing
  JavaScript minifier, pinned the supported Node 24 LTS runtime, created a
  static-site build that emits `_site`, generates commit-derived asset cache
  versions, produces an empty local/test runtime config, requires the existing
  YouTube secret for production builds, and updated all Node-based workflows and
  local-build documentation to use the supported runtime.
- **Preservation contract:** The browser continues to load the same relative
  `index.html`, `config.local.js`, `analytics.js`, `app.js`, and `style.css`
  contracts. Classic-script globals and load order remain intact, the existing
  Terser JavaScript transformation remains in use, production runtime configuration
  keeps the same `window.EDENIA_CONFIG.youtubeApiKey` shape, and no application
  behavior or appearance is intentionally changed.
- **Risks:** CSS minification moves from clean-css to esbuild because the existing
  clean-css CLI dependency introduced four high-severity dependency vulnerabilities.
  Visual regression coverage must prove equivalent rendering. Incorrect copy rules
  could omit a deployment asset. Cache-version replacement must match each entry
  asset exactly once. Node 20 from the original plan reached end of life on
  2026-03-24, so the implementation deliberately uses supported Node 24 LTS.
- **Verification:** Installed the exact lockfile dependencies with zero known audit
  vulnerabilities; built `_site`; confirmed the three entry assets receive the
  commit-derived version; confirmed runtime config syntax and an empty test key;
  confirmed tracked catalogs and `analytics.js` are copied unchanged; confirmed
  representative inline-handler globals survive minification; and confirmed ignored
  `.DS_Store` files are excluded. The local host is Node 24.10.0; CI confirmation on
  the pinned Node 24.18.0 and browser/visual coverage follow in MIG-003.
- **Rollback:** Revert this commit to restore the previous direct-copy deployment
  commands. No browser data migration is involved.
- **Association:** `codex/migration-01-safety-harness`; PR and release pending.

---

## MIG-003 — Add migration contract and visual regression gates

- **Date:** 2026-07-28
- **Phase:** 1 — Stable baseline and safety harness
- **Type:** Tests, CI, and governance
- **Status:** Implemented and locally verified; hosted CI verification pending
- **Intent:** Detect behavioral, deployment, visual, storage-isolation, global-handler,
  and accidental-network regressions before any application source is reorganized.
- **Conceptual change:** Added a migration-ledger commit policy, a GitHub pull-request
  verification workflow, deterministic normal and sandbox static servers, a
  deny-by-default external-network fixture, stable YouTube/Anki/image fixtures,
  build-output contract tests, browser smoke flows, six viewport projects, and
  checked visual baselines for the first-run trailer, completed dashboard, and open
  Settings state.
- **Preservation contract:** Tests observe the current `v1.0.0` experience; they do
  not redefine it. Automated runs use an empty API key, cannot contact PostHog,
  cannot consume YouTube quota, preserve the exact localhost sandbox origin, and
  retain the classic global-handler contract. Snapshot changes require a dedicated,
  approved migration entry.
- **Risks:** Pixel rendering can vary across operating systems, so snapshots use the
  same pinned Chromium with a one-percent pixel tolerance while retaining stable
  self-hosted fonts. The local normal-mode test used port 4173 because the user's
  existing process owns port 8000; hosted CI uses the canonical port 8000 and
  exercises local feedback submission there. General layout screenshots hide
  transient toasts and the decorative physics canvas to avoid timer/randomness
  flakes; those behaviors require targeted assertions.
- **Verification:** Build-output contracts passed 3 of 3 tests. Playwright passed 18
  of 18 scenarios across 1710×986, 1440×900, 1024×1366, 1366×1024, 390×844, and
  360×800 profiles. Representative desktop, tablet, and phone baselines were
  visually inspected. Fresh first run, classic handler availability, completed
  state, Settings, feedback modal, sandbox isolation, empty runtime configuration,
  console errors, and denied external traffic are covered. The ledger checker
  passed against `v1.0.0`.
- **Rollback:** Revert this commit to remove the harness and CI workflow. It changes
  no application state or production runtime behavior.
- **Association:** `codex/migration-01-safety-harness`; PR and release pending.

---

## MIG-004 — Catalog the complete protected experience

- **Date:** 2026-07-28
- **Phase:** 2 — Complete current-experience inventory
- **Type:** Documentation and preservation contract
- **Status:** Implemented and source-audited; representative browser coverage verified
- **Intent:** Prevent unnamed but currently working desktop, tablet, phone, input,
  theme, locale, state, integration, accessibility, and failure behavior from being
  treated as disposable during code cleanup.
- **Conceptual change:** Added a reviewable preservation catalog whose rows cover the
  application shell, first run, settings, data recovery, header, city, insights,
  history, video feed, channels, playback, walkthroughs, prompts, feedback,
  loading/error/empty states, accessibility, responsive axes, and cross-system risks.
  Every row and every later-discovered behavior is **Keep** by default.
- **Preservation contract:** Omission from the catalog is not permission to change
  behavior. Architectural work may reproduce an experience with different internals
  but may not intentionally change its observable result. A visual or behavioral
  difference requires a later explicitly approved matrix entry.
- **Risks:** The inventory is intentionally broad and primarily source-derived.
  Some dormant DOM targets and README descriptions differ from the active UI; those
  mismatches are recorded as preservation risks rather than silently cleaned up.
- **Verification:** Audited `index.html`, `app.js`, `style.css`, and `README.md`.
  Cross-checked representative first-run, completed dashboard, Settings, and sandbox
  behavior against the phase-1 six-viewport browser and visual baselines. Remaining
  rows retain explicit acceptance obligations.
- **Rollback:** Revert this documentation commit. No application or browser state is
  changed.
- **Association:** `codex/migration-02-preservation-inventory`; PR and release pending.

---

## MIG-005 — Extract the five locale dictionaries

- **Date:** 2026-07-28
- **Phase:** 3 — Translation extraction
- **Type:** Structure, compatibility, and tests
- **Status:** Implemented and locally verified
- **Intent:** Make localization independently maintainable without changing any
  translation, fallback, placeholder, initialization, or rendered behavior.
- **Conceptual change:** Moved the application source entry to `src/app.js`; extracted
  complete English, Traditional Chinese, Simplified Chinese, Spanish, and French
  dictionary modules plus a locale registry; removed the scattered inline dictionary
  and late `Object.assign` blocks; taught the build to bundle the modular source into
  the unchanged classic `app.js` deployment entry; and added translation contracts.
  The transitional bundle disables tree-shaking and fails if import/export syntax
  remains, preserving globals needed by current inline handlers.
- **Preservation contract:** English retains 694 final keys and each non-English
  locale retains 698. All dictionary value hashes and key-order hashes remain exact.
  The four legacy non-English-only keys, seven intentional English fallback keys, six
  documented optional `{plural}` omissions, locale labels/order, browser/stored
  locale initialization, raw-key fallback, `textContent` rendering, and all static
  translation attributes remain unchanged. No copy was edited.
- **Risks:** Bundling modular source could hide or tree-shake classic global handlers;
  the build forbids module syntax in its output, disables tree-shaking, and the
  browser suite enumerates static handler availability. Future translation changes
  must update dictionary contracts deliberately rather than replacing baseline
  hashes casually.
- **Verification:** The mechanical extraction failed closed unless all audited source
  markers, counts, key sets, fallbacks, placeholders, key-order hashes, and dictionary
  hashes matched. Seven of seven build/i18n contracts passed. Playwright passed 19
  scenarios with 5 expected project skips, including all five locales through a
  persisted rendered Settings flow; all 18 existing visual baselines remained
  unchanged across six viewport profiles.
- **Rollback:** Revert this commit to restore the inline dictionaries and root
  application source. No persisted state or runtime configuration migration is
  involved.
- **Association:** `codex/migration-03-i18n-extraction`; PR and release pending.

---

## MIG-006 — Decompose the stylesheet without cascade changes

- **Date:** 2026-07-28
- **Phase:** 4 — Stylesheet decomposition
- **Type:** Structure, compatibility, tests, and documentation
- **Status:** Implemented and locally verified
- **Intent:** Make existing feature styles independently maintainable while preserving
  the exact source order, cascade, asset resolution, breakpoints, and rendered result.
- **Conceptual change:** Split the former root stylesheet at its existing contiguous
  section boundaries into 13 numbered files under `src/styles`; added an explicit
  ordered index and split manifest; moved the complete responsive section unchanged
  into the final `99-responsive-legacy.css` compatibility file; and taught the build
  to concatenate the indexed files before applying the existing CSS transformation.
  The deployed entry remains the root-level `style.css`.
- **Preservation contract:** The concatenated source must remain byte-for-byte equal
  to the protected 223,282-byte stylesheet with SHA-256
  `c295c890a841150c3914976c007498d7f2a8a4d0cfb5d62fcd6d7ca36302e5b7`.
  Selector names, declaration values, specificity, cascade order, asset URLs,
  breakpoints, responsive placement, and every desktop, tablet, and phone pixel are
  unchanged. No deduplication, cascade layer, rename, or cleanup is included.
- **Risks:** Native CSS imports or bundler URL resolution could reinterpret relative
  font and city-image URLs from `src/styles`; the build therefore validates and
  concatenates raw section bytes before minification. A missing, duplicated,
  reordered, or orphaned section could change the cascade.
- **Verification:** Nine of nine build, localization, and stylesheet contracts
  passed. The ordered sections reproduce the protected source hash and the deployed
  minified stylesheet remains byte-identical with SHA-256
  `1fc374493a8d8180e95b011bb43bd223a568b6cd2b16143b4854ff928e4e1743`.
  Playwright passed 19 scenarios with 5 expected locale-project skips, and all 18
  existing visual baselines remained unchanged across the six viewport profiles.
- **Rollback:** Revert this commit to restore the single root source stylesheet and
  previous build input. The deployed filename and browser data are unaffected.
- **Association:** `codex/migration-04-css-decomposition`; PR and release pending.

---

## MIG-007 — Establish explicit legacy action globals

- **Date:** 2026-07-28
- **Phase:** 5 — JavaScript modularization
- **Type:** Compatibility, structure, tests, and documentation
- **Status:** Implemented and locally verified
- **Intent:** Make the current inline-handler compatibility surface explicit before
  moving any application function into a module.
- **Conceptual change:** Added a temporary compatibility module with a fixed manifest
  of all 118 application functions called by static or generated inline event
  attributes. The entry point now installs a frozen `window.EdeniaActions` map
  synchronously before initialization and retains each existing `window.<action>`
  alias. No handler attribute or listener was changed.
- **Preservation contract:** Every inline handler keeps its exact source, invocation
  timing, arguments, return value, propagation behavior, focus behavior, and existing
  analytics action-name fallback. The classic global aliases remain available while
  functions move between source modules.
- **Risks:** An omitted dynamic handler could fail only after a later render; a
  conflicting browser global could be overwritten; or bundling could disconnect an
  alias from its implementation. The installer rejects omissions, unexpected names,
  invalid functions, and conflicting globals instead of silently continuing.
- **Verification:** Twelve of twelve build, localization, stylesheet, handler
  discovery, and bridge contracts passed. The audit found 175 inline attributes
  containing 171 application-action calls and exactly 118 unique functions; the
  manifest matches that set and every runtime alias matches its frozen namespace
  entry. Playwright passed 19 scenarios with 5 expected locale-project skips, and
  all 18 protected visual baselines remained unchanged across six viewport profiles.
- **Rollback:** Revert this commit to return to the previous incidental classic
  global exposure. No markup, persisted state, runtime configuration, or browser data
  is changed.
- **Association:** `codex/migration-05-javascript-modularization`; PR and release pending.

---

## MIG-008 — Extract pure escaping helpers

- **Date:** 2026-07-28
- **Phase:** 5 — JavaScript modularization
- **Type:** Structure and tests
- **Status:** Implemented and locally verified
- **Intent:** Begin reducing the application entry point with dependency-free pure
  helpers whose current behavior can be locked by direct table tests.
- **Conceptual change:** Moved the existing HTML and SVG-text escaping functions into
  `src/core/escaping.js` and imported them into the composition entry point. Call
  sites and generated markup remain unchanged.
- **Preservation contract:** Nullish conversion, number conversion, character sets,
  quote handling, replacement order, and intentional double-escaping remain exact.
  HTML escaping still excludes apostrophes; SVG text escaping still excludes both
  quote types.
- **Risks:** Changing replacement order or broadening the escaped character set could
  alter generated labels, attributes, SVG thumbnails, or snapshots.
- **Verification:** Fourteen of fourteen contracts passed, including direct nullish,
  numeric, quote, ampersand, angle-bracket, and double-escaping cases. Playwright
  passed 19 scenarios with 5 expected locale-project skips, and all 18 protected
  visual baselines remained unchanged across six viewport profiles.
- **Rollback:** Revert this commit to restore the two function declarations in the
  entry point. No persisted state or browser data is changed.
- **Association:** `codex/migration-05-javascript-modularization`; PR and release pending.

---

## MIG-009 — Extract pure local date-key helpers

- **Date:** 2026-07-28
- **Phase:** 5 — JavaScript modularization
- **Type:** Structure and tests
- **Status:** Implemented and locally verified
- **Intent:** Centralize dependency-free calendar arithmetic before state and feature
  modules begin depending on a stable date-key interface.
- **Conceptual change:** Moved local-time cloning, timestamp validation, Monday week
  starts, local date-key formatting, the 04:00 Anki-day boundary, date-key
  conversion, previous-day lookup, signed date differences, and immutable day
  addition into `src/core/date-keys.js`. Both historically distinct day-difference
  functions remain available rather than being consolidated.
- **Preservation contract:** Edenia continues to use local calendar components rather
  than UTC date slicing. Monday/Sunday behavior, the Anki 03:59/04:00 boundary,
  month/year/leap-day rollovers, permissive timestamp validation, clone semantics,
  rounding, function defaults, and all call sites remain unchanged.
- **Risks:** Time-zone conversion or deduplicating the similar difference helpers
  could shift study days, streaks, history ranges, sandbox dates, Anki attribution,
  or city progression.
- **Verification:** Eighteen of eighteen contracts passed, including Monday/Sunday,
  year and leap-day rollover, signed differences, cloning, timestamp validation, and
  the Anki 03:59/04:00 boundary. Across a complete run plus a serial rerun of three
  host-resource interruptions, all 19 Playwright scenarios passed with 5 expected
  locale-project skips and all 18 protected visual baselines unchanged.
- **Rollback:** Revert this commit to restore the constants and function declarations
  in the entry point. No stored date keys or state schema are migrated.
- **Association:** `codex/migration-05-javascript-modularization`; PR and release pending.

---

## MIG-010 — Extract the numeric clamp helper

- **Date:** 2026-07-28
- **Phase:** 5 — JavaScript modularization
- **Type:** Structure and tests
- **Status:** Implemented and locally verified
- **Intent:** Give lower-level domain modules a dependency-free numeric boundary
  helper instead of importing from the monolithic composition entry.
- **Conceptual change:** Moved the existing three-argument numeric clamp into
  `src/core/numbers.js` and imported it at the unchanged call sites.
- **Preservation contract:** JavaScript number coercion, inclusive bounds, inverted
  bound behavior, infinity handling, and `NaN` propagation remain exact.
- **Risks:** Adding validation or changing coercion would affect settings, progress,
  city positioning, drag bounds, player positioning, and watch-coverage clipping.
- **Verification:** Nineteen of nineteen contracts passed, including normal, lower,
  upper, string-coercion, infinity, inverted-bound, and `NaN` cases. A serial
  Playwright run passed 19 scenarios with 5 expected locale-project skips, and all
  18 protected visual baselines remained unchanged across six viewport profiles.
- **Rollback:** Revert this commit to restore the helper declaration in the entry
  point. No browser state is changed.
- **Association:** `codex/migration-05-javascript-modularization`; PR and release pending.

---

## MIG-011 — Extract pure video watch coverage

- **Date:** 2026-07-28
- **Phase:** 5 — JavaScript modularization
- **Type:** Structure and tests
- **Status:** Implemented and locally verified
- **Intent:** Isolate the pure watch-progress and unique-range calculations that
  underpin playback persistence and scoring before moving the player lifecycle.
- **Conceptual change:** Moved timestamped progress-entry normalization into
  `src/domain/video-watch-progress.js`, and moved watched-range normalization,
  unique watched-seconds totals, and range addition together into
  `src/domain/video-watch-coverage.js`. Both modules import only their required
  timestamp-validation or numeric-clamping primitives from core.
- **Preservation contract:** Timestamp filtering, seconds flooring, duration
  clipping, three-decimal range rounding, sort order, overlap/touch/0.001-second
  merge tolerance, invalid-range removal, input immutability, and unique-seconds
  totals remain exact. No scoring threshold or player lifecycle behavior changes.
- **Risks:** A range merge or duration-boundary change could over-credit or
  under-credit watched time, alter rewatch scoring, or corrupt resume persistence.
- **Verification:** Twenty-five of twenty-five contracts passed, including invalid
  progress entries, timestamp ordering, duration clipping, three-decimal rounding,
  nested and touching ranges, the 0.001-second tolerance, unique totals, numeric
  duration coercion, frozen inputs, and the legacy validation/rounding order. A
  serial Playwright run passed 19 scenarios with 5 expected locale-project skips,
  and all 18 protected visual baselines remained unchanged.
- **Rollback:** Revert this commit to restore the four pure functions in the entry
  point. Existing stored progress and coverage data require no migration.
- **Association:** `codex/migration-05-javascript-modularization`; PR and release pending.

---

## MIG-012 — Extract pure YouTube parsing

- **Date:** 2026-07-28
- **Phase:** 5 — JavaScript modularization
- **Type:** Structure and tests
- **Status:** Implemented and locally verified
- **Intent:** Separate deterministic YouTube identifiers, URLs, durations, aspect
  ratios, upload-playlist derivation, and thumbnail selection from network and state
  orchestration.
- **Conceptual change:** Moved the browser app's channel-ID and Unicode-handle
  rules plus its pure channel/video input, ISO-like duration, short-duration,
  video-detail, aspect-ratio, uploads-playlist, thumbnail, and stored-video-ID
  helpers into
  `src/integrations/youtube-parsing.js`. Existing entry-point names are retained
  through import aliases; no fetch function moved.
- **Preservation contract:** The browser's deliberately permissive 20-or-more
  channel-ID suffix remains distinct from stricter catalog scripts. Unicode handle
  rules, supported hosts and path shapes, scheme inference, decode fallback, custom
  channel classification, eleven-character video IDs, permissive raw fallback
  matching, duration regex behavior, strict-below-180 Shorts boundary, ratio bounds,
  duration-only Short classification, and thumbnail precedence remain exact.
- **Risks:** Tightening validation or unifying catalog and browser regexes could
  reject currently accepted channels, handles, or pasted videos. Host or path
  changes could alter manual-add and search routing.
- **Verification:** Twenty-nine of twenty-nine contracts passed, including
  permissive channel IDs, Unicode handles, duration quirks, Shorts boundaries,
  aspect-ratio coercion, thumbnail fallback, supported and rejected channel paths,
  all video URL forms, false-positive fallback hosts, and legacy 12-character ID
  truncation. A serial Playwright run passed 19 scenarios with 5 expected
  locale-project skips, and all 18 protected visual baselines remained unchanged.
- **Rollback:** Revert this commit to restore the parsing constants and functions in
  the entry point. Network behavior and stored state require no migration.
- **Association:** `codex/migration-05-javascript-modularization`; PR and release pending.

---

## MIG-013 — Establish the translation runtime interface

- **Date:** 2026-07-28
- **Phase:** 5 — JavaScript modularization
- **Type:** Structure, compatibility, and tests
- **Status:** Implemented and locally verified
- **Intent:** Put mutable locale selection, fallback translation, interpolation, and
  locale-aware date formatting behind one interface while leaving UI ownership in
  the entry point.
- **Conceptual change:** Added `src/i18n/runtime.js` to own the current locale and
  expose normalization, browser-default selection, labels, translation,
  interpolation, missing-key discovery, and date/date-time formatting. DOM
  translation application and the three locale menus remain in the entry point and
  read the runtime through explicit getters and setters.
- **Preservation contract:** Locale ordering and labels, Chinese region/script
  mappings, language-prefix handling, English fallback, raw-key fallback,
  word-placeholder substitution, missing-placeholder retention, `textContent` and
  attribute rendering, document `lang`, browser-default precedence, Intl formatting,
  and exact translation dictionaries remain unchanged.
- **Risks:** A stale copied locale value could desynchronize rendered text, number
  formatting, feedback metadata, or saved configuration. Moving DOM rendering into
  the runtime could introduce circular feature dependencies, so it remains outside.
- **Verification:** Thirty-two of thirty-two contracts passed, including exact
  dictionary hashes, fallback and placeholder rules, locale normalization,
  navigator precedence, mutable runtime selection, labels, interpolation, invalid
  dates, and Intl-equivalent formatting. A serial Playwright run passed 19 scenarios
  with 5 expected project skips, exercised all five locales through rendered
  Settings, and retained all 18 protected visual baselines.
- **Rollback:** Revert this commit to restore the locale state and functions in the
  entry point. Locale storage and dictionary modules require no migration.
- **Association:** `codex/migration-05-javascript-modularization`; PR and release pending.

---

## MIG-014 — Lock translation runtime edge behavior

- **Date:** 2026-07-28
- **Phase:** 5 — JavaScript modularization
- **Type:** Tests and documentation
- **Status:** Implemented and locally verified
- **Intent:** Preserve unusual but existing locale and interpolation edges that a
  future cleanup could otherwise change unintentionally.
- **Conceptual change:** Added direct contracts for trimmed and null locale inputs,
  the current `zh-Hant-TW` fallback, repeated placeholders, inherited parameter
  properties, and the runtime's nullish localized-value fallback to English;
  documented that production locale mutation belongs to the entry point's
  DOM-synchronizing `applyLocale` composition boundary. The earlier sandbox-key
  assertion covers English values materialized into localized dictionaries, while
  the new nullish-value case exercises the runtime fallback branch itself.
- **Preservation contract:** `zh-Hant-TW` continues to fall back to English unless a
  separately approved behavior change expands normalization. Only own properties
  substitute placeholders, repeated placeholders all substitute, and direct runtime
  mutation does not become a feature-level API.
- **Risks:** Treating broader Chinese tags as equivalent or using property lookup
  without `hasOwnProperty` would change current locale and interpolation behavior.
- **Verification:** Thirty-two of thirty-two translation, build, handler, style, and
  domain contracts passed, including each newly locked edge. A serial Playwright run
  passed 19 scenarios with 5 expected project skips and retained all 18 protected
  visual baselines. Production logic is unchanged; only a boundary comment and test
  coverage were added.
- **Rollback:** Revert this test-and-documentation commit. Production output and
  browser data are unchanged.
- **Association:** `codex/migration-05-javascript-modularization`; PR and release pending.

---

## MIG-015 — Extract runtime environment and storage isolation

- **Date:** 2026-07-28
- **Phase:** 5 — JavaScript modularization
- **Type:** Structure, compatibility, and tests
- **Status:** Implemented and locally verified
- **Intent:** Make deployment-mode, storage-domain, and runtime-config contracts
  explicit and independently testable before state persistence moves.
- **Conceptual change:** Added pure factories for the one-time location snapshot and
  storage/cookie/session key derivation, called once by the entry point during module
  evaluation. Added a separate late-bound runtime-config interface that reads
  `window.EDENIA_CONFIG` and its YouTube key on every call. Cookie, storage, backup,
  import/export, and state logic remain in the entry point.
- **Preservation contract:** Sandbox still requires exact origin
  `http://localhost:8001` plus the first `sandbox=1` value. Internal-test, localhost,
  and local-feedback detection, sandbox-over-internal storage precedence, all
  primary and suffixed keys, the combined sandbox/internal notice key, config
  cookie domains, runtime config load order, string coercion, trimming, falsey
  handling, and late reassignment behavior remain exact.
- **Risks:** Broader localhost detection could enter sandbox accidentally; changed
  precedence could mix normal, internal, or sandbox data; eager config capture could
  miss `config.local.js` or a later replacement.
- **Verification:** Thirty-five of thirty-five contracts passed, including exact
  origins, hosts, query values and precedence, all four storage-mode combinations,
  every derived suffix, late config replacement, coercion, and propagated getter
  errors. A serial Playwright run passed 19 scenarios with 5 expected project skips,
  covered normal and exact-origin sandbox storage, and retained all 18 protected
  visual baselines.
- **Rollback:** Revert this commit to restore inline environment constants, key
  derivation, and runtime-config accessors. No keys or stored data are migrated.
- **Association:** `codex/migration-05-javascript-modularization`; PR and release pending.

---

## MIG-016 — Route analytics globals through a late-bound bridge

- **Date:** 2026-07-28
- **Phase:** 5 — JavaScript modularization
- **Type:** Structure, compatibility, and tests
- **Status:** Implemented and locally verified
- **Intent:** Remove direct analytics-global coupling from product logic without
  changing the separately loaded analytics entry, event payloads, or ordering.
- **Conceptual change:** Added `src/integrations/analytics-bridge.js` with transparent
  call-time access to enablement, state sync, event capture, person properties,
  session replay, and the temporary PostHog distinct-ID lookup. Product call sites
  now route through the bridge; root `analytics.js`, script order, snapshot
  construction, caller-side guards, and caller-side error handling remain in place.
- **Preservation contract:** All event names, argument counts, properties, return
  values, receiver binding, exceptions, feedback success handling, replay `|| null`,
  sandbox/internal separation, temporary Shorts whitelist, state-sync lazy snapshot,
  and sync-only `try/catch` behavior remain exact. Globals are looked up on every
  call and may still be installed or replaced after module evaluation.
- **Risks:** Capturing globals eagerly, losing `window`/PostHog receivers, adding an
  explicit `undefined` argument, normalizing falsey returns, or moving error handling
  could silently alter analytics or product behavior.
- **Verification:** `npm test` passed all 38 contract tests, including absent,
  replaced, receiver-sensitive, return-value, argument-count, and error-propagation
  cases. The app call-site audit found no remaining direct Edenia analytics or
  PostHog access in `src/app.js`. The serial Playwright suite passed 19 flows with
  5 expected project-scoped skips across all six required viewports; all 18
  protected screenshots remained unchanged. Migration-ledger verification follows
  the commit.
- **Rollback:** Revert this commit to restore direct optional calls to analytics
  globals. Analytics storage and application state require no migration.
- **Association:** `codex/migration-05-javascript-modularization`; PR and release pending.

---

## MIG-017 — Extract state configuration normalizers

- **Date:** 2026-07-28
- **Phase:** 5 — JavaScript modularization
- **Type:** Structure and tests
- **Status:** Implemented and locally verified
- **Intent:** Establish the first state-domain module with deterministic,
  behavior-preserving configuration normalization.
- **Conceptual change:** Moved the default theme and the pure theme, weekly-goal,
  Shorts, Anki-enabled, and Anki-count normalizers from `src/app.js` to
  `src/state/config-normalization.js`. Existing consumers import the same
  operations; persistence orchestration and state mutation remain in the entry
  point.
- **Preservation contract:** Strict theme membership, `parseInt(..., 10)` goal
  semantics, the `4`-hour fallback, `1…99` clamping, default-on booleans that only
  literal `false` disables, Anki numeric coercion and flooring, propagated coercion
  errors, and the existing `Infinity` result remain exact. Storage schema, cleanup
  order, backups, analytics sync, and every call-site decision are unchanged.
- **Risks:** Conventional boolean coercion, finite-number cleanup, or changing goal
  parsing would alter stored preference interpretation even though those alternatives
  may appear cleaner.
- **Verification:** `npm test` passed all 42 contracts, including focused coercion,
  strict-membership, fallback, clamping, default-on, and infinity cases. The serial
  Playwright suite passed 19 flows with 5 expected project-scoped skips across all
  six required viewports; all 18 protected screenshots remained unchanged.
  Migration-ledger verification follows the commit.
- **Rollback:** Revert this commit to restore the constants and five pure functions
  inline in `src/app.js`; stored data requires no migration.
- **Association:** `codex/migration-05-javascript-modularization`; PR and release pending.

---

## MIG-018 — Extract persistence boundary contracts

- **Date:** 2026-07-28
- **Phase:** 5 — JavaScript modularization
- **Type:** Structure and tests
- **Status:** Implemented and locally verified
- **Intent:** Isolate two pure persistence-boundary rules before any storage or
  backup orchestration moves.
- **Conceptual change:** Moved config-cookie field filtering and the minimum
  import/backup state-shape predicate to `src/state/persistence-contract.js`.
  Cookie access, local-storage access, backup ordering, import/export merging,
  recovery, retry, and analytics synchronization remain in `src/app.js`.
- **Preservation contract:** Cookie sanitization removes exactly `apiKey`,
  `ankiDisabledAt`, `ankiResumeBaselines`, and `ankiPendingResumeBaseline`, keeps
  all other fields and shallow references, and preserves default-argument and
  exception behavior. State validation still requires object-like config plus
  non-array object-like `videos` and `anki`, without adding schema checks.
- **Risks:** Deep cloning cookie config, rejecting config arrays, validating more
  fields, or swallowing property-access errors would change compatibility with
  previously accepted state.
- **Verification:** `npm test` passed all 45 contracts, including exact field
  filtering, shallow-reference retention, permissive shape acceptance, and
  propagated property-access errors. The serial Playwright suite passed 19 flows
  with 5 expected project-scoped skips across all six required viewports; all 18
  protected screenshots remained unchanged. Migration-ledger verification follows
  the commit.
- **Rollback:** Revert this commit to restore both pure predicates inline; cookies,
  backups, and stored state require no migration.
- **Association:** `codex/migration-05-javascript-modularization`; PR and release pending.

---

## MIG-019 — Extract Undo and Redo state normalization

- **Date:** 2026-07-28
- **Phase:** 5 — JavaScript modularization
- **Type:** Structure and tests
- **Status:** Implemented and locally verified
- **Intent:** Make the persisted action-history boundary independently testable
  before history controls or state-store orchestration move.
- **Conceptual change:** Moved the six supported action types, the 50-entry limit,
  and `normalizeUndoState` to `src/state/action-history.js`. Action creation,
  application, UI rendering, persistence, and analytics stay in `src/app.js`.
- **Preservation contract:** Invalid stacks are reset, legacy `lastUndo` is promoted
  only when it is a `video-status` action and Undo is empty, unsupported entries
  are filtered before the newest 50 are retained, Redo follows the same limit,
  retained action objects keep their identity, `lastUndo` is always removed, and
  mutation errors still propagate.
- **Risks:** Changing the allowlist, promotion condition, filter-before-slice order,
  or stack direction would alter which actions remain undoable after loading.
- **Verification:** `npm test` passed all 49 contracts, including allowlist order,
  legacy promotion, invalid-stack repair, filter-before-slice behavior, retained
  object identity, and propagated mutation errors. The serial Playwright suite
  passed 19 flows with 5 expected project-scoped skips across all six required
  viewports; all 18 protected screenshots remained unchanged. Migration-ledger
  verification follows the commit.
- **Rollback:** Revert this commit to restore action-history constants and
  normalization inline; existing Undo/Redo stacks require no migration.
- **Association:** `codex/migration-05-javascript-modularization`; PR and release pending.

---

## MIG-020 — Extract onboarding state normalization

- **Date:** 2026-07-28
- **Phase:** 5 — JavaScript modularization
- **Type:** Structure and tests
- **Status:** Implemented and locally verified
- **Intent:** Separate the persisted onboarding schema cleanup from its rendering,
  navigation, and completion side effects.
- **Conceptual change:** Moved onboarding schema version `2` and
  `normalizeOnboardingState` to `src/state/onboarding-state.js`. Trailer, setup,
  walkthrough, recovery, locale, persistence, and analytics logic remain in
  `src/app.js`.
- **Preservation contract:** Legacy `completed` still promotes both setup and
  walkthrough completion; explicit valid timestamps retain precedence; legacy
  `completedAt` remains the fallback; `introSeenAt` falls back to setup completion;
  orphan timestamps are removed when incomplete; any integer version is retained;
  and change detection still uses the normalized serialized shape.
- **Risks:** Treating old completion flags differently, tightening accepted version
  values, or preserving orphan dates would alter first-run and walkthrough routing
  for existing users.
- **Verification:** `npm test` passed all 54 contracts, including legacy completion,
  timestamp precedence and fallback, orphan-date removal, version retention,
  serialized change detection, and propagated mutation errors. The serial Playwright
  suite passed 19 flows with 5 expected project-scoped skips across all six required
  viewports; all 18 protected screenshots remained unchanged. Migration-ledger
  verification follows the commit.
- **Rollback:** Revert this commit to restore onboarding version and normalization
  inline; onboarding records require no migration.
- **Association:** `codex/migration-05-javascript-modularization`; PR and release pending.

---

## MIG-021 — Extract channel refresh state normalization

- **Date:** 2026-07-28
- **Phase:** 5 — JavaScript modularization
- **Type:** Structure and tests
- **Status:** Implemented and locally verified
- **Intent:** Isolate persisted per-channel refresh cleanup before YouTube fetching
  or refresh orchestration is modularized.
- **Conceptual change:** Moved `normalizeChannelRefreshState` to
  `src/state/channel-refresh-state.js`. Fetch scheduling, network calls, backoff,
  activity logs, rendering, and analytics remain in `src/app.js`.
- **Preservation contract:** Only configured truthy channel IDs remain; duplicates
  collapse in first-seen order; valid per-channel timestamps take precedence;
  legacy `lastFetched` fills missing fetch dates and is then removed; an existing
  entry without a valid fetch date remains as an all-null record; error strings,
  including empty strings, are retained; and serialized change detection remains
  exact.
- **Risks:** Dropping empty existing entries, retaining removed channels, converting
  timestamps, or changing legacy fallback precedence would alter refresh backoff and
  retry behavior for persisted users.
- **Verification:** `npm test` passed all 58 contracts, including legacy migration,
  active-channel filtering, duplicate collapse, timestamp precedence, null-entry
  retention, stale-channel removal, unchanged reporting for invalid source maps,
  and propagated malformed-channel errors. The serial Playwright suite passed
  19 flows with 5 expected project-scoped skips across all six required viewports;
  all 18 protected screenshots remained unchanged. Migration-ledger verification
  follows the commit.
- **Rollback:** Revert this commit to restore channel-refresh cleanup inline;
  persisted refresh records require no migration.
- **Association:** `codex/migration-05-javascript-modularization`; PR and release pending.

---

## MIG-022 — Extract Anki state bookkeeping

- **Date:** 2026-07-28
- **Phase:** 5 — JavaScript modularization
- **Type:** Structure and tests
- **Status:** Implemented and locally verified
- **Intent:** Separate persisted Anki preference and baseline bookkeeping from
  device capability, AnkiConnect, scoring, and presentation.
- **Conceptual change:** Added `src/state/anki-state.js` for enabled-state lookup,
  tracked-count normalization, config cleanup, resume and pending baselines, and
  04:00-boundary key repair. Network refresh, device checks, settings UI, activity
  logs, analytics, and scoring remain in `src/app.js`.
- **Preservation contract:** Anki remains default-on unless exactly `false`; tracked
  counts retain current coercion; normalizing a non-boolean enabled value still
  mutates without necessarily reporting a change; disable timestamps are created
  or cleared in the same order; baseline objects and pending records retain the
  same permissive shapes; matching pending baselines clear; and AnkiConnect date
  re-keying keeps max counts, newer timestamps, and existing source precedence.
- **Risks:** “Fixing” change reporting, normalizing explicit timestamps, tightening
  baseline validation, or changing merge precedence could affect automatic cleanup,
  resumed tracking, and daily scoring.
- **Verification:** `npm test` passed all 64 contracts, including default-on
  enablement, count coercion, mutation/change-reporting order, disable timestamps,
  resume and pending baselines, 04:00 re-keying, merge maxima, timestamp/source
  precedence, and malformed-state handling. The serial Playwright suite passed
  19 flows with 5 expected project-scoped skips across all six required viewports;
  all 18 protected screenshots remained unchanged. Migration-ledger verification
  follows the commit.
- **Rollback:** Revert this commit to restore the Anki state helpers inline; no
  stored preferences, counts, or baselines require migration.
- **Association:** `codex/migration-05-javascript-modularization`; PR and release pending.

---

## MIG-023 — Extract Study Insights state normalization

- **Date:** 2026-07-28
- **Phase:** 5 — JavaScript modularization
- **Type:** Structure and tests
- **Status:** Implemented and locally verified
- **Intent:** Separate the persisted Study Insights history contract from insight
  calculation, rendering, localization, and analytics delivery.
- **Conceptual change:** Added `src/state/study-insights-state.js` for enablement,
  the shared lookback/time-window/variant constants, and exact history
  normalization. Insight generation and selection, presentation, persistence,
  retained-message analytics, and settings interactions remain in `src/app.js`.
- **Preservation contract:** The 42-day lookback, four time windows, two variants,
  eleven accepted insight types, 12-entry limit, filtering, timestamp sorting,
  normalized-key dedupe, legacy variant rotation, all numeric clipping and rounding,
  string limits, five-channel positive-seconds breakdown, default-on enablement,
  collapsed semantics, and serialized change detection remain exact.
- **Risks:** Reordering dedupe and sort, validating before current coercion, changing
  the legacy variant counter, or cleaning permissive numeric/string inputs would
  change retained insight messages and their analytics identity.
- **Verification:** `npm test` passed all 69 contracts, including constants,
  enablement, defaults, coercion, numeric clipping, string/channel limits,
  timestamp sorting, normalized-key dedupe, legacy variant rotation, history
  limiting, and mutation failures. The serial Playwright suite passed 19 flows
  with 5 expected project-scoped skips across all six required viewports; all 18
  protected screenshots remained unchanged. Migration-ledger verification follows
  the commit.
- **Rollback:** Revert this commit to restore Study Insights constants and state
  normalization inline; retained history requires no migration.
- **Association:** `codex/migration-05-javascript-modularization`; PR and release pending.

---

## MIG-024 — Extract activity-log state operations

- **Date:** 2026-07-28
- **Phase:** 5 — JavaScript modularization
- **Type:** Structure and tests
- **Status:** Implemented and locally verified
- **Intent:** Separate activity-log normalization and append semantics from Settings
  rendering, pagination, storage, and feature-specific log producers.
- **Conceptual change:** Added `src/state/activity-log.js` for ID generation, entry
  normalization, newest-first limiting, and duplicate suppression. All callers,
  Settings UI, grouping, pagination, import/export, and persistence remain in
  `src/app.js`.
- **Preservation contract:** IDs keep their base-36 time/random format; logs retain
  the newest 500 records; invalid fields use the same translated/default values;
  metadata object references are retained; sorting remains timestamp-descending;
  dedupe still compares only type, status, and detail within strictly less than
  30 minutes; and a future matching record continues to suppress an older append.
- **Risks:** Expanding dedupe identity, using absolute time differences, deep-cloning
  metadata, or altering fallback localization would change visible history and
  feature logging behavior.
- **Verification:** `npm test` passed all 74 contracts, including ID shape,
  translated/default fields, metadata identity, timestamp ordering, 500-entry
  limiting, strict 30-minute boundary, dedupe identity, future-record behavior,
  and mutation failures. The serial Playwright suite passed 19 flows with 5
  expected project-scoped skips across all six required viewports; all 18 protected
  screenshots remained unchanged. Migration-ledger verification follows the commit.
- **Rollback:** Revert this commit to restore activity-log constants and operations
  inline; existing log entries require no migration.
- **Association:** `codex/migration-05-javascript-modularization`; PR and release pending.

---

## MIG-025 — Extract frequent-user Anki prompt state

- **Date:** 2026-07-28
- **Phase:** 5 — JavaScript modularization
- **Type:** Structure and tests
- **Status:** Implemented and locally verified
- **Intent:** Separate the persisted watched-day evidence for the frequent-user
  Anki prompt from prompt presentation and device eligibility.
- **Conceptual change:** Added `src/state/anki-prompt-state.js` for profile-date
  selection, strict local date-key validation, watched-date reconstruction and
  recording, response cleanup, and detection of post-signup Anki data. Prompt
  thresholds, sandbox/device eligibility, UI, walkthrough hooks, persistence, and
  analytics remain in `src/app.js`.
- **Preservation contract:** Onboarding completion remains the preferred profile
  timestamp; learner creation remains the fallback; stored, video, and watched
  activity dates merge only on or after signup; keys stay unique and sorted;
  only `yes` and `not-interested` are retained; response timestamps remain coupled
  to a valid response; repeated watched days dedupe; and Anki evidence continues
  to prefer valid `loggedAt` before falling back to the date key.
- **Risks:** Changing timestamp precedence, timezone-local key construction,
  accepting looser date strings, or requiring positive Anki counts would alter who
  sees the prompt and when.
- **Verification:** `npm test` passed all 80 contracts, including profile-date
  precedence, strict real-date validation, multi-source watched-date rebuilding,
  signup filtering, response/timestamp coupling, record dedupe and sorting, and
  logged-time versus date-key Anki evidence. The serial Playwright suite passed
  19 flows with 5 expected project-scoped skips across all six required viewports;
  all 18 protected screenshots remained unchanged. Migration-ledger verification
  follows the commit.
- **Rollback:** Revert this commit to restore frequent-user prompt state helpers
  inline; prompt responses and watched-date evidence require no migration.
- **Association:** `codex/migration-05-javascript-modularization`; PR and release pending.

---

## MIG-026 — Establish learner-profile schema interface

- **Date:** 2026-07-28
- **Phase:** 5 — JavaScript modularization
- **Type:** Structure, interface, and tests
- **Status:** Implemented and locally verified
- **Intent:** Separate learner-profile state cleanup while leaving product-owned
  language, level, and curated-channel catalogs unchanged.
- **Conceptual change:** Added `src/state/learner-profile-state.js` with a normalizer
  factory that receives the existing three catalogs. `src/app.js` composes that
  interface once and retains all onboarding choices, recommendation logic, catalog
  data, rendering, persistence, and analytics.
- **Preservation contract:** Allowed IDs are rebuilt from the live catalog arrays
  on every normalization; language and selected-channel IDs retain first-seen order
  while duplicates and unknown IDs are removed; level uses strict membership;
  timestamps retain valid original values; invalid profile shapes become the same
  empty schema; and serialized change detection remains exact.
- **Risks:** Capturing ID sets eagerly, sorting selections, accepting community
  catalog IDs, or normalizing timestamps would alter onboarding restoration and
  channel ordering.
- **Verification:** `npm test` passed all 84 contracts, including filtering,
  first-seen dedupe order, strict level membership, timestamp retention, empty
  defaults, live catalog re-reading, malformed-catalog errors, and mutation
  failures. The serial Playwright suite passed 19 flows with 5 expected
  project-scoped skips across all six required viewports; all 18 protected
  screenshots remained unchanged. Migration-ledger verification follows the commit.
- **Rollback:** Revert this commit to restore learner-profile normalization inline;
  learner choices require no migration.
- **Association:** `codex/migration-05-javascript-modularization`; PR and release pending.

---

## MIG-027 — Extract default state construction

- **Date:** 2026-07-28
- **Phase:** 5 — JavaScript modularization
- **Type:** Structure, interface, and tests
- **Status:** Implemented and locally verified
- **Intent:** Make Edenia's initial persisted schema and history-view fallback
  explicit before storage orchestration is moved.
- **Conceptual change:** Added `src/state/default-state.js` with pure history-view
  helpers and a default-state factory composed from the existing default channels,
  schema versions, sandbox flag, default-channel predicate, and browser-locale
  provider. All creation call sites continue to invoke `defaultState` with the same
  arguments.
- **Preservation contract:** The complete state shape and field defaults, normal
  `summary` versus sandbox `heatmap`, goal/theme/locale normalization, explicit
  channel-list precedence, shallow per-channel copies, retained nested references,
  duplicate-preserving removed-default filtering, independent mutable containers,
  and browser-locale lookup only for falsey explicit locale values remain exact.
- **Risks:** Deep cloning channels, sharing default containers, sorting or deduping
  removed IDs, eagerly reading browser locale, or changing the sandbox history
  fallback would alter new, restored, or reset profiles.
- **Verification:** `npm test` passed all 88 contracts, including both history
  defaults, the complete normal schema, explicit normalization, sandbox mode,
  shallow channel copying, duplicate-preserving filtering, lazy browser-locale
  lookup, and mutable-container independence. The serial Playwright suite passed
  19 flows with 5 expected project-scoped skips across all six required viewports;
  all 18 protected screenshots remained unchanged. Migration-ledger verification
  follows the commit.
- **Rollback:** Revert this commit to restore history-view helpers and default-state
  construction inline; persisted state requires no migration.
- **Association:** `codex/migration-05-javascript-modularization`; PR and release pending.

---

## MIG-028 — Establish explicit state-store interface

- **Date:** 2026-07-28
- **Phase:** 5 — JavaScript modularization
- **Type:** Structure, interface, persistence, and tests
- **Status:** Implemented and locally verified
- **Intent:** Isolate local-storage read, write, retry, recovery, and probe flow while
  retaining all Edenia-specific schema policy in explicit callbacks.
- **Conceptual change:** Added `src/state/store.js` and composed it with the existing
  storage key, loaded-state cleanup sequence, pre-save normalization sequence,
  backup functions, config cookie, analytics sync, recovery, and default-state
  factory. `src/app.js` now exposes those policy callbacks rather than performing
  storage I/O directly.
- **Preservation contract:** Load parsing and normalization remain in one recovery
  boundary; automatic cleanup still creates a forced pre-cleanup backup; backup
  recovery precedes cookie fallback; pre-save normalizers run before backup;
  writes retry exactly once after pruning one backup; config cookies are attempted
  after both successful and failed writes; analytics sync occurs only after a
  successful write when enabled by the caller; save normalization and backup
  failures still propagate; and the exact storage probe key is always removed when
  possible.
- **Risks:** Moving error boundaries, retrying more often, syncing before persistence,
  or changing backup/cookie order could corrupt recovery expectations or analytics
  state without an obvious visual regression.
- **Verification:** `npm test` passed all 97 contracts, including no-op and
  cleanup loads, forced backup ordering, parse/normalization recovery, cookie/null
  fallback, default and suppressed save options, single-prune retry, failed-write
  cookie behavior, propagated pre-save failures, and probe cleanup. The serial
  Playwright suite passed 19 flows with 5 expected project-scoped skips across all
  six required viewports; all 18 protected screenshots remained unchanged.
  Migration-ledger verification follows the commit.
- **Rollback:** Revert this commit to restore direct `loadState`, `saveState`, and
  storage-probe implementations; storage keys and persisted data require no
  migration.
- **Association:** `codex/migration-05-javascript-modularization`; PR and release pending.

---

## MIG-029 — Extract state-backup storage

- **Date:** 2026-07-28
- **Phase:** 5 — JavaScript modularization
- **Type:** Structure, persistence, recovery, and tests
- **Status:** Implemented and locally verified
- **Intent:** Separate backup retention and quota behavior from Edenia's definition
  of a backup-safe state.
- **Conceptual change:** Added `src/state/backups.js` and composed it with the
  existing storage keys, sandbox snapshot, minimum state-shape predicate, and
  `prepareStateForBackup` callback. Backup-safe import/export shaping, restore UI,
  reset/import callers, and the primary state store remain otherwise unchanged.
- **Preservation contract:** At most eight valid backups are returned newest-first;
  quota failures remove one oldest candidate per retry and remove the backup key
  when none fit; pruning removes exactly the oldest retained entry; source state
  is read from the primary key and prepared before comparison; automatic backups
  throttle for strictly less than ten minutes unless forced; identical latest
  states are skipped; IDs, timestamps, reason, sandbox flag, and re-preparation on
  recovery remain exact.
- **Risks:** Changing preparation timing, throttle inequality, JSON comparison,
  retention order, or quota degradation could silently weaken rollback and restore
  behavior.
- **Verification:** `npm test` passed all 105 contracts, including filtering,
  newest-first limiting, quota degradation, empty-key removal, oldest pruning,
  source parsing and preparation, metadata, sandbox flag, strict throttle,
  force override, state dedupe, named backups, and recovery re-preparation. The
  serial Playwright suite passed 19 flows with 5 expected project-scoped skips
  across all six required viewports; all 18 protected screenshots remained
  unchanged. Migration-ledger verification follows the commit.
- **Rollback:** Revert this commit to restore backup storage functions inline;
  primary state and existing backup entries require no migration.
- **Association:** `codex/migration-05-javascript-modularization`; PR and release pending.

---

## MIG-030 — Extract onboarding option catalogs

- **Date:** 2026-07-28
- **Phase:** 5 — JavaScript modularization
- **Type:** Structure, product configuration, and tests
- **Status:** Implemented and locally verified
- **Intent:** Move immutable onboarding product options out of the composition entry
  without changing their content or consumers.
- **Conceptual change:** Added `src/features/onboarding/options.js` for the eight
  learner-language options, five level options, and fifteen channel-style
  translation-key mappings. Onboarding state, recommendation logic, rendering,
  selections, ordering, localization, persistence, and analytics are unchanged.
- **Preservation contract:** Every ID, array/object order, label, short label, icon,
  detail sentence, style name, translation key, capitalization, punctuation, and
  Unicode character remains exact. Exported arrays and objects retain normal
  mutable JavaScript semantics.
- **Risks:** Reordering options, normalizing style names, or editing seemingly
  redundant English copy would change selection order, recommendation inputs, or
  localized lookup.
- **Verification:** `npm test` passed all 108 contracts, including exact deep
  equality for all language options, level options, and style translation-key
  mappings. The serial Playwright suite passed 19 flows with 5 expected
  project-scoped skips across all six required viewports; all 18 protected
  screenshots remained unchanged. Migration-ledger verification follows the commit.
- **Rollback:** Revert this commit to restore the three constants inline; learner
  profiles and translations require no migration.
- **Association:** `codex/migration-05-javascript-modularization`; PR and release pending.

---

## MIG-031 — Extract curated channel catalog

- **Date:** 2026-07-28
- **Phase:** 5 — JavaScript modularization
- **Type:** Structure, product data, and tests
- **Status:** Implemented and locally verified
- **Intent:** Move the large immutable curated-channel dataset and its search
  metadata out of the composition entry without changing any product content.
- **Conceptual change:** Mechanically moved the base catalog, level overrides,
  expanded catalog tuples and derivation, final curated catalog, language aliases,
  ignored search words, and not-sure starter IDs to
  `src/features/channels/curated-catalog.js`. Dynamic community/discovery catalogs,
  loading, search, recommendations, selection, ordering, and rendering remain in
  `src/app.js`.
- **Preservation contract:** All 213 unique channel entries retain exact membership,
  order, IDs, language, input, name, level override, style, and optional fields.
  Alias keys/values, Set insertion order for all 16 ignored words, starter-language
  keys, and starter channel ordering remain byte-for-byte derived from the prior
  source block. The exported arrays, objects, and Set remain mutable.
- **Risks:** Reordering tuples, applying overrides at a different stage, deduping
  catalog entries, or sorting metadata would alter recommendations, onboarding
  order, search ranking, and persisted catalog IDs.
- **Verification:** `npm test` passed all 110 contracts, including the exact
  213-entry count, unique IDs, locked full-catalog hash, first and last records,
  alias hash, 16-word Set order/hash, and starter-ID hash. The serial Playwright
  suite passed 19 flows with 5 expected project-scoped skips across all six
  required viewports; all 18 protected screenshots remained unchanged.
  Migration-ledger verification follows the commit.
- **Rollback:** Revert this commit to restore the mechanically moved data block
  inline; channels and learner profiles require no migration.
- **Association:** `codex/migration-05-javascript-modularization`; PR and release pending.

---

## MIG-032 — Extract static walkthrough steps

- **Date:** 2026-07-28
- **Phase:** 5 — JavaScript modularization
- **Type:** Structure, feature configuration, and tests
- **Status:** Implemented and locally verified
- **Intent:** Move data-only walkthrough definitions out of the composition entry
  while keeping callback-bearing and runtime behavior local.
- **Conceptual change:** Added `src/features/walkthrough/steps.js` for the main
  walkthrough, first-study walkthrough, Other-language extra step, and level-up
  confirmation step. The frequent-user Anki step remains in `src/app.js` because
  it carries direct callbacks. Hook implementations, step filtering, geometry,
  rendering, focus, scroll, navigation, persistence, and analytics are unchanged.
- **Preservation contract:** Step and object order, IDs, selectors, mobile target
  and copy key, text keys, placements, scroll target, spotlight padding/radius/
  height fields, action label, confirmation flag, and hook-name strings remain
  exact. Exports retain normal mutable array/object behavior.
- **Risks:** Reordering steps, changing selectors, or “cleaning up” geometry and
  hook names would alter walkthrough availability, focus, or responsive placement.
- **Verification:** `npm test` passed all 113 contract tests and the production
  build. Playwright passed 19 protected browser flows with five expected
  project-specific skips; all 18 visual baselines remained unchanged. The
  migration-ledger check is included in this commit gate.
- **Rollback:** Revert this commit to restore the four static step constants inline;
  onboarding/walkthrough state requires no migration.
- **Association:** `codex/migration-05-javascript-modularization`; PR and release pending.

---

## MIG-033 — Extract the city model

- **Date:** 2026-07-28
- **Phase:** 5 — JavaScript modularization
- **Type:** Structure, feature configuration, state normalization, and tests
- **Status:** Implemented and locally verified
- **Intent:** Give the city feature a small internal model boundary without
  changing its visual rendering, progression, scoring, or image loading.
- **Conceptual change:** Moved the exact city-level catalog, PNG and WebP source
  lists, derived image-source mapping, level lookup helpers, score-threshold
  lookup, and in-place progress normalizer from `src/app.js` to
  `src/features/city/model.js`. The composition entry imports the same mutable
  values and functions; all consumers and execution order remain unchanged.
- **Preservation contract:** Level thresholds, translation keys, fallback labels,
  image paths and ordering, WebP-first fallback pairs, shared level-object
  identity, threshold/coercion behavior, invalid-index fallback,
  default/clamped progress, pending-level clearing, scoring-version coercion,
  mutation semantics, preload behavior, rendering, animation, analytics, and
  persistence remain exact.
- **Risks:** A reordered catalog could assign the wrong image or label; changed
  coercion could unlock, hide, or repeat a level; freezing shared values could
  change legacy behavior.
- **Verification:** `npm test` passed all 120 contract tests and the production
  build. Playwright passed 19 protected browser flows with five expected
  project-specific skips; all 18 visual baselines remained unchanged. The
  migration-ledger check is included in this commit gate.
- **Rollback:** Revert this commit to restore the city constants and normalizer
  inline; stored city progress requires no migration.
- **Association:** `codex/migration-05-javascript-modularization`; PR and release pending.

---

## MIG-034 — Extract video-state primitives

- **Date:** 2026-07-28
- **Phase:** 5 — JavaScript modularization
- **Type:** Structure, domain interface, and tests
- **Status:** Implemented and locally verified
- **Intent:** Establish a dependency-light video domain boundary before any
  rendering, mutation, persistence, analytics, or player lifecycle is moved.
- **Conceptual change:** Moved the exact video-status catalog and pure helpers
  for status, favorite/set-aside/watch-later flags, watched-confirmation
  availability, resume-second coercion, resume priority, paused/published
  timestamps, active/paused ordering, and direct YouTube URLs from `src/app.js`
  to `src/domain/video-state.js`. Existing call sites now import the same names.
- **Preservation contract:** Status fallbacks and ordering, strict booleans,
  legacy `watchLater` support, timestamp permissiveness, numeric coercion,
  duration clamping, partial/favorite/watch-later resume rules, URL encoding,
  date sorting and tie-breaking, rendering, state mutation, Undo/Redo,
  persistence, scoring, analytics, and video lifecycle remain exact.
- **Risks:** Small coercion or priority changes can reorder Continue Watching,
  alter deep links, expose set-aside videos, or change persisted cleanup.
- **Verification:** `npm test` passed all 126 contract tests and the production
  build. Playwright passed 19 protected browser flows with five expected
  project-specific skips; all 18 visual baselines remained unchanged. The
  migration-ledger check is included in this commit gate.
- **Rollback:** Revert this commit to restore the primitives inline; stored
  videos and progress require no migration.
- **Association:** `codex/migration-05-javascript-modularization`; PR and release pending.

---

## MIG-035 — Extract the saved-video search model

- **Date:** 2026-07-28
- **Phase:** 5 — JavaScript modularization
- **Type:** Structure, feature model, and tests
- **Status:** Implemented and locally verified
- **Intent:** Separate deterministic saved-video search calculations while
  leaving the search UI and all side effects unchanged.
- **Conceptual change:** Moved search-text normalization, phrase/token matching,
  title/channel/status scoring, watched/published tie-breaking, and the eight
  result cap from `src/app.js` to `src/features/videos/search-model.js`.
  Rendering, popover state, focus/keyboard behavior, selection, navigation,
  localization, and analytics remain in the composition entry.
- **Carried-forward correction:** The preceding video-state extraction omitted
  the `getVideoPublishedTimestamp` composition import while leaving a feed-order
  consumer in place. This commit adds that exact import and removes three unused
  composition imports; the extracted implementations are unchanged.
- **Preservation contract:** String coercion, lowercasing and whitespace rules,
  title/channel matching, status weights, score precedence, invalid timestamp
  fallback, newest-first ties, source object identity, result limit and order,
  empty/no-result UI, analytics event names/properties, and inline selection
  behavior remain exact.
- **Risks:** Ranking or normalization drift could change visible results and
  analytics result positions even when the popover looks structurally correct.
- **Verification:** `npm test` passed all 131 contract tests and the production
  build, including the carried-forward import correction. Playwright passed 19
  protected browser flows with five expected project-specific skips; all 18
  visual baselines remained unchanged. The migration-ledger check is included
  in this commit gate.
- **Rollback:** Revert this commit to restore search calculations inline; no
  user state or search history requires migration.
- **Association:** `codex/migration-05-javascript-modularization`; PR and release pending.

---

## MIG-036 — Lock Study Insight analytics identities

- **Date:** 2026-07-28
- **Phase:** 5 — JavaScript modularization
- **Type:** Compatibility metadata, analytics contract, and tests
- **Status:** Implemented and locally verified
- **Intent:** Make the generic analytics identities of the first inline-handler
  migration explicit before changing event ownership.
- **Conceptual change:** Added `data-analytics-action` to the four static Study
  Insight controls using the exact actions already selected by the analytics
  resolver: `insights.tab.current`, `insights.tab.previous`,
  `insights.collapse`, and `insights.reopen`. Inline handlers remain in place in
  this commit.
- **Preservation contract:** Generic event names remain
  `insights_tab_current_clicked`, `insights_tab_previous_clicked`,
  `insights_collapse_clicked`, and `insights_reopen_clicked`; action and button
  properties, visible labels, control types, handler execution, persistence,
  focus, markup, styling, localization, and accessibility remain unchanged.
- **Risks:** Choosing an aria-label key instead of the current translated-child
  precedence for Reopen would silently rename an analytics event.
- **Verification:** `npm test` passed all 133 contract tests and the production
  build. Playwright passed 19 protected browser flows with five expected
  project-specific skips; all 18 visual baselines remained unchanged. The
  migration-ledger check is included in this commit gate.
- **Rollback:** Revert this commit to return analytics identity selection to the
  existing resolver precedence; no stored state or analytics schema migration is
  required.
- **Association:** `codex/migration-05-javascript-modularization`; PR and release pending.

---

## MIG-037 — Migrate static Study Insight actions

- **Date:** 2026-07-28
- **Phase:** 5 — JavaScript modularization
- **Type:** Structure, event ownership, compatibility removal, and tests
- **Status:** Implemented and locally verified
- **Intent:** Begin removal of legacy inline handlers with the smallest static,
  low-coupling control group.
- **Conceptual change:** Removed the four Study Insight `onclick` attributes and
  bound the same current/previous/collapse/reopen calls directly to their static
  controls through `src/features/study-insights/actions.js`. Removed
  `setStudyInsightView` and `setStudyInsightsCollapsed` from the temporary global
  action manifest and bridge; the underlying feature functions remain in the
  composition entry. The current classic bundle continues to expose top-level
  declarations as a temporary compatibility side effect; IIFE/global cleanup is
  deferred until automated proof shows no remaining inline consumers.
- **Preservation contract:** Exact arguments and single-call behavior, child
  clicks, state persistence, render order, requestAnimationFrame focus transfer,
  target-before-document event ordering, generic analytics identities and
  properties, tabs, disabled state, localization, accessibility, and visuals
  remain unchanged.
- **Risks:** Document-level delegation would run after the analytics listener was
  registered and could invert action/analytics ordering; non-idempotent binding
  could double mutations.
- **Verification:** `npm test` passed all 136 contract tests and the production
  build. The first protected browser run proved the action, state, focus, and
  ordering flow, but its final assertion incorrectly expected classic-script
  globals to disappear with bridge ownership; that assertion was corrected to
  test the `EdeniaActions` namespace. The full rerun passed 20 browser flows with
  ten expected project-specific skips; all 18 visual baselines remained
  unchanged. The migration-ledger check is included in this commit gate.
- **Rollback:** Revert this commit to restore the four inline attributes and
  global aliases while retaining the explicit analytics identities from
  MIG-036; stored insight state needs no migration.
- **Association:** `codex/migration-05-javascript-modularization`; PR and release pending.

---

## MIG-038 — Lock Settings accordion analytics identities

- **Date:** 2026-07-28
- **Phase:** 5 — JavaScript modularization
- **Type:** Compatibility metadata, analytics contract, and tests
- **Status:** Implemented and locally verified
- **Intent:** Preserve the generic analytics names of the next static
  inline-handler group before transferring event ownership.
- **Conceptual change:** Added explicit `data-analytics-action` values to the How
  to, Activity log, and Recent local backups accordion buttons using the exact
  translation keys already selected through their child labels. Inline handlers
  remain in place in this commit.
- **Preservation contract:** Events remain `settings_howto_title_clicked`,
  `settings_activity_title_clicked`, and `settings_backups_title_clicked`;
  action/button properties, visible localized labels, click and keyboard
  activation, accordion state, markup, styling, and accessibility remain exact.
- **Risks:** Replacing child-label precedence with a different key would silently
  split analytics history by event name.
- **Verification:** `npm test` passed all 138 contract tests and the production
  build. Playwright passed 20 protected browser flows with ten expected
  project-specific skips; all 18 visual baselines remained unchanged. The
  migration-ledger check is included in this commit gate.
- **Rollback:** Revert this commit to restore resolver-derived identities; no
  stored state or analytics schema migration is required.
- **Association:** `codex/migration-05-javascript-modularization`; PR and release pending.

---

## MIG-039 — Migrate static Settings accordion actions

- **Date:** 2026-07-28
- **Phase:** 5 — JavaScript modularization
- **Type:** Structure, event ownership, compatibility removal, and tests
- **Status:** Implemented and locally verified
- **Intent:** Continue inline-handler removal with the three static, native
  Settings accordion buttons.
- **Conceptual change:** Removed the How to, Activity log, and Recent local
  backups `onclick` attributes and installed idempotent direct click listeners
  through `src/features/settings/accordion-actions.js`. Removed their toggle
  functions from the temporary `EdeniaActions` manifest/map; the existing
  accordion state functions remain in `src/app.js`. Classic-script top-level
  globals remain temporarily compatible until final global cleanup.
- **Preservation contract:** One toggle per mouse, child, Enter, or Space
  activation; content `hidden`, button `aria-expanded`, group `.open`, Settings
  reopen reset, target-before-document ordering, analytics identities and
  properties, localization, focusability, markup, styling, and accessibility
  remain exact.
- **Risks:** Duplicate listeners could invert a toggle back to its starting
  state; changing native button handling could double keyboard activation.
- **Verification:** `npm test` passed all 141 contract tests and the production
  build. Playwright passed 21 protected browser flows with 15 expected
  project-specific skips, including mouse, child, Enter, Space, reset, bridge,
  and document-order assertions; all 18 visual baselines remained unchanged.
  The migration-ledger check is included in this commit gate.
- **Rollback:** Revert this commit to restore the three inline attributes and
  action-bridge entries while retaining MIG-038 analytics metadata; stored
  settings require no migration.
- **Association:** `codex/migration-05-javascript-modularization`; PR and release pending.

---

## MIG-040 — Extract feed selectors and ordering

- **Date:** 2026-07-28
- **Phase:** 5 — JavaScript modularization
- **Type:** Structure, feature model, interface refinement, and tests
- **Status:** Implemented and locally verified
- **Intent:** Isolate deterministic feed visibility, grouping, and ordering
  without moving rendering, mutable UI state, or lifecycle behavior.
- **Conceptual change:** Added `src/features/videos/feed-selectors.js` for active
  visibility, five-per-channel limiting, Shorts/hidden checks, selected/removed
  channel matching, display and limiting keys, shelf-order normalization,
  channel grouping metadata, resume/watch-later timeline priority, and
  paused/published date comparators. Moved the comparator helpers from the
  broader video-state module into this owning feature. The composition entry
  injects the localized YouTube fallback title and retains all markup and side
  effects.
- **Preservation contract:** The limit remains five; manual-source videos retain
  independent limit keys; input arrays and video identities remain intact;
  invalid/pre-epoch dates, stable ties, resume/watch-later ordering, configured
  and video image precedence, duplicate config behavior, configured shelf order,
  removed-channel overrides, strict 180-second Shorts boundary, render order,
  content ordering, drag state, analytics, persistence, and player lifecycle
  remain exact.
- **Risks:** Display and limiting keys intentionally differ; merging them could
  hide manual videos. Small priority, fallback, or image-precedence changes
  would alter channel ordering and visible cards.
- **Verification:** `npm test` passed all 145 contract tests and the production
  build. Playwright passed 21 protected browser flows with 15 expected
  project-specific skips; all 18 visual baselines remained unchanged. The
  migration-ledger check is included in this commit gate.
- **Rollback:** Revert this commit to restore selectors and comparators to their
  previous files; video or shelf state requires no migration.
- **Association:** `codex/migration-05-javascript-modularization`; PR and release pending.

---

## MIG-041 — Lock Study History view analytics identities

- **Date:** 2026-07-28
- **Phase:** 5 — JavaScript modularization
- **Type:** Compatibility metadata, analytics contract, and tests
- **Status:** Implemented and locally verified
- **Intent:** Preserve generic click identities for the two static Study History
  view tabs before transferring their event ownership.
- **Conceptual change:** Added explicit `data-analytics-action="history.summary"`
  and `data-analytics-action="history.heatmap"` to the existing Summary and
  Heatmap tabs. Inline handlers remain in place in this commit.
- **Preservation contract:** Events remain `history_summary_clicked` and
  `history_heatmap_clicked`; action/button properties, locale labels, literal
  view arguments, persistence, tab roles, selected state, keyboard behavior,
  rendering, styling, and accessibility remain exact.
- **Risks:** A renamed action would fragment existing analytics even if the tabs
  continued to work visually.
- **Verification:** `npm test` passed all 147 contract tests and the production
  build. Playwright passed 21 protected browser flows with 15 expected
  project-specific skips; all 18 visual baselines remained unchanged. The
  migration-ledger check is included in this commit gate.
- **Rollback:** Revert this commit to restore resolver-derived action names; no
  persisted history-view or analytics migration is required.
- **Association:** `codex/migration-05-javascript-modularization`; PR and release pending.

---

## MIG-042 — Migrate static Study History view actions

- **Date:** 2026-07-28
- **Phase:** 5 — JavaScript modularization
- **Type:** Structure, event ownership, compatibility removal, and tests
- **Status:** Implemented and locally verified
- **Intent:** Transfer the two static Study History tabs from inline handlers to
  feature-owned direct listeners.
- **Conceptual change:** Removed both `setHistoryView(...)` inline attributes and
  bound fixed `summary`/`heatmap` calls through
  `src/features/study-history/view-actions.js`. Removed `setHistoryView` from the
  temporary `EdeniaActions` manifest/map; its state/render function remains in
  `src/app.js`, and classic-script top-level compatibility remains until final
  global cleanup.
- **Preservation contract:** Literal arguments, one action per native click or
  keyboard activation, synchronous persistence before document analytics,
  reload selection, active/aria states, summary/heatmap visibility, generic
  analytics identities/properties, rendering, localization, and accessibility
  remain exact.
- **Risks:** Reading mutable datasets instead of binding fixed values could make
  future markup changes alter behavior; delegation could invert persistence and
  analytics ordering.
- **Verification:** `npm test` passed all 150 contract tests and the production
  build. Playwright passed 22 protected browser flows with 20 expected
  project-specific skips, including click, Enter, Space, persistence, reload,
  bridge, and document-order assertions; all 18 visual baselines remained
  unchanged. The migration-ledger check is included in this commit gate.
- **Rollback:** Revert this commit to restore both inline attributes and the
  bridge entry while retaining MIG-041 metadata; persisted `historyView` values
  remain compatible.
- **Association:** `codex/migration-05-javascript-modularization`; PR and release pending.

---

## MIG-043 — Lock Activity Log filter analytics identities

- **Date:** 2026-07-28
- **Phase:** 5 — JavaScript modularization
- **Type:** Compatibility metadata, analytics contract, and tests
- **Status:** Implemented and locally verified
- **Intent:** Preserve generic analytics names for the five static Activity Log
  filters before moving their event ownership.
- **Conceptual change:** Added explicit `data-analytics-action` values matching
  the existing `settings.activity.*` translation keys for All, User, Auto,
  Issues, and Points. Inline handlers remain in place in this commit.
- **Preservation contract:** The five `settings_activity_*_clicked` event names,
  action/button properties, localized labels, live dataset argument, filter
  selection, rendering, mobile pagination, keyboard behavior, markup, styling,
  and accessibility remain exact.
- **Risks:** A renamed key would fragment analytics; capturing a value here would
  not yet alter behavior but could conceal the live-dataset requirement of the
  following migration.
- **Verification:** `npm test` passed all 152 contract tests and the production
  build. Playwright passed 22 protected flows with 20 expected project skips
  across the six required viewport projects; all 18 representative screenshots
  remained unchanged. Migration-ledger verification passed against `v1.0.0`.
- **Rollback:** Revert this commit to restore translation-derived analytics
  identities; no Activity Log state or analytics migration is required.
- **Association:** `codex/migration-05-javascript-modularization`; PR and release pending.

---

## MIG-044 — Migrate Activity Log filter actions

- **Date:** 2026-07-28
- **Phase:** 5 — JavaScript modularization
- **Type:** Event ownership, compatibility bridge reduction, and tests
- **Status:** Implemented and locally verified
- **Intent:** Move the five static Activity Log filter clicks from inline
  attributes to one bounded feature module without changing filtering behavior.
- **Conceptual change:** Added an idempotent direct-listener binder for every
  `data-activity-log-filter` control, installed it from the composition entry
  point, removed the five inline handlers, and removed
  `setActivityLogFilter` from the temporary legacy action bridge. The binder
  reads each control's dataset at click time to preserve existing `this.dataset`
  behavior.
- **Preservation contract:** Filter membership and fallback, active and
  `aria-selected` state, Activity Log rendering and grouping, point-derived
  entries, mobile pagination reset, mouse and native keyboard activation,
  document-bubble ordering, the five explicit analytics identities, localized
  labels, markup, styling, and persistence remain exact.
- **Risks:** Capturing filter values during installation would break live dataset
  behavior; delegated document handling would run after generic analytics;
  duplicate listeners would apply a filter more than once.
- **Verification:** `npm test` passed all 156 contract tests and the production
  build. Playwright passed 23 protected flows with 25 expected project skips,
  including live dataset, mouse, Enter, Space, filter rendering, bridge, and
  document-order assertions across the required viewport projects; all 18
  visual baselines remained unchanged. Migration-ledger verification passed
  against `v1.0.0`.
- **Rollback:** Revert this commit to restore the five inline handlers and
  `setActivityLogFilter` bridge entry while retaining MIG-043 analytics
  metadata; no persisted Activity Log data requires migration.
- **Association:** `codex/migration-05-javascript-modularization`; PR and release pending.

---

## MIG-045 — Lock city zoom analytics identities

- **Date:** 2026-07-28
- **Phase:** 5 — JavaScript modularization
- **Type:** Compatibility metadata, analytics contract, and tests
- **Status:** Implemented and locally verified
- **Intent:** Preserve generic analytics names for the three static city zoom
  controls before moving their event ownership.
- **Conceptual change:** Added explicit `data-analytics-action` values matching
  the existing localized aria-label keys for zoom out, reset, and zoom in.
  Inline handlers remain in place in this commit.
- **Preservation contract:** The `city_zoom_out_clicked`,
  `city_zoom_reset_clicked`, and `city_zoom_in_clicked` event names and
  properties, localized accessible names, literal handler arguments, transform
  behavior, gesture state, mouse and keyboard behavior, markup, styling, and
  accessibility remain exact.
- **Risks:** A renamed identity would fragment analytics; passing a click event
  during the following migration would invoke focal-point zoom and alter pan
  behavior.
- **Verification:** `npm test` passed all 158 contract tests and the production
  build. Playwright passed 23 protected flows with 25 expected project skips
  across the six required viewport projects; all 18 representative screenshots
  remained unchanged. Migration-ledger verification passed against `v1.0.0`.
- **Rollback:** Revert this commit to restore aria-label-derived analytics
  identities; city view state and persisted application data are unaffected.
- **Association:** `codex/migration-05-javascript-modularization`; PR and release pending.

---

## MIG-046 — Migrate city zoom actions

- **Date:** 2026-07-28
- **Phase:** 5 — JavaScript modularization
- **Type:** Event ownership, compatibility bridge reduction, and tests
- **Status:** Implemented and locally verified
- **Intent:** Move the three static city zoom clicks from inline attributes into
  a bounded city feature module without changing zoom or reset behavior.
- **Conceptual change:** Added fixed semantic action hooks and an idempotent
  direct-listener binder for zoom out, reset, and zoom in; installed it from the
  composition entry point; removed the inline handlers; and removed
  `zoomCityImage` and `resetCityImageView` from the temporary legacy action
  bridge.
- **Preservation contract:** Zoom direction and exact `0.25` step, `1`–`2`
  clamping, omission of the click event and focal-point math, pan clamping,
  transform order, reset of touch/pinch/drag state, mouse and native keyboard
  activation, document-bubble ordering, explicit analytics identities,
  localized accessible names, styling, and application state remain exact.
- **Risks:** Forwarding the event would alter pan position; a delegated listener
  would invert transform and document-analytics ordering; an incomplete reset
  would leave hidden gesture state active.
- **Verification:** `npm test` passed all 161 contract tests and the production
  build. Playwright passed 24 protected flows with 30 expected project skips,
  including fixed call arity, click, Enter, Space, clamp, reset, bridge, and
  document-order assertions across the required viewport projects; all 18
  visual baselines remained unchanged. Migration-ledger verification passed
  against `v1.0.0`.
- **Rollback:** Revert this commit to restore the three inline handlers and both
  bridge entries while retaining MIG-045 analytics metadata; city image view
  state is ephemeral and needs no data migration.
- **Association:** `codex/migration-05-javascript-modularization`; PR and release pending.

---

## MIG-047 — Lock sandbox control analytics identities

- **Date:** 2026-07-28
- **Phase:** 5 — JavaScript modularization
- **Type:** Compatibility metadata, analytics contract, and tests
- **Status:** Implemented and locally verified
- **Intent:** Preserve generic analytics names for the two static sandbox
  controls before moving their event ownership.
- **Conceptual change:** Added explicit `data-analytics-action` values matching
  the existing `sandbox.addDay` and `sandbox.reset` translation keys. Inline
  handlers remain in place in this commit.
- **Preservation contract:** The `sandbox_add_day_clicked` and
  `sandbox_reset_clicked` event names and properties, sandbox-only visibility
  and guards, localized labels, date advancement, randomized activity, reset
  backup, storage isolation, rendering, toast, mouse and keyboard behavior,
  markup, styling, and accessibility remain exact.
- **Risks:** A renamed identity would fragment analytics; treating randomized
  sandbox output as a fixed snapshot would create brittle verification.
- **Verification:** `npm test` passed all 163 contract tests and the production
  build. Playwright passed 24 protected flows with 30 expected project skips
  across the six required viewport projects; all 18 representative screenshots
  remained unchanged. Migration-ledger verification passed against `v1.0.0`.
- **Rollback:** Revert this commit to restore translation-derived analytics
  identities; sandbox and normal stored state remain compatible.
- **Association:** `codex/migration-05-javascript-modularization`; PR and release pending.

---

## MIG-048 — Migrate sandbox control actions

- **Date:** 2026-07-28
- **Phase:** 5 — JavaScript modularization
- **Type:** Event ownership, compatibility bridge reduction, and tests
- **Status:** Implemented and locally verified
- **Intent:** Move the two sandbox header clicks from inline attributes into a
  bounded sandbox feature module without moving or changing sandbox logic.
- **Conceptual change:** Added fixed semantic action hooks and an idempotent
  direct-listener binder for Add day and Reset; installed it in every runtime
  environment while retaining the actions' own sandbox guards; removed both
  inline handlers; and removed `addSandboxDay` and `resetSandboxState` from the
  temporary legacy action bridge.
- **Preservation contract:** Exact sandbox gating and storage domain, one-day
  advancement, intentionally randomized activity generation, streak and city
  updates, forced pre-reset backup reason and contents, reset defaults and
  activity entry, rendering, localized toasts, zero-argument invocation, mouse
  and native keyboard activation, document-bubble ordering, analytics
  identities, labels, styling, and accessibility remain exact.
- **Risks:** Binding only in sandbox would change programmatic behavior in other
  environments; fixed-output assertions would conflict with intentional
  randomness; an incorrect reset path could affect normal storage.
- **Verification:** `npm test` passed all 166 contract tests and the production
  build. Playwright passed 25 protected flows with 35 expected project skips,
  including three sequential day advances, click, Enter, Space, sandbox/normal
  storage isolation, forced reset backup, reset activity, bridge, and
  document-order assertions; all 18 visual baselines remained unchanged.
  Migration-ledger verification passed against `v1.0.0`.
- **Rollback:** Revert this commit to restore both inline handlers and bridge
  entries while retaining MIG-047 analytics metadata; existing normal, sandbox,
  and backup records remain compatible.
- **Association:** `codex/migration-05-javascript-modularization`; PR and release pending.

---

## MIG-049 — Lock theme-toggle analytics identity

- **Date:** 2026-07-28
- **Phase:** 5 — JavaScript modularization
- **Type:** Compatibility metadata, analytics contract, and tests
- **Status:** Implemented and locally verified
- **Intent:** Preserve the generic analytics name for the static theme toggle
  before moving its event ownership.
- **Conceptual change:** Added explicit `data-analytics-action="themeToggle"`,
  matching the control ID that currently wins analytics resolution. The inline
  handler remains in place in this commit.
- **Preservation contract:** The `theme_toggle_clicked` event name, action and
  control properties, post-toggle localized `button_name`, stored theme,
  document/body attributes, background update, Activity Log entry, mouse and
  keyboard behavior, markup, icons, styling, and accessibility remain exact.
- **Risks:** Using a localized title as the action would fragment event names;
  evaluating analytics before the theme change would preserve the event name but
  alter its `button_name` property.
- **Verification:** `npm test` passed all 168 contract tests and the production
  build. Playwright passed 25 protected flows with 35 expected project skips
  across the six required viewport projects; all 18 representative screenshots
  remained unchanged. Migration-ledger verification passed against `v1.0.0`.
- **Rollback:** Revert this commit to restore ID-derived analytics identity;
  persisted theme values and Activity Log data remain compatible.
- **Association:** `codex/migration-05-javascript-modularization`; PR and release pending.

---

## MIG-050 — Migrate the theme-toggle action

- **Date:** 2026-07-28
- **Phase:** 5 — JavaScript modularization
- **Type:** Event ownership, compatibility bridge reduction, and tests
- **Status:** Implemented and locally verified
- **Intent:** Move the static theme-toggle click from an inline attribute into a
  bounded theme feature module without moving or changing theme logic.
- **Conceptual change:** Added a semantic theme action hook and an idempotent
  direct-listener binder, installed it from the composition entry point, removed
  the inline handler, and removed `toggleTheme` from the temporary legacy action
  bridge.
- **Preservation contract:** Zero-argument invocation, light/dark transition,
  storage and reload persistence, document and body attributes, background
  update, localized post-toggle title and aria-label, Activity Log entry,
  document-bubble ordering and resulting analytics `button_name`, explicit
  event identity, mouse and native keyboard activation, icons, styling, and
  accessibility remain exact.
- **Risks:** Document-level delegation would observe analytics before the label
  update; forwarding the browser event or binding twice would alter the action
  boundary; a missing bridge removal would retain obsolete compatibility.
- **Verification:** `npm test` passed all 171 contract tests and the production
  build. Playwright passed 26 protected flows with 40 expected project skips,
  including click, Enter, Space, persistence, reload, localized post-action
  labels, Activity Log, bridge, and document-order assertions; all 18 visual
  baselines remained unchanged. Migration-ledger verification passed against
  `v1.0.0`.
- **Rollback:** Revert this commit to restore the inline handler and bridge entry
  while retaining MIG-049 analytics metadata; persisted theme values remain
  compatible.
- **Association:** `codex/migration-05-javascript-modularization`; PR and release pending.

---

## MIG-051 — Lock Settings reset-confirm analytics identities

- **Date:** 2026-07-28
- **Phase:** 5 — JavaScript modularization
- **Type:** Compatibility metadata, analytics contract, and tests
- **Status:** Implemented and locally verified
- **Intent:** Preserve generic analytics names for revealing and cancelling the
  Settings reset confirmation before moving their event ownership.
- **Conceptual change:** Added explicit `data-analytics-action` values matching
  `settings.reset.open` and `settings.reset.cancel`. Both inline handlers remain
  in place, and the destructive `resetApp()` control is explicitly unchanged.
- **Preservation contract:** The two `settings_reset_*_clicked` event names and
  properties, localized labels, exact hidden-class transitions, repeat-call
  idempotency, current focus behavior, Settings reopen behavior, mouse and
  keyboard activation, markup, styling, and accessibility remain exact. No data
  deletion or persistence behavior is in scope.
- **Risks:** Accidentally including Delete data would broaden this into a
  destructive migration; adding focus restoration would change current
  behavior.
- **Verification:** `npm test` passed all 173 contract tests and the production
  build. Playwright passed 26 protected flows with 40 expected project skips
  across the six required viewport projects; all 18 representative screenshots
  remained unchanged. Migration-ledger verification passed against `v1.0.0`.
- **Rollback:** Revert this commit to restore translation-derived analytics
  identities; no application data is affected.
- **Association:** `codex/migration-05-javascript-modularization`; PR and release pending.

---

## MIG-052 — Migrate Settings reset-confirm actions

- **Date:** 2026-07-28
- **Phase:** 5 — JavaScript modularization
- **Type:** Event ownership, compatibility bridge reduction, and tests
- **Status:** Implemented and locally verified
- **Intent:** Move only the Settings reset-confirm reveal and cancel clicks from
  inline attributes into a bounded Settings feature module.
- **Conceptual change:** Added fixed semantic show/hide hooks and an idempotent
  direct-listener binder, installed it from the composition entry point, removed
  the two inline handlers, and removed `showResetConfirm` and
  `hideResetConfirm` from the temporary legacy bridge. The destructive Delete
  data action remains untouched.
- **Preservation contract:** Separate idempotent show and hide behavior, exact
  `hidden` class state, zero-argument invocation, no focus reassignment,
  confirmation visibility across Settings close/reopen, no storage mutation,
  mouse and native keyboard activation, document-bubble ordering, explicit
  analytics identities, localized labels, styling, and accessibility remain
  exact.
- **Risks:** Replacing show/hide with a toggle would break repeated calls;
  document delegation would invert UI and analytics ordering; including
  `resetApp` would broaden this migration into destructive behavior.
- **Verification:** `npm test` passed all 176 contract tests and the production
  build. The focused reset-confirm Playwright flow passed after removing an
  incorrect test-only focus assumption, then the full matrix passed 27 protected
  flows with 45 expected project skips, including click, Enter, Space,
  class-state, reopen, storage, bridge, and document-order assertions; all 18
  visual baselines remained unchanged. Migration-ledger verification passed
  against `v1.0.0`.
- **Rollback:** Revert this commit to restore both inline handlers and bridge
  entries while retaining MIG-051 analytics metadata; no persisted data
  migration is required.
- **Association:** `codex/migration-05-javascript-modularization`; PR and release pending.

---

## MIG-053 — Lock feedback-confirmation analytics identity

- **Date:** 2026-07-28
- **Phase:** 5 — JavaScript modularization
- **Type:** Compatibility metadata, analytics contract, and tests
- **Status:** Implemented and locally verified
- **Intent:** Preserve the generic analytics name for the feedback-confirmation
  OK control before moving its event ownership.
- **Conceptual change:** Added explicit `data-analytics-action="feedback.ok"`,
  matching the existing translation-key resolution. The inline close handler
  remains in place in this commit.
- **Preservation contract:** The `feedback_ok_clicked` event name and
  properties, localized label, confirmation classes, focus return to the
  feedback launcher, mouse and keyboard behavior, markup, styling, and
  accessibility remain exact.
- **Risks:** A changed identity would fragment analytics; changing focus timing
  would make the confirmation flow less accessible.
- **Verification:** `npm test` passed all 178 contract tests and the production
  build. Playwright passed 27 protected flows with 45 expected project skips
  across the six required viewport projects; all 18 representative screenshots
  remained unchanged. Migration-ledger verification passed against `v1.0.0`.
- **Rollback:** Revert this commit to restore translation-derived analytics
  identity; feedback state and application data are unaffected.
- **Association:** `codex/migration-05-javascript-modularization`; PR and release pending.

---

## MIG-054 — Migrate the feedback-confirmation action

- **Date:** 2026-07-28
- **Phase:** 5 — JavaScript modularization
- **Type:** Event ownership, compatibility bridge reduction, and tests
- **Status:** Implemented and locally verified
- **Intent:** Move the feedback-confirmation OK click from an inline attribute
  into a bounded feedback feature module without changing dismissal behavior.
- **Conceptual change:** Added a semantic close hook and an idempotent direct
  listener, installed it from the composition entry point, removed the inline
  handler, and removed `closeFeedbackConfirmation` from the temporary legacy
  bridge.
- **Preservation contract:** Zero-argument invocation, exact removal of `show`
  and addition of `hidden`, synchronous focus return to the feedback launcher,
  no persistence mutation, mouse and native keyboard activation,
  document-bubble ordering, explicit analytics identity, localized label,
  styling, and dialog accessibility remain exact.
- **Risks:** Moving focus after document analytics would alter observable
  ordering; hiding without removing `show` would leave conflicting classes;
  duplicate binding would invoke dismissal twice.
- **Verification:** `npm test` passed all 181 contract tests and the production
  build. Playwright passed 28 protected flows with 50 expected project skips,
  including click, Enter, Space, class-state, focus-return, storage, bridge, and
  document-order assertions; all 18 visual baselines remained unchanged.
  Migration-ledger verification passed against `v1.0.0`.
- **Rollback:** Revert this commit to restore the inline handler and bridge entry
  while retaining MIG-053 analytics metadata; no stored data migration is
  required.
- **Association:** `codex/migration-05-javascript-modularization`; PR and release pending.

---

## MIG-055 — Lock feedback-modal analytics identities

- **Date:** 2026-07-28
- **Phase:** 5 — JavaScript modularization
- **Type:** Compatibility metadata, analytics contract, and tests
- **Status:** Implemented and locally verified
- **Intent:** Preserve analytics identities for the feedback launcher, backdrop,
  and close button before moving their event ownership.
- **Conceptual change:** Added explicit `feedback.close` metadata to the
  backdrop and contracted the existing explicit `feedback` launcher and
  `feedback_close` close-button values. Inline handlers remain in place.
- **Preservation contract:** The `feedback_clicked` launcher event and both
  `feedback_close_clicked` events, their intentionally distinct action
  properties, localized button names, modal/body classes, status reset, focus
  entry and return, Escape and Tab behavior, mouse and keyboard activation,
  markup, styling, and accessibility remain exact. Form submission is out of
  scope.
- **Risks:** Normalizing both close actions to one property would change
  analytics history; changing listener timing could alter focus or document
  analytics ordering.
- **Verification:** `npm test` passed all 183 contract tests and the production
  build. Playwright passed 28 protected flows with 50 expected project skips
  across the six required viewport projects; all 18 representative screenshots
  remained unchanged. Migration-ledger verification passed against `v1.0.0`.
- **Rollback:** Revert this commit to restore translation-derived backdrop
  analytics identity; feedback and application state remain unaffected.
- **Association:** `codex/migration-05-javascript-modularization`; PR and release pending.

---

## MIG-056 — Migrate feedback-modal actions

- **Date:** 2026-07-28
- **Phase:** 5 — JavaScript modularization
- **Type:** Event ownership, compatibility bridge reduction, and tests
- **Status:** Implemented and locally verified
- **Intent:** Move the feedback launcher, backdrop, and close-button clicks from
  inline attributes into a bounded feedback module while leaving submission
  behavior untouched.
- **Conceptual change:** Added fixed open/close hooks and an idempotent
  direct-listener binder for the three static controls, installed it from the
  composition entry point, removed their inline handlers, and removed
  `openFeedbackModal` and `closeFeedbackModal` from the temporary legacy bridge.
  Internal submission and Escape consumers continue to call the same close
  function directly.
- **Preservation contract:** Zero-argument calls, modal and body classes, status
  clearing, deferred focus into the message field, synchronous focus return to
  the prior launcher, Escape and Tab handling, repeated open/close behavior, no
  persistence mutation, mouse and native keyboard activation, target-before-
  document ordering, all three exact analytics action properties and event
  names, styling, and accessibility remain exact.
- **Risks:** Forwarding events or delegating at document level could alter focus
  and analytics ordering; merging the two close action properties would change
  historical analytics; removing the internal close function would break
  submission or Escape behavior.
- **Verification:** `npm test` passed all 186 contract tests and the production
  build. Playwright passed 29 protected flows with 55 expected project skips,
  including launcher, backdrop, close button, Enter, Space, Escape, modal/body
  classes, focus entry/return, storage, bridge, and document-order assertions;
  all 18 visual baselines remained unchanged. Migration-ledger verification
  passed against `v1.0.0`.
- **Rollback:** Revert this commit to restore all three inline handlers and both
  bridge entries while retaining MIG-055 metadata; feedback and application
  state need no migration.
- **Association:** `codex/migration-05-javascript-modularization`; PR and release pending.

---

## MIG-057 — Lock watched-section analytics identity

- **Date:** 2026-07-28
- **Phase:** 5 — JavaScript modularization
- **Type:** Compatibility metadata, analytics contract, and tests
- **Status:** Implemented and locally verified
- **Intent:** Preserve the watched-section disclosure's current analytics
  identity before moving its click ownership out of inline markup.
- **Conceptual change:** Added an explicit `videos.watched.hide` analytics
  action and a contract for the current generic event name while retaining the
  existing inline handler.
- **Preservation contract:** The intentionally fixed
  `videos_watched_hide_clicked` event and `videos.watched.hide` action remain
  exact whether the current accessible label says Show or Hide. Collapsed
  state, count-based initial state, localized accessible labels, mouse and
  keyboard activation, styling, rendering, and persistence remain unchanged.
- **Risks:** Deriving analytics from the runtime Show label would split one
  historical event into two identities; changing the disclosure action in this
  commit would combine metadata and behavior risk.
- **Verification:** `npm test` passed all 188 contract tests and the production
  build. Playwright passed 29 protected flows with 55 expected project skips
  across the six required viewport projects; all 18 representative screenshots
  remained unchanged. Migration-ledger verification passed against `v1.0.0`.
- **Rollback:** Revert this commit to restore translation-attribute-derived
  analytics identity; watched-video and application state remain unaffected.
- **Association:** `codex/migration-05-javascript-modularization`; PR and release pending.

---

## MIG-058 — Migrate watched-section disclosure action

- **Date:** 2026-07-28
- **Phase:** 5 — JavaScript modularization
- **Type:** Event ownership, compatibility bridge reduction, and tests
- **Status:** Implemented and locally verified
- **Intent:** Move the watched-section disclosure click into a bounded video
  feature module without changing its current rendered or transient behavior.
- **Conceptual change:** Added a semantic toggle hook and an idempotent direct
  listener, installed it from the composition entry point, removed the inline
  handler, and removed `toggleWatchedSection` from the temporary legacy bridge.
- **Preservation contract:** Zero-argument invocation, count-based initial
  collapse, session-only manual state, exact class and `aria-expanded` changes,
  localized Show and Hide labels, the intentionally fixed analytics identity,
  mouse and native keyboard activation, target-before-document ordering,
  styling, rendering, and stored application state remain exact.
- **Risks:** Persisting the transient preference would change reload behavior;
  delegating at document level would reverse observable action and analytics
  ordering; deriving analytics from the mutable label would split event history.
- **Verification:** `npm test` passed all 191 contract tests and the production
  build. The focused watched-section flow passed after using the suite's
  deterministic image stub and waiting only on the DOM under test. The full
  Playwright matrix then passed 30 protected flows with 60 expected project
  skips, including mouse, Enter, Space, transient reload, localized label,
  storage, bridge, and document-order assertions; all 18 visual baselines
  remained unchanged. Migration-ledger verification passed against `v1.0.0`.
- **Rollback:** Revert this commit to restore the inline handler and bridge entry
  while retaining MIG-057 analytics metadata; no stored data migration is
  required.
- **Association:** `codex/migration-05-javascript-modularization`; PR and release pending.

---

## MIG-059 — Lock Settings shell analytics identities

- **Date:** 2026-07-28
- **Phase:** 5 — JavaScript modularization
- **Type:** Compatibility metadata, analytics contract, and tests
- **Status:** Implemented and locally verified
- **Intent:** Preserve the tracked Settings opener and close-button identities
  before moving the shell's click ownership out of inline markup.
- **Conceptual change:** Added explicit `header.settings` and `settings.close`
  analytics actions and contracted the overlay's intentional lack of generic
  analytics. All three inline handlers remain in place.
- **Preservation contract:** Exact generic event names, localized button names,
  untracked pointer-only overlay behavior, panel visibility, main-application
  inertness, locale refresh, drawer scroll handling, focus entry and return,
  Escape and Tab behavior, styling, and accessibility remain exact.
- **Risks:** Adding analytics or keyboard semantics to the overlay would create
  new behavior; moving action ownership in this commit would combine metadata,
  focus, and modal-state risk.
- **Verification:** `npm test` passed all 193 contract tests and the production
  build. Playwright passed 30 protected flows with 60 expected project skips
  across the six required viewport projects; all 18 representative screenshots
  remained unchanged. Migration-ledger verification passed against `v1.0.0`.
- **Rollback:** Revert this commit to restore translation-derived button
  analytics identities; Settings and application state remain unaffected.
- **Association:** `codex/migration-05-javascript-modularization`; PR and release pending.

---

## MIG-060 — Migrate Settings shell actions

- **Date:** 2026-07-28
- **Phase:** 5 — JavaScript modularization
- **Type:** Event ownership, compatibility bridge reduction, and tests
- **Status:** Implemented and locally verified
- **Intent:** Move the Settings opener, backdrop dismissal, and close-button
  dismissal into a bounded Settings module without altering the shell.
- **Conceptual change:** Added fixed open/close hooks and an idempotent direct
  listener binder for the three static controls, installed it from the
  composition entry point, removed their inline handlers, and removed
  `openSettings` and `closeSettings` from the temporary legacy bridge. Internal
  walkthrough, prompt, replay, and keyboard consumers retain the same functions.
- **Preservation contract:** Zero-argument calls, locale refresh and content
  rerender on open, phone-only drawer scroll reset, original return-focus
  function property, main-application inertness, visibility classes, deferred
  focus entry and return, Escape and Tab behavior, untracked pointer-only
  overlay, desktop scroll retention, body and page scrolling, exact analytics,
  styling, persistence, and accessibility remain unchanged.
- **Risks:** Moving return-focus ownership would break phone walkthrough replay;
  document-level delegation would reverse action and analytics ordering; adding
  body locking or overlay semantics would be an intentional UI change.
- **Verification:** `npm test` passed all 196 contract tests and the production
  build. The focused desktop and phone Settings shell flows passed first. The
  full Playwright matrix then passed 32 protected flows with 70 expected
  project skips, including mouse, Enter, Space, overlay, Escape, inertness,
  focus, desktop-scroll, phone-reset, storage, bridge, and document-order
  assertions; all 18 visual baselines remained unchanged. Migration-ledger
  verification passed against `v1.0.0`.
- **Rollback:** Revert this commit to restore the three inline handlers and both
  bridge entries while retaining MIG-059 analytics metadata; no stored data
  migration is required.
- **Association:** `codex/migration-05-javascript-modularization`; PR and release pending.

---

## MIG-061 — Lock Settings replay analytics identities

- **Date:** 2026-07-28
- **Phase:** 5 — JavaScript modularization
- **Type:** Compatibility metadata, analytics contract, and tests
- **Status:** Implemented and locally verified
- **Intent:** Preserve the Settings walkthrough- and trailer-replay analytics
  identities before moving their click ownership out of inline markup.
- **Conceptual change:** Added explicit `settings.walkthroughAgain` and
  `settings.trailerAgain` analytics actions and contracts for their exact
  generic event names while retaining both inline handlers.
- **Preservation contract:** Exact event names and localized button names,
  Settings dismissal, desktop and phone return-focus differences, the 120 ms
  launch delay, walkthrough manual mode, trailer replay mode, onboarding and
  trailer state, persistence, styling, and accessibility remain unchanged.
- **Risks:** Starting either replay from a new listener in this commit would
  combine metadata with protected modal, timing, focus, and onboarding behavior.
- **Verification:** `npm test` passed all 198 contract tests and the production
  build. Playwright passed 32 protected flows with 70 expected project skips
  across the six required viewport projects; all 18 representative screenshots
  remained unchanged. Migration-ledger verification passed against `v1.0.0`.
- **Rollback:** Revert this commit to restore translation-derived replay
  analytics identities; application and onboarding state remain unaffected.
- **Association:** `codex/migration-05-javascript-modularization`; PR and release pending.

---

## MIG-062 — Prevent analytics bridge global recursion

- **Date:** 2026-07-28
- **Phase:** 5 — JavaScript modularization
- **Type:** Compatibility bug fix, integration boundary, contract, and tests
- **Status:** Implemented and locally verified
- **Intent:** Restore the late-bound analytics interface after a protected
  walkthrough flow exposed classic-script global-name collisions introduced by
  MIG-016.
- **Conceptual change:** Kept the integration module's public export names but
  gave its local wrapper declarations distinct non-global names. Added a bundle
  contract that rejects declarations using the four globals owned by
  `analytics.js`, plus a browser flow that starts the existing inline manual
  walkthrough and exercises analytics calls.
- **Conceptual before/after:** Previously, the classic app bundle declared
  wrappers named `trackEdeniaEvent`, `setEdeniaPersonProperties`,
  `getEdeniaSessionReplayUrl`, and `syncEdeniaAnalyticsState`; those declarations
  could replace the real window functions and recurse. The bundle now only
  reads those window functions through distinctly named local wrappers.
- **Preservation contract:** Analytics remains optional and dynamically
  replaceable; receivers, arguments, return values, event names and properties,
  state-sync ordering, error propagation, internal-test separation, script
  order, deployed filenames, walkthrough behavior, and zero real CI traffic
  remain exact.
- **Risks:** Capturing an analytics function only once would break late loading
  or replacement; renaming public imports would create unrelated churn; changing
  script format could break remaining legacy handlers.
- **Verification:** `npm test` passed all 199 contract tests and the production
  build, including the classic-bundle collision contract. The focused
  walkthrough runtime flow that previously overflowed passed without console or
  page errors. The full Playwright matrix then passed 33 protected flows with
  75 expected project skips; all 18 visual baselines remained unchanged.
  Migration-ledger verification passed against `v1.0.0`.
- **Rollback:** Revert this commit to restore the colliding wrapper declarations;
  no stored data migration is involved, but analytics-calling flows would again
  risk stack overflow until a corrected bridge is redeployed.
- **Association:** `codex/migration-05-javascript-modularization`; PR and release pending.

---

## MIG-063 — Migrate Settings replay actions

- **Date:** 2026-07-28
- **Phase:** 5 — JavaScript modularization
- **Type:** Event ownership, compatibility bridge reduction, and tests
- **Status:** Implemented and locally verified
- **Intent:** Move the walkthrough- and trailer-replay clicks into a bounded
  Settings module without changing either protected flow.
- **Conceptual change:** Added fixed replay hooks and an idempotent direct
  listener binder for both static buttons, installed it from the composition
  entry point, removed the inline handlers, and removed
  `showWalkthroughAgain` and `showTrailerAgain` from the temporary legacy
  bridge. Both original replay functions and their internal call ordering remain.
- **Preservation contract:** Zero-argument calls, synchronous Settings close,
  the 120 ms launch delay, manual walkthrough mode, trailer replay mode and
  return CTA, main-application inertness, desktop focus restoration,
  phone-only return-focus suppression, state and locale continuity, native
  keyboard activation, target-before-document ordering, exact analytics,
  styling, persistence, and accessibility remain unchanged.
- **Risks:** Forwarding the event or duplicating replay logic in the binder
  could alter timing and state; retaining Settings return focus on phone would
  disrupt walkthrough focus; changing replay mode would restart onboarding.
- **Verification:** `npm test` passed all 202 contract tests and the production
  build. The analytics-ownership, desktop replay, and phone focus flows passed
  together with 3 protected passes and 15 expected project skips. The full
  Playwright matrix then passed 35 protected flows with 85 expected project
  skips, including Enter, Space, 120 ms handoff ordering, manual walkthrough,
  trailer replay, inertness, responsive focus, storage, bridge, and
  document-order assertions; all 18 visual baselines remained unchanged.
  Migration-ledger verification passed against `v1.0.0`.
- **Rollback:** Revert this commit to restore both inline handlers and bridge
  entries while retaining MIG-061 analytics metadata; no stored data migration
  is required.
- **Association:** `codex/migration-05-javascript-modularization`; PR and release pending.

---

## MIG-064 — Lock Activity Log pagination analytics identity

- **Date:** 2026-07-28
- **Phase:** 5 — JavaScript modularization
- **Type:** Compatibility metadata, analytics contract, and tests
- **Status:** Implemented and locally verified
- **Intent:** Preserve the generated phone Activity Log pagination control's
  handler-derived analytics identity before moving click ownership.
- **Conceptual change:** Added an explicit
  `showOlderActivityLogEntries` analytics action and a contract for the exact
  normalized generic event name while retaining the generated inline handler.
- **Preservation contract:** The
  `show_older_activity_log_entries_clicked` event, localized button name,
  phone-only visibility, 20-entry page size, Anki grouping, current filter,
  rerendering, native keyboard activation, persistence, styling, and
  accessibility remain exact.
- **Risks:** Allowing identity to fall back to localized visible copy after
  handler removal would fragment analytics; changing pagination in this commit
  would combine metadata with generated-DOM lifecycle risk.
- **Verification:** `npm test` passed all 204 contract tests and the production
  build. Playwright passed 35 protected flows with 85 expected project skips
  across the six required viewport projects; all 18 representative screenshots
  remained unchanged. Migration-ledger verification passed against `v1.0.0`.
- **Rollback:** Revert this commit to restore handler-derived analytics
  identity; Activity Log and application state remain unaffected.
- **Association:** `codex/migration-05-javascript-modularization`; PR and release pending.

---

## MIG-065 — Migrate Activity Log pagination action

- **Date:** 2026-07-28
- **Phase:** 5 — JavaScript modularization
- **Type:** Generated event ownership, compatibility bridge reduction, and tests
- **Status:** Implemented and locally verified
- **Intent:** Move the phone Activity Log pagination click from regenerated
  inline markup into a listener owned by the stable Activity Log list.
- **Conceptual change:** Added a semantic show-older hook, installed one
  idempotent delegated listener on `#activityLogList`, removed the generated
  inline handler, and removed `showOlderActivityLogEntries` from the temporary
  legacy bridge. The pagination function and renderer remain unchanged.
- **Preservation contract:** Zero-argument invocation, stable-root
  child-before-document ordering, phone-only visibility, 20-entry increments,
  filter-driven reset, standard and points views, Anki grouping, regenerated
  control activation by mouse, Enter and Space, exact analytics, transient
  runtime state, styling, persistence, and accessibility remain unchanged.
- **Risks:** Direct binding to each generated button would be lost after
  rerender; delegation from document would run after analytics; retaining a
  detached control after the callback could alter lifecycle assumptions.
- **Verification:** All 207 contract tests and the production build passed. The
  focused phone pagination flow passed, including generated-button replacement,
  keyboard activation, filter reset, storage preservation, event ordering, and
  bridge removal. The complete Playwright matrix passed 36 protected flows with
  90 intentional project skips across all six required viewports; all 18
  representative screenshots remained unchanged. Diff and migration-ledger
  verification passed against `v1.0.0`.
- **Rollback:** Revert this commit to restore the generated inline handler and
  bridge entry while retaining MIG-064 analytics metadata; no stored data
  migration is required.
- **Association:** `codex/migration-05-javascript-modularization`; PR and release pending.

---

## MIG-066 — Lock city level-up analytics identity

- **Date:** 2026-07-28
- **Phase:** 5 — JavaScript modularization
- **Type:** Compatibility metadata, analytics contract, and tests
- **Status:** Implemented and locally verified
- **Intent:** Preserve the city level-up control's localization-derived
  analytics identity before moving click ownership out of its inline handler.
- **Conceptual change:** Added the explicit `city.levelUp` analytics action and
  a contract for its exact normalized generic event name while retaining the
  existing `claimCityLevelUp()` inline handler.
- **Preservation contract:** The `city_level_up_clicked` identity, localized
  button name, initial disabled and hidden state, earned-level gating, staged
  persistence, Activity Log entry, city rerender, confetti, toast, walkthrough
  target, event ordering, styling, and accessibility remain unchanged. The
  existing outcome-dependent suppression of the generic event after a final
  earned-level claim is explicitly preserved.
- **Risks:** Removing the handler before locking metadata would make analytics
  depend on localized visible copy; moving event ownership in this metadata
  commit could accidentally emit a click event after a final claim disables the
  control.
- **Verification:** All 209 contract tests and the production build passed. The
  complete Playwright matrix passed 36 protected flows with 90 intentional
  project skips across all six required viewports; all 18 representative
  screenshots remained unchanged. Diff and migration-ledger verification
  passed against `v1.0.0`.
- **Rollback:** Revert this commit to restore localization-derived analytics
  identity; no stored state or city progress migration is required.
- **Association:** `codex/migration-05-javascript-modularization`; PR and release pending.

---

## MIG-067 — Migrate city level-up action

- **Date:** 2026-07-28
- **Phase:** 5 — JavaScript modularization
- **Type:** Static event ownership, compatibility bridge reduction, and tests
- **Status:** Implemented and locally verified
- **Intent:** Move the city level-up click from global inline dispatch into a
  feature-owned listener without moving or rewriting the claim operation.
- **Conceptual change:** Added a semantic claim hook and one idempotent direct
  listener on `#levelUpButton`, removed the inline handler, and removed
  `claimCityLevelUp` from the temporary legacy bridge. The state-changing
  function remains lexical in the composition entry point.
- **Preservation contract:** Zero-argument target-before-document invocation,
  earned-level calculations, state normalization, automatic backup, save and
  analytics order, Activity Log shape, full rerender, successive pending
  levels, confetti replacement, toast, native mouse and keyboard activation,
  walkthrough observation, styles, copy, and accessibility remain unchanged.
  A final earned-level claim still disables the control before generic
  analytics and therefore emits no `city_level_up_clicked` event; an
  intermediate claim still leaves the control enabled and emits that event.
- **Risks:** Document delegation would observe the click before the claim and
  incorrectly track final claims; forwarding the event or changing save order
  could alter walkthrough, persistence, or analytics behavior.
- **Verification:** All 212 contract tests and the production build passed. The
  focused desktop flow passed final and successive claims, mouse and keyboard
  activation, persistence, automatic-backup shape, Activity Log shape, rerender
  timing, bridge removal, and outcome-dependent generic analytics. The complete
  Playwright matrix passed 37 protected flows with 95 intentional project skips
  across all six required viewports; all 18 representative screenshots remained
  unchanged. Diff and migration-ledger verification passed against `v1.0.0`.
- **Rollback:** Revert this commit to restore the inline handler and bridge
  entry while retaining MIG-066 analytics metadata; no stored data migration is
  required.
- **Association:** `codex/migration-05-javascript-modularization`; PR and release pending.

---

## MIG-068 — Lock history-period option analytics identity

- **Date:** 2026-07-28
- **Phase:** 5 — JavaScript modularization
- **Type:** Compatibility metadata, analytics contract, and tests
- **Status:** Implemented and locally verified
- **Intent:** Preserve the generated Study History period option's
  handler-derived analytics identity before moving selection ownership.
- **Conceptual change:** Added an explicit `setHistoryPeriodForRange` analytics
  action and a contract for the exact normalized generic event name while
  retaining the generated inline handler.
- **Preservation contract:** The
  `set_history_period_for_range_clicked` event, localized period label, option
  ordering, active state, `aria-pressed`, runtime-only selection, popover
  closure, history rerender, native keyboard activation, storage, styling, and
  accessibility remain unchanged.
- **Risks:** Removing the handler before locking metadata would make analytics
  depend on localized week or month labels; changing selection ownership in
  this commit would combine metadata with generated-DOM lifecycle risk.
- **Verification:** All 214 contract tests and the production build passed. The
  complete Playwright matrix passed 37 protected flows with 95 intentional
  project skips across all six required viewports; all 18 representative
  screenshots remained unchanged. Diff and migration-ledger verification
  passed against `v1.0.0`.
- **Rollback:** Revert this commit to restore handler-derived analytics
  identity; Study History runtime selection and stored state remain unaffected.
- **Association:** `codex/migration-05-javascript-modularization`; PR and release pending.

---

## MIG-069 — Migrate history-period option action

- **Date:** 2026-07-28
- **Phase:** 5 — JavaScript modularization
- **Type:** Generated event ownership, compatibility bridge reduction, and tests
- **Status:** Implemented and locally verified
- **Intent:** Move generated week and month period selection from inline global
  dispatch into listeners owned by the two stable Study History popovers.
- **Conceptual change:** Added semantic selection, range, and period-key
  metadata; installed idempotent delegated listeners on the week and month
  popover roots; removed the generated inline handler; and removed only
  `setHistoryPeriodForRange` from the temporary legacy bridge. Static range
  toggles and `toggleHistoryPeriodPopover` remain bridged.
- **Preservation contract:** Live range and key forwarding, runtime-only
  selection, invalid-range fallback, option ordering and labels, active and
  `aria-pressed` state, popover closure, action-before-document ordering, full
  history rerender, mouse and keyboard activation, exact analytics, styling,
  persistence, and accessibility remain unchanged.
- **Risks:** The callback rebuilds both option lists synchronously, so reading
  metadata after invocation would reference a detached control; document
  delegation could reverse action and analytics ordering.
- **Verification:** All 218 contract tests and the production build passed. The
  focused desktop flow passed generated week and month selection, mouse and
  keyboard activation, action-before-document rerendering, popover state,
  runtime-only persistence, and selective bridge removal. The complete
  Playwright matrix passed 38 protected flows with 100 intentional project skips
  across all six required viewports; all 18 representative screenshots remained
  unchanged. Diff and migration-ledger verification passed against `v1.0.0`.
- **Rollback:** Revert this commit to restore the generated inline handler and
  bridge entry while retaining MIG-068 analytics metadata; no stored data
  migration is required.
- **Association:** `codex/migration-05-javascript-modularization`; PR and release pending.

---

## MIG-070 — Lock saved-video search-result analytics identity

- **Date:** 2026-07-28
- **Phase:** 5 — JavaScript modularization
- **Type:** Compatibility metadata, analytics contract, and tests
- **Status:** Contract-verified; paired browser gate pending
- **Intent:** Preserve the generated saved-video search result's
  handler-derived analytics identity before moving result selection ownership.
- **Conceptual change:** Added an explicit `jumpToVideoFromSearch` analytics
  action and a contract for the exact normalized generic event name while
  retaining the generated inline handler.
- **Preservation contract:** The `jump_to_video_from_search_clicked` event,
  visible result label, result ordering, video identifier, search selection
  analytics, popover closure, forced feed rendering, deferred scroll and
  highlight, input Enter activation, storage, styling, and accessibility remain
  unchanged.
- **Risks:** Removing the handler before locking metadata would make analytics
  depend on localized visible result copy; combining listener ownership with
  this commit would obscure generated-root and deferred-scroll regressions.
- **Verification:** All 220 contract tests, the production build, diff checks,
  and migration-ledger verification passed against `v1.0.0`. Because this is
  inert compatibility metadata with the original inline behavior retained, its
  browser and visual gate is intentionally coupled to MIG-071; that commit must
  pass the focused result-selection flow and complete visual matrix before
  either commit is mergeable.
- **Rollback:** Revert this commit to restore handler-derived analytics
  identity; search runtime state and persisted application data remain
  unaffected.
- **Association:** `codex/migration-05-javascript-modularization`; PR and release pending.

---

## MIG-071 — Migrate saved-video search-result action

- **Date:** 2026-07-28
- **Phase:** 5 — JavaScript modularization
- **Type:** Generated event ownership, compatibility bridge reduction, and tests
- **Status:** Implemented and locally verified
- **Intent:** Move generated saved-video result selection from inline global
  dispatch into a listener owned by the stable search-results root.
- **Conceptual change:** Added a semantic result-selection hook, installed one
  idempotent delegated listener on `#videoSearchResults`, removed the generated
  inline handler, and removed only `jumpToVideoFromSearch` from the temporary
  legacy bridge. The search renderer, keyboard handler, selection operation,
  feed renderer, and scroll helper remain in place.
- **Preservation contract:** Live video-ID forwarding, nested-target clicks,
  direct mouse and keyboard activation, input Enter's synthetic click,
  `search_result_selected` before generic click analytics, synchronous popover
  closure and forced feed rendering, zero-delay scroll and `flash-target`,
  filters, result ordering, missing-video warnings, storage, styling, focus, and
  accessibility remain unchanged.
- **Risks:** Reading the result after selection can observe detached markup;
  document delegation could reverse selection and generic analytics ordering;
  replacing the input Enter pathway could double-activate a result.
- **Verification:** All 224 contract tests and the production build passed. The
  focused desktop flow passed nested result selection, live ID forwarding,
  `search_result_selected` before generic analytics, synchronous forced feed
  rendering, deferred highlighting, input Enter activation, storage
  preservation, and selective bridge removal. The complete Playwright matrix
  passed 39 protected flows with 105 intentional project skips across all six
  required viewports; all 18 representative screenshots remained unchanged.
  This also closes MIG-070's paired browser gate. Diff and migration-ledger
  verification passed against `v1.0.0`.
- **Rollback:** Revert this commit to restore the generated inline handler and
  bridge entry while retaining MIG-070 analytics metadata; no stored data
  migration is required.
- **Association:** `codex/migration-05-javascript-modularization`; PR and release pending.

---

## MIG-072 — Migrate feedback submission action

- **Date:** 2026-07-28
- **Phase:** 5 — JavaScript modularization
- **Type:** Form event ownership, compatibility bridge reduction, and tests
- **Status:** Complete locally; remote PR and release pending
- **Intent:** Move feedback form submission from inline global dispatch into a
  feature-owned listener without moving or rewriting the submission operation.
- **Conceptual change:** Added a semantic submit hook, installed one idempotent
  direct `submit` listener on `#feedbackForm`, removed the inline handler, and
  removed `submitFeedback` from the temporary legacy bridge. The original event
  is passed synchronously to the lexical submission function.
- **Preservation contract:** Native required and email validation, implicit and
  submit-button activation, original-event identity and `currentTarget`, trimmed
  fields, category defaulting, feedback ID and timestamp generation, local-only
  bypass, replay URL and analytics order, unavailable and required-message
  errors, form reset, busy and disabled state cleanup, modal and confirmation
  focus, exact analytics properties, storage, styling, and accessibility remain
  unchanged.
- **Risks:** Passing the form or a synthetic event would break `FormData` and
  `currentTarget`; binder-owned cancellation would change native validation;
  deferring the callback could invalidate event context and reorder analytics.
- **Verification:** `npm test` passed the production build and all 230 contract
  tests. The focused desktop feedback-submission flow passed. The complete
  Playwright matrix passed 40 protected flows with 110 intentional project
  skips across all six target viewports; all 18 golden screenshots remained
  unchanged. Migration-ledger and diff-integrity checks passed.
- **Rollback:** Revert this commit to restore the inline submit handler and
  bridge entry; no stored application state migration is required.
- **Association:** `codex/migration-05-javascript-modularization`; PR and release pending.

---

## MIG-073 — Lock Settings locale-trigger analytics identity

- **Date:** 2026-07-28
- **Phase:** 5 — JavaScript modularization
- **Type:** Analytics compatibility metadata and contract test
- **Status:** Complete locally; paired listener migration pending
- **Intent:** Preserve the Settings locale trigger's existing handler-derived
  analytics identity before its inline event owner is replaced.
- **Conceptual change:** Added explicit inert `data-analytics-action` metadata
  with the exact existing `settingsLocaleBtn` identity and a contract that locks
  the resulting `settings_locale_btn_clicked` event name. The inline handler
  remains installed in this commit.
- **Preservation contract:** The trigger's visible locale label, native button
  activation, propagation stopping, menu state, focus, outside-click and Escape
  behavior, language selection, localization, persistence, Activity Log, toast,
  and absence of generic click capture while propagation is stopped remain
  unchanged.
- **Risks:** A renamed action would silently change the latent event contract if
  propagation behavior changes later; altering the inline handler in this
  metadata commit would combine compatibility and ownership changes.
- **Verification:** The production build and contract suite passed. Migration
  ledger and diff-integrity checks passed against `v1.0.0`. Because the metadata
  is inert and the original inline behavior remains, its browser and visual gate
  is intentionally coupled to MIG-074.
- **Rollback:** Revert this commit to restore implicit ID-derived identity; no
  application state or stored data is affected.
- **Association:** `codex/migration-05-javascript-modularization`; PR and release pending.

---

## MIG-074 — Migrate Settings locale-picker actions

- **Date:** 2026-07-28
- **Phase:** 5 — JavaScript modularization
- **Type:** Static and generated event ownership, compatibility bridge reduction,
  and tests
- **Status:** Complete locally; remote PR and release pending
- **Intent:** Move the Settings-only locale trigger and generated radio changes
  from inline global dispatch into scoped listeners while preserving all locale
  business behavior.
- **Conceptual change:** Added semantic trigger and selection hooks, installed a
  direct trigger listener plus a delegated `change` listener on the stable
  Settings locale menu, removed the two Settings inline handlers, and removed
  only `toggleLocaleMenu` and `saveLocaleFromSettings` from the temporary legacy
  bridge. Intro and onboarding locale flows remain untouched.
- **Preservation contract:** Exact native event and radio-value forwarding,
  stopped click propagation, latent analytics identity, locale order and labels,
  same-locale no-op, menu positioning and close quirks, outside-click and Escape
  behavior, subtree replacement, focus behavior, translations, document
  language and title, theme label, Activity Log, toast, persistence, config
  cookie, analytics synchronization, environment isolation, rendering, styling,
  and accessibility remain unchanged.
- **Risks:** Document-level click delegation would receive no stopped trigger
  event; direct listeners on generated radios would be lost during translation;
  reading a radio after selection would observe a detached node; separating
  Escape handling could unintentionally keep Settings open.
- **Verification:** `npm test` passed the production build and all 238 contract
  tests. The focused desktop locale flow passed stopped propagation,
  same-locale no-op, native keyboard activation, menu positioning and cleanup,
  current Escape behavior, translated state/cookie/UI/log/toast ordering, menu
  rebuild survival, and selective bridge removal. The complete Playwright matrix
  passed 41 protected flows with 115 intentional project skips across all six
  target viewports; all 18 golden screenshots remained unchanged. This also
  closes MIG-073's paired browser gate. Migration-ledger and diff-integrity
  checks passed.
- **Rollback:** Revert this commit to restore the Settings inline handlers and
  bridge entries while retaining MIG-073 analytics metadata; stored locale state
  requires no migration.
- **Association:** `codex/migration-05-javascript-modularization`; PR and release pending.

---

## MIG-075 — Lock Settings sync analytics identities

- **Date:** 2026-07-28
- **Phase:** 5 — JavaScript modularization
- **Type:** Analytics compatibility metadata and contract tests
- **Status:** Complete locally; paired listener migration pending
- **Intent:** Preserve the Settings sync export and import buttons' existing
  translation-derived analytics identities before replacing their inline event
  ownership.
- **Conceptual change:** Added explicit inert analytics metadata with the exact
  existing `settings.sync.export` and `settings.sync.import` action values and
  contracts for their normalized generic event names. Both inline behaviors
  remain installed in this commit.
- **Preservation contract:** Native button and file-picker activation, labels,
  generic click names and ordering, download payload and filename, import
  validation, FileReader timing, backups, storage domains, Activity Log,
  localization, analytics synchronization, Settings continuity, toasts, error
  paths, focus, styling, and accessibility remain unchanged.
- **Risks:** Renamed actions would silently split analytics history; changing
  picker or file-input ownership in this metadata commit would combine
  compatibility and behavior changes.
- **Verification:** The production build and contract suite passed. Migration
  ledger and diff-integrity checks passed against `v1.0.0`. Because this
  metadata is inert and retains all inline behavior, its browser and visual
  gate is intentionally coupled to MIG-076.
- **Rollback:** Revert this commit to restore translation-derived analytics
  identity; no application state or stored data is affected.
- **Association:** `codex/migration-05-javascript-modularization`; PR and release pending.

---

## MIG-076 — Migrate Settings sync actions

- **Date:** 2026-07-28
- **Phase:** 5 — JavaScript modularization
- **Type:** Static event ownership, native file activation, compatibility bridge
  reduction, and tests
- **Status:** Complete locally; remote PR and release pending
- **Intent:** Move Settings sync export, file selection, and import changes from
  inline global dispatch into scoped direct listeners without moving sync
  business logic.
- **Conceptual change:** Added semantic hooks to both sync buttons and the
  existing hidden file input, installed idempotent direct listeners, removed all
  three inline handlers, and removed only `exportSyncFile` and
  `importSyncFileFromInput` from the temporary legacy bridge. The picker click
  remains synchronous inside the visible import-button activation.
- **Preservation contract:** Native Enter/Space and trusted picker activation,
  exact zero-argument export and input-element import calls, generic click
  identities and ordering, file acceptance and single-file behavior, export
  envelope, timestamp, sandbox marker, filename and cleared reminders, import
  validation, legacy raw-file compatibility, sandbox targeting, FileReader
  timing and clearing, rollback backups, state normalization, storage and cookie
  ordering, locale/theme/UI application, Activity Log language timing, analytics
  synchronization, Settings continuity, toasts, failure quirks, focus, styling,
  and accessibility remain unchanged.
- **Risks:** Deferred or document-delegated picker activation could lose browser
  user activation; forwarding the change event instead of the input would break
  file access; changing callback order could move generic analytics ahead of
  sync work.
- **Verification:** `npm test` passed the production build and all 246 contract
  tests. The focused desktop sync flow passed keyboard export, exact download
  envelope and filename, cleared-reminder export compatibility, storage
  invariance, synchronous nested picker activation, generic analytics ordering,
  successful import with rollback backup and old-locale log/new-locale toast
  timing, UI/cookie application, input clearing and reuse, invalid-JSON
  non-mutation, and selective bridge removal. The complete Playwright matrix
  passed 42 protected flows with 120 intentional project skips across all six
  target viewports; all 18 golden screenshots remained unchanged. This also
  closes MIG-075's paired browser gate. Migration-ledger and diff-integrity
  checks passed.
- **Rollback:** Revert this commit to restore the three inline handlers and two
  bridge entries while retaining MIG-075 analytics metadata; stored state and
  sync-file formats require no migration.
- **Association:** `codex/migration-05-javascript-modularization`; PR and release pending.

---

## MIG-077 — Lock city-waveform selection analytics identity

- **Date:** 2026-07-28
- **Phase:** 5 — JavaScript modularization
- **Type:** Generated-control semantics, analytics compatibility metadata, and
  contract tests
- **Status:** Complete locally; paired listener migrations pending
- **Intent:** Preserve generated city waveform bars' existing handler-derived
  selection identity before replacing their inline event ownership.
- **Conceptual change:** Added an explicit selection hook and inert
  `selectCityWaveBar` analytics metadata to generated bars, plus contracts for
  their current data, ARIA, four inline-handler, and normalized generic-event
  identities. All current handlers remain installed in this commit.
- **Preservation contract:** Timeline range and ordering, bar geometry and
  classes, localized ARIA labels, selected and activity markers, hover/focus
  preview, click/keyboard selection, detached-target analytics ordering,
  tooltip and boosts, scroll centering, touch drag and click suppression,
  runtime-only city offset, storage, styling, and accessibility remain
  unchanged.
- **Risks:** A renamed action would split generic analytics history; changing
  event ownership in the metadata commit would combine compatibility and
  lifecycle changes; document delegation could later reverse detached-target
  ordering.
- **Verification:** The production build and contract suite passed. Migration
  ledger and diff-integrity checks passed against `v1.0.0`. Because this
  metadata is inert and all inline handlers remain, its browser and visual gate
  is intentionally coupled to the following city-waveform listener commits.
- **Rollback:** Revert this commit to restore handler-derived selection
  identity; city runtime and persisted state remain unaffected.
- **Association:** `codex/migration-05-javascript-modularization`; PR and release pending.

---

## MIG-078 — Migrate coupled Settings preference actions

- **Date:** 2026-07-28
- **Phase:** 5 — JavaScript modularization
- **Type:** Static event ownership, compatibility bridge reduction, and tests
- **Status:** Complete locally; remote PR and release pending
- **Intent:** Move the Shorts, Anki, and Study Insights checkbox changes from
  one shared inline global action into direct scoped listeners without splitting
  or rewriting their coupled save operation.
- **Conceptual change:** Added one semantic ownership hook to each of the three
  static checkboxes, installed idempotent direct `change` listeners that invoke
  the existing async save operation with zero arguments, removed all three
  inline handlers together, and removed `saveSettingsOnTheFly` from the
  temporary legacy bridge.
- **Preservation contract:** Native checkbox and label activation, uncancelled
  bubbling changes, cross-control reads and writes, pre-await versus post-await
  timing, Anki capability gating and integration requests, Shorts filtering and
  unawaited repair/refetch work, Study Insight visibility and retained history,
  Activity Log, streak, backups, primary storage, config cookie, state-derived
  analytics, rendering order, environment isolation, coarse-pointer and phone
  behavior, focus, styling, and accessibility remain unchanged. No generic
  checkbox click events are added.
- **Risks:** Passing or awaiting the event in the binder could alter propagation;
  splitting the callbacks could change shared backup and render ordering;
  awaiting or serializing saves could remove the existing Anki timing
  asymmetry; deriving Anki from a hidden coarse-pointer control could overwrite
  the stored desktop preference.
- **Verification:** `npm test` passed 253 contract tests and the production
  build. Focused desktop timing and tablet/phone coarse-pointer flows passed.
  The complete six-viewport Playwright matrix passed with 45 tests and 129
  intentional skips; all 18 protected screenshots remained unchanged.
  Migration-ledger and diff-integrity checks passed.
- **Rollback:** Revert this commit to restore all three inline handlers and the
  shared bridge entry; no stored preference schema migration is required.
- **Association:** `codex/migration-05-javascript-modularization`; PR and release pending.

---

## MIG-079 — Migrate the static city waveform mouse lifecycle

- **Date:** 2026-07-28
- **Phase:** 5 — JavaScript modularization
- **Type:** Static event ownership, compatibility bridge reduction, and tests
- **Status:** Complete locally; remote PR and release pending
- **Intent:** Move only the city timeline container's desktop mouse lifecycle
  from inline global actions into a scoped listener module.
- **Conceptual change:** Added a semantic ownership hook to the static waveform,
  installed idempotent direct `mouseenter`, `mousemove`, and `mouseleave`
  listeners, removed the three matching inline attributes, and removed
  `handleCityWaveformMouseMove` and `clearCityWaveformPreview` from the
  temporary legacy bridge while retaining both lexical functions.
- **Preservation contract:** Exact mouse event types, event versus zero-argument
  callback signatures, uncancelled propagation, desktop edge direction and
  animation-frame scrolling, closest-bar preview, mouse-leave cancellation and
  city restoration, non-scrollable behavior, the `≤640px` mouse no-op, phone
  pointer hit-testing, touch navigation, storage, Activity Log, analytics,
  focus, styling, accessibility, and generated waveform-bar handlers remain
  unchanged. The existing outside-click path continues to call the lexical
  clear operation.
- **Risks:** Pointer-event substitution could change touch behavior;
  document-level delegation could reorder outer handlers; forwarding an event
  to the clear callback could alter its contract; removing the clear function
  itself would break outside-click cleanup.
- **Verification:** `npm test` passed 257 contract tests and the production
  build. The focused desktop/phone waveform flow passed. The complete
  six-viewport Playwright matrix passed with 47 tests and 133 intentional
  skips; all 18 protected screenshots remained unchanged. Migration-ledger and
  diff-integrity checks passed.
- **Rollback:** Revert this commit to restore the three inline waveform
  attributes and two bridge entries; no state or storage migration is required.
- **Association:** `codex/migration-05-javascript-modularization`; PR and release pending.

---

## MIG-080 — Migrate generated city waveform bar actions

- **Date:** 2026-07-28
- **Phase:** 5 — JavaScript modularization
- **Type:** Generated event ownership, compatibility bridge reduction, and tests
- **Status:** Complete locally; remote PR and release pending
- **Intent:** Move the generated city timeline bars from inline global actions
  into direct listeners while preserving their target-level event order.
- **Conceptual change:** Added a per-render binder for every generated waveform
  bar, attached direct `click`, `mouseenter`, `mousemove`, and `focus`
  listeners after each track rebuild, removed the four inline attributes, and
  removed `selectCityWaveBar` and `previewCityWaveBar` from the temporary legacy
  bridge while retaining both lexical functions for touch and scroll paths.
- **Preservation contract:** Live bar identity and datasets, mouse/focus preview,
  neighboring height boosts, tooltip positioning, runtime-only selection,
  native Enter/Space activation, focus loss after replacement, detached-target
  generic analytics, selection-before-analytics ordering, the existing second
  outside-click rerender, repeated rebinding, exact event names/properties,
  storage and Activity Log immutability, phone pointer hit-testing, custom touch
  drag/click suppression, desktop edge scrolling, styling, accessibility, and
  responsive behavior remain unchanged.
- **Risks:** Delegation would change non-bubbling mouse/focus behavior and
  detached-target ordering; failing to bind after every `innerHTML` replacement
  would leave later bars inert; moving analytics ahead of selection would
  change cleanup and event state; pointer or keyboard substitutions could
  duplicate touch or native button activation.
- **Verification:** `npm test` passed 260 contract tests and the production
  build. The focused desktop/phone waveform-bar flow passed. The complete
  six-viewport Playwright matrix passed with 49 tests and 137 intentional
  skips; all 18 protected screenshots remained unchanged. Migration-ledger and
  diff-integrity checks passed.
- **Rollback:** Revert this commit to restore generated inline handlers and the
  two bridge entries; no stored state migration is required.
- **Association:** `codex/migration-05-javascript-modularization`; PR and release pending.

---

## MIG-081 — Lock backup Restore action metadata

- **Date:** 2026-07-29
- **Phase:** 5 — JavaScript modularization
- **Type:** Compatibility metadata and contract tests
- **Status:** Complete locally; remote PR and release pending
- **Intent:** Preserve the generated backup Restore button's current analytics
  identity before moving its inline handler into module-owned listeners.
- **Conceptual change:** Added an inert Settings backup ownership hook and an
  explicit `restoreStateBackup` analytics action to the generated Restore
  button while retaining its existing inline handler and global bridge.
- **Preservation contract:** Restore availability and ordering, live backup ID,
  visible localized label, native button activation, focus, detached-target
  generic analytics, `restore_state_backup_clicked` name and properties,
  storage, rollback backup, Activity Log, locale/theme restoration, rendering,
  Settings layout, accessibility, and responsive behavior remain unchanged.
- **Risks:** A renamed analytics action would split historical reporting;
  replacing the live backup ID with rendered-list position would target the
  wrong entry; removing the inline handler before listener ownership exists
  would make Restore inert.
- **Verification:** `npm test` passed 262 contract tests and the production
  build. Migration-ledger and diff-integrity checks passed. Browser and visual
  verification is paired with the subsequent listener migration.
- **Rollback:** Revert this commit to remove only the inert ownership and
  analytics metadata; restore behavior and stored data require no rollback.
- **Association:** `codex/migration-05-javascript-modularization`; PR and release pending.

---

## MIG-082 — Migrate generated backup Restore actions

- **Date:** 2026-07-29
- **Phase:** 5 — JavaScript modularization
- **Type:** Generated event ownership, compatibility bridge reduction, and tests
- **Status:** Complete locally; remote PR and release pending
- **Intent:** Move generated backup Restore buttons from the inline global
  action into direct per-render listeners without changing restoration.
- **Conceptual change:** Added an idempotent binder that reads each Restore
  control's live backup ID at click time, binds every populated backup-list
  rebuild, removed the inline handler, and removed `restoreStateBackup` from the
  temporary legacy bridge while retaining the lexical restoration function.
- **Preservation contract:** Validated/sorted backup lookup, missing-ID failure,
  rollback creation and ordering, state preparation and reminder/API-key
  cleanup, streak synchronization, pre-restore-locale Activity Log copy,
  persistence without another automatic backup, locale/theme/UI restoration,
  preference and Anki refresh synchronization, Settings continuity, native
  keyboard activation, focus loss after rerender, detached-target analytics,
  exact label/event properties, storage domains, accessibility, and all
  responsive layouts remain unchanged.
- **Risks:** Delegation or a captured list index could select the wrong entry;
  missing a render path would leave replacement controls inert; moving generic
  analytics ahead of restore would change its localized label and state order;
  awaiting or splitting the existing function could change persistence and
  integration sequencing.
- **Verification:** `npm test` passed 265 contract tests and the production
  build. The focused backup Restore flow passed. One unrelated feedback-modal
  keyboard assertion in the first matrix run passed immediately in isolation
  without changes; the complete clean rerun then passed with 50 tests and 142
  intentional skips across all six viewports. All 18 protected screenshots
  remained unchanged. Migration-ledger and diff-integrity checks passed.
- **Rollback:** Revert this commit to restore the generated inline handler and
  bridge entry; no stored state migration is required.
- **Association:** `codex/migration-05-javascript-modularization`; PR and release pending.

---

## MIG-083 — Migrate the Settings Delete data action

- **Date:** 2026-07-29
- **Phase:** 5 — JavaScript modularization
- **Type:** Static event ownership, compatibility bridge reduction, and tests
- **Status:** Complete locally; remote PR and release pending
- **Intent:** Move the existing destructive Settings confirmation action from
  its inline global handler into the scoped reset-confirm module.
- **Conceptual change:** Extended the reset-confirm binder with one direct,
  zero-argument confirm listener, added explicit ownership and the existing
  `settings.reset.delete` analytics identity to Delete data, removed its inline
  handler, and removed `resetApp` from the temporary legacy bridge while
  retaining the lexical reset function.
- **Preservation contract:** The forced pre-reset backup attempt and identical
  backup deduplication, environment-specific default state, localized reset
  Activity Log entry, save without another automatic backup, config cookie,
  immediate reload, retained backup/cache/analytics storage, normal first-run
  trailer/onboarding restart, sandbox URL/storage isolation, sandbox baseline
  channels/date, one-time post-reset walkthrough handoff, native Enter/Space
  activation, generic analytics, Settings confirmation persistence before the
  action, styling, focus, accessibility, and responsive layouts remain
  unchanged. No extra browser confirmation or storage clearing is added.
- **Risks:** Awaiting persistence or moving reload could change failure
  behavior; clearing broad storage could destroy recovery data; using normal
  keys in sandbox could cross environments; changing the action identity would
  split analytics; hiding the confirmation before reset would change observable
  focus and event order.
- **Verification:** `npm test` passed 265 contract tests and the production
  build. The focused normal/sandbox reset flow passed. The complete
  six-viewport Playwright matrix passed with 51 tests and 147 intentional
  skips; all 18 protected screenshots remained unchanged. Migration-ledger and
  diff-integrity checks passed.
- **Rollback:** Revert this commit to restore the inline Delete data handler and
  bridge entry; backups and state created by any completed reset remain valid.
- **Association:** `codex/migration-05-javascript-modularization`; PR and release pending.

---

## MIG-084 — Migrate Study History period toggle actions

- **Date:** 2026-07-29
- **Phase:** 5 — JavaScript modularization
- **Type:** Static event ownership, compatibility bridge reduction, and tests
- **Status:** Complete locally; remote PR and release pending
- **Intent:** Move the static Study History week and month range triggers from
  inline global handlers into scoped direct listeners without changing their
  responsive or popover behavior.
- **Conceptual change:** Added explicit toggle ownership hooks to the two
  existing range buttons, installed idempotent direct click listeners that pass
  the original event and exact literal range into the existing toggle
  operation, removed both inline handlers, and removed
  `toggleHistoryPeriodPopover` from the temporary legacy bridge while retaining
  the lexical function.
- **Preservation contract:** Original click event and `currentTarget`,
  propagation stopping, uncancelled native activation, selected range and
  runtime-only period state, render timing, current popover-closing order,
  week/month option content, focus, ARIA expansion, keyboard activation,
  styling, translations, storage, Activity Log, analytics silence, and all
  responsive layouts remain unchanged. In particular, an empty range continues
  to open its empty popover on wider layouts while the existing `≤640px` path
  returns before opening or changing the active range.
- **Risks:** Dropping the original event would break closest-cell lookup and
  propagation; delegation could alter target ordering; deriving the range from
  mutable markup could change the inline handler's fixed arguments; moving the
  mobile empty-state guard could alter selected-range state; adding analytics
  metadata would create events that the propagation-stopped inline path did not
  previously emit.
- **Verification:** `npm test` passed 270 contract tests and the production
  build. The focused desktop/phone period-toggle flows passed. The complete
  six-viewport Playwright matrix passed with 53 tests and 151 intentional skips;
  all 18 protected screenshots remained unchanged. Migration-ledger and
  diff-integrity checks passed.
- **Rollback:** Revert this commit to restore the two inline handlers and bridge
  entry; no persisted state or schema rollback is required.
- **Association:** `codex/migration-05-javascript-modularization`; PR and release pending.

---

## MIG-085 — Migrate Study History watched popover shells

- **Date:** 2026-07-29
- **Phase:** 5 — JavaScript modularization
- **Type:** Generated event ownership, compatibility bridge reduction, and tests
- **Status:** Complete locally; remote PR and release pending
- **Intent:** Move only the generated non-empty Study History watched-cell
  popover lifecycle from inline global handlers into direct component
  listeners, leaving nested watched-video navigation for a separate migration.
- **Conceptual change:** Added one scoped ownership hook to each interactive
  watched cell, installed direct `mouseenter`, `mouseleave`, `focusin`,
  `focusout`, and `click` listeners after every History table rebuild, removed
  the five inline attributes, and removed the three shell actions from the
  temporary legacy bridge while retaining their lexical functions.
- **Preservation contract:** Empty watched cells remain inert. Interactive
  cells retain the exact original event and `currentTarget` for opening and
  toggling, zero-argument delayed closing, the 80 ms timer, fine-pointer
  toggling, coarse-pointer open-only clicks, hover and focus behavior,
  propagation stopping, uncancelled native activation, current mutual-popover
  close order, outside-click and Escape dismissal without focus restoration,
  ARIA expansion, translations, styling, storage, Activity Log, analytics
  silence, all responsive layouts, and the still-inline nested video-item
  behavior.
- **Risks:** Delegation would break non-bubbling mouse behavior and change
  `currentTarget`; passing an event to the close callback could change its
  contract; missing a table rebuild would leave replacement cells inert;
  binding empty cells would introduce new UI; pointer-event substitution could
  alter touch behavior; adding analytics metadata would create events that the
  propagation-stopped inline path did not emit.
- **Verification:** `npm test` passed 275 contract tests and the production
  build. The focused fine-pointer desktop and coarse-pointer phone flow passed.
  The complete six-viewport Playwright matrix passed with 55 tests and 155
  intentional skips; all 18 protected screenshots remained unchanged.
  Migration-ledger and diff-integrity checks passed.
- **Rollback:** Revert this commit to restore the five inline shell handlers and
  three bridge entries; no state or storage migration is required.
- **Association:** `codex/migration-05-javascript-modularization`; PR and release pending.
