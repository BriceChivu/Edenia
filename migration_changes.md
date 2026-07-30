# Edenia Migration Changes

> **Archived:** The architecture and responsive refactor is complete. This file is
> retained as a historical record and no longer governs commit names or requires
> new entries. Current work uses ordinary pull requests and path-selected CI.

This append-only ledger records every conceptual change made during the conservative
architecture and responsive migration. During that migration, each commit added an
entry whose `MIG-###` identifier matched the commit subject.

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

## MIG-104 — Migrate Next Study open and focus event ownership

- **Date:** 2026-07-29
- **Phase:** 5 — JavaScript modularization
- **Type:** Behavior-neutral event-listener extraction and compatibility cleanup
- **Status:** Complete locally; remote PR and release pending
- **Intent:** Replace the generated Next Study open and focus inline handlers
  with direct, component-scoped listeners while keeping their existing
  callbacks and exact event behavior.
- **Conceptual change:** Added a Next Study action adapter with separate `open`
  and `focus` hooks. Every Continue, Watch, Watch again, phone-overlay open, and
  desktop/tablet focus control now carries an explicit module hook and binds
  immediately after the populated recommendation markup is inserted. The
  adapter forwards the exact click event and live video ID, ignores callback
  return values like a native event listener, and supports replacement renders.
  Removed only `openNextStudyVideoPlayer` and `focusNextStudyVideoCard` from the
  temporary global action bridge; both implementation functions remain local
  composition callbacks.
- **Preservation contract:** Preserve all recommendation selection precedence,
  variants, labels, classes, ARIA, thumbnails, state, and responsive visibility.
  Open still cancels before validation, returns false internally, launches the
  existing embedded-player path, retains `channel_shelf` analytics properties,
  and suppresses its generic click event. Focus still performs its `≤640px`
  early return without cancellation, and above that width keeps forced-feed
  rendering, scroll/highlight, reduced-motion timing, and preview behavior.
  Preserve the latent phone focus identity, the existing Set aside adapter and
  surface, and the still-inline Remove favorite handler and shared Favorite
  bridge for neighboring video cards.
- **Risks:** Missing a post-render bind would leave newly generated controls
  inert; delegation or failure to forward the native event could alter
  propagation and analytics; interpreting callback return values could change
  navigation semantics; removing the shared Favorite bridge would break
  unrelated card and shelf consumers.
- **Verification:** `npm test` passed: the production build completed and all
  390 contract tests passed, including exact event/live-ID forwarding,
  callback-return neutrality, idempotent replacement binding, all five
  generated ownership hooks, post-render composition order, continued open
  suppression and width-gated focus behavior, the two bridge removals, and the
  retained Set aside and Remove favorite ownership boundaries. Browser,
  local-server, visual-regression, migration-ledger, diff-integrity, and
  static-review checks were not run in accordance with the repository
  `AGENTS.md` instruction for this task.
- **Rollback:** Revert this commit to restore the five inline handlers and the
  two matching bridge aliases; no state, storage, analytics, or data migration
  is required.
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

---

## MIG-086 — Migrate Study History watched-video actions

- **Date:** 2026-07-29
- **Phase:** 5 — JavaScript modularization
- **Type:** Generated event ownership, compatibility bridge reduction, and tests
- **Status:** Complete locally; remote PR and release pending
- **Intent:** Move the nested generated watched-video navigation items from
  their inline global handler into direct component listeners without changing
  any destination or responsive behavior.
- **Conceptual change:** Added a scoped jump ownership hook to each generated
  watched-video item, installed direct listeners after every History table
  rebuild that pass the original click event and live video ID into the
  existing navigation operation, removed the inline handler, and removed
  `jumpToWatchedVideo` from the temporary legacy bridge while retaining the
  lexical function.
- **Preservation contract:** Native button activation, original event and
  `currentTarget`, immediate propagation stopping, analytics silence, live
  video-ID lookup, stale-item warning and closure, watched non-favorite filter
  reset, Watched-section expansion, rerender and 2200 ms arrival highlight,
  desktop shelf focus and delayed preview, `≤640px` rerender and zero-delay card
  scroll/flash, current toasts, storage, Activity Log, focus, styling,
  accessibility, translations, and all responsive layouts remain unchanged.
- **Risks:** Delegation could allow the shell click to run after the nested item;
  capturing a rendered index instead of the live ID could navigate to the wrong
  video; omitting the original event would break desktop default prevention and
  propagation; missing a table rebuild would leave replacement items inert;
  unifying desktop and phone navigation would alter established behavior;
  adding analytics metadata would create events the stopped inline path did not
  emit.
- **Verification:** `npm test` passed 280 contract tests and the production
  build. The focused desktop watched/filter/highlight branch and phone active
  scroll/flash branch passed. The complete six-viewport Playwright matrix passed
  with 57 tests and 159 intentional skips; all 18 protected screenshots
  remained unchanged. Migration-ledger and diff-integrity checks passed.
- **Rollback:** Revert this commit to restore the generated inline handler and
  bridge entry; no state or storage migration is required.
- **Association:** `codex/migration-05-javascript-modularization`; PR and release pending.

---

## MIG-087 — Migrate Study History points popover shells

- **Date:** 2026-07-29
- **Phase:** 5 — JavaScript modularization
- **Type:** Generated event ownership, compatibility bridge reduction, and tests
- **Status:** Complete locally; remote PR and release pending
- **Intent:** Move generated Study History points-cell popover lifecycles from
  inline global handlers into direct component listeners without changing
  scoring, content, or responsive behavior.
- **Conceptual change:** Added a scoped ownership hook to each generated points
  cell, installed direct `mouseenter`, `mouseleave`, `focusin`, `focusout`, and
  `click` listeners after every History table rebuild, removed the five inline
  attributes, and removed the three points-shell actions from the temporary
  legacy bridge while retaining their lexical functions.
- **Preservation contract:** Exact original events and `currentTarget`,
  zero-argument delayed closing, the 80 ms timer, fine-pointer toggling,
  coarse-pointer open-only clicks, hover/focus behavior, propagation stopping,
  uncancelled native activation, current manual-video/video/period/points close
  order, outside-click and Escape dismissal without focus restoration, daily
  total and item calculations, rounding, localized copy, ARIA expansion,
  styling, storage, Activity Log, analytics silence, all responsive layouts,
  and every points/scoring rule remain unchanged.
- **Risks:** Delegation would break non-bubbling mouse behavior and change
  `currentTarget`; passing an event to the close callback could change its
  contract; missing a table rebuild would leave replacement cells inert;
  pointer-event substitution could alter touch behavior; coupling extraction
  with scoring would expand risk; adding analytics metadata would create events
  the propagation-stopped inline path did not emit.
- **Verification:** `npm test` passed 285 contract tests and the production
  build. The focused fine-pointer desktop and coarse-pointer phone points flow
  passed. The complete six-viewport Playwright matrix passed with 59 tests and
  163 intentional skips; all 18 protected screenshots remained unchanged.
  Migration-ledger and diff-integrity checks passed.
- **Rollback:** Revert this commit to restore the five inline handlers and three
  bridge entries; no state, score, or storage migration is required.
- **Association:** `codex/migration-05-javascript-modularization`; PR and release pending.

---

## MIG-088 — Migrate Study History heatmap tooltip actions

- **Date:** 2026-07-29
- **Phase:** 5 — JavaScript modularization
- **Type:** Generated event ownership, compatibility bridge reduction, and tests
- **Status:** Complete locally; remote PR and release pending
- **Intent:** Move generated Study History heatmap-day tooltip interactions
  from inline global handlers into direct component listeners without changing
  data, positioning, or responsive behavior.
- **Conceptual change:** Added a scoped ownership hook to every generated heatmap
  day, installed direct `mouseenter`, `mousemove`, `mouseleave`, `click`,
  `focus`, and `blur` listeners after every heatmap rebuild, removed the six
  inline attributes, and removed the four tooltip actions from the temporary
  legacy bridge while retaining their lexical functions.
- **Preservation contract:** Exact native events and day `currentTarget`,
  uncancelled wrapper behavior, live date/points/streak/time/video/Anki
  datasets, localized tooltip content, fine-pointer click toggling,
  coarse-pointer open-only clicks, hover and focus behavior, click propagation
  stopping only after target/tooltip validation, outside-click dismissal, the
  intentional absence of Escape dismissal, fixed positioning for fine/wider
  layouts, absolute positioning for coarse input or width `≤768px`, existing
  `≤640px` CSS, viewport clamping, ARIA labels, styling, storage, Activity Log,
  analytics silence, scoring, and all responsive layouts remain unchanged.
- **Risks:** Delegation would break non-bubbling mouse/focus behavior and change
  `currentTarget`; pointer events could alter touch behavior; replacing the live
  day node stored in `tooltip._target` could break fine-pointer toggling;
  consolidating the `≤768px` JavaScript and `≤640px` CSS boundaries would be an
  intentional responsive change; missing a heatmap rebuild would leave
  replacement days inert; adding analytics metadata would create events the
  stopped inline path did not emit.
- **Verification:** `npm test` passed 290 contract tests and the production
  build. The focused fine-pointer desktop and coarse-pointer phone heatmap flow
  passed. The complete six-viewport Playwright matrix passed with 61 tests and
  167 intentional skips; all 18 protected screenshots remained unchanged.
  Migration-ledger and diff-integrity checks passed.
- **Rollback:** Revert this commit to restore the six inline handlers and four
  bridge entries; no state, score, or storage migration is required.
- **Association:** `codex/migration-05-javascript-modularization`; PR and release pending.

---

## MIG-089 — Lock Undo and Redo analytics identities

- **Date:** 2026-07-29
- **Phase:** 5 — JavaScript modularization
- **Type:** Analytics compatibility metadata and contract tests
- **Status:** Complete locally; remote PR and release pending
- **Intent:** Make every current Undo/Redo click identity explicit before moving
  event ownership out of inline handlers, so the later structural change cannot
  silently rename or add analytics events.
- **Conceptual change:** Added explicit analytics-action metadata to the static
  Undo and Redo toggles and to generated queue close/action controls. The
  existing inline handlers remain in place in this intermediate commit.
- **Preservation contract:** The stopped Undo and Redo toggle clicks remain
  absent from the document-level generic collector; the generated close and
  action controls retain `close_history_action_popovers_clicked` and
  `apply_history_action_clicked`; explicit `undo_applied` and `redo_applied`
  events, properties, ordering, success/failure behavior, native activation,
  labels, ARIA, styling, queue ordering, state, storage, and every responsive
  behavior remain unchanged.
- **Risks:** A misspelled identity would rename an existing generic event;
  removing inline handlers in this preparatory change would combine analytics
  and event-ownership risks; allowing toggle clicks to bubble would create new
  events even though their explicit identities match their current element IDs.
- **Verification:** `npm test` passed 292 contract tests and the production
  build. The complete six-viewport Playwright matrix passed with 61 tests and
  167 intentional skips; all 18 protected screenshots remained unchanged.
  Migration-ledger and diff-integrity checks passed.
- **Rollback:** Revert this commit to return analytics identity derivation to
  element IDs and inline handler names; no event, state, or storage migration is
  required.
- **Association:** `codex/migration-05-javascript-modularization`; PR and release pending.

---

## MIG-090 — Migrate Undo and Redo event ownership

- **Date:** 2026-07-29
- **Phase:** 5 — JavaScript modularization
- **Type:** Static and generated event ownership, compatibility bridge
  reduction, and tests
- **Status:** Complete locally; remote PR and release pending
- **Intent:** Move Undo/Redo controls from inline global handlers to a scoped
  feature listener boundary without moving or changing their business logic.
- **Conceptual change:** Added explicit action, direction, and original stack
  index hooks to the two static toggles and each generated queue control. A
  direct-listener module now forwards the exact native events and arguments,
  binds static controls at composition, and rebinds replacement tooltip
  children after every render. Removed the static click, generated click,
  mousemove, and mouseleave attributes and the five now-unused names from the
  temporary global action bridge. Rendering and all action implementations
  remain lexical functions in the composition entry point.
- **Preservation contract:** Visual newest-first queue ordering continues to
  carry each action's original stack index. All six persisted action schemas,
  Redo clearing on new work, newest-50 stack limits, unsupported and unusable
  snapshot behavior, full video/channel/manual-add snapshots, watched
  confirmation, resume, coverage, Set Aside, Watch Later, Favorite, and removed
  channel semantics remain unchanged. Normal, internal-test, sandbox, backup,
  export/import, cookie, and analytics-state storage contracts remain
  unchanged. Successful Undo/Redo still performs the same stack transfer,
  streak and point recalculation, Activity Log append, persistence, rerender,
  toast, and explicit analytics in the same order; failures still emit no
  applied event. Static toggles still stop propagation and emit no generic
  click; generated close/action controls retain their locked generic event
  names. Native button mouse, Enter, and Space behavior, ARIA state, localized
  labels, timestamps, titles, disabled states, desktop positioning, outside
  click and Escape dismissal, phone first-action focus and focus restoration,
  exact `≤640px` boundary, 44 px auto-scroll edge, speed cap of 8, styling, and
  all responsive layouts remain unchanged.
- **Risks:** Delegation would change `currentTarget` and non-bubbling
  `mouseleave`; string indices would change selection semantics; binding only
  once would leave rebuilt tooltip controls inert; reversing stored indices
  with display order would target the wrong action; stopping generated clicks
  would remove current generic analytics; allowing static toggles to bubble
  would add analytics; combining this listener extraction with stack or
  responsive cleanup would make regressions difficult to isolate.
- **Verification:** `npm test` passed 301 contract tests and the production
  build. The focused desktop/phone round-trip passed after narrowing one
  test-only bridge assertion to the actual `window.EdeniaActions` namespace
  contract; all preceding interaction assertions had passed on that initial
  run. The complete six-viewport Playwright matrix passed with 63 tests and 171
  intentional skips; all 18 protected screenshots remained unchanged.
  Migration-ledger and diff-integrity checks passed.
- **Rollback:** Revert this commit to restore inline event ownership and the
  five global bridge aliases; no state, storage, analytics, or responsive
  migration is required.
- **Association:** `codex/migration-05-javascript-modularization`; PR and release pending.

---

## MIG-091 — Lock saved-video search analytics identities

- **Date:** 2026-07-29
- **Phase:** 5 — JavaScript modularization
- **Type:** Analytics compatibility metadata and contract tests
- **Status:** Complete locally; remote PR and release pending
- **Intent:** Make the saved-video search opener and close-control identities
  explicit before their inline handlers are replaced by scoped listeners.
- **Conceptual change:** Added analytics-action metadata matching both
  controls' existing localization-metadata fallbacks. All search handlers
  remain inline in this preparatory commit.
- **Preservation contract:** The opener still stops click propagation and
  therefore emits no generic click event. The close control still emits
  `settings_close_clicked` with the same action and visible-label properties.
  `search_opened`, result/no-result, selected-result, raw query,
  focus, keyboard, dismissal, saved state, rendering, and responsive behavior
  remain unchanged.
- **Risks:** Assuming ID or handler precedence over localization metadata would
  rename the current identities; allowing the opener click to bubble would
  create a new generic event; removing handlers in this preparatory commit
  would combine analytics and event-ownership risks.
- **Verification:** `npm test` passed 303 contract tests and the production
  build. The analytics-precedence audit corrected the initial metadata draft
  before commit. The complete six-viewport Playwright matrix then passed with
  63 tests and 171 intentional skips; all 18 protected screenshots remained
  unchanged. Migration-ledger and diff-integrity checks passed.
- **Rollback:** Revert this commit to restore implicit ID/handler identity
  derivation; no analytics, state, storage, or visual migration is required.
- **Association:** `codex/migration-05-javascript-modularization`; PR and release pending.

---

## MIG-092 — Migrate saved-video search shell actions

- **Date:** 2026-07-29
- **Phase:** 5 — JavaScript modularization
- **Type:** Static event ownership, compatibility bridge reduction, and tests
- **Status:** Complete locally; remote PR and release pending
- **Intent:** Move the saved-video search opener, mobile close control, query
  input, and query keyboard lifecycle from inline global handlers to one scoped
  event boundary without changing search behavior.
