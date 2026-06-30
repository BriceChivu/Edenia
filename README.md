# Edenia

Edenia is a browser-only learning dashboard for tracking YouTube study videos, Anki activity, weekly study goals, and a city scene that grows as study progress accumulates.

The app is intentionally simple: `index.html`, `style.css`, and `app.js` are all it needs. There is no build step and no backend service.

## What It Does

- Loads recent videos from configured YouTube channels.
- Tracks each video as unwatched, watch later, in progress, or watched.
- Counts watched time toward a weekly hours goal.
- Syncs today's Anki review/new-card counts through AnkiConnect when Anki is open.
- Shows study history totals by day, week, or month.
- Maintains a study streak.
- Updates the city builder scene from video, Anki, and streak progress.
- Saves settings immediately as they change.

## Running Locally

Serve the folder from the project root:

```bash
python3 -m http.server 8000
```

Then open [http://localhost:8000/](http://localhost:8000/) in Chrome.

The app can also be opened from `index.html` directly, but new feature testing should use the local server URL in Chrome so the runtime path matches the expected development workflow.

## Setup

1. Copy `config.example.js` to `config.local.js`.
2. Paste the shared YouTube API key into `config.local.js`.
3. Open the app.
4. Click the settings button.
5. Set the weekly goal in hours.
6. Add YouTube channel IDs.

Edenia loads YouTube videos automatically on startup when the feed has never been fetched or when the last successful fetch is at least 5 hours old. The shared key is not saved in browser storage.

`config.example.js` is only a local-development template. GitHub Pages deployment does not read it; the workflow creates `config.local.js` from the `YOUTUBE_API_KEY` repository secret.

Settings are saved on the fly. There is no separate save button.

## Shared YouTube API Key

`config.local.js` is intentionally ignored by Git so the real shared key is not committed. For a hosted static deployment, the key is still visible to browsers because frontend code and config files are delivered to users. Treat it as a public restricted key, not a secret.

Recommended Google Cloud restrictions:

1. Restrict the key to **YouTube Data API v3** only.
2. Restrict browser usage to the exact hosted domain with HTTP referrers.
3. Set quota alerts and review usage regularly.
4. Keep a second restricted key available for rotation.

## GitHub Pages Deployment

The GitHub Pages workflow generates `config.local.js` during deployment from a repository secret. The real key stays out of Git history, but the deployed website still serves it to browsers, so the Google Cloud restrictions above are required.

To set it up:

1. In GitHub, open the repository settings.
2. Go to **Secrets and variables** -> **Actions**.
3. Add a repository secret named `YOUTUBE_API_KEY`.
4. Paste the restricted YouTube API key as the value.
5. Go to **Pages** and set the source to **GitHub Actions**.
6. Push to `main` or `master`, or run the `Deploy GitHub Pages` workflow manually.

## YouTube Channels

Channel IDs should start with `UC`.

To find one:

1. Visit the YouTube channel page.
2. Use the share menu and choose `Copy channel ID`, or inspect a URL like `youtube.com/channel/UCxxxxxxxx`.
3. Paste the ID into the settings panel and click `Add`.

On refresh, Edenia fetches a small recent batch from each channel's uploads playlist, stores the latest active video records, and updates channel display names from the YouTube API when available. It reuses cached video records and durations where possible to keep YouTube API usage lower.

## Watch Status

Each video can be marked:

- `Unwatched`
- `Watch later`
- `In progress`
- `Watched`

Watched videos count for their full duration. In-progress and watch later videos are reminders and do not count toward weekly progress or streaks. Moving a video back to unwatched removes its watched timestamp from weekly progress.

Opening an unwatched or watch-later video marks it as in progress automatically.

The `Undo` button reverses the most recent video status change, including the related streak state.

## AnkiConnect

Anki stats are optional. To enable them:

1. Install the [AnkiConnect plugin](https://ankiweb.net/shared/info/2055492159).
2. Open Anki.
3. Open Edenia.

For the hosted GitHub Pages site, AnkiConnect also needs to allow Edenia's origin. In Anki, open the AnkiConnect add-on config and include `https://bricechivu.github.io` in `webCorsOriginList`, then restart Anki.

The app reads from AnkiConnect at `http://127.0.0.1:8765` automatically on startup, periodically while open, and when the tab becomes visible. It stores today's reviewed and created-card counts locally, but it does not modify the Anki collection.

## Study History

The Study History section aggregates local activity by day, week, or month. It combines watched video time, watched video counts, Anki reviews, and new Anki cards. The Heatmap view shows the last year as daily squares; hover a square to see that day's breakdown.

## Scoring

The city score is cumulative across all study history. Points do not reset each week, so partial progress toward the next city milestone carries forward.

| Activity | Points |
| --- | ---: |
| 1 hour of watched video time | 5 |
| 1 watched video | 1 |
| 50 Anki reviews | 3 |
| 10 new Anki cards | 4 |

City milestones currently include:

| Level | Score | City stage |
| ---: | ---: | --- |
| 1 | 0 | 🏠 Lonely house |
| 2 | 5 | ⛵ Your house got a fresh new look! Plus a boat! |
| 3 | 12 | 🏝️ Oh look! a tiny island! Cute. |
| 4 | 20 | 🛝 Kids are gonna have fun now! |
| 5 | 28 | 🏊 That pool gives holiday vibes... |
| 6 | 35 | 🐟 Oh! Small friends are coming to say hi... |
| 7 | 42 | 🌿 This garden brings a nice atmosphere |

## Where Status Data Is Stored

All current status data is stored in the user's browser, not in the repository and not on a server.

Primary storage:

- Browser `localStorage`
- Key: `edenia_v1`
- Defined in `app.js` as `STORAGE_KEY`

The stored object includes:

- `config`: weekly goal, theme, configured channels, and removed default-channel IDs.
- `videos`: video records keyed by YouTube video ID. This is where watched/in-progress/unwatched status lives.
- `videos[videoId].status`: one of `unwatched`, `watch-later`, `partial`, or `watched`.
- `videos[videoId].watchedAt`: local timestamp used for weekly progress and watched history.
- `cityProgress`: revealed city image level plus any pending level-up unlocked by cumulative study score.
- `streak`: current streak, longest streak, and last activity date.
- `anki`: daily Anki logs keyed by `YYYY-MM-DD`.
- `undoStack`: recent video status changes for the undo button.
- `lastFetched`: last successful YouTube refresh timestamp.

Secondary storage:

- Browser cookie
- Key: `edenia_config`
- Defined in `app.js` as `CONFIG_COOKIE_KEY`

The cookie mirrors configuration data so the app can restore basic settings if the main state is unavailable.

Sync files:

Progress is local to each browser and device. Use Settings -> `Export sync file` to download a private JSON backup of the current browser state, then open Edenia on another device or browser and use Settings -> `Import sync file` to copy that progress there.

The sync file includes progress, configured channels, weekly goal, theme, cached video data, Anki logs, and undo history. It does not include the YouTube API key; local development reads that from `config.local.js`, and GitHub Pages gets it from the generated deployment config. Treat sync files like private backup files and only import normal sync files into the normal app, or sandbox sync files into sandbox mode.

To inspect or clear the data in Chrome:

1. Open Chrome DevTools for `http://localhost:8000/`.
2. Check Storage for `localStorage`.
3. Inspect or remove the `edenia_v1` entry.
4. Use the in-app `Reset everything` action when testing a clean first-run state.

Sandbox mode uses separate browser storage:

- URL: `http://localhost:8000/?sandbox=1`
- `localStorage` key: `edenia_v1_sandbox`
- Cookie key: `edenia_config_sandbox`

When sandbox mode is opened with no saved sandbox state, the app starts from a blank baseline day at level 1 with 0 points. The header shows a `Sandbox version` badge plus `Add day` and `Reset` actions. `Add day` appends a random sandbox-only study day worth 0 to 5 points after the latest sandbox day, and keeps the first baseline day unchanged. `Reset` returns to the same blank baseline state. Sandbox data does not touch the normal `edenia_v1` progress state.

## Testing New Features

Manual feature testing should be done in Chrome at [http://localhost:8000/](http://localhost:8000/).

Recommended workflow:

1. Start the local static server from the project root with `python3 -m http.server 8000`.
2. Open `http://localhost:8000/` in Chrome.
3. Test with existing Edenia browser data first.
4. Test again after using `Reset everything` for a clean local state.
5. Confirm that settings changes persist without a save button.
6. Confirm that video status changes update weekly totals, streak state, watched history, and undo behavior.
7. Confirm that automatic refresh still preserves existing video status.
8. If testing Anki features, keep Anki open with AnkiConnect installed and wait for the automatic refresh.

If a change works in another browser but not Chrome, first try `Cmd + Shift + R` on `http://localhost:8000/` to force Chrome to reload the local files instead of cached copies.

Do not treat browser data as portable test fixtures unless it has been deliberately exported from `localStorage`.

## Privacy

Edenia stores personal progress locally in the browser. The app calls the YouTube Data API to fetch channel and video metadata, and it calls local AnkiConnect only when available. It does not send watch status, streaks, or Anki logs to an app server.
