# Deployment and Release Runbook

## Branch and pull-request flow

1. Branch from current `master` with one focused, short-lived branch.
2. Commit atomic changes with clear imperative subjects.
3. Push the branch and open a pull request.
4. Require the path-selected `verify` check before merge.
5. Merge without squashing when individual commits are useful rollback
   boundaries.

Repository settings should prohibit direct and force pushes to `master` and
require pull requests plus the CI check. These are GitHub settings and must be
confirmed in the repository UI or API; source files alone cannot enforce them.

## Build contract

The Node version is pinned in `.nvmrc` and dependencies in `package-lock.json`.

```bash
npm ci
npm test
```

`npm run build` creates a non-production `_site` with an empty YouTube key.
Production is built only by:

```bash
YOUTUBE_API_KEY=... npm run build:production
```

The production command requires the key and writes `_site/config.local.js`
without committing it. The browser-visible key must be restricted to YouTube
Data API v3 and the deployed referrer.

## GitHub Pages deployment

`.github/workflows/deploy-pages.yml` runs after a push to `master` or a manual
dispatch. It installs pinned dependencies, builds `_site`, uploads that exact
directory, and deploys the Pages artifact. Preserve the current public entry
filenames and `window.EDENIA_CONFIG` load order.

After deployment, the acceptance owner should smoke-check the production URL,
critical first-run and returning-user flows, runtime configuration, and the
absence of internal-test/sandbox leakage before creating a release.

For the mandatory-account release, use the deployment-bound canary report in
[Release-readiness canaries](release-readiness-canaries.md). It fetches the
published commit and cache-busted runtime-config hash, records the required
browser, provider, profile, database, and rollback evidence, and stops at an
explicit product-owner approval request.

## Accountless custom-domain migration

The canonical application target is `https://www.edenia.study/`. The legacy
application origin is `https://bricechivu.github.io/Edenia/`, and the minimal
progress helper target is `https://bricechivu.github.io/edenia-migrate/`.
Authentication remains optional and is not a prerequisite for this move.

All operations in this section change live infrastructure. Source preparation
or a passing local test does not authorize any of them. Before each operation,
inspect and record the current value without copying credentials, obtain owner
approval for that specific provider, make the smallest change, and retain its
before/after evidence.

### DNS and GitHub Pages order