- **Conceptual change:** Added explicit toggle, close, and query ownership hooks
  to the three static controls. A direct-listener module now forwards the
  original opener and keydown events, the query input's live value, and the
  close control's literal focus-restoration request. Removed the click, input,
  and keydown attributes plus the four now-unused names from the temporary
  global bridge. The existing delegated generated-result module remains
  unchanged, and all rendering, selection, focus, analytics, and navigation
  implementations remain lexical functions in the composition entry point.
- **Preservation contract:** Opener propagation stopping without default
  cancellation; exact close order across filters, Add, History popovers,
  Undo/Redo, the search shell, and heatmap; synchronous retained-query
  rendering; zero-delay input focus; toggle-close behavior; outside-click and
  document-Escape dismissal; input Escape prevention and bubbling; first-result
  Enter activation; no-result Enter behavior; raw trimmed query collection;
  normalized result/no-result deduplication; stale and hidden-result failure
  paths; transient forced-result rendering; result analytics and document
  bubble ordering; explicit `header.search.title` and `settings.close`
  identities; storage and Activity Log silence; exact ARIA, copy, styling, and
  all current responsive behavior remain unchanged.
- **Responsive contract:** Desktop and wider coarse-pointer tablet geometry
  remains absolute and right-aligned with no focus restoration. At the existing
  `≤640px` boundary only, the popover remains a fixed safe-area-aware sheet,
  the mobile header remains visible, the query remains 16 px/44 px high, and
  close or Escape restores focus asynchronously. No breakpoint or capability
  logic changes in this phase.
- **Risks:** A delegated input listener would change `currentTarget`; binding
  the replaced result nodes in the shell module could conflict with their
  existing delegated owner; moving event cancellation into the wrapper could
  alter key and click bubbling; changing close order or timer placement could
  alter focus; deriving analytics from the removed handlers could rename the
  localization-owned identities; combining this extraction with search,
  responsive, or focus redesign would expand regression risk.
- **Verification:** `npm test` passed 312 contract tests and the production
  build. The focused desktop, coarse-tablet, and phone search flows passed after
  correcting test-only expectations for the existing localized close label and
  the feed's two section headings. The complete six-viewport Playwright matrix
  passed with 66 tests and 174 intentional skips; all 18 protected screenshots
  remained unchanged. Migration-ledger and diff-integrity checks passed.
- **Rollback:** Revert this commit to restore the four inline handlers and four
  global bridge aliases; no state, storage, analytics, or responsive migration
  is required.
- **Association:** `codex/migration-05-javascript-modularization`; PR and release pending.

---

## MIG-093 — Lock status-filter analytics identities

- **Date:** 2026-07-29
- **Phase:** 5 — JavaScript modularization
- **Type:** Analytics compatibility metadata and contract tests
- **Status:** Complete locally; remote PR and release pending
- **Intent:** Make every current status-filter button identity explicit before
  replacing inline handlers, including the generated but currently dormant
  dropdown close control.
- **Conceptual change:** Added explicit analytics-action metadata matching the
  translated-child identities of the five reachable tabs, the dormant
  dropdown toggle's element-ID identity, and the generated close control's
  inline-handler identity. Existing handlers remain inline in this
  preparatory commit. Generated radio inputs intentionally receive no analytics
  metadata because the generic collector does not track inputs.
- **Preservation contract:** Tab clicks retain
  `videos_status_all_clicked`, `videos_status_unwatched_clicked`,
  `videos_status_partial_clicked`, `videos_status_watch_later_clicked`, and
  `videos_status_favorite_clicked`. The dormant toggle and close controls retain
  `status_filter_btn_clicked` and `close_status_filter_menu_clicked`. No
  explicit product event is added. Selection, counts, filtering, focus, ARIA,
  transient state, storage silence, and every current layout remain unchanged;
  in particular, the dropdown/radio surface stays hidden at all viewports.
- **Risks:** Misreading translated-child precedence would rename reachable tab
  events; adding metadata to inputs could imply nonexistent analytics
  coverage; styling or display changes could accidentally expose the dormant
  dropdown; removing handlers here would combine analytics and event-ownership
  risks.
- **Verification:** `npm test` passed: the production build completed and all
  315 contract tests passed. Browser, local-server, visual-regression,
  migration-ledger, diff-integrity, and static-review checks were not run in
  accordance with the repository `AGENTS.md` instruction for this task.
- **Rollback:** Revert this commit to restore implicit translated-child,
  element-ID, and handler-name identity derivation; no event, state, storage,
  or visual migration is required.
- **Association:** `codex/migration-05-javascript-modularization`; PR and release pending.

---

## MIG-094 — Migrate status-filter event ownership

- **Date:** 2026-07-29
- **Phase:** 5 — JavaScript modularization
- **Type:** Behavior-neutral event-listener extraction and compatibility cleanup
- **Status:** Complete locally; remote PR and release pending
- **Intent:** Move the five visible status tabs and the dormant status-filter
  dropdown controls from inline handlers to one scoped feature adapter while
  retaining the existing filter implementation and rendered outcomes.
- **Conceptual change:** Added a status-filter action module with explicit
  `select-tab`, `toggle`, `select-option`, and `close` ownership hooks. Static
  tabs and the dormant toggle are bound once at composition; generated radio
  and close controls are rebound after each menu render. Removed the matching
  inline handlers and the now-unneeded `closeStatusFilterMenu`,
  `setStatusFilter`, and `toggleStatusFilterMenu` global bridge aliases. The
  existing functions remain in the composition module and retain all state,
  filtering, rendering, dismissal, positioning, and focus behavior.
- **Preservation contract:** Preserve status values, validation fallback,
  counts, tab order, dropdown option order, click/change event types, native
  keyboard activation, focus behavior, ARIA state, synchronous rendering,
  overlapping Watch later and status rules, Favorite/Watched-section behavior,
  transient non-persisted selection, reload default, document-level dismissal,
  analytics names and bubble ordering, and every responsive visibility rule.
  The dropdown/radio surface remains hidden at all viewports and no arrow-key
  tab behavior is introduced.
- **Risks:** A stale generated binding could make radio or close controls inert;
  forwarding or cancelling events could alter analytics order or native
  keyboard behavior; removing a bridge alias before its last inline consumer
  could break a control; selector or CSS changes could expose the dormant
  dropdown; changing filter helpers would alter saved-video membership.
- **Verification:** `npm test` passed: the production build completed and all
  324 contract tests passed, including exact callback arguments, live dataset
  reads, idempotency, regenerated-control binding, markup and analytics
  preservation, composition wiring, and legacy-bridge removal. Browser,
  local-server, visual-regression, migration-ledger, diff-integrity, and
  static-review checks were not run in accordance with the repository
  `AGENTS.md` instruction for this task.
- **Rollback:** Revert this commit to restore the three legacy bridge aliases
  and inline handlers; no state, storage, analytics, or data migration is
  required.
- **Association:** `codex/migration-05-javascript-modularization`; PR and release pending.

---

## MIG-095 — Lock Settings channel-removal analytics identity

- **Date:** 2026-07-29
- **Phase:** 5 — JavaScript modularization
- **Type:** Analytics compatibility metadata and contract tests
- **Status:** Complete locally; remote PR and release pending
- **Intent:** Make the generated Settings channel-removal button's current
  generic analytics identity explicit before replacing its inline handler.
- **Conceptual change:** Added `removeChannel` analytics-action metadata to the
  generated channel-removal control and a contract that locks the existing
  inline callback, live channel identifier, localized title, and normalized
  `remove_channel_clicked` event name. Event ownership remains inline in this
  preparatory commit.
- **Preservation contract:** Preserve the exact `removeChannel(channelId)`
  invocation, native button click and keyboard activation, document-bubble
  analytics timing, localized visible label, `channel_removed` state-diff
  analytics, channel state mutation, saved-video preservation, Undo/Redo,
  activity logging, persistence, rendering, and focus behavior. No styling,
  responsive, copy, state-schema, or feature behavior changes are permitted.
  The generated list remains dormant because `#channelList` is absent; this
  migration must not add or expose that container.
- **Risks:** Removing the handler before identity metadata exists would make the
  generic event depend on localized title text; confusing this control with
  feed-level channel removal could alter propagation or removal semantics;
  touching the state function could affect videos retained from removed
  channels.
- **Verification:** `npm test` passed: the production build completed and all
  325 contract tests passed, including exact generated markup, handler,
  localized-title source, analytics metadata, and normalized event identity.
  Browser, local-server, visual-regression, migration-ledger, diff-integrity,
  and static-review checks were not run in accordance with the repository
  `AGENTS.md` instruction for this task.
- **Rollback:** Revert this commit to restore handler-derived generic identity;
  no event, state, storage, or visual migration is required.
- **Association:** `codex/migration-05-javascript-modularization`; PR and release pending.

---

## MIG-096 — Migrate Settings channel-removal ownership

- **Date:** 2026-07-29
- **Phase:** 5 — JavaScript modularization
- **Type:** Behavior-neutral event-listener extraction and compatibility cleanup
- **Status:** Complete locally; remote PR and release pending
- **Intent:** Replace the dormant generated Settings channel-removal button's
  inline handler with a scoped listener while leaving its state-changing
  implementation and current reachability exactly as they are.
- **Conceptual change:** Added a Settings channel-removal action adapter that
  reads each live `data-channel-id` and calls the existing removal function with
  no event argument. `renderChannelList` binds each newly generated control
  immediately after a nonempty list replacement. Removed the inline handler
  and the now-unused `removeChannel` global alias from both compatibility
  bridge lists.
- **Preservation contract:** The absent `#channelList` container remains absent,
  so this UI stays dormant. Preserve the generated button's omitted `type` and
  `aria-label`, localized title, visible multiplication sign, native
  mouse/Enter/Space click, uncancelled bubbling, live identifier lookup,
  document-bubble analytics order and names, and the existing stale connected
  row/focus behavior after removal. Preserve channel snapshots, configuration,
  refresh cleanup, removed-channel records, saved-video retention, hidden-video
  rules, Undo/Redo, activity log, persistence, state-diff analytics, and
  rendering without modification. `removeChannelFromFilter` remains bridged
  for its separate live consumers.
- **Risks:** Binding before generated replacement would leave the control inert;
  delegating through a broader root could change dormant reachability or event
  ordering; passing the click event would change the callback contract;
  rerendering the channel list after removal would alter its current stale-row
  and focus behavior; removing the similarly named feed action would break
  channel shelves and filters.
- **Verification:** `npm test` passed: the production build completed and all
  331 contract tests passed, including live identifier reads, uncancelled
  zero-event callbacks, idempotency, replacement binding, exact dormant markup
  and analytics metadata, render-time wiring, and compatibility-alias removal.
  Browser, local-server, visual-regression, migration-ledger, diff-integrity,
  and static-review checks were not run in accordance with the repository
  `AGENTS.md` instruction for this task.
- **Rollback:** Revert this commit to restore the inline handler and
  `removeChannel` compatibility alias; no state, storage, analytics, or data
  migration is required.
- **Association:** `codex/migration-05-javascript-modularization`; PR and release pending.

---

## MIG-097 — Lock manual-video shell analytics identities

- **Date:** 2026-07-29
- **Phase:** 5 — JavaScript modularization
- **Type:** Analytics compatibility metadata and contract tests
- **Status:** Complete locally; remote PR and release pending
- **Intent:** Make the static manual-video popover opener and mobile close
  control identities explicit before their inline event ownership is replaced.
- **Conceptual change:** Added `videos.manual.button` analytics-action metadata
  to `#manualVideoBtn` and `settings.close` metadata to the popover close
  control. The opener, close control, URL/query input, form, suggestions, and
  every inline handler remain otherwise unchanged in this preparatory commit.
- **Preservation contract:** Preserve the opener's real event forwarding,
  propagation stop without default cancellation, toggle-only close path,
  focus/render ordering, ARIA synchronization, and explicit
  `search_opened` payload; its stopped click still must not reach the generic
  collector. Preserve the close control's zero-event `true` argument,
  uncancelled bubble, `settings_close_clicked` identity, conditional phone
  focus restoration, and cleanup behavior. Preserve zero-argument suggestion
  rendering on input, exact key-event forwarding, conditional key ownership,
  native form submission, URL input ID, missing submit-button ID, responsive
  geometry, localization, storage silence, and all generated search handlers.
- **Risks:** Treating the opener as a normal bubbling click would invent a
  generic event; changing input forwarding would alter how live DOM values are
  read; confusing full close with toggle close would clear state or restore
  focus unexpectedly; broad manual-video changes could affect YouTube search
  and channel addition.
- **Verification:** `npm test` passed: the production build completed and all
  334 contract tests passed, including exact opener/close markup, retained
  inline callback contracts, normalized generic identities, URL input
  semantics, ARIA/localization attributes, and input analytics silence.
  Browser, local-server, visual-regression, migration-ledger, diff-integrity,
  and static-review checks were not run in accordance with the repository
  `AGENTS.md` instruction for this task.
- **Rollback:** Revert this commit to restore implicit direct-translation and
  translated-title identity derivation; no event, state, storage, or visual
  migration is required.
- **Association:** `codex/migration-05-javascript-modularization`; PR and release pending.

---

## MIG-098 — Migrate manual-video shell event ownership

- **Date:** 2026-07-29
- **Phase:** 5 — JavaScript modularization
- **Type:** Behavior-neutral event-listener extraction and compatibility cleanup
- **Status:** Complete locally; remote PR and release pending
- **Intent:** Replace the four static manual-video popover shell handlers with
  direct module-owned listeners while leaving submission, result selection,
  YouTube integration, and all product behavior in the existing composition
  module.
- **Conceptual change:** Added a manual-video shell adapter with explicit
  `toggle`, `close`, and `query` hooks. It forwards the opener's exact click
  event, calls full close with literal `true`, calls suggestion rendering with
  zero arguments on input, and forwards the exact keydown event. The static
  controls bind once before compatibility installation. Removed their four
  inline attributes and the now-unused `toggleManualVideoPopover`,
  `closeManualVideoPopover`, `renderManualChannelSuggestions`, and
  `handleManualChannelSuggestionKeydown` global aliases.
- **Preservation contract:** Preserve the opener's propagation stop, uncancelled
  default, toggle-only close path, popover-dismissal order, explicit
  `search_opened` event and payload, asynchronous focus-before-render order,
  positioning, and ARIA state. Preserve full-close cleanup and phone-only focus
  restoration; query-time result analytics deduplication; two-stage Escape;
  Arrow wrapping; active-result Enter behavior; native Enter form submission;
  exact event cancellation owned by the existing key handler; all IDs,
  missing-control tolerances, localization, responsive geometry, tall-tablet
  aspect-ratio behavior, and storage silence. The `addYoutubeInput` form handler
  and generated catalog/YouTube search handlers remain inline and bridged.
- **Risks:** Document delegation would run too late to suppress the opener's
  generic click; forwarding the input event or value would change live-DOM
  reads; combining toggle and full-close paths would alter cleanup and focus;
  replacing the query control or changing its ID would break lexical consumers;
  broad bridge removal could make form submission or generated results inert.
- **Verification:** `npm test` passed: the production build completed and all
  345 contract tests passed, including exact argument/event forwarding,
  uncancelled wrapper behavior, direct-listener `currentTarget`, idempotency,
  replacement/unknown controls, static shell markup, composition order, the
  four bridge removals, retained form/generated-handler ownership, and the
  intentionally absent submit-button ID. Browser, local-server,
  visual-regression, migration-ledger, diff-integrity, and static-review checks
  were not run in accordance with the repository `AGENTS.md` instruction for
  this task.
- **Rollback:** Revert this commit to restore the four inline handlers and
  compatibility aliases; no state, storage, analytics, or data migration is
  required.
- **Association:** `codex/migration-05-javascript-modularization`; PR and release pending.

---

## MIG-099 — Lock Set aside prompt analytics identities

- **Date:** 2026-07-29
- **Phase:** 5 — JavaScript modularization
- **Type:** Analytics compatibility metadata and contract tests
- **Status:** Complete locally; remote PR and release pending
- **Intent:** Make both generated Set aside request controls and the prompt's
  Cancel/Confirm identities explicit before replacing their inline handlers.
- **Conceptual change:** Added `requestVideoSetAside` analytics-action metadata
  to the Continue Watching and video-card request controls, plus
  `setAsidePrompt.cancel` and `setAsidePrompt.confirm` metadata to the static
  prompt actions. All request, prompt, and keyboard handlers remain inline in
  this preparatory commit.
