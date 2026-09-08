# Native Packet 1 authentication preparation

This is the bounded manual Chrome transport for the approved #286 Packet 1
amendment. It does not change the authentication method or authorize another
packet. The ordinary path is unchanged. Selecting `native-inspected` requires
email-code authentication and an independently reviewed acceptance record.

## Acceptance and preparation

The coordinator receives the absolute preparation manifest path and SHA256,
preparation root, acceptance record path and SHA256 through its existing private
configuration. Never accept these digests from a web page, the preparation
manifest itself, or an unreviewed producer. No session or private key belongs in
the acceptance record, logs, issue receipts, or screenshots.

`createNativePreparationVerifier` binds the same invocation, deployed candidate, reviewed runner commit, source
files, installed Chrome executable/framework, evidence files, short expiry and
stopped profile digest and cleanup runbook. The live CLI requires a clean checkout
at that reviewed runner commit, binding transitive authority dependencies too. The acceptance digest is a reviewed capability, not a
signature or an independent proof of the statements inside it. An independent
reviewer must approve the exact record only after inspecting its provenance.

Before signing that record off:

1. Verify the completed profile-isolation, leaf/name/removal, native traffic,
   direct positive-control and guard-death results against their pinned sources.
   Preserve which observations were native and which were synthetic contracts.
   Reconcile Chrome identity with contemporaneous evidence. Do not invent a
   historical binary digest or label untested transports as tested.
2. Verify the source candidate's owner handoff, revocation races, same-journal
   and watchdog contracts and completed required delivery checks.
3. Create a fresh, exclusive private preparation directory and empty dedicated
   profile. Its owned preparation browser may reach only a local preparation
   service through a denying proxy. It must never reach hosted resources.
4. Generate three short-lived explicit CA:false server leaves for exactly the
   application, configured provider and challenge origins. Review public
   fingerprints, key correspondence, validity and permissions before import.
   Only the user imports public certificates in that disposable profile.
   OS/Keychain/everyday trust and warning bypass are prohibited.
5. Observe successful local TLS connections for each exact imported leaf with
   zero hosted preparation requests. Stop the owned browser, verify its exit,
   preserve the controlled preparation source/transcript for independent review,
   and hash the stopped profile. The preparation evidence binds that profile,
   manifest digest, browser version and exact leaf results. The reviewer must
   establish fresh creation and controlled traffic from evidence, not infer
   them from `startedEmpty` or another boolean alone.
6. Pin the final review and all evidence files in the acceptance record; set its
   expiry to no more than 24 hours, bounded by leaf validity, with at least
   five minutes remaining for the authentication window. Review the exact
   acceptance digest before placing it in the coordinator's private config.

The completed local synthetic wizard is not a real-origin preparation profile.
Do not reuse its deleted profile or expired certificates. Do not repeat that
passed wizard solely to create a new acceptance record. Meaningful transport or
browser changes require fresh matching evidence; unchanged packaging does not.

## Cleanup and recovery

The Packet 1 coordinator/operator owns the preparation keys and recovery. Before
live entry, retain the exact exclusive preparation root, profile path, manifest
hash and certificate/key paths in its private checkpoint. The native worker owns
its spawned Chrome and proxy. Normal worker cleanup stops both and removes the
profile before returning a session; the operator then removes the three private
keys and verifies their absence. The public manifest and sanitized receipt stay.

If the worker crashes or its wrapper escalates, no session may be accepted.
Keep the existing journal/gate containment path active and mark cleanup pending.
Never retry using the retained profile. The exclusive `native-authentication-used`
marker consumes the preparation before worker launch; do not delete it to replay
a failed attempt. The passed local test establishes bounded
no-direct-fallback behavior under the tested flags; it does not prove that an
orphaned Chrome has exited.

Reconcile only the exact owned preparation profile:

1. Read its `SingletonLock` PID, then independently inspect that process's full
   executable and arguments. They must identify the expected Chrome executable
   and exact exclusive `--user-data-dir` path from the pinned manifest. Check
   the private checkpoint and process start time against this attempt. A PID or
   lock alone is insufficient because PIDs can be reused.
