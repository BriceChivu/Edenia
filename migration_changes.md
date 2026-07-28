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
