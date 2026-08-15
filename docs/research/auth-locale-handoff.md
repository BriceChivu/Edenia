# Safe locale handoff for Edenia email authentication

Date: 2026-08-15

## Decision

Carry Edenia's validated five-value locale in the **query of an exact, request-scoped `emailRedirectTo` URL**, use Supabase's `{{ .RedirectTo }}` only to select a known locale/template branch, and keep `{{ .TokenHash }}` exclusively in the URL fragment. Do not use `options.data` or `{{ .Data }}` for this job.

The confirmation page should read the locale independently of the token, allow an in-place language change, and pass the final validated locale to Edenia only after successful verification. This preserves the current click-to-confirm and cross-device behavior.

## Why this is the reliable carrier

Edenia currently supplies a fixed confirmation URL through `emailRedirectTo`, creates users when necessary, and keeps the CAPTCHA token separate ([controller](https://github.com/BriceChivu/Edenia/blob/a4c7feb66962caf143cdfe170c7316d285e8c4a0/src/integrations/account-auth-controller.js#L389-L451)). The pinned Supabase client sends `options.data` in the OTP body but sends `emailRedirectTo` separately as `redirectTo` ([supabase-js v2.110.7](https://github.com/supabase/supabase-js/blob/99d327b8983246b45602023b5f10d22b7cdadde7/packages/core/auth-js/src/GoTrueClient.ts#L2137-L2160)). Supabase documents `{{ .RedirectTo }}` as the request's redirect URL and `{{ .Data }}` as stored `auth.users.user_metadata` ([email-template variables](https://supabase.com/docs/guides/auth/auth-email-templates#terminology)).

`options.data` is therefore the wrong per-request carrier. Supabase Auth applies that data while creating or reconfirming a user, but the confirmed-existing-user path sends a magic link without applying the request data ([Auth source](https://github.com/supabase/auth/blob/0fb56ca93fcbe033bc2b0309bafbd86ef97aa468/internal/api/magic_link.go#L59-L131)). Both confirmation and magic-link template renderers expose the user's stored metadata as `.Data`, while exposing the request-scoped referrer as `.RedirectTo` ([template data](https://github.com/supabase/auth/blob/0fb56ca93fcbe033bc2b0309bafbd86ef97aa468/internal/mailer/templatemailer/templatemailer.go#L204-L223), [magic-link data](https://github.com/supabase/auth/blob/0fb56ca93fcbe033bc2b0309bafbd86ef97aa468/internal/mailer/templatemailer/templatemailer.go#L324-L343)). Using metadata would localize first and later requests differently and would persist a presentation choice on the Auth user.

## Exact transport contract

Use only Edenia's existing locale enum: `en`, `zh-Hant`, `zh-Hans`, `es`, and `fr` ([locale registry](https://github.com/BriceChivu/Edenia/blob/a4c7feb66962caf143cdfe170c7316d285e8c4a0/src/i18n/index.js#L1-L15)). After normalizing to that enum, select one of these URL shapes:

```text
https://www.edenia.study/auth/confirm/?locale=<locale>
http://localhost:8000/auth/confirm/?locale=<locale>
```

That is ten literal URLs, not a wildcard or a caller-supplied URL. Add those exact values to the Auth redirect configuration and make Edenia's URL helper return only one of them. Keep the existing bare confirmation URLs temporarily for legacy-email rollback. Supabase recommends exact production redirect paths rather than globstars ([redirect URL guidance](https://supabase.com/docs/guides/auth/redirect-urls#use-wildcards-in-redirect-urls)).

Install equivalent localized content in **both** hosted template slots:

- **Confirm signup** for a new or unconfirmed address.
- **Magic Link** for an existing confirmed user.

This distinction is required because Edenia has confirmations enabled and calls `signInWithOtp` with `shouldCreateUser: true` ([local configuration](https://github.com/BriceChivu/Edenia/blob/a4c7feb66962caf143cdfe170c7316d285e8c4a0/supabase/config.toml#L2-L17), [controller](https://github.com/BriceChivu/Edenia/blob/a4c7feb66962caf143cdfe170c7316d285e8c4a0/src/integrations/account-auth-controller.js#L442-L450)); Supabase routes the new-user case through signup/confirmation and the confirmed-user case through the magic-link sender ([Auth flow](https://github.com/supabase/auth/blob/0fb56ca93fcbe033bc2b0309bafbd86ef97aa468/internal/api/magic_link.go#L64-L131)). The repository currently carries only one English magic-link template ([current template](https://github.com/BriceChivu/Edenia/blob/a4c7feb66962caf143cdfe170c7316d285e8c4a0/supabase/templates/magic_link.html#L1-L30)).

Supabase parses both template subject and body with Go `html/template`, and supplies `.RedirectTo` and `.TokenHash` to both renderings ([template execution](https://github.com/supabase/auth/blob/0fb56ca93fcbe033bc2b0309bafbd86ef97aa468/internal/mailer/templatemailer/template.go#L62-L140), [provided fields](https://github.com/supabase/auth/blob/0fb56ca93fcbe033bc2b0309bafbd86ef97aa468/internal/mailer/templatemailer/templatemailer.go#L204-L223)). Exact `eq` branches are supported by Go templates ([Go template functions](https://pkg.go.dev/text/template#hdr-Functions)). Each branch should hard-code its known confirmation URL and localized copy/subject; do **not** echo arbitrary `.RedirectTo` into the link. An unknown value should fall back to the exact English production URL.

The resulting email action remains:

```text
<exact confirmation URL>?locale=<validated locale>#token_hash={{ .TokenHash }}&type=email
```

## Confirmation and return behavior

The `locale` query is non-secret and survives the existing first-script fragment scrub, while the token hash does not: Edenia captures the fragment and immediately replaces browser history with only path and query ([fragment scrubber](https://github.com/BriceChivu/Edenia/blob/a4c7feb66962caf143cdfe170c7316d285e8c4a0/auth/confirm/fragment-scrubber.js#L1-L7)). URI fragments are separated before dereference and handled by the user agent, so the token does not enter the initial HTTP request ([RFC 3986 section 3.5](https://datatracker.ietf.org/doc/html/rfc3986#section-3.5)).

The confirmation page should accept exactly one `locale` query value from the enum, with legacy/missing links falling back to the browser locale and then English. Its chooser should update copy, `document.documentElement.lang`, and the query with `history.replaceState` without reloading; a reload after fragment scrubbing must continue to invalidate the capability. Keep the fragment parser at exactly `token_hash` plus `type=email` ([current parser](https://github.com/BriceChivu/Edenia/blob/a4c7feb66962caf143cdfe170c7316d285e8c4a0/src/integrations/account-auth-confirm-page.js#L10-L25)).

Only the explicit button should call `verifyOtp`, as it does now ([verification](https://github.com/BriceChivu/Edenia/blob/a4c7feb66962caf143cdfe170c7316d285e8c4a0/src/integrations/account-auth-confirm-page.js#L90-L143)). Supabase explicitly recommends an intermediate page plus a deliberate button to mitigate ordinary email-link prefetching ([prefetch guidance](https://supabase.com/docs/guides/auth/auth-email-templates#email-prefetching)). This protects against scanners that fetch the link; no static-page design can promise protection against a scanner that executes arbitrary JavaScript and deliberately clicks controls.

After successful verification, return to one of five generated Edenia URLs such as `/?internal_test=1&account=1&auth_locale=fr`. The main app should validate and consume that one-time locale before removing `auth_locale` from history and persisting it through its normal locale/state owner. This avoids making the standalone confirmation page read or mutate study state and works when the email is opened on another device. The token-hash verification itself does not require state from the requesting browser: Supabase's token-hash API accepts only `token_hash` and `type`, and Edenia already uses exactly that call ([Supabase verification validation](https://github.com/supabase/auth/blob/0fb56ca93fcbe033bc2b0309bafbd86ef97aa468/internal/api/verify.go#L37-L81), [Edenia call](https://github.com/BriceChivu/Edenia/blob/a4c7feb66962caf143cdfe170c7316d285e8c4a0/src/integrations/account-auth-confirm-page.js#L105-L111)).

## Security properties and limitations

| Property | Result |
| --- | --- |
| Token secrecy | Unchanged: only locale is in the query; `TokenHash` remains in the fragment and is scrubbed before deferred configuration or application code. |
| Redirect discipline | Edenia constructs a finite set of URLs and the Auth configuration adds literal entries; no wildcard is needed. Template branches hard-code those URLs rather than trusting arbitrary template input. |
| Scanner resistance | Unchanged: GET/page load does not verify; only a deliberate button sends the token hash. Active click automation remains an inherent limitation. |
| Cross-device use | Preserved: locale and capability arrive in the email, and token-hash verification does not depend on the requesting browser's local storage. |
| User metadata | Unchanged: locale transport does not write `auth.users.user_metadata`. |

One upstream limitation must be recorded accurately: current Supabase Auth accepts any redirect whose scheme, host, and port match the configured Site URL before consulting the additional allowlist ([redirect validator](https://github.com/supabase/auth/blob/0fb56ca93fcbe033bc2b0309bafbd86ef97aa468/internal/utilities/request.go#L89-L130)). Because Edenia's Site URL is the production origin, the Supabase service itself does not enforce path-level exactness for production same-origin URLs. The proposed design does not broaden that existing surface, but tests and documentation must not claim that the additional production entries are the sole server-side boundary. Edenia's finite URL constructor and the template's exact hard-coded branches are therefore required controls.

## Required verification before rollout

- Render both Confirm signup and Magic Link subjects/bodies for all five locales and both origins; unexpected `.RedirectTo` must fall back to the safe English production branch.
- Prove the email link has exactly one non-secret locale query and exactly `token_hash` plus `type=email` in the fragment.
- Prove a plain GET/scanner fetch does not call `/verify`, while one user click calls it once.
- Prove same-browser and cross-device confirmation, a confirmation-page language change, legacy links without `locale`, and invalid/duplicate locale parameters.
- Keep SMTP link tracking disabled because Supabase warns that rewriting can deform authentication links ([email tracking guidance](https://supabase.com/docs/guides/auth/auth-email-templates#email-tracking)).
