# Reliable Tiny Swords startup and invisible recovery

Status: implementation and validation in progress, October 28, 2026. Investigation base: `origin/master` at `7ff57f12c46f0c6c07ee9b0f143466390b47141f`, matching the hosted release at investigation time. Implementation is on `codex/island-loading-plan`; no deployment is authorized by this work.

The island must recover automatically from temporary startup failures without exposing the current failure message or retry button. The user reports recurring failures in Chrome on both a Pixel 7a and a Mac, and says manual retry usually does not help. Keep normal loading speed, cached engine reuse, and gameplay frame performance as explicit release requirements.

Use one host-owned startup controller to supervise successive iframe attempts. Retain today's fast streaming path for the first attempt, change delivery strategy when the failure warrants it, and pause between repeated failures. Keep the learner's saved island intact throughout. Godot continues to own restoration, validation, migrations, gameplay, and the first rendered frame.

## Findings and evidence

The screenshot is produced by `failStartup()` in `scripts/tiny-swords-xp-parent.js`. Several independent failures converge on that same message, so it does not identify the underlying cause.

| Test against current source | Observed result | Consequence |
| --- | --- | --- |
| Send a startup failure, advance the test clock 60 seconds | One iframe; state remains `failed`; zero writes | There is no automatic attempt recovery |
| Mount a silent iframe, advance 120 seconds | One iframe; state remains `slow` | The 20 second timer only changes the message |
| Send startup failure after accepted restoration | A ready island becomes failed | Startup messages can disable a working game |
| Replace an iframe, accept restoration, then fire the old iframe's error callback | The new ready island becomes failed | DOM callbacks need the same attempt fencing as messages |
| Dispatch an unrelated promise rejection before the first save | Receiver sends startup failure | `edeniaSaveId === 0` is not a reliable startup boundary |
| Real exported game, first engine script request returns HTTP 503 | First attempt fails; manual replacement restores successfully | A fresh iframe can recover a temporary script failure |
| Real exported game, repeatedly truncate the compressed engine after output begins | Initial attempt and manual retry both fail; zero writes | Repeating the same delivery strategy can repeat the failure |
| Same persistent compressed-engine fault, use existing ordinary HTTP delivery | Saved island restores successfully | A fresh attempt using ordinary delivery is a viable recovery path |

The existing 49 loader/delivery/persistence contract tests pass. They verify bounded asset fallback, corrupt-stream rejection, cache behavior, and persistence fences, but do not require the host to retry automatically.

The existing worker has one second cache deadlines and the asset adapter has 15 second inactivity deadlines. Worker stalls can switch to ordinary delivery within the same immutable stream. Corruption after bytes reach Godot correctly rejects that stream. Keep that distinction: corrupt bytes must never be combined with bytes from a replacement download; recover with a fresh iframe.

Godot's generated loader also contains up to four download attempts with one second delays. Its raw WASM stream is returned before later body errors occur, so those retries do not cover every engine failure. The adapter deliberately fences further downloads once its terminal timeout is reported. The new controller must coordinate these layers instead of multiplying independent retry loops.

### Local measurements

Real source-owned Godot export, synthetic populated island, disposable Mac browsers, no learner account or original browser profile. The Chromium viewport was 390 by 844, DPR 3 for regular visits. These are small local feasibility samples, not physical Pixel measurements or production percentiles.

The first Chromium run loaded in 3.439 seconds cold and 2.382, 1.693, and 1.699 seconds warm. A repeat run loaded in 2.336 seconds cold and 1.683, 1.880, and 1.970 seconds warm. Every warm regular visit made zero engine network requests. Ordinary HTTP delivery under the persistent compressed-engine fault restored in 1.678 seconds in the first run.

Firefox restored in 8.961 and 8.072 seconds; WebKit restored in 1.604 and 1.275 seconds. These are desktop browser engines with a narrow viewport, not physical phone results. WebKit's disposable context fetched the engine again on its second visit; do not assume Cache API retention in private contexts.