Use GitHub Pages itself to serve both domain variants and redirect the apex to
`www`; do not use a framed redirect. Current GitHub guidance says to add the
custom domain to Pages before pointing DNS, recommends verifying ownership to
reduce takeover risk, and automatically redirects the apex to `www` when both
sets of DNS records are correct. It also states that a custom Actions Pages
workflow ignores and does not require a repository `CNAME` file. See GitHub's
[custom-domain instructions](https://docs.github.com/en/pages/configuring-a-custom-domain-for-your-github-pages-site/managing-a-custom-domain-for-your-github-pages-site)
and [domain-verification instructions](https://docs.github.com/en/pages/configuring-a-custom-domain-for-your-github-pages-site/verifying-your-custom-domain-for-github-pages).

With separate approval for each provider surface:

1. Add `edenia.study` as a verified domain in the owning GitHub account. Put
   GitHub's exact TXT challenge in Namecheap DNS, verify it, and retain the TXT
   record.
2. In the Edenia repository's Pages settings, set the custom domain to
   `www.edenia.study` before adding traffic-bearing DNS records. Do not add a
   tracked or generated `CNAME` file to this Actions deployment.
3. In Namecheap, point the `www` CNAME directly to `bricechivu.github.io`, with
   no `/Edenia` path. Configure the apex with the current GitHub Pages A records
   (and optional AAAA records only alongside A records), copied from GitHub's
   documentation at execution time. Do not create a wildcard DNS record.
4. Remove or resolve only records that conflict with those exact `@` and `www`
   names. Do not make unrelated DNS changes.
5. Verify the TXT, CNAME, apex A/AAAA answers, certificate, and both HTTP and
   HTTPS behavior. DNS and certificate issuance may take time; do not interpret
   partial propagation as an application failure.
6. Enable **Enforce HTTPS** only after GitHub has issued the certificate. Verify
   that `https://edenia.study/` redirects to
   `https://www.edenia.study/` while preserving a representative path and
   query, and that `www` remains the displayed canonical host.

Namecheap's URL Redirect record is not the preferred apex mechanism here:
Namecheap documents additional certificate requirements for HTTPS-to-HTTPS
forwarding, while GitHub Pages already supports the required secure apex-to-www
redirect when both DNS variants are configured. See Namecheap's
[redirect limitations](https://www.namecheap.com/support/knowledgebase/article.aspx/385/2237/how-to-set-up-a-url-redirect-for-a-domain/).

### Provider change checklist

Add the canonical values before changing DNS. Keep public account, checkout,
reminder delivery, relay acceptance, and automatic migration switches off while
the domain is tested.

| Surface | Required canonical value or check |
| --- | --- |
| GitHub Pages | Custom domain `www.edenia.study`; HTTPS enforced only after certificate issuance; deployed artifact SHA matches the approved source. |
| Supabase Auth | Site URL `https://www.edenia.study/`; email authentication uses same-device OTP verification without an Edenia redirect. Keep any provider callback entries exact and never use a wildcard for production. |
| Google Identity Services | Authorized JavaScript origin `https://www.edenia.study`; use the official button with ID-token exchange and no One Tap or automatic account selection. |
| Account APIs | Deploy the reviewed exact-`www` account-export and reminder-unsubscribe CORS allowlists before invoking those APIs from `www`. The old app origin is not allowed on these canonical-only APIs. |
| Reminder email | `REMINDER_APP_URL=https://www.edenia.study/?internal_test=1` and `REMINDER_UNSUBSCRIBE_PAGE_URL=https://www.edenia.study/unsubscribe/`; inspect generated HTML/text and one inert dummy link before any canary. |
| Stripe or replacement billing provider | Live `APP_URL=https://www.edenia.study/`; exact success, cancel, portal, and approved-return URLs remain under `/plus/`. The backend rejects any other live root. Keep checkout off until sandbox and live callback smoke evidence is reviewed separately. |
| YouTube browser key | Add both `https://www.edenia.study` and `https://www.edenia.study/*`, retain API restriction to YouTube Data API v3, test from `www`, then remove the old app referrer after the old app no longer serves the full application. Google notes that some browsers send origin-only referrers, so both entries are intentional. |
| PostHog | Confirm the project/toolbar authorized-domain setting if one is configured. The application initializes PostHog only on the exact `www` root, never on the helper, localhost, sandbox, subpages, or a migration-return page. Do not add email identity as part of this migration. |
| AnkiConnect | User-facing setup copy names `https://www.edenia.study`. A returning user may need to replace or add this exact origin in `webCorsOriginList` and restart Anki. |
| Supabase relay | Apply the additive migration and deploy both functions with acceptance and consumption controls false. Verify grants, advisors, capacity, cleanup, and exact old-helper/new-app origins in an approved project before enabling either control. |
| Legacy helper | Publish only the reviewed helper artifact at `/edenia-migrate/`; verify HTTPS, CSP, no analytics, no accounts, and same-origin read behavior without changing old Edenia bytes. |

Supabase recommends exact production redirect paths; the Site URL is the
default when no explicit redirect is supplied. Recheck the
[current Supabase redirect guidance](https://supabase.com/docs/guides/auth/redirect-urls)
at execution time. Google Cloud's current browser-key guidance likewise
distinguishes an origin entry from its path wildcard; see
[API key website restrictions](https://cloud.google.com/docs/authentication/api-keys#add_website_restrictions).

### Cutover smoke and rollback evidence

With automatic migration still off, verify all of the following from a clean
browser and a backed-up returning browser:

- `https://www.edenia.study/` loads the approved build at the root and survives
  a hard refresh;
- `https://edenia.study/` redirects to the exact canonical host over HTTPS;
- `https://bricechivu.github.io/Edenia/` redirects to the canonical site, while
  `https://bricechivu.github.io/edenia-migrate/` remains directly reachable;
- `/plus/` and `/unsubscribe/` load their standalone assets at the root domain;
- a normal new user reaches the existing trailer/onboarding with the migration
  switch off;
- PostHog is absent from the helper, subpages, sandbox, localhost, and a page
  load carrying a migration outcome; and
- auth, reminder, billing, YouTube, and Anki calls use only their expected exact
  origins and return destinations.

After DNS has propagated but before enabling any migration control, run the
read-only automated portion from the repository root:

    npm run verify:domain-migration

It must report eleven `PASS` lines. The verifier checks the ownership TXT
presence, exact GitHub Pages apex and `www` DNS, optional-but-exact IPv6,
trusted HTTPS responses, apex and legacy redirects, root and standalone
subpaths, helper isolation, and the deployed runtime values that keep automatic
migration, checkout, and public account features off. It does not replace the
backed-up browser canary, provider dashboard checks, PostHog network inspection,
or the separate Pages deployed-SHA comparison.

Before the first verified new-origin progress, an approved emergency rollback
may remove the Pages custom domain and restore old routing. After any learner
has created new-origin progress, normal rollback keeps `www` live, turns off
automatic migration and new relay acceptance, drains already issued transfers,
and reverts the smallest application change. Do not revert DNS merely because
the helper or relay is unhealthy; doing so would hide progress already stored
under the new origin.

### Five-month helper operations and retirement

Record the public migration enablement timestamp and calculate the earliest
retirement date as five full calendar months later. Once per month, read-only,
record:

- helper HTTPS availability, certificate, CSP, and recovery-page behavior;
- relay acceptance/consumption controls and cleanup-job history;
- expired-row count, live ciphertext rows and bytes, claim/completion outcomes,
  and bounded daily anonymous completion counts; and
- canonical Settings recovery plus permanent manual export/import behavior.

Do not create a recurring automation unless the owner requests it. The helper
cannot be retired before the five-month date. At or after that date, query the
anonymous daily completion table for the immediately preceding rolling 90
days. Any completion restarts the 90-day quiet window. A retirement report must
record the launch date, earliest eligible date, exact query interval/result,
support evidence, and replacement static recovery page.

Retirement still requires explicit approval. First disable new acceptance,
drain valid claims, replace the helper with a static manual-recovery notice,
wait through the approved notice interval, and only then remove relay code or
data in a separate reversible change. The canonical app and manual sync import
remain available permanently.

## Retired video-organization switch

Video organization is permanent for ordinary and internal-test visitors. The
legacy Set aside interface and the `EDENIA_VIDEO_ORGANIZATION_ENABLED`
repository variable are no longer supported. Loading or saving state migrates
legacy Set aside and individually hidden videos into the Removed model while
preserving recorded study activity and organization Undo/Redo history.

During the retirement release, every generated `config.local.js` must continue
to emit `videoOrganizationEnabled: true`. New application code does not read
this field; it is a temporary compatibility marker that keeps a cached
pre-retirement `app.js` on the already-released organization experience while
HTML and assets rotate through the Pages cache.

Use this release sequence:

1. Merge and deploy the retirement changes. Confirm the generated production
   config contains `videoOrganizationEnabled: true` and the Pages workflow no
   longer accepts `EDENIA_VIDEO_ORGANIZATION_ENABLED`.
2. Smoke-check both a returning profile and a clean browser on the ordinary
   production URL. Exercise removal from Continue Watching, removal from the
   feed, restore, Undo/Redo, and a Removed thumbnail preview.
3. Repeat a storage-isolation check with `/?internal_test=1` and confirm normal
   progress is unchanged.
4. Allow at least the published Pages cache lifetime plus an observation
   window before removing the compatibility marker in a separate pull request.

If a production problem appears, revert the smallest retirement commit through
a pull request and redeploy. Keep the compatibility marker set to `true` during
that rollback so cached pre-retirement assets retain the organization-enabled
behavior that was already public. Do not try to reconstruct the removed legacy
state fields from migrated data.

## Retired channel video-format switch

Per-channel Videos/Shorts controls are permanent for ordinary and internal-test
visitors. The application always includes every video duration and uses the
saved per-channel `channelVideoFormats` preferences. The legacy global Shorts
preference remains in stored state for rollback compatibility, but the new
application does not use or change it.

During the retirement release, every generated `config.local.js` must continue
to emit `channelVideoFormatToggleEnabled: true`. New application code does not
read this field. It is a temporary compatibility marker that keeps a cached
pre-retirement `app.js` on the already-released Videos/Shorts experience while
HTML and assets rotate through the Pages cache. The legacy body class and
hidden Settings markup are retained for the same mixed-cache window, while the
new stylesheet no longer depends on that class.

Use this release sequence:

1. Merge and deploy the retirement changes. Confirm the generated production
   config contains `channelVideoFormatToggleEnabled: true` and the Pages
   workflow no longer accepts `EDENIA_CHANNEL_VIDEO_FORMAT_TOGGLE_ENABLED`.
2. Smoke-check both a returning profile with saved per-channel views and a
   clean browser on the ordinary production URL. Exercise channels containing
   only Videos, only Shorts, and both.
3. Verify format persistence, shelf scrolling, card actions, previews, long
   localized channel names, and phone, tablet, and desktop layouts. Confirm the
   legacy global Shorts setting stays hidden and its stored value is unchanged.
4. Repeat a storage-isolation check with `/?internal_test=1`.
5. Allow at least the published Pages cache lifetime plus an observation window
   before removing the compatibility marker, body class, and hidden Settings
   markup in a separate pull request.

If a production problem appears, revert the smallest retirement commit through
a pull request and redeploy. Keep the compatibility marker and repository
variable set to `true` during that rollback so cached pre-retirement assets
retain the Videos/Shorts behavior that was already public. No learner-state
migration or reconstruction is required.

## General account rollout

### Legacy accountless entry rollback

`EDENIA_EMERGENCY_ACCOUNTLESS_ROLLBACK_ENABLED` is a serious-incident switch.
It restores legacy accountless entry without changing the server profile-data
gate or granting access to an owner-bound profile. Set
`EDENIA_ACCOUNTLESS_PROFILE_FINAL_CUTOVER_AT` to the approved ISO 8601 UTC
cutover before it occurs; after that timestamp, missing or damaged browser
grace bookkeeping fails closed. Record the UTC start of the current
incident-free period. Do not remove the
switch until 30 incident-free days have elapsed after cutover and the product
owner has approved removal explicitly.

Keep the legacy profile migrator installed for at least 12 full calendar months
after final cutover. Retirement also requires a rolling 90-day period with no
completed migration and explicit product-owner approval. Any later completed
migration restarts the 90-day period.

The staged general-account work uses the public repository variable
`EDENIA_ACCOUNT_FEATURES_ROLLOUT`. Its accepted values are:

- `off`: disable the general-account experience everywhere;
- `internal`: allow it only with `/?internal_test=1`;
- `public`: allow it on the ordinary and internal-test application paths.

Missing values default to `off`, invalid values fail the production build, and
sandbox mode remains excluded. Keep the variable set to `internal` during the
initial account implementation. Changing the variable requires a new Pages
deployment before the generated runtime configuration changes.

The internal-test query is public and is not an authorization boundary. Every
future account backend must independently authenticate users, authorize access,
and restrict test-only side effects such as email delivery on the server.

## Edenia Plus authentication

GitHub Pages receives only the public Supabase browser configuration through
repository variables:

- `SUPABASE_URL`
- `SUPABASE_PUBLISHABLE_KEY`

Never put a Supabase secret or service-role key in repository variables used by
the Pages build. Server credentials remain Edge Function secrets.

Before enabling Plus restoration in production:

1. Configure the production site URL and redirect URL in Supabase Auth for
   `https://www.edenia.study/`.
2. Add `http://localhost:8000/` as a redirect URL only when local passwordless
   testing is needed.
3. Configure a production SMTP provider. Supabase's default email sender is not
   suitable for sending passwordless links to arbitrary customers.
4. Confirm the `subscriptions` row-level security policy still permits an
   authenticated user to select only their own subscription.
5. Test with an existing subscriber in a clean browser: request a link with the
   checkout email, open it in that browser, confirm Plus is recognized, sign
   out, and confirm the browser-local study state is unchanged.

The account section remains hidden when either public Supabase value is absent.
Authentication and entitlement failures must not modify the main Edenia state.

## Stripe billing backend rollout

The billing functions remain server-only and the purchase UI remains gated by
the Plus checkout feature flag. Validate this backend in a separate Supabase
test project and Stripe sandbox before configuring the live project.

Configure these Edge Function secrets independently in each deployment:

- `STRIPE_MODE`: exactly `test` or `live`.
- `STRIPE_SECRET_KEY`: a Stripe secret key whose `sk_test_` or
  `sk_live_` prefix matches `STRIPE_MODE`.
- `STRIPE_WEBHOOK_SECRET`: the signing secret for that environment's endpoint.
- `STRIPE_MONTHLY_PRICE_ID` and `STRIPE_ANNUAL_PRICE_ID`: Price IDs from the
  same Stripe environment.
- `STRIPE_FOUNDING_COUPON_ID`: the environment's founding offer coupon ID.
- `APP_URL`: the exact site root; live mode accepts only
  `https://www.edenia.study/`.

Do not share Stripe customers, prices, webhook secrets, or Supabase projects
between sandbox and production. Do not put any of these server values in the
GitHub Pages runtime configuration.

Deploy in this order:

1. Configure and verify the test-project secrets with `STRIPE_MODE=test`.
2. Enable Stripe's test-mode Customer Portal and configure the subscription,
   cancellation, payment-method, and invoice actions that Edenia should expose.
   The Edge Function uses that environment's default portal configuration.
3. Apply the additive Supabase migrations before deploying the functions. They
   preserve all existing subscription and watched-progress records.
4. Deploy `stripe-webhook`, `create-checkout-session`, `get-plus-offer`,
   `create-billing-portal`, and the compatibility `link-checkout-session`
   function from the same commit. `get-plus-offer` is the only public billing
   read endpoint; it returns normalized recurring price data and never returns
   a Stripe identifier or secret. Checkout and portal creation require an
   authenticated Supabase user.
5. Subscribe the Stripe webhook endpoint to
   `checkout.session.completed`, `checkout.session.async_payment_succeeded`,
   `checkout.session.expired`, `checkout.session.async_payment_failed`,
   `customer.subscription.updated`, `customer.subscription.deleted`,
   `customer.subscription.paused`, `customer.subscription.resumed`,
   `invoice.paid`, and `invoice.payment_failed`.
6. In Stripe test mode, verify that the Plus page displays the configured
   monthly and annual prices, then test an authenticated checkout for each plan,
   renewal, scheduled cancellation through period end, immediate deletion,
   reactivation, payment failure, recovery inside the seven-day grace period,
   expiry after that grace period, and an authenticated Customer Portal return.
   Re-send one event ID and deliver events out of order to confirm idempotent
   reconciliation. Confirm the page shows activation as pending until the
   webhook-backed subscription row becomes active.
7. Keep `plusCheckoutEnabled` and Free limits disabled until the sandbox
   evidence is reviewed. Repeat the configuration and smoke test against the
   separate live project only immediately before the approved launch.

If function deployment must be rolled back, redeploy the previous function
commit and leave this additive migration in place. Removing its tables while a
new function is still live would break webhook processing; unused additive
tables and policies are the safer rollback state.

## Version and release policy

The planned `v1.1.0` release includes video organization and the per-channel
Videos/Shorts controls. Edenia Plus remains deferred to a separate release and
must keep its public flags disabled during this rollout.

- Use a patch version for behavior-neutral architecture phases.
- Use the next minor version for the first explicitly approved intentional UI
  change.
- Create a release only from the exact merged commit that passed production
  smoke verification.
- Never move or reuse a tag.
- Release notes should list user-visible changes, verification, known deferrals,
  and the rollback commit.

Do not tag or publish a release while visual acceptance, deployment smoke
verification, required checks, or repository access is unresolved.

## Rollback

1. Identify the smallest offending migration commit or merge.
2. Open a revert pull request; do not reset or rewrite `master`.
3. Run required checks and merge the revert.
4. Let GitHub Pages redeploy the reverted source.
5. Verify production recovery.
6. Document the correction or rollback in the revert pull request and release
   notes.

Persisted state and runtime interfaces should remain backward compatible across
architecture-only migration reversions. If a later approved change includes a
state migration, its pull request must provide a dedicated recovery procedure.

## Historical refactor record

The completed refactor can be reviewed through the archived
`migration_changes.md`, `docs/current-experience-inventory.md`, and
`docs/responsive-review-matrix.md`. New work uses ordinary commits and pull
requests; it does not append migration ledger entries.
