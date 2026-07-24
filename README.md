# Edenia

Edenia turns YouTube study time and optional Anki activity into visible language-learning progress. It combines a focused video queue, weekly goals, study history, local pattern insights, streaks, and a town that evolves as study points accumulate.

The app is browser-first and has no application backend. Its interface and progress state run from static HTML, CSS, and JavaScript, with YouTube Data API access supplied through a runtime configuration file. Personal study data remains in the browser unless the user explicitly exports a sync file.

## Current Features

### Personalized first run

- Opens with a localized animated introduction to Edenia's study loop, town progression, history, and insights.
- Includes trailer navigation, a language picker, optional procedural music, and a skip action.
- Asks for one primary learning language: Mandarin Chinese, Japanese, Korean, Spanish, French, German, or English.
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
- Lets users remove a video from the active grid without deleting its study history.
- Hides videos of three minutes or less by default; the preference can be changed in Settings.
- Shows a contextual **Continue studying** card for the next active video, including a clickable thumbnail.

Supported video states are:

- `Unwatched`
- `Watch later`
- `In progress`
- `Watched`

Opening an unwatched or watch-later video marks it in progress. In-progress videos can retain a continue-watching timestamp and watched-progress segments. Watch-later remains a reminder state and does not count toward goals, streaks, or points.

Undo and redo cover recent status, progress, manual-video, and channel-removal actions together with their related history and score changes.

### Goals, history, and insights

- Tracks watched video time against a weekly goal from 1 to 99 hours.
- Shows watched and in-progress counts, remaining time, and goal completion.
- Converts the remaining goal into localized daily pace guidance when study videos are available.
- Maintains current and longest study streaks; a day qualifies after earning at least 0.5 points.
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
daily points = floor((video seconds / 3600 × 3) + (Anki reviews / 60 × 2))
```

| Activity | Points |
| --- | ---: |
| 1 hour of watched video time | 3 |
| 60 Anki reviews | 2 |

There is no separate bonus for marking a video watched or for the number of videos completed. New Anki cards are recorded for context but do not award points.

Examples:

- 30 minutes of video produces `1.5` points, which becomes `1` point when it is the only activity that day.
- 30 Anki reviews produce `1` point.
- 30 minutes of video plus 30 Anki reviews produce `2.5` points together, which becomes `2` points for that day.
- Fractional points do not carry into another day.

| Level | Required score |
| ---: | ---: |
| 1 | 0 |
| 2 | 5 |
| 3 | 12 |
| 4 | 20 |
| 5 | 28 |
| 6 | 35 |
| 7 | 42 |
| 8 | 50 |
| 9 | 60 |
| 10 | 70 |
| 11 | 80 |
| 12 | 90 |

## Run Locally

1. Copy `config.example.js` to `config.local.js`.
2. Add a YouTube Data API v3 key to `config.local.js`:

   ```js
   window.EDENIA_CONFIG = {
     youtubeApiKey: 'YOUR_RESTRICTED_KEY'
   }
   ```

3. Serve the repository root:

   ```bash
   python3 -m http.server 8000
   ```

4. Open [http://localhost:8000/](http://localhost:8000/).

There is no dependency installation or local build step. Opening `index.html` directly may display the interface, but serving the folder provides the expected runtime origin and file-loading behavior.

`config.local.js` is ignored by Git. `config.example.js` is only the local-development template and is not used by the GitHub Pages workflow.

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

`.github/workflows/refresh-channel-catalog.yml` also refreshes the catalog when the source or refresh script changes, on manual dispatch, and twice per month. It commits only the generated catalog. Missing or deleted channels remain in the generated file with `available: false` so they can be corrected without losing the editorial entry.

The workflow requires a separate `YOUTUBE_CATALOG_API_KEY` repository secret. Create that credential in the same Google Cloud project, restrict it to YouTube Data API v3, and keep it only in GitHub Actions. Do not apply Edenia's browser-referrer restriction to this automation key because GitHub's server-side runner does not send the deployed site's referrer. Both credentials still share the same project quota.

## Anki Setup

1. Install [AnkiConnect](https://ankiweb.net/shared/info/2055492159).
2. Open Anki and keep it running while using Edenia.
3. For the hosted site, add `https://bricechivu.github.io` to AnkiConnect's `webCorsOriginList` and restart Anki.
4. Leave **Track Anki activity** enabled in Edenia Settings.

