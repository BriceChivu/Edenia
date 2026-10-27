# Profile-opening implementation measurements

The final implementation reduced median usable opening time by 44.5% for the
tested fresh Google session and 30.6% for the expired Google/large-profile case.
The combined expired-session/large-profile/five-backup case improved by 32.8% at
normal CPU and 33.6% under 4× CPU emulation. Healthy email reopening was essentially
unchanged. Every final sample retained the expected identity and study facts.
These are synthetic local measurements, not production latency or physical-phone
measurements.

The implementation follows [the opening plan](../plans/profile-opening-latency.md).
The primary measure is navigation to an owner-verified, active, non-inert study
surface at a rendered-frame opportunity with a rendered study control. Notice DOM
visibility and frame opportunities are secondary presentation measures. They
must not replace usable time or be described as compositor evidence.

## Reproduction and conditions

Use Node 24.18 and installed repository dependencies:

```sh
node scripts/diagnostics/profile-opening-comparison.mjs \
  --before-site /path/to/frozen-before --before-ref <baseline-commit> \
  --after-site /path/to/frozen-final --after-ref <final-commit> \
  --output-dir /path/to/audit --pairs 5
```

The default command runs the six study cohorts. Add `--cohort game-email-500`
for the separate game comparison. Reproducing the historical first-save race
uses `--allow-before-game-save-failure`; the runner permits that option only for
the exact baseline commit and app hash below, never for the final variant.

The runner serves each frozen site on a separate loopback port and checks that
its own server serves the expected app hash. It verifies release/index identity,
resolves the declared source commits, and rehashes every site file after the run.
Each cohort uses five alternating before/after pairs. No failed sample is
silently removed. The full traces and failed fixture probes remain in the local
audit; [the compact raw data](profile-opening-performance-2026-10-27.json) retains
all 90 measured openings: 60 main cases, 10 separate game cases and 20 rejected
native-hash cases. Two historical first-game-save failures are explicitly
retained rather than counted as successful durable saves.

All Auth, RPC and provider responses are synthetic. All other backend and
analytics traffic is blocked. The RPC fixture includes replacement-boundary
metadata and exact cache-content checks. Fixed 500 or 1,000 ms per-request delays
model network latency, not Internet transfer throughput. Native browser clocks
are used; 4× CPU emulation is a stress condition, not a physical-phone estimate.

The main portable profiles contain 500 and 2,500 retained videos and serialize to
499,916 and 1,866,416 bytes respectively, below the actual 2 MiB cloud-envelope
limit. They use 20 and 5 repetitions of synthetic display metadata respectively;
these are identical between variants. The game profile is 500,561 bytes. The
five-backup bank contains 7,032,276 bytes of admitted synthetic entries.
Returning fixtures already saw level guidance and the island announcement. Their
untimed first opening waits for actual maintenance and archive-write
acknowledgement before setup and measured reopening. Setup occurs in an app-free
same-origin document so a retired warmup cannot change the seeded bank/session.

Clean cases require exact cached identity/content and `profile_unchanged`. The
dirty case makes a real offline video checkpoint, sends no clean-cache claim and
requires `profile_ready`. It compares the exact post-checkpoint portable hash
before retiring the app with the post-reopen hash. Every case verifies exact
owner/profile/generation/revision and retained study content. Five-backup cases
verify actual native-bank admission and that all five archives remain available
through Settings.

Both final runs used Node `v24.18.0` and Chromium `151.0.7922.34` on the same
machine. Study cases disable the engine; the separate game cohort enables it.
There were zero real backend contacts and zero page errors. Every measured
opening performed exactly one successful profile-opening RPC with the intended
clean/full outcome. The five pairs are a small local sample; ranges and paired
values are retained, without statistical significance or production-SLA claims.

## Final study comparison

All values are navigation to first usable frame opportunity, in milliseconds.
Each row has five alternating pairs. The paired difference is computed within
each trial, rather than subtracting two independent medians.

