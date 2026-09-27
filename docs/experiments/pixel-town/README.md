# Internal pixel-town implementation

Experiment: pixel-art-town  
Gate: `EDENIA_PIXEL_TOWN_ENABLED=true` at build time **and** `?internal_test=1` at runtime  
Public path: unchanged (subject to the linked CI and browser evidence)

This implements [Build the complete internal pixel-town experience](https://github.com/BriceChivu/Edenia/issues/349) using the owner-approved isometric artwork at `238297c`. The default build switch is **off**. An enabled build is available for local review; changing the hosted release switch and owner acceptance belong to [Deploy and accept the internal pixel-town trial](https://github.com/BriceChivu/Edenia/issues/350).

## Run

Use the Node version in `.nvmrc`, then `npm ci`.

```sh
EDENIA_PIXEL_TOWN_ENABLED=true npm run build
node scripts/serve-static.mjs --host localhost --port 4188 --root .
```

- Learner trial: `http://localhost:4188/_site/?internal_test=1`
- Public comparison: `http://localhost:4188/_site/`
- Local workshop: `http://localhost:4188/tools/pixel-town/`

The workshop and source geometry are excluded from the Pages build. The learner entry contains only lifecycle, light selection, manifest validation and cached patch playback. There is no Auth dependency, profile migration, provider call, game engine or experiment service worker.

## Authoring

| Change | Source |
| --- | --- |
| Roof tiles, tree shape, landmark geometry | `src/experiments/pixel-town/artwork.js` — named functions |
| Shared tree blossom color, roof rows | `src/experiments/pixel-town/parameters.js` — `DESIGN` |
| Breeze or smoke | `parameters.js` — `EFFECTS`; deterministic motion functions in `effects.js` |
| Local clock buckets, materials | `lighting.js` |
| Stage composition, placement, ordering | `scenes.js` |
| Scheduling, cancellation, disposal | `entry.js`, `player.js` |
| Build-time stills and patch atlas | `scripts/build-pixel-town.mjs` |

**Change a roof:** edit the `house` geometry or `DESIGN.roof.rows`; inspect stages 1, 2, 9, 10 and 12 at all lights. Both orange and purple houses share the roof definition.

**Tune smoke:** select House or Volcano in the workshop, adjust smoke height, inspect motion, download a draft and run the displayed save command. Smoke is a shared effect: the change applies to both chimney and volcano emitters. It does not change foliage or scene placements.

**Change a tree:** select Flowering tree. Adjust blossoms or breeze. Compare isolated before/after and stages 2 and 12. Reset discards the draft. Download writes only a draft file; `node tools/pixel-town/save-draft.mjs <draft.json>` validates it and writes the version-controlled parameters module. Review `git diff`, rebuild, compare captures, then commit. No browser storage is used for artwork drafts. The save command accepts only exposed bounded parameters, never arbitrary code.

**Create a named tree variant:** choose the variant scope and a stable ID. Saving adds `VARIANTS[id]` without changing existing artwork. Replace only intended scene entries' `asset: 'tree'` with `asset: 'tree:<id>'`. This explicit source reference determines scope. Shared tree edits affect all default trees; variant references use their own blossom/breeze parameters.

**Add a landmark:** add a named geometry function to `artwork`, expose it in that factory's return value, add catalog metadata and reference the ID from scene items. Keep effect parameters separate. No player change is needed.

**Add a visual stage:** add a scene object containing groups (`id`, `at`, `items`) and overlays to `SCENES`. The workshop's “Preview-only stage” demonstrates two existing trees on one island without renderer changes. The build deliberately generates earned stages 0–12 only. Extending learner progression requires a separate deliberate change in `features/city/model.js`; authoring a preview does not award progress.

Run `node tools/pixel-town/verify-art.mjs` after building. It generates four progression contact sheets, a shared-tree comparison and 208 exact patch-replay checks. Check existing stages for unintended differences. Source content hashes invalidate all related generated artifacts together; `.pixel-town-cache` is a disposable build cache.

## Runtime contract

- Thirteen scenes (initial water plus twelve stages), four lighting buckets. Clock selection uses local hours/minutes, never geolocation or a stored study day. Sunset is 17:30–20:00, including the requested 18:00–19:00 interval; dawn is 05:30–07:30.
- Independent new PNG stills are selected before the browser parser discovers town image URLs. Public markup is restored verbatim by the conditional parser script. A shared CSS custom-property fallback preserves public background imagery and suppresses it in the enabled trial.
- One animated canvas, at most six timeout-driven updates per second, no continuous animation-frame loop. Frames use deduplicated 32px patches generated during the build. Scene changes release the prior atlas before decoding another. Onboarding remains still.
- Reduced motion overrides the local `edenia.pixelTown.motion` preference. Hidden/offscreen scenes stop callbacks; resume reads the clock rather than replaying elapsed frames. Disposal aborts fetches, closes decoded atlases, removes listeners/observers and invalidates pending completions. BFCache suspension resumes through visibility observation.
- A six-second animation-start deadline retains the independent still. Missing/incompatible manifests or failed atlases do not request legacy images. A failed still retains the reserved scene area and stage/progress text. No retry loop; an explicit pause/play retry or a new scene may retry.
- Adaptation preserves detail. The policy supports three consecutive slow attributed windows before reducing 6→3→still. The runtime does not infer town-attributed late paints from whole-page lag; automatic sustained-window adaptation stays inactive without that attribution. Two measured town callbacks over 50 ms within 10 seconds can degrade one step. Manual pause remains available.
- Runtime metrics retain at most 600 samples and are accessible only from `EDENIA_PIXEL_TOWN.controller` on the enabled route. They are diagnostic callback timings, not proof of paint/compositor latency.

## Rollback and release

Build without `EDENIA_PIXEL_TOWN_ENABLED=true`, then use the existing Pages publish workflow and reload both URLs. This is a build-time switch; redeployment and open-tab reload are required. No learner data needs changing. This implementation does not enable the release workflow's flag or merge/deploy itself. Preserve the existing public image files until a separate public rollout authorizes removal.

All generated experiment assets share a source-content-hashed directory. Entry, manifest, atlas and still references cannot silently mix versions. Already-open old pages may retain their decoded scene; a missing old asset after deployment falls back to the independent still or reserved area. No cache clearing or profile reset is used.

## Evidence and limits

See `evidence/` and the PR checks. `measure.mjs` records raw startup, scene-switch-to-two-animation-frames, scroll intervals, callback samples, resource sizes and heap readings. Its default run uses short diagnostic windows; `--full` selects the specified 30-second windows, and `--long` records a ten-minute visible run. Fixed fixture hashes and actual mounted card counts are included. Headless focus changes are not physical hidden-tab proof. The diagnostic action measure is not an Event Timing or compositor trace.

Physical Android/iPhone measurements, network-shaped cold startup, attributable paint traces, full filter/video action comparisons, hosted rollback timing and owner acceptance must be recorded separately. Local Chromium and WebKit results cannot substitute for those gates. Never call this deployed or fully performance-accepted from a local suite alone.
