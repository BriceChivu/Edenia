# Internal canary exploratory test record — 2026-09-04

## Scope and safety boundary

- Local mutation environment: `http://localhost:8000/?internal_test=1`, current checkout `4b48df6c0519`.
- Hosted read-only progress environment: `https://www.edenia.study/?internal_test=1`, deployed commit `018d256beac9910cfdbccc1da7ac725d4e88d166`.
- The ordinary hosted root was not opened.
- Hosted actions were limited to page opening, Google authentication, profile-opening retry, reload, and sign-out. No hosted channel, video, history, reminder, import, restore, or Start over action was used.
- Before and after testing, the hosted learner-profile head remained generation 4, revision 2, with 88 retained versions.
- Reminder delivery stayed disabled. Reminder preference toggles were exercised only against local Supabase and restored to their original enabled state.
- No issue was created or modified during this pass.

## Automated baseline

`npm run test:ci` passed before exploratory testing:

- 1,385 contract tests passed.
- 139 shared backend/function tests passed.
- Deno checks passed.
- Playwright: 311 passed, 798 intentionally skipped, 0 failed.

This is only a regression baseline. The defects below were found by operating the actual interfaces.

## Confirmed defects

### 1. Hosted signed-in profile opening is stuck on generic recovery

- Impact: blocks the approved internal canary account from reaching its town on the deployed internal route.
- Existing issue: [#286 — Internal-test signed-in profile opening can remain stuck in generic recovery](https://github.com/BriceChivu/Edenia/issues/286).
- Environment: hosted internal route, Chrome.
- Reproduction:
  1. Open the exact internal route.
  2. Sign in with the approved Google account.
  3. Observe `We need to check your progress`.
  4. Select `Try again`.
- Actual: the same generic recovery screen returns. Signing out, signing in again, and retrying reproduces the failure.
- Expected: activate the valid cloud town or present an actionable trusted recovery path.
- Evidence: Google authentication returned HTTP 200; `resolve_my_learner_profile` returned HTTP 200 on every attempt. A read-only database shape check found the current envelope has the expected five top-level keys, schema/version, object profile, SHA-256 metadata, 43-character digest, and matching row digest/byte-length metadata. The failure therefore occurs after successful authentication and profile resolution, in the client-side profile-opening path.
- Current checkout: the branch includes focused coverage for opening a valid cloud town past malformed durable metadata; that fix is not in the deployed release identified above.

### 2. Google sign-in rejects the approved localhost canary origin

- Impact: blocks local-to-hosted Google canary testing while the email-code fallback remains usable.
- Environment: localhost internal route temporarily configured with the hosted public Supabase/Google settings.
- Reproduction:
  1. Open the locked internal route on localhost.
  2. Select `Open sign-in`.
  3. Select the official Google button.
- Actual: the control produces no sign-in flow. Google logs `[GSI_LOGGER]: The given origin is not allowed for the given client ID.`
- Expected: the approved local test origin opens the Google account chooser.
- Likely owner: Google Web client authorized-JavaScript-origin configuration, not the learner-profile database.

### 3. `Later` does not dismiss a failed accountless-backup notice

- Impact: an accountless learner remains blocked by `Not backed up yet` even after choosing the offered deferral action.
- Environment: deployed internal route in the in-app browser, with an existing accountless internal-test town and a persisted failed backup attempt.
- Reproduction:
  1. Open the hosted internal route in that browser profile.
  2. Observe `Not backed up yet` with `Try backup again` and `Later`.
  3. Select `Later`.
- Actual: the notice remains fully visible and interactive. A second semantic click reproduces the no-op.
- Expected: dismiss/snooze the notice and leave the local town usable.
- Likely code cause: `later()` preserves a `backup-failed` attempt, and `publish()` gives any attempt precedence over `nextNoticeAt`, so the view immediately remains `backup-failed`.
- Safety note: `Try backup again` was deliberately not selected because it could upload or replace hosted progress.

### 4. Hidden heatmap tooltip remains exposed to assistive technology

- Impact: screen-reader users can encounter stale details from a heatmap day after leaving the Heatmap view.
- Environment: localhost internal route.
- Reproduction:
  1. Open Study History → `Heatmap`.
  2. Select a day to open its details.
  3. Return to `Summary`.
- Actual: the tooltip becomes visually transparent (`opacity: 0`, `pointer-events: none`) but remains `display: block`, visible in the accessibility tree, and contains the previously selected day's details.
- Expected: a dismissed tooltip is removed from the accessibility tree or emptied.
- Likely code cause: `hideHeatmapTooltip()` only removes the `show` class and leaves populated content without `hidden` or `aria-hidden` state.

### 5. Local email sign-in falsely requires a security check

- Impact: misleading/blocking-looking guidance in the supported local sign-in flow.
- Environment: localhost internal route with no Turnstile site key/controller configured.
- Reproduction:
  1. From the locked profile gate, select `Open sign-in`.
  2. Observe the email form.
- Actual: the form says `Complete the security check to continue.` even though no challenge is rendered and `Email me a code` is enabled. Requesting and verifying a local code succeeds.
- Expected: no Turnstile status copy when Turnstile is not configured.
- Likely code cause: Turnstile synchronization iterates the hidden placeholder even when no controller exists, treats it as `pending`, and unhides the pending status.

### 6. `Start over` can no-op while the profile is presented as synchronized

- Impact: a learner can confirm the destructive action, return to the town, and still have the profile they explicitly asked to reset.
- Environment: localhost internal route, signed in to local Supabase. The profile already had an older protected Start-over generation available for Undo.
- Reproduction:
  1. Wait for the header to report `Up to date`.
  2. Open Settings and select `Start over`.
  3. Confirm the warning with the second, destructive `Start over` control.
  4. Reload the page.
- Actual: the same September 1 Anki history and Study Insight remained after reload. No `start_over_my_learner_profile` request appeared in the local Kong access log, no reset receipt was created on September 4, and the cloud head remained in generation 11. The next ordinary reload sync advanced only revision 21 to 22 while retaining one Anki study-day object.
- Expected: generation 12 revision 1 with a blank portable profile and a new protected reset receipt.
- Tight persisted-state check: the post-action verifier returned `11|22|1|0` rather than expected `12|1|0|1` for generation, revision, Anki-day count, and reset-receipt count for the day.
- Likely boundary: the client returned before calling the RPC. `canReplaceSynchronizedHead()` can reject on stricter sync-record, queued-work, or dirty-record checks than the visible header communicates, but the exact rejecting condition was not available after reload and is not claimed as proven.
- Coverage gap: the automated Start-over flow covers one reset followed by its Undo; no focused test was found for starting over again while an older reset remains protected.
- Recovery check: selecting `Undo Start over` restored the pre-existing August 31 protected version successfully. The local RPC returned 200, the reset became `undone`, the head advanced to generation 11 revision 23, and a reload retained the restored profile with seven channels and its older watched-video history. This validates Undo independently; it was not an Undo of a new September 4 reset, because that reset was never created.

## Manual paths that passed locally

- Locked gate → email-code sign-in → town; sign out; reload while signed out; second email-code sign-in.
- Town zoom in, zoom out, reset view, city rendering, and timeline rendering.
- Study Insight collapse and reopen.
- Study History Summary/Heatmap switching and day-detail opening, apart from the stale accessibility tooltip above.
- Settings Account expansion and sync status.
- Daily streak reminder and Discover new channels toggled off/on, with local database state verified and restored.
- English → French → English, including sync completion.
- Trailer open, sound toggle, Next, Back, and Skip.
- Light/dark theme toggle.
- Add/search catalog flow; adding and removing a channel; Undo and Redo queues.
- Video search open/close.
- Feedback modal open/close without submission.
- Recent local backups and Activity log expansion/filtering.
- `Undo Start over` restored the existing protected local generation and survived reload, as detailed in defect 6.

## Hosted paths that passed without progress writes

- Exact internal route loads; ordinary hosted root remained untouched.
- Official Google account chooser opens on the hosted origin.
- Google authentication succeeds for the approved account.
- Sign out hides the town and persists across reload.
- A second Google sign-in succeeds and reproduces defect 1.

## Non-current signal to investigate separately

- The local Activity log contains an older Sep 1 entry: `AnkiConnect failed: Cannot set properties of null (setting 'textContent')`.
- This was not reproduced during this session, so it is recorded as a historical signal rather than a current defect.

## Start-over test disposition

- The one action-time-confirmed destructive attempt was performed locally only.
- It did not create a blank generation, so the intended blank-profile reload step could not be validated.
- The available older protected reset was then undone successfully to leave the local account on a usable restored profile.
- No second destructive Start-over attempt was made.
