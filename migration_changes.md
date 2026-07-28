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
