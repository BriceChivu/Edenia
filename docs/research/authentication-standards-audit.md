# Edenia authentication and session-security audit

Date: 2026-09-02  
Repository snapshot: `cd939690cf7a5edd443e64ec963fc95acb05f9c6`

## Decision

Edenia's current authentication is **substantially stronger than a home-grown browser login**, but it is **not yet at the industry-standard target appropriate for a public application that stores personal learner data**.

The strongest parts are the use of managed Supabase Auth, an official Google Identity Services flow with a cryptographic nonce, same-device email codes, exact redirect allowlists, memory-only one-time credentials, short client request cooldowns, global logout, owner-derived database authorization, Row Level Security (RLS), and server-side token validation for privileged functions.

The material concerns are:

1. Edenia is a direct browser OAuth client with persistent bearer and refresh tokens available to JavaScript. The current IETF browser-app best current practice ranks a backend-for-frontend (BFF) as the most secure architecture and says the direct browser-client architecture is **not recommended for business applications, sensitive applications, or applications that handle personal data** ([RFC 10017 sections 6 and 6.3.4](https://www.rfc-editor.org/rfc/rfc10017.html#section-6.3.4)).
2. The live authenticated origin lacks the response-level browser defenses expected by OWASP ASVS Level 2, notably Content Security Policy (CSP), HSTS, and clickjacking protection. The 2026-09-02 response inspection is recorded below. OWASP ASVS 5.0 requires HSTS at Level 1 (V3.4.1) and requires a CSP and `frame-ancestors` protection at Level 2 (V3.4.3 and V3.4.6) ([official ASVS 5.0 requirements](https://raw.githubusercontent.com/OWASP/ASVS/v5.0.0/5.0/docs_en/OWASP_Application_Security_Verification_Standard_5.0.0_en.csv)).
3. Critical Supabase-hosted settings cannot be proven from this checkout: email-code expiry, JWT expiry, refresh-token reuse detection, maximum/inactivity session lifetime, CAPTCHA enforcement, redirect/origin configuration actually deployed, and whether the checked-in database policies match production.
4. Email OTP is supported by Supabase and common in consumer products, but it does not meet NIST's authenticator benchmark: NIST SP 800-63B-4 says email must not be used for out-of-band authentication ([NIST SP 800-63B-4, out-of-band authenticators](https://pages.nist.gov/800-63-4/sp800-63b/authenticators/#ooba)). NIST is not automatically binding on Edenia, but this means email OTP should be treated as a convenient AAL1-like fallback, not as high-assurance authentication.

Accordingly, the defensible course is:

- close the no-regret browser-header and hosted-configuration gaps before public rollout;
- adopt OWASP ASVS 5.0 Level 2 as the verification target for the authenticated surface;
- run a bounded BFF design spike and bias toward moving the authenticated cloud surface behind a BFF or equivalent managed server session;
- retain the direct-browser architecture only if a written threat model and measured migration-cost assessment justify accepting the residual XSS/token-theft risk.

This is not a recommendation to rewrite the current profile-recovery work or to build custom authentication. It is a recommendation to make the session boundary an explicit architecture decision before broad public exposure.

## Scope and risk target

The audited surface is the browser application at `https://www.edenia.study`, Supabase Auth with Google and email-code login, persistent browser sessions, Supabase database/RPC access protected by RLS, and authenticated Edge Functions. This is not a bank or government identity system, but it does process account identity, personal learning history, exports, reminder preferences, and billing/account operations.

The proposed target is OWASP ASVS 5.0 Level 2. ASVS defines Level 2 as the recommended level for most applications and Level 3 for the most critical applications ([OWASP ASVS project and release](https://owasp.org/www-project-application-security-verification-standard/)). NIST SP 800-63B-4 is used as an assurance benchmark rather than a claim of legal applicability; its scope is federal digital identity systems and it allows relying parties to select controls according to risk ([NIST SP 800-63-4 scope](https://pages.nist.gov/800-63-4/sp800-63/introduction.html#scope)).

## Verified repository and live-origin evidence

### Good foundations already present

- The Supabase client enables PKCE, automatic refresh, URL-session detection, and persistent sessions under an environment-specific key ([`src/integrations/supabase-client.js`](../../src/integrations/supabase-client.js), [`src/core/storage-keys.js`](../../src/core/storage-keys.js)). Supabase documents that a session consists of a short-lived access-token JWT and a one-time refresh token and that its JavaScript client persists sessions in local storage by default ([Supabase sessions](https://supabase.com/docs/guides/auth/sessions), [Supabase JavaScript Auth reference](https://supabase.com/docs/reference/javascript/auth-api)).
- Google login uses the official Google Identity Services script, 32 bytes from `crypto.getRandomValues`, SHA-256 hashing for the Google-facing nonce, and one-time clearing of both the raw nonce and returned credential after exchange ([`src/integrations/google-identity-services-controller.js`](../../src/integrations/google-identity-services-controller.js)). This matches Supabase's documented Google ID-token flow: send the hashed nonce to Google and the original nonce to `signInWithIdToken` ([Supabase Google Auth](https://supabase.com/docs/guides/auth/social-login/auth-google)).
- Auth requests fail closed outside the exact production or localhost return origins. Google ID tokens and nonces are passed only to `signInWithIdToken`; email codes are requested with `signInWithOtp` and verified with `verifyOtp`; the controller does not retain raw session tokens in application state ([`src/integrations/account-auth-controller.js`](../../src/integrations/account-auth-controller.js)).
- Email login is a same-device six-digit code with a one-minute local cooldown, localized templates, and a CAPTCHA token passed when Turnstile is ready ([`supabase/config.toml`](../../supabase/config.toml), [`src/integrations/account-auth-controller.js`](../../src/integrations/account-auth-controller.js), [`src/app.js`](../../src/app.js)). Supabase supports email OTP, documents a 60-second default request interval and a configurable expiry, and requires enabling CAPTCHA with the provider secret on the server side ([Supabase passwordless email](https://supabase.com/docs/guides/auth/auth-email-passwordless), [Supabase CAPTCHA](https://supabase.com/docs/guides/auth/auth-captcha)).
- Local and global sign-out are exposed. Focus/online events trigger a provider refresh before the active owner is trusted again, and request IDs prevent stale refreshes from restoring an obsolete session ([`src/integrations/account-auth-controller.js`](../../src/integrations/account-auth-controller.js), [`src/integrations/learner-profile-reverification.js`](../../src/integrations/learner-profile-reverification.js), [`src/app.js`](../../src/app.js)).
- Database authorization is derived from `auth.uid()` rather than a caller-supplied owner, exposed tables use owner-scoped RLS, privileged functions use restricted grants and fixed search paths, and pgTAP tests exercise cross-owner and anonymous denial ([example profile migration](../../supabase/migrations/20260821092005_synchronize_learner_profile_progress.sql), [`account_owner_policies.test.sql`](../../supabase/tests/account_owner_policies.test.sql)). Supabase's RLS guidance says exposed-schema tables must have RLS and illustrates ownership policies using `auth.uid()`; it also warns that user-editable metadata is not suitable for authorization ([Supabase RLS](https://supabase.com/docs/guides/database/postgres/row-level-security)).
- The account-export Edge Function authenticates the bearer token using `supabase.auth.getUser`, passes only the verified user ID into a self-scoped RPC, applies a user rate limit, restricts browser origins, and returns `no-store` and a deny-all CSP ([`export-account-data/index.ts`](../../supabase/functions/export-account-data/index.ts), [`_shared/account-export.ts`](../../supabase/functions/_shared/account-export.ts)). OWASP ASVS requires tokens to be verified by a trusted backend (V7.2.1), terminated sessions not to remain usable (V7.4.1), and authenticated sensitive responses not to be cached (V14.3.2) ([official ASVS 5.0 requirements](https://raw.githubusercontent.com/OWASP/ASVS/v5.0.0/5.0/docs_en/OWASP_Application_Security_Verification_Standard_5.0.0_en.csv)).
- The Pages deployment publishes only the Supabase URL and publishable key; no service-role key is built into the browser artifact ([`deploy-pages.yml`](../../.github/workflows/deploy-pages.yml)). Supabase explicitly permits publishable/anon keys in a frontend when RLS is correctly configured and says service-role keys must never be exposed in the browser ([Supabase API security](https://supabase.com/docs/guides/api/api-keys)).

### Verified gaps and cautions

#### Persistent JavaScript-readable session

`persistSession: true` without custom storage means Supabase stores the refresh-token session in browser local storage. The app intentionally shares that one session between Account and Plus within each environment.

This is provider-supported, and OWASP ASVS 5.0 V14.3.3 explicitly permits session tokens as an exception to its general prohibition on sensitive browser storage ([official ASVS 5.0 requirements](https://raw.githubusercontent.com/OWASP/ASVS/v5.0.0/5.0/docs_en/OWASP_Application_Security_Verification_Standard_5.0.0_en.csv)). It is therefore inaccurate to call the design inherently non-compliant merely because it uses local storage.

However, the current OAuth browser BCP explains that local storage is readable by all JavaScript on the origin and persists across browsing sessions, so malicious first- or third-party code can steal tokens ([RFC 10017 section 8.5](https://www.rfc-editor.org/rfc/rfc10017.html#section-8.5)). OWASP's Session Management Cheat Sheet takes the more conservative position that authentication and session tokens should not be placed in local or session storage and recommends `Secure`, `HttpOnly`, `SameSite` cookies where possible ([OWASP Session Management Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html#html5-web-storage-api)).

Edenia's exposure is not only hypothetical: its main origin executes a large inline PostHog loader and dynamically loads Google Identity Services and Turnstile; other features also load third-party content. CSP can reduce the probability of malicious JavaScript running, but the IETF notes that CSP cannot prevent already-executing malicious code from accessing browser-held tokens ([RFC 10017 section 8.5](https://www.rfc-editor.org/rfc/rfc10017.html#section-8.5)).

Classification: **architecture-level recommendation, material for this risk profile**.

#### Missing security response headers on the main origin

On 2026-09-02, a read-only `curl -D - https://www.edenia.study/` inspection returned `server: GitHub.com`, HTTPS, and `cache-control: max-age=600`, but no `Content-Security-Policy`, `Strict-Transport-Security`, `Referrer-Policy`, `X-Content-Type-Options`, or frame-embedding policy. The checked-in [`index.html`](../../index.html) also has no CSP meta policy and includes multiple inline scripts.

OWASP ASVS 5.0 requires HSTS on all responses at Level 1 (V3.4.1), and at Level 2 requires a CSP with at least `object-src 'none'` and `base-uri 'none'` (V3.4.3) plus `frame-ancestors` or an equivalent anti-clickjacking header (V3.4.6) ([official ASVS 5.0 requirements](https://raw.githubusercontent.com/OWASP/ASVS/v5.0.0/5.0/docs_en/OWASP_Application_Security_Verification_Standard_5.0.0_en.csv)). GitHub's own Pages documentation says Pages should not be used for sensitive transactions such as sending passwords or credit-card numbers ([GitHub Pages HTTPS guidance](https://docs.github.com/en/pages/getting-started-with-github-pages/securing-your-github-pages-site-with-https)). Edenia does not collect passwords or card numbers itself, but the warning is relevant to choosing a host for a session-bearing authenticated application.

Classification: **required for the proposed ASVS target; immediate gap**.

#### Email OTP assurance

The checked-in configuration fixes the OTP at six digits and the resend interval at one minute, but does not set the hosted OTP lifetime. OWASP ASVS 5.0 Level 2 requires out-of-band codes to be usable once, expire within ten minutes, and be protected against brute force (V6.5.1, V6.5.5, and V6.6.3) ([official ASVS 5.0 requirements](https://raw.githubusercontent.com/OWASP/ASVS/v5.0.0/5.0/docs_en/OWASP_Application_Security_Verification_Standard_5.0.0_en.csv)). Supabase's documented default email-OTP expiry is one hour, configurable in the provider settings, so the default would not meet that ten-minute target ([Supabase passwordless email](https://supabase.com/docs/guides/auth/auth-email-passwordless)).

NIST is stricter: it prohibits email as the channel for out-of-band authentication and requires allowed out-of-band secrets to be at least six decimal digits, single-use, expire within ten minutes, and be rate limited when they contain less than 64 bits of entropy ([NIST authenticator requirements](https://pages.nist.gov/800-63-4/sp800-63b/authenticators/#ooba), [NIST out-of-band verifier requirements](https://pages.nist.gov/800-63-4/sp800-63b/authenticators/#out-of-band-verifiers)). Edenia's email code is therefore suitable only as an explicitly accepted low-assurance convenience method, not as NIST-conformant authentication.

Classification: **ten-minute expiry and server-side abuse controls required for ASVS Level 2; replacing email is contextual unless higher assurance is required**.

#### Session lifetime and revocation

Supabase documents that sessions are indefinite by default, access-token lifetime is usually five minutes to one hour, and time-boxed, inactivity-timeout, and single-session controls are paid-plan settings enforced when a session refreshes. It discourages access-token lifetimes over one hour and under five minutes. Refresh tokens are rotated and have one-time use with a default ten-second reuse exception; disabling reuse detection is not recommended ([Supabase sessions](https://supabase.com/docs/guides/auth/sessions)).

OWASP ASVS 5.0 Level 2 requires documented inactivity and maximum lifetimes (V7.1.1), risk-appropriate inactivity and absolute timeouts (V7.3.1 and V7.3.2), and reauthentication for changes to authentication factors or other sensitive identity attributes (V7.5.1) ([official ASVS 5.0 requirements](https://raw.githubusercontent.com/OWASP/ASVS/v5.0.0/5.0/docs_en/OWASP_Application_Security_Verification_Standard_5.0.0_en.csv)). NIST recommends an AAL1 overall timeout of no more than 30 days, while AAL2 requires multifactor authentication and a phishing-resistant option ([NIST AAL requirements](https://pages.nist.gov/800-63-4/sp800-63b/aal/)).

The repository proves global sign-out is requested and session state is refreshed; it does not prove the hosted lifetime, rotation, reuse-detection, or single-session settings, nor immediate invalidation of every still-valid access JWT. Supabase explains that immediate server-side enforcement after logout requires checking the session ID against the Auth sessions table on requests where that assurance is necessary ([Supabase sessions](https://supabase.com/docs/guides/auth/sessions#signing-out)).

Classification: **documented limits and hosted verification required for ASVS Level 2; exact values contextual**.

#### Google integration lifecycle

The nonce and ID-token exchange match Supabase's supported browser flow. RFC 9700's authorization-code guidance requires PKCE for public OAuth clients and recommends issuer and transaction-binding defenses against mix-up and injection; Edenia's Google button flow is an OIDC ID-token credential exchange rather than an authorization-code flow, so the PKCE requirement should not be misapplied to that exchange ([RFC 9700 sections 2.1 and 4.4](https://www.rfc-editor.org/rfc/rfc9700.html)).

One narrower compatibility issue remains: Google's JavaScript reference says `google.accounts.id.initialize()` should generally be called only once per page, while Edenia intentionally calls it again after a failed credential exchange to rotate its nonce ([Google Identity Services JavaScript reference](https://developers.google.com/identity/gsi/web/reference/js-reference#google.accounts.id.initialize), [`google-identity-services-controller.js`](../../src/integrations/google-identity-services-controller.js)). This needs a provider-supported lifecycle design, but it is not evidence that the cryptographic login is broken.

Classification: **recommended compatibility correction; not a reason for a wholesale auth rewrite by itself**.

#### MFA/passkeys are configured or available, not enforced

The checked-in Supabase configuration enables TOTP enrollment and verification, but the audited browser flow does not enroll, challenge, or enforce an Authenticator Assurance Level. Supabase requires the application to perform enrollment/challenge/verification and enforce the desired AAL in application/database policies; merely enabling TOTP does not add MFA to a session ([Supabase TOTP MFA](https://supabase.com/docs/guides/auth/auth-mfa/totp)). Supabase passkeys are currently marked experimental and require explicit project/client opt-in, so they should not be treated as a mandatory stable migration target yet ([Supabase passkeys](https://supabase.com/docs/guides/auth/passkeys)).

Classification: **contextual for a low-risk learner account; recommended as step-up or an option for sensitive actions, not necessarily mandatory for every sign-in**.

## Architecture options

### Option A: retain the direct browser client

This preserves the current static hosting model, offline-first behavior, direct Supabase RLS enforcement, simple deployment, and low latency. It is officially supported by Supabase. For an OAuth browser client that uses an authorization-code flow, the IETF requires PKCE and exact redirect URI matching; refresh tokens must be rotated or sender-constrained and must have an absolute or inactivity lifetime ([RFC 10017 authorization-code requirements](https://www.rfc-editor.org/rfc/rfc10017.html#section-6.3.2), [RFC 10017 endpoint requirements](https://www.rfc-editor.org/rfc/rfc10017.html#section-6.3.3)). Edenia configures PKCE for any applicable Supabase flow and uses exact local redirect allowlists, but hosted redirect and refresh settings remain unproved.

The residual limitation cannot be configured away: any malicious JavaScript executing on the origin can read the browser session. Strong CSP, dependency controls, fewer third-party scripts, short token lifetimes, refresh rotation, and narrow RLS reduce likelihood and impact; they do not remove the bearer-token theft path ([RFC 10017 sections 6.3.4 and 8.5](https://www.rfc-editor.org/rfc/rfc10017.html#section-6.3.4)).

Choose this only with documented acceptance of that residual risk. The acceptance packet should include:

- an ASVS Level 2 verification checklist;
- a threat model covering XSS, compromised dependencies/CDNs, token theft, cross-owner access, OAuth/OTP abuse, and device sharing;
- production response-header evidence;
- production Auth settings and negative-path canary evidence;
- a complete inventory of scripts capable of running on the authenticated origin;
- bounded access, refresh, inactivity, and absolute session lifetimes;
- deployed RLS/grant/pgTAP evidence;
- incident-response and forced-revocation procedures.

Without that packet, “the rewrite would be detrimental” is not supported by evidence.

### Option B: backend-for-frontend session boundary

In this design, Google/email credentials are exchanged by a trusted backend, Supabase access and refresh tokens remain server-side, and the browser receives only a host-only session cookie with `Secure`, `HttpOnly`, and an appropriate `SameSite` policy. The browser calls an exact, narrow same-origin API; the BFF validates CSRF protections and proxies only intended operations. This is the IETF's most secure browser-app architecture ([RFC 10017 section 6.1](https://www.rfc-editor.org/rfc/rfc10017.html#section-6.1)).

It is not free. The IETF explicitly notes that a BFF is significantly more complicated, every API request is proxied, and the BFF becomes a performance and availability dependency ([RFC 10017 section 6.1.4](https://www.rfc-editor.org/rfc/rfc10017.html#section-6.1.4)). For Edenia, all direct Supabase database/RPC/Function calls would need a controlled proxy or redesign; cookie sessions add CSRF and session-store responsibilities; and the team would operate a new security-critical service. Supabase also explains that `HttpOnly` cookies are feasible only when the browser does not itself need to read and refresh Supabase tokens, which is why the full proxy boundary is necessary ([Supabase server-side auth overview](https://supabase.com/docs/guides/auth/server-side)).

Those are real costs, but they are not evidence that the BFF would be security-detrimental. They are the costs of removing browser JavaScript's access to the reusable session. A segmented deployment is plausible: keep Edenia's public/offline-first surface static, and move the authenticated cloud/profile surface to an application origin behind a managed BFF. The cookie must remain host-only, and the authenticated origin must have its own strict CSP and dependency policy.

### Recommendation

Bias toward **Option B** because Edenia handles personal data and RFC 10017 expressly recommends against the direct-browser architecture for that category. Do not start an unbounded rewrite immediately. First build a thin vertical spike covering:

1. Google credential exchange and email-code request/verification through the BFF;
2. an opaque `Secure; HttpOnly; SameSite` session cookie plus CSRF defense;
3. one owner-scoped learner-profile read and one write;
4. sign-out and global revocation;
5. offline/local-profile behavior with the backend unavailable;
6. latency, availability, deployment cost, and migration inventory.

Approve a full migration if the spike demonstrates a maintainable boundary. Reject it only with the evidence packet described under Option A and an explicit residual-risk acceptance. This approach respects the newer BCP without committing the product to a speculative large rewrite.

## Prioritized work

### Before broad public rollout

1. **Set the security target and threat model.** Adopt ASVS 5.0 Level 2 for the authenticated surface; document the deliberate low-assurance email-OTP deviation from NIST and the BFF decision.
2. **Use a delivery layer that can set security headers.** Add a tested response-level CSP, HSTS, `frame-ancestors`, `Referrer-Policy`, and `X-Content-Type-Options`. The CSP must account explicitly for Google, Turnstile, PostHog, YouTube, and Supabase; remove or nonce/hash inline scripts rather than falling back to broad `unsafe-inline` allowances. ASVS requires an allowlist- or nonce/hash-based CSP at Level 2 (V3.4.3) ([official ASVS 5.0 requirements](https://raw.githubusercontent.com/OWASP/ASVS/v5.0.0/5.0/docs_en/OWASP_Application_Security_Verification_Standard_5.0.0_en.csv)).
3. **Verify hosted Auth configuration.** Capture sanitized dashboard/API evidence for the exact checklist below. Set email OTP expiry to at most ten minutes; keep request and verification abuse controls server-enforced.
4. **Prove deployed authorization.** Run the relevant pgTAP suites against the release candidate or production-equivalent database and verify grants/policies, not merely migration files.
5. **Define sensitive actions and reauthentication.** Account deletion, authentication-method changes/linking, export, billing portal entry, and viewing/terminating sessions should be classified. Require recent authentication or step-up where the consequence warrants it. ASVS Level 2 requires reauthentication for authentication-factor changes and viewing/terminating other sessions (V7.5.1 and V7.5.2) ([official ASVS 5.0 requirements](https://raw.githubusercontent.com/OWASP/ASVS/v5.0.0/5.0/docs_en/OWASP_Application_Security_Verification_Standard_5.0.0_en.csv)).
6. **Run the BFF spike.** Keep it separate from profile-recovery issue work so security architecture does not obscure lifecycle correctness.

### After the boundary decision

- If retaining browser tokens, minimize executable third-party code on the authenticated origin, enforce the strict CSP, document dependency patch SLAs, and test session theft/revocation scenarios. ASVS requires a policy to monitor and remediate vulnerable components (V15.1.1) ([official ASVS 5.0 requirements](https://raw.githubusercontent.com/OWASP/ASVS/v5.0.0/5.0/docs_en/OWASP_Application_Security_Verification_Standard_5.0.0_en.csv)).
- If migrating to a BFF, keep RLS as defense in depth, use owner identity established from the server session, allowlist each proxied operation and destination, implement CSRF defenses, and do not create a generic Supabase proxy.
- Offer TOTP step-up if user risk or sensitive actions justify it. Revisit passkeys when Supabase's implementation is stable; phishing-resistant authentication is the strategic destination for higher assurance, and NIST AAL2 requires offering a phishing-resistant option ([NIST AAL2](https://pages.nist.gov/800-63-4/sp800-63b/aal/#aal2)).
- Reconcile the Google `initialize()` lifecycle and evaluate FedCM as a compatibility project, not as a substitute for the session-boundary decision.

## Hosted/provider verification checklist

These facts are **not verifiable from the repository** and must not be inferred from client code:

- Supabase email OTP expiry is at most ten minutes.
- Supabase email request and verification rate limits are active, and wrong/expired/replayed codes fail without creating a session.
- Turnstile is enabled in Supabase Auth with the correct secret; missing, invalid, expired, and replayed tokens produce zero email delivery. Passing a client token alone does not prove server enforcement ([Supabase CAPTCHA](https://supabase.com/docs/guides/auth/auth-captcha)).
- JWT lifetime is documented and no longer than one hour absent a specific justification; refresh-token rotation and reuse detection are enabled; the reuse interval is justified; inactivity and maximum session lifetimes are configured and tested ([Supabase sessions](https://supabase.com/docs/guides/auth/sessions)).
- Production Auth site URL and redirect allowlist contain only intended exact origins; no broad wildcard exists.
- Google OAuth client IDs, authorized JavaScript origins, consent screen, Supabase provider secret, and nonce validation match the intended production and test environments. Supabase requires the Google client and provider configuration on both sides ([Supabase Google Auth](https://supabase.com/docs/guides/auth/social-login/auth-google)).
- Production database migrations, grants, RLS policies, functions, and Edge Functions match the audited commit.
- Domain ownership is verified in GitHub to reduce custom-domain takeover risk ([GitHub custom-domain verification](https://docs.github.com/en/pages/configuring-a-custom-domain-for-your-github-pages-site/verifying-your-custom-domain-for-github-pages-site)).
- Operational logs, analytics, session replay, error tracking, and email-provider logs contain no OTPs, ID tokens, access tokens, refresh tokens, nonces, or raw profile exports.

## Contextual or unnecessary changes

The following are not current requirements for Edenia's stated risk profile:

- **Password rules and breached-password checks:** Edenia has no password authenticator. Adding passwords would create a new secret-management burden rather than fix browser session theft.
- **A custom identity provider, custom JWT format, or browser-side custom token validation:** managed provider verification plus server RLS is safer and more auditable. A BFF should still use Supabase Auth rather than replace it.
- **A service-role key in the browser:** never appropriate; the publishable client key plus RLS is the intended Supabase frontend model ([Supabase API security](https://supabase.com/docs/guides/api/api-keys)).
- **Mandatory MFA for every low-risk learner session:** contextual rather than an automatic ASVS Level 2 requirement. It becomes appropriate for elevated-risk accounts/actions or if Edenia claims AAL2-like assurance; NIST AAL2 requires two factors and a phishing-resistant option ([NIST AAL2](https://pages.nist.gov/800-63-4/sp800-63b/aal/#aal2)).
- **SMS as the preferred second factor:** it would not resolve JavaScript-readable browser sessions and has weaker channel properties than phishing-resistant authenticators.
- **Google One Tap or automatic sign-in:** convenience features, not security-baseline requirements. The current explicit official button and `auto_select: false` are reasonable.
- **Immediate adoption of experimental Supabase passkeys:** evaluate when stable; do not put a critical login path on an explicitly experimental provider feature ([Supabase passkeys](https://supabase.com/docs/guides/auth/passkeys)).

## Evidence limits and validation performed

- This audit is source-level plus a read-only live-header observation. It did not access the Supabase or Google dashboards, production logs, production database catalogs, secrets, or user data.
- On the audited commit, 60 focused contract tests passed: Supabase client configuration, account authentication, Google Identity Services, Turnstile, account integration, and Supabase backend source contracts. These are strong local regression checks, not live-provider or deployed-RLS evidence.
- The current Supabase changelog was scanned on 2026-09-02 for Auth breaking changes. No new breaking change that independently forces a rewrite was identified; passkeys remain an opt-in experimental capability ([Supabase changelog](https://supabase.com/changelog), [Supabase passkeys](https://supabase.com/docs/guides/auth/passkeys)).
- The main conclusion is driven by the architecture-specific IETF browser-app BCP, not by novelty: direct browser sessions remain implementable and provider-supported, but they are no longer the recommended architecture for applications handling personal data ([RFC 10017 section 6.3.4](https://www.rfc-editor.org/rfc/rfc10017.html#section-6.3.4)).
