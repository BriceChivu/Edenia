# Tiny Swords transition: persistence and learner-profile audit

Audit date: 2026-10-05. Read-only source audit of the current checkout, including uncommitted Godot work. This sub-audit changed only this document. No live deployment, learner data, cloud configuration, or external systems were inspected or changed.

## Conclusion

Tiny Swords currently has working **local preview persistence**, not a production learner-profile persistence integration. Finishing the levels and artwork does not close that gap. Before shipping the replacement, make the island a versioned part of its active learner profile, connect every profile lifecycle action to the running Godot instance, and decide how old town progress becomes Godot entitlement. Keep gameplay validation, reward grants, migrations, mechanics, and UI in Godot; Edenia should own durable storage, active-profile authority, and portable-profile transport.

The ownership boundary is explicit in [the Godot README](../../../godot/tiny-swords/README.md#game-ownership-and-edenia-integration), lines 319–335. ADR-0001 also forbids automatic recovery across a Start-over generation and requires preservation of displaced records; a game save must follow the same boundary.

## Current storage map

| Data | Current owner / location | Included in Edenia portable learner profile? |
| --- | --- | --- |
| Study facts, claimed host level, preferences | Edenia `STORAGE_KEY`; public, sandbox, and internal keys derived separately | Yes, through the existing explicit portable schema |
| Integrated Godot island | `edenia_tiny_swords_xp_layout_v1`, shared by the parent and same-origin iframe | No |
| Standalone web Godot island | `edenia_tiny_swords_builder_preview_v1` | No |
| Native Godot island | `user://builder_preview.json` | No |
| Godot camera | `edenia_tiny_swords_camera_v1` or native `user://camera_view.json` | No; keeping camera device-local may be desirable, but scope must be intentional |
| Old internal pixel-town economy | Main state `townEconomy` | Yes; this is a different versioned ledger from Godot wood/inventory |

Evidence: `src/core/storage-keys.js:1–43`; `scripts/tiny-swords-xp-parent.js:10–22,42–46`; `scripts/tiny-swords-xp-bridge.gd:57–62`; `godot/tiny-swords/scripts/level_two_preview.gd:17–24,362–392,1115–1134`; `src/state/portable-learner-profile.js:489–505`; `src/state/town-economy.js:3–31`.

The parent is deliberately gated to localhost port 8037 (`scripts/tiny-swords-xp-parent.js:1–2`), and the disposable builder states normal/production builds never invoke it (`scripts/build-experience-tiny-swords.mjs:1–2`). These gaps describe release work, not a claim that public Godot users are currently losing state.

## Release-blocking work

### P0 — Put the island in the learner-profile contract

The game calls `layout.snapshot()` and writes a standalone browser key. Edenia's automatic backups read only its main `storageKey`, and sync export builds an explicit portable learner profile containing activity, Anki, city progress, config, learner details, onboarding, and videos. There is no Tiny Swords field. As a result, moving an Edenia profile to a new browser can restore earned study XP but cannot restore the actual island, placements, wood, house construction, or animals. Backup restore also cannot roll the island back with the study profile.

Evidence: `scripts/tiny-swords-xp-bridge.gd:57–62`; `src/state/backups.js:78–85,124–141`; `src/state/portable-learner-profile.js:489–505`; `src/app.js:7105–7149,7690–7754`. The older legacy transfer sanitizer clones main state (`src/state/portable-state.js:95–103`), but a separate Godot storage key still never enters that state. The broad imported-state reader likewise does not discover adjacent browser keys (`src/state/imported-state.js:12–44`).

Required work:

- Define a versioned portable game-state field and its absent-field semantics for existing profiles.
- Include it in local storage, backups, exports/imports, recovery candidates, profile comparison, and cloud snapshots where those features are enabled.
- Preserve raw unsupported/corrupt game saves as recovery material; do not silently replace them with a blank valid island.
- Decide profile-combination rules. Unioning two islands can duplicate placements, rewards, inventory, wood, or reserved building costs. A whole-island choice with a protected alternative may be safer than attempting structural merges; study facts can still combine under their own rules.
- Revisit payload budgets: portable cloud envelopes cap at 2 MiB, recovery export at 8 MiB (`src/state/portable-learner-profile.js:28–32`). Measure a maximally built island plus a large video library before selecting limits.

### P0 — Make profile reset/import/recovery replace the running island safely

The bridge restores only once (`study_layout_restored`) and then accepts later host level messages without replacing the world. Edenia reset replaces its main state and reloads; backup restore and import replace state and rerender. None has a Godot reset/restore/profile-generation command. The parent's saved-level maximum intentionally keeps an old high-level island even after the host claims are lower.

Evidence: `scripts/tiny-swords-xp-bridge.gd:37–50`; `scripts/tiny-swords-xp-parent.js:18–22,84–85`; `src/app.js:5582–5599,7295–7362,7690–7754,8173–8224`. A reset on the preview origin leaves the Godot key in place; on reload the old saved level can be reintroduced. Import/backup restore in a live frame cannot replace its already-restored layout. This sandbox-preservation policy must not become production Start-over behavior.

Required work:

- Add an Edenia lifecycle command carrying active-profile identity, generation, activation token, and a game revision. Godot must acknowledge that it accepted the correct state before editing starts.
- Pause/fence gameplay saves during import, restore, reset, profile opening, owner replacement, sign-out, and conflict choice; invalidate queued messages from the prior frame/profile.
- Replace the world explicitly when a different profile/version becomes active, including its timers and transient actions.
- Include the island in pre-reset rollback and Start-over undo. Never load an earlier island automatically across the reset generation.
- Scope sandbox/internal/public saves independently. Their existing learner-state storage keys already differ, but the Tiny Swords map/camera keys do not (`src/core/storage-keys.js:3–8` versus the storage map above).

### P0 — Resolve study level, claimed level, and game rewards as one contract

Godot reports ten thresholds. The host initially has only three levels, normalizes claimed/pending level against those three, and receives later thresholds only after the game reports them. The host also lowers claimed level when recalculated study XP is lower, while the preview explicitly keeps the higher saved game level. These are different progression policies.

Evidence: `src/features/city/model.js:3–8,61–83`; `src/app.js:1908–1959,14546–14569`; `scripts/tiny-swords-xp-parent.js:14–35`; `scripts/tiny-swords-xp-bridge.gd:36–50`; `godot/tiny-swords/scripts/terrain_layout.gd:87–93`.

Early `loadState()` calls normalize a saved host index above 2 before the asynchronous capability message appends the remaining thresholds. Persistence of that truncation depends on the subsequent cleanup/render/save path, but the returned state is already truncated. The saved island currently masks some visible loss by overriding the host claim; it does not preserve portable host claims.

Required work:

- Establish a versioned Godot-owned progression manifest before host normalization or claiming; do not hard-code a second partial level list in Edenia.
- Choose whether earned rewards are permanent after study corrections, and how intentional profile reset differs from correction.
- Specify legacy migration. `initializeExperience` currently resets old progress to level one if it lacks `experienceVersion: 1` (`src/domain/experience.js:1–5`); old unmarked study facts do not automatically become the new XP ledger.
- Reconcile host claim and reward receipt idempotently so a reload between the two does not duplicate rewards or lose a claim. Godot's `unlock` is already sequential and retry-safe, and clears undo before saving a grant (`godot/tiny-swords/scripts/level_two_preview.gd:143–160`). Preserve those protections.
- Test all supported levels through reload, export/import, progression manifest changes, and lower study totals, not only levels two and three.

### P0 — Make save failure and invalid restore recoverable

Both iframe and parent write directly to localStorage without error handling, acknowledgment, revision checking, or readback. The game mutates first and cannot know if Edenia durably accepted the state. A full or unavailable storage area can leave a playable world whose work is not saved.

Evidence: `scripts/tiny-swords-xp-bridge.gd:57–62`; `scripts/tiny-swords-xp-parent.js:42–46`. Existing main-state save/import code returns persistence success and uses backups/fences (`src/state/store.js:14–75`); the Godot key bypasses that route.

Host level claiming has a related existing failure path: `claimCityLevelUp()` ignores the return from `saveState(s)` and renders the new level, confetti, and success toast regardless (`src/app.js:14652–14676`). Check persistence before publishing the successful claim to Godot or presenting success. Otherwise the game and host durable state can disagree after reload.

The parent checks only `level` on incoming layouts and uses that level before Godot validation. The bridge sets `study_layout_restored = true` before calling `layout.restore`, ignores its boolean result, and proceeds with grants/saving. Malformed JSON or a structurally rejected/future-version save can consequently fall back to a fresh world without a recovery decision; later edits/grants can overwrite the original key. This is particularly dangerous when a malformed snapshot still has a valid high level.

Evidence: `scripts/tiny-swords-xp-parent.js:16–22,42–46`; `scripts/tiny-swords-xp-bridge.gd:37–50`; `godot/tiny-swords/scripts/terrain_layout.gd:877–887`.

Required work:

- Make Edenia the single durable save authority; carry request/revision IDs and explicit save success/failure acknowledgments.
- Preserve the last durable valid state and raw rejected candidate before any repair.
- Handle unsupported future versions distinctly from malformed saves; allow export/recovery and block destructive overwrite.
- Make Godot restore transactional. One current source defect assigns `chickens = next_chickens` at `terrain_layout.gd:1190` before validating `house_build` at lines 1191–1203; a later rejection can mutate a live layout. Move all state assignments after complete validation.
- Verify storage exhaustion, blocked storage, interrupted writes, corrupted snapshots, and old/new schema combinations.

## Other required work and product decisions

### P1 — Cross-tab editing and profile fencing

Two frames/tabs can restore the same island, edit independently, and overwrite the same key. There is no island revision, compare-before-save, storage listener, active-editor lease, or conflict outcome. The parent listens only to messages and mutations of the visible level label. Direct iframe writes can bypass any future parent-only fence.

Evidence: entire `scripts/tiny-swords-xp-parent.js:9–47,83–85`; `scripts/tiny-swords-xp-bridge.gd:57–62`. Existing learner-profile local adapter subscribes to its own access record and checks activation fences (`src/state/learner-profile-local-adapter.js:691–714,779–789`); Tiny Swords does not participate.

Choose one active editor or an explicit version-conflict strategy. Include profile/generation/frame tokens in every save and restore. Test tab A reset/import while tab B is harvesting, and delayed saves from an old frame after a replacement. Do not describe ordinary browser profile separation as in-app multi-profile support: current game scope is simply origin-wide, whereas signed-in identity changes use the existing lifecycle machinery when enabled.

### P1 — Decide permanent versus transient game state

The version-23 snapshot already contains terrain, inventory, level, trees/variants, decorations, houses/facings/offsets, sheep/chicken positions, reserved house bundle, construction clock, carried wood, log piles, resource totals, stumps/regrowth deadlines, and partial cut time. It omits ordinary pawn position, movement destination, harvest queue, undo history, and active UI selection. Ordinary load explicitly places the pawn at a spawn cell; construction separately stores its work position.

Evidence: `godot/tiny-swords/scripts/terrain_layout.gd:833–875`; `godot/tiny-swords/scripts/level_two_preview.gd:109–120`; `scripts/tiny-swords-xp-bridge.gd:43–47`; `godot/tiny-swords/scripts/house_construction.gd:145–147,202–215`.

The harvest queue is intentionally session-only per README lines 79–81. Decide whether pawn location is expected to survive refresh, whether camera follows each profile or device, whether undo ends at refresh, and how much in-progress cutting loss is acceptable: current harvesting checkpoints partial progress every five seconds (`tree_harvesting.gd:150–159`). These are contracts to settle, not automatically bugs. Reserved house placement should resume visibly when loading the integrated save; native `_ready` opens placement for a bundle before the asynchronous bridge restore, while construction's click handler can reopen it later (`level_two_preview.gd:117–120`; `house_construction.gd:48–56`). Verify the delayed-restore route explicitly.

### P1 — Offline time, device clocks, and recovery timers

Regrowth and house work use client wall-clock timestamps, and suspended gameplay catches up on return. Cross-device profile transfer, clock adjustment, and restoring an old backup can change elapsed time or produce surprising instant completion. Decide the desired offline behavior and allowable bounds; keep the rules in Godot.

Evidence: `tree_harvesting.gd:109–121,150–180`; `house_construction.gd:125,145–147,202–215`; snapshot timer fields at `terrain_layout.gd:860–872`. Test sleep/wake, long closure, clock forward/backward, restored construction reservations, and transfer between devices with clock skew.

### P1 — Preserve old economy and origin migrations intentionally

The previous internal town's portable `townEconomy` tracks video-earned coins and purchased flowers. Godot has independently earned wood, reserved house costs, and placement inventory. Decide whether to archive/preserve, convert, or expose old purchases; avoid silently dropping portable learner-owned records when replacing the scene. The existing flower transaction already couples debit and ownership receipt to one profile save (`src/state/town-economy.js:96–112`). Godot construction needs comparable durable coordination, though its gameplay rules remain Godot-owned.

Existing legacy-origin recovery transports main state, not the game key. Existing preview maps belong to localhost:8037 and will not appear automatically at the production origin. Decide whether preview layouts stay disposable or get a one-time explicitly scoped migration/export. Preserve old keys until migration is validated. Validate imports from profiles with no Godot field, old 12-image town progress, old economy records, and every still-supported Godot save version.

### P2 / conditional — Dormant signed-in and cloud routes

Do not reopen Auth as part of this transition. The internal pause protects retained ownership/profile data (`src/features/profile-access/experiment-pause.js:4–28,31–48`); learner lifecycle is additionally gated by account-feature rollout (`src/app.js:599–627`). Built-site defaults disable learner lifecycle and IndexedDB backups (`scripts/build-site.mjs:244–247`). These are source defaults, not proof of current hosted flags.

If signed-in profiles are enabled later, add the island to cloud schema validation, integrity/digest construction, recovery/history capacity, profile opening, conflict comparison/choice, accountless-profile migration, export replacement, Start-over undo, and owner-isolated recovery. Honor ADR-0001's same-generation automatic fallback. Existing cloud snapshots alone will not solve game persistence until the portable schema includes the island. The inspected checkout has IndexedDB backup infrastructure; primary-profile IndexedDB persistence is not demonstrated by these sources and must not be assumed active.

## What is already implemented

- Native and integrated preview share the Godot world and mechanics; integrated build copies canonical source and adds a thin adapter (`scripts/build-experience-tiny-swords.mjs:14–23`).
- Integrated game disables standalone save loading, preserving separate native/standalone preview maps (`scripts/tiny-swords-xp-bridge.gd:8–11`).
- Parent waits for the progression manifest before restoration and checks message source/origin (`scripts/tiny-swords-xp-parent.js:11–13,24–27`). Generated frame receiver checks source/origin too (`scripts/build-experience-tiny-swords.mjs:26`).
- Synchronous iframe save covers refresh before the parent processes its posted save message (`scripts/tiny-swords-xp-bridge.gd:59–62`). This local-refresh protection should be preserved while introducing durable host acknowledgment.
- Godot performs extensive structural, inventory-conservation, placement, and version migration checks (`terrain_layout.gd:877–1245`) and supports save versions 1–23. Sequential grants and undo isolation already exist.
- Camera restores finite values and clamps zoom (`level_two_preview.gd:383–392`).

## Verification performed and outstanding

Ran `node --test tests/contracts/tiny-swords-local-persistence.test.mjs tests/contracts/tiny-swords-export-isolation.test.mjs`: 3 tests passed. These verify local sandbox level retention, build isolation, and delegation to canonical Godot source. They do not establish production profile portability or corruption handling.

Existing browser test `tests/e2e/experience-tiny-swords.spec.mjs:105–143` exercises rewards, terrain edit, and reload at levels 2–3; it requires the explicit integration build and skips otherwise (`:6–8`). Current source progression tests cover several migrations and extended levels (`godot/tiny-swords/tests/progression.gd:14–63,118–126`). None of this substitutes for an end-to-end matrix covering profile import/export/reset/recovery, ten-level reload, storage errors, two tabs, large payloads, and owner changes. No browser/native/cloud runtime matrix was run for this audit.

The checkout was dirty before the audit: `terrain_layout.gd`, `level_two_preview.gd`, README, visuals, animal/pawn rules, and multiple tests had uncommitted changes; `house_construction.gd` was untracked. Findings refer to those working files, including snapshot version 23. No claim is made that this state is committed, deployed, or already reflected in an older generated export. Rebuild and test the final canonical project when implementing the transition.