A throwaway recovery prototype automatically recovered both a one-time script 503 and persistent compressed-engine corruption in exactly two iframe attempts each. Frame-by-frame observations recorded zero failure-screen frames and zero visible retry-button frames. Its normal loads took 2.066 seconds cold and 1.726, 1.857, and 1.593 seconds warm, with zero warm engine network requests. This small sample supports feasibility; it does not prove performance parity or implement the full controller below. The probe changed HTTP responses only; application source is unchanged.

### Production evidence and uncertainty

A read-only query of PostHog project 511399 returned 60 island health/retry records over the rolling seven days at investigation time. It included one generic startup failure on iOS at October 28, 00:15:01 Taipei time, and one manual retry followed by a successful startup in Chrome iOS on October 22. Neither identifies the user's Pixel/Mac occurrence. The host's health events omit startup stage and cause, deduplicate repeated outcomes, and exclude internal-test URLs. They cannot establish a failure rate or explain the screenshot.

The confirmed problem is missing and overly broad startup recovery. The frequency of each underlying network, script, WebGL, memory, cache, or suspension trigger remains unknown. The controller should cover these distinguishable cases while adding bounded diagnostics to identify the remaining causes.

Live asset checks found the current game release `db341865a7d8b858736985bf9e4d4f598f30e826f8f4d35d7cf61c394c062944` available, but the older local export's release `4ded8ddcf7ae39f0c6a24cb4858f04f96fa8cdb1817779b69071876a658c1aa7` returned 404 for both `parent.js` and `index.html`. The parent pins retries to its original release directory, and the builder retains only its newly built release. This establishes a stale-release recovery gap, not that a deleted release caused this screenshot.

## Experience contract

- Public startup and recovery never show “Your island could not start,” “Retry island,” retry counts, or a failure dialog. Recovery requires no click or page reload.
- Keep the normal island preparation cover while an attempt is actively loading. Recovery uses the same cover without flashing a failure state. Keep surrounding study controls usable.
- During longer retry pauses, retain the island area's dimensions and ordinary water backdrop; hide the active loading bar and spinner. Do not animate fictitious progress or loop a loading bar indefinitely. Continue studying without a modal or failure notice.
- When recovery starts again, use the normal preparation cover. Complete it only after Godot accepts the latest saved island and renders its first frame. Enable input only then.
- Once ready, disable the startup controller's timers and automatic remount behavior. Treat a real running-game failure as a separate lifecycle problem; never discard live unsaved gameplay because of a late startup signal.
- Preserve developer diagnostics in local/internal tooling without exposing technical causes in the public game surface.

## Controller ownership and interface

Keep browser lifecycle and delivery recovery in the Edenia host/asset adapters, within the ownership rule in `godot/tiny-swords/README.md`. Keep all game decisions in canonical Godot source. No persistence format, learner-profile opening policy, or cloud scheduling changes are required.

Use explicit states: `waiting-profile`, `loading`, `retry-wait`, `dormant`, `ready`, `restore-blocked`, and `disposed`. Track the loading stage separately: iframe document, engine script/assets, engine initialization, scene handshake, restoration/first draw. Existing messages already cover most milestones.

Make the controller a small testable unit bundled into the existing `parent.js` response. It owns attempt identity, startup state, deadlines, retry budget, and cleanup. It receives callbacks to mount/dispose a frame and re-read current profile access; it does not own profile data or game state. Preserve the builder's release hashing and injected preload configuration. Add no extra startup script request.

Every asynchronous callback must capture its iframe and attempt identity: messages, `load`/`error` listeners, timers, visibility wakeups, failed preloads, and pending persistence completion. Ignore a callback if either is retired. An island/profile replacement must cancel recovery and begin a distinct lifecycle under the new activation. Duplicate failure reports produce one transition and at most one queued retry.

### Failure classification

Send fixed, allowlisted stage and reason codes from the asset adapter and export shell. Include the asset kind and delivery mode, not arbitrary exception text or URLs. Distinguish network rejection, HTTP status category, inactivity timeout, invalid decoded stream/length, script load, engine initialization, unsupported capability, restore rejection, and missing first draw.

Use explicit caught failures from the owned startup promise and resource loader as authoritative signals. Do not use every `unhandledrejection` as proof of startup failure. An unrelated rejection can be recorded locally; startup deadlines detect an actual failure to reach a milestone. Replace the first-save heuristic with explicit startup readiness. Fence DOM error callbacks as carefully as cross-frame messages.

