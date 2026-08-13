import { readFile } from 'node:fs/promises'
import {
  decodeBase64Url,
  LEGACY_PROGRESS_TRANSFER_MAX_BYTES,
  sanitizePortableProgressState,
  sha256Base64Url
} from '../../src/state/portable-state.js'
import {
  decryptProgressTransfer
} from '../../src/state/legacy-progress-crypto.js'
import { expect, test } from '../support/network-fixture.mjs'

const HELPER_ORIGIN = 'http://localhost:8002'
const HELPER_URL = `${HELPER_ORIGIN}/_legacy_migration_site/`
const DESTINATION_ORIGIN = 'http://localhost:8000'
const RELAY_URL = `${HELPER_ORIGIN}/functions/v1/create-legacy-progress-transfer`
const STORAGE_PROJECT_NAMES = new Set([
  'desktop-standard',
  'webkit-storage'
])
const TEST_CONFIG = `window.EDENIA_LEGACY_MIGRATION_CONFIG = ${JSON.stringify({
  createTransferUrl: RELAY_URL,
  returnUrl: `${DESTINATION_ORIGIN}/`,
  supabasePublishableKey: 'sb_publishable_localtest',
  supabaseUrl: `${HELPER_ORIGIN}/`
})}`

function futureExpiry() {
  return new Date(Date.now() + 15 * 60_000).toISOString()
}

function validState(marker = 'KNOWN_STUDY_MARKER') {
  return {
    config: {
      apiKey: 'SOURCE_API_KEY_MUST_NOT_TRANSFER',
      locale: 'en',
      studyMarker: marker,
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
}

function backupEntry(
  id = 'legacy-backup',
  state = validState('BACKUP_STUDY_MARKER')
) {
  return {
    id,
    createdAt: '2026-08-12T12:00:00.000Z',
    reason: 'automatic backup',
    sandbox: false,
    state
  }
}

async function deleteLegacyDatabase(page) {
  await page.evaluate(() => new Promise((resolve, reject) => {
    const request = indexedDB.deleteDatabase('edenia_state_backups_v1')
    request.addEventListener('success', () => resolve(), { once: true })
    request.addEventListener('error', () => reject(request.error), {
      once: true
    })
    request.addEventListener('blocked', () => reject(
      new Error('Legacy fixture database deletion was blocked')
    ), { once: true })
  }))
}

async function seedLegacyStorage(page, {
  indexedEntries = [],
  localBackupRaw = null,
  primaryRaw = null
} = {}) {
  await page.goto(
    `${HELPER_ORIGIN}/tests/fixtures/legacy-origin/seed/`
  )
  localBackupRaw === null
    ? await page.evaluate(() => localStorage.removeItem('edenia_v1_backups'))
    : await page.evaluate(raw => localStorage.setItem(
      'edenia_v1_backups',
      raw
    ), localBackupRaw)
  primaryRaw === null
    ? await page.evaluate(() => localStorage.removeItem('edenia_v1'))
    : await page.evaluate(raw => localStorage.setItem('edenia_v1', raw), primaryRaw)
  await deleteLegacyDatabase(page)
  if (indexedEntries.length) {
    await page.evaluate(entries => new Promise((resolve, reject) => {
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
        entries.forEach(entry => store.put(structuredClone(entry)))
        transaction.addEventListener('complete', () => {
          database.close()
          resolve()
        }, { once: true })
        transaction.addEventListener('error', () => reject(
          transaction.error
        ), { once: true })
      }, { once: true })
    }), indexedEntries)
  }
  return { localBackupRaw, primaryRaw }
}

async function routeHelper(page) {
  await page.route('**/_legacy_migration_site/config.local.js*', route => (
    route.fulfill({
      body: TEST_CONFIG,
      contentType: 'text/javascript',
      status: 200
    })
  ))
  await page.route(`${DESTINATION_ORIGIN}/**`, route => route.fulfill({
    body: '<!doctype html><title>Edenia destination fixture</title>',
    contentType: 'text/html',
    status: 200
  }))
}

