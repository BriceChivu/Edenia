# Deliver frictionless Edenia authentication as an internal canary


This ExecPlan is a living document. Keep `Progress`, `Surprises & Discoveries`, `Decision Log`, and `Outcomes & Retrospective` current while implementing it. Follow `.agent/PLANS.md` from the repository root.

The user-visible result is an internal Edenia authentication flow in which Google displays its own trusted identity UI without navigating the top-level browser through the opaque Supabase project hostname, while email users receive a branded, scanner-resistant Edenia magic link. A learner can still complete or skip onboarding and study without an account. After onboarding has completed and the first-study walkthrough has either been completed or skipped, a signed-out learner may see Google One Tap or cancelable automatic sign-in. Signing in creates an account if needed, persists the session, identifies the same Supabase user in PostHog, and does not replace or upload the browser's full local study document.

This plan ends after a reversible private canary on `https://www.edenia.study/?internal_test=1`, autonomous merge of the implementation and evidence pull requests, and verification of the exact merged deployments. `EDENIA_ACCOUNT_FEATURES_ROLLOUT` remains `internal`; reminder delivery remains independently off except for any separately approved reminder procedure; and the public accountless path remains unchanged. The user has authorized Codex to execute this complete lifecycle without routine approval pauses.


## Progress


- [x] (2026-08-14 15:41Z) Consolidated the completed Grill Me decisions, including the later choices to enable One Tap, cancelable automatic sign-in, Turnstile, searchable PostHog email, and a scanner-resistant magic link, while excluding the rejected onboarding progress sentence.
- [x] (2026-08-14 15:41Z) Inspected the current account controller, Supabase client, runtime configuration, onboarding and walkthrough state transitions, PostHog bridge, reminder snapshot seam, standalone unsubscribe-page build pattern, deployment workflow, tests, and operations documentation.
- [x] (2026-08-14 15:41Z) Rechecked current Supabase, pinned `@supabase/auth-js` 2.110.7, Google Identity Services, Cloudflare Turnstile, and Resend interfaces and limits. The July 2026 Supabase changelog contains no breaking change that alters this client-auth design; the June Free-tier email-template change reinforces configuring custom SMTP before relying on branded templates.
- [x] (2026-08-14 15:51Z) Recorded the user's full autonomous authority for implementation, provider configuration, draft PR publication, fresh review, CI and review repair, ready-for-review transition, protected merge, deployment proof, internal canary, rollback, and the final evidence PR. Confirmed that `master` strictly requires the `verify` check, requires no approving review, and permits merge commits, squash merges, and rebases.
- [x] (2026-08-14 15:58Z) Began implementation from current `origin/master` on `codex/frictionless-authentication-internal-canary`, rechecked the Supabase changelog and current Auth API documentation, and transitioned this work item to active implementation.
- [x] (2026-08-14 16:37Z) Implemented the deep Google Identity Services boundary, one-use raw/hashed nonce pairing, official Settings/onboarding buttons, exact post-onboarding One Tap policy, fresh failure opportunities, duplicate-callback rejection, and explicit-sign-out suppression. Focused controller contracts and mocked desktop/phone browser flows pass.
- [x] (2026-08-14 16:37Z) Implemented one-use Turnstile-protected magic-link requests and the analytics-free `/auth/confirm/` token-hash page. The build emits an exact-host CSP and fragment scrubber; unit and desktop/phone browser tests prove no load-time exchange, transient in-memory retry, definitive disposal, responsive geometry, and deliberate success.
- [x] (2026-08-14 16:37Z) Extended PostHog identity to attach only normalized email and `google|email` auth method to the stable Supabase UUID, with same-user property refresh, logout/account-switch resets, malformed-property rejection, and byte-identical local study-state proof across mocked Google, One Tap, email request, and sign-out flows.
- [x] (2026-08-14 16:46Z) Completed the local implementation gate. `npm test` passed 1,092 contracts plus the shared Supabase and Deno suites; the focused new and existing account browser suites passed on desktop and phone; the complete Playwright matrix passed with 223 executed and 525 intentional skips; and a production-shaped internal build contained no credential-bearing server secret names or values.
- [x] (2026-08-14 16:53Z) Completed a fresh security, privacy, lifecycle, switch-off, and complexity review. Fixed status-zero Supabase network failures so confirmation capabilities remain retryable; moved the captured fragment into the confirmation bundle before public config executes; and limited verified `amr` claim lookup to linked email-plus-Google accounts so ordinary sessions make no extra request. The post-review gate passed 1,093 contracts, all shared Supabase and Deno checks, and the focused account/GIS/confirmation browser suite. Usefulness score: 8/10 - the pass found and repaired two capability-lifecycle defects plus one avoidable request expansion before publication.
- [x] (2026-08-14 17:10Z) Published implementation draft PR #148 at exact head `052ae97`; its first protected `verify` run passed contracts and 217 browser cases but failed six new assertions because CI serves the ordinary test origin on port 4173 while the tests expected the security-allowlisted localhost auth origin on port 8000. Changed both new specs to navigate the already-provisioned fixed port-8000 server explicitly. The exact CI port split now passes eight affected cases with two intentional skips.
- [x] (2026-08-14 17:24Z) Completed the implementation delivery gate. PR #148 exact head `ed802a7` passed required `verify` run 31822774853, merged through protection as `79ed25f`, and deployed successfully in Pages run 31823673854. Hosted checks prove the ordinary root has no Account controls or Google/Turnstile provider scripts, visible public and confirmation-page copy contains no project reference, and an empty `/auth/confirm/` entry remains disabled with a branded invalid-link state.
- [x] (2026-08-14 17:32Z) Reused the existing Google Web client after verifying its exact `https://www.edenia.study` and `http://localhost:8000` JavaScript origins. Deployed only its public client ID in Pages run 31823973617 at exact source `79ed25f`; the live runtime still reports account rollout `internal`, Google transport `oauth_redirect`, One Tap false, and no Turnstile site key, so this preparatory configuration changed no public flow.
- [x] (2026-08-14 23:19Z) Created a dedicated Resend sending credential restricted to `mail.edenia.study`, authenticated it against Resend SMTP without sending a message, stored it only in Supabase custom SMTP, and preserved the separate reminder credential. The first hosted template edit accidentally appended the old default body; an exact editor replacement plus Supabase Auth's ten-minute template-cache expiry produced a delivered canary from `Edenia <accounts@mail.edenia.study>` whose HTML, generated plain text, and only clickable action are branded, scanner-resistant, and free of the opaque Supabase hostname.
- [x] (2026-08-14 23:20Z) Created a Free managed Cloudflare Turnstile widget restricted to exact hosts `www.edenia.study` and `localhost`, deployed its public site key in successful Pages run 31849551029 at source `79ed25f`, then stored only its secret in Supabase and enabled CAPTCHA. A live internal magic-link request completed the managed challenge without interactive CAPTCHA and was accepted and delivered. The confirmation fragment was scrubbed before page interaction, no token exchange occurred on load, the deliberate **Continue to Edenia** action succeeded, and the top-level browser never visited the Supabase project hostname.
- [x] (2026-08-14 23:27Z) Switched only the internal runtime to Google ID-token transport and One Tap in successful Pages run 31850052744 at source `79ed25f`, while preserving `EDENIA_ACCOUNT_FEATURES_ROLLOUT=internal`. A hosted manual Google button sign-in completed without top-level Supabase navigation and resolved to the same Supabase UUID as the magic-link sign-in. PostHog search found the person by normalized email, showed `auth_method=google`, retained the Supabase UUID among the merged distinct IDs, and kept the browser's 40-video starter feed intact across sign-out and both methods.
- [x] (2026-08-14 23:49Z) Resumed from the user's safe checkpoint before any further browser or provider interaction. The checkpoint left the provider state stable and the worktree clean.
- [x] (2026-08-14 23:49Z) Resumed from the clean checkpoint and reproduced the duplicate-Turnstile warning on fresh hosted page lifecycles. The controller allowed concurrent identical `mount()` calls to cross its pre-load idempotence check, so both rendered after the shared script resolved. Added a per-container in-flight operation guard and an exact deferred-loader regression. The production build, all seven Turnstile contracts, the desktop/phone Google-plus-Turnstile local-state flows, and `git diff --check` pass; hosted deployment verification remains part of the evidence PR.
- [x] (2026-08-14 23:52Z) Rechecked Google's current GIS JavaScript reference and confirmed that all five validated methods remain supported, including `disableAutoSelect`; API removal does not explain the hosted `unavailable` state. Added a coarse `script|nonce|initialize` failure-stage signal that never retains or exposes the provider error, nonce, token, or account data. Twenty-two focused contracts and the rebuilt desktop/phone auth flows pass. The next exact deployment can now distinguish a provider/script boundary failure from Edenia's nonce or initialization path without weakening the user-facing fallback.
- [x] (2026-08-15 00:01Z) Completed the pre-publication repair gate at code head `bdaac41`: `npm test` built production output and passed 1,097 contracts, 131 shared Supabase tests, and every Deno Edge Function check; the complete serial Playwright matrix passed all 223 executed cases with 525 intentional project skips in eight minutes. A production-shaped internal artifact using syntactically valid dummy public values had no credential-bearing secret-pattern match, and `git diff --check` passed.
- [x] (2026-08-15 00:06Z) Published draft repair/provider-stage PR #149 at exact head `fa625d3`, then stopped its stale-head CI watch when the fresh review found that a thrown GIS `initialize()` left the just-created nonce candidate assigned. The controller now zeroes and discards that candidate and clears mount opportunity markers before a retry; a new regression proves the next attempt initializes with a fresh nonce and exposes no provider error. Sixteen focused contracts pass. The rebuilt desktop/phone auth slice passed three cases and hit one unrelated `route.fetch` disposal in its test proxy; the exact desktop case passed immediately on isolated rerun.
- [x] (2026-08-14 17:37Z) Made the production Supabase Auth URL and non-secret safety configuration durable in `supabase/config.toml`, including the two exact confirmation URLs and no wildcard. A first CLI invocation unexpectedly mutated Auth to generated localhost defaults before a paid-only Storage update failed. Immediately restored the original site URL, three prior returns, email confirmation, 60-second frequency, eight-digit OTP, and TOTP settings while adding the two intended confirmation returns; explicitly kept vector buckets disabled. A second authenticated config push reports API, DB, Auth, and Storage all up to date, the dashboard shows the production URL plus all five exact returns, Google remains enabled, custom SMTP remains disabled, and the focused source contract passes 7/7.
- [x] (2026-08-14 17:41Z) Added a versioned, branded magic-link source at `supabase/templates/magic_link.html` and made both authentication runbooks point to it as the hosted editor's reviewed source of truth. Its only action targets Edenia's scanner-resistant confirmation fragment with `{{ .TokenHash }}`; a focused contract forbids `{{ .ConfirmationURL }}`, the opaque project reference, Supabase-branded links, active content, images, forms, or insecure URLs and passes 8/8. Hosted installation remains correctly ordered after custom SMTP activation.
- [x] (2026-08-14 17:41Z) Re-ran the full repository gate at provider-stage head `3eaac72`: the production build succeeded, 1,095 contracts passed, 131 shared Supabase tests passed, and every Deno Edge Function check passed. `git diff --check` and a complete `origin/master...HEAD` review found no additional defect; the worktree was clean before recording this evidence.
- [x] (2026-08-15 00:21Z) Completed repair/provider-stage PR #149. Exact head `d9c7fd8` passed required `verify` run 31852621407, merged through protection as `8a69ca8`, and deployed successfully in Pages run 31853264898. Hosted checks proved one Turnstile widget with no duplicate-render warning. Both automated browser surfaces still reached the safe GIS `script` failure stage; a normal Chrome user-agent fetch received the complete provider bundle, so hosted One Tap remained unproven rather than falsely counted as a dismissal.
- [x] (2026-08-15 00:39Z) Completed the cross-device, session, explicit-sign-out, phone, quota, same-email, and rollback canary slices. The confirming browser retained the email session across recreation while the requesting browser stayed signed out; sign-out survived reload; separate 45-card and 40-card local feeds were unchanged. Supabase had one user for the normalized approved address and no duplicate verified-email group. The rollback progressed through One Tap off, legacy Google, and account rollout off, then restored the intended internal state in successful Pages run 31854276819 at exact source `8a69ca8`.
- [x] (2026-08-15 00:47Z) Audited the canary PostHog person after removing the dashboard's default Internal-tests cohort exclusion. Search returned exactly one person, but the Google-owned user's email magic-link session still reported `auth_method=google`: live Supabase metadata retained only Google even though the magic link authenticated the same UUID. Implemented a narrow repair that verifies session `amr` for every Google-capable session, preserved the metadata-only fast path for email-only sessions, and added unit and browser fixture regressions. `npm test` passes 1,099 contracts, 131 shared Supabase tests, and every Deno check; the focused desktop/phone account and One Tap suite passes 11 cases with 3 intentional phone skips.
- [x] (2026-08-15 01:19Z) Completed the local repair checkpoint. Thirty-nine focused auth/analytics contracts pass. The full serial Playwright matrix passed 222 executed cases and skipped 525 intentional project combinations, with one unrelated Study History animation-class timeout; that exact case passed immediately in isolation in 3.2 seconds. A production-shaped internal build succeeded and the credential-bearing secret-pattern scan returned no match. `git diff --check` passes.
- [x] (2026-08-15 01:22Z) Resumed from the clean local checkpoint and published draft repair PR #150 from initial exact head `53cd76d`. A post-publication review confirmed local, remote-branch, and PR-head equality; inspected the complete GitHub patch plus controller, fixture, runbook, security, privacy, and switch-off boundaries; and found no additional defect or credential-bearing material. The PR remains draft until its final exact head passes protected `verify`.
- [x] Deploy all new behavior internal-only, then configure Google, Resend SMTP, the Supabase email template, and Turnstile in dependency order without printing secrets.
- [ ] Deploy the current-method attribution repair; repeat the email-to-PostHog canary; obtain a visible hosted One Tap proof in a real non-automated browser; then deliver the evidence closeout PR through protected merge and exact deployment proof.