| Cohort | Before median (range), ms | Final median (range), ms | Median paired final − before, ms |
| --- | ---: | ---: | ---: |
| Fresh Google, 500 videos, 500 ms/request | 1,229.4 (1,208.1–1,282.3) | 682.9 (676.3–739.0) | −543.3 |
| Expired Google, 2,500 videos, 1,000 ms/request | 3,529.5 (3,493.3–3,591.2) | 2,450.7 (2,397.7–2,469.7) | −1,095.6 |
| Clean email, 500 videos, 500 ms/request | 689.3 (674.9–723.2) | 684.5 (678.6–715.8) | −2.7 |
| Dirty email, 500 videos, 500 ms/request | 804.4 (779.6–812.3) | 792.1 (771.4–818.0) | −5.5 |
| Expired Google, 2,500 videos, five backups, 1,000 ms/request, CPU 1× | 3,643.4 (3,624.4–3,731.4) | 2,448.6 (2,401.9–2,512.3) | −1,203.9 |
| Same combined case, CPU 4× | 5,123.3 (5,046.2–6,522.3) | 3,403.2 (3,372.8–3,535.3) | −1,664.1 |

The healthy-email differences are small relative to their overlapping ranges;
they do not establish a meaningful improvement or regression. The Google gains
are consistent with removing a classification round trip from the foreground.
The synthetic Google token exercises the pinned SDK's symmetric-key Auth-server
lookup. The baseline made two `/auth/v1/user` classification requests; final made
one. Expired sessions retained one required token refresh in both variants.
Warm asymmetric/JWKS signing can have a different network path and smaller gains.

All clean responses were 318 bytes. Dirty responses remained full
`profile_ready` responses of 500,410 JSON bytes, with all cached parameters null;
resume 40 and the entire post-checkpoint portable body survived. The measurements
therefore do not claim to reduce dirty-response bandwidth. No new optimistic
activation or known-base protocol was introduced.

The baseline traversed the hidden backup list eight times before usable display;
final did so zero times in every case. All five input backups remained available
after opening Settings and Show older. Email traces also show the duplicate Auth
observation no longer causing an extra reminder-default/study-snapshot call:
the counts before usable changed from 2/5 to 1/4. Google stayed at 1/4. These
components were measured together; their independent gains must not be added.

CPU work remains. In the combined 4× case the median largest pre-usable main-thread
task decreased from 1,176 to 969 ms. This implementation does not establish
stall-free opening on slow devices.

## Notice presentation

The final notice preserves a single reveal deadline and remains visible until
the usable surface. The historical notice could re-hide while opening was still
blocked. Consequently the median DOM-visible duration increased even while
usable time improved: 57.4 to 362.1 ms in the expired-Google case, and 245.5 to
1,148.4 ms in the combined 4× case. Corresponding rAF visibility opportunities
were 139.1 to 374.7 ms and 607.2 to 1,201.6 ms. The faster sub-two-second cohorts
had zero visible-duration medians. Raw intervals are retained without bridging
`sr-only` gaps. No shorter-notice-duration or compositor-paint gain is claimed.

## Native opening hashing was rejected

The tested candidate used native SHA-256 plus a required exact-content recheck
after the new await. Its control kept the same other implementation changes and
post-response/activation fences, while using synchronous candidate preparation.
Both were built from `2d085333f2ba3da309116d3b9168adca03816c42`.

| 2,500-video email, 500 ms/RPC | Synchronous median (range), ms | Native median (range), ms | Median paired native − sync, ms |
| --- | ---: | ---: | ---: |
| CPU 1× | 919.4 (891.9–1,014.3) | 907.6 (900.7–943.0) | −11.8 |
| CPU 4× | 1,989.3 (1,908.9–2,011.4) | 1,966.6 (1,891.4–2,074.4) | −33.7 |

