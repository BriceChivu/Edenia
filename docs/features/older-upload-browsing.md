# Older-upload browsing

Channel shelves first browse their saved library. A forward browsing gesture near
its end starts one history attempt. Initial rendering and status-only views
(In progress, Watch later, Favorite, Watched, Removed) never request unknown
history. Hourly new-upload checks remain independent.

Each attempt permits at most **three playlist requests**, including validation
and recovery requests. Missing video metadata is requested in batches of 50;
fresh cached details are reused. Both formats are saved, even when only one is
visible. A batch with no new matching cards pauses at **Continue browsing**.
Repeated events at the same position do not automatically start another batch.

`channelRefreshes[channelId].coverage.history` retains the last saved page token,
its identity anchors, its next token, and confirmed exhaustion. Every attempt
re-reads its last page to validate overlap before advancing. Lost overlap or an
invalid cursor restarts from the head within the same allowance. Recovery itself
is resumable, so a large changed playlist can take multiple browsing attempts.
Cursors are saved with the merged records, never ahead of missing metadata.

Failures retain cards and the last successful cursor. Transient failures wait
30 seconds; daily quota failures use the shared YouTube gate's Pacific reset.
Quota explanations remain solely in the activity log. Retry is available after
the cooldown, which survives reload. Same-origin Web Locks prevent simultaneous
history attempts for the same channel; the existing request gate coordinates
provider calls and quota cooldowns. Browsers without Web Locks retain in-tab
single-flight protection but cannot provide cross-tab exclusion.

History completion merges into the latest learner profile. A profile that has
been left or replaced cannot receive the response. Hourly checks also merge into
the latest state so either completion order retains the complete library.