## Surprises & Discoveries


- Observation: Edenia already persists onboarding completion and walkthrough resolution separately. `finishPersonalizedOnboarding()` stores `state.onboarding.setupCompleted = true`, and `completeWalkthrough()` stores `state.onboarding.walkthroughCompleted = true`. Both a completed walkthrough and a skipped or dismissed tracked walkthrough call `completeWalkthrough()`. This provides the exact durable conjunction required for One Tap without adding a new preference or migration.
  Evidence: `src/app.js` around `finishPersonalizedOnboarding()`, `maybeStartOnboarding()`, `completeWalkthrough()`, and `endWalkthrough()`.

- Observation: The current auth state deliberately exposes only user ID and email. Provider data must be derived from trusted Supabase session `app_metadata` or the successful sign-in route and reduced to a small presentation-safe value; raw session metadata and tokens must remain outside app view state.
  Evidence: `getSessionUser()` in `src/integrations/account-auth-controller.js` and the existing token-retention contract in `tests/contracts/account-auth-controller.test.mjs`.

- Observation: Authentication currently triggers separately built account consumers after session confirmation. One consumer sends a bounded reminder-eligibility snapshot through an existing RPC. Therefore acceptance must say that this auth work does not upload or replace the full local study document, not claim that a signed-in internal account performs no server write of any kind.
  Evidence: `initializeAccountAuth()`, `getAccountStudySnapshot()`, and `src/integrations/account-study-snapshot-controller.js`.

- Observation: The existing `/unsubscribe/` output is an analytics-free standalone GitHub Pages page with restrictive CSP, `no-referrer`, token redaction, a dedicated bundle, and focused build tests. `/auth/confirm/` should reuse that build shape rather than introducing a framework or routing system.
  Evidence: `unsubscribe/index.html`, `src/reminder-unsubscribe-page.js`, `scripts/build-site.mjs`, and `tests/contracts/reminder-unsubscribe-page.test.mjs`.

- Observation: Google documents `initialize()` as a generally one-time configuration, while Edenia requires a fresh nonce per credential opportunity. The controller must therefore treat one active GIS configuration as one credential opportunity: generate and capture a nonce before initialization/rendering, let the first credential consume it, cancel competing UI, and rebuild the rendered opportunity with a new nonce only after the previous one has completed or failed. A test must reject duplicate callbacks for a consumed opportunity.
  Evidence: Google Identity Services JavaScript API behavior and the Supabase raw-versus-hashed nonce contract.

- Observation: Supabase's Free default SMTP limit is two messages per hour and now restricts branded email-template customization for affected Free projects. Resend custom SMTP is not optional for a production-shaped branded fallback. Resend Free currently allows one domain, so the already verified `mail.edenia.study` domain must be shared with reminders.
  Evidence: current Supabase Auth documentation and changelog, Resend pricing and SMTP documentation, and `docs/account-reminder-operations.md`.

- Observation: Edenia's current `master` branch protection is compatible with fully autonomous delivery. The branch requires a strict, up-to-date `verify` check, requires zero approving reviews, applies protection to administrators, and allows the repository's established merge-commit style. No open pull request currently occupies the planned authentication branch.
  Evidence: `gh api repos/BriceChivu/Edenia/branches/master/protection`, `gh repo view BriceChivu/Edenia --json mergeCommitAllowed,squashMergeAllowed,rebaseMergeAllowed`, and `gh pr list --state open`, checked 2026-08-14.

- Observation: A classic-script global named `status` collides with the browser's special `window.status` property after bundling, turning the confirmation status element into a string and breaking the page. Renaming the binding to `statusElement` fixed the real browser failure. The `frame-ancestors` directive is ignored in a meta CSP, so the ineffective directive was removed and the entry now discards the captured fragment and remains disabled whenever it is framed.
  Evidence: the first Playwright confirmation run raised `Cannot set properties of undefined (setting 'authConfirmTone')` and Chromium's ignored-meta-directive warning; the repaired desktop suite passes scrub, success, retry, and invalid cases with no console errors.

- Observation: Production-origin test loads can legitimately refresh Anki statistics and change volatile timestamps independently of authentication. Disabling Anki in the seeded auth fixture produced a byte-for-byte study-document assertion that isolates the auth operation instead of conflating it with an existing live integration.
  Evidence: the initial exact-string comparison differed only in `anki.*.loggedAt`; with the normal integration disabled in the fixture, Google button, automatic prompt, email request, and sign-out preserve the exact serialized study document on desktop and phone.