Each row contains five pairs. The individual paired differences were
`+12.3, −104.5, −12.9, −11.8, +12.0` ms at 1× and
`−33.7, −23.2, +165.5, −58.2, −36.4` ms at 4×. All twenty openings retained exact
content and identity, made one successful opening RPC, and used the intended
clean-cache path. The median largest pre-usable long task at 4× changed only
from 1,006 to 973 ms. The small and noisy whole-opening improvement did not
justify a new asynchronous authority boundary and extra full-content scan. The
final implementation therefore keeps synchronous candidate hashing.

The experiment's native app SHA-256 was
`2e34df0645935986dd3255d201375b3df29762f906fc51b551f57809aa1abb51`;
the synchronous control was
`47adf98cc18afc29d6ddbf16c7f3280edcfb0574d6742ec5b3aa2fcbe4777077`.
These are experiment artifacts, not the final release identity.

## Separate real-engine comparison

This cohort performs a full cloud installation with 500 videos, fresh email,
500 ms/request and the same populated legacy-v23 island. Its level is supported
by the fixture's actual XP helpers. Both variants require `profile_ready` with
all cached parameters null. Engine/cache state is cold per browser context;
the shared browser/GPU process may warm shaders. Static asset throughput is
local loopback, so these results do not predict cold mobile download time.

| Native-clock milestone | Before median (range), ms | Final median (range), ms |
| --- | ---: | ---: |
| Study usable | 758.3 (748.5–911.2) | 767.2 (743.5–880.7) |
| Restore applied | 2,260.0 (2,164.2–2,743.0) | 2,271.3 (2,144.2–2,482.3) |
| Accepted after Godot `frame_post_draw` | 2,468.2 (2,419.0–3,018.8) | 2,483.1 (2,363.2–2,762.4) |
| Next owner-verified visible host rAF | 2,469.5 (2,423.4–3,027.0) | 2,484.6 (2,364.4–2,764.5) |

The overlapping ranges show no material game-readiness delay in this small local
sample. Restore application is not labeled as first draw. Host rAF is a rendered
frame opportunity, not proof that a compositor displayed it to a person.

The baseline's first migrated-save acknowledgements were
`false, true, true, false, true`; final was `true` in all five runs. The historical
failure occurs when the first real game save overlaps a full profile write. A
separate actual-Godot/IndexedDB regression holds that write and reproduces the
baseline failure deterministically. The final lifecycle waits for prior writes,
then rechecks ownership and repository expectations before saving. The benchmark
does not omit or count the two rejected baseline saves as durable-ready.

Every final run durably stored the exact emitted v38 layout, retained the exact
accepted v23 island before-image, and preserved all study facts and the late
entitlement policy.
Terrain, resources, carried wood, log piles and animal counts were conserved;
legacy inventory grants were allowed only without reducing the original stock.
Final durable acknowledgement occurred at a median of 2,590.3 ms
(2,515.9–2,897.9). A five-run baseline durable-ready median is unavailable because
two initial saves failed.

## Artifact identity

The final main and game comparison used these exact frozen artifacts, rehashed
in full after each run:

| Variant | Source commit | App SHA-256 |
| --- | --- | --- |
| Before | `41cec047f8751099ecf9ae7844bf4342696861f2` | `33c6a07b13b50310ffc9b73916d3c0b757f3664935e883da6e0584656e1ff5f5` |
| Final | `f4987ca8cbab10baf84783fcfb1a86132a0dece7` | `56ffc4cd3c59dfb094eefedca96323a72c88d64d823a61726c3fbec639e695a6` |

Their asset versions are respectively `41cec047f875-p1-g1` and
`f4987ca8cbab-p1-g1`. The compact data pins runner SHA, complete-manifest SHA,
fixture hashes, full raw-file SHA and the exact outcome of every sample. Release
metadata commits may change the displayed release version without changing app
bytes; later hosted proof must verify that distinction explicitly.

## Evidence boundary

The full local evidence bundle is retained outside the checkout as
`profile-opening-plan-2026-10-27/implementation-comparison/`.
It contains frozen sites, source and asset manifests, raw traces, expected-red
controls, preserved failed fixture attempts, and the runner source used for each
run. No real learner records or production backend queries are used. Required CI,
deployment and hosted verification are separate release checks.
