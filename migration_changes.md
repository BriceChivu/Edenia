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
