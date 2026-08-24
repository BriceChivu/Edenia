# Supabase Free capacity for portable-profile snapshots

Date: 2026-08-15

## Answer

Yes: Edenia's existing Supabase project has ample capacity for the one-developer internal canary, including one latest portable profile plus eight full recovery snapshots. Reusing Supabase is the smallest viable choice; a second free database is not justified by capacity.

That answer does **not** establish indefinite public Free-plan capacity. The current portable state has bounded activity history and undo history, but video records, per-video watch-progress entries, Anki days, and study-insight history can continue growing. A source-derived long-lived fixture is already 1.21 MB, and a representative state crosses Edenia's current 2 MiB portable-transfer ceiling at about 2,062 videos. Before public rollout, the specification needs a per-profile size contract, oversize behavior, snapshot cadence, and monitored rollout thresholds.

## Current official limits

The relevant Supabase Free limits, checked against the [Supabase pricing page](https://supabase.com/pricing), [billing guide](https://supabase.com/docs/guides/platform/billing-on-supabase), [database-size guide](https://supabase.com/docs/guides/platform/database-size), [egress guide](https://supabase.com/docs/guides/platform/manage-your-usage/egress), and [project-pausing guide](https://supabase.com/docs/guides/platform/free-project-pausing), are:

| Constraint | Free allowance | Consequence for this design |
| --- | ---: | --- |
| Database size | 500 MB per project | Free projects enter read-only mode after exceeding 500 MB. Data, indexes, and materialized views all consume this allowance. |
| Uncached egress | 5 GB per organization per billing cycle | Database responses, Auth, Functions, Realtime, and other uncached traffic share it. Portable-profile downloads are database egress. |
| Cached egress | Separate 5 GB per organization | Not useful for private per-user database rows; cached egress primarily applies to Storage CDN traffic. |
| Database API requests | Unlimited | There is no request-count quota to budget, but Nano compute, WAL churn, and latency still make frequent full-document writes undesirable. |
| Monthly active users | 50,000 | Not the binding limit for this design; database size or egress is reached first for full-document profiles. |
| Automatic backups / PITR | Not included | Product recovery snapshots are required for user-level rollback, but they live in the same database and are not disaster recovery. |
| Inactivity | Free projects may pause after low activity over seven days | A solo canary can pause. It can be restored from the dashboard, but sync must treat the resulting outage as offline and preserve local progress. |

The database-size guide also documents a separate Fair Use restriction based on the organization's average daily database size across projects. Free overages can eventually restrict requests rather than create a bill. The implementation must act before the 500 MB read-only boundary because pruning deletes may not run once the database is read-only.

The [Supabase changelog](https://supabase.com/changelog.md) was reviewed first. No current entry changes the quotas above. One implementation-adjacent breaking change is relevant: newly created tables are no longer necessarily exposed to the Data API automatically, so the eventual migration must explicitly verify Data API exposure and grants as well as RLS. This report makes no schema or project changes.

## Existing Edenia contract

Edenia already has useful constraints:

- The current portable-state helper JSON-clones and sanitizes state, measures UTF-8 bytes, and has a 2 MiB ceiling ([`src/state/portable-state.js`](../../src/state/portable-state.js#L8), [`src/state/portable-state.js`](../../src/state/portable-state.js#L46), [`src/state/portable-state.js`](../../src/state/portable-state.js#L57)).
- Device-only configuration is removed by the storage sanitizer, and its contract test proves that API-key and Anki-resume fields do not transfer ([`tests/contracts/portable-state.test.mjs`](../../tests/contracts/portable-state.test.mjs#L16), [`tests/contracts/portable-state.test.mjs`](../../tests/contracts/portable-state.test.mjs#L43)).
- Local recovery keeps eight full state copies and suppresses ordinary automatic snapshots inside ten minutes ([`src/state/backups.js`](../../src/state/backups.js#L1), [`src/state/backups.js`](../../src/state/backups.js#L98)).
- The existing `state_backups.state_json` column is `jsonb` ([migration](../../supabase/migrations/20260724100505_add_plus_schema.sql#L71)), and a later migration made cloud backups append-only and pruned each user to the newest eight ([migration](../../supabase/migrations/20260724112256_keep_state_backup_history.sql#L1), [pruning trigger](../../supabase/migrations/20260724112256_keep_state_backup_history.sql#L29)).
- Activity history is capped at 500 entries and undo/redo stacks at 50 ([`src/state/activity-log.js`](../../src/state/activity-log.js#L4), [`src/state/action-history.js`](../../src/state/action-history.js#L11)). Video refresh merges rich video records into the stored state, while the normalized study-insight history currently has no count or age cap ([`src/app.js`](../../src/app.js#L7310), [`src/state/study-insights-state.js`](../../src/state/study-insights-state.js#L37)).

The new design needs a dedicated latest-state row in addition to immutable recovery snapshots. Updating the latest row should not consume another recovery slot.

## Local measurements

No browser profile or user data was read. Measurements were generated in Node from the current source contract with `createDefaultStateFactory()`, `sanitizePortableProgressState()`, and `getJsonByteLength()`. Values are minified UTF-8 JSON bytes—the bytes a full-document client request must serialize—not measured Postgres disk bytes.

The source-derived fixtures were:

- **Fresh**: current default state, no channels or history.
- **Small completed**: completed onboarding, two videos, two Anki days, eight activity rows, two undo actions, and two insight rows.
- **Active**: five channels, 250 rich video records (one current public fetch page per channel), one year of Anki days, the 500-row activity cap, the 50-action undo cap, and 52 weekly insights.
- **Long-lived**: five channels, 1,000 videos, three years of Anki days, 500 activity rows, 50 undo actions, and 156 weekly insights.

| Fixture | Serialized bytes | Approximate readable size |
| --- | ---: | ---: |
| Fresh | 1,418 | 1.4 KiB |
| Small completed | 10,865 | 10.6 KiB |
| Active | 466,455 | 455.5 KiB |
| Long-lived | 1,206,632 | 1.15 MiB |
| Existing portable ceiling | 2,097,152 | 2.00 MiB |

For the Active fixture, isolated source-derived contributions were approximately 211 KB for 250 videos, 110 KB for 500 activity entries, 93 KB for 50 undo actions, 43 KB for 52 insight entries, and 17 KB for 365 Anki days. These totals overlap the small base state; they identify the growth drivers rather than sum to a separate billing measurement.

The 2 MiB threshold test held the three-year history assumptions constant and varied videos. It measured 2,097,008 bytes at 2,061 videos and 2,097,879 bytes at 2,062 videos, so the latter is the first source-derived fixture rejected by the current portable ceiling. This is not a prediction that all users reach the threshold; it proves the current state shape is not intrinsically bounded below it.

### Why serialized bytes are not database bytes

Supabase recommends `jsonb` for variable-schema JSON and explains that it uses a decomposed binary representation ([Supabase JSON guide](https://supabase.com/docs/guides/database/json)). PostgreSQL can compress or move large values to TOAST storage ([PostgreSQL TOAST documentation](https://www.postgresql.org/docs/current/storage-toast.html)). Therefore JSON byte length can be above or below the eventual physical row cost. Index pages, row metadata, dead tuples between vacuums, Auth tables, and Edenia's other tables also consume database size.

The capacity tables below consequently show raw payload duplication and then use a deliberately cautious **2x planning multiplier**. That multiplier is an operational assumption, not a substitute for measuring `pg_column_size` and `pg_total_relation_size` after the schema exists; PostgreSQL documents both measurement functions in its [administration-function reference](https://www.postgresql.org/docs/current/functions-admin.html).

## Storage model

For payload size `S` and `R` retained recovery snapshots:

```text
raw portable bytes per user = S * (1 latest + R snapshots)
provisional database budget = raw portable bytes * 2
```

The table uses a 350 MB portable-profile allocation, leaving 150 MB of the official 500 MB project limit for Auth, existing Edenia tables, index growth, vacuum lag, and response time before read-only mode.

| Recovery snapshots | Active raw / user | Active users in 350 MB at 2x | Long-lived raw / user | Long-lived users in 350 MB at 2x |
| ---: | ---: | ---: | ---: | ---: |
| 3 | 1.87 MB | 93 | 4.83 MB | 36 |
| 5 | 2.80 MB | 62 | 7.24 MB | 24 |
| 8 | 4.20 MB | 41 | 10.86 MB | 16 |

At the full 2 MiB profile ceiling, one latest state plus eight snapshots is 18.87 MB of raw JSON and 37.75 MB under the 2x planning rule. One internal tester therefore occupies less than 8% of the entire Free database allowance even in this ceiling case. Eight snapshots are safe for the internal canary; their public retention cost must be revisited before rollout.

## Write and egress model

Every full latest-state update serializes `S` bytes. An immutable recovery insert writes another `S` bytes and consumes storage until pruned. Updating the latest row does not make database size grow linearly, but it still generates database work and WAL.

| Fixture | One full write | 24 full writes/day | 100 full writes/day |
| --- | ---: | ---: | ---: |
| Active | 0.47 MB | 11.19 MB | 46.65 MB |
| Long-lived | 1.21 MB | 28.96 MB | 120.66 MB |
| 2 MiB ceiling | 2.10 MB | 50.33 MB | 209.72 MB |

Supabase advertises unlimited API requests, but these figures make per-`saveState()` cloud writes inappropriate. Latest-state writes should be coalesced after local persistence, retried offline, and return no state body. Recovery snapshots should be deduplicated and created for risk-bearing events or a deliberately limited cadence—not for every local save.

For egress, a conservative ordinary-use model is two devices each downloading the latest state once per day for 30 days: `60 * S` per active user-month.

| Fixture | Monthly latest-only egress / user | Theoretical users at 5 GB |
| --- | ---: | ---: |
| Active | 28.0 MB | 178 |
| Long-lived | 72.4 MB | 69 |
| 2 MiB ceiling | 125.8 MB | 39 |

Those are upper-bound cohort counts before Auth, Functions, and other database traffic share the quota. Fetching latest plus all eight snapshots on every startup would multiply profile egress by roughly nine and is not acceptable. The normal path should fetch only the latest version/metadata and download a historical snapshot only during conflict preview or explicit recovery.

## Constraints for the specification

1. **Use the existing Supabase project.** Capacity is ample for the solo internal canary; do not add another database.
2. **Separate latest state from recovery history.** One mutable latest row per user, plus immutable snapshots. Snapshot insertion must not be the normal latest-state write path.
3. **Keep eight snapshots for the internal canary.** This matches Edenia's existing local and cloud recovery count and is comfortably within Free capacity for one tester. Make the count a server-side invariant, not a client promise.
4. **Decide the public retention count at the rollout gate.** Compare three, five, and eight snapshots using actual `pg_column_size`, table/index size, profile-size percentiles, and cohort projections. Do not silently reduce a user's existing recovery history.
5. **Adopt the current 2 MiB portable ceiling as the initial cloud hard limit.** Measure before upload. If exceeded, preserve local state, report “Needs attention,” and do not overwrite the last good cloud state or prune recovery history.
6. **Bound or explicitly handle state growth before public rollout.** Video/watch-progress and insight history growth can exceed 2 MiB. The decision must specify which portable fields remain full fidelity, which get bounded/compacted, and how an oversized existing profile recovers without data loss.
7. **Coalesce latest writes and deduplicate snapshots.** Local persistence remains authoritative. Cloud work should run after local success, coalesce bursts, use revision-based conflict checks, retry offline, and request a minimal response.
8. **Load recovery history on demand.** Normal startup reads latest state/version only. Conflict and operator recovery flows fetch only the metadata or exact snapshot needed.
9. **Monitor before Supabase enforces limits.** The exploratory pre-rollout policy was a warning at 300 MB total database size and a stop/review gate at 350 MB; for egress, warn at 3 GB and review at 3.5 GB. Issue #194 supersedes the database thresholds for the guarded cleanup path with a warning at 70% and a pause at 85% of the reverified current plan limit. Public enrollment must stop or upgrade before continued growth risks read-only/402 restrictions.
10. **Do not call snapshots disaster recovery.** The Free plan has no automatic backups or PITR. Same-project snapshots recover user mistakes and merge errors, not loss or corruption of the Supabase project itself.
11. **Verify Data API access and RLS independently.** New tables need explicit API exposure/grants where configured, and every state row must remain owner-scoped. Capacity findings do not relax authorization.

## Decision surfaced

The initial canary can proceed with eight snapshots, but a separate pre-public decision is now required:

> What is Edenia's bounded portable-profile contract—especially for videos, per-video watch progress, activity/undo history, and insight history—and what lossless behavior applies when an existing profile approaches or exceeds 2 MiB?

This decision should be made before finalizing merge rules and public retention. Capacity monitoring alone cannot make an unbounded per-user document safe.