- Observation: `@supabase/auth-js` returns `AuthRetryableFetchError` with status `0` for network failures, rather than always throwing. Treating only absent, 408, 429, and 5xx statuses as retryable would permanently discard a still-usable magic-link capability after a real offline fetch failure.
  Evidence: the pinned `auth-js` fetch boundary constructs status-zero retryable errors; a new controller contract now proves a status-zero response can be deliberately retried once connectivity returns.

- Observation: Verified `getClaims()` can fall back to `/auth/v1/user` for projects using symmetric JWT signing. Calling it for every restored session would add provider traffic and console failures to ordinary offline sessions. Live automatic linking proved that every Google-capable session needs current-method disambiguation, even when provider metadata lists only Google; email-only metadata remains definitive.
  Evidence: the first post-review browser run exposed the extra `/user` requests; the live Google-then-email canary exposed the overly narrow linked-provider condition; the repaired Google-capable condition maps verified `oauth` to Google and `magiclink` to email while preserving the no-claims email-only contract.

- Observation: CI intentionally overrides the normal Playwright origin to `http://localhost:4173` and starts a second fixed server on `http://localhost:8000` for flows whose exact-origin security contract permits only port 8000. New tests that navigate relatively can pass locally yet fail correctly in CI because the confirmation controller refuses 4173.
  Evidence: PR #148 run 31821532747 passed 217 browser cases and failed only the six new hardcoded-origin cases; `EDENIA_TEST_NORMAL_PORT=4173` with explicit port-8000 navigation passes the affected desktop and phone-small matrix.

- Observation: The live static build necessarily contains the public Supabase API origin in runtime configuration and the confirmation page's restrictive `connect-src` policy. It remains absent from visible homepage/confirmation copy, top-level navigation, provider prompts, and branded email links, which is the locked Free-plan boundary; eliminating source/network discoverability would require the excluded proxy or paid custom-domain approach.
  Evidence: exact Pages merge `79ed25f` and run 31823673854, followed by live DOM and provider-script checks at the public root and `/auth/confirm/` on 2026-08-14.

- Observation: Immediately before provider configuration, the Supabase organization still reports `free`; Resend Free still documents 3,000 transactional emails per month and 100 per day; Cloudflare Turnstile Free still permits up to 20 widgets and unlimited challenges; and Supabase default SMTP still permits only two messages per hour to project-team addresses while custom SMTP starts at 30 messages per hour.
  Evidence: Supabase project/organization connector plus current official Supabase, Resend, and Cloudflare documentation checked 2026-08-14.

- Observation: The live Supabase project currently has custom SMTP disabled, and the Free dashboard therefore locks email-template editing to the default templates. Resend's verified `mail.edenia.study` domain is healthy, but its only existing sending credential is the separately scoped reminder credential; Cloudflare likewise has no existing Turnstile widget to reuse. The next safe provider step is creation of two new least-privilege credentials rather than expanding or rotating either reminder resource.
  Evidence: authenticated Resend, Supabase, and Cloudflare dashboard inventory on 2026-08-14; both creation forms are staged without submitting them.

- Observation: `supabase config push` is an applying command, not a diff-only preview. With Auth sections absent, the CLI compares and writes its generated localhost defaults; it can partially apply one service before a later service fails. Edenia's previous function-only file therefore was not safe for production config pushes even though ordinary function deployment had not exposed the issue.
  Evidence: the first command changed the remote Auth URL, returns, email confirmation, OTP, and TOTP values, then failed with HTTP 402 while trying to enable paid vector buckets. The repaired explicit config restored every observed prior value, added only the two intended confirmation returns, kept vector buckets false, and an immediate second push reported every service up to date.

- Observation: Hosted Supabase email templates are configured separately from the production CLI Auth values tracked in `supabase/config.toml`. Keeping the exact reviewed HTML in the repository gives the dashboard operation a source of truth without incorrectly implying that a config push installs the hosted template.
  Evidence: current Supabase Auth email-template documentation and the passing `versioned magic-link template stays branded and scanner-resistant` source contract.

- Observation: Supabase Studio can report a successful custom-SMTP update yet render the toggle as disabled after reload because the password is write-only while the current Studio `isSmtpEnabled()` helper requires `SMTP_PASS` in the read response. Delivery evidence is authoritative: the canary appeared in the dedicated Resend credential's log with the configured sender and was delivered.
  Evidence: authenticated SMTP `235` response, Supabase Studio source at `SmtpForm.utils.ts`, and the delivered Resend canary on 2026-08-14.

- Observation: Supabase Auth caches a loaded hosted email template for ten minutes. The first Studio editor paste appended the reviewed HTML to the default body, and immediate retries continued serving that cached concatenation even after the hosted source had been replaced exactly. After cache expiry, the live email contained only the exact reviewed HTML and its generated branded plain-text alternative.
  Evidence: `supabase/auth` template cache defaults `TemplateMaxAge` to `10m`; exact clipboard comparison of the persisted Studio source; and four progressively timed Resend canaries, with the final protected canary free of default copy and opaque links.

- Observation: The protected hosted magic-link flow works end to end, but repeated Settings/onboarding renders logged `Turnstile has already been rendered in this container`. This is a real lifecycle warning even though token acquisition and the Supabase-protected request succeeded; it must be repaired or conclusively shown to be harmless before the evidence PR.
  Evidence: live internal browser console on exact Pages deployment 31850052744 and the simultaneously successful protected canary.

- Observation: The duplicate-Turnstile warning was a real asynchronous lifecycle race rather than a provider false positive. Two calls made before `loadScript()` settled both saw no completed mount and later called `render()` for the same element. Deduplicating an in-flight operation per container preserves option-change rerendering while ensuring identical concurrent mounts share one provider render.
  Evidence: hosted warning on deployment 31850052744; deferred-loader regression in `tests/contracts/turnstile-controller.test.mjs`; passing rebuilt desktop/phone auth flows.

- Observation: The embedded browser completed manual GIS ID-token sign-in earlier, but neither its subsequent fresh lifecycle nor a fresh Chrome lifecycle rendered One Tap. Both reached Edenia's explicit `googleIdentityStatus=unavailable` state while the Google script URL was present and observed as a page resource; Chrome produced no application or Google console detail beyond an unrelated extension warning. This is a script-boundary failure, not a valid Google cooldown/dismissal result, so it cannot count as the hosted One Tap canary and must be retried or diagnosed after the repair deploy.
  Evidence: fresh hosted internal pages in both connected browser surfaces on 2026-08-14, page asset inventory, DOM status, and console inspection; the official endpoint independently returned HTTP 200 with a non-empty JavaScript body.

- Observation: Adding a safe initialization-stage signal exposed a preexisting cleanup gap: the controller assigned the candidate before calling GIS `initialize()`, but its broad failure handler did not clear that candidate when initialization threw. A later prompt attempt could therefore reuse an opportunity that Google never initialized. Explicitly zeroing and discarding only the failed assigned candidate restores the existing fresh-opportunity invariant.
  Evidence: fresh PR #149 review and `initialization failure discards the candidate before a fresh retry` controller contract.

- Observation: Supabase automatic linking can authenticate a same-email magic link into a Google-owned UUID without retaining a second email identity or adding email to `app_metadata.providers`. Application-level current-method attribution must therefore use the verified session `amr`; provider rows alone prove account ownership, not the method used for this session.
  Evidence: read-only production Auth queries found one matching user, one retained Google identity, no duplicate verified-email group, and equal UUIDs for the Google and magic-link sessions; PostHog initially retained `auth_method=google` after the email confirmation.

- Observation: PostHog's Persons dashboard applies an Internal-tests cohort exclusion by default. A correct canary person is invisible until that chip is removed, after which the approved normalized address resolves to exactly one person.
  Evidence: authenticated PostHog dashboard search before and after removing the default exclusion on 2026-08-15.

- Observation: GitHub Pages gives `config.local.js` a ten-minute browser cache. A tab can temporarily show the previous rollback stage even after the exact deployment succeeded, so switch verification needs both the workflow's exact head SHA and a cache-busted live configuration fetch.
  Evidence: four exact-source rollback deployments ending with restore run 31854276819; fresh cache-busted responses matched each stage while previously opened tabs lagged.

- Observation: One canary inspection rendered a one-use magic-link capability in ephemeral tool output. The capability was immediately consumed by the intended confirmation and became unusable; no permanent credential was exposed.
  Evidence: successful deliberate confirmation followed by fragment absence and one-use invalidation. Future canaries must transfer the link directly to the browser without displaying the message body, address, or capability.


## Decision Log


- Decision: Track production Auth site/return URLs, email confirmation/frequency/OTP, TOTP, and the Free-plan vector-bucket disable explicitly in `supabase/config.toml`; treat every future `supabase config push` as a full-service production mutation and require an immediate idempotent second-push check.
  Rationale: Implicit CLI defaults can overwrite live Auth settings and attempt paid features even when the repository previously used the file only for Edge Function declarations. Making the non-secret invariants explicit prevents recurrence and provides a reviewable exact-origin source of truth.
  Date/Author: 2026-08-14 / Codex after immediate restoration of an unexpected partial push.

- Decision: Version the production magic-link HTML under `supabase/templates/`, but install it through the hosted Auth template editor only after custom SMTP is active.
  Rationale: The repository must preserve the exact reviewed branding and fragment-token contract, while the hosted provider operation has an independent lifecycle and must not be conflated with `supabase config push`.
  Date/Author: 2026-08-14 / Codex.


