# Edenia health monitoring

[Open Edenia Health and Reliability](https://us.posthog.com/project/511399/dashboard/2196030) when something seems wrong. It shows problems observed in public browser sessions, with progress protection first. [Pulsetic](https://app.pulsetic.com/monitors/168648/overview) independently checks whether the website responds, even when nobody visits Edenia.

## Reading the dashboard

| Status | Meaning | What to do |
| --- | --- | --- |
| Working | Recent observations show the relevant feature succeeding. | No action needed for those observations. |
| Needs attention | A recovery copy is in use, a feature fails repeatedly, or opening is slow. | Send Codex the dashboard or issue link and the approximate time. |
| Urgent | Progress cannot be saved, or the external website check fails. | Ask Codex to investigate promptly. Keep the affected browser tab open. |
| Unknown | There are no recent observations, collection is blocked, or a limit was reached. | Check the website monitor and collection freshness. Empty charts cannot prove health. |
| Not enabled | Public sign-in and account synchronization are disabled in this release. | These are expected to be absent from the public dashboard. |

Do not clear browser data to fix a saving problem. A warning about a recovery copy means Edenia has switched storage paths; a copy held only in memory can disappear when the tab closes. Ask Codex about preserving or exporting progress before taking that step.

The dashboard covers opening the app, opening the island, local progress saving, video feed refreshes, unavailable video playback, unexpected application errors, page loading, responsiveness, and layout movement. Opening the app includes reaching usable onboarding; it does not imply onboarding completion. The browser timing panels exclude app and island attempts that spent time in a hidden tab. Page responsiveness describes the parent webpage; it does not measure gameplay frame rate inside the Godot iframe.

Sessions and reports are different. One session may contain multiple reports and outcomes, including a failure followed by recovery. Success reports for saves are sampled. Do not calculate a save failure percentage from these events, add session counts across reasons, or interpret them as a count of all learners. Browser extensions and blocked analytics can leave users unobserved. Speed samples are useful for investigation; wait for a meaningful sample size before claiming a regression.

## Alerts and independent checks

The public website monitor requests `https://www.edenia.study/` every five minutes, expects HTTP 200 and the text `site-entry.js`, and checks SSL. It uses the account's existing email alerts. This checks the delivered entry page; it does not run JavaScript or complete a learner journey. The existing production Auth monitor is a separate dependency check and does not indicate that public account features are enabled.

During setup on 11 October 2026, an inverted keyword setting produced one false incident before correction. Checks after that correction are the monitoring baseline; the initial incident was not a website outage.

Two [PostHog email alerts](https://us.posthog.com/project/511399/alerts) notify the existing account owner. They check every completed hour, including weekends: any observed progress save failure is urgent; app or island opening failures in three or more observed browser sessions need attention. Checking completed hours avoids missing events after an early check of an unfinished hour. Alerts and delivery are periodic, so they are not immediate. A single unavailable YouTube video or a normal refresh cooldown should not page the owner. Investigate the actual issue and whether affected sessions recovered before recommending a repair.

The collection panel shows recent reports, observed sessions, the latest observed release and whether page loads hit the reporting cap. Speed panels show sample counts alongside their measurements. Empty charts mean no matching observations, not a guarantee that every learner is fine.

## Staying free

At setup, PostHog and Pulsetic are on Free plans. PostHog has no payment card enabled and uses hard free-tier limits: one million analytics events, five thousand recordings, and one hundred thousand exceptions per monthly cycle. Pulsetic Free includes ten monitors with five-minute checks. Use email alerts; do not enable paid SMS, calls, faster checks, add-ons, or upgrades. [Check PostHog billing and limits](https://us.posthog.com/organization/billing/overview) and [Pulsetic subscription](https://app.pulsetic.com/account/subscription) when changing the setup. Free-plan conditions can change.

This implementation adds no database tables, profile snapshots, polling writes, or paid services. Monitoring uses the existing PostHog ingestion path. It emits at most 120 health and exception events per page load, plus one collection-limit report. Repeated categories are deduplicated for ten seconds; save successes and identical exceptions for sixty seconds. Existing product analytics and session replay have their own consumption and remain subject to the account limits. Reaching a cap reduces visibility; it must never trigger an automatic upgrade.

## Investigating with Codex

Send the dashboard link or the [error issue link](https://us.posthog.com/project/511399/error_tracking), the time, and what you noticed. Codex should check collection freshness, the independent website check, affected sessions, recovery outcomes, device/browser, and the deployed release before explaining the cause. A monitoring category is evidence of a symptom, not proof of its cause.

Match `health_release` to the deployed `release.json` and the Git commit. Exceptions retain known application script filenames and numeric line/column locations. Error messages and local variables are discarded, so reproduce the issue against the matching build when a location alone is insufficient. Never request or copy a learner profile into monitoring to diagnose a problem.

## Event contract

The `edenia_health` event uses schema version 1 and `health_environment=public`. Collection follows the existing canonical production analytics gate and excludes every `internal_test` route, sandbox, migration/auth-sensitive routes, and local previews.

Properties are allowlisted: `health_operation`, `health_outcome`, `health_reason`, `health_recovery`, `health_duration_ms`, `health_metric`, `health_value`, `health_rating`, `health_release`, `health_schema`, and `health_environment`. Web Vitals uses the standard `web-vitals` package for LCP, INP and CLS, without DOM attribution. No profile contents, learner identifiers, email addresses, video titles, arbitrary exception text, URL secrets, or DOM content are added by the health collector. The existing analytics SDK supplies its usual session/browser context under Edenia's existing redaction rules.

Unexpected first-party errors additionally produce sanitized `$exception` events for PostHog Error Tracking. Automatic SDK exception capture is disabled to prevent duplicate or unsanitized collection. Monitoring errors are swallowed and cannot change synchronous or asynchronous profile-save results. The host bridge reports island readiness only after the current iframe's accepted restore acknowledgement; it does not modify gameplay.

The source is `src/integrations/health-monitor.js`; `scripts/health-entry.js` installs it before the application starts. Both current and retained production entries include the same versioned `health.js`. Save and startup integration changes are mirrored in `src/app.js` and `compat/production/src/app.js`.

Validation includes privacy allowlisting, transport failure isolation, bounded collection, hidden-tab timing, expected refresh conditions, save result preservation, and both production entries. Run `node --test tests/contracts/health-monitor.test.mjs` after changing the event contract, then rebuild and run the relevant browser tests. Never send fake failures into the production project to test an alert.
