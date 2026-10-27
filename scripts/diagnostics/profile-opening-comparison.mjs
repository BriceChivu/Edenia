// Synthetic, local before/after opening diagnostics. Never contacts a real backend.
// Example:
// node scripts/diagnostics/profile-opening-comparison.mjs \
//   --before-site /path/to/frozen-before --after-site /path/to/frozen-after \
//   --before-ref <commit> --after-ref <commit> --output-dir /path/to/audit --pairs 5
import assert from 'node:assert/strict'
import { readFile, writeFile, mkdir, readdir } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { spawn, execFileSync } from 'node:child_process'
import { createReadStream } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseArgs } from 'node:util'
import { chromium } from '@playwright/test'
import { createPortableLearnerProfileEnvelope } from '../../src/state/portable-learner-profile.js'
import { canonicalizeJson, sha256Base64UrlSync } from '../../src/state/portable-state.js'
import { isValidStateBackupEntry, STATE_BACKUP_LIMIT } from '../../src/state/backups.js'
import { isValidStateShape } from '../../src/state/persistence-contract.js'
import { experienceFromSeconds } from '../../src/domain/experience.js'
import { getCityLevelIndex } from '../../src/features/city/model.js'

const { values } = parseArgs({ options: {
  'before-site': { type: 'string' }, 'after-site': { type: 'string' },
  'before-ref': { type: 'string' }, 'after-ref': { type: 'string' },
  'before-label': { type: 'string' }, 'after-label': { type: 'string' },
  'before-position-island': { type: 'string' },
  'output-dir': { type: 'string' }, pairs: { type: 'string', default: '5' },
  cohort: { type: 'string', multiple: true }, 'port-base': { type: 'string', default: '8231' },
  pilot: { type: 'boolean', default: false }, 'allow-before-game-save-failure': { type: 'boolean', default: false }, 'debug-eligibility': { type: 'boolean', default: false },
  help: { type: 'boolean', short: 'h', default: false }
} })
if (values.help) {
  console.log('Usage: node scripts/diagnostics/profile-opening-comparison.mjs --before-site <frozen site> --after-site <frozen site> --output-dir <audit folder> [--pairs 5] [--cohort <name>] [--pilot]')
  console.log('Cohorts: fresh-google-500, expired-google-2500, clean-email-500, dirty-email-500, combined-bank-cpu1, combined-bank-cpu4; opt-in hash-email-2500-cpu1, hash-email-2500-cpu4, game-email-500, pose-email-500, pose-email-2500, headed-pose-email-500, headed-pose-email-2500')
  process.exit(0)
}
assert.ok(values['before-site'] && values['output-dir'], '--before-site and --output-dir are required')
const pilot = values.pilot
assert.ok(pilot || values['after-site'], '--after-site is required except for a before-only fixture pilot')
const pairCount = Number(values.pairs), portBase = Number(values['port-base'])
assert.ok(Number.isInteger(pairCount) && pairCount >= 1 && pairCount <= 20, '--pairs must be 1–20')
assert.ok(Number.isInteger(portBase) && portBase >= 1024 && portBase <= 65534, 'Invalid --port-base')
const root = fileURLToPath(new URL('../../', import.meta.url))
const outputDir = resolve(values['output-dir'])
await mkdir(outputDir, { recursive: true })
const outputPath = name => resolve(outputDir, name)
const fixture = JSON.parse(await readFile(new URL('../../tests/fixtures/learner-profile/profile-ready-trial-smoke.json', import.meta.url)))
const provider = 'https://opening-implementation-fixture.supabase.co'
const key = 'edenia_v1_auth_trial_v1', ownerId = fixture.session.user.id
const profileId = '223e4567-e89b-42d3-a456-426614174001'
const identity = { user_id: ownerId, profile_id: profileId, generation: 1, revision: 1, last_replacement_revision: 0 }
const ports = { before: portBase, after: portBase + 1 }
const variants = pilot ? ['before'] : ['before', 'after']
const frozen = {}, sitePaths = {}
async function hashFile(path) {
  const hash = createHash('sha256')
  for await (const chunk of createReadStream(path)) hash.update(chunk)
  return hash.digest('hex')
}
async function siteManifest(folder) {
  const hashes = {}
  async function walk(relative = '') {
    const entries = await readdir(resolve(folder, relative), { withFileTypes: true })
    for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
      const name = relative ? relative + '/' + entry.name : entry.name
      if (entry.isDirectory()) await walk(name)
      else if (entry.isFile()) hashes[name] = await hashFile(resolve(folder, name))
      else throw Error('Frozen sites must contain regular files/directories: ' + name)
    }
  }
  await walk()
  return hashes
}
for (const variant of variants) {
  const folder = resolve(values[variant + '-site'])
  const html = await readFile(resolve(folder, 'index.html'), 'utf8')
  const release = JSON.parse(await readFile(resolve(folder, 'release.json'), 'utf8'))
  const assetVersion = /(?:app|site-entry)\.js\?v=([^"'>\s]+)/.exec(html)?.[1]
  assert.ok(assetVersion, variant + ' index must contain a normal versioned entry')
  assert.equal(assetVersion,release.assetVersion,variant+' index and release identity must agree')
  const suppliedRef = values[variant + '-ref']
  assert.ok(suppliedRef, '--' + variant + '-ref is required for verifiable provenance')
  const ref = execFileSync('git', ['rev-parse', '--verify', '--end-of-options', suppliedRef + '^{commit}'], { cwd: root, encoding: 'utf8' }).trim()
  assert.equal(ref,release.deployedCommit,variant+' release commit must match declared source ref')
  assert.ok(ref.startsWith(assetVersion.split('-p')[0]), variant + ' index version must match declared source commit')
  sitePaths[variant] = folder
  const artifacts = await siteManifest(folder)
  frozen[variant] = { ref, label: values[variant + '-label'] || variant, assetVersion,
    appSha256: artifacts['app.js'], appBytes: (await readFile(resolve(folder, 'app.js'))).length,
    styleSha256: artifacts['style.css'], indexSha256: artifacts['index.html'], artifacts,
    artifactManifestSha256: createHash('sha256').update(JSON.stringify(artifacts)).digest('hex') }
}
const harnessSource = await readFile(fileURLToPath(import.meta.url))
const harnessSha256 = createHash('sha256').update(harnessSource).digest('hex')
await writeFile(outputPath('harness-source.mjs'), harnessSource)
if(values['allow-before-game-save-failure']) {
  assert.equal(frozen.before.ref,'41cec047f8751099ecf9ae7844bf4342696861f2')
  assert.equal(frozen.before.appSha256,'33c6a07b13b50310ffc9b73916d3c0b757f3664935e883da6e0584656e1ff5f5')
}
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms))
const servers = []
let browser
const samples = []
const profiles = new Map()
const poseIsland = JSON.parse(await readFile(new URL('../../tests/fixtures/tiny-swords-animal-v40.json', import.meta.url)))
// An older native writer can use a different format from the current writer.
// Supply its real admitted snapshot rather than inventing a version conversion.
const beforePoseIsland = values['before-position-island']
  ? JSON.parse(await readFile(resolve(values['before-position-island']), 'utf8')) : poseIsland