- **Preservation contract:** Preserve exact request surfaces
  `continue_watching` and `video_card`, live video IDs, qualification guards,
  remembered-prompt bypass, inert-state capture/restoration, next-frame Confirm
  focus, Cancel/Escape focus restoration with `preventScroll`, Confirm's
  no-focus close, and Escape's prevent-default-without-stop behavior. Preserve
  the distinct prompt-seen save with disabled backup/analytics sync followed by
  the normal action save; video state transitions, Favorite and Watch later
  clearing, progress, scoring, activity, Undo/Redo asymmetries, reminders,
  rendering, `video_favorite_changed`/`video_set_aside` ordering, and generic
  `request_video_set_aside_clicked`,
  `set_aside_prompt_cancel_clicked`, and
  `set_aside_prompt_confirm_clicked` events. Preserve desktop/tablet dialog and
  current phone bottom-sheet/action visibility without CSS changes.
- **Risks:** Losing the request surface would corrupt analytics context;
  combining saves would change backup and analytics timing; changing Escape
  propagation would affect outer listeners; a broad card migration could
  interfere with player, Favorite, Watch later, or touch preview behavior.
- **Verification:** `npm test` passed: the production build completed and all
  349 contract tests passed, including both generated request surfaces and
  live IDs, prompt action types/classes/localization, retained inline
  callbacks, exact normalized analytics names, accessible video-card labels,
  and the overlay's analytics-silent keydown ownership. Browser, local-server,
  visual-regression, migration-ledger, diff-integrity, and static-review checks
  were not run in accordance with the repository `AGENTS.md` instruction for
  this task.
- **Rollback:** Revert this commit to restore handler- and translation-derived
  generic identities; no event, state, storage, or visual migration is
  required.
- **Association:** `codex/migration-05-javascript-modularization`; PR and release pending.

---

## MIG-100 — Migrate Set aside prompt event ownership

- **Date:** 2026-07-29
- **Phase:** 5 — JavaScript modularization
- **Type:** Behavior-neutral event-listener extraction and compatibility cleanup
- **Status:** Complete locally; remote PR and release pending
- **Intent:** Replace the Set aside request, Cancel, Confirm, and prompt-keydown
  inline handlers with direct scoped listeners while leaving the complete
  prompt and video-state workflow in the existing composition module.
- **Conceptual change:** Added a Set aside action adapter with explicit
  `request`, `cancel`, `confirm`, and `prompt` hooks. Static prompt controls bind
  once; Continue Watching requests bind after each Next Study replacement; and
  video-card requests bind after each active-grid replacement. The adapter
  reads live video/surface datasets, calls request with the same options object,
  calls Cancel/Confirm with zero arguments, and forwards the exact keydown
  event. Removed the four inline handlers and matching
  `requestVideoSetAside`, `cancelVideoSetAsidePrompt`,
  `confirmVideoSetAsidePrompt`, and
  `handleVideoSetAsidePromptKeydown` bridge aliases.
- **Preservation contract:** Preserve request qualification and remembered
  bypass, exact surface values, event propagation and document-bubble analytics
  order, prompt inertness, pending active-element/prior-inert capture,
  next-frame Confirm focus, Cancel/Escape focus restoration, Confirm's
  no-focus close, Escape prevention without propagation stop, and the absence
  of backdrop dismissal, tab trapping, or body-scroll locking. Preserve the
  distinct prompt-seen and action saves, their backup/analytics-sync order,
  video state/progress/scoring/activity/reminder behavior, Favorite event
  ordering, Undo/Redo asymmetries, storage schema, rendering, accessibility,
  localization, desktop/tablet dialog, phone bottom sheet, and the hidden
  Continue actions at the current narrow-phone breakpoint. Watched cards remain
  excluded because they intentionally render without Set aside actions.
- **Risks:** Missing either generated rebind would make one request surface
  inert; delegation would alter target/document ordering; passing click events
  would change callback signatures; consolidating saves or close paths would
  change state, analytics, backup, or focus behavior; binding watched cards
  would introduce a new action.
- **Verification:** `npm test` passed: the production build completed and all
  360 contract tests passed, including live video/surface reads, exact callback
  and key-event forwarding, uncancelled wrappers, idempotent replacement
  binding, static dialog/ARIA/localization, both generated request surfaces,
  all three composition binding points, watched-grid exclusion, and the four
  bridge removals. Browser, local-server, visual-regression, migration-ledger,
  diff-integrity, and static-review checks were not run in accordance with the
  repository `AGENTS.md` instruction for this task.
- **Rollback:** Revert this commit to restore the four inline handlers and
  compatibility aliases; no state, storage, analytics, or data migration is
  required.
- **Association:** `codex/migration-05-javascript-modularization`; PR and release pending.

---

## MIG-101 — Lock completion-prompt analytics identities

- **Date:** 2026-07-29
- **Phase:** 5 — JavaScript modularization
- **Type:** Analytics compatibility metadata and contract tests
- **Status:** Complete locally; remote PR and release pending
- **Intent:** Make the generated video completion prompt's Favorite, Yes, and
  Not yet control identities explicit before replacing their inline handlers.
- **Conceptual change:** Added analytics-action metadata matching the current
  handler-derived identities `favoriteVideoFromWatchPrompt`,
  `confirmVideoWatchPrompt`, and `dismissVideoWatchPrompt`. All three handlers
  and all card/global/player generation paths remain inline in this preparatory
  commit.
- **Preservation contract:** The normalized generic identities remain
  `favorite_video_from_watch_prompt_clicked`,
  `confirm_video_watch_prompt_clicked`, and
  `dismiss_video_watch_prompt_clicked`, but these events remain suppressed
  because each target handler prevents default and stops propagation before the
  document collector. Preserve original-event forwarding, exact video/rewatch/
  player arguments, Favorite omission for rewatch, prompt classes and
  accessible state, first-watch unlock save, shown/accepted/dismissed/Favorite
  analytics ordering, player session ordering, reminders, persistence,
  Undo/Redo, focus behavior, reduced motion, and desktop/tablet/phone
  presentation.
- **Risks:** A migration that no longer forwards the event would invent three
  generic telemetry events; boolean coercion could confuse player and rewatch
  paths; binding only one render surface would leave other prompts inert;
  moving state logic could alter completion scoring or player teardown.
- **Verification:** `npm test` passed: the production build completed and all
  363 contract tests passed, including exact generated classes, IDs, ARIA,
  labels/icons, inline callback arguments, normalized identities, rewatch-only
  Favorite omission, and handler-owned prevent/stop behavior before the generic
  document collector. Browser, local-server, visual-regression,
  migration-ledger, diff-integrity, and static-review checks were not run in
  accordance with the repository `AGENTS.md` instruction for this task.
- **Rollback:** Revert this commit to restore handler-derived identities; no
  event, state, storage, analytics, or visual migration is required.
- **Association:** `codex/migration-05-javascript-modularization`; PR and release pending.

---

## MIG-102 — Migrate completion-prompt event ownership

- **Date:** 2026-07-29
- **Phase:** 5 — JavaScript modularization
- **Type:** Behavior-neutral event-listener extraction and compatibility cleanup
- **Status:** Complete locally; remote PR and release pending
- **Intent:** Replace the generated completion prompt's Favorite, Yes, and Not
  yet inline handlers with direct scoped listeners across every existing
  card/global/player insertion path.
- **Conceptual change:** Added a completion-prompt action adapter with explicit
  `favorite`, `confirm`, and `dismiss` hooks. It forwards the exact click event
  and live video ID, converts only exact `"true"` dataset values for rewatch and
  player flags, and ignores callback return values like the prior inline
  handlers. Each generated global, card, and embedded-player prompt binds
  immediately after insertion. Removed the three inline handlers and matching
  `favoriteVideoFromWatchPrompt`, `confirmVideoWatchPrompt`, and
  `dismissVideoWatchPrompt` bridge aliases.
- **Preservation contract:** Preserve handler-owned prevent-default and
  propagation stop, so the three generic click events remain suppressed.
  Preserve Favorite omission for rewatch, every prompt class/ID/ARIA/label,
  strict card/global/player selection, shown-event and next-frame Yes focus,
  Favorite mutation/Undo/save/analytics/UI synchronization, first-watch and
  rewatch acceptance paths, player teardown/order, reminder dismissal and
  no-backup save, document-title/timer behavior, focus-node removal, reduced
  motion, and all responsive presentation. No prompt state, playback, scoring,
  persistence, or analytics implementation moves out of `app.js`.
- **Risks:** Missing an insertion-site bind would make one surface inert;
  permissive boolean coercion could route a card prompt through player logic;
  delegation or omitted event forwarding would invent generic telemetry and
  alter outside-click behavior; moving focus/finalization around binding could
  change prompt lifecycle.
- **Verification:** The first `npm test` run identified one stale MIG-100
  retained-neighbor assertion for `confirmVideoWatchPrompt`; that expectation
  was removed because MIG-102 now owns the control. The final `npm test` passed:
  the production build completed and all 377 contract tests passed, including
  exact event/live-ID forwarding, strict boolean conversion, idempotent
  replacement binding, prompt markup/ARIA/content, rewatch omission, all three
  insertion-site bindings, continued generic-event suppression, and the three
  bridge removals. Browser, local-server, visual-regression, migration-ledger,
  diff-integrity, and static-review checks were not run in accordance with the
  repository `AGENTS.md` instruction for this task.
- **Rollback:** Revert this commit to restore the three inline handlers and
  bridge aliases; no state, storage, analytics, or data migration is required.
- **Association:** `codex/migration-05-javascript-modularization`; PR and release pending.

---

## MIG-103 — Lock Next Study analytics identities

- **Date:** 2026-07-29
- **Phase:** 5 — JavaScript modularization
- **Type:** Analytics compatibility metadata and contract tests
- **Status:** Complete locally; remote PR and release pending
- **Intent:** Make every remaining Next Study open, focus, and Remove favorite
  identity explicit before replacing its inline handler.
- **Conceptual change:** Added `openNextStudyVideoPlayer` analytics metadata to
  Continue, Watch, Watch again, and the phone open overlay;
  `focusNextStudyVideoCard` metadata to the desktop/tablet focus overlay; and
  `toggleVideoFavorite` metadata to the rewatch Remove favorite control. All
  handlers remain inline in this preparatory commit.
- **Preservation contract:** Open actions keep forwarding the exact event,
  preventing default, stopping propagation, returning false, and producing no
  generic click analytics while preserving embedded-player state and existing
  `video_opened` properties. The focus overlay keeps its `≤640px` early return
  and latent `focus_next_study_video_card_clicked` identity, plus its
  desktop/tablet cancellation, forced-feed rerender, scroll/highlight, reduced-
  motion timing, and preview behavior. Remove favorite keeps its zero-event
  `next_study` surface, Undo/save/rerender behavior, explicit
  `video_favorite_changed` before bubbling
  `toggle_video_favorite_clicked`, and global bridge because other video-card
  consumers still use it. Preserve selection precedence, variants, markup,
  focus, responsive overlays, localization, and all Set aside ownership.
- **Risks:** Dropping event forwarding would invent generic open telemetry;
  cancelling focus before its width guard would alter dormant phone behavior;
  removing the shared Favorite bridge would break other cards; changing
  selection or render order would alter the displayed recommendation.
- **Verification:** `npm test` passed: the production build completed and all
  382 contract tests passed, including exact identity/variant coverage for the
  seven generated Next Study controls, preserved inline event arguments and
  return values, suppression/order context, and the still-shared Favorite
  bridge. Browser, local-server, visual-regression, migration-ledger,
  diff-integrity, and static-review checks were not run in accordance with the
  repository `AGENTS.md` instruction for this task.
- **Rollback:** Revert this commit to restore handler-derived identities; no
  event, state, storage, analytics, or visual migration is required.
- **Association:** `codex/migration-05-javascript-modularization`; PR and release pending.

---

## MIG-105 — Record MIG-104 ledger placement correction

- **Date:** 2026-07-29
- **Phase:** 5 — JavaScript modularization
- **Type:** Migration-governance correction
- **Status:** Complete locally; remote PR and release pending
- **Intent:** Preserve an explicit, append-only record that the MIG-104 entry
  was inserted at an earlier matching ledger anchor rather than at the physical
  end of this file.
- **Conceptual change:** No application, test, build, deployment, interface, or
  visual behavior changed. The committed MIG-104 entry remains unedited at its
  original location, and this appended correction establishes its chronological
  position immediately after MIG-103.
- **Preservation contract:** Preserve all MIG-104 content and implementation
  history exactly; do not silently move, rewrite, or delete the prior entry.
- **Risks:** Readers or automated consumers that infer chronology solely from
  physical heading order may encounter MIG-104 earlier in the file. The
  identifier, date, commit history, and this correction provide the intended
  sequence without rewriting the append-only record.
- **Verification:** Confirmed that this commit changes only the migration
  ledger; no build or runtime verification is applicable. Browser,
  local-server, visual-regression, migration-ledger, diff-integrity, and
  static-review checks were not run in accordance with the repository
  `AGENTS.md` instruction for this task.
- **Rollback:** Do not remove this correction independently; reverting it would
  obscure the recorded placement error while leaving the original entry in its
  committed location.
- **Association:** `codex/migration-05-javascript-modularization`; PR and release pending.

---

## MIG-106 — Migrate Next Study Favorite event ownership

- **Date:** 2026-07-29
- **Phase:** 5 — JavaScript modularization
- **Type:** Behavior-neutral event-listener extraction with shared compatibility retention
- **Status:** Complete locally; remote PR and release pending
- **Intent:** Replace the Next Study rewatch card's Remove favorite inline
  handler with its component-scoped listener without disturbing the shared
  Favorite implementation or other inline consumers.
- **Conceptual change:** Extended the Next Study action adapter with a
  `toggle-favorite` hook and required `toggleFavorite` callback. The rewatch
  control now stores its exact `next_study` surface in component metadata; its
  direct listener reads the live video ID and surface, calls
  `toggleVideoFavorite` with the same two arguments as before, and does not
  receive or cancel the event. The global `toggleVideoFavorite` bridge remains
  installed for the channel-shelf badge and ordinary video-card handlers.
- **Preservation contract:** Preserve Favorite independence from watched
  status, Undo/save/state synchronization, exact `next_study` surface, explicit
  `video_favorite_changed` emission before rerender, and the subsequent
  bubble-phase `toggle_video_favorite_clicked` event. Preserve every Next Study
  recommendation branch, open/focus/Set aside ownership, copy, classes, ARIA,
  selection precedence, responsive presentation, and all remaining card and
  shelf Favorite controls.
- **Risks:** Passing the event or cancelling propagation would suppress existing
  generic analytics; capturing stale dataset values would target the wrong
  recommendation after replacement; removing the shared bridge would break two
  unrelated inline surfaces; changing the Favorite callback itself could alter
  Undo or watched-card rerender behavior.
- **Verification:** `npm test` passed: the production build completed and all
  390 contract tests passed, including exact live video/surface forwarding
  without an event argument, uncancelled bubbling, replacement-safe idempotence,
  the generated hook and composition callback, explicit-before-generic
  analytics ordering, and retained global bridge coverage for the two remaining
  inline consumers. Browser, local-server, visual-regression, migration-ledger,
  diff-integrity, and static-review checks were not run in accordance with the
  repository `AGENTS.md` instruction for this task.
- **Rollback:** Revert this commit to restore only the Next Study Remove
  favorite inline handler; no state, storage, analytics, or data migration is
  required.
- **Association:** `codex/migration-05-javascript-modularization`; PR and release pending.

---

## MIG-107 — Lock intro and onboarding shell analytics identities

- **Date:** 2026-07-29
- **Phase:** 5 — JavaScript modularization
- **Type:** Analytics compatibility metadata and contract tests
- **Status:** Complete locally; remote PR and release pending
- **Intent:** Make every current intro-trailer and shared onboarding-shell
  control identity explicit before migrating any of their inline handlers.
- **Conceptual change:** Added explicit analytics metadata to both sound
  controls, Skip, Previous, Next, all four city-level controls, the dynamic
  Start/Return control, both locale-menu toggles, and both generated locale
  radio sets. The Start control now updates its analytics metadata together
  with its existing `data-i18n` key when replay mode changes. All handlers,
  callbacks, global bridge aliases, and render ownership remain unchanged.
