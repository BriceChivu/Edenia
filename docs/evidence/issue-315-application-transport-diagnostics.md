# #315 application transport diagnostic masking

Plan: `internal-canary-codex-autonomous-2026-09-05-v4`, retained #286 Packet 1 invocation.
Base: `116a6df27a2169a9a0fc2f2e2382d207182294bd`.

This change repairs a local diagnostic limitation. It does not establish the
cause of the original native `ERR_EMPTY_RESPONSE`, complete authentication,
prove deployed profile opening, or authorize another live attempt.

## Reproduction and change

The proxy retained the first connection failure across every origin. Rejection
of an unrelated background CONNECT could therefore leave `connect-rejected` as
the only saved connection diagnostic after the application's own TLS failure.
A disposable native local control confirmed accepted application CONNECTs and
application-side TLS errors with zero upstream requests, while the original
summary retained only the background rejection. The control used an untrusted
synthetic leaf: its TLS failure is expected, not an original-incident reproduction.
The owned browser and temporary private material were removed. No certificate
trust or hosted state changed.

The regression uses the real proxy with synthetic origins and loopback HTTPS
upstreams. It rejects a background CONNECT, then accepts the application CONNECT
and deliberately rejects a mismatched SNI. The application failure must survive
alongside the historical global diagnostic. Positive and negative controls prove
that a provider TLS failure does not contaminate a successful application
transport, and that an HTTP parser failure is identified after TLS establishment.

The new `applicationTransport` diagnostic contains only two booleans and a fixed
connection-failure vocabulary. Observations are cumulative across application
tunnels: they do not correlate a particular socket with a particular document,
prove rendering, identify a certificate error, or establish a root cause. The
first application failure remains available after later events. Repeated
connections cannot grow the progress stream without bound.

Node's HTTPS server can emit `clientError` during a failed TLS handshake. A weak
set of established sockets prevents that event from falsely labeling an
application TLS failure as HTTP. Existing global diagnostics retain their
historical semantics. The wrapper retains the added fields through partial IPC
updates and final failure receipts; sanitization strips arbitrary nested fields
and rejects values outside the fixed vocabulary.

## Validation

The three new proxy regression cases were run against the unchanged base source
before the repair and failed because the application diagnostic was absent:

```sh
npm exec --yes --package=node@24.18.0 -- node --test \
  --test-name-pattern='background CONNECT|provider TLS|application HTTP' \
  tests/contracts/native-opening-auth-proxy.test.mjs
```

Focused transport, worker, wrapper, handoff, local document-fixture, and final
workflow checks passed with the repair: 65 passed, zero failed/skipped.

```sh
npm exec --yes --package=node@24.18.0 -- node --test \
  tests/contracts/native-document-sequence.test.mjs \
  tests/contracts/native-opening-auth-proxy.test.mjs \
  tests/contracts/native-opening-auth-worker.test.mjs \
  tests/contracts/native-opening-authentication.test.mjs \
  tests/contracts/native-opening-handoff.test.mjs \
  tests/contracts/live-profile-opening-workflow.test.mjs
```

Full local validation: `npm exec --yes --package=node@24.18.0 -- npm run test:ci`
passed: 1,586 contract tests, 139 backend tests, all Edge Function checks, and
337 browser tests (916 configured skips, zero failures).

The disposable native control was rerun against the repaired proxy. It again
observed three accepted application CONNECTs, three application TLS errors,
zero established application handshakes, and zero upstream requests. The saved
diagnostic now independently retained `applicationTransport.connectAccepted:
true`, `tlsEstablished: false`, and `connectionFailure: client-tls`, alongside
the original global `connect-rejected`. Cleanup passed. The unchanged synthetic
untrusted-leaf failure remains a negative control, not original-incident proof.

The PR and tracker receipt record final exact-candidate validation, independent
Standards/Spec review, CI and delivery identities.

## Containment and continuation

Experiment: operator-only native authentication diagnostics.
Gate: existing guarded native-authentication transport; no retry, authorization,
TLS validation, request classification, deadline or profile-write allowance changes.
Public path: no application asset, runtime configuration or public-route behavior
change. No database/API contract or migration changed; pgTAP is not applicable to
this diagnostic repair. Local browser tests do not count as hosted acceptance.

The retained SQLite journal was read with `mode=ro`: recorded candidate
`3213b9a4fd07d99e951eb27c5de06c6e846dffbe`, phase `delivered`, no lease or pending
operation, completed watchdog, one consumed authentication retry. The original
journal and checkpoint remain unchanged. Their gate-off observations are
historical; this work makes no fresh hosted safe-state claim.

#315 remains open for the unresolved original failure. #286 still requires its
real authentication and deployed opening matrix, preservation checks and final
gate-off handoff. #196 remains blocked. The next useful diagnosis needs a trusted,
permitted local reproduction of the original transport failure; this diagnostic
repair alone does not satisfy that prerequisite or permit repeating imports or
the unchanged live sign-in attempt.
