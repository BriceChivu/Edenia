import { readFile } from 'node:fs/promises'
import { devices } from '@playwright/test'
import { expect, test } from '../support/network-fixture.mjs'
import { canonicalizeJson, sha256Base64UrlSync } from '../../src/state/portable-state.js'
import { createPortableLearnerProfileEnvelope } from '../../src/state/portable-learner-profile.js'

const fixture = JSON.parse(await readFile(new URL('../fixtures/learner-profile/profile-ready-trial-smoke.json', import.meta.url)))
const owner = fixture.session.user.id
const profileId = '223e4567-e89b-42d3-a456-426614174001'
const key = 'edenia_v1_auth_trial_v1'
const origin = 'https://handoff-fixture.supabase.co'
const deferred = () => { let resolve; const promise = new Promise(next => { resolve = next }); return { promise, resolve } }

async function createCloud() {
  const state = structuredClone(fixture.resolution.envelope.profile)
  state.config.ankiEnabled = false
  state.onboarding.walkthroughCompleted = true
  state.onboarding.walkthroughCompletedAt = state.onboarding.setupCompletedAt
  state.videos = Object.fromEntries(['phone', 'computer'].map(id => [id, {
    id, title: `${id} lesson`, duration: 300, manuallyAdded: true, status: 'partial',
    resumeAtSeconds: 10, watchProgress: [], watchProgressTracked: true, favorite: false
  }]))
  let envelope = (await createPortableLearnerProfileEnvelope(state)).envelope
  let revision = 1
  let time = 0
  let lastWrite = -30_000
  let lastFlush = -300_000
  const receipts = new Map()
  const commits = []
  const requests = []
  const controls = { phoneHead: null, phoneAck: null, phoneSend: null, allowStale: false }
  const identity = () => ({ user_id: owner, profile_id: profileId, generation: 1, revision })
  return {
    controls, commits, requests, receipts,
    advance: ms => { time += ms },
    head: () => ({ envelope: structuredClone(envelope), ...identity() }),
    async route(route, device) {
      const request = route.request(), path = new URL(request.url()).pathname
      requests.push({ path, device })
      if (path === '/auth/v1/token') return route.fulfill({ json: fixture.session })
      if (path === '/auth/v1/user') return route.fulfill({ json: fixture.session.user })
      if (path === '/rest/v1/learner_profile_heads') {
        if (device === 'phone' && controls.phoneHead) await controls.phoneHead.promise
        return route.fulfill({ json: identity() })
      }
      if (path === '/rest/v1/rpc/resolve_my_learner_profile') return route.fulfill({ json: [{ status: 'profile_ready', created: false, ...identity(), envelope }] })
      if (path === '/rest/v1/rpc/read_my_latest_learner_profile_reset') return route.fulfill({ json: [{ status: 'none' }] })
      if (path.startsWith('/rest/v1/') && !path.includes('learner_profile')) return route.fulfill({ json: [] })
      const args = request.postDataJSON()
      if (path === '/rest/v1/rpc/read_my_learner_profile_write_receipt') {
        const receipt = receipts.get(args.p_operation_id)
        return route.fulfill({ json: [receipt ? { ...receipt, status: 'already_accepted' } : { status: 'not_accepted', last_replacement_revision: 0 }] })
      }
      if (path === '/rest/v1/rpc/commit_my_learner_profile_handoff') {
        commits.push({ device, args })
        if (device === 'phone' && controls.phoneSend) await controls.phoneSend.promise
        const receipt = receipts.get(args.p_operation_id)
        if (receipt) return route.fulfill({ json: [{ ...receipt, status: 'already_accepted' }] })
        if (controls.allowStale && args.p_base_revision !== revision) return route.fulfill({ json: [{ status: 'head_changed', ...identity(), base_revision: args.p_base_revision }] })
        expect(args.p_base_revision, 'a stale full snapshot must never be sent during a sequential handoff').toBe(revision)
        const early = args.p_session_boundary === true && time - lastFlush >= 300_000
        if (!early && time - lastWrite < 30_000) return route.fulfill({ json: [{ status: 'deferred', ...identity(),
          base_revision: args.p_base_revision, retry_after_ms: 30_000 - (time - lastWrite) }] })
        envelope = args.p_envelope
        revision++
        lastWrite = time
        if (early) lastFlush = time
        const accepted = { status: 'accepted', ...identity(), base_revision: args.p_base_revision,
          payload_sha256: envelope.integrity.payloadSha256,
          request_sha256: sha256Base64UrlSync(canonicalizeJson({ baseRevision: args.p_base_revision,
            envelope, generation: 1, operationId: args.p_operation_id, ownerId: owner, profileId })) }
        receipts.set(args.p_operation_id, accepted)
        if (device === 'phone' && controls.phoneAck) await controls.phoneAck.promise
        return route.fulfill({ json: [accepted] })
      }
      throw new Error(`Unexpected handoff RPC ${path}`)
    }
  }
}

