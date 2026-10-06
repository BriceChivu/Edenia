# Tiny Swords integrated preview acceptance

[Issue #380](https://github.com/BriceChivu/Edenia/issues/380) has local desktop and phone-emulation evidence, integration fixes, and a CI check added. Implementation acceptance remains **pending physical iPhone/Safari, physical Android/Chrome, and remote CI evidence**. Neither phone was available on 6 October 2026. These results do not authorize deployment or public enablement.

## Build and environments

The tested game release is `f0fbf825656fd8824d6e87165e7bd8e797422d21704cad8cb65fd6c7685f69bd`, built with official Godot `4.7.2.stable.official.ed1daf0bf` and Node `24.18.0`. Git HEAD is `6b54e0b57f59e428c9b3d5bec30ee9541fe1d3c2` plus uncommitted work. [build.json](build.json) records hashes of the actual host HTML, JavaScript, CSS and config, rather than treating HEAD as the delivered revision.

Validation used an isolated source/build snapshot at `.cache/issue-380/workspace`, served locally under `/Edenia/`. Shared `_site` rebuilds invalidated earlier runs; those results are excluded. The isolated export remained fixed during testing. Later test-harness corrections did not change the delivered build.

The machine was an Apple M3, arm64, macOS 26.7 (25G229), running Playwright Chromium 151.0.7922.34. Desktop used 1440×900. Phone emulation used 390×844 with mobile/touch settings. A separate 360×800 check covers the narrow inventory. All browser profiles were disposable. The level-seven synthetic fixture includes a tree, chicken, terrain, partial harvesting and retained logs; its reserved house bundle was converted to carried logs so construction did not block inventory interaction.

| Environment | Navigation to accepted, usable island | Compressed engine and pack | Device evidence |
| --- | ---: | ---: | --- |
| Desktop Chromium, 1440×900 | 1.810 s | 10,116,389 bytes, Brotli | Actual desktop browser run |
| Chromium phone emulation, 390×844 | 1.840 s | 10,116,389 bytes, Brotli | Emulation only |
| Chromium narrow-phone emulation, 360×800 | 2.676 s | 10,116,389 bytes, Brotli | Emulation only |
| iPhone with Safari | Pending | Pending | Device unavailable |
| Android phone with Chrome | Pending | Pending | Device unavailable |

[Desktop measurements](desktop-standard.json), [phone-emulation measurements](phone-standard.json) and [narrow-phone measurements](phone-small.json) contain the browser user agent, viewport, release, accessibility snapshots and response headers. Engine WASM transferred 8,182,023 bytes and the pack 1,934,366 bytes. These are the two core game payloads, excluding the loader and host page. Brotli and gzip negotiation were both verified against the local server. Timings are single local-server observations with no network throttling; they establish neither phone startup time nor wide-area-network performance.

## Fixes and outcomes

Escape previously closed Terrain but left keyboard focus trapped inside the canvas. Godot now requests host focus when Escape has no game action to cancel; Edenia accepts that request only from its current, ready session and focuses Reset view. House cancellation and Terrain closing retain priority. Godot buttons and the frame show focus borders, and the localized guidance below the island explains the exit and pointer/touch building.

Godot now owns reduced-motion treatment for decorative clouds, the foreground cloud, celebration sparks/fades and arrival dust. The bridge transports the browser preference initially and on changes. Arrival and gameplay clocks retain their existing rules; the preference never enters a save. The native export contract checks cloud freezing, immediate reward presentation, settling a running celebration, unchanged inventory, high-level inventory bounds at desktop/360px, and visible focus styles.

The existing integration checks cover claimed levels, durable reward acknowledgments, save failure, reload, profile replacement/reset, rejected restoration, versioned base-path loading, and disable/re-enable preservation. Startup delay and deliberately failed engine downloads preserve the island and Study History; retry restores the engine. The real acceptance smoke checks inventory taps, touch panning, Escape exit, motion-preference delivery, offscreen/covered suspension, and return to the same iframe. Video-player continuity uses the existing YouTube stub; actual YouTube playback remains part of the physical-device checklist.

Trailer captures and walkthrough replay were inspected across the five locales on desktop and phone emulation. Two existing test timing assumptions were corrected: the trailer clock now pauses after initialization at a timestamp safely ahead of every frame, and placement waits for the pan's new camera telemetry instead of using its preceding sample. No product timing rule changed for these test corrections.

## Accessibility limits

The browser accessibility snapshot exposes the canvas fallback text, **not** Godot's button labels. In-game `accessibility_name` values therefore do not establish browser assistive-technology access. The host exposes named camera buttons, keyboard guidance, startup/save status and a readable level/XP progressbar outside the canvas. Building remains a pointer/touch interaction; no full keyboard-only or screen-reader building claim is made. Physical VoiceOver/TalkBack behavior has not been tested.

[Desktop inventory](desktop-standard-developed-inventory.png), [desktop focus](desktop-standard-keyboard-focus.png), [phone inventory](phone-standard-developed-inventory.png), [phone focus](phone-standard-keyboard-focus.png) and [360px inventory](phone-small-inventory.png) retain visual evidence from the fixed export.

## Verification

- 48 focused persistence, claim, progression, export, locale and walkthrough contracts passed.
- Integrated Godot export contract, inventory outline assets, native gameplay and progression checks passed during the build. The existing island-arrival check also passed.
- All 21 distinct browser cases pass using the latest result for each corrected test: 20 desktop/390px cases plus the narrow-phone acceptance case. [checks.json](checks.json) records the initial isolated run and focused rechecks, including the intermediate test-harness failures. The corrected trailer and placement cases were rerun without changing the delivered build.
- The CI Tiny Swords job includes `tiny-swords-acceptance.spec.mjs` with the existing required desktop/phone suite. Remote CI has not run for this uncommitted snapshot.
- `git diff --check` passed.

Rebuild with `node scripts/build-experience-tiny-swords.mjs --project godot/tiny-swords`, then run the six integrated specs listed in the Godot README with `EDENIA_TEST_TINY_SWORDS=true`, `EDENIA_TEST_NORMAL_PORT=4174`, `EDENIA_TEST_BASE_PATH=/Edenia/`, and desktop-standard/phone-standard projects. Keep the served export fixed for the duration of the run. CI uploads Playwright screenshots, traces and the acceptance JSON attachment. No browser/device/locale/level matrix or battery/memory benchmark is required by this ticket.

## Pending physical-device runs

1. Build the current integration and serve it on the local network with `node scripts/serve-static.mjs --host 0.0.0.0 --port 8038 --root _site`. Open `http://<computer-LAN-address>:8038/` on a phone connected to that network. Record the game `release.json` and host revision for this new run; a later build may differ from the release above.
2. In a disposable browser profile at that local origin, import [synthetic-device-profile.json](synthetic-device-profile.json) through Settings → Import sync file. This verified portable file contains synthetic island state and no learner identity or study history. Add/select a playable video normally for the feed/video check.
3. Record phone model, OS/browser version, network conditions, compressed transfer, and navigation-to-usable-island time. Use Safari on the iPhone and Chrome on Android. Record actual observations without replacing them with desktop-emulation numbers.
4. Scroll the page and game, pan, use camera buttons, select inventory tools and place/collect an item. Check the reachable high-level strip in portrait and a narrow layout. Confirm feed and video remain usable during normal and slow startup, and that the island survives reload. Reuse the automated failure/persistence results rather than manually repeating every game rule.
5. Enable the phone's reduced-motion setting; check prominent decorative effects. Cover the game with Settings or playback, scroll it fully offscreen and return. Check host progress/status with VoiceOver or TalkBack and record the canvas limitation explicitly.
6. Save the build/device/outcome evidence and any actionable failure here. Resolve any data-loss, progression, build or basic-usability failure before marking implementation accepted. Keep the issue open until both required physical runs and CI have evidence; passing acceptance still does not authorize going live.