- Decision: Use Google Identity Services JavaScript API only, with Google's rendered button, One Tap, and cancelable automatic sign-in; do not mix the HTML API or preserve a hidden custom-button trigger.
  Rationale: Google owns the trusted identity UI and does not support programmatically triggering it from Edenia's current custom button. One integration path prevents double initialization and duplicate callbacks.
  Date/Author: 2026-08-14 / user and Codex.

- Decision: Add `EDENIA_GOOGLE_SIGN_IN_MODE=off|oauth_redirect|id_token` and `EDENIA_GOOGLE_ONE_TAP_ENABLED=true|false` as internal rollout controls, defaulting to the existing redirect and false when absent. The global account rollout remains the audience gate.
  Rationale: The transport can be deployed inert, switched to ID-token mode only for the canary, and rolled back without making accounts public. One Tap can be disabled independently while keeping the manual official button.
  Date/Author: 2026-08-14 / Codex, implementing the user's reversible Free-option choice.

- Decision: Treat the old Supabase OAuth redirect as an internal rollback only. Never silently fall back to it after a GIS error once public account work is considered later.
  Rationale: A fallback navigation would reintroduce the exact opaque hostname this work removes from ordinary user-visible Google sign-in.
  Date/Author: 2026-08-14 / user and Codex.

- Decision: Use the existing `setupCompleted && walkthroughCompleted` state, plus signed-out and no-active-walkthrough checks, as One Tap eligibility. Do not add a new onboarding flag.
  Rationale: The current persisted states already mean onboarding finished and the walkthrough was completed or skipped. Reusing them removes a special case and survives reloads.
  Date/Author: 2026-08-14 / user and Codex.

- Decision: Put magic-link `TokenHash` in the URL fragment, remove it from history before other page work, and require a deliberate button before `verifyOtp({ token_hash, type: 'email' })`.
  Rationale: Fragments are not sent in the HTTP request or referrer, and a security scanner that merely requests the page cannot consume the one-time capability.
  Date/Author: 2026-08-14 / user and Codex.

- Decision: Configure Turnstile only after its client token path is deployed and verified. If Supabase's project-wide CAPTCHA behavior breaks Google ID-token sign-in, immediately disable CAPTCHA and correct the design before continuing rather than accepting a degraded Google flow.
  Rationale: Provider configuration must follow the client capability it enforces, and Google is the primary low-friction method.
  Date/Author: 2026-08-14 / user and Codex.

- Decision: Identify PostHog with the Supabase UUID and attach normalized email and auth method as person properties. Never identify by email or Google subject.
  Rationale: The UUID remains stable across linked identities; properties provide the requested searchability without splitting or merging people by a mutable address.
  Date/Author: 2026-08-14 / user and Codex.

- Decision: Verify session claims for every Google-capable user before publishing the current auth method; retain the metadata-only path for email-only users.
  Rationale: Supabase can authenticate a same-email magic link into a Google-owned UUID while provider metadata remains Google-only. Verified `amr` distinguishes that email session, and limiting the request to Google-capable users avoids unnecessary traffic for unambiguous email-only sessions.
  Date/Author: 2026-08-15 / Codex after the live Google-then-email canary.

- Decision: Do not add `Your study progress stays in this browser. Signing in won’t upload or replace it.` to onboarding.
  Rationale: The user explicitly rejected that copy. Regression coverage should preserve its absence while retaining existing positive onboarding copy.
  Date/Author: 2026-08-14 / user.

- Decision: Make no database migration in this work item.
  Rationale: Supabase Auth already owns users, identities, sessions, and automatic same-email linking. Existing account tables already key ownership by the Supabase UUID. Adding an application identity table would duplicate knowledge and create reconciliation paths with no validated need.
  Date/Author: 2026-08-14 / Codex.

- Decision: Treat the user's latest instruction as standing authorization for Codex to carry every in-scope milestone through repository edits, existing-provider configuration, draft pull request, review and repair, protected merge, deployment verification, canary, rollback rehearsal, and evidence closeout without asking for routine approvals.
  Rationale: A partially autonomous plan would recreate avoidable waiting points between already locked decisions. Safety comes from the scope, Free-plan, gate, exact-head CI, canary, and rollback contracts, not from repeated confirmation prompts.
  Date/Author: 2026-08-14 / user and Codex.

- Decision: Use two autonomous GitHub delivery loops. Merge an inert implementation PR before live provider activation, then merge a small evidence/runbook PR after provider configuration and the canary.
  Rationale: Provider settings must depend on deployed client capability. Keeping live evidence out of the implementation merge avoids activating CAPTCHA or templates against code that is not yet hosted, while the second PR preserves an auditable final state.
  Date/Author: 2026-08-14 / Codex.

- Decision: Use a normal merge commit for both PRs unless repository settings change before execution, and never bypass the strict `verify` protection.
  Rationale: Recent Edenia feature PRs use merge commits, `master` permits them, and a merge commit preserves the review boundary. If the repository later permits a different method but blocks merge commits, use an allowed non-destructive method and record the reason.
  Date/Author: 2026-08-14 / Codex.


## Outcomes & Retrospective


Implementation PR #148 and repair/provider-stage PR #149 were protected-merged and exactly deployed. Dedicated Resend SMTP, the exact hosted branded template, Turnstile, protected cross-device email confirmation, manual Google ID-token sign-in, same-email UUID convergence, separate local-state preservation, session restoration, explicit sign-out, phone geometry, PostHog searchability, and the complete ordered rollback rehearsal now have live evidence. The canary also found that Supabase retains Google-only provider metadata after an email magic-link session into that UUID; the resulting PostHog method misattribution is repaired and tested locally but not yet deployed. A new email confirmation must prove `auth_method=email` after that deployment. The hosted GIS script boundary still prevents a visible automated One Tap prompt from being counted as proof; local desktop/phone tests cover its gating, dismissal, and sign-out suppression. The attribution repair delivery, real-browser One Tap proof, and final evidence PR remain open. At final completion, summarize the manual and automatic Google sign-in behavior, email delivery and confirmation behavior, PostHog identity result, same-email UUID proof, local-state preservation evidence, external configuration, all PRs and exact merged/deployed SHAs, switch-off rehearsal, and any browser/provider limitations discovered. State explicitly whether the public path stayed unchanged and whether all services remained on their Free plans.


## Context and Orientation


Edenia is a static browser application built into `_site` and deployed by `.github/workflows/deploy-pages.yml`. `config.local.js` populates public `window.EDENIA_CONFIG`; `src/integrations/runtime-config.js` reads it. The existing account audience gate is computed from `EDENIA_ACCOUNT_FEATURES_ROLLOUT` through `src/core/account-feature-rollout.js`. `internal` exposes account UI only when the app also recognizes `?internal_test=1`. This query parameter is a rollout selector, not an authorization boundary.

`src/integrations/supabase-client.js` constructs one pinned Supabase browser client with PKCE, persistent sessions, and automatic refresh. `src/integrations/account-auth-controller.js` owns session restoration, safe view state, Google OAuth, magic-link requests, and local-scope sign-out. Its `onAuthStateChange` callback schedules a later `getSession()` so consumers do not race token installation. Preserve this sequencing for both `signInWithIdToken` and `verifyOtp`.

`src/app.js` renders the Account section in Settings and the optional account step at the end of personalized onboarding. `src/features/settings/account-actions.js` and `src/features/onboarding/account-actions.js` bind current controls. The Google controls are custom Edenia buttons today; replace them with stable mount containers that the GIS controller fills using `google.accounts.id.renderButton()`. Email remains an Edenia form.

`maybeStartOnboarding()` starts onboarding until `state.onboarding.setupCompleted`, then schedules the first-study walkthrough until `state.onboarding.walkthroughCompleted`. `endWalkthrough()` marks tracked completion for completed, skipped, and dismissed exits. A manual replay uses an already-complete persisted state but still sets `walkthroughState.active`; the prompt policy must suppress One Tap while any walkthrough is visibly active and reevaluate after it ends.

`src/integrations/account-analytics-identity.js` currently deduplicates and resets UUID identification, and `analytics.js` currently calls `posthog.identify(uuid)` without properties. Extend this boundary rather than calling PostHog directly from auth UI. The stable UUID remains the only distinct identifier. Normalize email before forwarding it, reduce provider to a fixed value such as `google` or `email`, and never forward session objects.

`scripts/build-site.mjs` already emits `/unsubscribe/` as a separate analytics-free page and bundle. Add `/auth/confirm/` through the same explicit build pipeline. The confirmation page needs public Supabase URL and publishable key from `config.local.js`, but no analytics, main application bundle, reminder bundle, Google script, Turnstile script, local study-state read, or account-data consumer.

The provider boundary is deliberately visible in browser source and network tools because a Free static Supabase client needs a public URL and publishable key. Success means no opaque project reference in ordinary UI, identity prompts, top-level auth navigation, email content, or clickable links. Do not claim that the project reference is secret or technically undiscoverable.


## Ousterhout Complexity Lens


The current implementation is simple because one account controller delegates Google to Supabase's redirect, but that simplicity is paid for in visible infrastructure branding. Adding GIS, One Tap, nonce handling, two rerendering button surfaces, Turnstile, and a second static page directly inside `src/app.js` would move substantial temporal complexity into the application's largest module. Every future render or onboarding change would then need to understand provider script state, credential consumption, and prompt cooldowns.

