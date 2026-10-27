# Reduce verified profile opening time

Reduce the time from navigation to a usable, owner-verified study experience by
removing optional authentication work and hidden Settings work from profile
opening. Keep recovery, current cloud state, reset boundaries and durable local
progress protected. Start with the two demonstrated client changes; do not begin
with a new profile protocol or optimistic activation.

This proposal is based on `41cec047f8751099ecf9ae7844bf4342696861f2` and local
experiments performed on October 27, 2026. Production application behavior has not
been changed by this investigation. All browser profiles and Auth/RPC responses
were synthetic; real backend and analytics traffic was blocked.

## Define success by usable progress

The primary measure is navigation to the first rendered-frame opportunity with
the correct active owner, the expected study facts, the appropriate study or
onboarding surface, and working controls. Also retain opening start, Auth ready,
local storage ready, opening RPC start/end, activation and first usable frame.
Measure game readiness separately so that accelerating study does not silently
delay Tiny Swords.

Record notice visibility as a secondary presentation measure. The current notice
appears after two seconds. A subsequent `waiting-cloud` render can make it
`sr-only` again and restart the delay. In addition, lifecycle activation hides
the notice before application rendering necessarily finishes. A shorter
text-visible interval can therefore accompany a longer blank or blocked wait.

Group results by clean cached opening, cloud installation, dirty local reopening,
Auth provider/signing path, token freshness, profile size, backup-bank size and
CPU setting. Never average `profile_unchanged` and full `profile_ready` samples
as though they exercised the same path.

## What the tests established

The main browser tests used native Chromium clocks, 500-video and valid
2,500-video profiles, and controlled per-request delays. The large normalized
profile was below the existing 2 MiB cloud limit. An initial oversized fixture
was rejected correctly and excluded from performance results. Loopback mocked
responses model latency, not real Internet throughput.

| Experiment | Result | Consequence |
| --- | --- | --- |
| Clean email reopening, 500 videos | About 288 ms at 100 ms/request and 734 ms at 500 ms/request; one opening RPC | The normal clean path already combines profile and reset checking. Another generic request-combining layer is not the first opportunity. |
| Fresh Google reopening, 500 videos, 500 ms/request, three alternating pairs | 1,226.1 ms stock versus 688.3 ms with optional claims classification deferred, about 44% less time | Remove the optional claims wait from the foreground path. |
| Expired Google reopening, 2,500 videos, 1,000 ms/request, three alternating pairs | 3,520.9 ms versus 2,513.5 ms, about 29% less time | Token refresh remains required; optional classification can overlap the opening RPC. |
| Five admitted backups totaling about 7.0 MB | After one native bank read, hidden-list rendering serializes/parses the bank eight times. The prototype performs zero list traversals before usable display; first Settings opening shows the newest four entries and Show older exposes all five | Defer list construction while preserving backup initialization and restore safeguards. |
| Filled-bank tail at normal CPU and 4x emulated CPU, one pair per setting | Post-bank-event to usable frame: 141.0 to 44.9 ms and 701.4 to 187.7 ms | The hidden-list work is measurable. These are scoped tail measurements, not whole-navigation or physical-phone speed promises. |
| Expired-session refresh and backup readiness each held for 800 ms | Session-only prewarming changed usable time from 1,720 to 876 ms; one token refresh and one opening RPC remained | Independent waits can overlap. The injected saving does not establish the normal-device benefit. |
| Actual offline video checkpoint followed by online reopening | Resume 40 survived both runs. The request sent no clean-cache claim and returned 500,334 bytes, versus 318 bytes for the corresponding clean response | Dirty reopening is a separate case. It must not be treated as a clean cache hit. |

All twelve measured Auth A/B openings retained the expected owner and video
count and completed exactly one profile-opening RPC before usable display. The
candidate did not remove the SDK's token refresh or its claims requests; it
removed the dependency that made classification block opening.