Reserve capability checks for the engine's existing checks or a cheap one-time check; avoid creating an extra WebGL context just to probe support. Unsupported WebAssembly/WebGL or a rejected saved layout does not benefit from immediate repeat engine initialization.

## Recovery policy

| Condition | Action |
| --- | --- |
| First healthy attempt | Preserve existing preload, compressed streaming, compilation overlap, and engine cache |
| Temporary network/script failure before startup | Quietly retry after about 0.5 seconds with small jitter; reuse immutable URLs and valid caches |
| Decoder/worker/stream integrity failure, or repeated unexplained engine startup failure | Retire the entire attempt and use ordinary HTTP delivery in the next iframe; bypass the custom compressed engine cache and decoder for that attempt |
| Known bad disposable engine cache entry | Evict only that engine entry with a bounded operation; never clear origin storage or learner data |
| Additional transient failure | One further fast attempt after about 2 seconds; never exceed three total fast attempts per cycle |
| Fast attempts exhausted | Enter `dormant`; retry after 30 seconds, then 2 minutes, then at most once per 5 minutes while the page and island are eligible |
| Network explicitly offline | Pause retries until `online`; resume once, after verifying access and eligibility |
| Unsupported capability | Remain quiet and dormant; no repeated compilation loop in the same document |
| Restore rejected, layout oversized, or malformed legacy layout | Enter `restore-blocked`, preserve the exact saved input, reject writes, and await a real profile/island replacement or newer compatible release |

The timings are initial implementation settings to validate, not measured optimal values. Time starts after failure classification, never before the first healthy attempt. A wakeup must not reset the failure budget; repeated focus/online events cannot create a retry storm. Manual internal tooling can begin a new cycle explicitly.

Keep the existing engine URL/cache for ordinary success. Use a fixed recovery parameter or validated attempt configuration to select ordinary delivery on a recovery attempt only. Do not disable `Worker` globally, redownload the engine on every visit, change compression for all learners, or add random cache-busting URLs. The prototype's worker disabling experiment demonstrates the fallback path, not the implementation API.

A startup retry should not refresh the whole Edenia page or fetch cloud learner state. For a missing release artifact, allow one bounded refresh of a host-owned current-game manifest to discover a newer compatible game release; otherwise repeated fetches cannot repair the immutable missing URL. Add this manifest during the build, with its immutable game URL and an explicit host/bridge compatibility version. Accept only same-origin allowlisted hash paths, a compatible bridge and persistence transport contract, and a reader supporting the retained island version. Pin engine, pack, decoder, and adapters to one selected release. Never mix release files, execute a replacement parent adapter alongside an existing one, or select an older reader. Do not add manifest discovery to normal startup.

## Deadlines and page lifecycle

Keep 15 second asset inactivity deadlines, refreshed by actual byte arrival. Repeated identical progress values do not count as activity. Retain the 20 second slow observation internally without exposing the retry UI.

For stages without measurable byte progress, begin with a 45 second visible-time engine initialization deadline and 20 second visible-time scene/restore/first-draw deadlines. Measure these on slower hardware before rollout. A slow but advancing download must not restart every 20 seconds. Do not impose a short total wall-clock deadline that repeatedly destroys useful compilation/download progress.

Pause startup deadline accounting during `document.hidden`, page suspension, and BFCache residence. On `pageshow`, `resume` where supported, `visibilitychange`, and `online`, reconcile once against the current attempt and profile activation before scheduling work. Do not interpret a timer that fired late after sleep as fresh evidence of a dead engine. Give a resumed in-progress attempt a short reconciliation grace period before its stage deadline can retire it.

Begin no new engine attempt while the page is hidden or the island is offscreen. An already healthy hidden attempt may complete; do not retire it solely for visibility. A pending failure waits for an eligible wakeup. Retry wakeups use one timer, not polling or a second requestAnimationFrame loop.

## Retirement and data protection

