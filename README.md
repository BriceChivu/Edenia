# Edenia

Edenia is a browser-only learning dashboard for tracking YouTube study videos, optional Anki activity, weekly study goals, and a city scene that grows as study progress accumulates.

The app is intentionally simple: `index.html`, `style.css`, `app.js`, image assets, and a runtime config file are all it needs. There is no build step and no backend service.

## What It Does

- Personalizes first run around one primary learning language and an approximate level.
- Recommends a preselected starter set from a curated, language-and-level-specific YouTube channel catalog.
- Loads recent videos from configured YouTube channels.
- Accepts YouTube channel IDs, `@handle` URLs, `/channel/UC...` URLs, and legacy `/user/...` URLs for channels.
- Lets you manually add a YouTube video URL that is not in a tracked channel.
- Tracks videos as unwatched, watch later, in progress, or watched.
- Stores an optional continue-watching timestamp for in-progress videos.
- Filters the active video list by status and channel, and searches saved videos from the header.
- Can hide short videos under 3 minutes during refresh and from the active video list.
- Counts watched time toward a weekly hours goal.
- Syncs today's Anki review/new-card counts through AnkiConnect when Anki is open.
- Shows study history totals by week or month, with summary and heatmap views.
- Maintains a study streak.
- Updates a zoomable/pannable city scene from video, Anki, and streak progress.
- Supports light/dark theme and English, Traditional Chinese, Simplified Chinese, Spanish, and French UI text.
- Keeps an activity log for user actions, automatic refreshes, imports, backups, point changes, and issues.
- Saves settings immediately as they change.

## Running Locally

Serve the folder from the project root:

```bash
python3 -m http.server 8000
```

