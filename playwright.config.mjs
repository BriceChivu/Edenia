import { defineConfig } from '@playwright/test'

const normalPort = Number(process.env.EDENIA_TEST_NORMAL_PORT || 8000)
const sandboxPort = 8001

const responsiveProjects = [
  {
    name: 'desktop-wide',
    use: { viewport: { width: 1710, height: 986 } }
  },
  {
    name: 'desktop-standard',
    use: { viewport: { width: 1440, height: 900 } }
  },
  {
    name: 'tablet-portrait',
    use: {
      hasTouch: true,
      viewport: { width: 1024, height: 1366 }
    }
  },
  {
    name: 'tablet-landscape',
    use: {
      hasTouch: true,
      viewport: { width: 1366, height: 1024 }
    }
  },
  {
    name: 'phone-standard',
    use: {
      hasTouch: true,
      isMobile: true,
      viewport: { width: 390, height: 844 }
    }
  },
  {
    name: 'phone-small',
    use: {
      hasTouch: true,
      isMobile: true,
      viewport: { width: 360, height: 800 }
    }
  }
]

export default defineConfig({
  testDir: './tests/e2e',
  outputDir: 'test-results',
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI
    ? [['dot'], ['html', { open: 'never' }]]
    : [['list'], ['html', { open: 'never' }]],
  snapshotPathTemplate: '{testDir}/{testFilePath}-snapshots/{arg}-{projectName}{ext}',
  timeout: 30_000,
  expect: {
    timeout: 5_000,
    toHaveScreenshot: {
      maxDiffPixelRatio: 0.01
    }
  },
  use: {
    baseURL: `http://localhost:${normalPort}`,
    colorScheme: 'light',
    locale: 'en-US',
    serviceWorkers: 'block',
    timezoneId: 'Asia/Taipei',
    trace: 'retain-on-failure'
  },
  projects: responsiveProjects.map(project => ({
    ...project,
    use: {
      browserName: 'chromium',
      deviceScaleFactor: 1,
      ...project.use
    }
  })),
  webServer: [
    {
      command: `node scripts/serve-static.mjs --host localhost --port ${normalPort} --root _site`,
      reuseExistingServer: false,
      timeout: 15_000,
      url: `http://localhost:${normalPort}/`
    },
    {
      command: `node scripts/serve-static.mjs --host localhost --port ${sandboxPort} --root _site`,
      reuseExistingServer: false,
      timeout: 15_000,
      url: `http://localhost:${sandboxPort}/`
    }
  ]
})
