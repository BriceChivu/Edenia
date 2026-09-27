# New-upload checks (#337)

Implementation base: `a9c14ef5f501bcae97fbb6bce5c68f3297e1e040`, the successful
Pages deployment inspected on 2026-09-27. This includes #336, whose production
behavior scanned saved pages until it found 50 unseen IDs. The user's Pip story
checkout was left untouched. Ship this correction independently; #341 consumes
the retained history cursor after #338 and #340 are also ready.

New-upload checks keep the hourly schedule and 30-minute failure backoff. An
initial channel fetch takes one 50-item page. Successful checks retain a head
boundary separately from saved video identities; manual additions cannot create
coverage. Legacy profiles use non-manual saved identities only when they have a
successful channel refresh timestamp. No records are deleted during migration.

Each catch-up uses at most three playlist requests. Continuations retain the last
page's token and identities and re-read that overlap after reload. If playlist
changes invalidate overlap, restart within that same allowance. A transient
failure leaves persisted coverage unchanged. Coverage advances only with the
video merge; account activation guards remain in place. New uploads arriving
during catch-up are found from the head after catch-up completes. Extremely
unstable playlists may take additional hourly checks. History cursors are
retained but no automatic history expansion or new browsing behavior is added.

Provider metadata is timestamped separately and reused for 29 days; missing or
future timestamps require refresh. Maintenance batches saved video IDs in groups
of 50 through videos.list, independently of playlist traversal. Legacy libraries
therefore incur a one-time metadata refresh. Channel snippets use channels.list
batches, and manual additions reuse valid channel metadata. Maintenance also runs for manual-only libraries and has its own 30-minute
failure backoff. At 30 days, provider fields expire even if refresh fails; opening
an expired local cache clears those fields. Undated legacy metadata is refreshed
on first online use and cleared if that attempt fails. Unavailable video and
channel responses clear provider metadata, including duration and images, while
keeping identities and learner-owned study records. Missing provider duration is
zero (unknown), so existing resume positions and coverage are not truncated. Learner status, progress, coverage, favorites, Watch later and removal
state retain the existing merge protections.

## Mocked request counts

For one channel with valid metadata (no live YouTube requests):

| Scenario | playlistItems.list | videos.list | channels.list | search.list | videos.insert |
| --- | ---: | ---: | ---: | ---: | ---: |
| Unchanged 7,000 saved uploads | 1 | 0 | 0 | 0 | 0 |
| Three newly published uploads | 1 | 1 | 0 | 0 | 0 |
| 70 newly published uploads | 2 | 2 | 0 | 0 | 0 |
| Initial 50 uploads, fresh channel metadata | 1 | 1 | 0 | 0 | 0 |
| Manual new video, fresh known channel | 0 | 1 | 0 | 0 | 0 |
| 151 stale saved video metadata records | 0 | 4 | 0 | 0 | 0 |

With 7,000 saved uploads and at least 50 older unseen uploads, the investigated
production implementation needed 141 playlist requests plus one video-detail
request per unchanged check. With valid metadata this becomes one playlist
request, a reduction from 142 to 1 combined-bucket units. A completely stale
7,000-video cache still requires 140 metadata requests, once per maintenance
cycle; those are not older-upload retrieval.

The [current quota documentation](https://developers.google.com/youtube/v3/determine_quota_cost)
places playlistItems.list, videos.list and channels.list in the combined bucket
at one unit each. search.list and videos.insert have separate daily allocations;
this change spends zero in either bucket. Key names do not prove separate
projects or allocations. No quota, key configuration or account rollout gate is
changed. The 29-day refresh interval follows the refresh-or-delete requirement
in [YouTube's data storage policy](https://developers.google.com/youtube/terms/developer-policies#e.-handling-youtube-data-and-content).

## Validation

- Mocked contracts cover large histories, new uploads, continuation after reload,
  duplicate IDs, playlist shifts, structured invalid cursors, transient failures,
  metadata batching/expiry, manual-only libraries and inactive-profile fencing.
- Browser checks cover three and 370 new uploads with reload between hourly
  continuations on desktop and phone, plus channel entry and video organization:
  21 passed, 9 intentionally skipped for non-applicable viewport scenarios.
- `npm test` passed: contracts, backend unit tests and Edge Function typechecks.
- Standards and specification reviews ran independently. Their findings about
  retry backoff, cursor error reasons, metadata expiry and timestamp provenance
  were repaired and received regression coverage.
