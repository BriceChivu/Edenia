# Study Build 📺

A personal learning dashboard for tracking YouTube study content, Anki progress, and streaks — with a city builder that grows as you learn.

## Setup (5 minutes)

### 1. Get a YouTube API key

1. Go to [console.cloud.google.com](https://console.cloud.google.com)
2. Create a new project (name it anything)
3. Search for **"YouTube Data API v3"** → Enable it
4. Go to **Credentials** → **Create Credentials** → **API key**
5. Copy the key
6. Optional but recommended: click **Edit key** → restrict it to *YouTube Data API v3*

### 2. Run the app

Open `index.html` in any browser — no build step, no server needed.

On first load, you'll see a setup screen. Paste your API key and set your weekly goal.

### 3. Add your channels

Click **⚙ Settings** → paste a channel ID and a display name → **Add**.

**How to find a channel ID:**
- Go to the channel's YouTube page
- Click the share icon → **Share** → **Copy channel ID** (starts with `UC`)
- Or check the URL: `youtube.com/channel/UCxxxxxxxx`

### 4. Refresh

Click **↻ Refresh** to load the latest videos. Channel names update automatically from the API.

---

## Features

| Feature | How it works |
|---|---|
| Video feed | Latest 15 videos per channel, sorted by date |
| Watch tracking | Mark videos as ✓ Watched or ⏸ In Progress |
| Hours tracker | Full watch = full duration, partial = 50% |
| Weekly goal | Progress bar toward your hour target |
| Streak | Bumps when you watch or log Anki |
| Anki logger | Manual entry or auto-fill via AnkiConnect |
| City builder | Visual reward — grows as weekly score increases |

## City score formula

| Activity | Points |
|---|---|
| 1 hour of video | 5 pts |
| 50 Anki reviews | 3 pts |
| 10 new Anki cards | 4 pts |
| 1 streak day | 0.5 pts |

| Score | City stage |
|---|---|
| 0–4 | 🌑 Empty land |
| 5–11 | 🌱 First tree |
| 12–19 | 🌲 Two trees |
| 20–34 | 🏡 Farmhouse (goal reached!) |
| 35–49 | 🌾 Barn built |
| 50–64 | 🪣 Homestead |
| 65–84 | 🏠 Two houses |
| 85–99 | ⚙️ Windmill |
| 100+ | 🏘️ Full village |

## AnkiConnect (optional)

Install the [AnkiConnect plugin](https://ankiweb.net/shared/info/2055492159) in Anki. With Anki open, click **⚡ AnkiConnect** in the dashboard to auto-fill today's review count.

## Hosting on GitHub Pages

Since all data is stored in `localStorage`, you can host this as a public repo without exposing your API key — the key is entered through the setup screen and never touches your code.

1. Push `index.html`, `style.css`, `app.js` to a GitHub repo
2. Go to Settings → Pages → Deploy from branch → `main` / `root`
3. Visit `yourusername.github.io/repo-name`
4. Enter your API key on first visit (stored locally in your browser)

## Data & privacy

All watch history, streaks, and Anki logs are stored in your browser's `localStorage`. Nothing is sent anywhere except YouTube's API to fetch video metadata.

To export or reset: open browser DevTools → Application → Local Storage → `studybuild_v1`.
