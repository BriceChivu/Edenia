# Edenia Architecture

## Architectural boundary

Edenia is a browser-first static application. `index.html` loads the deployed
entry filenames, runtime configuration, analytics entry, and application
bundle. The build assembles source into `_site` without changing those public
filenames.

The architecture migration improves ownership while deliberately preserving the
existing product. It does not introduce a framework, TypeScript, a state
migration, new functionality, or an approved visual change.

## Source ownership

| Source area | Responsibility |
|---|---|
| `src/core/` | Pure shared helpers, storage/runtime contracts, responsive capabilities, and the empty global-action contract |
| `src/domain/` | Product rules that are independent of rendering, including video state and watch-progress coverage |
| `src/state/` | State normalization, persistence boundaries, backups, history, activity, onboarding, Anki, and insight state |
| `src/i18n/` | One complete dictionary per locale plus locale registry and rendering interface |
| `src/integrations/` | Runtime configuration, analytics boundary, and YouTube parsing |
| `src/features/` | Feature-scoped models and DOM action adapters grouped by product surface |
| `src/app.js` | Composition entry and remaining tightly coupled rendering, lifecycle, and integration orchestration |
| `analytics.js` | Separately loaded production analytics entry retained for deployment compatibility |

Feature action adapters own listeners for static and generated controls. There
are no application inline event attributes or global action aliases.
`src/core/global-action-contract.js` remains an intentionally empty frozen
contract so tests reject their reintroduction.

## State and compatibility contracts

The migration retains:

- `window.EDENIA_CONFIG` and the existing runtime load order;
- normal, internal-test, and sandbox storage domains and keys;
- persisted state shape, normalization, backups, imports/exports, and Undo/Redo;
- PostHog event and property identities and production/internal-test isolation;
- deployed `app.js`, `style.css`, `analytics.js`, and GitHub Pages behavior;
- exact locale copy, placeholders, fallback behavior, and `data-i18n` rendering.

State mutation continues through the existing store and feature boundaries.
Viewport size never rewrites product state or changes persistence domains.

## Responsive architecture

JavaScript uses named capabilities from
`src/core/responsive-capabilities.js`. Layout decisions, pointer/hover support,
coarse input, reduced motion, and viewport-positioning checks remain distinct.
The existing query values are preserved.

The stylesheet cascade stays ordered:

1. `00-foundations.css`
2. feature files `10` through `95`
3. `96-responsive-page-flows.css`
4. `97-responsive-input.css`
5. `98-responsive-phone.css`
6. `99-responsive-wide.css`

The final four files separate full-screen/page composition, coarse input,
phone component composition, and tablet/desktop/capability rules. Their split
preserves the prior responsive source byte-for-byte and does not authorize
breakpoint or design changes. See `docs/responsive-review-matrix.md`.

## Build flow

```text
index.html + src/ + analytics.js + data/assets
                    |
             scripts/build-site.mjs
                    |
                  _site
                    |
             GitHub Pages artifact
```

Asset cache versions are generated during the build. `_site` and generated
bundles are not source-controlled.

## Verification boundaries

Node contract tests cover pure rules, state/persistence, translations, feature
listener ownership, responsive queries, build output, and public compatibility
interfaces. The CI browser suite owns end-to-end and visual acceptance. The
current preservation inventory and responsive matrix define what unexplained
differences block merging.
