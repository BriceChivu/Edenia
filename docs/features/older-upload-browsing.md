# Older-upload browsing

Channel shelves first browse their saved library. A forward browsing gesture near
its end starts one history attempt. Initial rendering and status-only views
(In progress, Watch later, Favorite, Watched, Removed) never request unknown
history. Hourly new-upload checks remain independent.

Each attempt permits at most **five playlist requests**, including validation
and recovery requests. Missing video metadata is requested in batches of 50;
fresh cached details are reused. Both formats are saved, even when only one is
visible. A batch with no new matching cards waits 30 seconds before automatically
continuing. Repeated events at the same position do not bypass that delay.
History loading has no inline messages or continuation button. Automatic retries
run only in a visible tab while the shelf is on screen near its saved boundary;
leaving that boundary or shelf pauses retries until browsing resumes.

`channelRefreshes[channelId].coverage.history` retains the last saved page token,
its identity anchors, its next token, and confirmed exhaustion. Every attempt
re-reads its last page to validate overlap before advancing, then revalidates
each preceding page before saving the next cursor. A stable attempt adds up to
100 uploads. Changed pages, lost overlap, or an invalid cursor trigger a restart
from the head within the same allowance. Recovery itself
is resumable, so a large changed playlist can take multiple browsing attempts.
Cursors are saved with the merged records, never ahead of missing metadata.

Failures retain cards and the last successful cursor. Transient failures start
with a 30-second wait and back off on consecutive failures up to five minutes.
Daily quota failures use the shared YouTube gate's Pacific reset. Quota
explanations remain solely in the activity log. Retries run automatically after
the cooldown, which survives reload; after a reload, browsing starts them again.
Same-origin Web Locks prevent simultaneous history attempts for the same channel; the existing request gate coordinates
provider calls and quota cooldowns. Browsers without Web Locks retain in-tab
single-flight protection but cannot provide cross-tab exclusion.

History completion merges into the latest learner profile. A profile that has
been left or replaced cannot receive the response. Hourly checks also merge into
the latest state so either completion order retains the complete library.