- **Preservation contract:** Preserve exact markup, copy, localization, scenes,
  music, onboarding state, replay behavior, responsive presentation, focus, and
  accessibility. Preserve current generic identities, including the distinct
  intro/onboarding sound and locale-button IDs, dynamic
  `intro_finale_cta_clicked` versus `intro_finale_return_clicked`, common city
  identity, and Back/Continue translation-key identities. Preserve bubbling
  for sound, finish, city, and ordinary navigation clicks; propagation
  suppression for locale-menu toggles; the navigation boundary case where a
  clicked control can become disabled before document analytics; and the
  absence of generic button-click collection for generated radio inputs.
- **Risks:** Fixing the dynamic Start identity would merge first-run and replay
  telemetry; using handler names instead of current ID/translation fallbacks
  would rename events; adding cancellation would suppress existing analytics;
  changing render or sound code during this metadata-only step could regress
  the protected trailer or onboarding experience.
- **Verification:** The first `npm test` run exposed one stale contract
  expectation that generated locale radios had no explicit metadata; the
  contract was aligned with this preparatory change while continuing to assert
  that the button/link-only generic collector ignores inputs. The final
  `npm test` passed: the production build completed and all 399 contract tests
  passed, including every static and generated identity, dynamic Start/Return
  synchronization, exact inline arguments, locale ARIA/render behavior,
  bubbling versus suppression, navigation boundary disabling, and all eight
  retained bridge aliases. Browser, local-server, visual-regression,
  migration-ledger, diff-integrity, and static-review checks were not run in
  accordance with the repository `AGENTS.md` instruction for this task.
- **Rollback:** Revert this commit to restore handler/ID/translation-derived
  identities; no event listener, state, storage, copy, or visual migration is
  required.
- **Association:** `codex/migration-05-javascript-modularization`; PR and release pending.

---

## MIG-108 — Migrate intro and onboarding sound ownership

- **Date:** 2026-07-29
- **Phase:** 5 — JavaScript modularization
- **Type:** Behavior-neutral static event-listener extraction and compatibility cleanup
- **Status:** Complete locally; remote PR and release pending
- **Intent:** Replace both shared sound-button inline handlers with one explicit
  feature adapter while preserving the trailer-to-onboarding audio lifecycle.
- **Conceptual change:** Added an intro sound action adapter that binds direct
  click listeners to the existing `[data-intro-sound-toggle]` controls and
  invokes the existing async `toggleIntroSound` callback with zero arguments.
  Both static sound buttons now use module ownership, and the matching
  `toggleIntroSound` global bridge alias was removed. The sound implementation
  and shared update selector remain in `app.js`.
- **Preservation contract:** Preserve the same shared audio instance,
  enabled/disabled state, autoplay-unlock listeners, volume/fade behavior,
  trailer-to-onboarding continuation, error handling, and synchronized ARIA,
  title, and localized labels on both controls. Preserve uncancelled bubbling,
  the separate `intro_sound_btn_clicked` and
  `onboarding_sound_btn_clicked` identities, and document analytics reading the
  already-updated label after the target listener runs. Preserve every class,
  ID, icon, responsive rule, and all other intro/onboarding handlers.
- **Risks:** Binding on document delegation would let analytics observe the old
  label; passing or cancelling the event would alter current semantics;
  migrating only one control would split shared ownership; awaiting or replacing
  the callback could alter autoplay timing and rejection handling.
- **Verification:** `npm test` passed: the production build completed and all
  408 contract tests passed, including both exact static controls, zero-argument
  async-return-neutral invocation, uncancelled bubbling, post-toggle label
  context, idempotent replacement binding, composition order, removal of only
  the shared sound bridge alias, and retention of the other seven intro shell
  aliases and handlers. Browser, local-server, visual-regression,
  migration-ledger, diff-integrity, and static-review checks were not run in
  accordance with the repository `AGENTS.md` instruction for this task.
- **Rollback:** Revert this commit to restore both inline sound handlers and the
  single shared bridge alias; no audio, state, storage, analytics, or visual
  migration is required.
- **Association:** `codex/migration-05-javascript-modularization`; PR and release pending.

---

## MIG-109 — Migrate intro finish control ownership

- **Date:** 2026-07-29
- **Phase:** 5 — JavaScript modularization
- **Type:** Behavior-neutral static event-listener extraction and compatibility cleanup
- **Status:** Complete locally; remote PR and release pending
- **Intent:** Replace the shared Skip and Start/Return inline handlers with one
  explicit intro-finish adapter while retaining the existing first-run, replay,
  recovery, and Escape behavior.
- **Conceptual change:** Added an intro finish action adapter with direct
  listeners for both `[data-intro-finish-action="finish"]` controls. Each
  invokes the existing `finishIntroTrailer` callback with zero arguments and
  ignores its return value. Removed the matching global bridge alias while
  retaining the local function for the Escape-key path.
- **Preservation contract:** Preserve Skip copy and identity, dynamic
  Start-versus-Return localization and analytics identity, first-run state
  normalization and persistence, replay restoration, onboarding transition,
  recovery fallbacks, music continuation/fade, inert/hidden state, and Escape
  behavior. Preserve uncancelled bubbling after the target-owned callback,
  every ID/class/ARIA attribute, and all responsive trailer/onboarding visuals.
- **Risks:** Migrating only one control would leave shared ownership split;
  cancelling the event would suppress current generic analytics; moving the
  callback or its Escape consumer could alter recovery or replay behavior;
  fixing the dynamic identity would merge intentionally distinct events.
- **Verification:** The first `npm test` run identified the previous sound
  migration's retained-neighbor list still classifying `finishIntroTrailer` as
  bridge-owned; that stale sequential expectation was removed while the new
  finish-specific contracts retained its local function and Escape call. The
  final `npm test` passed: the production build completed and all 418 contract
  tests passed, including both exact controls, zero-argument return-neutral
  invocation, uncancelled bubbling, dynamic CTA/Return metadata, first-run and
  replay callback structure, composition order, bridge removal, and the six
  remaining intro-shell aliases. Browser, local-server, visual-regression,
  migration-ledger, diff-integrity, and static-review checks were not run in
  accordance with the repository `AGENTS.md` instruction for this task.
- **Rollback:** Revert this commit to restore the two inline finish handlers and
  their single shared bridge alias; no state, storage, analytics, copy, or
  visual migration is required.
- **Association:** `codex/migration-05-javascript-modularization`; PR and release pending.

---

## MIG-110 — Migrate intro scene navigation ownership

- **Date:** 2026-07-29
- **Phase:** 5 — JavaScript modularization
- **Type:** Behavior-neutral static event-listener extraction and compatibility cleanup
- **Status:** Complete locally; remote PR and release pending
- **Intent:** Replace the Previous and Next inline handlers with direct
  component listeners while preserving scene timing, disabled boundaries, and
  keyboard/touch navigation.
- **Conceptual change:** Added an intro navigation adapter that recognizes only
  the exact `-1` and `1` component directions and invokes the existing
  `navigateIntroTrailer` callback with the matching number. Previous and Next
  now use direct target listeners with no event argument or cancellation.
  Removed the matching global bridge alias while keeping the local function for
  swipe and Arrow-key consumers.
- **Preservation contract:** Preserve scene order, timer clearing/restart,
  auto-advance, city animation, disabled states, titles, ARIA labels, copy,
  touch thresholds, keyboard guards, and responsive controls. Preserve ordinary
  bubbling and the exact boundary behavior where scene `1→0` disables Previous
  and `3→4` disables Next before the document analytics listener, so those two
  clicks still produce no generic event.
- **Risks:** Document delegation would run after analytics and invent the two
  boundary events; string arguments could change numeric navigation behavior;
  accepting unsupported directions could expose unintended jumps; removing the
  local function would break keyboard or swipe navigation.
- **Verification:** `npm test` passed: the production build completed and all
  429 contract tests passed, including strict direction recognition, exact
  numeric forwarding, uncancelled target-owned clicks, idempotent replacement
  binding, preserved keyboard/swipe lexical calls, composition and bridge
  cleanup, exact markup/translation metadata, disabled-boundary analytics
  ordering, and retention of the five remaining intro-shell aliases. Browser,
  local-server, visual-regression, migration-ledger, diff-integrity, and
  static-review checks were not run in accordance with the repository
  `AGENTS.md` instruction for this task.
- **Rollback:** Revert this commit to restore the two inline navigation handlers
  and their single bridge alias; no scene, timer, state, analytics, or visual
  migration is required.
- **Association:** `codex/migration-05-javascript-modularization`; PR and release pending.

---

## MIG-111 — Migrate intro city-level control ownership

- **Date:** 2026-07-29
- **Phase:** 5 — JavaScript modularization
- **Type:** Behavior-neutral static event-listener extraction and compatibility cleanup
- **Status:** Complete locally; remote PR and release pending
- **Intent:** Replace the four city-level inline handlers with direct listeners
  while keeping all scene animation, timing, and manual-selection behavior in
  the existing implementation.
- **Conceptual change:** Added an intro city-level action adapter that accepts
  only the existing `1`, `4`, `8`, and `12` dataset values and forwards the
  matching number to `selectIntroCityLevel`. The four static controls now use
  their existing `data-intro-city-level` attribute as the module hook, and the
  matching global bridge alias was removed.
- **Preservation contract:** Preserve scene-two gating, allowed level set,
  timer clearing and rescheduling, selected/reached classes, frame changes,
  level label, localized ARIA labels, automatic progression through remaining
  levels, and transition to scene three. Preserve zero-event numeric calls,
  uncancelled bubbling, the shared `select_intro_city_level_clicked` identity,
  exact control markup, and all responsive city/trailer presentation.
- **Risks:** Permissive parsing could accept unsupported levels; forwarding a
  string instead of the prior number could alter callback assumptions;
  cancellation would suppress generic analytics; moving timer or render logic
  into the adapter could change the protected animation.
- **Verification:** `npm test` passed: the production build completed and all
  441 contract tests passed, including exact supported numeric forwarding,
  strict unknown-value handling, uncancelled target clicks, idempotent
  replacement binding, all four static controls, timer/class/frame/ARIA
  lifecycle retention, common generic identity, bridge removal, and the four
  remaining locale-shell aliases. Browser, local-server, visual-regression,
  migration-ledger, diff-integrity, and static-review checks were not run in
  accordance with the repository `AGENTS.md` instruction for this task.
- **Rollback:** Revert this commit to restore the four inline level handlers and
  their bridge alias; no timer, state, analytics, accessibility, or visual
  migration is required.
- **Association:** `codex/migration-05-javascript-modularization`; PR and release pending.

---

## MIG-112 — Migrate intro and onboarding locale-menu ownership

- **Date:** 2026-07-29
- **Phase:** 5 — JavaScript modularization
- **Type:** Behavior-neutral static event-listener extraction and compatibility cleanup
- **Status:** Complete locally; remote PR and release pending
- **Intent:** Replace the two locale-menu toggle inline handlers with direct
  listeners while preserving their propagation boundary, ARIA state, and
  outside-click behavior.
- **Conceptual change:** Added a locale-menu action adapter with separate
  `toggle-intro` and `toggle-onboarding` hooks. Each direct listener forwards
  the exact native click event to its existing callback, which continues to
  stop propagation before toggling the menu and `aria-expanded`. Removed both
  matching global bridge aliases; generated locale radio handlers remain
  unchanged for a separate migration.
- **Preservation contract:** Preserve each trigger's ID-derived latent analytics
  identity, classes, labels, caret, ARIA, menu roles, localization, hidden
  state, and outside-click close logic. Preserve exact event forwarding,
  immediate `stopPropagation()` without `preventDefault()`, and therefore the
  absence of generic click events for both toggles. Preserve all locale
  selection, rerender, state, focus-loss, and responsive behavior.
- **Risks:** Document delegation would let analytics and outside-click handlers
  run before the callback; failing to forward the event would throw or leak the
  click; combining the two callbacks could target the wrong menu; migrating
  radios in the same commit would expand replacement-render risk.
- **Verification:** `npm test` passed: the production build completed and all
  453 contract tests passed, including exact per-menu hook routing, native event
  forwarding, callback-owned propagation stop without default prevention,
  idempotent replacement binding, exact trigger/menu ARIA and markup,
  outside-click behavior, latent analytics suppression, both bridge removals,
  and retained generated-radio aliases. Browser, local-server,
  visual-regression, migration-ledger, diff-integrity, and static-review checks
  were not run in accordance with the repository `AGENTS.md` instruction for
  this task.
- **Rollback:** Revert this commit to restore both inline toggle handlers and
  their bridge aliases; no locale, state, storage, analytics, focus, or visual
  migration is required.
- **Association:** `codex/migration-05-javascript-modularization`; PR and release pending.

---

## MIG-113 — Migrate generated intro locale-selection ownership

- **Date:** 2026-07-29
- **Phase:** 5 — JavaScript modularization
- **Type:** Behavior-neutral generated event-listener extraction and compatibility cleanup
- **Status:** Complete locally; remote PR and release pending
- **Intent:** Replace both generated locale-radio inline handlers with
  replacement-safe module listeners while preserving every current locale,
  rerender, and focus effect.
- **Conceptual change:** Added an intro locale-selection adapter with exact
  `change-intro` and `change-onboarding` hooks. Each generated radio forwards
  only its live string value to the corresponding existing callback on
  `change`, without receiving or cancelling the event. `renderLocaleSelect`
  binds each menu immediately after every `innerHTML` replacement. Removed the
  two remaining intro-shell bridge aliases.
- **Preservation contract:** Preserve all five locale options, order, labels,
  checked state, normalization, storage/save behavior, translation application,
  document title and intro-specific sound/city refresh, onboarding rerender,
  menu close behavior, and the existing synchronous replacement of the focused
  radio. Preserve repeated rebuilding through init, locale changes, Settings,
  sync import, and backup restore. Preserve inert analytics metadata on inputs
  and the generic collector's button/link-only scope, so no new generic locale
  selection events are introduced.
- **Risks:** One-time binding would break after the next locale or Settings
  render; stale values could select the wrong locale; forwarding the event or
  adding focus restoration would change behavior; merging the asymmetric intro
  and onboarding callbacks could alter ARIA or onboarding state.
- **Verification:** The first `npm test` run found one new contract regex that
  omitted the template-literal closing parenthesis plus two older cross-feature
  contracts still expecting inline/bridge-owned intro locale radios. Those
  assertions were updated only for the now-migrated ownership boundary. The
  final `npm test` passed: the production build completed and all 466 contract
  tests passed, including live value-only routing, replacement-time binding for
  both menus, every direct rebuild path, synchronous focus-node replacement,
  callback asymmetry, generic-click exclusion, removal of all eight intro-shell
  aliases, and unchanged Settings locale ownership. Browser, local-server,
  visual-regression, migration-ledger, diff-integrity, and static-review checks
  were not run in accordance with the repository `AGENTS.md` instruction for
  this task.
- **Rollback:** Revert this commit to restore both generated inline `change`
  handlers and bridge aliases; no locale, state, storage, analytics, focus, or
  visual migration is required.
- **Association:** `codex/migration-05-javascript-modularization`; PR and release pending.

---

## MIG-114 — Lock onboarding recovery analytics identities

- **Date:** 2026-07-29
- **Phase:** 5 — JavaScript modularization
- **Type:** Analytics compatibility metadata and contract tests
- **Status:** Complete locally; remote PR and release pending
- **Intent:** Make the generated onboarding-recovery Copy link and Try again
  identities explicit before replacing their inline handlers.
- **Conceptual change:** Added analytics metadata matching the existing
  handler-derived `copyOnboardingRecoveryLink` and `retryOnboardingRecovery`
  identities. Both inline handlers, live-button arguments, callbacks,
  replacement rendering, and global bridge aliases remain unchanged.
- **Preservation contract:** Preserve exact recovery headings, copy, button
  classes/order, status live region, reason/resume state, shown/copy/retry
  analytics, clipboard API and textarea fallback, delayed Copy label
  restoration, Retry disabled-state lifecycle, persistence checks, recovery
  rerenders, resume routing, inert/hidden state, localization, and responsive
  presentation. Preserve uncancelled bubbling and the existing branch-dependent
  generic Retry event suppression when its clicked button remains disabled
  before the document collector.
- **Risks:** Omitting the live button would break delayed Copy-label restoration
  and Retry state; changing disabled timing would add or remove generic events;
  moving async clipboard work could change the label observed by analytics;
  combining recovery rendering with ownership migration would expand risk.
