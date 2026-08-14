import { readFile } from 'node:fs/promises'
import { expect, test as base } from '@playwright/test'

const fixtureRoot = new URL('../fixtures/', import.meta.url)
const youtubeFixtures = {
  channels: JSON.parse(await readFile(new URL('youtube/channels.json', fixtureRoot), 'utf8')),
  playlistItems: JSON.parse(await readFile(new URL('youtube/playlist-items.json', fixtureRoot), 'utf8')),
  search: JSON.parse(await readFile(new URL('youtube/search.json', fixtureRoot), 'utf8')),
  videos: JSON.parse(await readFile(new URL('youtube/videos.json', fixtureRoot), 'utf8'))
}
const ankiFixture = JSON.parse(
  await readFile(new URL('anki/multi.json', fixtureRoot), 'utf8')
)
const placeholderSvg = await readFile(
  new URL('images/external-placeholder.svg', fixtureRoot),
  'utf8'
)

const youtubeIframeStub = `
(() => {
  class Player {
    constructor(_iframe, options = {}) {
      this.currentTime = 0;
      this.options = options;
      queueMicrotask(() => options.events?.onReady?.({ target: this }));
    }
    destroy() {}
    getCurrentTime() { return this.currentTime; }
    pauseVideo() {
      this.options.events?.onStateChange?.({ data: window.YT.PlayerState.PAUSED });
    }
    playVideo() {
      this.options.events?.onStateChange?.({ data: window.YT.PlayerState.PLAYING });
    }
    seekTo(seconds) { this.currentTime = Number(seconds) || 0; }
  }
  window.YT = {
    Player,
    PlayerState: { ENDED: 0, PLAYING: 1, PAUSED: 2 }
  };
  queueMicrotask(() => window.onYouTubeIframeAPIReady?.());
})();
`

function youtubeApiFixture(pathname) {
  const endpoint = pathname.split('/').filter(Boolean).at(-1)
  return youtubeFixtures[endpoint]
}

export const test = base.extend({
  networkGuard: [async ({ context }, use) => {
    const analyticsRequests = []
    const unexpectedRequests = []

    await context.route('**/*', async route => {
      const request = route.request()
      const url = new URL(request.url())
      const hostname = url.hostname.toLowerCase()

      if (hostname === '127.0.0.1' && url.port === '8765') {
        await route.fulfill({
          body: JSON.stringify(ankiFixture),
          contentType: 'application/json',
          status: 200
        })
        return
      }

      if (['localhost', 'localhost.', '127.0.0.1', '::1'].includes(hostname)) {
        await route.continue()
        return
      }

      if (hostname === 'www.googleapis.com' && url.pathname.startsWith('/youtube/v3/')) {
        const fixture = youtubeApiFixture(url.pathname)
        if (fixture) {
          await route.fulfill({
            body: JSON.stringify(fixture),
            contentType: 'application/json',
            status: 200
          })
          return
        }
      }

      if (
        ['www.youtube.com', 'youtube.com'].includes(hostname)
        && url.pathname === '/iframe_api'
      ) {
        await route.fulfill({
          body: youtubeIframeStub,
          contentType: 'text/javascript',
          status: 200
        })
        return
      }

      if (
        ['www.youtube.com', 'youtube.com'].includes(hostname)
        && url.pathname.startsWith('/embed/')
      ) {
        await route.fulfill({
          body: '<!doctype html><title>Stub YouTube embed</title>',
          contentType: 'text/html',
          status: 200
        })
        return
      }

      if (
        request.resourceType() === 'image'
        && (
          hostname === 'i.ytimg.com'
          || hostname === 'yt3.ggpht.com'
          || hostname === 'upload.wikimedia.org'
        )
      ) {
        await route.fulfill({
          body: placeholderSvg,
          contentType: 'image/svg+xml',
          status: 200
        })
        return
      }

      if (
        hostname === 'us.i.posthog.com'
        || hostname === 'us-assets.i.posthog.com'
        || hostname.endsWith('.posthog.com')
      ) {
        analyticsRequests.push(request.url())
        await route.abort('blockedbyclient')
        return
      }

      unexpectedRequests.push(request.url())
      await route.abort('blockedbyclient')
    })

    await use({ analyticsRequests, unexpectedRequests })

    expect(
      analyticsRequests,
      'Automated tests must not contact PostHog'
    ).toEqual([])
    expect(
      unexpectedRequests,
      'Every external request must be explicitly stubbed'
    ).toEqual([])
  }, { auto: true }],

  pageDiagnostics: [async ({ page }, use) => {
    const errors = []
    page.on('console', message => {
      if (message.type() === 'error') errors.push(`console: ${message.text()}`)
    })
    page.on('pageerror', error => errors.push(`page: ${error.message}`))

    await use(errors)

    expect(errors, 'The page must not report console or runtime errors').toEqual([])
  }, { auto: true }]
})

export { expect }
