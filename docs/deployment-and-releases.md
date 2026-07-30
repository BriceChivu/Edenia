# Deployment and Release Runbook

## Branch and pull-request flow

1. Branch from current `master` with one focused, short-lived branch.
2. Commit atomic changes. Migration commits use `MIG-###` and update
   `migration_changes.md` in the same commit.
3. Push the branch and open a pull request.
4. Require the migration governance, build, contract, browser-flow, and visual
   checks before merge.
5. Merge without squashing when the individual migration commits are useful
   rollback boundaries.

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

## Version and release policy

- Use a patch version for behavior-neutral architecture phases.
- Use the next minor version for the first explicitly approved intentional UI
  change.
- Create a release only from the exact merged commit that passed production
  smoke verification.
- Never move or reuse a tag.
- The release notes should list included `MIG-###` entries, verification, known
  deferrals, and rollback commit.

Do not tag or publish a release while visual acceptance, deployment smoke
verification, required checks, or repository access is unresolved.

## Rollback

1. Identify the smallest offending migration commit or merge.
2. Open a revert pull request; do not reset or rewrite `master`.
3. Run required checks and merge the revert.
4. Let GitHub Pages redeploy the reverted source.
5. Verify production recovery.
6. Append a correction or rollback entry to `migration_changes.md`.

Persisted state and runtime interfaces should remain backward compatible across
architecture-only migration reversions. If a later approved change includes a
state migration, its ledger entry must provide a dedicated recovery procedure.

## Current migration handoff

The local migration can be reviewed through `migration_changes.md`,
`docs/current-experience-inventory.md`, and
`docs/responsive-review-matrix.md`. Remote branch publication, pull-request
checks, GitHub settings, production deployment, smoke verification, tagging,
and release publication are separate external acceptance steps.