async function readOldStorage(page) {
  await page.goto(
    `${HELPER_ORIGIN}/tests/fixtures/legacy-origin/seed/`
  )
  return page.evaluate(async () => {
    const { readIndexedDbBackupEntries } = await import(
      '/src/state/indexed-db-backups.js'
    )
    const { isValidStateBackupEntry } = await import('/src/state/backups.js')
    const { isValidStateShape } = await import(
      '/src/state/persistence-contract.js'
    )
    const indexed = await readIndexedDbBackupEntries({
      isValidEntry: entry => isValidStateBackupEntry(
        entry,
        isValidStateShape
      )
    })
    return {
      allValues: Object.values(localStorage),
      backupRaw: localStorage.getItem('edenia_v1_backups'),
      indexed,
      primaryRaw: localStorage.getItem('edenia_v1')
    }
  })
}

function capabilityFromUrl(urlValue) {
  const match = new URL(urlValue).hash.match(
    /^#edenia-legacy-progress=transfer\.([A-Za-z0-9_-]{43})$/
  )
  return match?.[1] || ''
}

test('valid primary is encrypted before relay upload and old bytes stay unchanged', async ({
  page
}, testInfo) => {
  test.skip(!STORAGE_PROJECT_NAMES.has(testInfo.project.name))
  const primaryRaw = JSON.stringify(validState())
  const localBackupRaw = JSON.stringify([
    backupEntry('older-backup', validState('OLDER_MARKER'))
  ])
  const indexedEntries = [backupEntry('indexed-backup')]
  const before = await seedLegacyStorage(page, {
    indexedEntries,
    localBackupRaw,
    primaryRaw
  })
  await routeHelper(page)
  const requests = []
  await page.route(RELAY_URL, async route => {
    requests.push({
      body: route.request().postDataJSON(),
      headers: await route.request().allHeaders(),
      rawBody: route.request().postData()
    })
    await route.fulfill({
      body: JSON.stringify({
        expires_at: futureExpiry(),
        status: 'created'
      }),
      contentType: 'application/json',
      status: 201
    })
  })

  await page.goto(`${HELPER_URL}?legacy_migration_test=1`)
  await expect(page).toHaveURL(
    new RegExp(`^${DESTINATION_ORIGIN}/#edenia-legacy-progress=transfer\.`)
  )
  expect(requests).toHaveLength(1)
  const capability = capabilityFromUrl(page.url())
  expect(capability).toMatch(/^[A-Za-z0-9_-]{43}$/)
  expect(requests[0].rawBody).not.toContain('KNOWN_STUDY_MARKER')
  expect(requests[0].rawBody).not.toContain('SOURCE_API_KEY')
  expect(Object.keys(requests[0].body).sort()).toEqual([
    'capability_digest',
    'ciphertext',
    'ciphertext_bytes',
    'ciphertext_digest',
    'iv'
  ])
  expect(requests[0].headers.apikey).toBe('sb_publishable_localtest')
  expect(requests[0].headers.authorization).toBeUndefined()
  expect(requests[0].headers.origin).toBe(HELPER_ORIGIN)
  expect(requests[0].body.capability_digest).toBe(
    await sha256Base64Url(decodeBase64Url(capability))
  )

  const envelope = await decryptProgressTransfer({
    capability,
    ciphertext: requests[0].body.ciphertext,
    ciphertextDigest: requests[0].body.ciphertext_digest,
    iv: requests[0].body.iv
  })
  expect(envelope.source).toEqual({ kind: 'primary' })
  expect(envelope.state.config.studyMarker).toBe('KNOWN_STUDY_MARKER')
  expect(envelope.state.config.apiKey).toBeUndefined()

  const after = await readOldStorage(page)
  expect(after.primaryRaw).toBe(before.primaryRaw)
  expect(after.backupRaw).toBe(before.localBackupRaw)
  expect(after.indexed.entries).toEqual(indexedEntries)
  expect(after.allValues.some(value => value.includes(capability))).toBe(false)
})

test('Cancel retains the disclosure window and returns deferred without a relay call', async ({
  page
}, testInfo) => {
  test.skip(!STORAGE_PROJECT_NAMES.has(testInfo.project.name))
  await seedLegacyStorage(page, {
    primaryRaw: JSON.stringify(validState())
  })
  await routeHelper(page)
  let relayCalls = 0
  await page.route(RELAY_URL, route => {
    relayCalls += 1
    return route.fulfill({
      body: JSON.stringify({ status: 'unavailable' }),
      contentType: 'application/json',
      status: 200
    })
  })

  await page.goto(`${HELPER_URL}?legacy_migration_test=1`)
  const cancel = page.getByRole('button', { name: 'Cancel' })
  await expect(cancel).toBeFocused()
  await cancel.press('Enter')
  await expect(page).toHaveURL(
    `${DESTINATION_ORIGIN}/#edenia-legacy-progress=deferred`
  )
  expect(relayCalls).toBe(0)
})

