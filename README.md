# Edenia

Edenia turns YouTube study time and optional Anki activity into visible language-learning progress. It combines a focused video queue, weekly goals, study history, local pattern insights, streaks, and a town that evolves as study points accumulate.

The app is browser-first: its interface and primary study state run from static HTML, CSS, and JavaScript, with YouTube Data API access supplied through a runtime configuration file. Supabase backs optional Edenia Plus authentication and subscription recognition only; signing in or out does not move or replace browser-local study progress. The primary study state remains in the browser unless the user explicitly exports a sync file; the official production deployment sends the analytics, session-recording, search, and optional feedback data described under [Privacy and Analytics](#privacy-and-analytics).

## Current Features

### Personalized first run

- Opens with a localized animated introduction to Edenia's study loop, town progression, history, and insights.
- Includes trailer navigation, a language picker, optional procedural music, and a skip action.
- Asks for one primary learning language: Mandarin Chinese, Japanese, Korean, Spanish, French, German, English, or another language.
- Asks for an approximate level: just starting, beginner, intermediate, advanced, or not sure.
- Suggests up to six level-matched channels from a curated catalog.
- Uses repository-bundled channel avatars so recommendation cards do not need separate profile-image API requests.
- Resolves selected YouTube handles, saves the working channels, and attempts the first video refresh before opening the dashboard.
- Continues after partial channel or refresh failures and reports what could not be loaded.
- Finishes with a short walkthrough of the real dashboard controls.

### YouTube study queue

- Accepts raw `UC...` channel IDs, `@handle` values, `/channel/UC...` URLs, and legacy `/user/...` URLs.
- Fetches one recent uploads page per due channel and maintains a target of five active videos per channel.
- Preserves cached video metadata and existing study status across refreshes.
- Automatically refreshes an unfetched or stale feed after five hours.
- Applies a 30-minute per-channel backoff after refresh errors.
- Adds individual YouTube videos manually when they do not belong to a tracked channel.
- Searches saved videos from the header.
- Filters the active queue by status and by any combination of channels.
- Lets users add, select all, remove, and manage channels from the channel filter.
- Gives active videos a More actions menu for removing them from Continue Watching or from the feed.
- Keeps feed removal recoverable in a collapsed Removed section below Watched without deleting recorded study time, points, Favorite, or Watch later state.
- Hides videos of three minutes or less by default; the preference can be changed in Settings.
- Shows a contextual card for the latest paused video, the next watch-later video, or a favorite that is ready to rewatch.
- Keeps Favorites independent from watched status so watched favorites remain available for later replays.

Supported video states are:

- `Unwatched`
- `Watch later`
- `In progress`
- `Watched`

Opening an unwatched or watch-later video marks it in progress. In-progress videos can retain a continue-watching timestamp and watched-progress segments. Adding a fresh video to Watch later does not itself add study time, streak credit, or points. Rewatching a favorite can record another completed watch and award credit for the newly recorded playback.

`Removed` is a feed-placement flag rather than a study status. Its thumbnails open in a read-only player that does not record progress or points, and restoring a removed video returns its exact saved status and controls. Removing a video from Continue Watching clears only its resume cursor and current watch-cycle coverage; recorded study activity remains intact. Favoriting a watched video keeps it watched while revealing its rewatch card in the active feed.

Undo and redo cover recent status, progress, Favorite, video-placement, manual-video, and channel-removal actions together with their related history and score changes.

### Goals, history, and insights

- Tracks watched video time against a weekly goal from 1 to 99 hours.
- Shows watched and in-progress counts, remaining time, and goal completion.
- Converts the remaining goal into localized daily pace guidance when study videos are available.
- Maintains current and longest study streaks; a day qualifies after earning at least 5 points.
- Aggregates activity by selectable week or month.
- Provides a detailed Summary view and a one-year Heatmap view with localized month and weekday labels.
- Shows the videos watched and the point breakdown for each active day.
- Allows watched-history entries to jump back to their saved video.
- Generates local study-pattern insights after enough activity has accumulated.
- Can surface preferred study windows, typical session length, reliable weekdays, weekend opportunities, and recent momentum changes.
- Keeps up to 12 previously shown insights, supports collapse/reopen, and can be disabled in Settings.

Study insights are calculated locally from up to 42 days of recorded video progress. They appear only after at least 8 active days, 2 hours of video study, and a 14-day observation window.

### AnkiConnect

- Optionally reads today's review and new-card counts from Anki through AnkiConnect.
- Refreshes on startup, every five minutes while the app is open, and when the tab becomes visible.
- Stores the daily totals locally and never modifies the Anki collection.
- Can be disabled without rewriting earlier Anki history; re-enabling establishes a same-day baseline before counting new activity.
- Hides Anki-specific dashboard and history details when disabled unless older Anki activity exists for the selected period.

### Town progression

- Awards cumulative points for recorded video study time and Anki reviews.
- Evolves through 12 town stages as the total score crosses milestone thresholds.
- Reveals unlocked stages with a level-up animation and dual-corner confetti.
- Uses optimized WebP town images with PNG fallbacks and priority-aware preloading.
- Supports zooming, panning, reset, and a timeline for previewing the town on earlier activity days.
- Keeps progress toward the next stage across weekly boundaries.

### Interface and accessibility

- Supports light and dark themes.
- Translates the full interface into English, Traditional Chinese, Simplified Chinese, Spanish, and French.
- Saves Settings changes immediately; there is no separate save button.
- Uses a keyboard-accessible Settings modal, labeled controls, live toast announcements, semantic heatmap buttons, and visible focus treatment for non-button controls.
- Honors reduced-motion preferences.
- Includes responsive video cards, larger mobile tap targets, anchored mobile popovers, a compact scrolling header, and touch-friendly town controls.
- Keeps an activity log with user, automatic, issue, and point filters.

## Scoring

Town score is cumulative and does not reset each week. Edenia calculates points separately for each activity day, combines that day's video and Anki contributions, and then rounds the daily total down to a whole number:

```text
daily points = floor((video seconds / 3600 × 30) + (Anki reviews / 60 × 20))
```

| Activity | Points |
| --- | ---: |
| 1 hour of watched video time | 30 |
| 60 Anki reviews | 20 |

There is no separate bonus for marking a video watched or for the number of videos completed. New Anki cards are recorded for context but do not award points.

Examples:

- 30 minutes of video produces `15` points.
- 30 Anki reviews produce `10` points.
- 30 minutes of video plus 30 Anki reviews produce `25` points together.
- Fractional points do not carry into another day.

| Level | Required score |
| ---: | ---: |
| 1 | 0 |
| 2 | 60 |
| 3 | 140 |
| 4 | 230 |
| 5 | 320 |
| 6 | 400 |
| 7 | 480 |
| 8 | 570 |
| 9 | 680 |
| 10 | 800 |
| 11 | 920 |
| 12 | 1050 |

## Build and Run Locally

Edenia uses the Node.js version pinned in `.nvmrc`.

1. Install the pinned dependencies:

   ```bash
   npm ci
   ```

2. Create the ignored local runtime configuration once:

   ```bash
   cp config.example.js config.local.js
   ```

   Add a separate, restricted development YouTube Data API v3 key:

   ```js
   window.EDENIA_CONFIG = {
     youtubeApiKey: 'YOUR_RESTRICTED_KEY'
   }
   ```

3. Build and start the local site:

   ```bash
   npm run dev
   ```

4. Open [http://localhost:8000/](http://localhost:8000/).

`npm run dev` validates the ignored root `config.local.js`, builds `_site`,
writes a normalized `_site/config.local.js` without printing the key, and
serves the result on the loopback interface. Re-run the command after changing
source files; it intentionally performs one build instead of running a watcher.

The non-production build writes an empty runtime API key so automated checks do
not use YouTube quota. `npm run build:production` requires `YOUTUBE_API_KEY` and
is reserved for the GitHub Pages workflow.

`config.local.js` and `_site` are ignored by Git. `config.example.js` is only
the local-development template and is not used by the GitHub Pages workflow.
The local development key is still delivered to the browser, so restrict it to
the YouTube Data API, allow the `http://localhost:8000/*` referrer, and use a
small development quota.

## Testing and CI

The test harness keeps application traffic deterministic and blocks unexpected
external requests. YouTube and Anki responses are served from test fixtures, and
automated tests fail if they attempt to contact PostHog.

```bash
npm test
npm run test:e2e
```

The browser suite uses ports 8000 and 8001 by default. If port 8000 is already in
use locally, select an isolated normal-mode port while retaining the required
sandbox origin:

```bash
EDENIA_TEST_NORMAL_PORT=4173 npm run test:e2e
```

Visual baselines may be regenerated only for an explicitly approved change:

```bash
npm run test:e2e:update
```

Pull-request CI selects the least expensive relevant scope:

- Documentation and workflow-only changes do not run application tests.
- Generated channel-catalog changes run the fast catalog validator.
- Contract-only changes run the build and contract suite.
- Runtime, styling, build, or browser-test changes also run Playwright.

The historical refactor ledger is archived and no longer imposes commit naming or
per-change documentation requirements.

## YouTube API Configuration

The app reads the key from `window.EDENIA_CONFIG.youtubeApiKey`. The key is not stored in Edenia state, local backups, cookies, activity logs, or exported sync files.

Because Edenia is a static browser app, a deployed key is delivered to visitors and is therefore inspectable. Treat it as a public restricted credential rather than a server-side secret.

Recommended Google Cloud restrictions:

1. Restrict the key to **YouTube Data API v3**.
2. Add an HTTP referrer restriction for the exact hosted origin.
3. For the current GitHub Pages site, allow `https://bricechivu.github.io/*`.
4. Monitor quota usage and configure alerts.
5. Keep a second restricted key ready for rotation.

Custom `/c/...` channel URLs are not resolved automatically. Use a channel ID, handle, supported channel URL, or legacy username URL instead.

## Channel Catalog Maintenance

`data/channel-catalog.source.json` is the human-maintained list of channels. Add or edit entries there; do not edit the generated `data/channel-catalog.json` file directly.

Each source entry needs:

- A unique lowercase `catalogId`.
- A YouTube handle, channel URL, or channel ID in `youtubeInput`.
- A fallback `name`.
- At least one `language` and `level`.
- Optional `style`, `description`, and `aliases` fields for local search.

Refresh the generated catalog with:

```bash
node scripts/refresh-channel-catalog.mjs
```

The script uses `YOUTUBE_CATALOG_API_KEY` or `YOUTUBE_API_KEY` when set, otherwise it reads the key from `config.local.js`. New handles are resolved once, and later refreshes reuse their stable channel IDs and request current metadata in batches of up to 50.

`.github/workflows/refresh-channel-catalog.yml` also refreshes the catalog when the source or refresh script changes, on manual dispatch, and twice per month. When the generated file changes, the workflow commits only that file to a new `automation/refresh-channel-catalog-<run>-<attempt>` review branch and prints a GitHub compare link. An authenticated maintainer opens the pull request from that link; the workflow never pushes directly to `master`, creates or approves a pull request, or merges it. Missing or deleted channels remain in the generated file with `available: false` so they can be corrected without losing the editorial entry.

The workflow requires a separate `YOUTUBE_CATALOG_API_KEY` repository secret. Create that credential in the same Google Cloud project, restrict it to YouTube Data API v3, and keep it only in GitHub Actions. Do not apply Edenia's browser-referrer restriction to this automation key because GitHub's server-side runner does not send the deployed site's referrer. Both credentials still share the same project quota.

### Automated YouTube discovery

`.github/workflows/discover-language-channels.yml` proactively searches YouTube every day for language-learning channels that are not already present in the curated, community, or previously discovered catalogs. It can also be run manually after the workflow is pushed to GitHub.

When the generated discovery catalog changes, the workflow validates the change
and publishes it to the stable
`automation/discover-language-channels` branch. It opens or updates one bot pull
request. A separate trusted workflow squash-merges the exact revision only after
`CI / verify` succeeds. Normal runs therefore need no maintainer review.
Unexpected paths, removals, identity changes, duplicates, invalid metadata,
ineligible additions, rotation errors, or excessive growth fail closed and leave
the deployed catalog unchanged.

Each run searches one two-language batch with three focused channel queries per language. The four daily batches cover French and English, German and Mandarin Chinese, Russian and Spanish, then Japanese and Portuguese. After all eight languages have run, their queries advance to the next of four groups covering beginner material, listening and stories, grammar and vocabulary, and intermediate conversation or podcasts. Every group includes a query written in the target language, and its final query is ordered by channel creation date.

The first page of each query uses six `search.list` calls. If either active language still has fewer than six eligible additions after filtering and deduplication, the script can request only one additional results page. A hard request budget stops the run before an eighth search, so automated discovery uses at most seven YouTube searches per Pacific Time quota day. Search pages request the API maximum of 50 results to get the most candidate coverage from each call.

Before searching, the workflow claims the current Pacific Time quota day in the GitHub Actions cache. A second scheduled or manual attempt on that day exits without contacting YouTube. A completed result is cached separately, so validation or publication retries reuse the generated catalog rather than repeating the API search. The quota day, search count, active languages, language-batch cursor, and query cursor are also stored in `data/channel-catalog.discovered.json`.

The script then uses batched `channels.list` requests to verify metadata, statistics, public availability, and profile-picture URLs.

Automatic additions are deliberately conservative:

- No more than six new channels per language and run.
- No more than 12 new channels across the two active languages by default.
- No more than seven `search.list` requests per Pacific Time quota day.
- At least 100 visible subscribers, unless subscriber counts are hidden.
- At least 10 published videos.
- The channel title, handle, or description must contain both the target language and language-learning signals.
- New channel IDs, handles, and exact names are deduplicated against all existing catalogs.
- Existing discovered channels cannot be removed or have their discovery identity and classification rewritten by automation.
- Existing discovered-channel metadata is refreshed after 30 days.

Accepted channels are written to `data/channel-catalog.discovered.json`, deployed with GitHub Pages, and loaded into the Add search alongside curated and community channels.

The YouTube discovery step uses the existing `YOUTUBE_CATALOG_API_KEY` secret.
These optional repository variables can tune its conservative defaults:

- `DISCOVERY_MAX_PER_LANGUAGE`
- `DISCOVERY_MAX_TOTAL_ADDITIONS`
- `DISCOVERY_MIN_SUBSCRIBERS`
- `DISCOVERY_MIN_VIDEOS`

The workflow fixes `DISCOVERY_MAX_SEARCH_REQUESTS` at seven. The script rejects a
higher value so a repository-variable change cannot silently weaken the daily
search ceiling.

The unattended discovery and community-catalog pull-request publishers require
a dedicated GitHub App. Using an App keeps the credential short-lived and
ensures the bot-created pull requests trigger the normal CI workflow.

1. Create a GitHub App owned by the repository owner and install it only on
   Edenia.
2. Give it repository **Contents: Read and write** and **Pull requests: Read and
   write** permissions. Keep all unrelated permissions disabled.
3. Store its App ID as the `CATALOG_AUTOMATION_APP_ID` repository secret and its
   private key as `CATALOG_AUTOMATION_PRIVATE_KEY`.
4. Keep squash merging enabled in the repository pull-request settings.
5. Protect `master` with **Require a pull request before merging** and require
   the `CI / verify` status check. The catalog bot must not bypass this check.
   A required human approval would intentionally prevent unattended merging, so
   do not require one for this automation path.

If any prerequisite is missing, publishing or auto-merge fails and GitHub marks
the scheduled workflow or pull request for attention. The workflow never falls
back to pushing directly to `master`. A merged catalog update can be rolled back
by reverting its squash commit.

The same discovery can be run locally before pushing by setting `YOUTUBE_CATALOG_API_KEY` and running:

```bash
node scripts/discover-language-channels.mjs
```

### Community catalog growth

Successful Add-button additions that did not come from the curated, community,
or discovered catalog are recorded through the existing PostHog analytics
pipeline. The browser never receives a GitHub write credential.

`.github/workflows/import-community-channel-catalog.yml` runs daily and can also be dispatched manually. It:

1. Reads the previous 180 days of `channel_added_via_add_button` events from PostHog.
2. Requires positive `catalog_candidate` provenance from an eligible
   `direct_input` or `youtube_search` event. Legacy events with missing
   provenance fail closed.
3. Excludes curated and automatically discovered channels by exact YouTube
   channel ID or normalized handle, plus internal, localhost, and sandbox
   additions.
4. Counts distinct PostHog users without writing their identifiers to the
   repository or pull-request report.
5. Verifies new or 30-day-stale candidates with YouTube in batches of up to 50
   channels per one-unit `channels.list` request.
6. Writes the rolling aggregate candidate snapshot to
   `data/channel-catalog.candidates.json`.
7. Promotes a public channel to `data/channel-catalog.community.json` only after
   two distinct users add it and it has a supported learning language and
   complete required metadata.

When either generated community file changes, the workflow validates the exact
delta, updates the stable
`automation/import-community-channel-catalog` branch, and creates or refreshes
one pull request. Its generated body lists every eligible candidate, newly and
previously promoted channels, blocked promotions, and aggregate exclusions with
their reasons.

The community pull request is squash-merged automatically only after
`CI / verify` passes for the exact head and base revisions. The merge helper
refuses unrelated files, stale CI results, promoted-channel removals, stable
identity rewrites, cross-catalog duplicates, private identifiers, and more than
10 new promotions per run by default. If `master` moves after CI starts, the
next scheduled run regenerates and retests the update instead of merging stale
catalog data.

Once promoted, a channel remains in the community catalog and is loaded by the
Add search on the deployed site. Candidate expiry is allowed because the
candidate file is a rolling 180-day snapshot, but routine automation never
removes a promoted channel. The two-user promotion rule limits which additions
reach the community catalog, but it is not equivalent to authenticated
moderation.

Configure these repository secrets:

- `POSTHOG_PROJECT_ID`: the numeric PostHog project ID.
- `POSTHOG_PERSONAL_API_KEY`: a server-side personal key with read access to query that project's events.
- `YOUTUBE_CATALOG_API_KEY`: the existing server-side YouTube catalog key.

The optional `COMMUNITY_CATALOG_MAX_PROMOTIONS` repository variable can lower
the default per-run promotion ceiling of 10. Values above the code-enforced
ceiling fail closed and require a reviewed code change. The same
least-privilege catalog GitHub App and required `CI / verify` branch protection
used by discovery are required for community auto-merge.

If the PostHog project is not in the US region, also set the `POSTHOG_HOST` repository variable to the appropriate PostHog app host. Never put the PostHog personal key in `index.html`, `app.js`, `config.local.js`, or a Pages deployment.

## Anki Setup

1. Install [AnkiConnect](https://ankiweb.net/shared/info/2055492159).
2. Open Anki and keep it running while using Edenia.
3. For the hosted site, add `https://bricechivu.github.io` to AnkiConnect's `webCorsOriginList` and restart Anki.
4. Leave **Track Anki activity** enabled in Edenia Settings.

Edenia communicates only with the local AnkiConnect endpoint at `http://127.0.0.1:8765`.

## Data Storage and Portability

Normal, internal-test, and sandbox progress are isolated in browser storage.

| Mode | URL | State key | Backup key | Config cookie |
| --- | --- | --- | --- | --- |
| Normal | `/` | `edenia_v1` | `edenia_v1_backups` | `edenia_config` |
| Internal test | `/?internal_test=1` | `edenia_v1_internal_test` | `edenia_v1_internal_test_backups` | `edenia_config_internal_test` |
| Sandbox | `http://localhost:8001/?sandbox=1` | `edenia_v1_sandbox` | `edenia_v1_sandbox_backups` | `edenia_config_sandbox` |

The primary state includes:

- settings, channels, channel refresh metadata, and removed-channel records;
- video metadata, statuses, timestamps, and watched-progress segments;
- weekly progress inputs, streaks, Anki daily logs, and town progression;
- learner profile and onboarding completion state;
- study-insight preferences and previously shown insights;
- undo and redo queues;
- the activity log.

The config cookie mirrors basic configuration so Edenia can recover settings if the main state is unavailable.

Edenia maintains up to eight recent local backup snapshots. It creates interval-limited automatic backups and forced rollback points before risky operations such as imports, resets, restores, and cleanup. Backups can be restored from **Settings -> Recent local backups**.

Use **Export sync file** to download the complete current state and **Import sync file** to move it to another browser or device. Normal and sandbox sync files cannot be imported into the opposite mode. Sync files contain personal study history and should be treated as private backups.

Clearing site data, deleting the browser profile, or losing the device also removes local progress unless a sync file exists elsewhere.

## Sandbox Mode

Open `http://localhost:8001/?sandbox=1` to use a separate demonstration and testing state. Sandbox mode is unavailable on the hosted site and other origins.

- Starts from a blank baseline day at level 1 with 0 points when no sandbox save exists.
- Shows a **Sandbox version** badge with **Add day** and **Reset** controls.
- **Add day** appends a generated study day after the latest sandbox date.
- **Reset** returns to the isolated baseline and can replay the walkthrough.
- Never reads or changes normal `edenia_v1` progress.

## GitHub Pages Deployment

The workflow in `.github/workflows/deploy-pages.yml` deploys on pushes to `master` or by manual dispatch.

During deployment it:

1. Installs the pinned Node.js dependencies.
2. Builds the static site into `_site` with versioned asset references.
3. Generates `_site/config.local.js` from the `YOUTUBE_API_KEY` repository secret.
4. Uploads and deploys the static Pages artifact.

Repository setup:

1. Add a restricted repository secret named `YOUTUBE_API_KEY` under **Settings -> Secrets and variables -> Actions**.
2. Set **Settings -> Pages -> Source** to **GitHub Actions**.
3. Push to `master` or run **Deploy GitHub Pages** manually.

The secret stays out of Git history, but the generated key remains visible in the deployed browser configuration and must retain the restrictions described above.

## Privacy and Analytics

Edenia has no application server and does not upload the complete video library, Anki logs, activity logs, backups, or sync files as serialized application state. The official production deployment does send analytics events, person properties, session recordings, search terms, and optional feedback directly to PostHog.

The app makes these external connections:

- YouTube Data API v3 for channel and video metadata.
- Local AnkiConnect when Anki tracking is enabled and Anki is available.
- PostHog only on the official `https://bricechivu.github.io/Edenia/` deployment.

Production analytics create a PostHog person profile for each browser installation. Autocapture is disabled, but session recording is enabled and input text is not masked. Edenia records controlled button actions, raw trimmed search queries, channel additions and removals with channel IDs and names, aggregate daily study progress, streak changes, current and earned town levels, current settings, onboarding completion, YouTube refresh results, successful Anki refreshes with their timestamps and summary counts, video opens, playback-session summaries, Favorite and video-placement changes, and watched-state changes. Each person profile includes the current watched-video IDs and count plus the current removed-video count; watched and unwatched events include the video ID, title, channel ID, watched timestamp, duration, source, and short-video status. Existing local study days, configured channels, and watched videos are synchronized once, then only changed values generate additional state events.

Submitting the feedback form sends its category, message, optional name and email, page and display context, and the current session-replay URL to PostHog. Custom analytics events do not include YouTube API keys, sync-file contents, or the full serialized browser state. Because recordings can capture visible UI and unmasked input text, users should not enter sensitive information in Edenia search or feedback fields. PostHog is not initialized on localhost, alternate domains, sandbox mode, or other paths.

## Project Structure

| Path | Purpose |
| --- | --- |
| `index.html` | App structure, first-run trailer, runtime script loading, and production analytics initialization |
| `src/app.js` | Composition entry plus tightly coupled rendering and lifecycle orchestration |
| `src/core/` | Shared pure helpers and runtime, storage, responsive, and global-action contracts |
| `src/domain/` | Rendering-independent video state and watch-progress rules |
| `src/state/` | State normalization, persistence, backups, history, onboarding, Anki, and insights |
| `src/features/` | Feature models and module-owned DOM action adapters |
| `src/integrations/` | Runtime configuration, analytics bridge, and YouTube parsing |
| `src/i18n/` | Complete English, Traditional Chinese, Simplified Chinese, Spanish, and French dictionaries plus the locale registry |
| `src/styles/` | Ordered foundation, feature, page-flow, input-capability, phone, and wide responsive styles |
| `analytics.js` | PostHog person profiles, deduplicated state synchronization, historical aggregate backfill, and controlled button-action tracking |
| `config.example.js` | Safe local runtime-config template |
| `data/channel-catalog.source.json` | Human-maintained channel catalog and Edenia search metadata |
| `data/channel-catalog.json` | Generated current YouTube channel metadata |
| `data/channel-catalog.community.json` | Generated catalog of channels promoted from verified community additions |
| `data/channel-catalog.discovered.json` | Generated catalog and rotation state for automated YouTube discovery |
| `scripts/` | Static-site build, local development, test governance, and catalog-maintenance tooling |
| `tests/` | Contract, fixture-backed browser-flow, and visual-preservation checks |
| `assets/fonts/` | Self-hosted Space Grotesk and Bebas Neue font subsets |
| `images/channel-avatars/` | Bundled curated-channel avatars |
| `images/city/` | Optimized town progression images |
| `.github/workflows/ci.yml` | Path-selected catalog, build, contract, browser-flow, and visual checks |
| `.github/workflows/deploy-pages.yml` | Static GitHub Pages build and deployment workflow |
| `.github/workflows/refresh-channel-catalog.yml` | Scheduled and source-triggered curated catalog refresh |
| `.github/workflows/discover-language-channels.yml` | Daily automated channel discovery |
| `.github/workflows/merge-checked-discovery-catalog.yml` | CI-success-only merge for the automated discovery PR |
| `.github/workflows/import-community-channel-catalog.yml` | Daily checked PostHog candidate import and community PR publication |
| `.github/workflows/merge-checked-community-catalog.yml` | CI-success-only merge for the automated community PR |

Architecture, preservation, and release references:

- [Architecture](docs/architecture.md)
- [Current experience preservation inventory](docs/current-experience-inventory.md)
- [Responsive review matrix](docs/responsive-review-matrix.md)
- [Deployment and release runbook](docs/deployment-and-releases.md)
- [Archived refactor ledger](migration_changes.md)
- [Contributing guide](CONTRIBUTING.md)