const positionFixtureHashes = Object.fromEntries(Object.entries({ before: beforePoseIsland, after: poseIsland })
  .map(([variant, island]) => [variant, createHash('sha256').update(JSON.stringify(island)).digest('hex')]))
for (const count of [500, 2500]) {
  const raw = structuredClone(fixture.resolution.envelope.profile)
  raw.config.ankiEnabled = false
  raw.config.ankiDisabledAt = '2026-10-08T12:00:00.000Z'
  raw.onboarding.walkthroughCompleted = true
  raw.onboarding.levelUpGuidanceShownAt = '2026-10-08T12:00:00.000Z'
  raw.onboarding.islandAnnouncementSeenAt = '2026-10-08T12:00:00.000Z'
  raw.onboarding.walkthroughCompletedAt = raw.onboarding.setupCompletedAt
  raw.videos = Object.fromEntries(Array.from({ length: count }, (_, i) => ['lesson-' + i, {
    id: 'lesson-' + i, title: 'Synthetic lesson ' + i + ' ' + 'display metadata '.repeat(count === 2500 ? 5 : 20), duration: 300,
    manuallyAdded: true, status: 'partial', resumeAtSeconds: 10, watchProgressTracked: true,
    watchProgress: [{ seconds: 10, experienceSeconds: 10, watchedAt: '2026-10-08T12:00:00.000Z', studyDay: '2026-10-08' }]
  }]))
  const { envelope } = await createPortableLearnerProfileEnvelope(raw, { now: () => new Date('2026-10-27T00:00:00.000Z'), maxBytes: 2 * 1024 * 1024 })
  assert.ok(envelope && Buffer.byteLength(JSON.stringify(envelope)) <= 2 * 1024 * 1024, 'Fixture must pass actual cloud envelope admission')
  profiles.set(count, { envelope, digest: sha256Base64UrlSync(canonicalizeJson(envelope.profile)), bytes: Buffer.byteLength(JSON.stringify(envelope.profile)) })
  for (const [variant, island] of Object.entries({ before: beforePoseIsland, after: poseIsland })) {
    const positioned = await createPortableLearnerProfileEnvelope({ ...raw, tinySwordsIsland: island }, {
      now: () => new Date('2026-10-27T00:00:00.000Z'), maxBytes: 2 * 1024 * 1024
    })
    assert.ok(positioned.envelope, 'Position fixture must pass actual cloud admission')
    profiles.set('pose-' + variant + '-' + count, { envelope: positioned.envelope,
      digest: sha256Base64UrlSync(canonicalizeJson(positioned.envelope.profile)),
      bytes: Buffer.byteLength(JSON.stringify(positioned.envelope.profile)) })
  }
}
const populatedIsland = JSON.parse(await readFile(new URL('../../tests/fixtures/tiny-swords-populated-island.json', import.meta.url)))
const gameRaw = structuredClone(profiles.get(500).envelope.profile)
gameRaw.tinySwordsIsland = populatedIsland
for (const video of Object.values(gameRaw.videos)) {
  video.resumeAtSeconds = 40
  video.watchProgress[0].seconds = 40
  video.watchProgress[0].experienceSeconds = 40
}
const gameXp = Object.values(gameRaw.videos).reduce((sum, video) => sum + experienceFromSeconds(video.watchProgress[0].experienceSeconds), 0)
assert.equal(getCityLevelIndex(gameXp) + 1, populatedIsland.level, 'Real XP helpers must support the populated island claimed level')
gameRaw.cityProgress = { maxLevelIndex: populatedIsland.level - 1, experienceVersion: 1 }
const gameEnvelope = (await createPortableLearnerProfileEnvelope(gameRaw, { maxBytes: 2 * 1024 * 1024 })).envelope
const { tinySwordsIsland: _gameIsland, ...gameStudy } = gameEnvelope.profile
profiles.set('game-500', { envelope: gameEnvelope, digest: sha256Base64UrlSync(canonicalizeJson(gameEnvelope.profile)),
  studyDigest: sha256Base64UrlSync(canonicalizeJson(gameStudy)), bytes: Buffer.byteLength(JSON.stringify(gameEnvelope.profile)) })
const backupRaw = structuredClone(fixture.resolution.envelope.profile)
backupRaw.config.ankiEnabled = false
backupRaw.cityProgress = { maxLevelIndex: 0, experienceVersion: 1 }
backupRaw.videos = Object.fromEntries(Array.from({ length: 1250 }, (_, i) => ['backup-' + i, {
  id: 'backup-' + i, title: 'Backup lesson ' + i + ' ' + 'retained display metadata '.repeat(18), duration: 300,
  manuallyAdded: true, status: 'partial', resumeAtSeconds: 10, watchProgressTracked: true,
  watchProgress: [{ seconds: 10, experienceSeconds: 10, watchedAt: '2026-10-08T12:00:00.000Z', studyDay: '2026-10-08' }]
}]))
const backupEnvelope = (await createPortableLearnerProfileEnvelope(backupRaw, { maxBytes: 2 * 1024 * 1024 })).envelope
const bank = Array.from({ length: 5 }, (_, i) => ({ id: 'synthetic-bank-' + i,
  createdAt: new Date(Date.parse('2026-10-26T00:00:00Z') - i * 3600000).toISOString(), reason: 'before import', sandbox: false,
  state: structuredClone(backupEnvelope.profile) }))
