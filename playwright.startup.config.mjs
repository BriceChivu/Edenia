import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './tests/e2e', testMatch: /tiny-swords-startup\.spec\.mjs/,
  outputDir: 'test-results/startup', workers: 1, retries: 0, reporter: [['list']],
  use: { trace: 'retain-on-failure', locale: 'en-US', timezoneId: 'Asia/Taipei', serviceWorkers: 'block' },
  projects: [
    { name: 'mac-chrome', use: { browserName: 'chromium', channel: 'chrome', viewport: { width: 1440, height: 900 } } },
    { name: 'chromium-phone', use: { browserName: 'chromium', viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true } },
    { name: 'webkit-phone', use: { browserName: 'webkit', viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true } },
    { name: 'firefox', use: { browserName: 'firefox', viewport: { width: 1440, height: 900 } } }
  ]
})