The new complexity is paid by two deep provider modules and one narrow confirmation-page module. `google-identity-services-controller.js` hides script loading, official rendering, active credential opportunity, nonce hashing, callback deduplication, prompt eligibility synchronization, cancellation, and auto-select suppression behind four app-facing operations. `turnstile-controller.js` hides script/widget/token lifecycle behind form mounting and token consumption. `account-auth-confirm-page.js` hides fragment parsing, redaction, deliberate exchange, and recoverable result states from its static entry file.

The simpler boundary is state in and safe outcome out. `src/app.js` supplies account/onboarding/walkthrough eligibility and DOM mount points; it never manipulates Google tokens, nonce bytes, iframe internals, Turnstile tokens, or token hashes. `account-auth-controller.js` exchanges ephemeral credentials with Supabase and publishes only safe account state. Analytics receives only UUID, normalized email, and a fixed method value.

The design removes special cases rather than adding new flags for them. Existing `setupCompleted` and `walkthroughCompleted` state defines prompt readiness; the current account rollout defines audience; the existing Supabase client defines session ownership; the existing standalone-page build shape defines confirmation isolation; and Supabase automatic linking defines same-email identity. No custom Google button, client-side email account matching, application identity table, OTP screen, router, or progress-sync mode is introduced.

Future changes become easier at the provider seams. One Tap can be switched off without removing the official button, the ID-token transport can be rolled back without changing session consumers, email delivery can be unavailable without breaking Google, and a later public rollout can evaluate legal/branding gates without reopening nonce or token-redaction internals. The cost is additional focused controller tests, which is intentional because they localize the difficult temporal behavior.


## Autonomous Execution Authority


This ExecPlan is an execution authorization, not merely advice. Codex should begin from the current repository, resolve ordinary implementation details from source and current primary documentation, update this living plan as evidence accumulates, and continue through the next safe milestone without asking the user what to do next. The authorization includes repository writes, tests, builds, browser control, use of already configured task-relevant credentials, external provider configuration required by the plan, internal test messages to pre-authorized recipients, Git commits and pushes, draft and ready pull-request transitions, review repairs, merge, deployment observation, canary operations, and rollback.

Autonomy does not mean bypassing evidence. Before each push, Codex must preserve unrelated work, stage only intended files, inspect the complete diff, and run the proportionate local gates. After each push, it must verify that local HEAD, remote branch HEAD, and pull-request head are identical; wait for the strict `verify` check on that exact SHA; distinguish code-owned failures from unrelated or flaky failures using logs; repair code-owned failures; and rerun the smallest trustworthy test before the broad gate. It must not mark a PR green based only on local success, stale CI, a different SHA, or a manually ignored failure.

Review means a fresh defect-finding pass, not a ceremonial summary or a formal self-approval that GitHub may reject. Codex must inspect the final diff for security, privacy, nonce/token leakage, account switching, callback races, prompt gating, local-state mutation, accessibility, five-locale behavior, desktop/phone geometry, build output, runtime switch-off, secrets, and scope drift. It should fix every substantiated issue, rerun affected tests, update the draft PR, resolve actionable review threads when permitted, and repeat until no known blocker remains. Because branch protection currently requires no approving review, a clean fresh review plus exact-head `verify` is sufficient to mark the PR ready and merge.

The authorization has hard boundaries. Codex must not incur a charge or upgrade a plan, make accounts public, enable reminder delivery beyond its existing separate controls, delete accounts or analytics data, message an unapproved recipient, expose or repurpose a credential, rewrite protected history, bypass branch protection, weaken acceptance, or broaden the feature. A provider permission failure, unavailable login, unexpected cost, exposed secret, protected workflow requiring another actor, or newly discovered product choice outside `decision.md` is a real blocker. In that case, leave all gates in the safest state, record exact evidence in `Progress` and `Surprises & Discoveries`, and ask only for the missing access or decision.


## Plan of Work


### Milestone 1: Add reversible public runtime controls


Extend `scripts/runtime-config-flags.mjs`, `scripts/write-runtime-config.mjs`, `scripts/local-runtime-config.mjs`, `src/integrations/runtime-config.js`, `config.example.js`, and `.github/workflows/deploy-pages.yml` with three public values: Google sign-in mode, Google One Tap enabled, and Turnstile site key. Parse the mode through a strict allowlist. Missing or invalid values must preserve current behavior: existing OAuth redirect for Google, no automatic prompt, and no Turnstile-protected request. Never put a Google client secret, Turnstile secret, Resend API key, SMTP credential, Supabase secret, or service-role key in `window.EDENIA_CONFIG` or GitHub Pages build variables.

Include the Google Web client ID as a fourth public runtime value because GIS needs it in the browser. Validate its basic shape but do not pretend client-side syntax validation proves Google configuration. `hasSupabaseRuntimeConfig()` remains about Supabase only; add narrowly named Google and Turnstile readiness helpers so unavailable GIS does not hide the email fallback.

Update `tests/contracts/runtime-environment.test.mjs`, `tests/contracts/runtime-config-flags.test.mjs`, `tests/contracts/local-runtime-config.test.mjs`, and `tests/contracts/build-output.test.mjs`. Prove absent settings are inert and the internal global gate still owns all account initialization.

Milestone 1 is complete when a normal build contains no provider secret, absent variables reproduce existing behavior, and the canary mode can be selected without changing source.


### Milestone 2: Replace the Google redirect transport behind the canary mode


Create `src/integrations/google-identity-services-controller.js` as the deep boundary that owns loading `https://accounts.google.com/gsi/client` once, validating the expected global, generating nonce bytes with Web Crypto, hashing the nonce with SHA-256, configuring GIS, rendering official buttons, prompting One Tap, deduplicating a credential callback, suppressing active UI, and disabling auto-select on explicit sign-out. Keep the raw nonce and ID token in closure memory only. Do not decode the ID token in Edenia; Supabase validates it.

The controller should expose a small interface:

    createGoogleIdentityServicesController({
      clientId,
      exchangeCredential,
      loadScript,
      crypto,
      googleTarget,
      onStatusChange
    })

    controller.mountButton(element, { locale, width })
    controller.synchronizePrompt({ eligible, autoSelect })
    controller.prepareForExplicitSignOut()
    controller.destroy()

`mountButton()` is idempotent across Edenia rerenders and can support both current surfaces without loading the script twice. `synchronizePrompt()` prompts at most once per eligible page lifecycle and cancels or suppresses when signed in, onboarding is incomplete, a walkthrough is active, or the gate/mode changes. Google's cooldown and opt-out outcomes are ordinary no-op statuses, not Edenia errors or blockers. `prepareForExplicitSignOut()` cancels the prompt and calls `disableAutoSelect()` when available.

Extend `src/integrations/account-auth-controller.js` with a transport-neutral method:

    signInWithGoogleIdToken({ token, nonce })

It calls only:

    client.auth.signInWithIdToken({
      provider: 'google',
      token,
      nonce
    })

and returns a safe boolean/state result. It must not retain the inputs. Keep `signInWithGoogle()` for the guarded legacy mode until the canary has completed. Extend the auth-client capability check to require `signInWithIdToken` only when that transport is constructed, so missing GIS config does not disable email. Preserve session confirmation through the existing auth event queue.

Replace the custom Google button markup in `src/app.js` with mount containers in ID-token mode and retain the existing custom button only in the explicit legacy mode. Mount the official button after each Settings/onboarding rerender. Configure Google button text, theme, size, locale, and responsive width only through supported `renderButton()` options; do not restyle or overlay the Google iframe. If GIS cannot load, show safe localized feedback while leaving the email form usable. Update five locale dictionaries only for new statuses and confirmation-page text; do not add the rejected progress sentence.

After `initializeAccountAuth()` has a confirmed signed-out state, synchronize the prompt with current onboarding and walkthrough state. Reevaluate after onboarding reload, `startWalkthrough()`, and `endWalkthrough()`. The eligibility predicate is all of: account feature enabled, ID-token mode, One Tap flag enabled, signed out, `setupCompleted`, `walkthroughCompleted`, no active walkthrough, not sandbox, and supported production/internal origin. Do not prompt from the optional onboarding account step itself.

Add focused contracts for singleton script loading, two button mounts, safe rerendering, supported render options, one active credential opportunity, SHA-256-to-Google/raw-to-Supabase nonce pairing, duplicate callback rejection, no secret persistence/logging, exchange failure and retry with a fresh nonce, eligibility transitions, Google cooldown no-op, and `disableAutoSelect`. Update `tests/contracts/account-auth-controller.test.mjs`, `tests/contracts/account-auth-integration.test.mjs`, onboarding/Settings action tests, and the relevant analytics classic-bundle allowlist.

Milestone 2 is complete when mocked GIS signs in through the shared Supabase client without a top-level navigation, both official button mounts work, One Tap is impossible before both onboarding flags are true, explicit sign-out cannot immediately auto-select again, and legacy mode remains a deliberate internal rollback.


### Milestone 3: Build the Turnstile-protected, scanner-resistant email fallback