2. If ownership is unambiguous, stop that process with SIGTERM and verify exit.
   After a bounded wait, recheck its identity before SIGKILL. Never use a broad
   Chrome kill command. If inspection or identity is ambiguous, retain the
   directory and keys, keep cleanup pending, and ask the operator to close the
   specific test window; do not claim cleanup or remove possibly active files.
3. Once the owned browser and proxy are confirmed stopped, remove only the
   manifest's dedicated profile and private key paths, verify absence and save
   sanitized recovery evidence. Reconcile the same journal, pending work and
   gate-off state using the existing containment procedure. Do not create a
   second executor or reset the journal to clear a failure.

Real-origin preparation remains a separate human import step after all prior
acceptance/delivery conditions. Challenge refusal stops the attempt; it never
permits weakening certificate, request, owner or traffic checks.

## Document diagnostics (#315)

Native progress is transport evidence only. `browserStarted` means the owned
process lock was observed. `documentDelivered` means the proxy finished writing
an HTTP 200, nonempty HTML response for the exact internal document after its
existing authorization and response checks. Neither proves that Chrome parsed
the document, ran its scripts, rendered the sign-in UI, or accepted a challenge.
The native runner therefore does not emit `private-authentication-ui-ready`.
No new browser callback endpoint, document injection, or trust bypass is used.

The coordinator retains `authenticationSetup.diagnostic` on failure, including
failures before session handoff. `failure` is the first retained terminal category;
`connectionFailure` describes a rejected client TLS, HTTP, or CONNECT connection,
which may be incidental background traffic rather than the document's cause.
The vocabulary is allowlisted in `native-opening-auth-diagnostics.mjs`. Unknown
failure strings become `unknown`; arbitrary fields and raw exception messages
are discarded at IPC and receipt boundaries. Do not add request URLs, queries,
headers, bodies, credentials, owner identifiers, or private paths to this schema.

Local regression command (no hosted requests or Chrome/certificate import):

```sh
node --test tests/contracts/native-opening-auth-proxy.test.mjs tests/contracts/native-opening-auth-worker.test.mjs tests/contracts/native-opening-authentication.test.mjs tests/contracts/native-opening-handoff.test.mjs tests/contracts/live-profile-opening-workflow.test.mjs
```

The empty-document IPC case resets a verified loopback TLS upstream before any
response, then checks the real proxy/worker/wrapper diagnostic, failed handoff,
and profile cleanup. It is an injected failure reproduction, not attribution of
the original Chrome `ERR_EMPTY_RESPONSE`. That incident remains unexplained.
Do not repeat real-origin imports/sign-in solely because these contracts pass;
retain the existing invocation and complete review and matching preparation
acceptance before any live retry.

### Automatic local document sequence

`node tests/fixtures/native-document-rehearsal.mjs --prepare-local` creates an
exclusive attempt directory and a disposable native Chrome profile behind a
denying preparation proxy. The printed attempt directory contains the public
`app.document-test.invalid.crt`; only import that leaf in that disposable
profile. After the user confirms the import, create the `start` file in that
exact attempt directory. Stale files from earlier attempts cannot start a run.

The fake page reports its script callback, waits for the local server to
acknowledge that the reset is armed, and reloads itself. The second document
request is reset before a response. The harness waits for `upstream-reset`,
then stops its owned Chrome, removes its profile and keys, and saves the result.
A passing result requires the successful first document, one script report,
one injected reset, the matching proxy diagnostic, and verified cleanup; an
expired or interrupted attempt fails even if the first page loaded. The proxy
keeps its five-minute ceiling; the automatic sequence has a shorter one-minute
bound. There is no human reload deadline inside that sequence.

The receipt proves the native request sequence and guard diagnosis. It does
not prove that Chrome displayed its error page, or establish the cause of the
original hosted incident. No repeated visual check is required for this local
transport result. Headless HTTP checks of the sequence are a separate evidence
class and do not substitute for this native guarded TLS run.
