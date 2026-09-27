# YouTube quota recovery

Edenia gates all YouTube Data API reads through one browser request adapter. A structured `quotaExceeded` or `dailyLimitExceeded` response suspends that bucket until the next midnight in `America/Los_Angeles`, including daylight-saving transitions. Other provider errors retain their HTTP status and reason list and follow the existing retry behavior.

The [official quota documentation](https://developers.google.com/youtube/v3/determine_quota_cost) and [search.list reference](https://developers.google.com/youtube/v3/docs/search/list), checked September 27, 2026, specify separate daily buckets for search.list and videos.insert; other endpoints share the general bucket. Edenia only reads, so its gate separates search from channels, playlistItems, and videos reads. Embedded playback does not use this gate.

Cooldowns live outside learner progress, scoped to the existing runtime storage namespace. Same-origin tabs coordinate through Web Locks and read persisted cooldowns before sending requests. Browsers without Web Locks still serialize within a tab and observe cooldowns written by other tabs, but simultaneous first requests across tabs can race. If storage is unavailable, only in-memory protection survives. This protects cooperating browser callers after an error; it is not a project-wide allocator, quota increase, or guarantee against quota consumption by other callers or browsers.

Quota explanations use the existing activity log. Failed manual video/channel resolution retains the input. Saved study state and playback remain available. Normal metadata retention rules still apply independently of quota. Refreshes complete a channel's required metadata before accepting that channel's result, preserving earlier successful channels when a later one fails. A failed channel retains its prior coverage and can retry after reset.

Validation covers Pacific spring/fall boundaries, provider-reason classification, concurrent callers, reload, multiple tabs, isolated buckets, explicit additions, saved playback/progress, partial refreshes, and transient recovery with mocked provider responses.