async function createDevice(browser, cloud, device, browserName, baseURL) {
  const context = await browser.newContext(device === 'phone'
    ? { ...devices[browserName === 'webkit' ? 'iPhone 13' : 'Pixel 7'] }
    : { viewport: { width: 1440, height: 900 }, timezoneId: 'Asia/Taipei' })
  const page = await context.newPage()
  const errors = []
  page.on('pageerror', error => errors.push(error.message))
  await context.route('**/*', async route => {
    const url = new URL(route.request().url())
    if (['localhost', '127.0.0.1'].includes(url.hostname)) return route.continue()
    if (url.origin === origin) return cloud.route(route, device)
    throw new Error(`Unstubbed external handoff request: ${url.origin}${url.pathname}`)
  })
  await page.route('**/config.local.js*', route => route.fulfill({ contentType: 'text/javascript', body: `window.EDENIA_CONFIG=${JSON.stringify({
    authTrialEnabled: true, accountFeaturesRollout: 'off', learnerProfileLifecycleEnabled: false,
    indexedDbProfileEnabled: true, indexedDbBackupsEnabled: false, tinySwordsEnabled: false,
    googleSignInMode: 'off', supabaseUrl: origin, supabasePublishableKey: 'fixture-key', youtubeApiKey: ''
  })}` }))
  const head = cloud.head()
  await page.addInitScript(({ key, head, session, owner, profileId }) => {
    if (localStorage.getItem(key + '_plus_auth_v1')) return
    localStorage.setItem(key, JSON.stringify(head.envelope.profile))
    localStorage.setItem(key + '_plus_auth_v1', JSON.stringify(session))
    localStorage.setItem(key + '_learner_profile_access_v1', JSON.stringify({ version: 1,
      ownerId: owner, profileId, generation: 1, revision: head.revision, activatedAt: Date.now(),
      activationId: null, onboardingFinalizationPending: false }))
    localStorage.setItem(key + '_learner_profile_sync_v1', JSON.stringify({ version: 1,
      ownerId: owner, profileId, generation: 1, acceptedRevision: head.revision, pending: null, queued: null }))
  }, { key, head, session: fixture.session, owner, profileId })
  await page.clock.install({ time: new Date('2026-10-12T12:00:00.000Z') })
  await page.goto(new URL('?internal_test=1', baseURL).href)
  await expect(page.locator('#mainApp')).toBeVisible()
  await expect(page.locator('#learnerProfileSyncStatus')).toHaveText('Up to date')
  return { context, page, errors,
    async capture(seconds, videoId = device) {
      return page.evaluate(({ device, seconds, videoId }) => {
        const state = loadState(), video = state.videos[videoId]
        video.watchProgress = [{ watchedAt: device === 'phone' ? '2026-10-12T12:01:00.000Z' : '2026-10-12T12:02:00.000Z', studyDay: '2026-10-12', seconds, experienceSeconds: seconds }]
        video.watchProgressTracked = true
        video.resumeAtSeconds = seconds
        video.pausedAt = device === 'phone' ? '2026-10-12T12:01:00.000Z' : '2026-10-12T12:02:00.000Z'
        return saveState(state)
      }, { device, seconds, videoId })
    },
    async visibility(hidden) {
      return page.evaluate(hidden => {
        Object.defineProperty(document, 'hidden', { configurable: true, get: () => hidden })
        Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => hidden ? 'hidden' : 'visible' })
        document.dispatchEvent(new Event('visibilitychange'))
      }, hidden)
    }
  }
}