test('no legacy state returns a conclusive none outcome without contacting the relay', async ({
  page
}, testInfo) => {
  test.skip(!STORAGE_PROJECT_NAMES.has(testInfo.project.name))
  await seedLegacyStorage(page)
  await routeHelper(page)
  let relayCalls = 0
  await page.route(RELAY_URL, route => {
    relayCalls += 1
    return route.abort()
  })

  await page.goto(`${HELPER_URL}?legacy_migration_test=1`)
  await expect(page).toHaveURL(
    `${DESTINATION_ORIGIN}/#edenia-legacy-progress=none`
  )
  expect(relayCalls).toBe(0)
})

test('a corrupt primary uses the newest normal backup without changing either source', async ({
  page
}, testInfo) => {
  test.skip(!STORAGE_PROJECT_NAMES.has(testInfo.project.name))
  const fallback = backupEntry('fallback-backup')
  const localBackupRaw = JSON.stringify([fallback])
  await seedLegacyStorage(page, {
    localBackupRaw,
    primaryRaw: '{corrupt primary'
  })
  await routeHelper(page)
  let requestBody
  await page.route(RELAY_URL, async route => {
    requestBody = route.request().postDataJSON()
    await route.fulfill({
      body: JSON.stringify({
        expires_at: futureExpiry(),
        status: 'created'
      }),
      contentType: 'application/json',
      status: 201
    })
  })

  await page.goto(`${HELPER_URL}?legacy_migration_test=1`)
  await expect(page).toHaveURL(
    new RegExp(`^${DESTINATION_ORIGIN}/#edenia-legacy-progress=transfer\.`)
  )
  const envelope = await decryptProgressTransfer({
    capability: capabilityFromUrl(page.url()),
    ciphertext: requestBody.ciphertext,
    ciphertextDigest: requestBody.ciphertext_digest,
    iv: requestBody.iv
  })
  expect(envelope.source).toEqual({
    backupId: 'fallback-backup',
    createdAt: '2026-08-12T12:00:00.000Z',
    kind: 'backup',
    recoveredFromCorruptPrimary: true
  })
  const after = await readOldStorage(page)
  expect(after.primaryRaw).toBe('{corrupt primary')
  expect(after.backupRaw).toBe(localBackupRaw)
})

test('fully corrupt sources produce a bounded recovery download and defer path', async ({
  page
}, testInfo) => {
  test.skip(!STORAGE_PROJECT_NAMES.has(testInfo.project.name))
  await seedLegacyStorage(page, {
    localBackupRaw: '{corrupt backups',
    primaryRaw: '{corrupt primary'
  })
  await routeHelper(page)
  let relayCalls = 0
  await page.route(RELAY_URL, route => {
    relayCalls += 1
    return route.abort()
  })

  await page.goto(`${HELPER_URL}?legacy_migration_test=1`)
  await expect(page.getByRole('heading', {
    name: 'Your old progress was not changed'
  })).toBeVisible()
  await expect(page.getByRole('status')).toContainText(
    'No progress was removed or changed.'
  )
  const downloadPromise = page.waitForEvent('download')
  await page.getByRole('button', {
    name: 'Download local recovery evidence'
  }).click()
  const download = await downloadPromise
  const downloadPath = await download.path()
  const evidence = JSON.parse(await readFile(downloadPath, 'utf8'))
  expect(Object.keys(evidence).sort()).toEqual([
    'capturedAt',
    'items',
    'schema'
  ])
  expect(evidence.items).toEqual([
    {
      issue: 'corrupt',
      raw: '{corrupt primary',
      source: 'normal_primary',
      storageKey: 'edenia_v1'
    },
    {
      issue: 'corrupt',
      raw: '{corrupt backups',
      source: 'normal_local_backups',
      storageKey: 'edenia_v1_backups'
    }
  ])
  expect(JSON.stringify(evidence)).not.toMatch(
    /posthog|supabase|cookie|sandbox|internal_test/i
  )
  expect(relayCalls).toBe(0)

  await page.getByRole('button', {
    name: 'Return without completing the check'
  }).click()
  await expect(page).toHaveURL(
    `${DESTINATION_ORIGIN}/#edenia-legacy-progress=deferred`
  )
})

