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

async function createCloud(island = null, videoCount = 0) {
  const state = structuredClone(fixture.resolution.envelope.profile)
  state.config.ankiEnabled = false
  state.onboarding.walkthroughCompleted = true
  state.onboarding.walkthroughCompletedAt = state.onboarding.setupCompletedAt
  if (island) state.tinySwordsIsland = island
  state.videos = Object.fromEntries(['phone', 'computer'].map(id => [id, {
    id, title: `${id} lesson`, duration: 300, manuallyAdded: true, status: 'partial',
    resumeAtSeconds: 10, watchProgress: [], watchProgressTracked: true, favorite: false
  }]))
  for (let index = 0; index < videoCount; index++) state.videos[`retained-${index}`] = {
    id: `retained-${index}`, title: 'Retained display metadata '.repeat(10), duration: 600,
    favorite: true, watchProgressTracked: true, watchProgress: []
  }
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
      if (path === '/rest/v1/rpc/open_my_learner_profile') {
        const args = request.postDataJSON()
        const digest = sha256Base64UrlSync(canonicalizeJson(envelope.profile))
        const unchanged = args.p_cached_profile_id === profileId && args.p_cached_generation === 1
          && args.p_cached_revision === revision && args.p_cached_profile_sha256 === digest
        return route.fulfill({ json: [{ status: unchanged ? 'profile_unchanged' : 'profile_ready',
          created: false, ...identity(), envelope: unchanged ? null : envelope,
          profile_sha256: unchanged ? digest : null, reset_state: { status: 'none' } }] })
      }
      if (path === '/rest/v1/rpc/read_my_latest_learner_profile_reset') return route.fulfill({ json: [{ status: 'none' }] })
      if (path.startsWith('/rest/v1/') && !path.includes('learner_profile')) return route.fulfill({ json: [] })
      const args = request.postDataJSON()
      if (['/rest/v1/rpc/read_my_learner_profile_write_receipt', '/rest/v1/rpc/read_my_learner_profile_record_receipt'].includes(path)) {
        const receipt = receipts.get(args.p_operation_id)
        return route.fulfill({ json: [receipt ? { ...receipt, status: 'already_accepted' } : { status: 'not_accepted', last_replacement_revision: 0 }] })
      }
      if (['/rest/v1/rpc/commit_my_learner_profile_handoff', '/rest/v1/rpc/commit_my_learner_profile_records'].includes(path)) {
        commits.push({ device, args })
        if (device === 'phone' && controls.phoneSend) await controls.phoneSend.promise
        const receipt = receipts.get(args.p_operation_id)
        if (receipt) return route.fulfill({ json: [{ ...receipt, status: 'already_accepted' }] })
        const typed = Boolean(args.p_batch)
        const requestDigest = () => sha256Base64UrlSync(canonicalizeJson({ baseRevision: args.p_base_revision,
          ...(typed ? { batch: args.p_batch } : { envelope: args.p_envelope }),
          generation: args.p_generation, operationId: args.p_operation_id, ownerId: owner, profileId }))
        if ((controls.allowStale || typed) && args.p_base_revision !== revision) return route.fulfill({ json: [{ status: 'head_changed', ...identity(), base_revision: args.p_base_revision,
          ...(typed ? { request_sha256: requestDigest() } : {}) }] })
        expect(args.p_base_revision, 'a stale full snapshot must never be sent during a sequential handoff').toBe(revision)
        const early = args.p_session_boundary === true && time - lastFlush >= 300_000
        const interval = typed ? 5_000 : 30_000
        if (!early && time - lastWrite < interval) return route.fulfill({ json: [{ status: 'deferred', ...identity(),
          base_revision: args.p_base_revision, retry_after_ms: interval - (time - lastWrite) }] })
        if (typed) {
          const next = structuredClone(envelope.profile)
          for (const unit of args.p_batch.units) {
            const parent = unit.kind === 'video' ? next.videos : unit.kind === 'anki' ? next.anki : next
            if (!unit.afterPresent) delete parent[unit.key]
            else parent[unit.key] = unit.kind === 'video'
              ? { ...parent[unit.key], ...unit.metadata, ...unit.after } : unit.after
          }
          envelope = (await createPortableLearnerProfileEnvelope(next, { now: () => new Date(args.p_batch.exportedAt) })).envelope
        } else envelope = args.p_envelope
        revision++
        lastWrite = time
        if (early) lastFlush = time
        const accepted = { status: 'accepted', ...identity(), base_revision: args.p_base_revision,
          payload_sha256: envelope.integrity.payloadSha256,
          request_sha256: requestDigest() }
        receipts.set(args.p_operation_id, accepted)
        if (device === 'phone' && controls.phoneAck) await controls.phoneAck.promise
        return route.fulfill({ json: [accepted] })
      }
      throw new Error(`Unexpected handoff RPC ${path}`)
    }
  }
}