Create `src/integrations/turnstile-controller.js` to lazy-load the official Turnstile script once, render or reset widgets for the current email form, keep each token only in memory, expire it after provider callback or five minutes, and consume it after one request. It must support Settings and onboarding rerenders without reusing a token or duplicating the script. The visible form remains usable with keyboard and screen reader. An unavailable challenge publishes a safe retry status and sends no magic-link request.

Change `account-auth-controller.sendMagicLink` to accept a normalized email and a one-use `captchaToken`, then call:

    client.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: confirmUrl,
        shouldCreateUser: true,
        captchaToken
      }
    })

Allow only `https://www.edenia.study/auth/confirm/` and `http://localhost:8000/auth/confirm/` as confirmation destinations. Keep the existing resend cooldown or add a simple one-minute client cooldown if the current UI has none; server/provider limits remain authoritative. Reset Turnstile after every response because tokens are single-use. Do not put email or captcha tokens in URLs, logs, analytics, local state, or user metadata.

Create `auth/confirm/index.html`, `auth/confirm/style.css`, `src/integrations/account-auth-confirm-page.js`, and `src/account-auth-confirm-page.js`. Update `scripts/build-site.mjs` to version, bundle, minify, and emit `auth/confirm/index.html`, `auth/confirm/style.css`, and `auth/confirm/confirm.js`. Use a restrictive CSP, `Referrer-Policy: no-referrer`, `robots: noindex, nofollow`, and the minimum `connect-src` needed for the configured Supabase API. Include no analytics or third-party provider script.

The confirmation page parser accepts only its exact production or localhost origin/path, a bounded token hash, and `type=email` from the fragment. Its entry script must read the fragment into a closure and immediately call `history.replaceState` to remove it before installing the button handler. The page first shows a confirmation state with **Continue to Edenia**. Only a click or keyboard form submission calls:

    client.auth.verifyOtp({
      token_hash: tokenHash,
      type: 'email'
    })

On success, replace the page with a success state and offer an exact return to `/?internal_test=1&account=1`; do not place a token or provider hostname in that link. On invalid, expired, or already-used responses, discard the in-memory token and offer a return to request another link. On offline or transient failure, retain the in-memory token only for an explicit retry on the same page. Never poll the requesting browser.

Configure the Supabase magic-link template to use a branded Edenia button whose `href` is exactly `https://www.edenia.study/auth/confirm/#token_hash={{ .TokenHash }}&type=email`. The email body and plain-text alternative must not contain `{{ .ConfirmationURL }}` or the opaque Supabase project hostname. Keep the user-facing link text branded and understandable. Because the raw fragment is not sent to the server, a scanner loading `/auth/confirm/` cannot consume it; the deliberate page action is still the only exchange.

Add contracts for fragment grammar/redaction order, no automatic verification, exact-origin returns, safe errors, retry disposal, no analytics/imports/local-state reads, CSP and referrer policy, bundled output, and token absence from DOM/storage/log calls. Add Playwright coverage in desktop Chromium and phone geometry for request, challenge, email-sent feedback, confirm-before-exchange, success, invalid, offline retry, and switch-off behavior. Use Cloudflare and Supabase test keys or mocks locally; never commit live secrets.

Milestone 3 is complete when the email request cannot be sent without a valid one-use Turnstile token, the built confirmation page never consumes a token on load, and every visible URL and email link remains on `www.edenia.study` or the exact localhost development origin.


### Milestone 4: Complete stable PostHog account identity without touching full local progress


Extend `getSessionUser()` to expose only normalized `userId`, normalized email, and a fixed auth method/provider derived from trusted Supabase session information. Do not expose `app_metadata`, `user_metadata`, identities, access tokens, or refresh tokens. When a restored session cannot identify the last method safely, use a neutral fixed value such as `unknown` instead of guessing from email.

Change `src/integrations/account-analytics-identity.js` so `synchronize()` calls the existing bridge as `identify(userId, properties)`, where properties contain the normalized email and fixed provider/method fields. Preserve UUID validation, deduplication, logout reset, and reset-before-account-switch. If the same user later gains a changed email/provider property, update identification properties without resetting or changing `distinct_id`.

Change `analytics.js` so `identifyAuthenticatedUser(userId, properties)` validates the UUID and an allowlisted property shape, then calls `posthog.identify(normalizedUserId, safeProperties)`. This merges the current anonymous history into the authenticated person by PostHog's normal identify behavior. Keep `setPersonProperties` for general state snapshots; do not copy email into the local analytics snapshot or any event. Update `src/integrations/analytics-bridge.js` tests to prove arguments and receiver remain intact.

Add tests for normalized searchable email, provider/method, first anonymous-to-account identify, repeated events, property refresh, logout, account switch, malformed UUID, malformed email, and PostHog unavailability. Assert email and Google subject are never used as the first identify argument. Assert ID tokens, nonces, captcha tokens, and session objects cannot cross this boundary.

Before and after each auth E2E path, hash or structurally snapshot the normal/internal-test `edenia_v1` study document and the selected backup key. Prove Google button, One Tap, automatic sign-in, magic-link confirmation, restored session, sign-out, and account switch do not replace, merge, clear, or widen the full local study document. Existing reminder preferences and the bounded reminder-eligibility snapshot may continue under their existing gate and tests; this work must not alter `createReminderEligibilitySnapshot`, its RPC payload, or reminder delivery controls.

Update `docs/account-authentication.md` and `docs/account-reminder-operations.md` to distinguish auth identity, PostHog properties, full local study state, and the existing bounded reminder snapshot. Preserve the positive onboarding text and add a regression that the rejected sentence remains absent.

Milestone 4 is complete when one Supabase UUID is the PostHog `distinct_id`, its email is searchable as a person property, resets are correct on a shared browser, and all auth flows preserve the preexisting full local study document.


### Milestone 5: Publish, review, merge, and deploy the inert implementation


Once Milestones 1 through 4 pass locally, Codex owns the complete first GitHub delivery loop. Fetch `origin`, preserve any unrelated working-tree state, and ensure the focused branch is based on current `origin/master`. Use `codex/frictionless-authentication-internal-canary` unless that exact branch already contains this work. If `master` advanced, rebase the focused branch non-interactively, resolve only in-scope conflicts, and rerun the affected and broad gates before publication.

Commit coherent vertical slices with clear messages, stage only intended files, and ensure generated `_site` output remains untracked unless the repository already requires it. Push the branch and open a draft PR against `master`. The body must state the user-visible outcome, the internal gates, `Public path: unchanged`, Free-plan constraint, local test evidence, provider steps deliberately not yet activated, security/privacy boundaries, rollback, and the remaining live canary. If a PR already exists for the exact head/base pair, update it rather than creating a duplicate.

Perform the fresh review required by `Autonomous Execution Authority` while the PR is draft. Inspect `origin/master...HEAD`, run `git diff --check`, scan static output and the diff for secrets or tokens, and reread every auth, analytics, onboarding, build, and test change in context. Fix substantiated defects in focused commits. Read CI logs for failures, repair code-owned failures, and push until the exact remote head passes the required `verify` check. Address actionable human or automated review comments that appear; do not wait for a review when no review is required.

When the final local SHA, remote SHA, and PR head match, `verify` is green for that SHA, the PR is mergeable with no unresolved blocking thread, and the review finds no known issue, mark the PR ready and merge it with a normal merge commit. Do not use administrator bypass. Record the PR number and URL, final head SHA, check run URL/result, merge SHA, and merge method in `meta.json` and this plan. Then wait for the Pages workflow triggered by the merge and verify that it deployed the exact merge SHA.

The deployed implementation must still be inert or internal-safe: `EDENIA_ACCOUNT_FEATURES_ROLLOUT=internal`, Google legacy or off, One Tap false, and Supabase CAPTCHA disabled. Confirm `/auth/confirm/` exists, the ordinary root exposes no Account UI, and no provider was activated merely by the merge. Delete the remote feature branch only after the merge and deployed-SHA proof, if no follow-up work depends on it.

Milestone 5 is complete when the implementation PR is merged through branch protection, the exact merge is deployed, the public accountless route is unchanged, and the hosted code is ready for provider configuration without requiring another source deployment.


### Milestone 6: Configure providers in a safe dependency order


Begin only from Milestone 5's verified inert deployment. Reconfirm `EDENIA_ACCOUNT_FEATURES_ROLLOUT=internal`, Google legacy or off, One Tap false, and Supabase CAPTCHA disabled. Confirm the live build emits `/auth/confirm/`, the normal public root still has no Account UI, and no provider behavior changed merely because code exists.

In Google Auth Platform, use a Web application client, Edenia branding, only the basic `openid`, email, and profile scopes, and exact authorized JavaScript origins `https://www.edenia.study` plus the development origin needed for the test. Preserve the existing Supabase provider client/secret configuration. Put only the public Web client ID into the Pages runtime variable. Do not require public Google app publication or new privacy/terms work for this internal canary; record that as a later public gate.

In Resend, reuse the verified `mail.edenia.study` domain and existing Free account. Create or scope a dedicated SMTP credential if provider capabilities permit, configure Supabase custom SMTP with sender name `Edenia` and `accounts@mail.edenia.study`, and retain the reminder sender separately. Never display the credential. Send only to approved internal test addresses until the canary finishes. Confirm the shared 100/day and 3,000/month Free limits and existing reminder traffic before testing.

Configure the branded Supabase magic-link template only after custom SMTP is active. Keep the Auth site URL and redirect allowlist exact; add the confirmation paths without a wildcard. Make a request while CAPTCHA is still disabled and prove the received From name, domain authentication, subject, branded link, plain-text fallback, no opaque project reference, and button landing page.