One controller owns one active frame and at most one retry timer. Retire the previous attempt before mounting its successor: stop its progress/deadline timers, remove observers/listeners, terminate its loader workers, cancel preload ports/readers/fetches, and release iframe references. Iframe removal does not guarantee immediate browser memory reclamation; validate repeated failures under memory pressure and increase cooldown if needed.

Keep the current accepted-restore gate and predecessor/access fences for every save. Before a retry reads its restoration input, re-read the active profile and activation identity. Reset, import, backup restore, sign-out, account change, or access loss invalidates old timers and callbacks immediately. Never resurrect the input captured by a previous attempt. A pending save's completion cannot acknowledge a retired session or remount an earlier owner.

Do not retry restoration with an empty island, downgrade to an older reader, normalize away invalid data, or persist a fallback layout. A restore refusal preserves the original island for a compatible implementation or explicit recovery. Retry cache cleanup is restricted to disposable game assets.

A complete Chrome tab/renderer crash prevents the controller from executing. It can recover a failed iframe while the parent survives; after full tab reopening, ordinary startup must recover from the durable saved island. Android low-memory termination and WebGL context loss after gameplay starts require separate evidence before adding automatic running-game replacement.

## Performance acceptance

Normal success adds no prerequisite request, no wait, no checksum pass over the full engine, no additional decoded engine buffer, and no parallel engine instance. Keep bounded worker chunks and streaming compilation. Do not retain a previous WebAssembly runtime to hide loading.

Once ready, the controller has zero active startup/retry timers and zero periodic polls. It does no per-frame work, island snapshot serialization, cloud work, or profile writes. Existing gameplay visibility and save scheduling retain their behavior. An `online`/visibility event on a healthy ready island cannot trigger a download or remount.

Before release, compare baseline and candidate on the same build fixtures, browser, device, power conditions, cache state, and network profile. Run at least 20 interleaved visits per cold/warm case. Treat a median or p95 increase above the greater of 100 ms and 5 percent as a regression needing investigation; do not present small noisy samples as proof of parity. Assert identical successful-path engine request counts and immutable cache reuse.

Compare actual Godot frame intervals and long-frame counts during the same scripted gameplay for at least 60 seconds per run, including ordinary movement and a populated island. Require no additional controller work after ready and no reproducible regression. Browser requestAnimationFrame frequency alone is not sufficient evidence of Godot frame performance. Record browser memory including WASM where available during repeated failed attempts; JS heap alone is insufficient.

Physical Pixel 7a Chrome and Mac Chrome are required acceptance targets. Emulated mobile viewports do not reproduce Android memory, GPU, suspension, or network behavior. If a device cannot be exercised automatically, retain the result as pending instead of treating a desktop test as its substitute.

## Diagnostics

Extend the existing health allowlist with startup stage, fixed failure code, asset/delivery mode, attempt number, and a coarse recovered/dormant/restore-blocked outcome. Record total startup duration across retries separately from per-attempt duration. Ensure telemetry deduplication can distinguish attempt outcomes without treating success observations as a complete denominator.

Use a per-document ephemeral lifecycle identifier and monotonically increasing attempt number; no new persistent user identity. Keep bounded summaries rather than a stream of progress events. Do not capture layouts, learner content, arbitrary URLs/query strings, raw errors, or console output. Preserve analytics opt-in and existing internal-test exclusions. Internal/local diagnostics use a bounded in-memory record exported on demand, so the user's test mode can still be investigated without enabling analytics.

## Implementation sequence

1. Add the controller and meaningful failing regression tests at the real parent/iframe seam. Fence all callbacks and make readiness terminal for startup recovery. Scope error classification to owned startup operations.
2. Add automatic replacement, a single retry budget, visible-time deadlines, offline/resume handling, and complete retirement. Preserve profile/restore/save fences. Implement the public loading/dormant cover and remove the manual failure/retry surface from public startup.
3. Add the alternate delivery mode for recovery, bounded bad-entry eviction, and optional failed-release refresh. Coordinate the generated Godot download retries with one host budget. Keep normal streaming and preload behavior unchanged.
4. Add bounded diagnostics, run the fault matrix and matched performance checks, then validate on Pixel 7a and Mac Chrome. Update the ownership/delivery documentation with the final policy.

