# Internal pixel-town implementation

Experiment: pixel-art-town
Retired: the mode-1 runtime and production build integration were removed on 2026-10-07. The standalone experiment sources remain for reference.
Public path: unchanged (subject to the linked CI and browser evidence)

Future economy direction: [Experience, coins, and player choices](economy-design.md)
records the agreed design and open questions; it is not implemented gameplay.

This implements [Build the complete internal pixel-town experience](https://github.com/BriceChivu/Edenia/issues/349) using the owner-approved isometric artwork at `238297c`. The default build switch is **off**. An enabled build is available for local review; changing the hosted release switch and owner acceptance belong to [Deploy and accept the internal pixel-town trial](https://github.com/BriceChivu/Edenia/issues/350).

## Run

Use the Node version in `.nvmrc`, then `npm ci`.

```sh
EDENIA_PIXEL_TOWN_ENABLED=true npm run build
node scripts/serve-static.mjs --host localhost --port 4188 --root .
```

- Public comparison: `http://localhost:4188/_site/`
- Local workshop: `http://localhost:4188/tools/pixel-town/`

The workshop and source geometry are excluded from the Pages build. The learner entry contains only lifecycle, light selection, manifest validation and cached patch playback. There is no Auth dependency, profile migration, provider call, game engine or experiment service worker.

## Authoring

| Change | Source |
| --- | --- |
| Object geometry (houses, trees, boats, etc.) | `src/experiments/pixel-town/objects/<type>.js` |
| Pixel primitives and isometric projection | `src/experiments/pixel-town/shared/drawing.js` |
| Compatible drawing interface | `src/experiments/pixel-town/artwork.js` |
| Shared tree blossom color, roof rows | `src/experiments/pixel-town/parameters.js` — `DESIGN` |
| Breeze or smoke | `parameters.js` — `EFFECTS`; deterministic motion functions in `effects.js` |
| Local clock buckets, materials | `lighting.js` |
| Stage composition, placement, ordering | `scenes.js` |
| Scheduling, cancellation, disposal | `entry.js`, `player.js` |
| Build-time stills and patch atlas | `scripts/build-pixel-town.mjs` |

**Change a roof:** edit `objects/house.js` or `DESIGN.roof.rows`; inspect stages 1, 2, 9, 10 and 12 at all lights. Both orange and purple houses share the roof definition.

**Tune smoke:** select House or Volcano in the workshop, adjust smoke height, inspect motion, download a draft and run the displayed save command. Smoke is a shared effect: the change applies to both chimney and volcano emitters. It does not change foliage or scene placements.

**Module layout:** each object type has one implementation reused by every instance and variant. `pot.js` and `volcano.js` reuse `shrub.js`. The drawing context owns palette, deterministic motion, pixel primitives and projection; its scale is read when an object draws, after the scene selects a group placement. Object modules contain local geometry, with no scene, reward or purchase imports. `scenes.js` owns anchors and draw order. Bridge and bird anchors use screen pixels; the other positioned objects use group-local isometric coordinates. The artwork interface retains legacy no-argument defaults for workshop previews. Build hashing recursively includes object and shared modules.

**Change a tree:** select Flowering tree. Adjust blossoms or breeze. Compare isolated before/after and stages 2 and 12. Reset discards the draft. Download writes only a draft file; `node tools/pixel-town/save-draft.mjs <draft.json>` validates it and writes the version-controlled parameters module. Review `git diff`, rebuild, compare captures, then commit. No browser storage is used for artwork drafts. The save command accepts only exposed bounded parameters, never arbitrary code.

**Create a named tree variant:** choose the variant scope and a stable ID. Saving adds `VARIANTS[id]` without changing existing artwork. Replace only intended scene entries' `asset: 'tree'` with `asset: 'tree:<id>'`. This explicit source reference determines scope. Shared tree edits affect all default trees; variant references use their own blossom/breeze parameters.

**Add a landmark:** add `objects/<type>.js` exporting a drawing function that accepts the shared drawing context and object arguments. Import and expose it in `artwork.js`, add catalog metadata and reference the ID from scene items. Keep effect parameters separate. No player change is needed.

**Add a visual stage:** add a scene object containing groups (`id`, `at`, `items`) and overlays to `SCENES`. The workshop's “Preview-only stage” demonstrates two existing trees on one island without renderer changes. The build deliberately generates earned stages 0–12 only. Extending learner progression requires a separate deliberate change in `features/city/model.js`; authoring a preview does not award progress.

Run `node --test tests/contracts/pixel-town*.test.mjs` for rendering and lifecycle contracts. The pre-extraction RGBA fixture records 560 renders from `dac7673b79bff2c536bb4d65e2680e209b24ed5e` with canvas 1.0.9: all scenes and lights at four animation times, every catalog object at two scales/times and all lights, and a mixed default/variant tree scene. Intentional future artwork changes require reviewing and updating those fingerprints.

Run `node tools/pixel-town/verify-art.mjs` after building. It generates four progression contact sheets, a shared-tree comparison and 208 exact patch-replay checks. Check existing stages for unintended differences. Source content hashes invalidate all related generated artifacts together; `.pixel-town-cache` is a disposable build cache.

## Runtime contract

- Thirteen scenes (initial water plus twelve stages), four lighting buckets. Clock selection uses local hours/minutes, never geolocation or a stored study day. Sunset is 17:30–20:00, including the requested 18:00–19:00 interval; dawn is 05:30–07:30.
- Independent new PNG stills are selected before the browser parser discovers town image URLs. Public markup is restored verbatim by the conditional parser script. A shared CSS custom-property fallback preserves public background imagery and suppresses it in the enabled trial.
- One animated canvas, at most six timeout-driven updates per second, no continuous animation-frame loop. Frames use deduplicated 32px patches generated during the build. Scene changes release the prior atlas before decoding another. Onboarding remains still.
- Animation starts automatically; there is no learner pause control or saved motion preference. The system reduced-motion setting remains respected. Hidden/offscreen scenes stop callbacks; resume reads the clock rather than replaying elapsed frames. Disposal aborts fetches, closes decoded atlases, removes listeners/observers and invalidates pending completions. BFCache suspension resumes through visibility observation.
- A six-second animation-start deadline retains the independent still. Missing/incompatible manifests or failed atlases do not request legacy images. A failed still retains the reserved scene area and stage/progress text. No retry loop; a new scene or page reload may retry.
- Adaptation preserves detail. The policy supports three consecutive slow attributed windows before reducing 6→3→still. The runtime does not infer town-attributed late paints from whole-page lag; automatic sustained-window adaptation stays inactive without that attribution. Two measured town callbacks over 50 ms within 10 seconds can degrade one step. The learner does not need to manage motion manually.
- Runtime metrics retain at most 600 samples and are accessible only from `EDENIA_PIXEL_TOWN.controller` on the enabled route. They are diagnostic callback timings, not proof of paint/compositor latency.

## Rollback and release

Build without `EDENIA_PIXEL_TOWN_ENABLED=true`, then use the existing Pages publish workflow and reload both URLs. This is a build-time switch; redeployment and open-tab reload are required. No learner data needs changing. The Pages workflow reads the repository Actions variable `EDENIA_PIXEL_TOWN_ENABLED`; only the exact value `true` enables it. An unset or false value keeps both routes on the existing town. Changing the variable does not change a deployed page until the workflow runs. Preserve the existing public image files until a separate public rollout authorizes removal.

All generated experiment assets share a source-content-hashed directory. Entry, manifest, atlas and still references cannot silently mix versions. Already-open old pages may retain their decoded scene; a missing old asset after deployment falls back to the independent still or reserved area. No cache clearing or profile reset is used.

## Evidence and limits

See `evidence/` and the PR checks. `measure.mjs` records raw startup, scene-switch-to-two-animation-frames, scroll intervals, callback samples, resource sizes and heap readings. Its default run uses short diagnostic windows; `--full` selects the specified 30-second windows, and `--long` records a ten-minute visible run. Fixed fixture hashes and actual mounted card counts are included. Headless focus changes are not physical hidden-tab proof. The diagnostic action measure is not an Event Timing or compositor trace.

The cold-start capture uses 4 Mbit/s and 150 ms RTT with a phone viewport on desktop Chromium. See [the evidence report](evidence/README.md) for measured values, soft-target misses and capture limitations. Physical Android/iPhone measurements, attributable paint traces, full filter/video action comparisons, the full prescribed comparison windows, real hidden-tab suspension, hosted rollback timing and owner acceptance remain pending. Local Chromium and WebKit results cannot substitute for those gates. Never call this deployed or fully performance-accepted from a local suite alone.


### Hosted trial operator steps

Enable only the reviewed master revision after its required checks pass:

```sh
gh variable set EDENIA_PIXEL_TOWN_ENABLED --repo BriceChivu/Edenia --body true
gh workflow run deploy-pages.yml --repo BriceChivu/Edenia --ref master
```

Record the workflow run, `/release.json` revision, runtime configuration and pixel-town content hash. Verify both routes with fresh and previously used disposable contexts. Deployment is not owner or device acceptance.

Rollback with the same reviewed source:

```sh
gh variable set EDENIA_PIXEL_TOWN_ENABLED --repo BriceChivu/Edenia --body false
gh workflow run deploy-pages.yml --repo BriceChivu/Edenia --ref master
```

Wait for the successful Pages run, reload both routes, confirm existing town images and zero pixel-town requests/controller. Record elapsed time from dispatch through verified hosted switch-off. Open tabs require reload. Do not clear storage, reset/import a profile, change Auth flags or disable shared services. Re-enabling uses the first two commands and the same verification.
