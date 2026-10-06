# Edenia → Tiny Swords transition audit

Audited and revised 5 October 2026 (Asia/Taipei), against working-tree source at HEAD `31db685a`, including existing uncommitted Godot changes. This document defines remaining transition work; it does not report implementation or deployment.

The transition should connect the existing Godot game to Edenia, replace the old presentation, and prepare a reproducible production-capable build. Going live is not part of this plan: no production deployment, public enablement or live-learner rollout. The implementation requirements are durable learner-profile saves, correct ten-level progression, a reproducible export, accurate product surfaces, and usable browser integration. Reuse existing game and profile machinery. Add architecture or tests only to close a concrete gap.

## Scope and ownership

The initial audit reviewed Godot, preview builders, parent/iframe adapters, progression/scoring, profile persistence, dashboard/trailer/walkthrough, translations, workflows, tests and asset provenance. Hosted deployment and physical devices were not inspected. Generated local exports may lag the source.

Follow [the Godot ownership rule](../../../godot/tiny-swords/README.md#game-ownership-and-edenia-integration): Godot owns gameplay, validation, rewards, rendering and in-game UI. Edenia owns study facts, active-profile persistence, page surfaces and releases. The bridge translates commands/data and coordinates browser input.

The [persistence audit](edenia-transition-persistence-audit.md) supplies detailed source evidence. Its broader proposed backlog is not an additional release checklist; the required scope and acceptance checks are defined here. Acceptance means implementation and local/CI validation, not permission to go live. Cloud work remains conditional on the separately paused Auth rollout.

## Defaults that keep the transition small

- **Retire the old timeline of town snapshots altogether.** Remove its controls, historical town rendering and supporting runtime paths. Do not replace it with island snapshots, replay or a historical game mode. Preserve Study History, study facts and their existing calculations.
- Reuse Godot's versioned `snapshot()`/`restore()` as the game payload. Version 23 already covers terrain, inventory, resources, animals, houses, construction and cutting/regrowth. Keep camera preferences device-local and movement queues, undo history and UI selection transient. Ordinary pawn position can retain its current spawn-on-load behavior.
- Retain the existing experience migration: legacy study facts remain preserved and unmarked for new XP. Do not add grandfathered rewards or convert old `townEconomy` coins into logs. Preserve old economy data without exposing it in the new game.
- Recommended progression policy: study corrections can lower current XP without dismantling an island or reclaiming spent rewards. Reset starts a new island; explicit import/restore replaces it with the chosen profile's saved island and claims. Settle this narrow policy before implementing progression integration.
- Use captured Godot images or recordings for the trailer. Update the existing short walkthrough. Add contextual game teaching only when usability problems justify it.
- Native/F6 and standalone browser saves remain development saves. Transfer an integrated preview save only if it actually needs carrying forward; preserve its source until the profile save succeeds. No universal preview migration framework is required.

## 1. Connect the existing island save to the learner profile

**Current gap:** the integrated preview writes `edenia_tiny_swords_xp_layout_v1` independently of Edenia's learner profile, from both Godot and the parent. Export, backup restore and reset therefore do not manage the island with the study state. [Parent](../../../scripts/tiny-swords-xp-parent.js), [adapter](../../../scripts/tiny-swords-xp-bridge.gd), [portable profile](../../../src/state/portable-learner-profile.js), [backups](../../../src/state/backups.js).

- [ ] Add the existing snapshot to the learner profile and portable schema. Reuse existing save, export/import, backup/restore and reset/Undo paths. An older profile with no game field starts a fresh island under the retained XP policy.
- [ ] Make Edenia the single durable writer and return save success/failure to the game. Reuse persistence results and recovery paths. Keep payload bounds at the transport boundary and gameplay validation in Godot. A second inventory model, reward ledger or recovery subsystem requires a demonstrated gap.
- [ ] Replace the running island on import, restore or reset. Discard old frame commands/saves, clear transient actions, and prevent the preview key from resurrecting an old island. Recreating the frame is acceptable if simpler than an in-place replacement protocol.
- [ ] Respect `layout.restore()` failure and leave the live layout unchanged on rejection. The adapter ignores the return value; Godot assigns chickens before later construction validation can fail. Preserve the rejected save and last durable state, and block automatic overwrite rather than inventing a repair flow. [Restore](../../../godot/tiny-swords/scripts/terrain_layout.gd).
- [ ] Prevent stale tabs from overwriting newer profile/game state. Reuse existing profile guards where available and choose one simple editing policy, such as one active editor. Concurrent island merging is outside this transition.

Check save frequency during integration: incidental checkpoints such as animal movement must not trigger unnecessary whole-profile backup or analytics work. Reuse save options and coalesce incidental updates if needed while keeping reward and player-edit persistence reliable. This is a focused integration concern, not a storage redesign.

## 2. Make ten-level progression work from startup

**Current gap:** the host starts with three thresholds (0/15/45), while Godot has ten (through 675 XP). The parent appends thresholds after frame startup; initial normalization can truncate a saved high-level claim before that handshake. Host claiming also ignores the save result. [Host model](../../../src/features/city/model.js), [Godot progression](../../../godot/tiny-swords/scripts/terrain_layout.gd), [claim flow](../../../src/app.js#L14652).

- [ ] Generate host progression data from Godot during the build so all thresholds exist before profile normalization. Replace late mutation of `CITY_LEVELS`; keep Godot as the source of gameplay rules.
- [ ] Send claimed progress from application state rather than observing the DOM level label. Publish claims only after the host save succeeds.
- [ ] Reuse Godot's sequential, idempotent unlocks. A durable host claim lets the game catch up after delayed startup or a failed game save; the saved game level prevents granting an applied reward again. Add acknowledgements needed for durable saves and accurate feedback, not a general transaction protocol.
- [ ] Apply the settled reduced-XP policy consistently. Remove the preview rule that lets an unrelated sandbox level override the active profile.
- [ ] Use one celebration for the successful unlock. Remove duplicate host confetti/toast where Godot presents the reward. Failed saves must not produce misleading success feedback.

Existing [Godot progression tests](../../../godot/tiny-swords/tests/progression.gd) cover progression through ten, reward idempotence, save round trips and XP boundaries. Preserve those cheap checks and add host coverage for startup/claim gaps. Do not repeat every transition in browser tests.

## 3. Prepare a reproducible production-capable build

**Current gap:** the normal build does not export Godot. The integration builder patches disposable `_site`, defaults to a local macOS executable, and mounts only on localhost port 8037. Pages uses the normal build. [Integration builder](../../../scripts/build-experience-tiny-swords.mjs), [normal build](../../../scripts/build-site.mjs), [Pages](../../../.github/workflows/deploy-pages.yml).

- [ ] Prepare production build integration with a pinned Godot/template version in CI, correct hosted base paths, and source-owned mounting/styles. Reuse the exporter and workflows where practical.
- [ ] Give the parent, iframe and engine files a compatible release path/version. One versioned game directory is sufficient if it prevents mixed cached releases.
- [ ] Run existing relevant Godot checks and focused integrated browser checks against that export in CI. Required integration checks must fail when the expected frame is absent rather than silently skip.
- [ ] Prepare one reversible game-disable control preserving study and island data, and verify it locally. Reuse existing controls where possible; no rollout platform is needed. Disabling the game must not restore the retired town timeline. Do not deploy or enable the game publicly.
- [ ] Retain asset provenance and ship applicable engine/third-party notices. Review the exact imported pack's terms and avoid shipping unused raw asset directories merely because the builder copies all `assets/`. [Provenance](../../../assets/tiny-swords/README.md), [publisher terms](https://pixelfrog-assets.itch.io/tiny-swords), [Godot notices](https://godotengine.org/license/).

## 4. Replace the old product surfaces

**Current gaps:** preview CSS hides old dashboard children while their rendering still runs; trailer scene 2 uses old stages 1/4/8/12; walkthrough and level copy describe the old town. Chinese scoring help and next-level effort calculations disagree with the current one-XP-per-new-Anki-review rule. [Dashboard](../../../src/app.js#L14437), [trailer](../../../index.html#L376), [walkthrough](../../../src/features/walkthrough/steps.js), [XP code](../../../src/domain/experience.js).

- [ ] Mount the game in an intentional container with loading/failure feedback. Keep the XP bar location unless the layout requires a change; show accurate level, next unlock and final-level status outside the canvas.
- [ ] Remove the town snapshot timeline, historical-town controls/rendering and obsolete image preloads/handlers as part of the replacement. Update affected tests to assert removal. Preserve shared helpers used by Study History and retain historical docs/learner data separately from active runtime code.
- [ ] Replace trailer art/stage assumptions with captured Godot scenes explaining study → XP → unlock → building. Preserve navigation, Skip and replay; avoid downloading an extra game instance for the trailer.
- [ ] Update existing walkthrough targets/copy and first-study guidance. Explain entry/exit from building. Keep general onboarding completion; no canvas spotlight protocol is required. Prevent walkthrough/modal input from reaching the game accidentally.
- [ ] Correct scoring help and effort estimates, replace obsolete level descriptions, and localize visible game UI in Godot with Edenia passing the locale. Fix copied accessibility names and check font coverage. Review changed strings in all five catalogs without an unrelated copy rewrite.
- [ ] Update current experience/build documentation and adjust existing analytics whose level semantics change. New analytics events and canvas session-replay research are optional.

## 5. Verify usable browser integration

The initial audit measured about 39.5 MB of WASM before compression, plus the game pack and loader. That historical size warrants inspecting the production-capable export locally; it is not a performance failure or a requirement for a benchmarking project.

- [ ] Check compressed transfer, time to a usable island, and interaction on representative iPhone/Safari and Android/Chrome devices plus desktop. Use a developed island and confirm study feed/video remain usable. Investigate further only if the experience is poor.
- [ ] Keep study usable during slow or failed startup. Preserve the saved island; never initialize and save a blank replacement over existing work after a load failure.
- [ ] Check page scrolling, pan/placement, camera controls, reachable inventory, keyboard entry/exit, visible focus, Escape and modal input on desktop and a narrow phone layout. Keep readable progress outside the canvas. Verify accessibility behavior rather than assuming Godot labels reach browser assistive technology.
- [ ] Respect reduced-motion preferences for prominent nonessential effects and prevent disruptive activity while covered/hidden. Reuse current timing rules; redesign clocks, themes or gestures only for a concrete problem.

Do not require every browser × device × locale × level combination. Check integration once per relevant environment and inspect locale layout where text changes create risk. Device checks remain pending until performed; desktop emulation is not physical-device evidence.

## Focused acceptance and stopping rule

Use existing tests first. Add a test only for a new integration boundary or a reproduced failure that existing coverage cannot catch. Keep game rules in Godot tests and profile/progression logic in host contracts; reserve browser tests for the real host/frame connection.

| Check | Failure it must catch | Smallest useful evidence |
| --- | --- | --- |
| Profile round trip | Lost island/inventory/work in progress during reload, export/import or backup restore | One populated island through existing profile operations; reuse Godot snapshot/construction tests for detailed rules |
| Reset and replacement | Old island or delayed save resurrects after reset/import | Reset → reload → existing Undo path, plus one stale-frame/tab case using the chosen editing policy |
| Failed save / rejected restore | Unsaved success or damaged data overwritten by a blank game | Focused host/adapter failure checks and a Godot check that rejected restore leaves the layout unchanged |
| Claim and high-level startup | Claims above level three truncated; rewards lost/duplicated across reload | Host contracts, one integrated claim/reload flow, one high-level startup and delayed-frame catch-up |
| Production export | Local-only mounting, absent frame or mixed cached files | Clean CI export and local smoke under the intended hosting base path; local disable/re-enable with an existing island |
| Interaction and presentation | Blocked study, accidental input, unusable phone controls or stale claims | Focused desktop/phone smoke, changed trailer/walkthrough replay and changed locale strings |

Run relevant checks against the final changed implementation. When they pass, do not broaden or repeat them without a new change, failure or unresolved concern. Known data-loss, progression, build or basic usability failures block implementation acceptance. Passing these checks does not authorize deployment or going live. Optional polish and hypothetical edge cases do not.

## Follow-up only when justified

- Contextual tutorials, a separately versioned returning-learner introduction, theme matching, new diagnostics or canvas session-replay support.
- Battery/CPU profiling, broad memory benchmarks, deliberate WebGL context-loss recovery, offline startup, extensive private-browsing coverage and device-clock manipulation. Promote a specific item only for a supported usage requirement or observed problem.
- Account-backed snapshots, cloud conflicts, server compatibility, identity transitions and protected-version workflows when Auth resumes. Preserve portable data through existing enabled paths; this transition does not revive Auth.
- External marketing inventory and removal of remaining inactive pixel-town tooling/assets once the local fallback no longer needs them. Timeline removal and obsolete active dashboard behavior are already in transition scope.

## Execution order

1. Settle the narrow reduced-XP policy; integrate the existing snapshot and ten-level progression data into the host.
2. Prepare the production-capable export and run an early local/device smoke to catch mounting or load problems. Simulate the intended hosted base path locally.
3. Complete study → claim → reward → build → save and profile replacement/failure handling.
4. Retire the town snapshot timeline and replace dashboard, trailer, walkthrough and changed localized copy.
5. Run focused local/CI acceptance and update required documentation/notices. Leave deployment, public enablement and any go-live plan for a separate request.

## GitHub implementation issues

Created 5 October 2026 from this narrowed audit. These six tickets cover implementation and local/CI/device-preview validation only. Going live, production deployment and public enablement remain outside the plan. Optional follow-up work was not turned into issues.

- [#375 — Tiny Swords: persist the island with the active learner profile](https://github.com/BriceChivu/Edenia/issues/375) (`ready-for-agent`)
- [#376 — Tiny Swords: load all ten levels at startup and persist claims reliably](https://github.com/BriceChivu/Edenia/issues/376) (`needs-triage`)
- [#377 — Tiny Swords: prepare a reproducible export and production build integration](https://github.com/BriceChivu/Edenia/issues/377) (`ready-for-agent`)
- [#378 — Tiny Swords: replace the town dashboard and retire its snapshot timeline](https://github.com/BriceChivu/Edenia/issues/378) (`ready-for-agent`)
- [#379 — Tiny Swords: update the trailer, walkthrough and localized experience copy](https://github.com/BriceChivu/Edenia/issues/379) (`ready-for-agent`)
- [#380 — Tiny Swords: validate the integrated preview on desktop and phones](https://github.com/BriceChivu/Edenia/issues/380) (`ready-for-human`)

The progression ticket needs triage for the reduced-XP policy. The preview/device acceptance ticket requires human device evidence; the other tickets are ready for an agent. Their focused checks should supply the final acceptance evidence rather than become a duplicated test program.

## Evidence already collected

The initial audit reported 20 passing contracts across `experience`, `city-model`, `tiny-swords-local-persistence`, `tiny-swords-export-isolation` and `walkthrough-steps`; a normalization example that truncated index 6/pending 7 to index 2/pending null; historical export sizes; and first-party license-page checks. Those results describe the audited preview and old assumptions, not production acceptance.

This revision checked supporting source and existing coverage while narrowing the plan. It changed only this document; no product code, tests, learner data, rollout flags or issues were changed, and no new tests, build, deployment or device runs were performed. Previous pixel-town issues [#348](https://github.com/BriceChivu/Edenia/issues/348), [#349](https://github.com/BriceChivu/Edenia/issues/349) and [#350](https://github.com/BriceChivu/Edenia/issues/350) are historical context, not additional Godot release gates.
