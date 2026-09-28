# Object module extraction — local verification

Date: 2026-09-28. Reference source: `dac7673b79bff2c536bb4d65e2680e209b24ed5e`.
Runtime: Node 24.18.0, `@napi-rs/canvas` 1.0.9, macOS arm64.

The 21 drawable types now live in `src/experiments/pixel-town/objects/`.
`artwork.js` preserves the composition/workshop interface, and `shared/drawing.js`
owns rasterization, palette/motion context and projection. Scene anchors for the
dock, boat, mailbox, bridge and birds are explicit in `scenes.js`; legacy preview
defaults remain compatible. Asset source pointers and recursive build hashing
follow the extracted files. No runtime scheduling, experiment gate, reward or
learner-state code changed.

Verification:

- Every frame in the existing six-second animation loop: **1,872 pixel-identical
  before/after comparisons** (13 stages × 4 lights × 36 frames). Compared raw RGBA
  against a copy of the reference renderer and its original scene definitions.
- Committed regression fixture: **560 renders**, covering four sample times for
  all stages/lights, all 21 isolated catalog objects at two scales/times and four
  lights, and a mixed named/default tree scene. The fixture is under
  `tests/fixtures/pixel-town/pre-extraction.json`; the contract test uses the same
  composition/artwork interface as callers.
- Enabled build: passed; pixel asset version `160a8e2c27d27398`. Nested-source-only
  formatting changes changed the preceding version `1c9aa8eb78e84760`, confirming
  that nested sources participate in cache invalidation.
- Existing art verifier: **208 pixel-identical patch replays** across 52
  stage/light combinations. Generated review images were written to temporary
  local output, preserving the previous acceptance evidence.
- Contract suite: **1,716 passed**, including the new rendering/catalog checks.
- Disabled build: passed; **2 browser isolation checks passed**, confirming zero
  pixel-town requests on public and internal URLs with the switch off.
- Enabled Chromium browser checks: **18 passed**, desktop-standard and phone-small.
  Covers public-route isolation after an internal visit, study-state preservation,
  automatic motion, reduced-motion/offscreen handling, fallback stills, disposal,
  50 mount cycles, and critical-performance fallback.

These are local rendering/build/browser checks. Phone-small is browser viewport
emulation, not physical-device acceptance. No hosted rollout or deployment was
performed; existing device and production acceptance gates remain separate.