- **Verification:** `npm test` passed: the production build completed and all
  474 contract tests passed, including exact generated markup and live-button
  arguments, stable normalized identities, replacement context, clipboard
  async and synchronous fallback timing, delayed connected-button label reset,
  Retry active/storage/save/resume branches, disabled-before-document analytics
  suppression, and both retained bridge aliases. Browser, local-server,
  visual-regression, migration-ledger, diff-integrity, and static-review checks
  were not run in accordance with the repository `AGENTS.md` instruction for
  this task.
- **Rollback:** Revert this commit to restore handler-derived identities; no
  recovery, clipboard, persistence, analytics implementation, or visual
  migration is required.
- **Association:** `codex/migration-05-javascript-modularization`; PR and release pending.

---

## MIG-115 — Migrate onboarding recovery event ownership

- **Date:** 2026-07-29
- **Phase:** 5 — JavaScript modularization
- **Type:** Behavior-neutral generated event-listener extraction and compatibility cleanup
- **Status:** Complete locally; remote PR and release pending
- **Intent:** Replace both generated recovery inline handlers with direct,
  replacement-safe listeners while preserving their exact live-node and
  analytics timing.
- **Conceptual change:** Added an onboarding recovery action adapter with exact
  `copy-link` and `retry` hooks. Each listener immediately passes its captured
  live control—without the event—to the existing callback and ignores the
  callback result or Promise. `showOnboardingRecovery` now binds immediately
  after every content replacement. Removed both matching global bridge aliases.
- **Preservation contract:** Preserve all recovery rendering, state, copy,
  status, clipboard API/fallback, temporary textarea focus, concurrent Copy
  attempts, delayed connected-button label restoration, Retry active and
  persistence guards, disabled/re-enabled timing, save normalization, resume
  routing, recovery regeneration, explicit analytics, localization,
  accessibility, and responsive presentation. Preserve uncancelled bubbling,
  Copy label timing, and branch-dependent generic Retry suppression on the
  original disabled event target.
- **Risks:** Document delegation or deferred invocation would change analytics
  order; requerying controls would mutate a replacement node; forwarding the
  event would change the callback contract; awaiting Copy in the adapter could
  delay event propagation; missed replacement binding would make recovery
  controls inert.
- **Verification:** `npm test` passed: the production build completed and all
  485 contract tests passed, including synchronous exact-control forwarding,
  return/Promise neutrality, uncancelled bubbling, idempotent replacement
  binding, generated markup and live-region retention, clipboard and
  disconnected-node timing, every Retry disabled-state analytics branch, both
  bridge removals, and the updated retained-neighbor boundary. Browser,
  local-server, visual-regression, migration-ledger, diff-integrity, and
  static-review checks were not run in accordance with the repository
  `AGENTS.md` instruction for this task.
- **Rollback:** Revert this commit to restore both generated inline handlers and
  bridge aliases; no recovery state, clipboard, storage, analytics, or visual
  migration is required.
- **Association:** `codex/migration-05-javascript-modularization`; PR and release pending.

---

## MIG-116 — Lock personalized onboarding analytics identities

- **Date:** 2026-07-29
- **Phase:** 5 — JavaScript modularization
- **Type:** Analytics compatibility metadata and contract tests
- **Status:** Complete locally; remote PR and release pending
- **Intent:** Make every generated personalized-onboarding action identity
  explicit before migrating its inline handler across replacement-rendered
  steps.
- **Conceptual change:** Added handler-matching analytics metadata to language
  choices, Language Continue, level choices, all Back/Continue step controls,
  channel choices, and both Build actions. All six handler families, exact
  arguments, render functions, callbacks, async workflow, and global bridge
  aliases remain unchanged.
- **Preservation contract:** Preserve the language/Other branch, step order and
  progress, locale-picker visibility, step-viewed/advanced/backed analytics,
  language and level validation, selection reset rules, recommended-channel
  initialization and order, five-channel limit/toast, applying/disabled states,
  Build labels, music fade, persistence and recovery gates, YouTube resolution,
  channel addition/refresh, activity log, completion analytics/navigation,
  localization, accessibility, and responsive onboarding presentation.
  Preserve uncancelled bubbling, disabled-control exclusion, and generic click
  capture from the original enabled node after synchronous step rerenders.
- **Risks:** A broad ownership change could miss one step replacement; changing
  disabled timing would rename the observed event set; stale datasets could
  select the wrong language/level/channel; moving async Build logic could alter
  persistence, network, recovery, or analytics ordering.
- **Verification:** `npm test` passed: the production build completed and all
  494 contract tests passed, including every generated step/control variant and
  order, exact inline arguments and normalized identities, disabled and
  original-node bubbling behavior, step/state/selection transitions,
  directional and viewed analytics ordering, channel-limit guards, async
  completion/recovery workflow, and all six retained bridge aliases. Browser,
  local-server, visual-regression, migration-ledger, diff-integrity, and
  static-review checks were not run in accordance with the repository
  `AGENTS.md` instruction for this task.
- **Rollback:** Revert this commit to restore handler-derived identities; no
  onboarding state, channel, storage, analytics implementation, or visual
  migration is required.
- **Association:** `codex/migration-05-javascript-modularization`; PR and release pending.

---

## MIG-117 — Migrate personalized onboarding language ownership

- **Date:** 2026-07-29
- **Phase:** 5 — JavaScript modularization
- **Type:** Behavior-neutral generated event-listener extraction with staged compatibility cleanup
- **Status:** Complete locally; remote PR and release pending
- **Intent:** Move only language selection and Language Continue to
  replacement-safe component ownership before touching later onboarding steps.
- **Conceptual change:** Added the initial personalized-onboarding action
  adapter with exact `select-language` and `continue-language` hooks. Language
  choices forward their live language ID only; Continue invokes its callback
  with zero arguments. The central renderer binds after whichever step replaces
  the onboarding content. Removed only the two matching global bridge aliases;
  level, step-navigation, channel, and Build handlers remain inline.
- **Preservation contract:** Preserve all eight language choices and order,
  icons/labels, radiogroup ARIA, selected state, disabled Continue gate,
  validation, Other/English level-clearing rules, channel-selection reset,
  locale menu regeneration, Other-versus-Level branching, progress and
  step-viewed/advanced analytics, synchronous replacement, localization,
  responsive presentation, and generic click capture from the original enabled
  target after state events.
- **Risks:** Binding only once would break after selection; stale language IDs
  could select the wrong option; merging Continue into step controls could
  change its live-state branch; removing later aliases early would break
  untouched steps.
- **Verification:** `npm test` passed: the production build completed and all
  506 contract tests passed, including live language-ID and zero-argument
  Continue routing, uncancelled synchronous listeners, idempotent replacement
  binding from the central renderer, exact language order/markup/state
  transitions, Other/Level branching and analytics ordering, removal of only
  two aliases, and retention of the four later inline families. Browser,
  local-server, visual-regression, migration-ledger, diff-integrity, and
  static-review checks were not run in accordance with the repository
  `AGENTS.md` instruction for this task.
- **Rollback:** Revert this commit to restore language-choice and Language
  Continue inline handlers plus their two bridge aliases; no onboarding state,
  analytics, storage, or visual migration is required.
- **Association:** `codex/migration-05-javascript-modularization`; PR and release pending.

---

## MIG-118 — Migrate personalized onboarding level ownership

- **Date:** 2026-07-29
- **Phase:** 5 — JavaScript modularization
- **Type:** Behavior-neutral generated event-listener extraction with staged compatibility cleanup
- **Status:** Complete locally; remote PR and release pending
- **Intent:** Extend component ownership only to generated level choices while
  leaving navigation, channel selection, and Build handlers unchanged.
- **Conceptual change:** Extended the personalized-onboarding adapter with an
  exact `select-level` hook and required `selectLevel` callback. Each choice
  forwards its live level ID only. The central post-render binding now supplies
  `selectOnboardingLevel`, and its global bridge alias was removed.
- **Preservation contract:** Preserve the five normal level options, English
  omission of Starting, option order and localized detail, radiogroup and
  pressed ARIA, valid-ID guard, selected level state, channel-selection reset,
  recommendation reinitialization, same-step rerender, progress/step analytics,
  uncancelled generic click ordering, and all onboarding visuals and
  responsiveness.
- **Risks:** Stale or coerced IDs could select an invalid level; changing option
  derivation could reintroduce English Starting; missed replacement binding
  would make new choices inert; removing later aliases would break untouched
  controls.
- **Verification:** The first `npm test` run exposed one test-regex typo around
  the existing template `map(...).join('')`; only that contract expression was
  corrected. The final `npm test` passed: the production build completed and all
  513 contract tests passed, including live level-ID routing, exact five-versus-
  four English option order, uncancelled replacement binding, validation and
  reset behavior, generic ordering, level bridge removal, and retention of only
  step/channel/finish inline families. Browser, local-server,
  visual-regression, migration-ledger, diff-integrity, and static-review checks
  were not run in accordance with the repository `AGENTS.md` instruction for
  this task.
- **Rollback:** Revert this commit to restore level-choice inline handlers and
  their bridge alias; no onboarding state, recommendation, analytics, or visual
  migration is required.
- **Association:** `codex/migration-05-javascript-modularization`; PR and release pending.

---

## MIG-119 — Migrate personalized onboarding step ownership

- **Date:** 2026-07-29
- **Phase:** 5 — JavaScript modularization
- **Type:** Behavior-neutral generated event-listener extraction with staged compatibility cleanup
- **Status:** Complete locally; remote PR and release pending
- **Intent:** Move every Back/Continue consumer of the shared step callback
  together, avoiding split global and module ownership.
- **Conceptual change:** Extended the personalized-onboarding adapter with an
  exact `set-step` hook and required `setStep` callback. Other Back, Level Back,
  Level Continue, and Channel Back now expose their live target step in
  component metadata and forward that string only. Removed the matching global
  bridge alias; Language Continue retains its local lexical call.
- **Preservation contract:** Preserve Back-before-primary action order, exact
  `language`, `channels`, and `level` targets, disabled gates, dependency and
  Other-branch validation, current-step no-op analytics behavior, progress,
  locale-picker and channel-panel classes, and exact directional event ordering:
  advanced/backed, then newly viewed step, then generic click from the original
  enabled node. Preserve all copy, ARIA, focus replacement, and responsive
  presentation.
- **Risks:** Moving only some consumers would leave shared ownership split;
  stale or normalized step strings could alter guards; document delegation
  would reverse analytics order; removing the local function would break
  Language Continue.
- **Verification:** `npm test` passed: the production build completed and all
  520 contract tests passed, including all four exact destinations, live
  value-only forwarding, action order and disabled gates, dependency/current-
  step validation, Language Continue's lexical route, replacement binding,
  advanced/backed → viewed → generic ordering, step bridge removal, and
  retention of only channel and Finish inline families. Browser, local-server,
  visual-regression, migration-ledger, diff-integrity, and static-review checks
  were not run in accordance with the repository `AGENTS.md` instruction for
  this task.
- **Rollback:** Revert this commit to restore all four inline step handlers and
  their bridge alias; no onboarding state, analytics, storage, or visual
  migration is required.
- **Association:** `codex/migration-05-javascript-modularization`; PR and release pending.

---

## MIG-120 — Migrate personalized onboarding channel ownership

- **Date:** 2026-07-29
- **Phase:** 5 — JavaScript modularization
- **Type:** Behavior-neutral generated event-listener extraction with staged compatibility cleanup
- **Status:** Complete locally; remote PR and release pending
- **Intent:** Extend component ownership only to generated channel choices,
  leaving the persistence/network-heavy Build workflow isolated.
- **Conceptual change:** Extended the personalized-onboarding adapter with an
  exact `toggle-channel` hook and required `toggleChannel` callback. Each choice
  forwards its live catalog ID only. The central binding now supplies
  `toggleOnboardingChannel`, and that global bridge alias was removed.
- **Preservation contract:** Preserve recommended-channel membership and order,
  zero-to-six rendering, four-item grid threshold, avatars/fallbacks/style copy,
  pressed/check accessibility, initial first-five selection, exact five-channel
  limit and warning without rerender, zero-selection allowance, removal and
  re-add insertion order, applying-state no-op on still-enabled channel
  controls, same-step replacement, uncancelled generic analytics, localization,
  and responsive channel layout.
- **Risks:** Stale IDs could toggle the wrong catalog entry; changing Set order
  would alter persisted channel ordering; accidental disabled state would
  suppress applying-time generic clicks; rerendering on the sixth-choice guard
  would change focus and UI behavior.
- **Verification:** `npm test` passed: the production build completed and all
  528 contract tests passed, including live catalog-ID routing, zero-to-six
  recommendation order and layout variants, avatar/ARIA markup, first-five
  initialization, exact limit guard without rerender, remove/re-add ordering,
  applying-state no-op with generic analytics, channel bridge removal, and
  retention of Build as the only inline family. Browser, local-server,
  visual-regression, migration-ledger, diff-integrity, and static-review checks
  were not run in accordance with the repository `AGENTS.md` instruction for
  this task.
- **Rollback:** Revert this commit to restore channel-choice inline handlers and
  their bridge alias; no onboarding selection, ordering, analytics, or visual
  migration is required.
- **Association:** `codex/migration-05-javascript-modularization`; PR and release pending.

---

## MIG-121 — Migrate personalized onboarding finish ownership

- **Date:** 2026-07-29
- **Phase:** 5 — JavaScript modularization
- **Type:** Behavior-neutral generated event-listener extraction and compatibility cleanup
- **Status:** Complete locally; remote PR and release pending
- **Intent:** Complete personalized-onboarding ownership by migrating the two
  Build controls only after every lower-risk family is protected.
- **Conceptual change:** Extended the personalized-onboarding adapter with an
  exact `finish` hook and required `finish` callback. Other and Channel Build
  controls invoke the existing async `finishPersonalizedOnboarding` immediately
  with zero arguments; the adapter ignores its Promise and does not mutate the
  clicked control. Removed the final personalized-onboarding bridge alias.
- **Preservation contract:** Preserve the applying guard, 7.5-second music fade,
  synchronous Applying rerender, original enabled event target, disabled
  replacement controls and Building copy, learner-profile saves without backup,
  channel resolution/order/deduplication/restoration, partial/total failure
  handling, silent onboarding refresh, completion notice, final state/activity
  save, recovery resume targets, completion analytics, sanitized navigation,
  uncancelled generic Build click with its original label, localization,
  accessibility, and responsive presentation.
- **Risks:** Awaiting or deferring the callback would change event order;
  disabling the original node would suppress generic analytics; adding error
  handling would alter existing failure behavior; moving workflow logic into
  the adapter could affect persistence, network, recovery, or navigation.
- **Verification:** `npm test` passed: the production build completed and all
  536 contract tests passed, including zero-argument immediate Promise-neutral
  invocation, original enabled-node generic labeling, disabled Building
  replacement, full save/resolve/deduplicate/refresh/recovery/completion/
  navigation sequencing, final bridge removal, and module ownership for all six
  personalized-onboarding families. Browser, local-server, visual-regression,
  migration-ledger, diff-integrity, and static-review checks were not run in
  accordance with the repository `AGENTS.md` instruction for this task.
- **Rollback:** Revert this commit to restore both Build inline handlers and
  their final bridge alias; no onboarding, channel, storage, analytics, or
  visual migration is required.
- **Association:** `codex/migration-05-javascript-modularization`; PR and release pending.

---

## MIG-122 — Lock channel-filter and shared removal analytics identities

- **Date:** 2026-07-29
- **Phase:** 5 — JavaScript modularization
- **Type:** Analytics compatibility metadata and contract tests
- **Status:** Complete locally; remote PR and release pending
- **Intent:** Make the generated channel-filter row, checkbox, Select all, and
  shared filter/shelf removal identities explicit before migrating their nested
  event ownership.
- **Conceptual change:** Added handler-matching analytics metadata to the Select
  all row and checkbox, each channel option row and checkbox, filter removal
  buttons, and shelf-header removal buttons. All five handler families, inline
  arguments, callbacks, replacement rendering, and global bridge aliases remain
  unchanged.
- **Preservation contract:** Preserve alphabetical filter entries, known/new/
  removed channel reconciliation, selected and indeterminate state, labels and
  refresh timestamps, 30-second/visibility regeneration, row-versus-input
  double-toggle guards, Alt-click select-only cancellation, checkbox change
  behavior, removal-button propagation suppression, shared channel removal and
  Undo/activity/save/render behavior, shelf ordering/presentation, localization,
  accessibility, and responsive filter/shelf layouts. Preserve inert metadata
  on div/input controls and suppressed generic removal clicks.