for (const stage of ['local-save', 'before-send', 'after-head-check', 'after-acceptance']) {
  test(`phone lock during ${stage} then computer study preserves both devices without a conflict`, async ({ browser, browserName, baseURL }, testInfo) => {
    test.skip(!['desktop-standard', 'webkit-trial-phone'].includes(testInfo.project.name))
    test.setTimeout(90_000)
    const cloud = await createCloud()
    const phone = await createDevice(browser, cloud, 'phone', browserName, baseURL)
    let computer
    let cdp
    const headGate = deferred(), ackGate = deferred(), sendGate = deferred()
    try {
      if (stage === 'local-save') {
        await phone.page.evaluate(() => {
          const original = primaryProfileRepository.save.bind(primaryProfileRepository)
          primaryProfileRepository.save = async (...args) => {
            await new Promise(resolve => { window.handoffReleaseLocalSave = resolve })
            primaryProfileRepository.save = original
            return original(...args)
          }
        })
        await phone.page.evaluate(() => {
          const state = loadState()
          state.videos.phone.watchProgress = [{ watchedAt: '2026-10-12T12:01:00.000Z', studyDay: '2026-10-12', seconds: 40, experienceSeconds: 40 }]
          window.handoffSave = saveState(state)
        })
        await expect.poll(() => phone.page.evaluate(() => typeof window.handoffReleaseLocalSave)).toBe('function')
      } else {
        if (stage === 'before-send') cloud.controls.phoneHead = headGate
        if (stage === 'after-head-check') { cloud.controls.phoneSend = sendGate; cloud.controls.allowStale = true }
        if (stage === 'after-acceptance') cloud.controls.phoneAck = ackGate
        expect(await phone.capture(40)).toBe(true)
        if (stage === 'after-head-check') await expect.poll(() => cloud.commits.length).toBe(1)
        if (stage === 'after-acceptance') await expect.poll(() => cloud.head().envelope.profile.videos.phone.watchProgress[0]?.seconds).toBe(40)
      }
      await phone.visibility(true)
      if (browserName === 'chromium') {
        cdp = await phone.context.newCDPSession(phone.page)
        await cdp.send('Page.setWebLifecycleState', { state: 'frozen' })
      }
      cloud.advance(31_000)
      computer = await createDevice(browser, cloud, 'computer', browserName, baseURL)
      expect(await computer.capture(60)).toBe(true)
      await expect.poll(() => cloud.head().envelope.profile.videos.computer.watchProgress[0]?.seconds).toBe(60)
      cloud.advance(31_000)
      cloud.controls.phoneHead = null
      cloud.controls.phoneAck = null
      cloud.controls.phoneSend = null
      headGate.resolve(); ackGate.resolve(); sendGate.resolve()
      if (cdp) await cdp.send('Page.setWebLifecycleState', { state: 'active' })
      await phone.visibility(false)
      if (stage === 'local-save') await phone.page.evaluate(() => window.handoffReleaseLocalSave())
      await phone.page.clock.runFor(31_000)
      await expect(phone.page.locator('#mainApp')).toBeVisible()
      await expect(phone.page.locator('#learnerProfileSyncStatus')).toHaveText('Up to date')
      await expect.poll(() => cloud.head().envelope.profile.videos.phone.watchProgress[0]?.seconds).toBe(40)
      expect(cloud.head().envelope.profile.videos.computer.watchProgress[0].seconds).toBe(60)
      expect(await phone.page.evaluate(() => ({ phone: loadState().videos.phone.watchProgress[0].seconds,
        computer: loadState().videos.computer.watchProgress[0].seconds }))).toEqual({ phone: 40, computer: 60 })
      expect(cloud.requests.some(({ path }) => path.includes('conflict'))).toBe(false)
      expect(phone.errors).toEqual([])
      expect(computer.errors).toEqual([])
    } finally {
      headGate.resolve(); ackGate.resolve(); sendGate.resolve()
      if (cdp) await cdp.send('Page.setWebLifecycleState', { state: 'active' }).catch(() => {})
      await computer?.context.close()
      await phone.context.close()
    }
  })
}