async function createDevice(browser, cloud, device, browserName, baseURL, { realGame = false, recordSync = false } = {}) {
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
  const runtime = {
    authTrialEnabled: true, accountFeaturesRollout: 'off', learnerProfileLifecycleEnabled: false,
    indexedDbProfileEnabled: true, indexedDbBackupsEnabled: false, tinySwordsEnabled: realGame, learnerProfileRecordSyncEnabled: recordSync,
    googleSignInMode: 'off', supabaseUrl: origin, supabasePublishableKey: 'fixture-key', youtubeApiKey: ''
  }
  await page.route('**/config.local.js*', route => route.fulfill({ contentType: 'text/javascript', body: `window.EDENIA_CONFIG=${JSON.stringify(runtime)}` }))
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
  if (!realGame) await page.clock.install({ time: new Date('2026-10-12T12:00:00.000Z') })
  await page.goto(new URL('?internal_test=1', baseURL).href)
  await expect(page.locator('#mainApp')).toBeVisible()
  await expect(page.locator('#learnerProfileSyncStatus')).toHaveText('Up to date')
  return { context, page, errors, runtime,
    async capture(seconds, videoId = device) {
      return page.evaluate(({ device, seconds, videoId }) => {
        const state = loadState(), video = state.videos[videoId]
        video.watchProgress = [{ watchedAt: device === 'phone' ? '2026-10-12T12:01:00.000Z' : '2026-10-12T12:02:00.000Z', studyDay: '2026-10-12', seconds, experienceSeconds: seconds }]
        video.watchProgressTracked = true
        video.resumeAtSeconds = seconds
        video.pausedAt = device === 'phone' ? '2026-10-12T12:01:00.000Z' : '2026-10-12T12:02:00.000Z'
        return window.EDENIA_CONFIG.learnerProfileRecordSyncEnabled
          ? saveRecordCheckpoint(state, { videos: [videoId] }, { syncAnalytics: false }) : saveState(state)
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

for (const stage of ['local-save', 'before-send', 'after-head-check', 'after-acceptance', 'local-save-after-acceptance']) {
  test(`phone lock during ${stage} then computer study preserves both devices without a conflict`, async ({ browser, browserName, baseURL }, testInfo) => {
    test.skip(!['desktop-standard', 'webkit-trial-phone'].includes(testInfo.project.name))
    test.setTimeout(Math.max(testInfo.timeout, 90_000))
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
        if (['after-acceptance', 'local-save-after-acceptance'].includes(stage)) cloud.controls.phoneAck = ackGate
        expect(await phone.capture(40)).toBe(true)
        if (stage === 'after-head-check') await expect.poll(() => cloud.commits.length).toBe(1)
        if (['after-acceptance', 'local-save-after-acceptance'].includes(stage)) await expect.poll(() => cloud.head().envelope.profile.videos.phone.watchProgress[0]?.seconds).toBe(40)
        if (stage === 'local-save-after-acceptance') {
          await phone.page.evaluate(() => {
            const original = primaryProfileRepository.save.bind(primaryProfileRepository)
            primaryProfileRepository.save = async (...args) => {
              await new Promise(resolve => { window.handoffReleaseLocalSave = resolve })
              primaryProfileRepository.save = original
              return original(...args)
            }
            const state = loadState()
            state.videos.phone.watchProgress[0].seconds = 80
            state.videos.phone.watchProgress[0].experienceSeconds = 80
            window.handoffSave = saveState(state)
          })
          await expect.poll(() => phone.page.evaluate(() => typeof window.handoffReleaseLocalSave)).toBe('function')
        }
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
      if (stage === 'local-save-after-acceptance') {
        await expect.poll(() => phone.page.evaluate(() => JSON.parse(localStorage.getItem('edenia_v1_auth_trial_v1_learner_profile_sync_v1'))?.pending)).toBeNull()
        expect(await phone.page.evaluate(() => localStorage.getItem('edenia_v1_auth_trial_v1_learner_profile_sync_v1_dirty'))).not.toBeNull()
        await expect(phone.page.locator('#learnerProfileSyncStatus')).not.toHaveText('Up to date')
      }
      if (['local-save', 'local-save-after-acceptance'].includes(stage)) await phone.page.evaluate(() => window.handoffReleaseLocalSave())
      const expectedPhoneSeconds = stage === 'local-save-after-acceptance' ? 80 : 40
      await phone.page.clock.runFor(31_000)
      await expect(phone.page.locator('#mainApp')).toBeVisible()
      await expect(phone.page.locator('#learnerProfileSyncStatus')).toHaveText('Up to date')
      await expect.poll(() => cloud.head().envelope.profile.videos.phone.watchProgress[0]?.seconds).toBe(expectedPhoneSeconds)
      expect(cloud.head().envelope.profile.videos.computer.watchProgress[0].seconds).toBe(60)
      expect(await phone.page.evaluate(() => ({ phone: loadState().videos.phone.watchProgress[0].seconds,
        computer: loadState().videos.computer.watchProgress[0].seconds }))).toEqual({ phone: expectedPhoneSeconds, computer: 60 })
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
  test.setTimeout(Math.max(testInfo.timeout, 90_000))
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

test('active Tiny Swords batches durable study saves until gameplay stops', async ({ browser, browserName, baseURL }, testInfo) => {
  test.skip(!['desktop-standard', 'webkit-trial-phone'].includes(testInfo.project.name))
  const cloud = await createCloud()
  const phone = await createDevice(browser, cloud, 'phone', browserName, baseURL)
  try {
    // The authentic current-frame bridge is separately covered by its contract;
    // this drives its host activity event through the real signed-in save path.
    await phone.page.evaluate(() => window.dispatchEvent(new CustomEvent('edenia-tiny-swords-activity', {
      detail: { visible: true, active: true }
    })))
    await phone.capture(20)
    await phone.capture(30)
    expect(cloud.head().revision).toBe(1)
    const pending = await phone.page.evaluate(key => ({
      outbox: JSON.parse(localStorage.getItem(key + '_learner_profile_sync_v1')),
      dirty: localStorage.getItem(key + '_learner_profile_sync_v1_dirty'),
      durable: loadPersistedState({ persistCleanup: false }).videos.phone.resumeAtSeconds
    }), key)
    expect(pending.durable).toBe(30)
    expect(pending.outbox.pending).toBe(null)
    expect(pending.dirty).toBeTruthy()
    cloud.advance(60_000)
    await phone.page.clock.fastForward(60_000)
    expect(cloud.commits).toHaveLength(0)
    expect(await phone.page.evaluate(key => JSON.parse(localStorage.getItem(key + '_learner_profile_sync_v1')).pending, key)).toBe(null)
    await phone.page.evaluate(() => window.dispatchEvent(new CustomEvent('edenia-tiny-swords-activity', {
      detail: { visible: true, active: false }
    })))
    await phone.page.clock.fastForward(5_000)
    await expect.poll(() => cloud.head().revision).toBe(2)
    expect(cloud.head().envelope.profile.videos.phone.resumeAtSeconds).toBe(30)
    await expect.poll(() => phone.page.evaluate(key => localStorage.getItem(key + '_learner_profile_sync_v1_dirty'), key)).toBe(null)
    expect(phone.errors).toEqual([])
  } finally { await phone.context.close() }
})

for (const recordSync of [false, true]) test(`real Godot input defers ${recordSync ? 'record' : 'full'} study delivery and quiet time resumes the durable checkpoint`, async ({ browser, browserName, baseURL }, testInfo) => {
  test.skip(process.env.EDENIA_TEST_TINY_SWORDS !== 'true' || testInfo.project.name !== 'desktop-standard', 'Uses the integrated Godot build once')
  test.setTimeout(120_000)
  const island = JSON.parse(await readFile(new URL('../fixtures/tiny-swords-populated-island.json', import.meta.url)))
  const cloud = await createCloud(island, 500)
  const computer = await createDevice(browser, cloud, 'computer', browserName, baseURL, { realGame: true, recordSync })
  let phone
  try {
    await expect(computer.page.locator('#tinySwordsSurface')).toHaveAttribute('data-game-state', 'ready', { timeout: 60_000 })
    const game = computer.page.frames().find(frame => frame.url().includes('/tiny-swords-game/'))
    const canvas = game.locator('#canvas')
    await expect.poll(() => cloud.head().envelope.profile.tinySwordsIsland.version, { timeout: 40_000 }).toBe(38)
    await expect(computer.page.locator('#learnerProfileSyncStatus')).toHaveText('Up to date')
    const box = await canvas.boundingBox()
    await computer.page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
    await computer.page.mouse.down()
    await expect.poll(() => computer.page.evaluate(() => learnerProfileSyncOpportunity.isQuiet())).toBe(false)
    const before = cloud.commits.length
    await computer.page.evaluate(() => {
      window.recordSyncFrameIntervals = []
      window.recordSyncLongTasks = []
      window.recordSyncLongTaskObserver = new PerformanceObserver(entries => {
        window.recordSyncLongTasks.push(...entries.getEntries().map(entry => ({ start: entry.startTime, duration: entry.duration,
          attribution: entry.attribution?.map(item => ({ type: item.containerType, src: item.containerSrc, name: item.name })) })))
      })
      window.recordSyncLongTaskObserver.observe({ type: 'longtask' })
      let previous = performance.now()
      const sample = now => {
        window.recordSyncFrameIntervals?.push(now - previous)
        previous = now
        if (window.recordSyncFrameIntervals) requestAnimationFrame(sample)
      }
      requestAnimationFrame(sample)
    })
    expect(await computer.capture(42)).toBe(true)
    const durable = await computer.page.evaluate(() => loadPersistedState({ persistCleanup: false }).videos.computer)
    expect(durable.resumeAtSeconds).toBe(42)
    cloud.advance(60_000)
    await computer.page.waitForTimeout(5_500) // Actual held input and Godot frames; host-only paths use fake clocks above.
    expect(cloud.commits).toHaveLength(before)
    const timing = await computer.page.evaluate(() => {
      const values = window.recordSyncFrameIntervals
      window.recordSyncFrameIntervals = null
      window.recordSyncLongTaskObserver.disconnect()
      return { frames: values.sort((a, b) => a - b), longTasks: window.recordSyncLongTasks }
    })
    const frames = timing.frames
    await computer.page.mouse.up()
    await expect.poll(() => computer.page.evaluate(() => learnerProfileSyncOpportunity.isQuiet()), { timeout: 15_000 }).toBe(true)
    await expect.poll(() => cloud.head().envelope.profile.videos.computer.resumeAtSeconds,
      { timeout: recordSync ? 15_000 : 40_000 }).toBe(42)
    await expect(computer.page.locator('#learnerProfileSyncStatus')).toHaveText('Up to date')
    const delivered = cloud.commits.slice(before)
    const evidence = { transport: recordSync ? 'records' : 'envelope', retainedVideos: 502,
      uploadBytes: delivered.map(commit => Buffer.byteLength(JSON.stringify(commit.args))),
      frames: frames.length, medianFrameMs: frames[Math.floor(frames.length / 2)],
      p95FrameMs: frames[Math.floor(frames.length * 0.95)], maxFrameMs: frames.at(-1), longTasks: timing.longTasks }
    await testInfo.attach('gameplay-sync-comparison', { body: JSON.stringify(evidence, null, 2), contentType: 'application/json' })
    if (recordSync) {
      expect(delivered).toHaveLength(1)
      expect(delivered[0].args).not.toHaveProperty('p_envelope')
      expect(delivered[0].args.p_batch.units.map(unit => [unit.kind, unit.key])).toEqual([['video', 'computer']])
      expect(delivered[0].args.p_batch.units[0]).not.toHaveProperty('metadata')
      expect(evidence.uploadBytes[0]).toBeLessThan(3000)
      cloud.advance(60_000)
      phone = await createDevice(browser, cloud, 'phone', browserName, baseURL, { recordSync: true })
      expect(await phone.capture(60)).toBe(true)
      await phone.page.clock.runFor(1000)
      await expect.poll(() => cloud.head().envelope.profile.videos.phone.resumeAtSeconds).toBe(60)
      computer.runtime.learnerProfileRecordSyncEnabled = false
      await computer.page.reload()
      await expect(computer.page.locator('#mainApp')).toBeVisible()
      await expect(computer.page.locator('#learnerProfileSyncStatus')).toHaveText('Up to date', { timeout: 15_000 })
      expect(await computer.page.evaluate(() => ({ computer: loadState().videos.computer.resumeAtSeconds,
        phone: loadState().videos.phone.resumeAtSeconds, islandVersion: loadState().tinySwordsIsland.version })))
        .toEqual({ computer: 42, phone: 60, islandVersion: 38 })
      expect(phone.errors).toEqual([])
    }
    expect(computer.errors).toEqual([])
  } finally {
    await computer.page.mouse.up().catch(() => {})
    await phone?.context.close()
    await computer.context.close()
  }
})

test('signed-in island checkpoints stay small during play and recover across an abrupt runtime stop and computer study', async ({ browser, browserName, baseURL }, testInfo) => {
  test.skip(!['desktop-standard', 'webkit-trial-phone'].includes(testInfo.project.name))
  test.setTimeout(Math.max(testInfo.timeout, 90_000))
  const cloud = await createCloud()
  const phone = await createDevice(browser, cloud, 'phone', browserName, baseURL)
  let computer
  try {
    const result = await phone.page.evaluate(async () => {
      window.dispatchEvent(new CustomEvent('edenia-tiny-swords-activity', { detail: { visible: true, active: true } }))
      const state = loadState()
      const videos = state.videos
      let reads = 0
      Object.defineProperty(state, 'videos', { configurable: true, enumerable: true,
        get() { reads++; return videos } })
      const fullSave = primaryProfileRepository.save
      primaryProfileRepository.save = () => { throw new Error('Island checkpoint attempted a full-profile save') }
      const baseline = JSON.stringify(primaryProfileRepository.readIslandState().tinySwordsIsland) ?? 'absent'
      const first = { version: 38, level: 1, resources: { wood: 7 } }
      const saved = await learnerProfileLifecycleAuthority.saveActiveIsland(first, baseline)
      let latest = first
      for (let i = 0; i < 10; i++) {
        const next = { ...latest, resources: { wood: 8 + i } }
        if (!await learnerProfileLifecycleAuthority.saveActiveIsland(next, JSON.stringify(latest))) throw new Error('Warm checkpoint rejected')
        latest = next
      }
      primaryProfileRepository.save = fullSave
      return { saved, reads, wood: state.tinySwordsIsland.resources.wood,
        body: JSON.parse(localStorage.getItem('edenia_v1_auth_trial_v1_learner_profile_sync_v1')).pending }
    })
    expect(result).toEqual({ saved: true, reads: 0, wood: 17, body: null })
    await phone.page.clock.runFor(60_000)
    expect(cloud.commits).toHaveLength(0)
    // Retire the runtime without a session-boundary flush. Durable state alone
    // must supply the first before-image on reopening.
    await phone.page.evaluate(() => learnerProfileLifecycleAuthority.destroy())
    computer = await createDevice(browser, cloud, 'computer', browserName, baseURL)
    expect(await computer.capture(65)).toBe(true)
    await expect.poll(() => cloud.head().revision).toBe(2)
    cloud.advance(30_000)
    await phone.page.reload()
    await expect(phone.page.locator('#mainApp')).toBeVisible()
    await expect.poll(() => phone.page.evaluate(() => loadState()?.tinySwordsIsland?.resources?.wood)).toBe(17)
    await expect.poll(() => phone.page.evaluate(() => loadState()?.videos.computer.resumeAtSeconds)).toBe(65)
    await expect(phone.page.locator('#learnerProfileConflictDialog')).not.toBeVisible()
    await expect.poll(() => cloud.head().envelope.profile.tinySwordsIsland?.resources?.wood).toBe(17)
    expect(phone.errors).toEqual([])
    expect(computer.errors).toEqual([])
  } finally {
    await phone.context.close()
    await computer?.context.close()
  }
})

test('retiring a signed-in activation fences an island checkpoint before it can acknowledge or write', async ({ browser, browserName, baseURL }, testInfo) => {
  test.skip(!['desktop-standard', 'webkit-trial-phone'].includes(testInfo.project.name))
  const cloud = await createCloud()
  const phone = await createDevice(browser, cloud, 'phone', browserName, baseURL)
  try {
    const result = await phone.page.evaluate(async () => {
      window.dispatchEvent(new CustomEvent('edenia-tiny-swords-activity', { detail: { visible: true, active: true } }))
      const save = primaryProfileRepository.saveIsland.bind(primaryProfileRepository)
      let release
      const gate = new Promise(resolve => { release = resolve })
      primaryProfileRepository.saveIsland = async (...args) => { await gate; return save(...args) }
      const before = primaryProfileRepository.readIslandState().tinySwordsIsland
      const pending = learnerProfileLifecycleAuthority.saveActiveIsland({ version: 38, resources: { wood: 999 } }, JSON.stringify(before) ?? 'absent')
      learnerProfileLifecycleAuthority.destroy()
      release()
      return { saved: await pending, after: primaryProfileRepository.readIslandState().tinySwordsIsland ?? null, before: before ?? null }
    })
    expect(result.saved).toBe(false)
    expect(result.after).toEqual(result.before)
    expect(cloud.commits).toHaveLength(0)
    expect(phone.errors).toEqual([])
  } finally { await phone.context.close() }
})

for (const firstCheckpoint of [true, false]) test(`quota fallback retains the ${firstCheckpoint ? 'first' : 'existing'} island base across abrupt close and computer study`, async ({ browser, browserName, baseURL }, testInfo) => {
  test.skip(!['desktop-standard', 'webkit-trial-phone'].includes(testInfo.project.name))
  test.setTimeout(Math.max(testInfo.timeout, 120_000))
  const cloud = await createCloud()
  const phone = await createDevice(browser, cloud, 'phone', browserName, baseURL)
  let computer
  try {
    await phone.page.evaluate(() => window.dispatchEvent(new CustomEvent('edenia-tiny-swords-activity', {
      detail: { visible: true, active: true }
    })))
    if (!firstCheckpoint) {
      // A startup study transaction may still own the local writer. The game
      // retries a rejected checkpoint rather than replacing that transaction.
      await expect.poll(() => phone.page.evaluate(() => learnerProfileLifecycleAuthority.saveActiveIsland(
        { version: 38, level: 1, resources: { wood: 7 } },
        JSON.stringify(primaryProfileRepository.readIslandState().tinySwordsIsland) ?? 'absent'
      ))).toBe(true)
    }
    const saved = await phone.page.evaluate(async () => {
      const island = primaryProfileRepository.readIslandState().tinySwordsIsland
      const put = IDBObjectStore.prototype.put
      IDBObjectStore.prototype.put = function (value) {
        if (this.name === 'profiles' && value.key === 'active') throw new DOMException('Synthetic quota failure', 'QuotaExceededError')
        return put.call(this, value)
      }
      const next = { version: 38, level: 1, resources: { wood: 17 } }
      const result = await learnerProfileLifecycleAuthority.saveActiveIsland(next, JSON.stringify(island) ?? 'absent')
      IDBObjectStore.prototype.put = put
      if (!profileRecoveryWorkspace.isActive()) throw new Error('Expected durable recovery fallback')
      learnerProfileLifecycleAuthority.destroy()
      return result
    })
    expect(saved).toBe(true)
    expect(cloud.commits).toHaveLength(0)
    computer = await createDevice(browser, cloud, 'computer', browserName, baseURL)
    expect(await computer.capture(65)).toBe(true)
    await expect.poll(() => cloud.head().revision).toBe(2)
    cloud.advance(30_000)
    await phone.page.reload()
    await expect(phone.page.locator('#mainApp')).toBeVisible()
    await expect.poll(() => phone.page.evaluate(() => loadState()?.tinySwordsIsland?.resources?.wood)).toBe(17)
    await expect.poll(() => phone.page.evaluate(() => loadState()?.videos.computer.resumeAtSeconds)).toBe(65)
    await expect.poll(() => cloud.head().envelope.profile.tinySwordsIsland?.resources?.wood).toBe(17)
    expect(phone.errors).toEqual([])
  } finally { await phone.context.close(); await computer?.context.close() }
})

test('a stale quota fallback cannot replace study saved while its base read was pending', async ({ browser, browserName, baseURL }, testInfo) => {
  test.skip(!['desktop-standard', 'webkit-trial-phone'].includes(testInfo.project.name))
  test.setTimeout(Math.max(testInfo.timeout, 120_000))
  const cloud = await createCloud()
  const phone = await createDevice(browser, cloud, 'phone', browserName, baseURL)
  try {
    const result = await phone.page.evaluate(async () => {
      window.dispatchEvent(new CustomEvent('edenia-tiny-swords-activity', { detail: { visible: true, active: true } }))
      const repository = primaryProfileRepository
      const readBase = repository.readSyncBase.bind(repository)
      let release, started
      const gate = new Promise(resolve => { release = resolve })
      const reading = new Promise(resolve => { started = resolve })
      repository.readSyncBase = async (...args) => { started(); await gate; return readBase(...args) }
      const put = IDBObjectStore.prototype.put
      IDBObjectStore.prototype.put = function (value) {
        if (this.name === 'profiles' && value.key === 'active') {
          IDBObjectStore.prototype.put = put
          throw new DOMException('Synthetic quota failure', 'QuotaExceededError')
        }
        return put.call(this, value)
      }
      const island = repository.readIslandState().tinySwordsIsland
      const pending = learnerProfileLifecycleAuthority.saveActiveIsland({ version: 38, resources: { wood: 99 } }, JSON.stringify(island) ?? 'absent')
      await reading
      const state = loadState()
      state.videos.phone.favorite = true
      const studied = await saveState(state)
      release()
      return { studied, checkpoint: await pending, recovered: profileRecoveryWorkspace.isActive(),
        favorite: repository.snapshot().videos.phone.favorite,
        island: repository.readIslandState().tinySwordsIsland ?? null, originalIsland: island ?? null }
    })
    expect(result.studied).toBe(true)
    expect(result.checkpoint).toBe(false)
    expect(result.recovered).toBe(false)
    expect(result.favorite).toBe(true)
    expect(result.island).toEqual(result.originalIsland)
    expect(phone.errors).toEqual([])
  } finally { await phone.context.close() }
})
