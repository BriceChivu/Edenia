# Study Build

Study Build is a browser-only learning dashboard for tracking YouTube study videos, Anki activity, weekly study goals, and a city scene that grows as study progress accumulates.

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

If Chrome does not show recent code or styling changes, hard-refresh the page with `Cmd + Shift + R`. Chrome may keep using cached `app.js` or `style.css` after normal reloads.

The app can also be opened from `index.html` directly, but new feature testing should use the local server URL in Safari so the runtime path matches the expected development workflow.

## Setup

1. Open the app.
2. Click the settings button.
3. Add your YouTube API key. The app does not include a bundled key.
4. Set the weekly goal in hours.
5. Add YouTube channel IDs.
6. Click `Refresh` to load the latest videos.

Settings are saved on the fly. There is no separate save button.

## YouTube Channels

Channel IDs should start with `UC`.

To find one:

1. Visit the YouTube channel page.
2. Use the share menu and choose `Copy channel ID`, or inspect a URL like `youtube.com/channel/UCxxxxxxxx`.
3. Paste the ID into the settings panel and click `Add`.

On refresh, Study Build fetches a small recent batch from each channel's uploads playlist, stores the latest active video records, and updates channel display names from the YouTube API when available. It reuses cached video records and durations where possible to keep YouTube API usage lower.

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
3. Open Study Build.

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
| 2 | 5 | ⛵ We got a boat and a fishing line! |
| 3 | 12 | 🌳 A nice park for the kids |
| 4 | 20 | 👋 Welcome to our neighbors! |
| 5 | 28 | 🏊 That pool looks nice |
| 6 | 35 | 🏝️ A tiny island... |

## Where Status Data Is Stored

All current status data is stored in the user's browser, not in the repository and not on a server.

Primary storage:

- Browser `localStorage`
- Key: `studybuild_v1`
- Defined in `app.js` as `STORAGE_KEY`

The stored object includes:

- `config`: API key, weekly goal, theme, configured channels, and removed default-channel IDs.
- `videos`: video records keyed by YouTube video ID. This is where watched/in-progress/unwatched status lives.
- `videos[videoId].status`: one of `unwatched`, `watch-later`, `partial`, or `watched`.
- `videos[videoId].watchedAt`: local timestamp used for weekly progress and watched history.
- `cityProgress`: revealed city image level plus any pending level-up unlocked by cumulative study score.
- `streak`: current streak, longest streak, and last activity date.
- `anki`: daily Anki logs keyed by `YYYY-MM-DD`.
- `lastUndo`: previous video status change for the undo button.
- `lastFetched`: last successful YouTube refresh timestamp.

Secondary storage:

- Browser cookie
- Key: `studybuild_config`
- Defined in `app.js` as `CONFIG_COOKIE_KEY`

The cookie mirrors configuration data so the app can restore basic settings if the main state is unavailable.

To inspect or clear the data in Safari:

1. Open Safari Web Inspector for `http://localhost:8000/`.
2. Check Storage for `localStorage`.
3. Inspect or remove the `studybuild_v1` entry.
4. Use the in-app `Reset everything` action when testing a clean first-run state.

Sandbox mode uses separate browser storage:

- URL: `http://localhost:8001/?sandbox=1`
- `localStorage` key: `studybuild_v1_sandbox`
- Cookie key: `studybuild_config_sandbox`

When sandbox mode is opened with no saved sandbox state, the app starts from a blank baseline day at level 1 with 0 points. The header shows a `Sandbox` badge plus `Add day` and `Reset` actions. `Add day` appends a random sandbox-only study day worth 0 to 5 points after the latest sandbox day, and keeps the first baseline day unchanged. `Reset` returns to the same blank baseline state. Sandbox data does not touch the normal `studybuild_v1` progress state.

## Testing New Features

Manual feature testing should be done in Safari at [http://localhost:8000/](http://localhost:8000/).

Recommended workflow:

1. Start the local static server from the project root with `python3 -m http.server 8000`.
2. Open `http://localhost:8000/` in Safari.
3. Test with existing `studybuild_v1` data first.
4. Test again after using `Reset everything` for a clean local state.
5. Confirm that settings changes persist without a save button.
6. Confirm that video status changes update weekly totals, streak state, watched history, and undo behavior.
7. Confirm that refresh still preserves existing video status.
8. If testing Anki features, keep Anki open with AnkiConnect installed and wait for the automatic refresh.

If a change works in another browser but not Chrome, first try `Cmd + Shift + R` on `http://localhost:8000/` to force Chrome to reload the local files instead of cached copies.

Do not treat browser data as portable test fixtures unless it has been deliberately exported from `localStorage`.

## Privacy

Study Build stores personal progress locally in the browser. The app calls the YouTube Data API to fetch channel and video metadata, and it calls local AnkiConnect only when available. It does not send watch status, streaks, or Anki logs to an app server.