Each step must preserve normal success and saved-island restoration. Prepare the issue/PR against the final tested scope; this planning task does not authorize deployment.

## Required verification

| Area | Required cases and assertions |
| --- | --- |
| Transient failures | Script 503/reset once; offline at mount; network drop before headers and mid-body; automatic success without clicks; no rendered failure/retry UI |
| Delivery failures | Worker unavailable/silent/stalled, cache denied/full/stalled, corrupt cached engine, truncated network bytes, ordinary path failure; no mixed streams; no retry multiplication |
| Silent stages | Never-loading iframe, never-settling initialization, missing scene handshake, accepted restore without a first draw; recover on stage deadlines while preserving advancing downloads |
| Lifecycles | Hidden during download/compile, device sleep/wake, BFCache, repeated online/focus, offscreen island, restored tab; no simultaneous attempts or wakeup storm |
| Stale work | Old iframe error/load/message, duplicate errors, late ready, pending save completion, retry timer after sign-out/profile switch/reset/import; no remount or write for retired ownership |
| Saved data | Valid populated island, migration, absent island, oversized/rejected layout; failed attempts write nothing; successful retry restores latest durable game; rejected restore remains preserved |
| Ready gameplay | Unrelated promise error, late startup failure, focus/online events; no automatic frame replacement or startup timers after ready |
| Experience | Frame-by-frame check for failure text/retry button exposure, input gated until first draw, surrounding study usable, stable island dimensions, quiet cooldown without false progress |
| Performance | Cold/warm visits, engine request counts, frame intervals, long frames, workers/context teardown, repeated-failure memory; physical Pixel and Mac runs |

Run the existing delivery, preload, dashboard, public-island, local persistence, profile handoff, and preview suites alongside the new targeted tests. Use the browser failure harness to prove the intended symptom first; source-text checks alone cannot validate automatic recovery.

## Rollout and rollback

Use an isolated `internal_test=1` gate for initial validation, including the same public cover behavior. Expand only after recovery, preservation, and performance acceptance pass. Keep the startup-controller rollout independent of game save version, storage flags, and cloud sync changes. Turning the rollout off retains the current reader and all saved islands.

Existing pre-deployment tabs may reference game directories removed by a later Pages deployment; the live old/new asset check above demonstrates that old directories are not retained indefinitely. Add a two-release hosting fixture and hosted stale-tab acceptance. Implement the one-time compatible newer-release selection above and evaluate a bounded compatibility window of complete prior releases for tabs that predate the controller. Validate deployment size and expiration before choosing a retention count. Incompatible bridge/persistence changes require retaining the matching old complete release for the supported stale-tab window; do not silently select an older reader or incompatible new game.

## Reproduction and retained artifacts

Investigation artifacts are under `.cache/startup-investigation/` in the `codex/island-loading-plan` worktree. `host-repro.mjs` intentionally fails on the missing automatic retry; `host-diagnostics.mjs` records the other lifecycle gaps. `browser-probe.mjs` serves actual `_site` game files read-only with a synthetic fixture and disposable browser profiles. Its `--prototype` mode applies response-only experimental changes; it never edits application source or generated files.

```sh
node .cache/startup-investigation/host-repro.mjs
node .cache/startup-investigation/host-diagnostics.mjs
node --test tests/contracts/tiny-swords-startup-recovery.test.mjs tests/contracts/tiny-swords-delivery.test.mjs tests/contracts/tiny-swords-local-persistence.test.mjs
node .cache/startup-investigation/browser-probe.mjs
node .cache/startup-investigation/browser-probe.mjs --prototype
```

Use a repository-supported Node 24 version and installed matching Playwright browsers. Run browser measurements sequentially, without a concurrent build. Results: `contracts.log`, `host-diagnostics.json`, `browser-results.json`, `prototype-results.json`, `hosted-assets.json`, and redacted `production-summary.json`. The source-owned integrated export was rebuilt successfully with gameplay validation disabled for this investigation; the 49 focused contracts and real browser restoration checks provide the validation reported here. Prototype retirement, cooldown, physical-device behavior, and actual gameplay frame performance still need the implementation acceptance tests above.