Create a free Turnstile widget restricted to `www.edenia.study` and the documented local test host. Put its site key in public runtime configuration and its secret only in Supabase Auth's CAPTCHA settings. Deploy and test the widget and `captchaToken` request path before enabling project CAPTCHA. Then enable Turnstile in Supabase and immediately test email rejection without a token, email success with one token, token replay rejection, Google official-button ID-token sign-in, and eligible One Tap. If Google is unexpectedly rejected, disable CAPTCHA before further diagnosis and leave a dated discovery in this plan.

Finally set the internal Pages runtime to ID-token mode and enable One Tap, without changing the account rollout from `internal`. Record before/after non-secret values, timestamps, exact Pages SHA/run, and rollback controls in `docs/account-reminder-operations.md`.

Milestone 6 is complete when SMTP, template, Google client, runtime controls, and Turnstile are configured without a public account launch, and each provider can be independently disabled or rolled back.


### Milestone 7: Prove the internal canary, rehearse rollback, and merge the evidence closeout


Use a clean internal browser profile and an existing internal account with known reminder data. Record the current Supabase UUID, PostHog distinct ID/person properties, local study-state hash, account preference state, and current provider quotas without exposing secrets.

Exercise the official Google button in onboarding and Settings on desktop and phone. Confirm Google renders the button, the top-level address never navigates to the Supabase project host, the resulting Supabase UUID is stable, the session survives reload/restart, reminder preferences still belong to the same UUID, and local study state is byte- or semantically unchanged according to the existing storage contract.

In a fresh signed-out profile, finish onboarding, skip or complete the walkthrough, and prove no One Tap UI appears before both persisted flags are true. Once both are true, verify One Tap appears only when Google is eligible. Exercise cancelable automatic sign-in with an already consenting single Google session. Dismissal must leave the app fully usable. Explicit sign-out must keep the browser signed out on the next eligible render because `disableAutoSelect()` was called.

Exercise email from onboarding and Settings. Confirm Turnstile is required, resend cooldown is visible, the email contains only branded Edenia links, scanner/page load does not consume the token, deliberate confirmation signs in the clicked browser, and the requesting browser remains signed out without polling. Test expired/already-used, offline retry, and cross-device behavior.

For same-email continuity, test the approved address through email then Google and through a clean account/provider sequence representing Google then email. In Supabase Auth, confirm there is one user UUID with linked identities rather than two users. In PostHog, confirm one person with that UUID, the normalized email property, the most recent auth method property, and merged anonymous history. If either direction produces a different UUID, stop the canary; do not add client-side email matching or manual linking as a quick fix.

Run the switch-off rehearsal. Disable One Tap while retaining the official manual button, then switch Google transport back to legacy or off for the internal audience, then set account rollout off in a build. At each step confirm ordinary study remains usable. Restore the intended internal canary state autonomously only after the rehearsal passes; the public account path remains off throughout.

After the canary and rollback rehearsal, update `Progress`, `Surprises & Discoveries`, `Decision Log`, `Outcomes & Retrospective`, `docs/account-authentication.md`, `docs/account-reminder-operations.md`, and `meta.json` with redacted evidence. Create a focused closeout branch from the then-current `origin/master`, commit only the work-item/runbook evidence, push it, and open a second draft PR. Perform the same fresh review, exact-head CI repair, ready transition, and protected merge lifecycle from Milestone 5. Wait for the Pages deployment of the evidence merge and verify the live internal canary state, ordinary public accountless state, and provider kill switches one final time. Set `meta.json` to the repository's completed implementation convention only after this proof is recorded.

Milestone 7 is complete when focused and full local tests pass, hosted desktop and phone canaries pass, same-email identity continuity is proven, no ordinary user-visible surface contains the opaque project reference, provider quotas remain Free, PostHog and local-state evidence is correct, the rollback rehearsal is documented, the evidence PR is merged through exact-head protection, and its exact merge is deployed and reverified.


## Concrete Steps


Run all commands from `/Users/brice/Documents/Coding/Edenia`. Use the repository-required Node version from `.nvmrc`. Do not run overlapping builds because `_site` is shared output.

Before editing, confirm scope and baseline:

    git status --short --branch
    git diff -- . ':!.agent/work/frictionless-authentication-internal-canary'
    node --version
    npm test

The baseline `npm test` should build the site, run the contract suite, run shared Supabase tests, and complete Deno checks. If it fails before implementation, record the exact preexisting failure in `Surprises & Discoveries` rather than weakening acceptance.

During Milestones 1 through 4, run the focused tests after each boundary. Update filenames if the implementation places a test beside an existing equivalent, but retain these behaviors:

    node --test tests/contracts/runtime-environment.test.mjs tests/contracts/runtime-config-flags.test.mjs tests/contracts/local-runtime-config.test.mjs tests/contracts/build-output.test.mjs
    node --test tests/contracts/account-auth-controller.test.mjs tests/contracts/account-auth-integration.test.mjs
    node --test tests/contracts/account-analytics-identity.test.mjs tests/contracts/account-auth-analytics-classic.test.mjs tests/contracts/analytics-bridge.test.mjs
    node --test tests/contracts/google-identity-services-controller.test.mjs tests/contracts/turnstile-controller.test.mjs tests/contracts/account-auth-confirm-page.test.mjs tests/contracts/build-output.test.mjs
    npm run build

Run the browser slices serially after the build:

    npx playwright test tests/e2e/onboarding-account.spec.mjs tests/e2e/account-settings.spec.mjs --project=desktop-standard --workers=1
    npx playwright test tests/e2e/onboarding-account.spec.mjs tests/e2e/account-settings.spec.mjs --project=phone-small --workers=1
    npx playwright test tests/e2e/account-auth-confirm.spec.mjs tests/e2e/google-one-tap.spec.mjs --project=desktop-standard --workers=1
    npx playwright test tests/e2e/account-auth-confirm.spec.mjs tests/e2e/google-one-tap.spec.mjs --project=phone-small --workers=1

Before any provider configuration, run the complete local gates:

    npm test
    npm run test:e2e -- --workers=1

Build a production-shaped artifact with dummy public values and search it for secret-shaped material. The exact dummy values should be syntactically valid but non-live:

    EDENIA_ACCOUNT_FEATURES_ROLLOUT=internal \
    EDENIA_GOOGLE_SIGN_IN_MODE=id_token \
    EDENIA_GOOGLE_ONE_TAP_ENABLED=true \
    EDENIA_GOOGLE_IDENTITY_CLIENT_ID=1234567890-dummy.apps.googleusercontent.com \
    EDENIA_TURNSTILE_SITE_KEY=1x00000000000000000000AA \
    SUPABASE_URL=https://example.supabase.co \
    SUPABASE_PUBLISHABLE_KEY=sb_publishable_dummy \
    YOUTUBE_API_KEY=dummy npm run build:production

    rg -n "service_role|RESEND_API_KEY|TURNSTILE_SECRET|CLIENT_SECRET|smtp.*password" _site

The secret scan should have no credential-bearing match. Static occurrences in documentation or safe labels must be manually distinguished from actual values.

Publish and inspect the implementation PR autonomously after the complete local gates pass. Substitute the actual PR number returned by `gh pr create`:

    git fetch origin
    git status --short --branch
    git diff --stat origin/master...HEAD
    git diff --check origin/master...HEAD
    git push --set-upstream origin HEAD
    gh pr list --repo BriceChivu/Edenia --state open --head "$(git branch --show-current)" --base master
    gh pr create --repo BriceChivu/Edenia --draft --base master --head "$(git branch --show-current)" --title "Add frictionless internal authentication" --body-file /tmp/edenia-auth-pr-body.md
    gh pr view <PR_NUMBER> --repo BriceChivu/Edenia --json number,url,isDraft,headRefOid,baseRefName,mergeable,mergeStateStatus,statusCheckRollup
    gh pr checks <PR_NUMBER> --repo BriceChivu/Edenia --watch

Create the temporary PR body with an editor or the GitHub connector, not a shell command that risks interpolating secrets. It must contain no credential or complete test address. After the fresh review and any repair pushes, bind the merge to the verified head:

    HEAD_SHA="$(git rev-parse HEAD)"
    test "$HEAD_SHA" = "$(git ls-remote origin "refs/heads/$(git branch --show-current)" | cut -f1)"
    test "$HEAD_SHA" = "$(gh pr view <PR_NUMBER> --repo BriceChivu/Edenia --json headRefOid --jq .headRefOid)"
    gh pr ready <PR_NUMBER> --repo BriceChivu/Edenia
    gh pr checks <PR_NUMBER> --repo BriceChivu/Edenia --required
    gh pr merge <PR_NUMBER> --repo BriceChivu/Edenia --merge --match-head-commit "$HEAD_SHA"

Verify the merge and Pages deployment rather than treating the merge response as completion:

    gh pr view <PR_NUMBER> --repo BriceChivu/Edenia --json state,mergedAt,mergeCommit,url
    gh run list --repo BriceChivu/Edenia --workflow deploy-pages.yml --branch master --limit 5 --json databaseId,headSha,status,conclusion,url
    gh run watch <PAGES_RUN_ID> --repo BriceChivu/Edenia --exit-status
    gh run view <PAGES_RUN_ID> --repo BriceChivu/Edenia --json headSha,conclusion,url