- **Risks:** Normalizing nested events could double-toggle filters; missing the
  timestamp replacement path would leave controls inert later; removing the
  shared removal alias after only one surface migrates would break the other;
  changing propagation could invent generic events or trigger shelf/row clicks.
- **Verification:** `npm test` passed: the production build completed and all
  542 contract tests passed, including all five generated control families,
  exact inline event/value arguments, explicit identities, input/row/remove
  nesting guards, Alt-click cancellation, select-all indeterminate state,
  timestamp-triggered replacement, both removal surfaces, suppressed generic
  removal events, and all five retained bridge aliases. Browser, local-server,
  visual-regression, migration-ledger, diff-integrity, and static-review checks
  were not run in accordance with the repository `AGENTS.md` instruction for
  this task.
- **Rollback:** Revert this commit to restore handler-derived identities; no
  filter selection, channel removal, storage, analytics implementation, or
  visual migration is required.
- **Association:** `codex/migration-05-javascript-modularization`; PR and release pending.

---

## MIG-123 — Migrate channel-filter selection ownership

- **Date:** 2026-07-29
- **Phase:** 5 — JavaScript modularization
- **Type:** Behavior-neutral generated event-listener extraction with shared removal retention
- **Status:** Complete locally; remote PR and release pending
- **Intent:** Replace the Select all and per-channel row/checkbox inline
  handlers while keeping shared channel removal inline on both surfaces.
- **Conceptual change:** Added a channel-filter action adapter with exact
  `select-all-row`, `select-all`, `option-row`, and `select` hooks. Row listeners
  forward the native event (and live channel ID for options); checkbox change
  listeners forward only live checked state and channel ID. The filter renderer
  binds immediately after every options replacement. Removed the four matching
  bridge aliases; `removeChannelFromFilter` remains bridged.
- **Preservation contract:** Preserve entry ordering and reconciliation,
  selected/checked/indeterminate state, nested input guards, manual checkbox
  toggling from row clicks, Alt-click select-only prevention/propagation stop,
  filter-set initialization, feed rerender, labels/timestamps, periodic and
  visibility replacement, localization, accessibility, and responsive menu
  behavior. Preserve inert div/input analytics metadata and all filter/shelf
  removal handlers.
- **Risks:** Delegation or event omission could double-toggle nested inputs;
  stale checked or channel values could select the wrong set; missed periodic
  rebinding would break open filters after refresh; removing the shared removal
  alias now would break both untouched removal surfaces.
- **Verification:** The first `npm test` run found the adapter using the
  provisional `option` name instead of the committed `select` hook, two
  resulting ownership-fixture failures, and one older retained-neighbor
  assertion for `handleChannelFilterSelectAllClick`. Those test/adapter
  boundaries were aligned without changing callback behavior. The final
  `npm test` passed: the production build completed and all 555 contract tests
  passed, including exact row events and live checkbox/channel values, nested
  and Alt-click guards, idempotent replacement/timestamp binding, indeterminate
  timing, four bridge removals, and shared removal retention. Browser,
  local-server, visual-regression, migration-ledger, diff-integrity, and
  static-review checks were not run in accordance with the repository
  `AGENTS.md` instruction for this task.
- **Rollback:** Revert this commit to restore the four filter selection inline
  handler families and bridge aliases; no selection persistence, removal,
  analytics, or visual migration is required.
- **Association:** `codex/migration-05-javascript-modularization`; PR and release pending.

---

## MIG-124 — Migrate shared channel-removal ownership

- **Date:** 2026-07-29
- **Phase:** 5 — JavaScript modularization
- **Type:** Behavior-neutral cross-surface event-listener extraction and compatibility cleanup
- **Status:** Complete locally; remote PR and release pending
- **Intent:** Replace the shared filter and shelf removal inline handlers only
  after both generated insertion paths can bind the same component adapter.
- **Conceptual change:** Added a channel-removal action adapter with an exact
  `remove` hook. Each direct listener forwards the native click event and live
  channel ID to `removeChannelFromFilter`. Filter controls bind after options
  replacement; shelf controls bind after active-grid replacement. Removed the
  final shared removal bridge alias.
- **Preservation contract:** Preserve immediate callback-owned prevent-default
  and propagation stop, so filter-option rows, shelf containers, and generic
  click analytics do not receive removal clicks. Preserve removable membership,
  channel/inferred lookup, snapshots, removal state, Undo, activity log, save,
  full rerender, filters, shelves, empty/removed states, icons/labels/ARIA,
  ordering, localization, and responsive presentation.
- **Risks:** Binding only one surface would leave the other inert; delegation
  could allow row/shelf handlers or analytics to run first; stale IDs could
  remove the wrong channel; binding before replacement would attach to discarded
  nodes.
- **Verification:** The first `npm test` run found selector quote-style
  disagreement across three ownership harness cases, two binder-order
  expectations, and one older retained-neighbor assertion for
  `removeChannelFromFilter`. The selector was standardized, removal now binds
  first after filter replacement, and the stale expectation was removed without
  changing callback behavior. The final `npm test` passed: the production build
  completed and all 570 contract tests passed, including exact event/live-ID
  forwarding, callback-owned cancellation, both replacement bind sites,
  filter-row and shelf/generic suppression, removal transaction ordering, and
  final bridge cleanup. Browser, local-server, visual-regression,
  migration-ledger, diff-integrity, and static-review checks were not run in
  accordance with the repository `AGENTS.md` instruction for this task.
- **Rollback:** Revert this commit to restore both inline removal surfaces and
  their shared bridge alias; no channel state, storage, Undo, analytics, or
  visual migration is required.
- **Association:** `codex/migration-05-javascript-modularization`; PR and release pending.

---

## MIG-125 — Lock channel-shelf scrolling analytics identities

- **Date:** 2026-07-29
- **Phase:** 5 — JavaScript modularization
- **Type:** Analytics compatibility metadata and contract tests
- **Status:** Complete locally; remote PR and release pending
- **Intent:** Make both shelf-scroll button identities and the track's scroll
  callback identity explicit before migrating their generated handlers.
- **Conceptual change:** Added `scrollVideoChannelShelf` analytics metadata to
  Previous and Next controls and inert `syncVideoChannelShelfControls` metadata
  to each generated track. Both inline handlers, exact arguments, callbacks,
  initial synchronization, and global bridge aliases remain unchanged.
- **Preservation contract:** Preserve shelf/group/control order, exact `-1`/`1`
  directions, live button lookup, slot-width/gap pitch, four-card movement,
  clamping/fallback page movement, reduced-motion auto versus smooth behavior,
  focusable track and localized ARIA, two-pixel boundary tolerance, button
  disabling, pinned-preview reposition versus ordinary preview close, initial
  animation-frame sync, scrolling callbacks, localization, and every responsive
  shelf layout. Preserve generic button events and inert track metadata.
- **Risks:** Replacing live control lookup with stale track data could scroll
  the wrong shelf; string/coerced directions could alter movement; changing
  scroll callback order could affect previews or button states; missing
  replacement binding would break newly rendered shelves.
- **Verification:** `npm test` passed: the production build completed and all
  576 contract tests passed, including exact generated controls/track and
  directions, inline arguments and stable identities, pitch/index/clamp
  calculations, reduced-motion behavior, boundary disabling, pinned-versus-
  ordinary preview handling, initial animation-frame synchronization,
  replacement context, and both retained bridge aliases. Browser, local-server,
  visual-regression, migration-ledger, diff-integrity, and static-review checks
  were not run in accordance with the repository `AGENTS.md` instruction for
  this task.
- **Rollback:** Revert this commit to restore handler-derived identities; no
  scrolling, preview, reduced-motion, analytics implementation, or visual
  migration is required.
- **Association:** `codex/migration-05-javascript-modularization`; PR and release pending.

---

## MIG-126 — Migrate channel-shelf scrolling ownership

- **Date:** 2026-07-29
- **Phase:** 5 — JavaScript modularization
- **Type:** Behavior-neutral generated event-listener extraction and compatibility cleanup
- **Status:** Complete locally; remote PR and release pending
- **Intent:** Replace generated shelf button and track inline handlers while
  preserving live shelf lookup, scroll behavior, preview synchronization, and
  initial control state.
- **Conceptual change:** Added a shelf-scroll action adapter with exact `scroll`
  and `sync` hooks. Buttons forward themselves plus strict numeric `-1`/`1`
  direction; track scroll listeners forward the live track only. The active
  grid binds immediately after replacement and before later feature binders.
  Removed both global bridge aliases while retaining the local initial
  animation-frame synchronization callback.
- **Preservation contract:** Preserve every calculation and clamp, four-card
  movement, reduced-motion behavior, uncancelled generic button events,
  focusable tracks, localized ARIA, scroll-driven boundary disabling, pinned
  preview reposition, ordinary preview close, initial frame timing, grid/empty
  replacement, channel removal and Set aside binding order, and responsive
  shelf presentation.
- **Risks:** Coercing unsupported directions could change movement; stale button
  or track references could affect the wrong shelf; event delegation could
  reorder preview synchronization; removing the local sync function would break
  initial button state.
- **Verification:** `npm test` passed all 590 contract tests and the production
  build. The first run exposed one stale sequential ownership assertion that
  expected channel-removal binding immediately after grid replacement; the
  contract now records the preserved shelf-scroll, channel-removal, then Set
  aside binding order. Browser, local-server, visual-regression,
  migration-ledger, diff-integrity, and static-review checks were not run in
  accordance with the repository `AGENTS.md` instruction for this task.
- **Rollback:** Revert this commit to restore both button inline handlers, track
  scroll attributes, and bridge aliases; no scroll position, preview, analytics,
  or visual migration is required.
- **Association:** `codex/migration-05-javascript-modularization`; PR and release pending.

---

## MIG-127 — Lock manual channel-entry analytics identities

- **Date:** 2026-07-29
- **Phase:** 5 — JavaScript modularization
- **Type:** Analytics compatibility metadata and contract tests
- **Status:** Complete locally; remote PR and release pending
- **Intent:** Make all four remaining manual channel/video-entry handler
  identities explicit before replacing their inline ownership.
- **Conceptual change:** Added `addYoutubeInput` analytics metadata to the static
  submit form and exact handler-name metadata to the generated YouTube search,
  curated suggestion, and YouTube result buttons. All submit and click handlers
  remain inline and all four global bridge aliases remain installed in this
  preparatory commit.
- **Preservation contract:** Preserve native form submission and Enter-key
  routing without adding a submit button; exact video, channel, catalog, and
  invalid-input branches; search query normalization, cache, quota, cooldown,
  function-owned `results` and `lastRequestAt` state, loading/error messages,
  analytics event names and properties, and API behavior. Search and result
  clicks continue preventing default and stopping propagation before work, so
  their generic click identities remain latent. Keyboard result selection keeps
  calling the same lexical callbacks with the live keyboard event and dataset
  identifiers. Preserve suggestion ordering, duplicate handling, localization,
  focus, listbox/combobox semantics, popover closure, and every generated
  visual detail.
- **Risks:** A changed action string could rename future generic telemetry;
  metadata on the form could become active if the generic collector expands
  beyond buttons and links; changing the search callback object would lose
  cooldown or result state; altering suppression or keyboard routing could
  duplicate selection or close the popover.
- **Verification:** `npm test` passed: the production build completed and all
  600 contract tests passed, including exact static/generated markup, handler
  arguments, form routing, propagation suppression, keyboard selection,
  replacement paths, generic analytics boundaries, function-owned YouTube
  result/cooldown state, and all four retained bridge aliases. Browser,
  local-server, visual-regression, migration-ledger, diff-integrity, and
  static-review checks were not run in accordance with the repository
  `AGENTS.md` instruction for this task.
- **Rollback:** Revert this commit to restore handler-derived button identities
  and remove the inert form identity; no search, catalog, state, storage,
  analytics, API, or visual migration is required.
- **Association:** `codex/migration-05-javascript-modularization`; PR and release pending.

---

## MIG-128 — Migrate manual-entry submit ownership

- **Date:** 2026-07-29
- **Phase:** 5 — JavaScript modularization
- **Type:** Behavior-neutral static event-listener extraction and compatibility cleanup
- **Status:** Complete locally; remote PR and release pending
- **Intent:** Move the static manual channel/video form submission out of its
  inline handler without combining it with dynamically replaced search results.
- **Conceptual change:** Extended the existing manual-video shell adapter with
  one `submit` action, marked the form with that ownership action, passed the
  original `addYoutubeInput` callback at composition, removed the inline
  `onsubmit`, and removed only its global bridge alias. Existing contracts were
  updated instead of adding a separate large test file.
- **Preservation contract:** Preserve the original native submit event,
  synchronous default prevention, ignored async return, Enter-key submission,
  exact video/channel/catalog/invalid-input routing, absent submit button and
  nullable `manualVideoAddBtn`, explicit inert analytics identity, focus,
  localization, popover behavior, state, storage, and API behavior. The three
  dynamic search/result handlers remain inline and bridged for the next batch.
- **Risks:** Listening for `click` instead of `submit`, deferring the callback,
  synthesizing an event, or adding a button would change native form behavior;
  removing the other three aliases early would break generated controls.
- **Verification:** The single consolidated `npm test` run passed: the
  production build completed and all 600 existing contract tests passed.
  Browser, local-server, visual-regression, migration-ledger, diff-integrity,
  and static-review checks were not run in accordance with the repository
  `AGENTS.md` instruction for this task.
- **Rollback:** Revert this commit to restore the form inline handler and its
  bridge alias; no state, storage, analytics, API, or visual migration is
  required.
- **Association:** `codex/migration-05-javascript-modularization`; PR and release pending.

---

## MIG-129 — Migrate generated manual-search ownership

- **Date:** 2026-07-29
- **Phase:** 5 — JavaScript modularization
- **Type:** Behavior-neutral generated event-listener extraction and compatibility cleanup
- **Status:** Complete locally; remote PR and release pending
- **Intent:** Remove the final three manual channel-entry inline handlers as one
  cohesive dynamic-content batch.
- **Conceptual change:** Extended the existing manual-video adapter with direct
  YouTube-search, curated-result, and YouTube-result click actions; added stable
  ownership metadata to generated controls; rebound the adapter immediately
  after each action-producing suggestion-list replacement; removed the three
  inline attributes and global bridge aliases. Existing contracts were updated
  rather than adding another test file.
- **Preservation contract:** Preserve the original live click event and button
  `currentTarget`, synchronous default prevention and propagation stopping,
  ignored async returns, live dataset IDs, keyboard selection’s existing
  lexical callbacks, search/result analytics ordering and properties,
  duplicate guards, function-owned result/cooldown state, query-staleness
  guard, list ordering, focus, ARIA, localization, caching, quota, and API
  behavior. Empty, loading, and error replacements remain action-free.
- **Risks:** Delegation would change `currentTarget`; late rebinding could leave
  generated buttons inert; wrapping the search callback could lose its function
  properties; changing keyboard routing could alter existing analytics data.
- **Verification:** The single consolidated `npm test` run passed: the
  production build completed and all 600 existing contract tests passed.
  Browser, local-server, visual-regression, migration-ledger, diff-integrity,
  and static-review checks were not run in accordance with the repository
  `AGENTS.md` instruction for this task.
- **Rollback:** Revert this commit to restore the three inline handlers and
  bridge aliases; no catalog, search, state, storage, analytics, API, or visual
  migration is required.
- **Association:** `codex/migration-05-javascript-modularization`; PR and release pending.

---

## MIG-130 — Migrate rendered video-state ownership

- **Date:** 2026-07-29
- **Phase:** 5 — JavaScript modularization
- **Type:** Behavior-neutral generated event-listener extraction and compatibility cleanup
- **Status:** Complete locally; remote PR and release pending
- **Intent:** Remove the remaining card and shelf-badge dependencies on the
  shared video-state globals as one cohesive render-lifecycle batch.
- **Conceptual change:** Added one compact video-state adapter for Clear paused,
  Watch later, and Favorite controls; replaced five inline patterns with stable
  action and analytics metadata; bound active and Watched grids after render
  and rebound preview cards after targeted action-UI patching; removed the
  `clearVideoPausedState`, `markVideo`, and `toggleVideoFavorite` bridge aliases.
  One compact boundary test file covers the adapter and render integration.
