# Start-over pre-RPC attribution — #295

Plan: `internal-canary-codex-autonomous-2026-09-05-v4` (historical v3 invocation).
This packet does not reproduce the historical refusal. It adds a browser
regression for a meaningful signed-in profile with an older protected reset,
without changing production behavior or weakening any replacement fence.

## Immutable comparison

| Target | Exact source identity | Diagnostic browser result |
| --- | --- | --- |
| A, incident | `4b48df6c051971d13a28bbda5aa4d37801f94e1d` | PASS, 1 test |
| B, fetched master | `056c7ce8bfcc17eac11fd2f7fdbc3c4c1eea330c` | PASS, 1 test |
| C, #286 candidate | `34fd344bf1f666b68d39c3278aba733e63af7b4e` | PASS, 1 test |

C is PR #300's exact head, which had already merged before this invocation.
A and C differ. B is that merge; C and B have identical application trees.
The three worktrees were detached at these identities before diagnostic edits.
Each received the same test/support overlay, not a production repair.

The [fixture manifest](../../tests/fixtures/start-over-attribution/manifest.json)
was frozen before the final three runs. SHA-256:
`d951839e9541022a75df4632cc99d27e0bbab0358a1f71d3bf179b7a666b32be`.
Its hashes identify the exact test, mocked network transcript and observational
helper copied byte-for-byte into A/B/C. The portable-envelope module and shared
YouTube/Anki fixtures are unchanged between these identities. This is a fixed
mock server contract with deterministic responses to client requests, not a
shared mutable database. No real learner profile or authentication was used.

## Reproduction command and observations

In each detached worktree, install locked Darwin/ARM dependencies and build:

```bash
npm ci --os=darwin --cpu=arm64
npm exec --yes --package=node@24.18.0 -- npm run build
EDENIA_START_OVER_ATTRIBUTION=1 npm exec --yes --package=node@24.18.0 -- npx playwright test tests/e2e/first-signed-in-profile.spec.mjs --project=desktop-standard --grep 'older protected reset'
```

The helper bundles original source with test-only observations at `resetApp`
and `canReplaceSynchronizedHead`, intercepting only the loopback app script.
It does not change return values or RPC parameters. Observations contain
booleans, synthetic generation/revision metadata and visible sync wording;
never identities, credentials or profile contents. Production builds do not
include this helper. Run without the environment switch to use the normal
built/minified bundle.

[Captured observations](../../tests/fixtures/start-over-attribution/observations.json)
are identical at A/B/C:

- Actual `resetApp` entry: exactly once; replacement boundary: exactly once.
- Active binding, activation identity, both currentness checks, known cloud
  head, connectivity, owner and profile comparisons: true.
- Generation: 11. Accepted/binding revisions: 23/23. Initial server revision
  was 22; the ordinary activation save advanced it before confirmation.
- Pending, queued and dirty work: absent. Visible projection: `Up to date`.
- Older protected reset: visible before confirmation. The current local
  profile contains a 120-second Study fact, languages and a selected channel.
- Exactly one Start-over RPC with the accepted revision and owner-derived
  profile ID; generation 12/revision 1, blank portable profile and newest
  protected reset. The new receipt ID differs from the prior receipt.
- Reload preserves generation 12 and blank state. Undo requests the newest
  receipt and restores the 120-second Study fact, language and channel.

The plain production bundle also passes this regression. The existing account /
analytics identity, Start-over/Undo and incomplete-onboarding cases remain part
of focused and full validation. Exact final validation/review/delivery results
are recorded in the canonical #295 issue receipt and its PR.

## Negative control and fixture correction

A disposable B-only negative control inserted `return null` at the beginning
of `canReplaceSynchronizedHead`. The same diagnostic command failed at the
request-count assertion: expected 1, received 0. The saved original source
bytes were restored, verified against Git, and the normal bundle passed.
This proves the test detects a pre-RPC refusal; it is not historical red proof.
No negative-control mutation is included in the candidate.

An initial fixture asserted portable canonical `id`/`studyDay` fields in the
browser-local watch-progress representation. That assertion was incorrect:
local storage retains seconds/timestamp and the portable converter derives
canonical fields. Correcting the assertion preserved the required Study-fact
check. The final fixture additionally checks local pre-action progress,
owner/profile comparisons, distinct newest reset receipt and reload state.
All A/B/C results above use those same final bytes; earlier exploratory passes
are not substituted for this matrix.

## Terminal branch and #286 handoff

The selected branch is **A not reproduced; B and C pass**. No independent
current-base defect or candidate-only failure was established, so Phase 1,
behavior repair, new #196 blocker, database/RPC changes and deployed-schema
verification are not applicable. Deliver the missing regression and close as
non-reproduced after independent review, retaining the uncertainty below.

The incident did not record its exact activation object, pending/queued/dirty
records, confirmation-handler count, toast/focus/aria-live result or replacement
predicate. They cannot be reconstructed as historical facts. The synthetic
fixture exercises the recorded meaningful-progress/older-reset/Up-to-date
shape with explicit safe state. Its success does not exonerate the incident,
prove an unknown race impossible, or establish a cause for that incident.
No required repository fixture is inaccessible; unknown incident state is the
limitation of this bounded no-reproduction outcome.

Before #286 closes, rerun on its exact final candidate:

```bash
npm run build
npx playwright test tests/e2e/first-signed-in-profile.spec.mjs --project=desktop-standard --grep 'older protected reset'
```

The same test must pass alongside #286's full packet matrix. If the candidate
changes, earlier A/B/C results do not replace the new final-candidate run.
No hosted reset, provider or gate mutation belongs to this packet. Local-only
execution created no lease, watchdog or heartbeat; live state is untouched.