test('rapid visibility changes retain a deferred server budget and coalesce the latest study', async ({ browser, browserName, baseURL }, testInfo) => {
  test.skip(!['desktop-standard', 'webkit-trial-phone'].includes(testInfo.project.name))
  test.setTimeout(90_000)
  const cloud = await createCloud()
  const phone = await createDevice(browser, cloud, 'phone', browserName, baseURL)
  try {
    expect(await phone.capture(10)).toBe(true)
    await expect(phone.page.locator('#learnerProfileSyncStatus')).toHaveText('Up to date')
    expect(await phone.capture(20)).toBe(true)
    await phone.visibility(true)
    await expect.poll(() => cloud.head().envelope.profile.videos.phone.watchProgress[0]?.seconds).toBe(20)
    await phone.visibility(false)
    expect(await phone.capture(30)).toBe(true)
    await phone.visibility(true)
    await expect.poll(() => cloud.commits.length).toBe(3)
    for (let seconds = 31; seconds <= 50; seconds++) {
      await phone.visibility(false)
      expect(await phone.capture(seconds)).toBe(true)
      await phone.visibility(true)
      await phone.page.waitForTimeout(20)
    }
    expect(cloud.commits).toHaveLength(3)
    expect(cloud.receipts.size).toBe(2)
    await phone.page.reload()
    await expect(phone.page.locator('#mainApp')).toBeVisible()
    await phone.visibility(true)
    await phone.page.waitForTimeout(100)
    expect(cloud.commits).toHaveLength(3)
    await phone.visibility(false)
    for (let i = 0; i < 2; i++) {
      cloud.advance(31_000)
      await phone.page.clock.runFor(31_000)
      await phone.page.waitForTimeout(100)
    }
    await expect.poll(() => cloud.head().envelope.profile.videos.phone.watchProgress[0]?.seconds).toBe(50)
    await expect(phone.page.locator('#learnerProfileSyncStatus')).toHaveText('Up to date')
    expect(cloud.commits.length).toBeLessThanOrEqual(5)
    expect(cloud.requests.some(({ path }) => path.includes('conflict'))).toBe(false)
    expect(phone.errors).toEqual([])
  } finally { await phone.context.close() }
})

test('same-video phone-computer-phone handoff retains study from both sessions and the newer resume position', async ({ browser, browserName, baseURL }, testInfo) => {
  test.skip(!['desktop-standard', 'webkit-trial-phone'].includes(testInfo.project.name))
  const cloud = await createCloud(), headGate = deferred()
  const phone = await createDevice(browser, cloud, 'phone', browserName, baseURL)
  let computer
  try {
    cloud.controls.phoneHead = headGate
    expect(await phone.capture(40)).toBe(true)
    await phone.visibility(true)
    computer = await createDevice(browser, cloud, 'computer', browserName, baseURL)
    expect(await computer.capture(60, 'phone')).toBe(true)
    await expect.poll(() => cloud.head().envelope.profile.videos.phone.resumeAtSeconds).toBe(60)
    cloud.advance(31_000)
    cloud.controls.phoneHead = null
    headGate.resolve()
    await phone.visibility(false)
    await phone.page.clock.runFor(31_000)
    await expect(phone.page.locator('#learnerProfileSyncStatus')).toHaveText('Up to date')
    await expect.poll(() => cloud.head().envelope.profile.videos.phone.watchProgress.length).toBe(2)
    expect(cloud.head().envelope.profile.videos.phone.resumeAtSeconds).toBe(60)
    expect(await phone.page.evaluate(() => loadState().videos.phone.resumeAtSeconds)).toBe(60)
    expect(cloud.requests.some(({ path }) => path.includes('conflict'))).toBe(false)
    expect(phone.errors).toEqual([])
    expect(computer.errors).toEqual([])
  } finally { headGate.resolve(); await computer?.context.close(); await phone.context.close() }
})
