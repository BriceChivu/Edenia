# #315: preserve allowed document reads after a TLS reconnect

Plan: `internal-canary-codex-autonomous-2026-09-05-v4`, retained #286 Packet 1
invocation. Base: `294fca8d63035343422f9c6225a2023cec837608`.

This repair addresses a newly reproduced HTTP 403 on a valid TLS 1.2 reconnect
through the native authentication proxy. It does not establish the cause of the
historical native `ERR_EMPTY_RESPONSE`, authorize another authentication attempt,
or complete #315/#286 acceptance.

## Reproduction and cause

A synthetic loopback matrix exercised the real proxy with verified TLS clients,
TLS 1.2/1.3 and ALPN offers, keepalive, session resumption, speculative connection
closure, fragmented requests, and preparation-style CONNECT relay versus direct
transport. Two runs on Node 24.10.0 found 13/14 cases passing; that runtime is
below the project's supported version and was used only for initial diagnosis.

The minimized test on the required Node 24.18.0 confirmed the same failure:

| Connection | TLS session reused | Server-name field | Response | Total upstream documents |
| --- | --- | --- | --- | --- |
| First TLS 1.2 connection | false | expected synthetic application name | 200 | 1 |
| TLS 1.2 reconnect offering the saved session | true | absent | 403 | 1 |

Both requests used the exact same allowed method, Host, internal document path
and document destination. Read-only test observers confirmed those predicates
still matched on the second request. The absent `socket.servername` caused the
existing exact-name guard to refuse the document. No raw TLS session or private
application data was recorded. The TLS 1.3 resumed document already succeeded.

The repository regression was run against unchanged base proxy source before
the repair:

```sh
node --test --test-name-pattern='allowed document reconnect|TLS reconnect cannot' \
  tests/contracts/native-opening-auth-proxy.test.mjs
```

On Node 24.18.0, the TLS 1.2 case failed with the actual HTTP 403. The TLS 1.3
case failed only its new fresh-handshake assertion, not document delivery.
The negative target/identity control passed. This distinction prevents treating
a new implementation requirement as a second historical liveness defect.

## Repair and safety

Disable session tickets on both the HTTPS server's default context and its
explicit SNI context. No session-ID recovery cache is installed. A reconnect
offering saved TLS state therefore performs a fresh handshake, preserving the
server-name check rather than accepting an absent name. Node documents this
fallback behavior in its [TLS session-resumption reference](https://nodejs.org/api/tls.html#session-resumption).
The [upstream Node report](https://github.com/nodejs/node/issues/57175) corroborates
the missing-name behavior; the local regression establishes this proxy's defect.

Exact SNI, CONNECT/Host, TLS certificate validation, supported protocol versions,
request classification, owner verification, request budgets, authorization and
cleanup remain unchanged. The tradeoff is a full TLS handshake on reconnect
within this bounded operator transport.

Regression coverage verifies both TLS versions deliver the second document
after a fresh verified handshake, with exactly two upstream requests. Saved
TLS state cannot replace missing SNI, a wrong Host or a different origin: those
cases return 403 without an additional upstream request. Wrong SNI also closes
without forwarding; that particular client-visible failure does not distinguish
server rejection from client certificate-name verification.

## Validation

Node 24.18.0 focused transport/worker/wrapper/handoff/workflow matrix: 68 passed,
zero failed/skipped.

```sh
node --test tests/contracts/native-document-sequence.test.mjs \
  tests/contracts/native-opening-auth-proxy.test.mjs \
  tests/contracts/native-opening-auth-worker.test.mjs \
  tests/contracts/native-opening-authentication.test.mjs \
  tests/contracts/native-opening-handoff.test.mjs \
  tests/contracts/live-profile-opening-workflow.test.mjs
```

Full `npm run test:ci` on Node 24.18.0 passed: 1,589 contract tests, 139 backend
tests, all Edge Function checks, and 337 browser tests with 916 configured skips
and zero failures. The PR and final delivery receipt record exact candidate
review, CI and deployment identities. No migration, RPC, grant, RLS or database
contract changed; pgTAP is not applicable to this transport repair.

A separate observer-only minimized run on Node 24.18.0 confirmed the repaired
reconnect has the expected server name, no session reuse, HTTP 200 and two
upstream documents. An earlier diagnostic invocation exited 139 without a
result; its cause is unclassified, its failure receipt is retained, and its
eight owned temporary certificate files were removed. That failed invocation
does not count as product reproduction or successful validation.

## Scope and continuation

Experiment: operator-only native authentication transport.
Gate: existing guarded native-authentication path; no new live permission or
retry. Public path: no application asset, runtime flag or learner behavior change.

Synthetic client evidence is not native-browser acceptance. The retained
preparation used a front CONNECT relay and CORS fetches; the worker uses direct
CONNECT and top-level document navigation. A separate native Chrome
152.0.7977.83 negative control compared relay and direct topology with the same
fresh profile, untrusted synthetic leaf and top-level document target. Each
phase observed three accepted application CONNECTs, client TLS rejection, zero
established TLS handshakes, zero HTTP requests and zero upstream requests.
Both phases and removal of the owned browser/profile/key material completed in
about 21 seconds. No certificate trust was changed or warning bypassed.

That comparison used the real proxy and worker-equivalent launch arguments,
not the worker's IPC/lease lifecycle. It establishes no visible Chrome error,
full browser egress proof or trusted document-delivery result. The negative
control found no topology difference before trust; a trusted preparation-to-
worker handoff remains untested. None of these results attributes the original
incident.

The original journal/checkpoint, exhausted authentication retry and live pause
remain intact. No certificate import, live authentication, hosted provider/gate
operation or learner-profile action is part of this repair. #315 and #286 remain
open for the original failure and real profile-opening acceptance; #196 remains
blocked. Any later trusted diagnostic setup requires its own valid authority.