The pinned SDK uses an Auth-server lookup for symmetric-key `getClaims`.
Asymmetric signing with a warm JWKS cache can avoid that network leg. The tested
gain therefore depends on the signing/request path. Edenia currently uses the
claims result to classify the sign-in method; claims failure or a nonmatching
subject still publishes the same session identity. This is not permission to
authorize profile access from `getSession`: authenticated server resolution
remains the activation barrier. See the
[Supabase claims reference](https://supabase.com/docs/reference/javascript/auth-getclaims).

## Implementation sequence

### 1 Make the opening attempt measurable and its feedback consistent

Use one opening attempt across resolving, migration and waiting for cloud state.
Preserve its initial reveal deadline and keep an already-visible notice visible
until a usable verified surface or a terminal recovery/authentication/conflict
outcome is presented. Reset the attempt on an explicit new attempt or retired
owner. Reuse the existing render epoch and timer-generation fences.

Coordinate dismissal with the app's usable surface rather than lifecycle
`ACTIVE` alone. Include unfinished onboarding, retryable errors, sign-out and
owner replacement so no route can strand the notice or expose inactive content.
This corrects feedback; it must receive no credit as a latency improvement.

Capture bounded local diagnostic timings and outcome categories using existing
health/diagnostic facilities. Do not capture session tokens, owner identifiers,
email, titles, history, full payloads or credentials. A phase change and a size
bucket are sufficient. Keep these measurements behind the existing trial.

### 2 Remove the optional claims dependency

Change the Auth controller to publish the result of the existing SDK session
lookup without waiting for optional sign-in-method classification. Continue
waiting for actual token refresh when the SDK requires it, including explicit
reverification. Profile opening still awaits the authenticated server response
and all existing local activation fences.

Enrich only `authMethod` when classification finishes. Fence that result by
request epoch, exact access token, owner, sign-out and controller destruction.
Do not call `synchronizeSession` again for a label update. Coalesce duplicate
classification requests for the same token if possible.

Separate label updates from the app's broad identity-change side effects.
Changing a label must not start another profile resolution, recreate account
controllers or rescan reminder/study history. Preserve existing Settings labels
and their fallback when classification fails.

### 3 Stop preparing hidden Settings content

Guard backup-list construction before calling `getStateBackupEntries`. Preserve
the current recovery-journal read, backup repository initialization/admission,
primary profile verification and protected restore/import behavior.

Move the initial Settings backup render after the Settings shell becomes visible;
the current `openSettings` calls it before opening the shell, so a visibility
guard alone is incorrect. Keep visible Settings fresh after saves/restores and
retire stale owner/render callbacks. Verify first opening, collapsed/expanded
lists, Show older, protected conflicts, Undo and restore/export controls.

Use a locale-aware cached `Intl.NumberFormat` for history point formatting,
recreating it when the locale changes. Preserve every formatted string and
rounding rule. The isolated kernel test matched 180 outputs, including locale
switching, and reduced 1,000 formats from 6.0 to 0.3 ms at normal CPU. This is a
small component improvement, not an application-wide multiplier.

### 4 Reduce measured CPU work without dropping integrity checks

A clean large-profile trace at 4x emulated CPU reached usable display at about
2.26 seconds despite a 500 ms opening response. It included a 1.07-second
post-response main-thread task. Hashing, cloning/canonicalization and repeated
number formatting were more prominent than feed rendering; broad feed
pagination is not justified as the first CPU change.

Evaluate the existing async Web Crypto SHA-256 helper at opening seams that are
already asynchronous. An isolated 1.87 MB canonical-payload test produced the
identical digest in all twelve runs: 22.0 versus 2.7 ms at normal CPU, and 200.5
versus 8.8 ms at 4x emulation. Native crypto runs outside the throttled renderer,
so the 4x ratio is not a physical-phone prediction. Canonicalization costs remain.

Start with opening candidate preparation; do not globally make synchronous save,
receipt or recovery APIs asynchronous. Recheck the owner, request, durable
bookkeeping and actual candidate content after each new await and before issuing
or applying a request. Retain post-response content/reset/activation checks and
the existing unsupported-environment behavior. A digest cached only by revision
is insufficient.

Profile repeated normalization/serialization before attempting a shared snapshot
cache. Any reuse must have exact immutable content and mutation/activation
fences; untracked mutable objects cannot safely authorize a cached digest. Keep
necessary normalization, channel-membership transitions and durable installation
before interaction.

### 5 Overlap session preparation only where it matters

If real phase timings show token refresh and local storage preparation both
contributing, prewarm only the existing singleton SDK client's session I/O after
recovery-journal readiness, while backup and primary storage preparation proceed.
Leave lifecycle start, profile resolution and activation behind the local safety
barrier.

Do not call the full `initializeAccountAuth` early: it creates UI, migration,
reminder and analytics controllers and is not an idempotent prefetch primitive.
The normal controller must read current SDK state after the barrier; never replay
an old captured session as authority. Handle prewarm rejection without an
unhandled promise, forced extra refresh or false sign-out. Test sign-out,
replacement, token refresh and permanent/transient failures during the overlap.
For a fresh session and a small empty bank, this change may save almost nothing.

## Ideas to defer

| Idea | Why it is not in the first implementation |
| --- | --- |
| Increase the two-second notice delay or hide it sooner | Changes the symptom while leaving usable study blocked. The current re-hide defect already demonstrates this false improvement. |
| Immediately activate a cached profile on the normal online path | Changes ADR 0001. It can expose an old generation after remote Start-over and allow edits before current-state reconciliation. Existing offline/outage fallback does not make pre-response online activation equivalent. |
| Replace the notice with a read-only cached island | May improve orientation but does not make study or gameplay usable; it also needs an explicit privacy/freshness policy. |
| Remove journal/backup readiness or force a short timeout | Those stores can contain acknowledged recovery evidence. Defer their hidden UI, not the safety decision. |
| Rewrite authentication through a new proxy or rotate signing keys just for speed | Much broader operational scope than removing a classification dependency; the tested client change preserves current server authorization. |
| Defer all game assets or rebuild all rendering in a worker | No measured bandwidth-contention case justifies that tradeoff, and delaying assets may worsen island readiness. Native crypto and avoidable hidden work are smaller first steps. |
| Treat matching revision as cache proof | Violates exact-content checks and can lose unqueued edits or accept damaged state. |

If full responses for dirty reopening remain a dominant measured cost, explore a
separate conditional proof over its **known accepted base**, while retaining the
dirty local profile and immutable pending requests. It needs a distinct response
contract and an ADR amendment; it is not `profile_unchanged` for a dirty body.
The verified current authoritative head must match that base's profile,
generation, revision and content. Finding a matching older retained version is
insufficient. Newer cloud progress requires full reconciliation and receipt
handling. Unknown bases, changed generation/replacement, import/recovery/conflict
state, and mismatched hashes must retain the full resolver. Measure bandwidth
using a real local streaming fixture, since the current mocked-latency results
do not model transfer time.

Consider a cheaper server unchanged check only after browser work is measured.
The current small response still follows materialization/validation and hashing.
Any optimization must preserve current-record authority, corrupt-state fallback,
reset receipts and legacy-writer compatibility. Do not add full-profile hashing
to every five-second typed commit, substitute a lagging snapshot, or trust cached
trial admission to obtain a faster read. An available Undo receipt can also
contain a full prior envelope; lazy retrieval is a separate protected-operation
protocol change rather than a field to omit.

## Acceptance and release

Implement the claims change and hidden Settings work as small, separately
reviewable changes, with the notice/measurement correction first. Keep the
existing restricted trial and compatible readers; evaluate native hashing and
session overlap separately after their additional asynchronous fences are tested.
No database migration or new activation policy is needed for the first changes.

- Prove the correct owner, profile, generation and study/island facts on every
  opening. Include valid fresh/expired email and Google sessions, claims
  failure/late completion, sign-out and owner changes.
- Cover clean existing IndexedDB, first cloud installation, durable dirty edits,
  in-flight/lost receipt, protected conflicts, reset/Undo, migration, corrupt
  local state, recovery journals and storage failure. Preserve each branch's
  terminal outcome and all locally acknowledged edits.
- Keep exactly one successful profile-opening RPC on the normal clean path.
  Label enrichment must cause zero extra resolutions or study-history scans.
  Keep archive availability checks, and perform zero hidden backup-list traversals
  before usable display; first Settings opening must show the correct entries.
- Run the affected contracts and Chromium/WebKit behavioral cases, then required
  repository CI. Use fake clocks for control-flow tests and native clocks for
  performance. Do not put machine-dependent millisecond assertions in CI.
- Repeat at least five alternating before/after pairs with identical valid
  fixtures and exact source/asset hashes. Record clean/full/dirty eligibility,
  request parameters/outcomes, response bytes, actual maintenance acknowledgement,
  long tasks and first usable frame. Do not assume a flush of currently pending
  writes also waits for maintenance that has not started yet.
- Retest the two demonstrated Google cases. Seek gains on the order of one
  classification round trip, with no healthy-email or empty-bank regression.
  Test the combined slow-network/large-profile/filled-bank case; do not add
  savings from independent experiments or present them as a production SLA.
- Check a real phone with a bounded privacy-safe phase trace before claiming
  the user's actual delay is explained. Track useful study and game readiness,
  not only the notice. Roll out through the current trial and retain a simple
  client rollback; owner/generation/content fences stay enabled.

## Evidence

The local evidence bundle is
`/Users/brice/Documents/Coding/Edenia-audits/profile-opening-plan-2026-10-27/`.
It contains raw samples, corrected metrics, source/asset hashes, reversible
prototype patches, expected-red controls and reproducible commands.

- `browser-baseline/baseline-report.md`: 16 valid ordinary opening samples, eight
  Auth-path samples, and a 2,500 ms RPC control that reproduces the visible wait.
- `browser-baseline/auth-prototype-report.md`: twelve actual-browser A/B openings
  and the corrected notice-visibility intervals.
- `browser-baseline/dirty-opening-report.md`: two actual durable dirty reopens.
- `browser-baseline/cpu4-report.md`: two diagnostic samples, explicitly separated
  because one used the unchanged path and one used full installation. The exact
  reason for the second path cannot be reconstructed from that probe; no clean
  average or product regression is inferred.
- `server/manifest.json` and `server/ranked-plan-review.md`: 59 existing contract
  checks, twelve candidate invariants, SDK behavior and adversarial review.
- `render/cross-probe-summary.json`: causal UI/storage holds, session overlap and
  admitted populated-bank tests, including the first Settings-opening assertions.
- `notice-reentry-probe.json`: the existing view re-hides after revealing; the
  minimal external candidate preserves one reveal deadline and resets on a new
  attempt.
- `kernel-probes.json`: exact formatting comparisons and matching native/manual
  SHA-256 results, with kernel-only timing boundaries.

The production application, database, release configuration and learner records
were not changed by these experiments.