Edenia communicates only with the local AnkiConnect endpoint at `http://127.0.0.1:8765`.

## Data Storage and Portability

Normal and sandbox progress are isolated in browser storage.

| Mode | URL | State key | Backup key | Config cookie |
| --- | --- | --- | --- | --- |
| Normal | `/` | `edenia_v1` | `edenia_v1_backups` | `edenia_config` |
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

1. Copies `index.html`, `app.js`, `analytics.js`, `style.css`, the favicon, fonts, and images into `_site`.
2. Minifies the deployed CSS and main JavaScript.
3. Generates `_site/config.local.js` from the `YOUTUBE_API_KEY` repository secret.
4. Uploads and deploys the static Pages artifact.

Repository setup:

1. Add a restricted repository secret named `YOUTUBE_API_KEY` under **Settings -> Secrets and variables -> Actions**.
2. Set **Settings -> Pages -> Source** to **GitHub Actions**.
3. Push to `master` or run **Deploy GitHub Pages** manually.

The secret stays out of Git history, but the generated key remains visible in the deployed browser configuration and must retain the restrictions described above.

## Privacy and Analytics

Study state remains local: Edenia has no application server and does not upload the complete video library, Anki logs, activity logs, backups, or sync files. The limited analytics fields described below are sent directly to PostHog on the official production deployment.

The app makes these external connections:

- YouTube Data API v3 for channel and video metadata.
- Local AnkiConnect when Anki tracking is enabled and Anki is available.
- PostHog only on the official `https://bricechivu.github.io/Edenia/` deployment.

Production analytics create a PostHog person profile for each browser installation, with autocapture and session recording disabled. Edenia records controlled button actions, channel additions and removals with channel IDs and names, aggregate daily study progress, streak changes, current and earned town levels, current settings, onboarding completion, YouTube refresh results, successful Anki refreshes with their timestamps and summary counts, video opens, and watched-state changes. Each person profile includes the current watched-video IDs and count; watched and unwatched events include the video ID, title, channel ID, watched timestamp, duration, source, and short-video status. Existing local study days, configured channels, and watched videos are synchronized once, then only changed values generate additional state events. YouTube API keys, sync-file contents, and raw browser state are not sent. PostHog is not initialized on localhost, alternate domains, sandbox mode, or other paths.

## Project Structure

| Path | Purpose |
| --- | --- |
| `index.html` | App structure, first-run trailer, runtime script loading, and production analytics initialization |
| `style.css` | Responsive layout, themes, motion, accessibility, and component styling |
| `app.js` | State, localization, onboarding, YouTube and Anki integrations, history, insights, scoring, and rendering |
| `analytics.js` | PostHog person profiles, deduplicated state synchronization, historical aggregate backfill, and controlled button-action tracking |
| `config.example.js` | Safe local runtime-config template |
| `data/channel-catalog.source.json` | Human-maintained channel catalog and Edenia search metadata |
| `data/channel-catalog.json` | Generated current YouTube channel metadata |
| `scripts/refresh-channel-catalog.mjs` | Catalog validation, channel-ID resolution, and batched metadata refresh |
| `assets/fonts/` | Self-hosted Space Grotesk and Bebas Neue font subsets |
| `images/channel-avatars/` | Bundled curated-channel avatars |
| `images/city/` | Optimized town progression images |
| `.github/workflows/deploy-pages.yml` | Static GitHub Pages build and deployment workflow |
| `.github/workflows/refresh-channel-catalog.yml` | Scheduled and source-triggered channel catalog refresh |
