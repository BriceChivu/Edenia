# Accountless public island rollout

Implementation: #397. Approved announcement: #396. This document prepares the release; it does not authorize live enablement. Source baseline inspected on 8 October 2026: `origin/master` and live `https://edenia.study/release.json` both identified `6ec4d2152da96b71ed2c2a4a6a1ee7c7aec93da0`.

## Behavior and preservation

`EDENIA_TINY_SWORDS_PUBLIC_ENABLED=true` selects the island page for ordinary visits. It is false by default, including Pages until the owner explicitly enables it. The parser entry preserves the original query/fragment. Sandbox retains its existing page. `internal_test=2` retains its own profile/config/cache/backup namespace; no tester state is copied automatically.

The ordinary island page opens the existing production profile (`edenia_v1`, including the current IndexedDB repository) and existing device settings. It preserves study facts and Study History, town currency/purchases, and old level claims. Before island XP initialization replaces `cityProgress`, its exact town record is retained as `legacyCityProgress`, including old indexes beyond the island's ten-level range and any pending claim. The archive survives reload, portable export/import, backups and explicit restore. It does not grant island XP, logs or inventory. Old unmarked video/Anki facts stay unmarked; prior explicitly marked island XP provenance and deliberately imported tester XP remain valid. New watched minutes and new Anki reviews use the current island rules. New Anki cumulative observations establish a baseline. Claimed island levels remain claimed if study Undo reduces XP; explicit reset/import/restore retain their existing replacement semantics.

The old town snapshot timeline is absent on the island page. Legacy `nightVisuals` are left in the stored state rather than deleted during opening; the timeline is not revived. Study remains usable while the game loads, fails, or is disabled.

The #396 announcement uses the source poster and existing modal backdrop, onboarding button, focus/input boundary and five locale catalogs. Assumption: show once for a returning profile with completed setup and walkthrough, record dismissal in `onboarding.islandAnnouncementSeenAt`, and mark new island onboarding as already introduced. Do not interrupt incomplete onboarding, recovery, another modal or a walkthrough. If the announcement is shown, defer the existing level-up hint for that visit, including after a quick Continue; dismissal adds no tutorial step. A conflicting startup surface defers the announcement until a later normal visit. Continue dismisses and returns focus; failed persistence still allows dismissal but can cause another display after reload.

Account features remain hardcoded `off` and learner-profile lifecycle activation remains `false` in Pages. This release introduces no sign-in requirement, cloud activation, backend change or cutover.

## Minimal owner release procedure

1. Review and merge the implementation PR after its required CI passes. The existing Pages workflow deploys every merge to `master`; with the new public variable absent/false, this preparatory deployment keeps the ordinary town page selected. Do not change release variables as part of the implementation merge.
2. When the owner separately requests the public release, set repository variable `EDENIA_TINY_SWORDS_PUBLIC_ENABLED=true`. Keep `EDENIA_TINY_SWORDS_ENABLED=true` (already true at the inspected baseline), the current IndexedDB profile/backups settings, and all other release variables unchanged. Keep account rollout paused. Dispatch `Deploy GitHub Pages` on current `master` and wait for its deployment to complete. There is one public release, with no cohorts.
3. Verify `https://edenia.study/release.json`: `deployedCommit` equals the released `master` commit and `assetVersion` ends in `-p1-g1`. Open the ordinary URL with a disposable accountless profile: the island dashboard must be selected, study usable, and sign-in absent. Check a synthetic returning profile's announcement and retained history. The already validated content-hashed game directory, engine and decoder URLs continue to work at the hosted base path.
4. The owner checks physical iPhone/Safari and Android/Chrome progressively after release. Emulation coverage is useful evidence, not physical-device acceptance and not a new release gate.

The public/game flags are part of asset identity so flag-only deployments at one commit refresh the parser entry, app/config and stylesheet URLs. The unchanged engine retains its content-hashed cache URL. Current open tabs remain on their loaded release until reloaded. Reload older town tabs when opening the new public release: the older town IndexedDB reader cannot open the new split island/profile head. Its revision fence prevents a stale writer replacing the newer head, but that older tab cannot continue saving against it. No new forced-refresh/migration mechanism is added.

## Bounded mitigation and compatibility limit

If the game is slow or unavailable, set `EDENIA_TINY_SWORDS_ENABLED=false`, **leave `EDENIA_TINY_SWORDS_PUBLIC_ENABLED=true`**, and dispatch Pages on current `master`. Confirm asset version `-p1-g0`, no mounted game frame, usable study, and retained island/claims/backups. Re-enable the engine and redeploy when fixed. This is the supported game-disable path; it does not select the town page or clear learner state.

Do not assume that resetting the public switch or reverting the whole site is data-safe. For profiles its repository can still open, the current compatibility town bundle's `normalizeLoadedState` calls `recoverProductionCityProgress` for `experienceVersion: 1`, recalculating the shared claims using town thresholds and removing the island marker. Older portable canonicalizers also do not recognize the new archive/announcement fields and can reject those new portable envelopes. Preserve source/newer profiles and use the game-disable path; a whole-site rollback needs a separate compatibility review. No speculative recovery subsystem is introduced here.

## Focused validation

The implementation adds `tests/contracts/public-island.test.mjs` and `tests/e2e/public-island.spec.mjs` to existing checks. The browser suite uses synthetic production/tester profiles with both localStorage and IndexedDB, verifies no legacy conversion, retained history/claims/settings/currency/backups, new XP and claims, announcement localization/focus/responsive layout/fresh onboarding, deliberate tester export/file import, and actual public Godot restoration after failure and disable/re-enable. CI runs this after an explicit public build, in addition to the existing tester/game suites.

Local public reproduction:

```sh
EDENIA_TINY_SWORDS_PUBLIC_ENABLED=true node scripts/build-experience-tiny-swords.mjs --project godot/tiny-swords
EDENIA_TEST_PUBLIC_ISLAND=true EDENIA_TEST_NORMAL_PORT=4174 EDENIA_TEST_BASE_PATH=/Edenia/ npx playwright test public-island.spec.mjs --project=desktop-standard --project=phone-standard
```

The approved prototype files remain outside the checkout, untouched. Its dotted preview backdrop, embedded assets, preview-again button and host/design controls are not product features.