- **Preservation contract:** Preserve priority-badge cancellation, footer-action
  bubbling and generic analytics identities, exact status/options/surface
  arguments, Undo/Redo and persistence, scoring and activity behavior,
  Favorite independence, removed-channel refreshes, active-preview anchoring,
  Next Study and embedded-player lexical consumers, control focus, ARIA,
  localization, ordering, and all responsive presentation. Existing controls
  read live action metadata so targeted preview updates can safely change a
  badge’s action without replacing its listener.
- **Risks:** Cancelling footer clicks would remove existing generic telemetry;
  failing to cancel priority badges could open previews; capturing stale action
  metadata would apply the wrong state transition after preview UI patching;
  missing either grid binding would leave cards inert.
- **Verification:** The consolidated `npm test` rerun passed: the production
  build completed and all 604 contract tests passed. The first run kept all 600
  pre-existing contracts green and exposed only a closing-token typo in the
  new compact test file, which was corrected before the passing rerun. Browser,
  local-server, visual-regression, migration-ledger, diff-integrity, and
  static-review checks were not run in accordance with the repository
  `AGENTS.md` instruction for this task.
- **Rollback:** Revert this commit to restore the five inline patterns and
  three bridge aliases; no video state, storage, scoring, analytics, or visual
  migration is required.
- **Association:** `codex/migration-05-javascript-modularization`; PR and release pending.

---

## MIG-131 — Migrate channel-ordering ownership

- **Date:** 2026-07-29
- **Phase:** 5 — JavaScript modularization
- **Type:** Behavior-neutral drag and pointer event-listener extraction
- **Status:** Complete locally; remote PR and release pending
- **Intent:** Move desktop drag/drop and touch/pointer channel ordering out of
  six inline/global handlers without changing the ordering model.
- **Conceptual change:** Added one channel-order adapter that directly binds all
  five native shelf drag events and the avatar pointer-down event; marked each
  generated shelf and both avatar branches with stable ownership metadata;
  bound them after active-grid replacement; removed all six inline attributes
  and bridge aliases. One compact test file covers event forwarding, binding,
  replacement safety, markup, and compatibility removal.
- **Preservation contract:** Preserve fine-pointer desktop eligibility, touch
  thresholds and pointer capture, interactive-descendant guards, link behavior,
  preview cloning/positioning, edge scrolling, drop indicators and midpoint
  placement, hidden-channel order merging, persistence, cleanup, click
  suppression, animation timing, exact native events and live controls, channel
  ordering, and all responsive presentation. No analytics metadata was added to
  the avatar link because doing so would rename its existing generic click
  identity; drag and pointer events are not collected by that click listener.
- **Risks:** Passing the wrong shelf/handle would break target lookup; omitting
  one native event would leave stale drag state; changing cancellation or
  pointer cleanup could interfere with links, cards, scrolling, or future
  drags.
- **Verification:** The single consolidated `npm test` run passed: the
  production build completed and all 607 contract tests passed. Browser,
  local-server, visual-regression, migration-ledger, diff-integrity, and
  static-review checks were not run in accordance with the repository
  `AGENTS.md` instruction for this task.
- **Rollback:** Revert this commit to restore the six inline handlers and
  bridge aliases; the persisted channel order remains compatible and requires
  no migration.
- **Association:** `codex/migration-05-javascript-modularization`; PR and release pending.

---

## MIG-132 — Migrate shelf preview and player ownership

- **Date:** 2026-07-29
- **Phase:** 5 — JavaScript modularization
- **Type:** Behavior-neutral pointer, mouse, focus, and click listener extraction
- **Status:** Complete locally; remote PR and release pending
- **Intent:** Remove the final six global action dependencies from video
  thumbnail, shelf preview, and player-opening interactions.
- **Conceptual change:** Added one shelf-preview adapter for thumbnail clicks
  plus card click, mouse-enter/leave, and focus-in/out events; replaced the
  thumbnail and shelf-card inline handlers with stable ownership metadata;
  bound both active and Watched grids after replacement; removed the final six
  bridge aliases, leaving the compatibility manifest empty. One compact test
  file covers the adapter, markup, render bindings, and compatibility state.
- **Preservation contract:** Preserve thumbnail cancellation and false-return
  behavior, latent thumbnail analytics identity, direct phone/player opening,
  tap-versus-hover capability gates, interactive-descendant guards, exact
  pointer event forwarding for preview placement, focus timing, leave and
  cleanup timers, reduced motion, preview pinning/anchoring, player lifecycle,
  keyboard behavior, Watched cards, all visual states, and responsive
  presentation. Card metadata intentionally does not alter generic click
  analytics because the collector targets only buttons and links.
- **Risks:** Letting thumbnail clicks bubble could trigger card or document
  actions; omitting a focus/mouse listener could strand preview state; passing
  a synthetic or wrong event could misplace previews; failing to bind Watched
  cards would break direct video opening there.
- **Verification:** The consolidated `npm test` rerun passed: the production
  build completed and all 610 contract tests passed. The first run kept 609
  contracts green and exposed only the legacy installer test’s former
  assumption that the manifest contained at least one action; it now also
  covers empty-manifest divergence. Browser, local-server, visual-regression,
  migration-ledger, diff-integrity, and static-review checks were not run in
  accordance with the repository `AGENTS.md` instruction for this task.
- **Rollback:** Revert this commit to restore the six inline handlers and final
  bridge aliases; no playback, watch state, storage, analytics, or visual
  migration is required.
- **Association:** `codex/migration-05-javascript-modularization`; PR and release pending.

---

## MIG-133 — Migrate generated image-error ownership

- **Date:** 2026-07-29
- **Phase:** 5 — JavaScript modularization
- **Type:** Behavior-neutral capture-phase error-listener extraction
- **Status:** Complete locally; remote PR and release pending
- **Intent:** Remove the final three inline event attributes without creating a
  cached-image timing gap.
- **Conceptual change:** Added one idempotent document-level capture listener
  for opted-in image failures; replaced three `onerror` attributes with stable
  fallback metadata; installed the listener before application initialization.
  One compact test file covers capture, opt-in behavior, integration, complete
  inline-handler removal, and boundary validation.
- **Preservation contract:** Preserve the exact failure outcome (`hidden =
  true`) for curated suggestions, YouTube search results, and channel-shelf
  avatars; keep successful images, lazy loading, referrer policy, drag behavior,
  fallbacks, markup order, layout, and localization unchanged. Capture-phase
  ownership is installed before dynamic insertion so an immediately failing
  cached request cannot outrun per-element rebinding.
- **Risks:** A bubbling listener would miss non-bubbling image errors; binding
  after rendering could expose a race; matching ordinary images would hide
  unrelated assets.
- **Verification:** The consolidated `npm test` rerun passed: the production
  build completed and all 613 contract tests passed. The first run kept 612
  contracts green and exposed only an overbroad new source assertion that also
  matched JavaScript identifiers beginning with `on`; the assertion now
  targets quoted HTML event attributes. Browser, local-server,
  visual-regression, migration-ledger, diff-integrity, and static-review checks
  were not run in accordance with the repository `AGENTS.md` instruction for
  this task.
- **Rollback:** Revert this commit to restore the three inline error handlers;
  no image, state, storage, analytics, or visual migration is required.
- **Association:** `codex/migration-05-javascript-modularization`; PR and release pending.

---

## MIG-134 — Introduce named responsive capabilities

- **Date:** 2026-07-29
- **Phase:** 6 — Responsive architecture migration
- **Type:** Behavior-neutral responsive decision interface
- **Status:** Complete locally; remote PR and release pending
- **Intent:** Replace device-labelled and scattered media checks with explicit
  layout, input, interaction, and motion capabilities while retaining every
  current threshold.
- **Conceptual change:** Added one responsive-capability module containing the
  existing phone, aspect-ratio, coarse-pointer, tablet, hover/fine-pointer,
  no-hover, and reduced-motion queries. Application decisions now call named
  capabilities for phone composition, Anki input suitability, compact
  portrait controls, tablet reveal timing, heatmap positioning, channel drag,
  video preview interaction, coarse-pointer behavior, and motion. Raw
  `matchMedia` calls and the ambiguous `isMobileLayout` helper were removed from
  `app.js`; geometry-based viewport measurements remain local to positioning
  calculations.
- **Preservation contract:** Preserve every exact media query and `640/641`,
  `768`, and aspect-ratio boundary; all header, walkthrough, settings, activity
  log, filter, Next Study, history, city, popover, Anki, drag, preview,
  background, tooltip, and reduced-motion outcomes; event timing, feature
  availability, state, storage, localization, analytics, and visuals. Naming a
  capability does not authorize changing its existing behavior.
- **Risks:** A query typo or inverted result could affect many surfaces;
  detaching `matchMedia` incorrectly could fail in some browsers; replacing
  geometry checks would conflate layout decisions with positioning.
- **Verification:** The single consolidated `npm test` run passed: the
  production build completed and all 617 contract tests passed. Browser,
  local-server, visual-regression, migration-ledger, diff-integrity, and
  static-review checks were not run in accordance with the repository
  `AGENTS.md` instruction for this task.
- **Rollback:** Revert this commit to restore the local media checks; no state,
  storage, analytics, responsive, or visual migration is required.
- **Association:** `codex/migration-05-javascript-modularization`; PR and release pending.

---

## MIG-135 — Decompose the responsive compatibility cascade

- **Date:** 2026-07-29
- **Phase:** 6 — Responsive architecture migration
- **Type:** Byte-preserving stylesheet ownership decomposition
- **Status:** Complete locally; remote PR and release pending
- **Intent:** Remove the 2,451-line `responsive-legacy` catch-all while
  preserving the protected desktop, tablet, and phone cascade exactly.
- **Conceptual change:** Split the former final responsive file at existing
  top-level cascade boundaries into four ordered layers: page/full-screen flows,
  coarse-input and touch targets, phone component composition, and
  tablet/desktop plus capability/motion rules. Updated the style index,
  protected source contract, and split manifest with exact byte ranges, line
  ranges, and hashes. Concatenating the four files reproduces the former file
  byte-for-byte.
- **Preservation contract:** Preserve every selector, declaration, comment,
  breakpoint, media capability, specificity, source byte, newline, import
  position, and cascade order. Therefore all desktop, tablet, phone, locale,
  pointer, hover, touch, and reduced-motion output remains structurally
  unchanged. No container query was introduced without visual proof; current
  component outcomes remain **Keep**, and any later container conversion is a
  separately reviewable candidate rather than an unverified rewrite.
- **Risks:** Changing even one split boundary or import order could alter the
  cascade or protected build hash; renaming a layer without updating the source
  contract could break deterministic builds.
- **Verification:** The single consolidated `npm test` run passed: the
  production build completed and all 617 contract tests passed, including
  byte-identical protected source and built stylesheet hashes. Browser,
  local-server, visual-regression, migration-ledger, diff-integrity, and
  static-review checks were not run in accordance with the repository
  `AGENTS.md` instruction for this task.
- **Rollback:** Revert this commit to restore the single
  `99-responsive-legacy.css` file; no selector, responsive, state, storage,
  analytics, or visual migration is required.
- **Association:** `codex/migration-05-javascript-modularization`; PR and release pending.

---

## MIG-136 — Establish the responsive approval matrix

- **Date:** 2026-07-29
- **Phase:** 7 — Intentional responsive improvements
- **Type:** Governance and review documentation
- **Status:** Complete locally; remote PR and release pending
- **Intent:** Make the boundary between protected responsive behavior and
  possible future phone/tablet alignment explicit without redesigning any
  working surface.
- **Conceptual change:** Added a responsive review matrix that groups the
  detailed preservation inventory into fourteen scannable responsive surfaces,
  keeps every current outcome protected, identifies four discussion-only
  candidates, records that no visual change is approved, and defers browser and
  screenshot review. The matrix also names the new CSS and JavaScript
  responsive owners.
- **Preservation contract:** Every row of the complete current-experience
  inventory remains **Keep**. Candidate rows do not authorize source,
  snapshot, layout, interaction, content-order, state, analytics,
  localization, accessibility, or behavior changes. Nothing may become an
  **Approved change** without explicit user approval and a separate ledger
  entry.
- **Risks:** A broad candidate could be mistaken for permission to redesign;
  grouping could be mistaken for replacing detailed inventory coverage. The
  document explicitly makes candidates non-executable and keeps the detailed
  inventory authoritative.
- **Verification:** Documentation links and ownership paths were recorded in
  the same commit. No test run was spent on this documentation-only change.
  Browser, local-server, visual-regression, migration-ledger, diff-integrity,
  and static-review checks were not run in accordance with the repository
  `AGENTS.md` instruction for this task.
- **Rollback:** Revert this commit to remove the review matrix; no application
  source, build output, state, storage, analytics, or visuals are affected.
- **Association:** `codex/migration-05-javascript-modularization`; PR and release pending.

---

## MIG-137 — Complete migration cleanup and handoff

- **Date:** 2026-07-29
- **Phase:** 8 — Final cleanup
- **Type:** Compatibility removal, contract consolidation, and contributor/release documentation
- **Status:** Complete locally; remote PR, production acceptance, and release pending
- **Intent:** Remove the temporary global action bridge after its final consumer
  migrated and leave maintainers with accurate architecture, contribution,
  deployment, release, and rollback guidance.
- **Conceptual change:** Removed the compatibility installer, its application
  import/call, and the empty `window.EdeniaActions` namespace; replaced the
  compatibility manifest with an intentionally empty frozen global-action
  contract; updated ownership and preservation tests to use that final
  contract; and added architecture, contributing, deployment/release, and
  rollback documentation. Updated the README project map and linked all
  migration handoff documents. No responsive compatibility file or global
  action alias remains.
- **Preservation contract:** Preserve all application rendering, event
  forwarding and cancellation, initialization order, state and storage,
  analytics identities, localization, runtime configuration, accessibility,
  deployed filenames, responsive queries, selectors, cascade, and
  phone/tablet/desktop outcomes. The removed namespace was a temporary
  migration-only adapter with an empty manifest and no remaining application
  consumer; removal restores the no-global-action architecture without changing
  product behavior.
- **Risks:** A missed inline handler or hidden dependency on the temporary
  namespace could break an interaction; stale documentation could encourage an
  unsafe release or responsive change. The final contract recursively audits
  static and generated source for inline handlers and rejects any global action
  name, while the runbooks keep intentional UI work behind explicit approval.
- **Verification:** One consolidated final `npm test` run passed: the build
  completed and all 616 contract tests passed. No additional test run was spent
  on documentation-only edits. Browser, local-server, visual-regression,
  migration-ledger, diff-integrity, and static-review checks were not run in
  accordance with the repository `AGENTS.md` instruction for this task.
- **Rollback:** Revert this commit to restore the empty migration namespace and
  prior test contract. No state, storage, analytics, localization, responsive,
  or visual migration is required.
- **Association:** `codex/migration-05-javascript-modularization`; PR and release pending.

---

## MIG-138 — Correct the migration governance audit boundary

- **Date:** 2026-07-30
- **Phase:** 8 — Final cleanup
- **Type:** CI governance correction
- **Status:** Complete locally; PR verification pending
- **Intent:** Keep migration-ledger enforcement strict without misclassifying
  ordinary commits that predate the `v1.0.0` migration baseline.
- **Conceptual change:** The governance checker now locates `MIG-001` in the
  current history. When the configured PR base predates that boundary, it
  audits `MIG-001` and every later commit; when the base already contains
  `MIG-001`, it continues auditing every commit after the configured base.
  This corrects PR #1, where GitHub `master` is 82 ordinary commits behind the
  tagged local baseline, without renaming or rewriting historical commits.
- **Preservation contract:** Continue requiring every non-automation commit in
  the migration range to use `MIG-###`, update `migration_changes.md`, and add
  its matching ledger heading. Preserve the existing automation exceptions,
  ancestor validation, CI trigger, application source, build, tests, runtime,
  state, analytics, localization, accessibility, and responsive output.
- **Risks:** Choosing an audit boundary too late could omit a migration commit.
  The checker anchors only to the first `MIG-001` ancestor and skips only
  commits before it; once a PR base contains that boundary, normal base-to-HEAD
  enforcement resumes automatically.
- **Verification:** The targeted
  `npm run check:migration -- --base origin/master` command passed for all 137
  existing migration commits from the detected `MIG-001` boundary. PR CI will
  apply the same check to this `MIG-138` commit after it is pushed. No build,
  contract, browser, local-server, visual-regression, diff-integrity, or
  static-review check is repeated for this CI-only correction.