Then open [http://localhost:8000/](http://localhost:8000/) in Chrome.

The app can also be opened from `index.html` directly, but feature testing should use the local server URL in Chrome so the runtime path matches the expected development workflow.

## Setup

1. Copy `config.example.js` to `config.local.js`.
2. Paste the shared YouTube API key into `config.local.js`.
3. Open the app.
4. Choose one primary learning language.
5. Choose the level that best describes your current ability.
6. Review the preselected starter channels, deselect any you do not want, and click `Start my journey`.
7. Follow the brief first-study walkthrough pointing out channel controls and the real video feed.
8. Use Settings to adjust the weekly goal, interface language, short-video preference, channels, or optional Anki integration.

Edenia loads YouTube videos automatically on startup when the feed has never been fetched or when the last successful fetch is at least 5 hours old. Each channel also has a 30-minute backoff after a refresh error. The shared key is not saved in browser storage or sync files.

`config.example.js` is only a local-development template. GitHub Pages deployment does not read it; the workflow creates `config.local.js` from the `YOUTUBE_API_KEY` repository secret.

Settings are saved on the fly. There is no separate save button.

## First-Run Journey

The first-run profile currently asks for one primary learning language and one approximate level. Edenia uses that pair to select up to three matching entries from its curated starter catalog. Recommendations are preselected but optional, so the learner can keep, remove, or add choices before continuing.

Catalog entries use YouTube `@handle` values. When `Start my journey` is selected, Edenia resolves every chosen handle through the YouTube Data API, saves the resulting channels, and attempts to load their recent videos before opening the real dashboard. Successfully resolved channels appear in the Channels menu and fetched videos appear in the grid. Partial channel or video-fetch failures are reported after the dashboard opens; onboarding only stays on the starter-channel step when none of the selected channels can be resolved. A configured YouTube API key is required for this process.

Existing browser states that recorded the previous `onboarding.completed` flag are migrated to both `setupCompleted` and `walkthroughCompleted`. Those users keep their existing setup and are not sent through the new first-run flow again.

## Shared YouTube API Key

`config.local.js` is intentionally ignored by Git so the real shared key is not committed. For a hosted static deployment, the key is still visible to browsers because frontend code and config files are delivered to users. Treat it as a public restricted key, not a secret.

Recommended Google Cloud restrictions:

1. Restrict the key to **YouTube Data API v3** only.
2. Restrict browser usage to the exact hosted domain with HTTP referrers.
3. For this GitHub Pages deployment, allow `https://bricechivu.github.io/*`.
4. Set quota alerts and review usage regularly.
5. Keep a second restricted key available for rotation.

## GitHub Pages Deployment

The GitHub Pages workflow generates `config.local.js` during deployment from a repository secret. The real key stays out of Git history, but the deployed website still serves it to browsers, so the Google Cloud restrictions above are required.

The workflow stages only the static site files into `_site`: `index.html`, `app.js`, `style.css`, `Edenia_favicon_round.png`, `images/`, and the generated `config.local.js`.

To set it up:

1. In GitHub, open the repository settings.
2. Go to **Secrets and variables** -> **Actions**.
3. Add a repository secret named `YOUTUBE_API_KEY`.
4. Paste the restricted YouTube API key as the value.
5. Go to **Pages** and set the source to **GitHub Actions**.
6. Push to `master`, or run the `Deploy GitHub Pages` workflow manually.

## YouTube Channels And Videos

Channel IDs should start with `UC`.

The channel field accepts:

- A raw channel ID like `UCxxxxxxxx`.
- A channel URL like `youtube.com/channel/UCxxxxxxxx`.
- A handle URL like `youtube.com/@channel`.
- A legacy username URL like `youtube.com/user/name`.

Custom `/c/...` YouTube URLs are not resolved automatically. Use a channel ID, handle, or supported URL instead.

On refresh, Edenia fetches one recent uploads-playlist page per due channel, keeps up to 5 active videos per channel target, stores video durations, and updates channel display names from the YouTube API when available. It reuses cached video records and durations where possible to keep YouTube API usage lower.

Use `Add video` to paste a specific YouTube video URL that is not in a tracked channel. Manually added videos are stored with the rest of the local video state and can be undone.

## Watch Status

Each video can be marked:

- `Unwatched`
- `Watch later`
- `In progress`
- `Watched`

Watched videos count for their full duration. In-progress videos can store a resume timestamp and count watched progress up to that timestamp. Watch-later videos are reminders and do not count toward weekly progress or streaks. Moving a video back to unwatched removes its watched progress from weekly totals.

Opening an unwatched or watch-later video marks it as in progress automatically.

`Undo` and `Redo` reverse or replay recent video status, resume-time, and manual-video actions, including related score and history changes.

## AnkiConnect

Anki stats are optional. To enable them:

1. Install the [AnkiConnect plugin](https://ankiweb.net/shared/info/2055492159).
2. Open Anki.
3. Open Edenia.

For the hosted GitHub Pages site, AnkiConnect also needs to allow Edenia's origin. In Anki, open the AnkiConnect add-on config and include `https://bricechivu.github.io` in `webCorsOriginList`, then restart Anki.

The app reads from AnkiConnect at `http://127.0.0.1:8765` automatically on startup, every 5 minutes while open, and when the tab becomes visible. It stores today's reviewed and created-card counts locally, but it does not modify the Anki collection.

## Study History

The Study History section aggregates local activity by week or month. It tracks watched video time, watched video counts, Anki reviews, new Anki cards, and scored points. New Anki cards are shown for context, but they do not add points.

The Summary view shows period totals and a day-by-day table. The Heatmap view shows the last year as daily squares; hover or click a square to see that day's breakdown.

The city timeline under the city image previews how the city looked across activity days.

## Scoring

The city score is cumulative across all study history. Points do not reset each week, so partial progress toward the next city milestone carries forward.

| Activity | Points |
| --- | ---: |
| 1 hour of watched video time | 3 |
| 1 watched video | 1 |
| 60 Anki reviews | 2 |

City milestones currently include:

| Level | Score | City stage |
| ---: | ---: | --- |
| 1 | 0 | 🏠 Lonely house |
| 2 | 5 | ⛵ Your house got a fresh new look! Plus a boat! |
| 3 | 12 | 🏝️ Oh look! A tiny island! Cute. |
| 4 | 20 | Kids are gonna have fun now! |
| 5 | 28 | Let's add a pool to chill |
| 6 | 35 | Oh! Some friends are coming to say hi... |
| 7 | 42 | You expanded your small island! |
| 8 | 50 | That's a nice deckchair and some pretty flowers! 🌸 |
| 9 | 60 | You built a cute house in the backyard |
| 10 | 70 | Oh wow! You got a neighbor! 🏠 |
| 11 | 80 | The little purple house has a cute garden! |
| 12 | 90 | Damn! A volcano appeared! I hope it won't erupt... |

## Where Status Data Is Stored

All current status data is stored in the user's browser, not in the repository and not on a server.

Primary storage:

- Browser `localStorage`
- Key: `edenia_v1`
- Backup key: `edenia_v1_backups`
- Defined in `app.js` as `NORMAL_STORAGE_KEY`; `STORAGE_KEY` selects the normal or sandbox key for the current URL mode.

The stored object includes:

- `config`: weekly goal, theme, locale, short-video preference, configured channels, and removed default-channel IDs.
- `videos`: video records keyed by YouTube video ID. This is where watched/in-progress/unwatched/watch-later status lives.
- `videos[videoId].status`: one of `unwatched`, `watch-later`, `partial`, or `watched`.
- `videos[videoId].watchedAt`: local timestamp used for weekly progress and watched history.
- `videos[videoId].resumeAtSeconds`: continue-watching timestamp for in-progress videos.
- `videos[videoId].watchProgress`: watched-progress segments used for partial progress.
- `cityProgress`: revealed city image level plus any pending level-up unlocked by cumulative study score.
- `streak`: current streak, longest streak, and last activity date.
- `anki`: daily Anki logs keyed by `YYYY-MM-DD`.
- `undoStack` and `redoStack`: recent video actions for undo and redo.
- `activityLog`: recent user, automatic, point, backup, import, refresh, and issue entries.
- `channelRefreshes`: per-channel YouTube refresh timestamps, latest refresh errors, and short failure backoff timestamps.
- `learnerProfile`: the selected primary learning language, approximate level, curated starter-channel IDs, and profile timestamps.
- `onboarding`: separate setup and walkthrough completion state, plus the recommendation-application timestamp.

Edenia also keeps recent local backup snapshots in the same browser. These snapshots are created automatically before normal saves at a limited interval and immediately before risky actions such as sync import, reset, sandbox reset, or automatic cleanup. Use Settings -> `Recent local backups` to restore one of the latest snapshots after a bad import, reset, or corrupted save.

Secondary storage:

- Browser cookie
- Key: `edenia_config`
- Defined in `app.js` as `CONFIG_COOKIE_KEY`

The cookie mirrors configuration data so the app can restore basic settings if the main state is unavailable.

Sync files:

Progress is local to each browser and device. Local backup snapshots help inside the same browser, but they do not protect against clearing site data, deleting the browser profile, or losing the device. Use Settings -> `Export sync file` to download a private JSON backup of the current browser state, then open Edenia on another device or browser and use Settings -> `Import sync file` to copy that progress there.

The sync file includes progress, configured channels, weekly goal, theme, locale, short-video preference, cached video data, Anki logs, activity log, and undo/redo history. It does not include the YouTube API key; local development reads that from `config.local.js`, and GitHub Pages gets it from the generated deployment config. Treat sync files like private backup files and only import normal sync files into the normal app, or sandbox sync files into sandbox mode.

To inspect or clear the data in Chrome:

1. Open Chrome DevTools for `http://localhost:8000/`.
2. Check Storage for `localStorage`.
3. Inspect or remove the `edenia_v1` entry.
4. Use the in-app `Reset everything` action when testing a clean first-run state.

Sandbox mode uses separate browser storage:

- URL: `http://localhost:8000/?sandbox=1`
- `localStorage` key: `edenia_v1_sandbox`
- Backup key: `edenia_v1_sandbox_backups`
- Cookie key: `edenia_config_sandbox`

When sandbox mode is opened with no saved sandbox state, the app starts from a blank baseline day at level 1 with 0 points. The header shows a `Sandbox version` badge plus `Add day` and `Reset` actions. `Add day` appends a random sandbox-only study day after the latest sandbox day and keeps the first baseline day unchanged. `Reset` returns to the same blank baseline state. Sandbox data does not touch the normal `edenia_v1` progress state.

## Testing New Features

Manual feature testing should be done in Chrome at [http://localhost:8000/](http://localhost:8000/).

Recommended workflow:

1. Start the local static server from the project root with `python3 -m http.server 8000`.
2. Open `http://localhost:8000/` in Chrome.
3. Test with existing Edenia browser data first.
4. Test again after using `Reset everything` for a clean local state.
5. Confirm that settings changes persist without a save button.
6. Confirm that video status changes update weekly totals, streak state, watched history, activity log, and undo/redo behavior.
7. Confirm that automatic refresh still preserves existing video status.
8. If testing Anki features, keep Anki open with AnkiConnect installed and wait for the automatic refresh.

If a change works in another browser but not Chrome, first try `Cmd + Shift + R` on `http://localhost:8000/` to force Chrome to reload the local files instead of cached copies.

Do not treat browser data as portable test fixtures unless it has been deliberately exported from `localStorage`.

## Privacy

Edenia stores personal progress locally in the browser. The app calls the YouTube Data API to fetch channel and video metadata, and it calls local AnkiConnect only when available. It does not send watch status, streaks, Anki logs, activity logs, or sync files to an app server.
