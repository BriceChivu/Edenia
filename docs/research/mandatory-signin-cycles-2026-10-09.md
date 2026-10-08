# Mandatory sign-in session-cycle continuation — 2026-10-09

The selected-account `internal_test=1` trial continues from deployed
`173b305b6e6c350824a2825d502789ee0d4643ba` ([PR #406](https://github.com/BriceChivu/Edenia/pull/406)).
Public mandatory-entry and accountless migration cutover remain outside this
work. Physical-device tests and the public-release 24-hour observation are not
prerequisites for this limited trial; actual macOS Safari acceptance is retained.

## Additional defects reproduced

The installed Supabase Auth SDK `2.110.7` can return from sign-out before deleting
the saved session when an already expired access token first needs a refresh
and that refresh fails transiently. The controller hid the profile, but the
retained refresh token could restore authentication after reconnection/reload.
Both local and global sign-out regressions failed on the durable-session check.

A separate real-SDK regression failed after a definitive refresh-token rejection
with a still-valid cached access token. The controller locked immediately, but
the SDK deliberately retained that access token until its real expiry. Reload
could reopen using the saved session. This matters after global session
revocation even though revocation does not invalidate existing access JWTs.

The repair captures only the current route's three Auth storage slots. On a
failed explicit logout or definitive session rejection, it removes those slots
only while the controller request and exact captured durable values still
match, then uses the public local sign-out operation to notify the SDK and other
tabs. It preserves replacement sessions, profile/sync metadata and other modes.
Transient reverification failures retain their session and verified offline
profile. Refresh callbacks cannot reopen the profile during logout; a new
explicit Google login can supersede an older logout, whose failed global request
must not revoke that replacement through a local fallback.
The SDK's signed-out notification also erased failure feedback. The controller
now retains that failure through its own notification and presents the existing
localized error toast when the remote logout did not succeed.

`tests/contracts/account-auth-session-persistence.test.mjs` exercises the real
SDK with synthetic responses/storage and no hosted credentials. The retained
controller contracts cover delayed events and replacement-login races. Trial
browser regressions exercise expired logout under a 503 outage and durable lock
through reload; the offline/rejection case also checks reload after a definitive
400 rejection. These are transport fixtures, not a hosted service outage.

## Requirement evidence map

| Trial behavior | Evidence and current boundary |
| --- | --- |
| Fresh mandatory entry, ownership before island content | `auth-trial.spec.mjs`, first-profile/access/onboarding suites; previous candidate's full CI passed. |
| Google and email identity continuity | Previous hosted audit verified both methods for the admitted owner. Current deployed Chrome local logout/reload/Google return succeeded without Try again; Safari email CAPTCHA confirmation is pending. |
| Cloud save/open/reload and portable import/export | Exact supplied file imported on the hosted candidate and passed a semantic round trip with all video records, Anki totals and opaque island preserved; see the October 8 report. |
| Offline progress, retry, rejection, pending/queued work | Cloud-persistence/reverification contracts and trial browser suite; current continuation adds durable rejection/logout reload checks. |
| Explicit conflicts, both choices, island restoration and exports | Conflict browser/contracts and both real-Godot handoff cases; prior full CI passed. Queued/expired-acknowledgment regressions are included in #406. |
| Protected import, rollback, reset/Undo and recovery | SQL, lifecycle, import/recovery and trial browser suites; prior real CI database receipt has 30 suites / 1,020 assertions. |
| Owner switches, stale callbacks, local storage failures | Lifecycle, IndexedDB and Godot activation suites; prior browser preservation matrix passed. This continuation adds replacement-session logout fencing. |
| Anonymous/non-admitted denial and per-owner isolation | Authenticated SQL/RLS suites and backend-denied cached-island browser case; no new admission or schema change. |
| Ordinary/mode-2 behavior and retained namespaces | Trial flag and byte-preservation browser suites; public account rollout remains off. |
| Local/global logout and independent browser return | New real-SDK regressions plus deployed Chrome cycle; live Safari/global-session continuation still pending. |

This map distinguishes existing evidence from work still pending. It does not
assert that every possible future device/network state has been tested, or
declare trial acceptance complete while the independent Safari cycle is open.

## Validation checkpoint

The focused Auth contracts currently pass (43 tests), as do 295 profile/cloud
contracts and the bounded focus/reconnect reverification contract. The full-site
build passed after repairing the local native dependencies and reusing a
decompression-verified, unchanged engine compression cache. Browser and CI
verification are in progress. An initial broad contract run raced the empty
build directory and also exposed the local npm optional-native-binding issue;
it is not a passing receipt. The official pinned macOS canvas package was
installed in this worktree only, without changing manifests or the lockfile.

Private reproduction logs, UI screenshots and identities remain in the local
audit directory outside the repository.