assert.ok(bank.length <= STATE_BACKUP_LIMIT && bank.every(entry => isValidStateBackupEntry(entry, isValidStateShape)))
const cohorts = [
  { id: 'fresh-google-500', count: 500, delay: 500, authMode: 'fresh-google', backupCount: 0, cpuRate: 1 },
  { id: 'expired-google-2500', count: 2500, delay: 1000, authMode: 'expired-google', backupCount: 0, cpuRate: 1 },
  { id: 'clean-email-500', count: 500, delay: 500, authMode: 'fresh-email', backupCount: 0, cpuRate: 1 },
  { id: 'dirty-email-500', count: 500, delay: 500, authMode: 'fresh-email', backupCount: 0, cpuRate: 1, dirty: true },
  { id: 'combined-bank-cpu1', count: 2500, delay: 1000, authMode: 'expired-google', backupCount: 5, cpuRate: 1 },
  { id: 'combined-bank-cpu4', count: 2500, delay: 1000, authMode: 'expired-google', backupCount: 5, cpuRate: 4 },
  { id: 'hash-email-2500-cpu1', count: 2500, delay: 500, authMode: 'fresh-email', backupCount: 0, cpuRate: 1, optInOnly: true },
  { id: 'hash-email-2500-cpu4', count: 2500, delay: 500, authMode: 'fresh-email', backupCount: 0, cpuRate: 4, optInOnly: true },
  { id: 'game-email-500', count: 500, delay: 500, authMode: 'fresh-email', backupCount: 0, cpuRate: 1, engine: true, optInOnly: true },
  { id: 'pose-email-500', count: 500, delay: 500, authMode: 'fresh-email', backupCount: 0, cpuRate: 1, positions: true, optInOnly: true },
  { id: 'pose-email-2500', count: 2500, delay: 500, authMode: 'fresh-email', backupCount: 0, cpuRate: 1, positions: true, optInOnly: true },
  { id: 'headed-pose-email-500', count: 500, delay: 500, authMode: 'fresh-email', backupCount: 0, cpuRate: 1, positions: true, headed: true, optInOnly: true },
  { id: 'headed-pose-email-2500', count: 2500, delay: 500, authMode: 'fresh-email', backupCount: 0, cpuRate: 1, positions: true, headed: true, optInOnly: true }
]
async function run(cohort, variant, trial) {
  const { count, delay, authMode, backupCount, cpuRate, dirty = false, engine = false, positions = false, headed = false } = cohort
  const scenario = engine ? 'cold-game' : 'returning'
  const local = 'http://localhost:' + ports[variant]
  const session = structuredClone(fixture.session)
  if (authMode.includes('google')) {
    session.user.app_metadata = { provider: 'google', providers: ['google'] }
    const segment = value => Buffer.from(JSON.stringify(value)).toString('base64url')
    session.access_token = segment({ alg: 'HS256', typ: 'JWT' }) + '.' + segment({
      sub: ownerId, exp: 1893456000, iat: 1793000000, role: 'authenticated',
      amr: [{ method: 'oauth', timestamp: 1793000000 }], app_metadata: session.user.app_metadata
    }) + '.' + Buffer.alloc(32, 1).toString('base64url')
  }
  const expiredSession = structuredClone(session)
  expiredSession.expires_at = Math.floor(Date.now() / 1000) - 60
  const seededSession = authMode.startsWith('expired') ? expiredSession : session
  const { envelope, digest, bytes, studyDigest } = profiles.get(positions ? 'pose-' + variant + '-' + count : engine ? 'game-500' : count)
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'en-US', timezoneId: 'Asia/Taipei', serviceWorkers: 'block' })
  const page = await context.newPage()
  const errors = [], blocked = [], backend = []
  let phase = 'preparation', closing = false
  page.on('pageerror', error => errors.push(error.message))
  await page.route('**/*', async route => {
    const request = route.request(), url = new URL(request.url())
    if (url.origin === local && url.pathname === '/__opening_fixture_setup') return route.fulfill({ contentType:'text/html', body:'<!doctype html><title>Synthetic fixture setup</title>' })
    if (url.origin === local) return route.continue()
    if (url.origin !== provider) {
      blocked.push({ path: url.pathname, host: url.hostname, type: request.resourceType() })
      if (request.resourceType() === 'image') return route.fulfill({ contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg" width="1" height="1"/>' })
      return route.abort('blockedbyclient')
    }
    const started = performance.now(), startedPhase = phase
    const row = { path: url.pathname, method: request.method(), phase: startedPhase, delayRequestedMs: delay, startedNodeMs: started, responseStatus: null }
    backend.push(row)
    await sleep(delay)
    const reply = async (json, status = 200) => {
      row.elapsedToFulfillMs = performance.now() - started
      row.responseStatus = status
      row.responseJsonBytes = Buffer.byteLength(JSON.stringify(json))
      try { return await route.fulfill({ status, json, headers: { 'access-control-allow-origin': '*', 'timing-allow-origin': '*' } }) }
      catch (error) { if (!closing) throw error }
    }
    if (request.method() === 'OPTIONS') return reply(null, 204)
    if (url.pathname === '/auth/v1/token') return reply(session)
    if (url.pathname === '/auth/v1/user') return reply(session.user)
    if (url.pathname === '/rest/v1/learner_profile_heads') return reply(identity)
    if (url.pathname.endsWith('/open_my_learner_profile')) {
      const args = request.postDataJSON()
      row.cached = { profileId: args.p_cached_profile_id, generation: args.p_cached_generation, revision: args.p_cached_revision, sha256: args.p_cached_profile_sha256 }
      const unchanged = args.p_cached_profile_id === profileId && args.p_cached_generation === 1
        && args.p_cached_revision === 1 && args.p_cached_profile_sha256 === digest
      row.result = unchanged ? 'profile_unchanged' : 'profile_ready'
      return reply([{ status: row.result, created: false, ...identity, envelope: unchanged ? null : envelope,
        profile_sha256: unchanged ? digest : null, reset_state: { status: 'none' } }])
    }
    if (url.pathname.endsWith('/resolve_my_learner_profile')) return reply([{ status: 'profile_ready', created: false, ...identity, envelope }])
    if (url.pathname.endsWith('/read_my_latest_learner_profile_reset')) return reply([{ status: 'none' }])
    if (url.pathname.includes('write_receipt') || url.pathname.includes('record_receipt')) return reply([{ status: 'not_accepted', last_replacement_revision: 0 }])
    if (url.pathname.includes('/commit_my_learner_profile')) return reply({ code: 'temporary', message: 'Synthetic delivery disabled' }, 503)
    if (url.pathname.startsWith('/rest/v1/') && !url.pathname.includes('learner_profile')) return reply([])
    errors.push('Unexpected synthetic backend path: ' + url.pathname)
    return reply({ message: 'Unmodeled fixture request' }, 500)
  })
  await page.route('**/config.local.js*', route => route.fulfill({ contentType: 'application/javascript', body: 'window.EDENIA_CONFIG=' + JSON.stringify({
    authTrialEnabled: true, accountFeaturesRollout: 'off', learnerProfileLifecycleEnabled: false,
    learnerProfileRecordSyncEnabled: true, indexedDbProfileEnabled: true, indexedDbBackupsEnabled: true,
    indexedDbBackupCleanupEnabled: true, tinySwordsEnabled: engine, tinySwordsPublicEnabled: true,
    freePlusEnabled: false, googleSignInMode: 'off', supabaseUrl: provider, supabasePublishableKey: 'synthetic-key', youtubeApiKey: ''
  }) }))
  await page.addInitScript(({ scenario, envelope, key, session, ownerId, profileId, debug, engine }) => {
    if (window.top !== window) {
      if (engine) {
        window.addEventListener('message', event => {
          const data=event.data
          if(event.origin===location.origin && event.source===parent && data?.type==='edenia-tiny-saved'
            && data.session===window.edeniaStudySession) {
            try { const trace=parent.openingTrace;trace.gameSaveResponses ||= [];trace.gameSaveResponses.push({at:parent.performance.now(),id:data.id,persisted:data.persisted});if(data.persisted===true)trace.gameDurableSaveMs ??=parent.performance.now() } catch {}
          }
        })
        let level
        Object.defineProperty(window, 'edeniaGameLevel', { configurable:true, get:()=>level, set(value) {
          level=value
          try { const trace=parent.openingTrace; if(trace && trace.gameRestoreAppliedMs == null) { trace.gameRestoreAppliedMs=parent.performance.now(); trace.gameAppliedLevel=value } } catch {}
        } })
      }
      return
    }
    if (!sessionStorage.getItem('opening-plan-seeded')) {
      localStorage.setItem(key + '_plus_auth_v1', JSON.stringify(session))
      if (scenario === 'returning') {
        localStorage.setItem(key, JSON.stringify(envelope.profile))
        localStorage.setItem(key + '_learner_profile_access_v1', JSON.stringify({ version: 1, ownerId, profileId, generation: 1, revision: 1,
          activatedAt: Date.now(), activationId: null, onboardingFinalizationPending: false }))
        localStorage.setItem(key + '_learner_profile_sync_v1', JSON.stringify({ version: 1, ownerId, profileId, generation: 1, acceptedRevision: 1, pending: null, queued: null }))
      }
      sessionStorage.setItem('opening-plan-seeded', '1')
    }
    const trace = window.openingTrace = { timeOrigin: performance.timeOrigin, notice: [], statuses: [], methods: [], idb: [],
      mainVisibleDomMs: null, usableFrameMs: null, activeMs: null, noticePaintedMs: null, noticeHiddenFrameMs: null, noticeFrames: [], longTasks: [] }
    const readSync = () => { const s=JSON.parse(localStorage.getItem(key+'_learner_profile_sync_v1')||'null');return {dirty:localStorage.getItem(key+'_learner_profile_sync_v1_dirty')!==null,pending:Boolean(s?.pending),queued:Boolean(s?.queued),acceptedRevision:s?.acceptedRevision} }
    if(engine) window.addEventListener('message', event => {
      const frame=document.querySelector('.tiny-swords-frame'), data=event.data
      if(event.origin!==location.origin || event.source!==frame?.contentWindow) return
      if(data?.type==='edenia-tiny-restored' && data.accepted===true && data.session===frame.contentWindow.edeniaStudySession) {
        trace.gameFirstDrawAcceptedMs ??=performance.now()
        const visibleFrame=()=>{
          const surface=document.getElementById('tinySwordsSurface'),main=document.getElementById('mainApp')
          const current=document.querySelector('.tiny-swords-frame'),access=learnerProfileLifecycleAuthority?.getState()
          const rect=surface?.getBoundingClientRect(),style=surface&&getComputedStyle(surface)
          const frameStyle=current&&getComputedStyle(current)
          if(surface?.dataset.gameState==='ready' && access?.status==='active' && access.ownerId===ownerId
            && main && !main.hasAttribute('inert') && !main.classList.contains('hidden')
            && current===frame && current.getClientRects().length && surface.getClientRects().length
            && style.display!=='none' && style.visibility!=='hidden' && style.opacity!=='0'
            && frameStyle.display!=='none' && frameStyle.visibility!=='hidden' && frameStyle.opacity!=='0'
            && rect.bottom>0 && rect.right>0 && rect.top<innerHeight && rect.left<innerWidth) {
            trace.gameVisibleHostFrameMs ??=performance.now()
          } else requestAnimationFrame(visibleFrame)
        }
        requestAnimationFrame(visibleFrame)
      }
      if(data?.type==='edenia-tiny-layout' && trace.gameLayoutSubmittedMs == null) {trace.gameLayoutSubmittedMs=performance.now();trace.gameLayoutOutput=data.layout;trace.gamePolicyBeforeSave=structuredClone(loadState()?.config?.trackedChannelPolicy)}
    })
    trace.initialSync=readSync()
    trace.syncWrites=[]
    trace.nativeBackups=[]
    const getAll=IDBObjectStore.prototype.getAll
    IDBObjectStore.prototype.getAll=function(...args){const start=performance.now(),request=getAll.apply(this,args);if(this.name==='backups')request.addEventListener('success',()=>trace.nativeBackups.push({start,end:performance.now(),count:request.result.length}));return request}
    if(debug){const set=Storage.prototype.setItem;Storage.prototype.setItem=function(name,value){const result=set.call(this,name,value);if(name===key+'_learner_profile_sync_v1'||name===key+'_learner_profile_sync_v1_dirty')trace.syncWrites.push({at:performance.now(),key:name,state:readSync(),stack:new Error().stack});return result}}
    const opened = IDBFactory.prototype.open
    IDBFactory.prototype.open = function (name, ...args) {
      const record = { kind: 'open', database: name, start: performance.now(), end: null }, request = opened.call(this, name, ...args)
      trace.idb.push(record)
      for (const type of ['success', 'error', 'blocked']) request.addEventListener(type, () => { record.end = performance.now(); record.outcome = type })
      return request
    }
    const transaction = IDBDatabase.prototype.transaction
    IDBDatabase.prototype.transaction = function (...args) {
      const record = { kind: 'transaction', database: this.name, stores: args[0], mode: args[1] || 'readonly', start: performance.now(), end: null }
      const result = transaction.apply(this, args)
      trace.idb.push(record)
      for (const type of ['complete', 'abort', 'error']) result.addEventListener(type, () => { record.end = performance.now(); record.outcome = type })
      return result
    }
    try { new PerformanceObserver(list => trace.longTasks.push(...list.getEntries().map(e => ({ start: e.startTime, duration: e.duration })))).observe({ type: 'longtask', buffered: true }) } catch {}
    const trackedClassLists = new WeakMap()
    for (const method of ['add', 'remove', 'toggle', 'replace']) {
      const original = DOMTokenList.prototype[method]
      DOMTokenList.prototype[method] = function (...args) {
        const result = original.apply(this, args)
        if (trackedClassLists.has(this)) mark()
        return result
      }
    }
    let lastNotice, lastStatus, bound = false
    function mark() {
      const notice = document.getElementById('learnerProfileOpeningNotice'), app = document.getElementById('mainApp')
      if (notice) {
        const hidden = notice.classList.contains('hidden'), srOnly = notice.classList.contains('sr-only')
        const state = hidden ? 'hidden' : srOnly ? 'sr-only' : 'visible'
        if (lastNotice !== state) {
          lastNotice = state
          trace.notice.push({ state, at: performance.now() })
          requestAnimationFrame(() => {
            const visible = !notice.classList.contains('hidden') && !notice.classList.contains('sr-only')
            if (!trace.noticeFrames.length || trace.noticeFrames.at(-1).visible !== visible) trace.noticeFrames.push({ visible, at: performance.now() })
            if (visible && trace.noticePaintedMs === null) trace.noticePaintedMs = performance.now()
            if (!visible && trace.noticePaintedMs !== null && trace.noticeHiddenFrameMs === null) trace.noticeHiddenFrameMs = performance.now()
          })
        }
      }
      try {
        const access = learnerProfileLifecycleAuthority?.getState(), state = access?.status
        if (state && lastStatus !== state) { lastStatus = state; trace.statuses.push({ state, at: performance.now() }) }
        if (state === 'active' && trace.activeMs === null) trace.activeMs = performance.now()
        const usableControl = app?.querySelector('[data-video-id]')
        if (app && usableControl && !app.classList.contains('hidden') && !app.hasAttribute('inert') && state === 'active' && access.ownerId === ownerId && applicationStarted) {
          if (trace.mainVisibleDomMs === null) trace.mainVisibleDomMs = performance.now()
          if (trace.usableFrameMs === null) requestAnimationFrame(() => {
            const currentAccess = learnerProfileLifecycleAuthority?.getState()
            if (currentAccess?.status === 'active' && currentAccess.ownerId === ownerId
              && !app.hasAttribute('inert') && !app.classList.contains('hidden')
              && app.getClientRects().length && app.querySelector('[data-video-id]')
              && trace.usableFrameMs === null) trace.usableFrameMs = performance.now()
          })
        }
      } catch {}
      if (!bound && notice && app) {
        bound = true
        trackedClassLists.set(notice.classList, 'notice')
        trackedClassLists.set(app.classList, 'main')
        discovery.disconnect()
        new MutationObserver(mark).observe(notice, { attributes: true, attributeFilter: ['class'], subtree: true, childList: true })
        new MutationObserver(mark).observe(app, { attributes: true, attributeFilter: ['class', 'inert'] })
      }
    }
    const discovery = new MutationObserver(mark)
    discovery.observe(document, { childList: true, subtree: true })
    window.addEventListener('edenia-profile-access', mark)
    document.addEventListener('DOMContentLoaded', () => { trace.domContentLoadedMs = performance.now(); mark() })
    const wrappers = setInterval(() => {
      if (typeof window.startApplicationWithState !== 'function') return
      clearInterval(wrappers)
      trace.wrappersInstalledMs = performance.now()
      for (const name of ['handleLearnerProfileAccessStateChange', 'startApplicationWithState', 'renderAll', 'rememberPersistedPortableProfile', 'getPortableProfileSnapshot', 'saveState', 'trackLearnerProfileOpening', 'getStateBackupEntries', 'renderBackupList', 'getReminderPreferenceDefaults', 'synchronizeAccountStudySnapshotForProfile']) {
        const original = window[name]
        if (typeof original !== 'function') continue
        window[name] = function (...args) {
          const record = { name, start: performance.now(), syncMs: null, end: null }
          if (debug && name === 'saveState') record.stack = new Error().stack
          if (name === 'saveState') record.options = { backup: args[1]?.backup, syncAnalytics: args[1]?.syncAnalytics, syncCloud: args[1]?.syncCloud }
          if (name === 'trackLearnerProfileOpening' && args[0]?.status === 'active' && trace.activationSource !== 'trackLearnerProfileOpening') { trace.activeMs = record.start; trace.activationSource = 'trackLearnerProfileOpening' }
          trace.methods.push(record)
          try {
            const result = original.apply(this, args)
            record.syncMs = performance.now() - record.start
            if (result?.then) return result.then(value => { record.end = performance.now(); record.saved = value === true; return value }, error => { record.end = performance.now(); record.error = true; throw error })
            record.end = performance.now()
            if(name==='getStateBackupEntries')record.entryCount=result.length
            record.saved = result === true
            return result
          } catch (error) { record.end = performance.now(); record.error = true; throw error }
        }
      }
    }, 1)
  }, { scenario, envelope, key, session: seededSession, ownerId, profileId, debug:values['debug-eligibility'], engine })
  const sample = { cohort: cohort.id, variant, count, delayMs: delay, scenario, trial, authMode, backupCount, cpuRate, dirty, engine, positions, headed, fixtureBytes: bytes, appSha256: frozen[variant].appSha256 }
  try {
    phase = scenario === 'returning' ? 'warmup' : 'measured'
    await page.goto(local + '/?internal_test=1', { waitUntil: 'domcontentloaded' })
    await page.waitForFunction(() => window.openingTrace?.usableFrameMs !== null, null, { timeout: 30000 })
    if (scenario === 'returning') {
      await page.waitForFunction(() => window.openingTrace.methods.some(m => m.name === 'saveState'
        && m.start >= window.openingTrace.usableFrameMs && m.saved === true
        && m.options.backup === false && m.options.syncAnalytics === false), null, { timeout: 10000 })
      await page.evaluate(async () => {
        await learnerProfileLifecycleAuthority.flushSessionBoundary({ allowNewUpload: false })
        const bank = await flushStateBackupWrites()
        if (!bank.persisted) throw Error('Warmup backup writes did not settle')
      })
      sample.warmup = await page.evaluate(async ({ key }) => {
        const canonical = getPortableProfileSnapshot(loadState())
        const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(canonical))
        return { sha256: btoa(String.fromCharCode(...new Uint8Array(digest))).replaceAll('+','-').replaceAll('/','_').replaceAll('=',''),
          access: JSON.parse(localStorage.getItem(key + '_learner_profile_access_v1')),
          sync: (() => { const s=JSON.parse(localStorage.getItem(key + '_learner_profile_sync_v1')); return { acceptedRevision:s.acceptedRevision,pending:Boolean(s.pending),queued:Boolean(s.queued) } })(),
          dirty: localStorage.getItem(key + '_learner_profile_sync_v1_dirty') !== null }
      }, { key })
      assert.equal(sample.warmup.sha256, digest, 'Settled portable content must match accepted cloud fixture')
      assert.deepEqual(sample.warmup.sync, { acceptedRevision:1,pending:false,queued:false })
      assert.equal(sample.warmup.dirty, false)
      if (positions && headed) {
        // A game that has already saved uses a split immutable-body/head store
        // on both versions. Match that representation before testing local Q;
        // otherwise only the after variant pays its first lazy reconstruction.
        sample.headWarmup = await page.evaluate(async ({ ownerId, profileId, key }) => {
          const repository = getProfileRepository()
          const activation = learnerProfileLifecycleAuthority.getState().activation
          const before = getPortableProfileSnapshot(repository.snapshot())
          const layout = repository.readIslandState().tinySwordsIsland
          const saved = await repository.saveIsland(layout, JSON.stringify(layout), {
            binding: { ownerId, profileId, generation: 1, revision: 1 },
            canPersist: () => learnerProfileLifecycleAuthority.getState().activation === activation
          })
          return { saved, canonicalUnchanged: before === getPortableProfileSnapshot(repository.snapshot()),
            dirty: localStorage.getItem(key + '_learner_profile_sync_v1_dirty') !== null }
        }, { ownerId, profileId, key })
        assert.deepEqual(sample.headWarmup, { saved: true, canonicalUnchanged: true, dirty: false })
      }
      if (positions && variant === 'after') {
        sample.animalCheckpoint = await page.evaluate(async key => {
          const before = getProfileRepository().readRaw()
          const current = learnerProfileLifecycleAuthority.readActiveIsland().tinySwordsIsland
          const moved = structuredClone(current)
          moved.sheep[0][0] += 16
          const saved = await learnerProfileLifecycleAuthority.saveActiveIsland(moved, JSON.stringify(current), { syncCloud: false })
          return { saved, moved, canonicalUnchanged: before === getProfileRepository().readRaw(),
            dirty: localStorage.getItem(key + '_learner_profile_sync_v1_dirty') !== null }
        }, key)
        assert.equal(sample.animalCheckpoint.saved, true)
        assert.equal(sample.animalCheckpoint.canonicalUnchanged, true)
        assert.equal(sample.animalCheckpoint.dirty, false)
      }
      if (dirty) {
        phase='dirty-checkpoint'
        sample.checkpoint=await page.evaluate(async({key,ownerId,profileId})=>{
          Object.defineProperty(navigator,'onLine',{configurable:true,get:()=>false}); window.dispatchEvent(new Event('offline'))
          window.dispatchEvent(new CustomEvent('edenia-tiny-swords-activity',{detail:{visible:true,active:true}}))
          const now=Date.now()
          activeVideoShelfPlayer={videoId:'lesson-0',mode:'study',isRewatch:false,watchCycleCoverage:[{start:0,end:10}],lastPlaybackSampleSeconds:10,
            lastPlaybackSampleAt:now-30000,lastPersistedSeconds:10,lastPersistedAt:now-5000,progressSeconds:10,playedSecondsTotal:0,
            player:{getCurrentTime:()=>40,getPlayerState:()=>1,getPlaybackRate:()=>1}}
          let saved; try{saved=await syncActiveVideoShelfPlayer({persist:true,syncAnalytics:false})}finally{activeVideoShelfPlayer=null}
          const canonical=getPortableProfileSnapshot(loadState())
          const hash=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(canonical))
          const sha256=btoa(String.fromCharCode(...new Uint8Array(hash))).replaceAll('+','-').replaceAll('/','_').replaceAll('=','')
          return{saved,sha256,resume:loadState().videos['lesson-0'].resumeAtSeconds,dirty:JSON.parse(localStorage.getItem(key+'_learner_profile_sync_v1_dirty')),
            units:await getProfileRepository().readDirtyUnits({ownerId,profileId,generation:1,revision:1})}
        },{key,ownerId,profileId})
        assert.equal(sample.checkpoint.saved,true); assert.equal(sample.checkpoint.resume,40)
        assert.equal(sample.checkpoint.dirty.ownerId,ownerId)
        assert.deepEqual(sample.checkpoint.units,{videos:['lesson-0'],anki:[],island:false})
        assert.equal(backend.filter(r=>r.phase==='dirty-checkpoint'&&r.path.includes('/commit_my_learner_profile')).length,0)
      }
      sample.warmupTrace = values['debug-eligibility'] ? await page.evaluate(() => window.openingTrace) : null
      // Retire the warm app before installing the archive fixture: its legitimate
      // pending archive writer must not merge old in-memory entries into setup.
      phase = 'fixture-setup'
      await page.goto(local + '/__opening_fixture_setup', { waitUntil:'domcontentloaded' })
      sample.bankSeed = await page.evaluate(async ({ entries, key }) => {
        const database = await new Promise((resolve,reject) => { const r=indexedDB.open('edenia_state_backups_v1_auth_trial_v1',1); r.onsuccess=()=>resolve(r.result); r.onerror=()=>reject(r.error) })
        await new Promise((resolve,reject) => {
          const tx=database.transaction(['backups','metadata'],'readwrite'), backups=tx.objectStore('backups')
          backups.clear(); entries.forEach(entry=>backups.put(entry))
          tx.objectStore('metadata').put({ key:'local-storage-migration-v1', backupKey:key+'_backups', entryCount:entries.length,
            legacyPresent:false,legacyValid:true,legacyVerified:true,migratedAt:'2026-10-27T00:00:00.000Z',schemaVersion:1 })
          tx.oncomplete=resolve; tx.onerror=()=>reject(tx.error); tx.onabort=()=>reject(tx.error)
        })
        database.close(); localStorage.removeItem(key+'_backups'); localStorage.setItem(key+'_backups_indexed_db_v1','1')
        return { count:entries.length, legacy:false, marker:true }
      }, { entries: bank.slice(0, backupCount), key })
      const cdp=await context.newCDPSession(page)
      await cdp.send('Emulation.setCPUThrottlingRate',{rate:cpuRate})
      if (authMode.startsWith('expired')) await page.evaluate(({ key, session }) => localStorage.setItem(key + '_plus_auth_v1', JSON.stringify(session)), { key, session: expiredSession })
      sample.preReload=await page.evaluate(({key})=>{const s=JSON.parse(localStorage.getItem(key+'_learner_profile_sync_v1'));return{dirty:localStorage.getItem(key+'_learner_profile_sync_v1_dirty')!==null,pending:Boolean(s.pending),queued:Boolean(s.queued)}},{key})
      if(!dirty)assert.deepEqual(sample.preReload,{dirty:false,pending:false,queued:false},'Clean fixture remains eligible after app retirement')
      phase = 'measured'
      await page.goto(local + '/?internal_test=1', { waitUntil: 'domcontentloaded' })
      await page.waitForFunction(() => window.openingTrace?.usableFrameMs !== null, null, { timeout: 30000 })
    }
    if(engine) {
      await page.waitForFunction(() => window.openingTrace.gameFirstDrawAcceptedMs != null
        && window.openingTrace.gameVisibleHostFrameMs != null && window.openingTrace.gameSaveResponses?.length,
        null, {timeout:60000})
      sample.initialGameSavePersisted=await page.evaluate(()=>window.openingTrace.gameSaveResponses[0].persisted===true)
      sample.knownBeforeGameSaveFailure=variant==='before' && values['allow-before-game-save-failure'] && !sample.initialGameSavePersisted
      assert.ok(sample.initialGameSavePersisted || sample.knownBeforeGameSaveFailure,'Initial migrated Godot snapshot must be acknowledged durably')
    }
    sample.trace = await page.evaluate(({ provider }) => ({ ...window.openingTrace,
      engineEnabled: window.edeniaTinySwordsEnabled === true,
      retainedVideos: Object.keys(loadState().videos).length, resume:loadState().videos['lesson-0'].resumeAtSeconds,
      verifiedOwner: learnerProfileLifecycleAuthority.getState().ownerId,
      identity:(()=>{const a=learnerProfileLifecycleAuthority.getState();return{ownerId:a.ownerId,profileId:a.profileId,generation:a.activation?.generation,revision:a.activation?.revision}})(),
      backendResources: performance.getEntriesByType('resource').filter(e => e.name.startsWith(provider)).map(e => ({ path: new URL(e.name).pathname,
        start: e.startTime, duration: e.duration, responseStart: e.responseStart, end: e.responseEnd, transferSize: e.transferSize }))
    }), { provider })
    sample.backend = backend.filter(row => row.phase === 'measured')
    sample.errors = errors
    sample.blockedExternal = blocked
    assert.equal(sample.trace.retainedVideos, count)
    assert.equal(sample.trace.resume,(dirty||engine)?40:10)
    const openRows=sample.backend.filter(r=>r.path.endsWith('/open_my_learner_profile'))
    assert.equal(openRows.length,1,'Exactly one measured profile-opening RPC')
    assert.equal(openRows[0].result,(dirty||engine)?'profile_ready':'profile_unchanged','Opening eligibility must match the intended cohort')
    if(dirty||engine)assert.deepEqual(openRows[0].cached,{profileId:null,generation:null,revision:null,sha256:null})
    else assert.deepEqual(openRows[0].cached,{profileId,generation:1,revision:1,sha256:digest})
    sample.integrity=await page.evaluate(async engine=>{
      let canonical=getPortableProfileSnapshot(loadState())
      if(engine){const study=JSON.parse(canonical);delete study.tinySwordsIsland;canonical=canonicalizeJson(study)}
      const hash=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(canonical))
      return{sha256:btoa(String.fromCharCode(...new Uint8Array(hash))).replaceAll('+','-').replaceAll('/','_').replaceAll('=','')}
    },engine)
    assert.equal(sample.integrity.sha256,engine?studyDigest:dirty?sample.checkpoint.sha256:digest,'All portable study/config facts retained exactly')
    if (positions) {
      sample.effectiveIsland = await page.evaluate(() => learnerProfileLifecycleAuthority.readActiveIsland().tinySwordsIsland)
      assert.deepEqual(sample.effectiveIsland, variant === 'after' ? sample.animalCheckpoint.moved : beforePoseIsland,
        'Clean opening retains the after-only local checkpoint without changing its exact canonical proof')
    }
    if(engine){
      assert.equal(sample.trace.gameAppliedLevel,populatedIsland.level)
      const layout=sample.trace.gameLayoutOutput
      sample.game={version:layout.version,level:layout.level,tiles:layout.tiles,resources:layout.resources,carriedWood:layout.carried_wood,
        logs:layout.log_piles,stock:layout.stock,chickens:layout.chicken_count??layout.chickens?.length,sheep:layout.sheep_count??layout.sheep?.length}
      if(sample.initialGameSavePersisted){
        sample.durableGame=await page.evaluate(async({ownerId,profileId})=>{
          const current=JSON.parse(getProfileRepository().readRaw())
          const base=await getProfileRepository().readSyncBase({ownerId,profileId,generation:1,revision:1})
          return{island:current.tinySwordsIsland,trackedChannelPolicy:current.config.trackedChannelPolicy,baseIsland:base?.tinySwordsIsland}
        },{ownerId,profileId})
        assert.deepEqual(sample.durableGame.island,layout,'The real migrated snapshot is committed, not merely queued')
        assert.deepEqual(sample.durableGame.trackedChannelPolicy,sample.trace.gamePolicyBeforeSave,'Late full-save policy facts survive the island checkpoint')
        assert.deepEqual(sample.durableGame.baseIsland,populatedIsland,'Accepted revision retains the exact v23 island before-image')
      }
      assert.ok(sample.game.version>populatedIsland.version,'Inspect the actual migrated durable Godot output, not the legacy input')
      assert.deepEqual(sample.game.tiles,populatedIsland.tiles)
      assert.deepEqual(sample.game.resources,populatedIsland.resources)
      assert.equal(sample.game.carriedWood,populatedIsland.carried_wood)
      assert.deepEqual(sample.game.logs,populatedIsland.log_piles)
      assert.equal(sample.game.chickens,populatedIsland.chickens.length)
      assert.equal(sample.game.sheep,populatedIsland.sheep.length)
      for(const [kind,amount] of Object.entries(populatedIsland.stock))assert.ok(sample.game.stock[kind]>=amount,'Legacy inventory conservation: '+kind)
    }
    assert.equal(sample.trace.verifiedOwner, ownerId)
    assert.deepEqual(sample.trace.identity,{ownerId,profileId,generation:1,revision:1},'Verified active lifecycle identity must match all fences')
    assert.equal(sample.trace.engineEnabled, engine)
    assert.deepEqual(errors, [])
    assert.ok(!blocked.some(r => r.host.includes('supabase') || r.host.includes('posthog')), 'No unmodeled backend/analytics request is allowed')
    const visible = sample.trace.notice.find(e => e.state === 'visible')
    const domIntervals = sample.trace.notice.flatMap((entry, i, all) => entry.state === 'visible' ? [{ start: entry.at, end: all[i + 1]?.at ?? sample.trace.usableFrameMs }] : [])
    const paintedIntervals = sample.trace.noticeFrames.flatMap((entry, i, all) => entry.visible ? [{ start: entry.at, end: all[i + 1]?.at ?? sample.trace.usableFrameMs }] : [])
    const openingRpc = sample.trace.backendResources.find(row => row.path.endsWith('/open_my_learner_profile'))
    const pending = sample.trace.notice.find(e => e.state === 'sr-only')
    sample.metrics = { usableMs: sample.trace.usableFrameMs, activeMs: sample.trace.activeMs,
      latentOpeningMs: pending ? sample.trace.activeMs - pending.at : null,
      preOpeningRpcMs: openingRpc?.start ?? null, openingRpcDurationMs: openingRpc?.duration ?? null,
      postOpeningRpcToActiveMs: openingRpc ? sample.trace.activeMs - openingRpc.end : null,
      activeToUsableFrameMs: sample.trace.usableFrameMs - sample.trace.activeMs,
      noticeVisibleDomMs: domIntervals.reduce((sum, span) => sum + span.end - span.start, 0), noticeDomIntervals: domIntervals,
      noticePaintOpportunityMs: paintedIntervals.reduce((sum, span) => sum + span.end - span.start, 0), noticeFrameIntervals: paintedIntervals,
      noticedVisibly: Boolean(visible), firstNoticeVisibleMs: visible?.at ?? null,
      ...(engine?{gameRestoreAppliedMs:sample.trace.gameRestoreAppliedMs,gameFirstDrawAcceptedMs:sample.trace.gameFirstDrawAcceptedMs,gameVisibleHostFrameMs:sample.trace.gameVisibleHostFrameMs,gameDurableSaveMs:sample.trace.gameDurableSaveMs,initialGameSavePersisted:sample.initialGameSavePersisted,knownBeforeGameSaveFailure:sample.knownBeforeGameSaveFailure}:{}) }
    sample.hiddenBackupListReads=sample.trace.methods.filter(m=>m.name==='getStateBackupEntries'&&m.start<=sample.metrics.usableMs).length
    if(variant==='after')assert.equal(sample.hiddenBackupListReads,0,'Final must not scan hidden backup list')
    if(backupCount){sample.settings=await page.evaluate(()=>{
      openSettings()
      const list=document.getElementById('backupList'),details=list.closest('details')
      if(details)details.open=true
      const more=document.getElementById('backupShowOlder')
      if(!more.hidden)more.click()
      return{visible:!document.getElementById('settingsPanel').classList.contains('hidden'),
        ids:[...list.querySelectorAll('[data-backup-id]')].map(e=>e.dataset.backupId),
        entries:getStateBackupEntries().map(({id,reason,createdAt})=>({id,reason,createdAt}))}
    })
    assert.equal(sample.settings.visible,true)
    assert.ok(bank.every(entry=>sample.settings.ids.includes(entry.id)),'All five input archives remain available')
    assert.ok(sample.trace.nativeBackups.some(event=>event.count===backupCount),'Actual native bank admission reads the seeded archive count')}
    samples.push(sample)
    await writeFile(outputPath(pilot?'fixture-pilot.partial.json':'paired-opening.partial.json'),JSON.stringify({frozen,cohorts,samples},null,2)+'\n')
    console.log(JSON.stringify({ cohort:cohort.id,variant,count,delayMs:delay,trial,authMode,backupCount,cpuRate,engine, ...sample.metrics,
      requests: sample.backend.map(r => ({ path: r.path, result: r.result, delayMs: r.elapsedToFulfillMs })) }))
  } catch (error) {
    const failure = { ...sample, error: error.message, trace: await page.evaluate(() => ({ ...window.openingTrace,
      bodyText: document.body?.innerText.slice(0, 3000), storage: Object.keys(localStorage).map(key => ({ key, bytes: (localStorage.getItem(key)?.length || 0) * 2 })),
      lifecycle: (() => { try { return learnerProfileLifecycleAuthority?.getState()?.status } catch { return null } })()
    })).catch(() => null), backend, errors }
    await writeFile(outputPath('paired-opening-failure-' + Date.now() + '.json'), JSON.stringify(failure, null, 2) + '\n')
    throw error
  } finally { closing = true; await context.close() }
}
try {
  for (const variant of variants) {
    const url = 'http://localhost:' + ports[variant]
    const server = spawn(process.execPath, [resolve(root, 'scripts/serve-static.mjs'), '--host', 'localhost',
      '--port', String(ports[variant]), '--root', sitePaths[variant]], { cwd: root, stdio: ['ignore', 'pipe', 'pipe'] })
    let listening = false, spawnError = null
    server.stdout.on('data', bytes => { if (bytes.toString().includes('Serving ' + sitePaths[variant] + ' at ' + url)) listening = true })
    server.stderr.on('data', bytes => process.stderr.write(bytes))
    server.on('error', error => { spawnError = error })
    servers.push(server)
    for (let i = 0; i < 80 && !listening; i++) {
      if (spawnError || server.exitCode !== null) throw spawnError || Error(variant + ' server exited before listening')
      await sleep(50)
    }
    assert.ok(listening, variant + ' spawned server must own its requested port')
    const served = await fetch(url + '/app.js')
    assert.equal(served.status, 200)
    assert.equal(createHash('sha256').update(Buffer.from(await served.arrayBuffer())).digest('hex'), frozen[variant].appSha256,
      variant + ' served app must match its frozen asset')
  }
browser = await chromium.launch()

  const requested = values.cohort || (pilot ? ['combined-bank-cpu1'] : cohorts.filter(cohort => !cohort.optInOnly).map(cohort => cohort.id))
  assert.ok(requested.every(id => cohorts.some(cohort => cohort.id === id)), 'Unknown --cohort')
  const chosen = cohorts.filter(cohort => requested.includes(cohort.id))
  for(let trial=1;trial<=(pilot?1:pairCount);trial++)for(const cohort of chosen){
    for(const variant of pilot?['before']:trial%2?['before','after']:['after','before'])await run(cohort,variant,trial)
  }
  const summary = []
  for(const cohort of chosen)for(const variant of variants){
    const rows=samples.filter(s=>s.cohort===cohort.id&&s.variant===variant)
    const aggregate=key=>{const values=rows.map(s=>s.metrics[key]).sort((a,b)=>a-b);return{median:(values[Math.floor((values.length-1)/2)]+values[Math.ceil((values.length-1)/2)])/2,minimum:values[0],maximum:values.at(-1)}}
    summary.push({cohort:cohort.id,variant,samples:rows.length,...(cohort.engine?{gameSaveOutcomes:rows.map(s=>({persisted:s.initialGameSavePersisted,knownHistoricalFailure:s.knownBeforeGameSaveFailure}))}:{}),...(cohort.engine?{game:{restoreAppliedMs:aggregate('gameRestoreAppliedMs'),firstDrawAcceptedMs:aggregate('gameFirstDrawAcceptedMs'),visibleHostFrameMs:aggregate('gameVisibleHostFrameMs')}}:{}),usableMs:aggregate('usableMs'),activeMs:aggregate('activeMs'),postOpeningRpcToActiveMs:aggregate('postOpeningRpcToActiveMs'),activeToUsableFrameMs:aggregate('activeToUsableFrameMs'),noticeVisibleDomMs:aggregate('noticeVisibleDomMs'),noticePaintOpportunityMs:aggregate('noticePaintOpportunityMs'),hiddenBackupListReads:rows.map(s=>s.hiddenBackupListReads),observerCounts:rows.map(s=>Object.fromEntries(['getReminderPreferenceDefaults','synchronizeAccountStudySnapshotForProfile'].map(name=>[name,s.trace.methods.filter(m=>m.name===name&&m.start<=s.metrics.usableMs).length]))),openResults:rows.map(s=>s.backend.find(r=>r.path.endsWith('/open_my_learner_profile')).result)})
  }
  for(const variant of variants)assert.deepEqual(await siteManifest(sitePaths[variant]),frozen[variant].artifacts,'Frozen '+variant+' site changed during the run')
  const artifactsReverifiedAt=new Date().toISOString()
  const output=outputPath(pilot?'fixture-pilot.json':'paired-opening.json')
  await writeFile(output, JSON.stringify({ harnessSha256,frozen,cohorts,positionFixtureHashes,bankFixture:{count:5,bytes:Buffer.byteLength(JSON.stringify(bank))}, node: process.version, browser: browser.version(), engineByCohort:Object.fromEntries(chosen.map(cohort=>[cohort.id,Boolean(cohort.engine)])),
    artifactsReverifiedAt, realBackendContacts: 0, fixtureMetadataRepetitions: { 500: 20, 2500: 5 }, fixtureHash: Object.fromEntries([...profiles].map(([count, v]) => [count, createHash('sha256').update(JSON.stringify(v.envelope.profile)).digest('hex')])),
    conditions: { fixture:'Returning profiles already saw level-up guidance and the island announcement. Their fixed synthetic timestamps prevent a valid delayed onboarding edit from changing the intended clean cohort.', debugEligibility:values['debug-eligibility'],allowHistoricalGameSaveFailure:values['allow-before-game-save-failure'], mockedBackendPerRequestDelayMs:[500,1000], clock:'Native browser performance.now; cohort CPU1x/4x emulation only, no fake timers' , auth:'Declared fresh/expired email/Google cohorts. Google syntheticHS256 uses pinned SDK getUser fallback; actual asymmetric/JWKS network path may differ.',
      notice: 'Synchronous tracked classList operations plus MutationObserver fallback and rAF opportunity; paint opportunity is not compositor proof',
      returning:'Untimed warmup; actual maintenance+archive-write acknowledgements; accepted-body/outbox proof; archive fixture in an app-free setup document; measured returning navigation. Dirty cohort checkpoints realstudy before app retirement.',
      gameReadiness:chosen.some(cohort=>cohort.engine)?'Separate opt-in full-cloud/cold-engine cohort: restore-applied from existing bridge property; accepted after Godot frame_post_draw; next owner-verified visible host RAF. Per-context engine/Cache API starts cold; shared browser/GPU process may warm shaders; loopback throughput only.':'Not timed: engine disabled to isolate profile work.', instrumentation: 'Passive DOM and IDB event trace plus narrow function wrappers installed at first script async yield; method wall time includes awaits and nested functions; do not sum nested calls.' }, summary, samples }, null, 2) + '\n')
  console.log(JSON.stringify({ output, summary }))
} finally { if(browser)await browser.close(); servers.forEach(s=>s.kill('SIGTERM')) }
