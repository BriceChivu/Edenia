# Study Build

Study Build is a browser-only learning dashboard for tracking YouTube study videos, Anki activity, weekly study goals, and a city scene that grows as study progress accumulates.

The app is intentionally simple: `index.html`, `style.css`, and `app.js` are all it needs. There is no build step and no backend service.

## What It Does

- Loads recent videos from configured YouTube channels.
- Tracks each video as unwatched, watch later, in progress, or watched.
- Counts watched time toward a weekly hours goal.
- Syncs today's Anki review/new-card counts through AnkiConnect when Anki is open.
- Maintains a study streak.
- Updates the city builder scene from video, Anki, and streak progress.
- Saves settings immediately as they change.

## Running Locally

Serve the folder from the project root:

```bash
python3 -m http.server 8000
```

Then open [http://localhost:8000/](http://localhost:8000/) in Chrome.

The app can also be opened from `index.html` directly, but new feature testing should use the local server URL in Safari so the runtime path matches the expected development workflow.

## Setup

1. Open the app.
2. Click the settings button.
3. Add or update the YouTube API key.
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

On refresh, Study Build fetches videos from each channel's uploads playlist, stores the latest active video records, and updates channel display names from the YouTube API when available.

## Watch Status

Each video can be marked:

- `Unwatched`
- `Watch later`
- `In progress`
- `Watched`

Watched videos count for their full duration. In-progress videos count for half their duration. Watch later videos are reminders and do not count toward weekly progress or streaks. Moving a video back to unwatched removes its watched timestamp from weekly progress.

The `Undo` button reverses the most recent video status change, including the related streak state.

## AnkiConnect

Anki stats are optional. To enable them:

1. Install the [AnkiConnect plugin](https://ankiweb.net/shared/info/2055492159).
2. Open Anki.
3. In Study Build, click `Refresh Anki`.

The app reads from AnkiConnect at `http://127.0.0.1:8765`. It stores today's reviewed and created-card counts locally, but it does not modify the Anki collection.

## Scoring

The weekly city score is calculated from:

| Activity | Points |
| --- | ---: |
| 1 hour of watched video time | 5 |
| 50 Anki reviews | 3 |
| 10 new Anki cards | 4 |
| 1 current streak day | 0.5 |

City milestones currently include:

| Score | City stage |
| ---: | --- |
| 0 | Empty land |
| 5 | First trees |
| 12 | More trees |
| 20 | Farmhouse |
| 28 | Farm wagon |
| 35 | Barn |
| 45 | Horse cart |
| 50 | Homestead |
| 58 | Flying pig |
| 65 | Two houses |
| 70 | Pasture cow |
| 75 | Timber crane |
| 85 | Windmill rising |
| 88 | Eagle overhead |
| 92 | Stable horse |
| 100 | Full village |

## Where Status Data Is Stored

All current status data is stored in the user's browser, not in the repository and not on a server.

Primary storage:

- Browser `localStorage`
- Key: `studybuild_v1`
- Defined in `app.js` as `STORAGE_KEY`

The stored object includes:

- `config`: API key, weekly goal, theme, and configured channels.
- `videos`: video records keyed by YouTube video ID. This is where watched/in-progress/unwatched status lives.
- `videos[videoId].status`: one of `unwatched`, `watch-later`, `partial`, or `watched`.
- `videos[videoId].watchedAt`: local timestamp used for weekly progress and watched history.
- `streak`: current streak, longest streak, and last activity date.
- `anki`: daily Anki logs keyed by `YYYY-MM-DD`.
- `nightVisuals`: generated schedule for night city events.
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
8. If testing Anki features, keep Anki open with AnkiConnect installed, then use `Refresh Anki`.

Do not treat browser data as portable test fixtures unless it has been deliberately exported from `localStorage`.

## Privacy

Study Build stores personal progress locally in the browser. The app calls the YouTube Data API to fetch channel and video metadata, and it calls local AnkiConnect only when available. It does not send watch status, streaks, or Anki logs to an app server.
