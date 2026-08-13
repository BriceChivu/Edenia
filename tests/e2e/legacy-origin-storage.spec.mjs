import { expect, test } from '@playwright/test'

const LEGACY_ORIGIN = 'http://localhost:8002'
const DESTINATION_ORIGIN = `http://localhost:${Number(
  process.env.EDENIA_TEST_NORMAL_PORT || 8000
)}`
const PRIMARY_KEY = 'edenia_v1'
const BACKUP_KEY = 'edenia_v1_backups'
const DATABASE_NAME = 'edenia_state_backups_v1'
const STORAGE_PROJECT_NAMES = new Set([
  'desktop-standard',
  'webkit-storage'
])

const primaryState = {
  config: {
    apiKey: 'source-only-secret',
    locale: 'en',
    weeklyGoalHours: 6
  },
  videos: {
    legacyVideo: {
      id: 'legacyVideo',
      status: 'in_progress'
    }
  },
  anki: {
    '2026-08-12': { cards: 17 }
  }
}
const backupEntries = [{
  id: 'legacy-indexed-backup',
  createdAt: '2026-08-12T12:00:00.000Z',
  reason: 'automatic backup',
  sandbox: false,
  state: {
    ...primaryState,
    config: {
      ...primaryState.config,
      weeklyGoalHours: 5
    }
  }
}]

async function deleteDatabase(page, databaseName) {
  await page.evaluate(name => new Promise((resolve, reject) => {
    const request = indexedDB.deleteDatabase(name)
    request.addEventListener('success', () => resolve(), { once: true })
    request.addEventListener('error', () => reject(request.error), {
      once: true
    })
    request.addEventListener('blocked', () => reject(
      new Error('Fixture database deletion was blocked')
    ), { once: true })
  }), databaseName)
}

async function seedLegacyOrigin(page) {
  await page.goto(
    `${LEGACY_ORIGIN}/tests/fixtures/legacy-origin/seed/`
  )
  await deleteDatabase(page, DATABASE_NAME)
  return page.evaluate(async ({ backupEntries, primaryState }) => {
    const primaryRaw = JSON.stringify(primaryState)
    const localBackupRaw = JSON.stringify(backupEntries)
    localStorage.setItem('edenia_v1', primaryRaw)
    localStorage.setItem('edenia_v1_backups', localBackupRaw)

    await new Promise((resolve, reject) => {
      const request = indexedDB.open('edenia_state_backups_v1', 1)
      request.addEventListener('upgradeneeded', () => {
        request.result.createObjectStore('backups', { keyPath: 'id' })
      })
      request.addEventListener('error', () => reject(request.error), {
        once: true
      })
      request.addEventListener('success', () => {
        const database = request.result
        const transaction = database.transaction('backups', 'readwrite')
        const store = transaction.objectStore('backups')
        backupEntries.forEach(entry => store.put(structuredClone(entry)))
        transaction.addEventListener('complete', () => {
          database.close()
          resolve()
        }, { once: true })
        transaction.addEventListener('error', () => reject(
          transaction.error
        ), { once: true })
        transaction.addEventListener('abort', () => reject(
          transaction.error || new Error('Fixture transaction aborted')
        ), { once: true })
      }, { once: true })
    })

    return { localBackupRaw, primaryRaw }
  }, { backupEntries, primaryState })
}

async function existingDatabaseIsReadable(page, databaseName) {
  return page.evaluate(name => new Promise((resolve, reject) => {
    let missing = false
    const request = indexedDB.open(name, 1)
    request.addEventListener('upgradeneeded', event => {
      if (event.oldVersion === 0) {
        missing = true
        request.transaction.abort()
      }
    })
    request.addEventListener('success', () => {
      request.result.close()
      resolve(!missing)
    }, { once: true })
    request.addEventListener('error', () => {
      if (missing && request.error?.name === 'AbortError') {
        resolve(false)
        return
      }
      reject(request.error)
    }, { once: true })
    request.addEventListener('blocked', () => reject(
      new Error('Fixture database open was blocked')
    ), { once: true })
  }), databaseName)
}

test('legacy helper path can read old-origin progress while the destination cannot', async ({
  page
}, testInfo) => {
  test.skip(!STORAGE_PROJECT_NAMES.has(testInfo.project.name))
  const seeded = await seedLegacyOrigin(page)

  await page.route(`${DESTINATION_ORIGIN}/origin-probe`, route => (
    route.fulfill({
      body: '<!doctype html><title>Destination origin probe</title>',
      contentType: 'text/html',
      status: 200
    })
  ))
  await page.goto(`${DESTINATION_ORIGIN}/origin-probe`)
  expect(await page.evaluate(({ backupKey, primaryKey }) => ({
    backupRaw: localStorage.getItem(backupKey),
    primaryRaw: localStorage.getItem(primaryKey)
  }), {
    backupKey: BACKUP_KEY,
    primaryKey: PRIMARY_KEY
  })).toEqual({ backupRaw: null, primaryRaw: null })
  expect(await existingDatabaseIsReadable(page, DATABASE_NAME)).toBe(false)

  await page.goto(
    `${LEGACY_ORIGIN}/tests/fixtures/legacy-origin/edenia-migrate/`
  )
  const helperRead = await page.evaluate(async ({ backupKey, primaryKey }) => {
    const [indexedDbModule, backupModule, contractModule] = await Promise.all([
      import('/src/state/indexed-db-backups.js'),
      import('/src/state/backups.js'),
      import('/src/state/persistence-contract.js')
    ])
    const indexed = await indexedDbModule.readIndexedDbBackupEntries({
      isValidEntry: entry => backupModule.isValidStateBackupEntry(
        entry,
        contractModule.isValidStateShape
      )
    })
    const database = await new Promise((resolve, reject) => {
      const request = indexedDB.open('edenia_state_backups_v1', 1)
      request.addEventListener('success', () => resolve(request.result), {
        once: true
      })
      request.addEventListener('error', () => reject(request.error), {
        once: true
      })
    })
    const storeNames = [...database.objectStoreNames]
    database.close()
    return {
      backupRaw: localStorage.getItem(backupKey),
      indexed,
      pathname: location.pathname,
      primaryRaw: localStorage.getItem(primaryKey),
      storeNames
    }
  }, {
    backupKey: BACKUP_KEY,
    primaryKey: PRIMARY_KEY
  })

  expect(helperRead.pathname).toBe(
    '/tests/fixtures/legacy-origin/edenia-migrate/'
  )
  expect(helperRead.primaryRaw).toBe(seeded.primaryRaw)
  expect(helperRead.backupRaw).toBe(seeded.localBackupRaw)
  expect(helperRead.indexed).toEqual({
    entries: backupEntries,
    error: null,
    exists: true
  })
  expect(helperRead.storeNames).toEqual(['backups'])

  expect(await page.evaluate(({ backupKey, primaryKey }) => ({
    backupRaw: localStorage.getItem(backupKey),
    primaryRaw: localStorage.getItem(primaryKey)
  }), {
    backupKey: BACKUP_KEY,
    primaryKey: PRIMARY_KEY
  })).toEqual({
    backupRaw: seeded.localBackupRaw,
    primaryRaw: seeded.primaryRaw
  })
})