- **Rollback:** Revert this commit to restore base-to-HEAD-only auditing. No
  application, state, storage, analytics, localization, responsive, or visual
  rollback is required.
- **Association:** `codex/migration-05-javascript-modularization`;
  [PR #1](https://github.com/BriceChivu/Edenia/pull/1); release pending.

---

## MIG-139 — Align the browser harness with final migration contracts

- **Date:** 2026-07-30
- **Phase:** 8 — Final cleanup
- **Type:** CI browser-test harness correction
- **Status:** Complete locally; PR verification pending
- **Intent:** Let browser acceptance exercise the final no-global-action
  architecture and the intended non-special local feedback path instead of
  failing on obsolete harness assumptions.
- **Conceptual change:** Updated Playwright ownership assertions to treat the
  intentionally absent `window.EdeniaActions` namespace as an empty action
  surface while retaining explicit proof that the namespace is not published.
  Configured pull-request CI to run the normal application on port `4173`,
  leaving port `8001` reserved for sandbox testing; this avoids port `8000`'s
  deliberate local-feedback success simulation when testing the unavailable
  feedback branch.
- **Preservation contract:** Preserve all application source, runtime behavior,
  event ownership, storage, analytics, localization, accessibility,
  responsive output, screenshot baselines, public ports, and GitHub Pages
  deployment. Per-action assertions continue requiring every former global
  alias to be absent, and the frozen empty source contract continues rejecting
  new global action names.
- **Risks:** A permissive test fallback could hide an accidentally restored
  namespace, or changing the CI port could alter sandbox coverage. The
  top-level browser assertion explicitly requires `EdeniaActions` to be absent,
  every alias remains expected `false`, and sandbox stays fixed at its existing
  `8001` origin.
- **Verification:** No local browser, local-server, visual-regression,
  build/contract, diff-integrity, or static-review check is run in accordance
  with the repository `AGENTS.md` instruction. PR CI will run governance,
  build, all contracts, browser flows, and unchanged visual baselines after
  this commit is pushed.
- **Rollback:** Revert this commit to restore the obsolete bridge assumption
  and port `8000` normal-mode CI. No application, state, storage, analytics,
  localization, responsive, or visual rollback is required.
- **Association:** `codex/migration-05-javascript-modularization`;
  [PR #1](https://github.com/BriceChivu/Edenia/pull/1); release pending.

---

## MIG-140 — Complete locale alias removal expectations

- **Date:** 2026-07-30
- **Phase:** 8 — Final cleanup
- **Type:** CI browser-test expectation correction
- **Status:** Complete locally; PR verification pending
- **Intent:** Finish the approved browser-harness alignment by making the
  Settings locale flow expect all migrated locale aliases to be absent.
- **Conceptual change:** Changed four stale locale bridge expectations from
  present to absent for intro locale menu, intro locale change, onboarding
  locale menu, and onboarding locale change actions. The browser assertions
  already read the safely absent global-action surface introduced by
  `MIG-139`; their expected values now match the completed module ownership.
- **Preservation contract:** Preserve application source and behavior, locale
  selection and persistence, exact five-locale copy, analytics, storage,
  accessibility, responsive output, CI ports, and every screenshot baseline.
  All six locale-related global aliases remain required to be absent.
- **Risks:** An incorrect expected value could conceal a missing action owner.
  The same test continues exercising the real Settings, intro, and onboarding
  locale controls and separately verifies their localized document state and
  persistence before checking that no global aliases were published.
- **Verification:** The preceding PR run passed governance, build, all 616
  contracts, and 60 browser tests. It reported no remaining namespace
  TypeErrors and isolated this single stale locale expectation plus five
  unchanged visual comparisons. No local browser, local-server,
  visual-regression, build/contract, diff-integrity, or static-review check is
  run for this test-only correction; PR CI will rerun the full suite.
- **Rollback:** Revert this commit to restore the four obsolete `true`
  expectations. No application, state, storage, analytics, localization,
  responsive, or visual rollback is required.
- **Association:** `codex/migration-05-javascript-modularization`;
  [PR #1](https://github.com/BriceChivu/Edenia/pull/1); release pending.

---

## MIG-141 — Approve Linux visual baselines

- **Date:** 2026-07-30
- **Phase:** 8 — Final cleanup
- **Type:** Explicitly approved snapshot-only baseline update
- **Status:** Complete locally; PR verification pending
- **Intent:** Make GitHub Actions' Linux rendering the deterministic visual
  reference for the five comparisons explicitly reviewed and approved by the
  user.
- **Conceptual change:** Replaced exactly five expected PNGs with the approved
  Linux `actual.png` artifacts from Actions run `30471298598`: Settings open at
  desktop-wide, tablet portrait, and tablet landscape; completed dashboard at
  phone standard and phone small. No snapshot generation was run locally.
- **Preservation contract:** Preserve all application source, runtime behavior,
  build inputs, tests, CSS, responsive rules, state, analytics, localization,
  accessibility, and public deployment. Preserve desktop-standard and every
  other existing screenshot unchanged. This updates platform rendering
  evidence only and does not approve an intentional UI change or move any
  responsive matrix row out of **Keep**.
- **Risks:** Updating a baseline without stable evidence could normalize a
  regression. The user explicitly approved these Linux results after the
  functional suite was isolated, and the first-attempt and retry PNGs were
  byte-identical for all five cases before replacement.
- **Verification:** SHA-256 comparison confirmed that each selected Linux
  screenshot exactly matched its retry. No local browser, local-server,
  screenshot generation, visual-regression execution, build/contract,
  diff-integrity, or static-review check is run in accordance with the
  repository `AGENTS.md` instruction. PR CI will rerun governance, build, all
  contracts, all browser flows, and the updated visual comparisons.
- **Rollback:** Revert this commit to restore the five prior platform
  baselines. No application, state, storage, analytics, localization,
  responsive, or runtime rollback is required.
- **Association:** `codex/migration-05-javascript-modularization`;
  [PR #1](https://github.com/BriceChivu/Edenia/pull/1);
  [Actions run 30471298598](https://github.com/BriceChivu/Edenia/actions/runs/30471298598);
  release pending.

---

## MIG-142 — Approve phone Settings Linux baselines

- **Date:** 2026-07-30
- **Phase:** 8 — Final cleanup
- **Type:** Explicitly approved snapshot-only baseline update
- **Status:** Complete locally; PR verification pending
- **Intent:** Complete the reviewed Linux visual-baseline alignment for the two
  phone Settings comparisons that became reachable only after the preceding
  screenshot failures were accepted.
- **Conceptual change:** Replaced exactly two expected PNGs with the
  user-approved first-attempt `settings-open-actual.png` artifacts from Actions
  run `30499704602`: Settings open at phone standard and phone small. No
  application source, CSS, test logic, or snapshot-generation configuration
  changed, and no snapshot generation was run locally.
- **Preservation contract:** Preserve all application source, runtime behavior,
  build inputs, tests, CSS, responsive rules, state, analytics, localization,
  accessibility, and public deployment. Preserve every other screenshot
  unchanged. This records platform rendering evidence only; it does not
  approve an intentional UI change or move either responsive matrix row out of
  **Keep**.
- **Risks:** A platform baseline could normalize an unstable rendering result.
  The user explicitly approved both phone Settings baselines after Actions
  isolated them as the only failures. The phone-standard first attempt and
  retry were byte-identical. The phone-small pair had identical dimensions and
  file sizes and differed by only 2 pixels out of 288,000; the first attempt is
  the recorded reference.
- **Verification:** Actions run `30499704602` passed migration governance,
  build, all 616 contracts, and 64 browser tests before reporting only these
  two visual failures. Artifact SHA-256 comparison confirmed the
  phone-standard retry was identical, and a pixel comparison measured the
  phone-small retry variance described above. No local browser, local-server,
  screenshot generation, visual-regression execution, build/contract,
  diff-integrity, or static-review check is run in accordance with the
  repository `AGENTS.md` instruction. PR CI will rerun the complete workflow.
- **Rollback:** Revert this commit to restore the two prior phone Settings
  platform baselines. No application, state, storage, analytics, localization,
  responsive, or runtime rollback is required.
- **Association:** `codex/migration-05-javascript-modularization`;
  [PR #1](https://github.com/BriceChivu/Edenia/pull/1);
  [Actions run 30499704602](https://github.com/BriceChivu/Edenia/actions/runs/30499704602);
  release pending.

---

## MIG-143 — Add a safe one-command local development workflow

- **Date:** 2026-07-30
- **Phase:** 8 — Final cleanup
- **Type:** Developer tooling, configuration boundary, test, and documentation
- **Status:** Complete locally; PR verification pending
- **Intent:** Make realistic localhost and iPhone Simulator testing a
  one-command workflow without weakening the credential-free CI build or the
  production secret-injection boundary.
- **Conceptual change:** Added `npm run dev` as an explicit local-only path. It
  validates the ignored root `config.local.js` before building, rejects empty
  and tracked placeholder keys with one-time setup guidance, runs the existing
  deterministic build, writes a normalized `_site/config.local.js` without
  logging the key, and serves `_site` at `http://localhost:8000/`. Promoted the
  existing hardened Node static server from test support to shared tooling and
  updated Playwright to use the same path. Replaced the repeated manual
  build/copy/server README procedure with one-time configuration followed by
  `npm run dev`.
- **Preservation contract:** Preserve application source, browser behavior,
  visuals, responsive output, storage, analytics, localization, accessibility,
  public filenames, GitHub Pages deployment, and production configuration.
  Preserve `npm run build` as a keyless deterministic build, preserve all test
  commands' mocked/no-quota boundary, and preserve `npm run build:production`
  as the only production runtime-config writer. The development server remains
  loopback-only by default and performs one build per invocation rather than
  introducing watch or LAN behavior.
- **Risks:** Local tooling could leak a key, accidentally contaminate CI
  output, expose a key-bearing site to the LAN, or drift from the browser-test
  server. The local source and generated directory remain ignored; the helper
  logs neither config source nor key; standard builds still overwrite runtime
  config with an empty value; the shared server binds to `localhost`; and local
  development plus Playwright use one server implementation. The key is still
  browser-delivered by design and therefore must use API, referrer, and quota
  restrictions.
- **Verification:** Ran only
  `node --test tests/contracts/local-runtime-config.test.mjs`: 3 tests passed,
  covering missing-file setup guidance, placeholder rejection, and normalized
  output from a fake development key in temporary directories. The real
  ignored local key was not read by the test. No browser, local-server,
  visual-regression, full-suite, diff-integrity, or static-review check was run
  in accordance with the repository `AGENTS.md` instruction. PR CI will rerun
  migration governance, build/contracts, browser flows, and visual acceptance.
- **Rollback:** Revert this commit to remove the local config helper, dev
  launcher, focused contracts, package command, README instructions, and
  shared-server path change. The preceding manual `_site` build/config/server
  workflow and prior Playwright server location will be restored; no
  application, state, storage, analytics, localization, responsive, visual, or
  production rollback is required.
- **Association:** `codex/migration-05-javascript-modularization`;
  [PR #1](https://github.com/BriceChivu/Edenia/pull/1); release pending.

---

## MIG-144 — Enforce master migration governance

- **Date:** 2026-07-30
- **Phase:** 8 — Final cleanup
- **Type:** Remote repository governance and release preparation
- **Status:** Complete remotely; PR verification pending
- **Intent:** Enforce the approved pull-request and CI boundary on `master`
  before merging the migration, while keeping the repository workable for its
  current solo maintainer.
- **Conceptual change:** Changed GitHub `master` from unprotected to protected.
  All changes, including administrator changes, must now arrive through a pull
  request; zero approving reviews are required so the repository owner is not
  blocked from merging their own reviewed work. The branch must be current and
  the `verify` check must pass from the GitHub Actions app (`app_id: 15368`).
  Review conversations must be resolved, force-pushes and branch deletion are
  disabled, and linear history is not required so the approved merge-commit
  policy remains available.
- **Preservation contract:** Preserve repository visibility, ownership,
  collaborators, Actions workflows, release permissions, application source,
  runtime behavior, visuals, state, analytics, localization, accessibility,
  and deployment. Preserve merge commits so atomic `MIG-###` commits remain
  individual rollback boundaries. Do not require an external reviewer that the
  solo-maintainer repository does not have.
- **Risks:** An incorrect status context, app source, review count, or history
  rule could prevent legitimate merges or permit unverified direct changes.
  The required context and GitHub Actions app were resolved from the successful
  `MIG-143` check run immediately before protection. The applied response
  confirmed strict `verify`, administrator enforcement, zero approvals,
  conversation resolution, merge-commit compatibility, and disabled force
  pushes/deletions.
- **Verification:** GitHub's branch-protection API first returned `404 Branch
  not protected`, and the subsequent update/read response confirmed every
  setting listed above. No browser, local-server, visual-regression, build,
  contract, diff-integrity, or static-review check was run for this
  repository-setting change in accordance with `AGENTS.md`. PR CI will verify
  this ledger-only commit before merge.
- **Rollback:** An administrator can update or remove the `master` protection
  rule through GitHub repository settings or the branch-protection API. Do not
  rewrite Git history or force-push as part of rollback. No application,
  deployment, state, storage, analytics, localization, responsive, or visual
  rollback is required.
- **Association:** `codex/migration-05-javascript-modularization`;
  [PR #1](https://github.com/BriceChivu/Edenia/pull/1); `v1.0.1` release
  pending.

---

## MIG-145 — Route catalog automation through review branches

- **Date:** 2026-07-30
- **Phase:** 8 — Final cleanup
- **Type:** Protected-branch workflow compatibility and least-privilege
  automation
- **Status:** Implemented locally; pull-request verification pending
- **Intent:** Restore the three generated channel-catalog maintenance workflows
  after `master` protection correctly rejected their former direct pushes,
  without weakening the new pull-request and required-check boundary.
- **Conceptual change:** Replaced each workflow's direct commit-and-push step
  with one shared maintenance-branch publisher. A changed catalog is committed
  only from an explicit file allowlist and pushed to a fresh branch named from
  the workflow run and attempt. The job prints a GitHub compare link; an
  authenticated maintainer or Codex session creates the pull request, and the
  normal protected-branch `verify` gate handles it. The workflows retain only
  `contents: write`: they cannot create or approve pull requests and never
  auto-merge. The repository-wide setting that would allow Actions workflows
  to create and approve pull requests remains disabled. Contributor guidance
  now documents this review handoff for refresh, discovery, and community
  imports.
- **Preservation contract:** Preserve the generated catalog formats, source
  inputs, workflow schedules and manual triggers, YouTube and PostHog secret
  boundaries, catalog refresh/discovery/import algorithms, deployed
  application, entry filenames, visuals, behavior, state, storage, analytics,
  localization, accessibility, and responsive results. Preserve `master`
  protection and its required `verify` check.
- **Risks:** A loose pathspec could commit unrelated or secret files; a reused
  branch could overwrite an in-review result; and broader Actions permission
  could bypass the intended human handoff. The publisher rejects absolute,
  wildcard, traversal, and non-explicit paths, checks the complete staged file
  list against the allowlist, creates a unique branch per run attempt, performs
  a normal non-force push, and has no GitHub CLI or pull-request token path.
  Unreviewed automation branches may remain until a maintainer opens and merges
  or deletes them.
- **Verification:** Ran only
  `node --test tests/contracts/maintenance-branch-publisher.test.mjs`: 3 tests
  passed, covering unsafe-path rejection and the no-change exit, allowlisted
  commit plus new-branch push and compare URL, and refusal to commit or push
  when an unrelated file is staged. No browser, local-server, visual,
  full-suite, build, diff-integrity, static-pass, or static-review check was run
  in accordance with `AGENTS.md`. Pull-request CI and a post-merge maintenance
  dispatch remain pending.
- **Rollback:** Revert this commit through a pull request and pause the three
  maintenance schedules while choosing a replacement compatible with protected
  `master`; restoring their former direct-push steps alone will remain blocked
  by branch protection. Delete any unmerged `automation/*` review branches
  separately after confirming they contain no catalog update that should be
  retained. No application, deployment, state, storage, analytics,
  localization, responsive, or visual rollback is required.
- **Association:** `codex/migration-08-protected-automation`; pull request and
  `v1.0.1` release pending.
