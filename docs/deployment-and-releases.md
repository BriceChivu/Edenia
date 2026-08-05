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

## Staged video-organization rollout

The inline video-actions drawer is merged safely behind one runtime decision:

- `/?internal_test=1` always enables the preview and uses the isolated
  `edenia_v1_internal_test` state.
- Ordinary visitors keep the legacy Set aside flow while the repository
  variable `EDENIA_VIDEO_ORGANIZATION_ENABLED` is absent or exactly `false`.
- Setting that variable to exactly `true` enables the drawer for ordinary
  visitors on the next Pages deployment.

Use this release sequence:

1. Merge with `EDENIA_VIDEO_ORGANIZATION_ENABLED=false` (or leave it absent).
2. After Pages deploys, first smoke-check the ordinary production URL. Confirm
   an in-progress card has Set aside, has no More menu, and has no visible
   Removed section.
3. Open the same production deployment with `/?internal_test=1`. Exercise
   removal from Continue Watching, removal from the feed, restore, Undo, and a
   Removed thumbnail preview. Confirm the ordinary browser state is unchanged.
4. If acceptance succeeds, set the repository variable to `true` and manually
   dispatch the Pages workflow. Changing a repository variable alone does not
   rebuild an already deployed static artifact.
5. Smoke-check both a returning user and a clean browser before creating the
   release.

The variable is the public kill switch. If a production problem appears, set it
back to `false`, manually dispatch the Pages workflow, and verify the ordinary
URL again. Existing `removedFromFeedAt` fields and organization Undo entries are
kept in local storage but ignored and hidden while the switch is off, so the
rollback does not destroy user state and a later re-enable remains possible.
Use a revert pull request as well when the problem is in shared code rather than
only in the new behavior.

## Staged channel video-format rollout

The per-channel Videos/Shorts controls have an independent release boundary:

- `/?internal_test=1` always enables the controls in isolated internal-test
  state.
- Ordinary visitors keep the saved global Shorts preference while the
  repository variable `EDENIA_CHANNEL_VIDEO_FORMAT_TOGGLE_ENABLED` is absent or
  exactly `false`.
- Setting that variable to exactly `true` enables the per-channel controls for
  ordinary visitors on the next Pages deployment. The rollout includes both
  video orientations without overwriting the saved global preference.

Use this release sequence after the video-organization rollout has passed its
own production observation window:

1. Merge with `EDENIA_CHANNEL_VIDEO_FORMAT_TOGGLE_ENABLED=false` (or leave it
   absent).
2. On the ordinary production URL, confirm there are no per-channel format
   controls and the Settings Shorts preference still governs visible videos.
3. On `/?internal_test=1`, exercise channels containing only Videos, only
   Shorts, and both. Verify filtering, shelf scrolling, card actions, previews,
   long localized channel names, and phone, tablet, and desktop layouts.
4. If acceptance succeeds, set the repository variable to `true` and manually
   dispatch the Pages workflow.
5. Smoke-check a returning user and a clean browser on phone, tablet, and
   desktop before creating the release.

For feature-only rollback, set the variable back to `false`, manually dispatch
Pages, and verify the ordinary URL. The saved global Shorts preference is not
migrated by the rollout, so the previous public behavior resumes without
deleting browser state. Use a revert pull request as well if shared code is at
fault.

## Edenia Plus authentication

GitHub Pages receives only the public Supabase browser configuration through
repository variables:

- `SUPABASE_URL`
- `SUPABASE_PUBLISHABLE_KEY`

Never put a Supabase secret or service-role key in repository variables used by
the Pages build. Server credentials remain Edge Function secrets.

Before enabling Plus restoration in production:

1. Configure the production site URL and redirect URL in Supabase Auth for
   `https://bricechivu.github.io/Edenia/`.
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
- `APP_URL`: the exact site root; live mode requires HTTPS.

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