test('an envelope-overhead overflow stays local and offers recovery evidence', async ({
  page
}, testInfo) => {
  test.skip(!STORAGE_PROJECT_NAMES.has(testInfo.project.name))
  const oversized = validState('ENVELOPE_LIMIT_MARKER')
  oversized.config.padding = ''
  const portable = sanitizePortableProgressState(oversized)
  const baseBytes = new TextEncoder().encode(JSON.stringify(portable)).byteLength
  oversized.config.padding = 'x'.repeat(
    LEGACY_PROGRESS_TRANSFER_MAX_BYTES - baseBytes
  )
  const primaryRaw = JSON.stringify(oversized)
  await seedLegacyStorage(page, { primaryRaw })
  await routeHelper(page)
  let relayCalls = 0
  await page.route(RELAY_URL, route => {
    relayCalls += 1
    return route.abort()
  })

  await page.goto(`${HELPER_URL}?legacy_migration_test=1`)
  await expect(page.getByRole('heading', {
    name: 'Your old progress was not changed'
  })).toBeVisible()
  await expect(page.getByRole('button', {
    name: 'Download local recovery evidence'
  })).toBeVisible()
  expect(relayCalls).toBe(0)
  const after = await readOldStorage(page)
  expect(after.primaryRaw).toBe(primaryRaw)
})

test('a retryable relay failure keeps progress local and a later retry succeeds', async ({
  page
}, testInfo) => {
  test.skip(!STORAGE_PROJECT_NAMES.has(testInfo.project.name))
  const primaryRaw = JSON.stringify(validState('RETRY_MARKER'))
  await seedLegacyStorage(page, { primaryRaw })
  await routeHelper(page)
  const requests = []
  await page.route(RELAY_URL, async route => {
    requests.push(route.request().postDataJSON())
    const success = requests.length === 2
    await route.fulfill({
      body: JSON.stringify(success
        ? {
            expires_at: futureExpiry(),
            status: 'created'
          }
        : { status: 'unavailable' }),
      contentType: 'application/json',
      status: success ? 201 : 200
    })
  })

  await page.goto(`${HELPER_URL}?legacy_migration_test=1`)
  const retry = page.getByRole('button', { name: 'Try again' })
  await expect(retry).toBeFocused()
  expect(requests).toHaveLength(1)
  await retry.click()
  await expect(page).toHaveURL(
    new RegExp(`^${DESTINATION_ORIGIN}/#edenia-legacy-progress=transfer\.`)
  )
  expect(requests).toHaveLength(2)
  expect(requests[0].capability_digest).not.toBe(
    requests[1].capability_digest
  )
  const after = await readOldStorage(page)
  expect(after.primaryRaw).toBe(primaryRaw)
})

test('a framed helper refuses to read or upload legacy progress', async ({
  page
}, testInfo) => {
  test.skip(!STORAGE_PROJECT_NAMES.has(testInfo.project.name))
  const primaryRaw = JSON.stringify(validState('FRAMED_MARKER'))
  await seedLegacyStorage(page, { primaryRaw })
  await routeHelper(page)
  let relayCalls = 0
  await page.route(RELAY_URL, route => {
    relayCalls += 1
    return route.fulfill({
      body: JSON.stringify({ status: 'unavailable' }),
      contentType: 'application/json',
      status: 200
    })
  })
  await page.route(`${DESTINATION_ORIGIN}/frame-probe`, route => route.fulfill({
    body: `<!doctype html><iframe title="Migration helper" src="${
      HELPER_URL
    }?legacy_migration_test=1"></iframe>`,
    contentType: 'text/html',
    status: 200
  }))

  await page.goto(`${DESTINATION_ORIGIN}/frame-probe`)
  await expect.poll(() => page.frames().length).toBe(2)
  const helperFrame = page.frames().find(frame => frame !== page.mainFrame())
  if (helperFrame.url().startsWith(HELPER_URL)) {
    await expect(helperFrame.getByRole('heading', {
      name: 'The progress check is unavailable'
    })).toBeVisible()
  } else {
    expect(helperFrame.url()).toMatch(/^chrome-error:/)
  }
  await page.waitForTimeout(1_700)
  expect(relayCalls).toBe(0)
  const after = await readOldStorage(page)
  expect(after.primaryRaw).toBe(primaryRaw)
})
