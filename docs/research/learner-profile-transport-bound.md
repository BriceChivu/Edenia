# Learner-profile cloud transport bound

Date: 2026-08-22

## Recommendation

Use **2,097,152 UTF-8 bytes**, exactly 2 MiB, as the version-1 cloud
acceptance bound for the complete canonical portable learner-profile envelope.
Measure the canonical envelope, including its integrity object, before the
request. The client and database must each calculate the same byte count. The
PostgREST RPC wrapper is outside that count.

This keeps the existing number, but for new reasons. The old constant entered
with the portable export work and was then copied into the first-profile and
sync migrations. It was not selected against the current durable profile, the
current browser storage design, or the current Data API path. [Portable-profile
constant](../../src/state/portable-learner-profile.js#L27-L30), [current server
check](../../supabase/migrations/20260821092005_synchronize_learner_profile_progress.sql#L835-L844)

The 2 MiB bound is a product contract, not a claim that browsers, PostgREST, or
PostgreSQL fail at 2 MiB. Current Chromium and WebKit sent 16 MiB through an
ordinary `fetch()` in the local probe described below. PostgreSQL permits a
1 GB field and moves large variable-width values to TOAST storage. [PostgreSQL
limits](https://www.postgresql.org/docs/current/limits.html), [PostgreSQL
TOAST](https://www.postgresql.org/docs/current/storage-toast.html)

Do not reuse the cloud bound as the recovery-export bound. Issue
[#187](https://github.com/BriceChivu/Edenia/issues/187) requires a profile that
is too large for cloud acceptance to remain exportable. Cloud preparation and
server acceptance should receive the 2 MiB limit explicitly. Local recovery
export needs a separate, larger safety limit derived from the largest locally
persistable source document, or it needs to avoid a smaller fixed limit.

## Why 2 MiB is the right initial bound

The measured current profile shape puts 1 MiB too close to ordinary long-lived
use. A deterministic fixture with 1,000 retained videos, one watch-progress
entry per video, three years of Anki days, five channels, and the full 500-row
activity history measured 1,077,932 bytes. A 1 MiB cloud ceiling would already
reject it.

The same fixture shape with 2,000 videos and five years of Anki days measured
1,999,812 bytes. A 2 MiB ceiling accepts it with 97,340 bytes left. Holding the
three-year history fixed, 2,181 videos produced 2,096,694 bytes and 2,182
videos produced 2,097,556 bytes. The exact threshold depends on titles, URLs,
identifiers, and the number of watch-progress entries. Video count is only a
reproducible scale marker.

Raising the bound to 4 MiB buys capacity for the same synthetic shape through
about 4,612 videos, but it fits the current browser design badly. The Storage
Standard assigns `localStorage` a 5 MiB quota. Edenia currently writes the
complete primary state and a sync record containing full pending and queued
candidates to that store. [Storage Standard](https://storage.spec.whatwg.org/#storage-endpoints),
[sync-record write](../../src/integrations/learner-profile-cloud-persistence.js#L202-L227),
[pending and queued candidates](../../src/integrations/learner-profile-cloud-persistence.js#L614-L663)
A single 4 MiB candidate plus its source state cannot fit within that standard
quota. This does not make 2 MiB automatically safe for every queue state, as
described below, but it rules out 4 MiB for the present storage design.

Supabase does not publish a hosted Data API request-body guarantee that Edenia
can use as its product limit. Supabase currently runs PostgREST v14 worldwide.
PostgREST documents JSON-object POST bodies for RPC calls, and its v14
configuration has `db-max-rows` for rows returned by a table, view, or
function, not a maximum request-body setting. [Supabase PostgREST v14
rollout](https://supabase.com/changelog/41288-data-api-upgrade-to-postgrest-v14),
[PostgREST v14 RPC POST](https://docs.postgrest.org/en/v14/references/api/functions.html#calling-with-post),
[PostgREST v14 configuration](https://docs.postgrest.org/en/v14/references/configuration.html#db-max-rows)
The absence of a published larger hosted limit is a reason to stay
conservative, not evidence of unlimited payloads.

Supabase Free currently includes a 500 MB database-size allowance and enters
read-only mode beyond it. Nine 2 MiB documents, one current copy plus eight
full recovery versions, contain 18 MiB of raw canonical JSON before PostgreSQL
storage overhead. That is safe for the one-person canary, but it is not a
public-capacity proof. [Supabase database-size guide](https://supabase.com/docs/guides/platform/database-size),
[Supabase pricing](https://supabase.com/pricing)

## Browser and web-platform evidence

The Fetch Standard applies an aggregate 64 KiB body limit only to requests
whose `keepalive` flag is true. Ordinary requests default to `keepalive: false`.
Edenia's `supabase.rpc()` write is an ordinary awaited POST and does not rely on
page unload. It must stay that way. A full-profile write cannot use
`sendBeacon()`, `fetch(..., { keepalive: true })`, or another unload transport.
[Fetch keepalive processing](https://fetch.spec.whatwg.org/#http-network-or-cache-fetch),
[Edenia RPC pump](../../src/integrations/learner-profile-cloud-persistence.js#L322-L368)

I ran a loopback probe with the repository's pinned Playwright 1.62.0. The
probe launched the installed headless engines, posted ASCII request bodies to
an ephemeral `node:http` server, and returned the number of bytes the server
read. It then binary-searched the largest ASCII value accepted by
`localStorage.setItem()`. [Pinned Playwright](../../package.json#L32-L39),
[configured engines](../../playwright.config.mjs#L75-L92)

| Engine reported by Playwright | Ordinary POSTs received in full | Largest single ASCII `localStorage` value | 64 KiB + 1 keepalive body |
| --- | --- | ---: | --- |
| Chromium 151.0.7922.34 | 2, 4, 8, and 16 MiB | 5,242,875 characters | Failed |
| WebKit 26.5 | 2, 4, 8, and 16 MiB | 5,242,875 characters | Failed |

The five missing characters from 5 MiB are the `probe` key. This is engine
evidence, not branded Chrome or Safari production proof and not a hosted
Supabase measurement. It proves that 2 MiB is below the current ordinary-fetch
capability in both browser engines Edenia tests. It also reproduces the
Storage Standard's 5 MiB local-storage budget and the Fetch Standard's
keepalive failure.

The probe was a self-contained `node --input-type=module` command. It imported
`chromium` and `webkit` from `@playwright/test`, started `node:http` on an
ephemeral loopback port, and ran this browser-side core for each engine:

```js
for (const mebibytes of [2, 4, 8, 16]) {
  const body = 'x'.repeat(mebibytes * 1024 * 1024)
  const response = await fetch('/upload', { method: 'POST', body })
  const { bytes } = await response.json()
  if (bytes !== body.length) throw new Error('short request')
}

localStorage.clear()
// Binary-search the largest N for which this succeeds.
localStorage.setItem('probe', 'x'.repeat(N))

await fetch('/upload', {
  method: 'POST',
  body: 'x'.repeat(64 * 1024 + 1),
  keepalive: true
})
```

## Current Edenia measurements

No browser profile or user data was read. I generated states from the current
`createDefaultStateFactory()`, populated only fields consumed by the current
portable-profile normalizer, and passed each state through
`createPortableLearnerProfileEnvelope()` with a temporary 64 MiB measurement
ceiling. The measured value is the UTF-8 byte length of the returned canonical
`serialized` string. [Envelope construction and byte
measurement](../../src/state/portable-learner-profile.js#L509-L564), [portable
field boundary](../../src/state/portable-learner-profile.js#L480-L489)

Every generated video was retained study data. It had current rich video
metadata, `status: 'watched'`, and one watch-progress entry. Activity history
used the code's 500-entry maximum. Anki history used one observation per day.
All timestamps and strings were deterministic. The RPC measurement wrapped the
envelope in the five parameters sent to `commit_my_learner_profile` and measured
`JSON.stringify()` with `Buffer.byteLength()`.

| Fixture | Contents | Canonical envelope | Complete RPC JSON | Source local state |
| --- | --- | ---: | ---: | ---: |
| Fresh | Default state with an owned learner profile | 1,046 B | 1,208 B | 1,693 B |
| Active | 250 videos, 365 Anki days, 500 activity rows, 5 channels | 372,487 B | 372,649 B | 346,152 B |
| Long-lived | 1,000 videos, 1,095 Anki days, 500 activity rows, 5 channels | 1,077,932 B | 1,078,094 B | 971,386 B |
| Very long-lived | 2,000 videos, 1,825 Anki days, 500 activity rows, 5 channels | 1,999,812 B | 1,999,974 B | 1,786,806 B |
| Last generated case below 2 MiB | 2,181 videos, 1,095 Anki days, 500 activity rows, 5 channels | 2,096,694 B | 2,096,856 B | 1,866,143 B |
| First generated case above 2 MiB | 2,182 videos with the same histories | 2,097,556 B | 2,097,718 B | 1,866,900 B |

The repository's hand-authored database fixtures are much smaller. The blank
first profile declares 993 bytes, mixed-case canonical-order fixture 996 bytes,
and complete one-video fixture 2,242 bytes. [First profile
fixture](../../supabase/tests/learner_profile_progress_sync.test.sql#L31-L35),
[complete fixtures](../../supabase/tests/learner_profile_progress_sync.test.sql#L214-L233)

To reproduce the scale table, create a default state with no default channels,
add the listed deterministic channels, videos, Anki days, and activity rows,
then run:

```js
const result = await createPortableLearnerProfileEnvelope(state, {
  maxBytes: 64 * 1024 * 1024,
  now: () => new Date('2026-08-21T12:00:00.000Z')
})

const envelopeBytes = Buffer.byteLength(result.serialized)
const rpcBytes = Buffer.byteLength(JSON.stringify({
  p_base_revision: 1,
  p_envelope: result.envelope,
  p_generation: 1,
  p_operation_id: '11111111-1111-4111-8111-111111111111',
  p_profile_id: '22222222-2222-4222-8222-222222222222'
}))
```

For boundary discovery, hold channels and histories fixed, vary the video
count with a binary search, and compare `result.byteLength` with `2 * 1024 *
1024`. Exact-boundary contract tests should add a controlled filler string to a
canonical text field. Whole-video increments will usually jump across the
boundary.

## Storage caveat that implementation must handle

At the last generated case below 2 MiB, the primary local state plus one full
candidate uses about 3.78 MiB before sync metadata. That fits the 5 MiB
`localStorage` result. The primary state plus both a pending and queued
candidate uses more than 5.78 MiB before metadata and cannot fit.

This means no byte bound near 2 MiB can make the present two-candidate
`localStorage` queue infallible. The implementation must preserve the local
study write before it attempts cloud preparation or queue storage. If the
profile is oversized, corrupt, unsupported, or the sync record cannot be
written, it must retain the current local state, retain the last accepted cloud
head, stop automatic retries, and show `Not backed up`. Retry and recovery
export remain available.

If Edenia later requires two full max-size candidates to survive reload, move
the durable queue to IndexedDB or redesign it so only one full candidate needs
to be retained. Raising the cloud limit while keeping two full candidates in
`localStorage` is not safe.

## Contract implications

1. Define a cloud-envelope limit named for cloud acceptance. Do not silently
   inherit the general portable-file default.
2. Count canonical UTF-8 envelope bytes, not JavaScript string length,
   PostgreSQL `jsonb` disk size, or the HTTP `Content-Length` of the RPC wrapper.
3. Accept exactly 2,097,152 bytes and reject 2,097,153 bytes on both client and
   server.
4. Recompute canonical content, schema/version support, byte length, and
   SHA-256 independently in PostgreSQL before changing a head, version, or
   idempotency receipt.
5. Keep full-profile upload on an ordinary awaited RPC POST. Never move it to
   unload, beacon, deferred-fetch, or keepalive transport.
6. Keep recovery export available when the cloud-specific 2 MiB check fails.
7. Treat storage quota failure, malformed JSON, unsupported schema, integrity
   mismatch, oversize, and provider rejection as lossless `Not backed up`
   outcomes. None may truncate or compact the portable profile.
8. Re-measure real profile percentiles and PostgreSQL relation size before
   public rollout. The synthetic fixtures establish scale, not a user
   distribution.