The PR should report `MERGED`; the Pages run should report `success`; and its `headSha` should equal the PR merge commit. Repeat this delivery sequence for the evidence closeout PR after the canary, with a title and body that describe evidence rather than implementation.

Provider setup and hosted canaries are autonomous operational steps under this plan. Record non-secret evidence as it occurs, but never paste credentials, ID tokens, magic-link token hashes, Turnstile tokens, session cookies, or complete email addresses into command output, a PR, or Git history. Use a redacted address when documenting outcomes. Do not pause for routine provider, PR, review, merge, or deployment approval.


## Validation and Acceptance


Functional acceptance is observable without inspecting implementation internals. With the global account rollout off, a new public visitor receives the same trailer/onboarding/accountless study path and no Google or Turnstile script loads. With the rollout internal and ID-token mode active, the optional account step and Settings contain Google's rendered button plus email fallback. Google completes without a top-level Supabase-host navigation. The first success creates an account, and session restoration works after reload and browser restart.

Prompt acceptance requires that One Tap and automatic sign-in never appear during onboarding or an active walkthrough. After onboarding is complete and the walkthrough is completed or skipped, a signed-out eligible visitor may see the prompt. Cooldown, opt-out, dismissal, or script blocking is nonfatal. Explicit sign-out prevents immediate reauthentication.

Email acceptance requires a Turnstile token for each request, a branded Resend-delivered message from the shared verified domain, no opaque project reference in visible or clickable email content, and a fragment-token confirmation page that does not verify on load. Deliberate confirmation signs in only the browser that opened the link. Invalid, used, expired, offline, and cross-device states are understandable and recoverable.

Identity acceptance requires the same verified email through Google and magic link to resolve to one Supabase UUID in the tested sequences. PostHog uses that UUID as `distinct_id`, stores normalized email and auth method as person properties, merges anonymous history on identify, and resets on sign-out or account switch. No email, Google subject, nonce, or token is used as an identifier.

Data-safety acceptance requires unchanged full browser-local study state across every sign-in, restoration, sign-out, and account-switch flow. The implementation does not introduce cloud progress upload, merge, replacement, or migration. Existing reminder-preference and bounded eligibility-snapshot behavior remains under its present controls and payload contracts. The rejected onboarding sentence remains absent.

Security acceptance requires in-memory one-use Google credentials/nonces and Turnstile tokens, a token-hash fragment scrubbed before unrelated work, no analytics on `/auth/confirm/`, restrictive exact-origin policy, no wildcard redirect, no provider secret in the static artifact, and safe provider errors. Since no schema change is expected, Supabase database advisors are unnecessary unless implementation unexpectedly changes DDL; if it does, stop, amend this plan, apply a migration rather than ad hoc SQL, and run security and performance advisors.

Release acceptance requires exact local test results; an implementation draft PR that received a fresh review, exact-head green `verify`, protected merge, and exact merged Pages deployment; provider configuration proof without secrets; desktop and phone hosted canaries; same-email UUID evidence; a successful switch-off rehearsal; and an evidence draft PR that received the same review, exact-head merge, and deployment proof. Account rollout remains `internal`, all selected services remain within their Free plans, and public enablement is not part of completion.


## Idempotence and Recovery


All new browser controllers must tolerate repeated render and synchronize calls. Script loading returns one shared promise. Button mounting does not duplicate child iframes. A GIS credential opportunity and a Turnstile token are each one-use. Destroy methods remove callbacks or ignore late work. Replaying auth events retains the current stale-request protection.

The confirmation page is safe to reload after its fragment has been scrubbed: it then shows an invalid/missing-link state and performs no verification. Before a transient exchange failure, keep the token only in memory for a deliberate retry; after a definitive invalid/used response or success, discard it. Never restore a scrubbed token from storage.

Provider changes are reversible in dependency order. Disable One Tap first if prompt behavior is unsafe. Set Google mode back to the existing internal OAuth redirect or off if ID-token exchange is unsafe. Disable Supabase CAPTCHA immediately if it blocks Google or email unexpectedly. Custom SMTP can be disabled to stop arbitrary-recipient sends, but do not revert to the default sender as a production fallback; Google remains available and email displays an unavailable state. `EDENIA_ACCOUNT_FEATURES_ROLLOUT=off` removes the complete account surface without affecting study.

Do not delete or rotate the existing Google OAuth credentials, Resend reminder credential, verified sending domain, Supabase users, linked identities, reminder rows, or PostHog persons during rollback. Those are durable shared resources. Credential rotation, if a secret is exposed, is a separate incident response: rotate, deploy, positively test the replacement, then revoke the old credential.

GitHub publication is retryable. If a push succeeds but PR creation fails, locate the exact head/base PR before retrying so no duplicate is opened. If CI fails, keep the PR draft, inspect the failing run, and push a focused repair; never merge the previous green SHA after the head changes. If the merge succeeds but Pages fails, leave provider activation off, fix the deployment through a new focused PR, and prove its exact merge before continuing. If provider configuration or canary work fails after the inert implementation merge, use the documented provider switches; do not revert safe dormant source merely to hide an operational failure.


## Artifacts and Notes


The durable decision source is `.agent/work/frictionless-authentication-internal-canary/decision.md`. Update it only if the user changes a locked product decision. Record implementation evidence in this ExecPlan rather than creating an unrelated status document.

Current provider facts checked on 2026-08-14 are time-sensitive: Resend Free advertises 3,000 messages per month, 100 per day, and one domain; Cloudflare Turnstile advertises free unlimited challenges; Supabase's default SMTP remains development-only and limited to two messages per hour. Recheck those limits before live configuration and record any change under `Surprises & Discoveries`.

The Supabase changelog reviewed on 2026-08-14 includes a June 2026 Free-tier email-template customization change and a future TypeScript baseline change. Edenia uses custom SMTP in this plan and plain JavaScript on Node 24, so neither blocks the work. Recheck the changelog immediately before implementation if this plan is resumed materially later.

Recommended commit metadata for implementation:

    Experiment: Frictionless authentication internal canary
    Gate: EDENIA_ACCOUNT_FEATURES_ROLLOUT=internal; EDENIA_GOOGLE_SIGN_IN_MODE=id_token
    Public path: unchanged


## Interfaces and Dependencies


Use the existing pinned `@supabase/supabase-js` and browser Web Crypto. Do not add a framework, JWT decoder, nonce package, CAPTCHA package, router, or backend proxy. Load Google Identity Services and Turnstile from their official browser scripts only when the internal gated surface needs them.

The pinned Supabase interface used by this work is:

    client.auth.signInWithIdToken({
      provider: 'google',
      token,
      nonce
    })

    client.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo,
        shouldCreateUser: true,
        captchaToken
      }
    })

    client.auth.verifyOtp({
      token_hash,
      type: 'email'
    })

    client.auth.signOut({ scope: 'local' })

The Google interface used is the JavaScript API at `window.google.accounts.id`: `initialize`, `renderButton`, `prompt`, `cancel`, and `disableAutoSelect`. Configure `auto_select: true` only for the eligible One Tap opportunity. Keep button auto-selection at its default so a manual button continues to present Google's identity chooser. Do not depend on deprecated `use_fedcm_for_prompt` or on moment callbacks for correctness; browser and Google cooldown behavior is allowed to suppress the prompt.

The Turnstile interface used is explicit rendering and reset through `window.turnstile`. Tokens are single-use and expire after approximately five minutes. Supabase performs server-side verification after receiving `captchaToken`; Edenia must not call Cloudflare Siteverify or hold the secret in the browser.

Supabase automatic identity linking is the only same-email merge mechanism. Application code never queries by email to choose a user and never rewrites UUID ownership. Live proof, rather than an inferred unit test, decides whether the actual provider configuration produces the same UUID.

Plan revision 2026-08-14: Created the first repository-grounded ExecPlan from the completed authentication grill. The plan adopts the existing onboarding/walkthrough state as the prompt boundary, a singleton GIS controller with one-use nonce opportunities, an analytics-free fragment confirmation page patterned after `/unsubscribe/`, an independently reversible provider sequence, and a live same-email UUID canary. It explicitly excludes the rejected onboarding progress sentence, public enablement, account deletion, manual identity management, and database schema work.

Plan revision 2026-08-14 (autonomous execution authority): Recorded the user's authorization for Codex to execute the full in-scope lifecycle without routine approval pauses, including provider configuration, internal canaries, focused commits and pushes, draft PR creation, fresh defect-finding review, CI and review repair, ready transition, protected merge, exact deployment verification, rollback, and an evidence closeout PR. Added two dependency-ordered GitHub delivery loops because the client must be merged and deployed inert before CAPTCHA, SMTP template, and Google prompt activation. Preserved hard boundaries against cost, public rollout, unrelated or destructive changes, unapproved recipients, secret exposure, branch-protection bypass, and weakened acceptance.

Plan revision 2026-08-15 (live canary repair): Recorded PR #149 delivery, hosted cross-device/session/sign-out/phone/identity evidence, Free-plan quotas, the exact ordered rollback and restored state, Pages configuration caching, the remaining hosted One Tap limitation, and the one-use-capability handling incident. Added a narrow verified-`amr` repair because production automatic linking retains Google-only provider metadata after a same-email magic-link session.
