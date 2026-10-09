import { readFile } from 'node:fs/promises'
import { expect, test } from '../support/network-fixture.mjs'
import { createPortableLearnerProfileEnvelope } from '../../src/state/portable-learner-profile.js'

const trial = 'edenia_v1_auth_trial_v1'
const desktopTrialProjects = new Set(['desktop-standard', 'webkit-trial-desktop'])
const owner = '123e4567-e89b-42d3-a456-426614174000'
const profileId = '223e4567-e89b-42d3-a456-426614174001'
const origin = 'https://auth-trial-fixture.supabase.co'
const retained = {
  edenia_v1: '{normal-profile', edenia_v1_backups: '[normal-backups',
  edenia_v1_internal_test_2: '{tester-profile', edenia_v1_internal_test_2_backups: '[tester-backups',
  edenia_v1_internal_test: '{retired-profile', edenia_v1_internal_test_plus_auth_v1: 'retired-auth',
  edenia_posthog_authenticated_user_v1: 'other-analytics-owner'
}
const retainedBytes = async page => {
  const values = await page.evaluate(keys => {
    const cookies=document.cookie.split('; ').filter(cookie=>/^(edenia_config|edenia_config_internal_test|edenia_config_internal_test_2)=/.test(cookie)).sort()
    if(cookies.join('; ')!=='edenia_config=normal-marker; edenia_config_internal_test=retired-marker; edenia_config_internal_test_2=tester-marker')throw new Error('Another mode configuration changed')
    return Object.fromEntries(keys.map(key=>[key,localStorage.getItem(key)]))
  },Object.keys(retained))
  return values
}
async function seedRetained(page) {
  await page.addInitScript(values => {
    if (sessionStorage.getItem('trial-sentinel-installed')) return
    for (const [key,value] of Object.entries(values)) localStorage.setItem(key,value)
    document.cookie = 'edenia_config=normal-marker; path=/'
    document.cookie = 'edenia_config_internal_test_2=tester-marker; path=/'
    document.cookie = 'edenia_config_internal_test=retired-marker; path=/'
    sessionStorage.setItem('trial-sentinel-installed','1')
  },retained)
}
async function configure(page, { enabled = true, indexedDb = false, engine = false, youtubeApiKey = '' } = {}) {
  await page.route('**/config.local.js*', route => route.fulfill({contentType:'text/javascript',body:`window.EDENIA_CONFIG=${JSON.stringify({
    youtubeApiKey, authTrialEnabled: enabled, accountFeaturesRollout:'off',learnerProfileLifecycleEnabled:false,
    emergencyAccountlessRollbackEnabled:true,legacyProgressMigrationEnabled:true,
    tinySwordsEnabled:engine,tinySwordsPublicEnabled:false,indexedDbProfileEnabled:indexedDb,indexedDbBackupsEnabled:indexedDb,
    googleSignInMode:'off',supabaseUrl:origin,supabasePublishableKey:'test-key'
  })}`}))
}
function session(userId = owner) {
  const encode = value => Buffer.from(JSON.stringify(value)).toString('base64url')
  return {access_token:`${encode({alg:'HS256',typ:'JWT'})}.${encode({aud:'authenticated',role:'authenticated',sub:userId,exp:1893456000})}.fixture`,
    refresh_token:'trial-refresh',expires_at:1893456000,expires_in:31536000,token_type:'bearer',
    user:{id:userId,email:'trial@example.test',aud:'authenticated',role:'authenticated',app_metadata:{provider:'email',providers:['email']},user_metadata:{},identities:[]}}
}
async function owned(page,{indexedDb,engine,ankiEnabled=false,anki={},videos={},youtubeApiKey='',activationId=null}) {
  await configure(page,{indexedDb,engine,youtubeApiKey})
  const island = JSON.parse(await readFile(new URL('../fixtures/tiny-swords-populated-island.json',import.meta.url)))
  const at='2026-10-08T00:00:00.000Z'
  let envelope=(await createPortableLearnerProfileEnvelope({
    config:{locale:'en',ankiEnabled,channels:[],weeklyGoalHours:4},anki,videos,
    learnerProfile:{languages:['french'],level:'beginner',createdAt:at,updatedAt:at},
    onboarding:{introSeenAt:at,setupCompleted:true,setupCompletedAt:at,walkthroughCompleted:true,walkthroughCompletedAt:at},
    cityProgress:{maxLevelIndex:6,experienceVersion:1},tinySwordsIsland:island
  })).envelope
  let revision=1
  let generation=1
  let authenticated=session()
  let reset=null
  let imported=null
  const commits=[]
  const receipts=new Map()
  const requests=[]
  const protectedUntil='2099-10-01T00:00:00.000Z'
  const resetId='523e4567-e89b-42d3-a456-426614174004'
  const identity=()=>({profile_id:profileId,generation,revision})
  await page.addInitScript(({trial,owner,profileId,envelope,authenticated,activationId}) => {
    if(sessionStorage.getItem('owned-trial-installed'))return
    localStorage.setItem(trial,JSON.stringify(envelope.profile))
    localStorage.setItem(trial+'_plus_auth_v1',JSON.stringify(authenticated))
    localStorage.setItem(trial+'_learner_profile_access_v1',JSON.stringify({version:1,ownerId:owner,profileId,generation:1,revision:1,activatedAt:Date.now(),activationId,onboardingFinalizationPending:false}))
    localStorage.setItem(trial+'_learner_profile_sync_v1',JSON.stringify({version:1,ownerId:owner,profileId,generation:1,acceptedRevision:1,pending:null,queued:null}))
    sessionStorage.setItem('owned-trial-installed','1')
  },{trial,owner,profileId,envelope,authenticated:session(),activationId})
  await page.route(origin+'/**',async route => {
    const path=new URL(route.request().url()).pathname
    requests.push(path)
    if(path==='/auth/v1/logout'){await route.fulfill({status:204});return}
    if(path==='/auth/v1/token'){await route.fulfill({json:authenticated});return}
    if(path==='/auth/v1/user'){await route.fulfill({json:authenticated.user});return}
    if(path==='/rest/v1/learner_profile_heads'){await route.fulfill({json:{user_id:authenticated.user.id,...identity()}});return}
    if(path==='/rest/v1/rpc/resolve_my_learner_profile'){await route.fulfill({json:[{status:'profile_ready',created:false,...identity(),envelope}]});return}
    if(path==='/rest/v1/rpc/read_my_latest_learner_profile_reset'){
      await route.fulfill({json:[reset ? {status:reset.status,reset_id:resetId,profile_id:profileId,
        prior_generation:reset.generation,prior_revision:reset.revision,prior_envelope:reset.envelope,
        reset_generation:generation,protected_until:protectedUntil} : {status:'none'}]});return
    }
    if(path==='/rest/v1/rpc/start_over_my_learner_profile'){
      const args=route.request().postDataJSON()
      reset={envelope,generation,revision,status:'available'}
      envelope=args.p_envelope;generation+=1;revision=1
      await route.fulfill({json:[{status:'started_over',...identity(),reset_id:resetId,envelope,protected_until:protectedUntil}]});return
    }
    if(path==='/rest/v1/rpc/undo_my_learner_profile_start_over'){
      envelope=reset.envelope;revision+=1;reset.status='undone'
      await route.fulfill({json:[{status:'undone',...identity(),reset_id:resetId,envelope}]});return
    }
    if(path==='/rest/v1/rpc/import_my_learner_profile'){
      const args=route.request().postDataJSON()
      imported={args,previous:envelope};envelope=args.p_envelope;revision=args.p_base_revision+1
      await route.fulfill({json:[{status:'replaced',...identity(),base_revision:args.p_base_revision,
        payload_sha256:envelope.integrity.payloadSha256,protected_until:protectedUntil}]});return
    }
    if(path==='/rest/v1/rpc/read_my_learner_profile_import_backup'){
      await route.fulfill({json:[{status:'protected',...identity(),base_revision:imported.args.p_base_revision,
        imported_envelope:imported.args.p_envelope,imported_revision:imported.args.p_base_revision+1,
        operation_id:imported.args.p_operation_id,previous_envelope:imported.previous,protected_until:protectedUntil}]});return
    }
    if(path==='/rest/v1/rpc/rollback_my_learner_profile_import'){
      envelope=imported.previous;revision=imported.args.p_base_revision+2
      await route.fulfill({json:[{status:'rolled_back',...identity(),base_revision:imported.args.p_base_revision}]});return
    }
    if(path==='/rest/v1/rpc/commit_my_learner_profile'){
      const args=route.request().postDataJSON();commits.push(args)
      const receipt=receipts.get(args.p_operation_id)
      if(receipt){await route.fulfill({json:[{...receipt,status:'already_accepted'}]});return}
      expect(args.p_base_revision).toBe(revision)
      expect(args.p_generation).toBe(generation)
      envelope=args.p_envelope;revision=args.p_base_revision+1
      const accepted={status:'accepted',...identity(),base_revision:args.p_base_revision,payload_sha256:envelope.integrity.payloadSha256}
      receipts.set(args.p_operation_id,accepted)
      await route.fulfill({json:[accepted]});return
    }
    await route.fulfill({json:[]})
  })
  return {commits,island,requests,
    head:()=>({envelope:structuredClone(envelope),generation,revision}),
    advanceRevision:()=>{revision+=1},
    replaceIdentity:(userId,nextEnvelope)=>{authenticated=session(userId);envelope=nextEnvelope;revision=1;generation=1;return authenticated},
    protectedImport:()=>imported
  }
}

test('automatic Anki refresh preserves unchanged progress and syncs supported new reviews', async ({page}) => {
  await seedRetained(page)
  await page.clock.install({ time: new Date('2026-10-08T12:00:00.000Z') })
  const dateKey='2026-10-08'
  const observedAt='2026-10-08T11:55:00.000Z'
  const mock=await owned(page,{indexedDb:true,engine:false,ankiEnabled:true,anki:{[dateKey]:{
    reviewed:3,created:2,experienceReviews:3,experienceWatermark:3,loggedAt:observedAt
  }}})
  let reviews=3
  let polls=0
  await page.route('http://127.0.0.1:8765/**', async route => {
    polls+=1
    await route.fulfill({json:{result:[
      {result:reviews,error:null},{result:[101,102],error:null},{result:[201],error:null}
    ],error:null}})
  })
  await page.goto('./?internal_test=1')
  await expect(page.locator('#learnerProfileSyncStatus')).toHaveText('Up to date')
  if (!await page.evaluate(()=>isAnkiAvailableOnDevice())) {
    // Touch/phone devices deliberately do not contact desktop AnkiConnect.
    // Their imported Study facts must remain intact even on explicit refresh.
    const unchanged=mock.head()
    await page.evaluate(()=>refreshAnkiStats({silent:true}))
    await page.reload()
    await expect(page.locator('#learnerProfileSyncStatus')).toHaveText('Up to date')
    await page.evaluate(()=>refreshAnkiStats({silent:true}))
    expect(polls).toBe(0)
    expect(mock.commits).toHaveLength(0)
    expect(mock.head()).toEqual(unchanged)
    expect(await page.evaluate(dateKey=>loadState().anki[dateKey].reviewed,dateKey)).toBe(3)
    expect(await retainedBytes(page)).toEqual(retained)
    return
  }
  await expect.poll(()=>polls).toBeGreaterThan(0)
  await page.evaluate(()=>refreshAnkiStats({silent:true}))
  expect(mock.commits).toHaveLength(0)
  mock.advanceRevision()
  await page.evaluate(()=>refreshAnkiStats({silent:true}))
  expect(mock.commits).toHaveLength(0)
  await expect(page.locator('#learnerProfileSyncStatus')).toHaveText('Up to date')
  await page.evaluate(()=>learnerProfileLifecycleAuthority.refresh())
  await expect(page.locator('#learnerProfileSyncStatus')).toHaveText('Up to date')
  expect(mock.head().revision).toBe(2)
  reviews=4
  await page.evaluate(()=>refreshAnkiStats({silent:true}))
  await expect.poll(()=>mock.commits.length).toBe(1)
  await expect(page.locator('#learnerProfileSyncStatus')).toHaveText('Up to date')
  expect(mock.head().envelope.profile.anki[dateKey]).toMatchObject({reviewed:4,created:2,experienceReviews:4})
  const committed=mock.head()
  await page.reload()
  await expect(page.locator('#learnerProfileSyncStatus')).toHaveText('Up to date')
  await page.evaluate(()=>refreshAnkiStats({silent:true}))
  expect(mock.commits).toHaveLength(1)
  expect(mock.head()).toEqual(committed)
  expect(await retainedBytes(page)).toEqual(retained)
})

test('unchanged cached YouTube metadata stays local across an advanced cloud head', async ({page}) => {
  await seedRetained(page)
  const at='2026-10-08T12:00:00.000Z'
  await page.clock.install({time:new Date(at)})
  const id='fixture0001'
  let title='Saved lesson'
  let requests=0
  const video={id,channelId:'manual-youtube',title,channelTitle:'Saved channel',
    thumbnail:'https://i.ytimg.com/fixture.jpg',publishedAt:at,duration:600,aspectRatio:16/9,
    isShort:false,status:'partial',favorite:true,watchLater:true,resumeAtSeconds:42,
    watchProgress:[{seconds:42,watchedAt:at}],watchProgressTracked:true}
  const mock=await owned(page,{indexedDb:true,engine:false,youtubeApiKey:'fixture-key',videos:{[id]:video}})
  await page.route('**/youtube/v3/videos?**', async route=>{
    requests+=1
    await route.fulfill({json:{items:[{id,
      snippet:{title,channelId:'manual-youtube',channelTitle:'Saved channel',publishedAt:at,
        thumbnails:{high:{url:video.thumbnail}}},contentDetails:{duration:'PT10M'},
      player:{embedWidth:'1280',embedHeight:'720'}
    }]}})
  })
  await page.goto('./?internal_test=1')
  await expect(page.locator('#learnerProfileSyncStatus')).toHaveText('Up to date')
  await page.evaluate(()=>maybeRefreshFeed())
  await expect.poll(()=>requests).toBeGreaterThan(0)
  await expect(page.locator('#learnerProfileSyncStatus')).toHaveText('Up to date')
  const openingCommits=mock.commits.length
  const unchanged=mock.head()
  mock.advanceRevision()
  const renew=async()=>page.evaluate(async id=>{
    const state=loadState()
    state.videos[id].metadataFetchedAt=new Date(Date.now()-29.5*86400000).toISOString()
    await saveState(state,{cloud:false})
    await maybeRefreshFeed()
  },id)
  await renew()
  expect(mock.commits).toHaveLength(openingCommits)
  expect(mock.head().envelope).toEqual(unchanged.envelope)
  await expect(page.locator('#learnerProfileSyncStatus')).toHaveText('Up to date')
  await page.evaluate(()=>learnerProfileLifecycleAuthority.refresh())
  await expect(page.locator('#learnerProfileSyncStatus')).toHaveText('Up to date')
  title='Changed lesson'
  await page.clock.setSystemTime(new Date(Date.parse(at)+86400000))
  await renew()
  await expect.poll(()=>mock.commits.length).toBeGreaterThan(openingCommits)
  // Keep wall time and timers aligned while the automatic upload interval elapses.
  await page.clock.fastForward(31_000)
  await expect(page.locator('#learnerProfileSyncStatus')).toHaveText('Up to date')
  expect(mock.head().envelope.profile.videos[id]).toMatchObject({title,favorite:true,watchLater:true,resumeAtSeconds:42})
  expect(mock.head().envelope.profile.tinySwordsIsland).toEqual(unchanged.envelope.profile.tinySwordsIsland)
  await page.reload()
  await expect(page.locator('#learnerProfileSyncStatus')).toHaveText('Up to date')
  expect(await page.evaluate(id=>loadState().videos[id].title,id)).toBe(title)
  expect(await retainedBytes(page)).toEqual(retained)
})

test('disabled fresh trial preserves all namespaces and loads no app, provider, or profile RPC',async ({page})=>{
  await seedRetained(page)
  await page.addInitScript(trial=>localStorage.setItem(trial,'retained-trial-bytes'),trial)
  await configure(page,{enabled:false})
  const forbidden=[]
  page.on('request',r=>{if(/\/(app|production-app)\.js|\/auth\/v1|\/rest\/v1|accounts\.google|challenges\.cloudflare/.test(r.url()))forbidden.push(r.url())})
  await page.goto('./?internal_test=1')
  await expect(page.locator('#authTrialUnavailable')).toBeVisible()
  expect(await retainedBytes(page)).toEqual(retained)
  expect(await page.evaluate(trial=>localStorage.getItem(trial),trial)).toBe('retained-trial-bytes')
  expect(forbidden).toEqual([])
  await page.reload()
  await expect(page.locator('#authTrialUnavailable')).toBeVisible()
  expect(await retainedBytes(page)).toEqual(retained)
})

test('fresh trial pairs mandatory entry and lifecycle without global rollout and preserves mode in navigation',async ({page})=>{
  await seedRetained(page);await configure(page)
  await page.goto('./?internal_test=1')
  await expect(page.locator('#introTrailer')).toBeVisible()
  expect(await page.evaluate(()=>({accounts:ACCOUNT_FEATURES_ENABLED,lifecycle:LEARNER_PROFILE_LIFECYCLE_ENABLED,required:ACCOUNT_ENTRY_REQUIRED,migration:LEGACY_PROGRESS_MIGRATION_ENABLED}))).toEqual({accounts:true,lifecycle:true,required:true,migration:false})
  await page.locator('#introTrailer').getByRole('button',{name:'Continue',exact:true}).click()
  await page.locator('[data-language-id="other"]').click()
  await page.locator('[data-personalized-onboarding-action="continue-language"]').click()
  await page.locator('[data-personalized-onboarding-step="account"]').click()
  await expect(page.locator('#onboardingAccountEmail')).toBeVisible()
  await expect(page.locator('[data-personalized-onboarding-action="finish"]')).toHaveCount(0)
  await expect(page.locator('#mainApp')).toBeHidden()
  await expect(page.locator('.tiny-swords-frame')).toHaveCount(0)
  expect(new URL(page.url()).searchParams.get('internal_test')).toBe('1')
  expect(await retainedBytes(page)).toEqual(retained)
  expect(await page.evaluate(trial=>localStorage.getItem(trial),trial)).toBeNull()
  await page.goto(new URL('plus/?internal_test=1',page.url()).href)
  await expect(page).toHaveURL(/\/\?internal_test=1$/)
  expect(await retainedBytes(page)).toEqual(retained)
})

for(const indexedDb of [false,true]) {
  test(`owned trial saves/reloads and locks without reading other modes (${indexedDb?'IndexedDB':'localStorage'})`,async ({page})=>{
    test.setTimeout(180000)
    await seedRetained(page)
    const {commits}=await owned(page,{indexedDb,engine:process.env.EDENIA_TEST_TINY_SWORDS==='true'})
    await page.goto('./?internal_test=1')
    await expect(page.locator('#mainApp')).toBeVisible()
    if(process.env.EDENIA_TEST_TINY_SWORDS==='true') {
      await expect(page.locator('#tinySwordsSurface')).toHaveAttribute('data-game-state','ready',{timeout:60000})
      await page.evaluate(async ()=> {
        const state=loadState(),at=new Date().toISOString()
        state.videos.lesson={id:'lesson',title:'Trial XP',duration:25200,status:'partial',watchProgress:[{watchedAt:at,seconds:25200,experienceSeconds:25200}]}
        await saveState(state)
        await renderAll(state)
      })
      await expect(page.locator('#levelUpButton')).toBeEnabled()
      expect(await page.evaluate(()=>claimCityLevelUp())).toBe(true)
      await expect.poll(()=>page.frameLocator('.tiny-swords-frame').locator('#canvas').evaluate(()=>window.edeniaGameLevel)).toBe(8)
      await expect.poll(()=>commits.some(c=>c.p_envelope.profile.cityProgress.maxLevelIndex===7),{timeout:40000}).toBe(true)
    }
    await page.evaluate(async ()=>{const state=loadState();state.config.weeklyGoalHours=9;await saveState(state)})
    await expect.poll(()=>commits.some(c=>c.p_envelope.profile.config.weeklyGoalHours===9),{timeout:40000}).toBe(true)
    expect(await retainedBytes(page)).toEqual(retained)
    await page.reload()
    await expect(page.locator('#mainApp')).toBeVisible()
    expect(await page.evaluate(()=>loadState().config.weeklyGoalHours)).toBe(9)
    if(process.env.EDENIA_TEST_TINY_SWORDS==='true') {
      await expect(page.locator('#tinySwordsSurface')).toHaveAttribute('data-game-state','ready',{timeout:60000})
      await expect.poll(()=>page.frameLocator('.tiny-swords-frame').locator('#canvas').evaluate(()=>window.edeniaGameLevel)).toBe(8)
      await page.evaluate(()=>{window.trialRetiredFrame=document.querySelector('.tiny-swords-frame').contentWindow})
    }
    if(indexedDb){
      const names=await page.evaluate(async ()=>(await indexedDB.databases()).map(d=>d.name))
      expect(names).toContain(trial+'_profiles_indexed_db_v1')
      expect(names).toContain('edenia_state_backups_v1_auth_trial_v1')
    }
    await page.evaluate(()=>signOutPlusAccount())
    await expect(page.locator('#mainApp')).toBeHidden()
    await expect(page.locator('.tiny-swords-frame')).toHaveCount(0)
    const commitCount=commits.length
    await page.evaluate(() => {
      if (!window.trialRetiredFrame) return
      const event = new MessageEvent('message', {
        origin: location.origin,
        data: { type: 'edenia-tiny-layout', session: 1, id: 99,
          layout: { version: 23, resources: { wood: 999 } } }
      })
      // WebKit rejects a detached WindowProxy in the constructor's WebIDL
      // conversion. Preserve that exact retired source for the receiver check.
      Object.defineProperty(event, 'source', { value: window.trialRetiredFrame })
      window.dispatchEvent(event)
    })
    expect(commits.length).toBe(commitCount)
    expect(await retainedBytes(page)).toEqual(retained)
    const raw=await page.evaluate(trial=>localStorage.getItem(trial+'_learner_profile_access_v1'),trial)
    await page.unroute('**/config.local.js*');await configure(page,{enabled:false,indexedDb})
    await page.reload();await expect(page.locator('#authTrialUnavailable')).toBeVisible()
    expect(await page.evaluate(trial=>localStorage.getItem(trial+'_learner_profile_access_v1'),trial)).toBe(raw)
    expect(await retainedBytes(page)).toEqual(retained)
  })
}


for (const everywhere of [false, true]) {
  test(`expired trial session logout stays locked through Auth outage and reload (${everywhere ? 'global' : 'local'})`, async ({ page, pageDiagnostics }) => {
    test.setTimeout(120000)
    await seedRetained(page)
    const engine = process.env.EDENIA_TEST_TINY_SWORDS === 'true'
    const { commits } = await owned(page, { indexedDb: true, engine })
    await page.goto('./?internal_test=1')
    await expect(page.locator('#mainApp')).toBeVisible()
    if (engine) await expect(page.locator('#tinySwordsSurface')).toHaveAttribute('data-game-state', 'ready', { timeout: 60000 })
    await page.route(origin + '/auth/v1/token*', route => route.fulfill({
      status: 503, json: { msg: 'temporary Auth outage' }
    }))
    await page.evaluate(trial => {
      const key = trial + '_plus_auth_v1'
      const auth = JSON.parse(localStorage.getItem(key))
      auth.expires_at = Math.floor(Date.now() / 1000) - 1
      localStorage.setItem(key, JSON.stringify(auth))
    }, trial)
    await page.evaluate(everywhere => everywhere ? signOutAccountEverywhere() : signOutAccount(), everywhere)
    await expect(page.locator('#mainApp')).toBeHidden()
    await expect(page.locator('.tiny-swords-frame')).toHaveCount(0)
    await expect(page.locator('#toast')).toHaveText('Edenia could not sign out. Please try again.')
    expect(await page.evaluate(trial => localStorage.getItem(trial + '_plus_auth_v1'), trial)).toBeNull()
    const count = commits.length
    await page.reload()
    await expect(page.locator('#mainApp')).toBeHidden()
    await expect(page.locator('#learnerProfileAccessGate')).toBeVisible()
    await expect(page.locator('.tiny-swords-frame')).toHaveCount(0)
    expect(commits.length).toBe(count)
    expect(await retainedBytes(page)).toEqual(retained)
    expect(pageDiagnostics.length).toBeGreaterThan(0)
    expect(pageDiagnostics.every(message => message === 'console: Failed to load resource: the server responded with a status of 503 (Service Unavailable)')).toBe(true)
    pageDiagnostics.length = 0
  })
}

for (const locale of ['en','fr','es','zh-Hant','zh-Hans']) {
  test(`trial pause and mandatory account surfaces are readable in ${locale}`, async ({page},testInfo) => {
    await page.addInitScript(locale=>Object.defineProperty(navigator,'language',{get:()=>locale}),locale)
    await configure(page,{enabled:false})
    await page.goto('./?internal_test=1')
    await expect(page.locator('#authTrialUnavailable h1')).not.toHaveText('authTrial.unavailable.title')
    await expect(page.locator('html')).toHaveAttribute('lang',locale)
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true)
    await page.unroute('**/config.local.js*');await configure(page)
    await page.reload()
    await expect(page.locator('#introTrailer')).toBeVisible()
    await page.evaluate(async ()=>finishIntroTrailer())
    await page.locator('[data-language-id="other"]').click()
    await page.locator('[data-personalized-onboarding-action="continue-language"]').click()
    await page.locator('[data-personalized-onboarding-step="account"]').click()
    await expect(page.locator('#onboardingAccountEmail')).toBeVisible()
    await page.locator('#onboardingAccountEmail').focus()
    await expect(page.locator('#onboardingAccountEmail')).toBeFocused()
    if(locale==='zh-Hant')await page.screenshot({path:testInfo.outputPath('trial-account.png')})
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true)
    await expect(page.locator('.tiny-swords-frame')).toHaveCount(0)
  })
}

test('trial flag cannot activate accounts or provider scripts in normal and mode 2',async ({page})=>{
  await configure(page)
  const forbidden=[]
  page.on('request',r=>{if(/\/auth\/v1|\/rest\/v1|accounts\.google|challenges\.cloudflare/.test(r.url()))forbidden.push(r.url())})
  for(const route of ['./','./?internal_test=2']) {
    await page.goto(route)
    await expect(page.locator('#introTrailer')).toBeVisible()
    expect(await page.evaluate(()=>ACCOUNT_FEATURES_ENABLED)).toBe(false)
    expect(await page.evaluate(()=>LEARNER_PROFILE_LIFECYCLE_ENABLED)).toBe(false)
  }
  expect(forbidden).toEqual([])
})


const retainedDatabases = [
  ['edenia_v1_profiles_indexed_db_v1','profiles'],
  ['edenia_v1_internal_test_2_profiles_indexed_db_v1','profiles'],
  ['edenia_v1_internal_test_profiles_indexed_db_v1','profiles'],
  ['edenia_state_backups_v1','backups'],
  ['edenia_state_backups_v1_internal_test_2','backups']
]
async function databaseBytes(page, definitions) {
  return page.evaluate(async definitions => {
    const output={}
    for(const [name,store]of definitions) {
      const db=await new Promise((resolve,reject)=>{const r=indexedDB.open(name);r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error)})
      output[name]=await new Promise((resolve,reject)=>{const r=db.transaction(store).objectStore(store).getAll();r.onsuccess=()=>resolve(JSON.stringify(r.result));r.onerror=()=>reject(r.error)})
      db.close()
    }
    return output
  },definitions)
}

test('trial lifecycle and pause preserve exact primary/backups bytes in other IndexedDB namespaces',async ({page})=>{
  await seedRetained(page);await configure(page,{enabled:false})
  await page.goto('./?internal_test=1')
  await expect(page.locator('#authTrialUnavailable')).toBeVisible()
  await page.evaluate(async definitions=>{
    for(const[name,store]of definitions){
      const db=await new Promise((resolve,reject)=>{const r=indexedDB.open(name,1);r.onupgradeneeded=()=>r.result.createObjectStore(store);r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error)})
      await new Promise((resolve,reject)=>{const tx=db.transaction(store,'readwrite');tx.objectStore(store).put({raw:'retained bytes for '+name},'active');tx.oncomplete=resolve;tx.onabort=()=>reject(tx.error)})
      db.close()
    }
  },retainedDatabases)
  const before=await databaseBytes(page,retainedDatabases)
  await page.unroute('**/config.local.js*')
  const {commits}=await owned(page,{indexedDb:true,engine:false})
  await page.reload();await expect(page.locator('#mainApp')).toBeVisible()
  await page.evaluate(async ()=>{const state=loadState();state.config.weeklyGoalHours=8;await saveState(state)})
  await expect.poll(()=>commits.some(c=>c.p_envelope.profile.config.weeklyGoalHours===8)).toBe(true)
  expect(await databaseBytes(page,retainedDatabases)).toEqual(before)
  await page.evaluate(()=>signOutPlusAccount());await expect(page.locator('#mainApp')).toBeHidden()
  const ownDatabases=[[trial+'_profiles_indexed_db_v1','profiles'],['edenia_state_backups_v1_auth_trial_v1','backups']]
  const ownBefore=await databaseBytes(page,ownDatabases)
  await page.unroute('**/config.local.js*');await configure(page,{enabled:false,indexedDb:true})
  await page.reload();await expect(page.locator('#authTrialUnavailable')).toBeVisible()
  expect(await databaseBytes(page,ownDatabases)).toEqual(ownBefore)
  expect(await databaseBytes(page,retainedDatabases)).toEqual(before)
  expect(await retainedBytes(page)).toEqual(retained)
})

test('backend admission denial keeps a cached owned island hidden and performs no commits',async ({page,pageDiagnostics})=>{
  const {commits}=await owned(page,{indexedDb:true,engine:true})
  await page.route(origin+'/rest/v1/rpc/resolve_my_learner_profile',route=>route.fulfill({status:403,json:{code:'42501',message:'Learner profile tester access disabled'}}))
  await page.goto('./?internal_test=1')
  await expect(page.locator('#learnerProfileAccessGate')).toBeVisible()
  await expect(page.locator('#mainApp')).toBeHidden()
  await expect(page.locator('.tiny-swords-frame')).toHaveCount(0)
  expect(commits).toEqual([])
  const expectedDenial='console: Failed to load resource: the server responded with a status of 403 (Forbidden)'
  await expect.poll(()=>pageDiagnostics).toEqual([expectedDenial])
  pageDiagnostics.splice(0,1)
})

async function readyGame(page) {
  await expect(page.locator('#mainApp')).toBeVisible()
  await expect(page.locator('#tinySwordsSurface')).toHaveAttribute('data-game-state','ready',{timeout:60000})
}
async function retainFrame(page) {
  await page.evaluate(()=>{window.previousTrialFrame=document.querySelector('.tiny-swords-frame');window.previousTrialWindow=window.previousTrialFrame.contentWindow})
}
async function expectNewFrame(page) {
  await expect.poll(()=>page.evaluate(()=>window.previousTrialFrame.isConnected)).toBe(false)
  await readyGame(page)
  expect(await page.evaluate(()=>document.querySelector('.tiny-swords-frame').contentWindow===window.previousTrialWindow)).toBe(false)
}

for(const indexedDb of [false,true]) {
  test(`protected island import, reset and Undo restore through the trial lifecycle (${indexedDb?'IndexedDB':'localStorage'})`,async ({page},testInfo)=>{
    test.skip(!desktopTrialProjects.has(testInfo.project.name))
    test.skip(process.env.EDENIA_TEST_TINY_SWORDS!=='true')
    test.setTimeout(180000)
    await seedRetained(page)
    const fixture=await owned(page,{indexedDb,engine:true})
    await page.goto('./?internal_test=1')
    await readyGame(page)
    await expect(page.locator('#learnerProfileSyncStatus')).toHaveText('Up to date',{timeout:40000})
    await expect.poll(()=>fixture.commits.length).toBeGreaterThan(0)
    await expect(page.locator('#learnerProfileSyncStatus')).toHaveText('Up to date',{timeout:40000})
    const before=fixture.head().envelope
    const importedState=structuredClone(before.profile)
    importedState.tinySwordsIsland.resources.wood+=17
    importedState.config.weeklyGoalHours=13
    const imported=(await createPortableLearnerProfileEnvelope(importedState)).envelope
    await retainFrame(page)
    await page.locator('.gear-btn').click()
    const chooserPromise=page.waitForEvent('filechooser')
    await page.locator('[data-settings-sync-action="choose-file"]').click()
    await (await chooserPromise).setFiles({name:'mode-2-island.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(imported))})
    await expect(page.locator('#syncImportConfirm')).toBeVisible()
    expect(fixture.protectedImport()).toBeNull()
    await page.locator('[data-settings-sync-action="confirm-import"]').click()
    await expectNewFrame(page)
    expect(fixture.protectedImport().previous.profile).toEqual(before.profile)
    expect(await page.frameLocator('.tiny-swords-frame').locator('#canvas').evaluate(()=>window.edeniaStudyLayout)).toEqual(imported.profile.tinySwordsIsland)
    expect(await page.evaluate(()=>loadState().config.weeklyGoalHours)).toBe(13)
    await expect(page.locator('#learnerProfileSyncStatus')).toHaveText('Up to date',{timeout:40000})
    expect(await page.evaluate(key=>localStorage.getItem(key+'_learner_profile_sync_v1_import_v1'),trial)).toBeNull()
    const beforeReset=fixture.head().envelope.profile.tinySwordsIsland
    await retainFrame(page)
    await page.evaluate(()=>resetApp())
    await expect.poll(()=>page.evaluate(()=>learnerProfileLifecycleAuthority.getState().protectedReset?.status)).toBe('available')
    expect(fixture.head().generation).toBe(2)
    await expectNewFrame(page)
    await expect.poll(()=>page.frameLocator('.tiny-swords-frame').locator('#canvas').evaluate(()=>window.edeniaGameLevel)).toBe(1)
    await expect(page.locator('#learnerProfileSyncStatus')).toHaveText('Up to date',{timeout:40000})
    await retainFrame(page)
    // The reset keeps its protected copy available; Undo must remount the exact
    // chosen island through Godot, even though the profile identity is unchanged.
    await page.evaluate(()=>undoStartOver())
    await expectNewFrame(page)
    expect(fixture.head().generation).toBe(2)
    expect(await page.frameLocator('.tiny-swords-frame').locator('#canvas').evaluate(()=>window.edeniaStudyLayout)).toEqual(beforeReset)
    expect(await page.evaluate(()=>loadState().config.weeklyGoalHours)).toBe(13)
    await page.reload()
    await readyGame(page)
    expect(await page.evaluate(()=>loadState().tinySwordsIsland.resources.wood)).toBe(beforeReset.resources.wood)
    expect(await retainedBytes(page)).toEqual(retained)
  })
}

test('retired trial save completion stays quiet while an active storage failure remains visible',async ({page},testInfo)=>{
  test.skip(!desktopTrialProjects.has(testInfo.project.name))
  await seedRetained(page)
  const fixture=await owned(page,{indexedDb:true,engine:false})
  await page.goto('./?internal_test=1')
  await expect(page.locator('#mainApp')).toBeVisible()
  await expect(page.locator('#learnerProfileSyncStatus')).toHaveText('Up to date')
  const before=await page.evaluate(()=>loadState().config.weeklyGoalHours)
  await page.evaluate(()=>{
    const repository=primaryProfileRepository
    const originalSave=repository.save
    repository.save=(state,options)=>{
      repository.save=originalSave
      return new Promise(resolve=>{
        window.finishRetiredSave=()=>resolve(originalSave(state,options))
      })
    }
    const state=loadState();state.config.weeklyGoalHours=19
    window.retiredSave=saveState(state)
  })
  await expect.poll(()=>page.evaluate(()=>typeof window.finishRetiredSave)).toBe('function')
  await page.evaluate(()=>signOutAccount())
  await expect(page.locator('#mainApp')).toBeHidden()
  expect(await page.evaluate(async ()=>{window.finishRetiredSave();return await window.retiredSave})).toBe(false)
  expect(await page.getByText('Could not save this change. Your existing progress was not changed.',{exact:true}).count()).toBe(0)
  expect(fixture.commits.some(commit=>commit.p_envelope.profile.config.weeklyGoalHours===19)).toBe(false)
  expect(await retainedBytes(page)).toEqual(retained)
  await page.evaluate(async authenticated=>{await getSupabaseClient().auth.setSession(authenticated)},session())
  await expect(page.locator('#mainApp')).toBeVisible()
  await expect(page.locator('#learnerProfileSyncStatus')).toHaveText('Up to date')
  expect(await page.evaluate(()=>loadState().config.weeklyGoalHours)).toBe(before)
  expect(await page.evaluate(async ()=>{
    const repository=primaryProfileRepository,originalSave=repository.save
    repository.save=async ()=>false
    const state=loadState();state.config.weeklyGoalHours=21
    const result=await saveState(state)
    repository.save=originalSave
    return result
  })).toBe(false)
  await expect(page.getByText('Could not save this change. Your existing progress was not changed.',{exact:true})).toBeVisible()
  expect(await page.evaluate(()=>loadState().config.weeklyGoalHours)).toBe(before)
  expect(fixture.commits.some(commit=>[19,21].includes(commit.p_envelope.profile.config.weeklyGoalHours))).toBe(false)
  expect(await retainedBytes(page)).toEqual(retained)
})

test('offline verified trial retains study changes until reconnect, then definitive session rejection retires Godot',async ({page,pageDiagnostics},testInfo)=>{
  test.skip(!desktopTrialProjects.has(testInfo.project.name))
  test.skip(process.env.EDENIA_TEST_TINY_SWORDS!=='true')
  test.setTimeout(90000)
  await seedRetained(page)
  await page.addInitScript(()=>{window.trialOnline=sessionStorage.getItem("trial-offline")!=="1";Object.defineProperty(navigator,'onLine',{configurable:true,get:()=>window.trialOnline})})
  const fixture=await owned(page,{indexedDb:true,engine:true})
  await page.goto('./?internal_test=1')
  await readyGame(page)
  await expect.poll(()=>fixture.commits.length).toBeGreaterThan(0)
  await expect(page.locator('#learnerProfileSyncStatus')).toHaveText('Up to date')
  const commitCount=fixture.commits.length
  await page.evaluate(async trial=>{
    const key=trial+'_learner_profile_owner_verification_v1'
    const verification=JSON.parse(localStorage.getItem(key));verification.verifiedAt-=29*86400000
    localStorage.setItem(key,JSON.stringify(verification))
    window.trialOnline=false;sessionStorage.setItem('trial-offline','1');window.dispatchEvent(new Event('offline'))
    const state=loadState();state.config.weeklyGoalHours=11;await saveState(state)
  },trial)
  expect(fixture.commits.length).toBe(commitCount)
  await page.reload()
  // The runtime override survives reload independently of browser asset fetches.
  // These checks cover unavailable profile transport, not offline asset delivery.
  await readyGame(page)
  expect(await page.evaluate(()=>loadState().config.weeklyGoalHours)).toBe(11)
  expect(fixture.commits.length).toBe(commitCount)
  await page.evaluate(()=>{window.trialOnline=true;sessionStorage.removeItem('trial-offline');window.dispatchEvent(new Event('online'))})
  await expect.poll(()=>fixture.commits.some(c=>c.p_envelope.profile.config.weeklyGoalHours===11)).toBe(true)
  await readyGame(page)
  let rejectedRefreshes=0
  await page.route(origin+'/auth/v1/token*',route=>{rejectedRefreshes+=1;return route.fulfill({status:400,json:{code:'refresh_token_not_found',msg:'Synthetic revoked session'}})})
  await retainFrame(page)
  await page.evaluate(()=>{window.dispatchEvent(new Event('offline'));window.dispatchEvent(new Event('online'));window.dispatchEvent(new Event('focus'));window.dispatchEvent(new Event('focus'))})
  await expect(page.locator('#mainApp')).toBeHidden()
  await expect(page.locator('.tiny-swords-frame')).toHaveCount(0)
  expect(await page.evaluate(key=>localStorage.getItem(key+'_learner_profile_owner_verification_v1'),trial)).toBeNull()
  const count=fixture.commits.length
  expect(await page.evaluate(()=>claimCityLevelUp())).toBeFalsy()
  expect(fixture.commits.length).toBe(count)
  expect(await retainedBytes(page)).toEqual(retained)
  await expect.poll(()=>pageDiagnostics).toEqual(['console: Failed to load resource: the server responded with a status of 400 (Bad Request)'])
  pageDiagnostics.splice(0,1)
  expect(rejectedRefreshes).toBe(1)
  expect(await page.evaluate(key=>localStorage.getItem(key+'_plus_auth_v1'),trial)).toBeNull()
  await page.reload()
  await expect(page.locator('#mainApp')).toBeHidden()
  await expect(page.locator('#learnerProfileAccessGate')).toBeVisible()
  await expect(page.locator('.tiny-swords-frame')).toHaveCount(0)
  expect(fixture.commits.length).toBe(count)
})

test('expired offline ownership keeps the cached trial island hidden and prevents cloud writes',async ({page},testInfo)=>{
  test.skip(!desktopTrialProjects.has(testInfo.project.name))
  const fixture=await owned(page,{indexedDb:true,engine:true})
  await page.addInitScript(({trial,owner})=>{
    Object.defineProperty(navigator,'onLine',{configurable:true,get:()=>false})
    localStorage.setItem(trial+'_learner_profile_owner_verification_v1',JSON.stringify({ownerId:owner,verifiedAt:Date.now()-31*86400000}))
  },{trial,owner})
  // Prevent a synthetic server success from renewing the deliberately expired
  // verification; no real network or provider session participates in this case.
  await page.route(origin+'/rest/v1/rpc/**',route=>route.fulfill({json:[]}))
  await page.goto('./?internal_test=1')
  await expect(page.locator('#mainApp')).toBeHidden()
  await expect(page.locator('#learnerProfileAccessGate')).toBeVisible()
  await expect(page.locator('.tiny-swords-frame')).toHaveCount(0)
  expect(fixture.commits).toEqual([])
})

test('switching verified trial owners requires explicit replacement and remounts identical island bytes',async ({page},testInfo)=>{
  test.skip(!desktopTrialProjects.has(testInfo.project.name))
  test.skip(process.env.EDENIA_TEST_TINY_SWORDS!=='true')
  test.setTimeout(90000)
  await seedRetained(page)
  const fixture=await owned(page,{indexedDb:true,engine:true})
  await page.goto('./?internal_test=1')
  await readyGame(page)
  await expect(page.locator('#learnerProfileSyncStatus')).toHaveText('Up to date')
  const previous=await page.evaluate(()=>JSON.stringify(loadState()))
  const nextOwner='923e4567-e89b-42d3-a456-426614174009'
  const nextState=structuredClone(fixture.head().envelope.profile)
  nextState.config.weeklyGoalHours=17
  const nextEnvelope=(await createPortableLearnerProfileEnvelope(nextState)).envelope
  const nextSession=fixture.replaceIdentity(nextOwner,nextEnvelope)
  await retainFrame(page)
  await page.evaluate(async session=>{await getSupabaseClient().auth.setSession(session)},nextSession)
  await expect(page.locator('html')).toHaveAttribute('data-learner-profile-access-state','account-change')
  await expect(page.locator('#mainApp')).toBeHidden()
  await expect(page.locator('.tiny-swords-frame')).toHaveCount(0)
  expect(await page.evaluate(()=>JSON.stringify(learnerProfileLocalPersistence.read().profile))).toBe(previous)
  expect(await page.evaluate(()=>window.previousTrialFrame.isConnected)).toBe(false)
  await Promise.all([page.waitForEvent('domcontentloaded'),page.getByRole('button',{name:'Continue with this account'}).click()])
  await readyGame(page)
  expect(await page.evaluate(()=>loadState().config.weeklyGoalHours)).toBe(17)
  expect(await page.evaluate(()=>learnerProfileLifecycleAuthority.getState().ownerId)).toBe(nextOwner)
  expect(await page.frameLocator('.tiny-swords-frame').locator('#canvas').evaluate(()=>window.edeniaStudyLayout)).toEqual(nextEnvelope.profile.tinySwordsIsland)
  expect(await retainedBytes(page)).toEqual(retained)
})


test('signed-in animal checkpoints stay local and the next gameplay save uploads their whole island', async ({ page }, testInfo) => {
  test.skip(!desktopTrialProjects.has(testInfo.project.name))
  test.skip(process.env.EDENIA_TEST_TINY_SWORDS !== 'true')
  test.setTimeout(120000)
  await seedRetained(page)
  const fixture = await owned(page, { indexedDb: true, engine: true })
  await page.goto('./?internal_test=1')
  await readyGame(page)
  await expect(page.locator('#learnerProfileSyncStatus')).toHaveText('Up to date',{timeout:40000})
  const canvas = page.frameLocator('.tiny-swords-frame').locator('#canvas')
  await page.evaluate(() => {
    const frame = document.querySelector('.tiny-swords-frame')
    frame.contentWindow.postMessage({ type: 'edenia-host-visibility',
      session: frame.contentWindow.edeniaStudySession, visible: false }, location.origin)
  })
  await expect.poll(() => canvas.evaluate(() => window.edeniaHostVisible)).toBe(false)
  await expect.poll(() => canvas.evaluate(() => window.edeniaSaveInFlight)).toBeNull()
  const before = fixture.head()
  const commitCount = fixture.commits.length
  await retainFrame(page)
  let releaseHead
  const headBarrier = new Promise(resolve => { releaseHead = resolve })
  let checks = 0
  await page.route(origin + '/rest/v1/learner_profile_heads?**', async route => {
    checks += 1
    await headBarrier
    const head = fixture.head()
    await route.fulfill({ json: { user_id: owner, profile_id: profileId,
      generation: head.generation, revision: head.revision } })
  })
  const openingCount = fixture.requests.filter(path => path.endsWith('/resolve_my_learner_profile')).length
  await page.evaluate(() => window.dispatchEvent(new Event('focus')))
  await expect.poll(() => checks).toBe(1)
  await expect(page.locator('#learnerProfileSyncStatus')).toHaveText('Checking progress…')
  await expect(page.locator('#mainApp')).toBeVisible()
  const moved = structuredClone(await page.evaluate(() => loadState().tinySwordsIsland))
  // Use another already valid ground position; Godot still owns restore validity.
  moved.chickens[0] = [544, 272]
  await canvas.evaluate((_, layout) => window.edeniaQueueLayout(layout, true), moved)
  await expect.poll(() => canvas.evaluate(() => window.edeniaSaveInFlight)).toBeNull()
  expect(await canvas.evaluate(() => window.edeniaLastSavePersisted)).toBe(true)
  expect(await page.evaluate(() => loadPersistedState({ persistCleanup: false }).tinySwordsIsland)).toEqual(moved)
  expect(fixture.commits.length).toBe(commitCount)
  expect(fixture.head().revision).toBe(before.revision)
  const sync = await page.evaluate(key => JSON.parse(localStorage.getItem(key + '_learner_profile_sync_v1')), trial)
  expect(sync.pending).toBeNull()
  expect(sync.queued).toBeNull()
  const checkpointMarker = await page.evaluate(key => JSON.parse(localStorage.getItem(key + '_learner_profile_sync_v1_local_island_checkpoint')), trial)
  expect(checkpointMarker).toMatchObject({ version: 1, revision: before.revision })
  releaseHead()
  await expect(page.locator('#learnerProfileSyncStatus')).toHaveText('Up to date',{timeout:40000})
  expect(await page.evaluate(() => document.querySelector('.tiny-swords-frame') === window.previousTrialFrame
    && window.previousTrialFrame.contentWindow === window.previousTrialWindow)).toBe(true)
  expect(fixture.requests.filter(path => path.endsWith('/resolve_my_learner_profile')).length).toBe(openingCount)
  await page.evaluate(() => learnerProfileLifecycleAuthority.refresh())
  await readyGame(page)
  await expect(page.locator('#learnerProfileSyncStatus')).toHaveText('Up to date',{timeout:40000})
  expect(fixture.head().revision).toBe(before.revision)
  expect(await canvas.evaluate(() => window.edeniaStudyLayout)).toEqual(moved)
  await page.evaluate(() => {
    const frame = document.querySelector('.tiny-swords-frame')
    frame.contentWindow.postMessage({ type: 'edenia-host-visibility',
      session: frame.contentWindow.edeniaStudySession, visible: false }, location.origin)
  })
  await expect.poll(() => canvas.evaluate(() => window.edeniaHostVisible)).toBe(false)
  await expect.poll(() => canvas.evaluate(() => window.edeniaSaveInFlight)).toBeNull()
  const latestMoved = await page.evaluate(() => loadState().tinySwordsIsland)
  const downloadPromise = page.waitForEvent('download')
  await page.evaluate(() => learnerProfileLifecycleAuthority.exportActiveProfile())
  const exported = JSON.parse(await readFile(await (await downloadPromise).path(), 'utf8'))
  expect(exported.profile.tinySwordsIsland).toEqual(latestMoved)
  Object.assign(moved, latestMoved)
  moved.resources.wood += 1
  await canvas.evaluate((_, layout) => window.edeniaQueueLayout(layout), moved)
  await expect.poll(() => fixture.commits.some(commit =>
    commit.p_envelope.profile.tinySwordsIsland.resources.wood === moved.resources.wood),{timeout:40000}).toBe(true)
  await expect(page.locator('#learnerProfileSyncStatus')).toHaveText('Up to date',{timeout:40000})
  expect(fixture.head().envelope.profile.tinySwordsIsland).toEqual(moved)
  await page.reload()
  await readyGame(page)
  await expect(page.locator('#learnerProfileSyncStatus')).toHaveText('Up to date',{timeout:40000})
  expect(await page.evaluate(() => loadState().tinySwordsIsland.resources.wood)).toBe(moved.resources.wood)
  expect(await retainedBytes(page)).toEqual(retained)
})

test('a large already-accepted request reopens under origin storage pressure without duplicating its profile', async ({ page }) => {
  test.setTimeout(90000)
  await seedRetained(page)
  const videos = Object.fromEntries(Array.from({ length: 1600 }, (_, i) => [String(i), {
    id: String(i), title: 'a'.repeat(300), duration: 60, favorite: true, status: 'unwatched'
  }]))
  const fixture = await owned(page, { indexedDb: true, engine: false, videos })
  await page.goto('./?internal_test=1')
  await expect.poll(() => page.evaluate(() => loadPersistedState({ persistCleanup: false }).cityProgress.scoringVersion === SCORING_RULES_VERSION)).toBe(true)
  await expect(page.locator('#learnerProfileSyncStatus')).toHaveText('Up to date', { timeout: 15000 })
  await expect.poll(async () => {
    const current = await page.evaluate(() => preparePortableLearnerProfileEnvelope(loadPersistedState({ persistCleanup: false })).profile)
    return JSON.stringify(current) === JSON.stringify(fixture.head().envelope.profile)
  }).toBe(true)
  const before = fixture.head()
  fixture.advanceRevision()
  const operationId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
  let replays = 0
  await page.route(origin + '/rest/v1/rpc/commit_my_learner_profile', async route => {
    const args = route.request().postDataJSON()
    expect(args.p_operation_id).toBe(operationId)
    expect(args.p_base_revision).toBe(before.revision)
    expect(args.p_envelope).toEqual(before.envelope)
    replays += 1
    await route.fulfill({ json: [{ status: 'already_accepted', profile_id: profileId,
      generation: before.generation, base_revision: before.revision, revision: before.revision + 1,
      payload_sha256: before.envelope.integrity.payloadSha256 }] })
  })
  const seeded = await page.evaluate(({ trial, owner, profileId, before, operationId }) => {
    const current = preparePortableLearnerProfileEnvelope(loadPersistedState({ persistCleanup: false })).profile
    if (JSON.stringify(current) !== JSON.stringify(before.envelope.profile)) throw new Error('Opening must finish before pressure is seeded')
    const operation = { activationId: 'retained-before-reload', baseRevision: before.revision,
      envelope: before.envelope, generation: before.generation, integrity: before.envelope.integrity,
      nextRetryAt: 0, operationId, ownerId: owner, prepared: null, profileId,
      retryCount: 0, revision: before.revision + 1 }
    localStorage.setItem(trial + '_learner_profile_sync_v1', JSON.stringify({ version: 1, ownerId: owner,
      profileId, generation: before.generation, acceptedRevision: before.revision, pending: operation, queued: null }))
    localStorage.setItem(trial + '_learner_profile_sync_v1_dirty', JSON.stringify({ version: 1,
      ownerId: owner, profileId, generation: before.generation }))
    const paddingKey = 'synthetic-origin-pressure'
    let padding = ''
    let exhausted = false
    for (let i = 0; i < 400; i += 1) {
      try { localStorage.setItem(paddingKey, padding + 'x'.repeat(32768)); padding += 'x'.repeat(32768) }
      catch (error) { if (error.name !== 'QuotaExceededError') throw error; exhausted = true; break }
    }
    if (!exhausted || padding.length < 65536) throw new Error('Origin quota was not reached')
    padding = padding.slice(0, -65536)
    localStorage.setItem(paddingKey, padding)
    return { exhausted, paddingCharacters: padding.length, videos: Object.keys(current.videos).length }
  }, { trial, owner, profileId, before, operationId })
  expect(seeded.exhausted).toBe(true)
  expect(seeded.videos).toBe(1600)
  await page.reload()
  await expect(page.locator('#learnerProfileSyncStatus')).toHaveText('Up to date', { timeout: 15000 })
  const recovered = await page.evaluate(trial => {
    const k = trial + '_learner_profile_sync_v1'
    const m = JSON.parse(localStorage.getItem(k))
    return { profile: preparePortableLearnerProfileEnvelope(loadPersistedState({ persistCleanup: false })).profile,
      acceptedRevision: m.acceptedRevision, pending: m.pending, queued: m.queued,
      dirty: localStorage.getItem(k + '_dirty'), paddingCharacters: localStorage.getItem('synthetic-origin-pressure').length }
  }, trial)
  expect(recovered.profile).toEqual(before.envelope.profile)
  expect(recovered).toMatchObject({ acceptedRevision: before.revision + 1, pending: null,
    queued: null, dirty: null, paddingCharacters: seeded.paddingCharacters })
  expect(replays).toBe(1)
  expect(fixture.head()).toEqual({ ...before, revision: before.revision + 1 })
  await page.reload()
  await expect(page.locator('#learnerProfileSyncStatus')).toHaveText('Up to date', { timeout: 15000 })
  expect(replays).toBe(1)
  expect(await retainedBytes(page)).toEqual(retained)
})

for (const indexedDb of [false, true]) {
  test(`owned trial restores after an abrupt browser exit (${indexedDb ? 'IndexedDB' : 'localStorage'})`, async ({ page }) => {
    test.setTimeout(90000)
    await seedRetained(page)
    const engine = process.env.EDENIA_TEST_TINY_SWORDS === 'true'
    await owned(page, { indexedDb, engine, activationId: 'closed-window-activation',
      anki: { '2026-10-08': { reviewed: 3, experienceReviews: 3, experienceWatermark: 3 } } })
    await page.goto('./?internal_test=1')
    await expect(page.locator('#mainApp')).toBeVisible()
    await expect(page.locator('#learnerProfileSyncStatus')).toHaveText('Up to date')
    expect(await page.evaluate(trial => {
      const access = JSON.parse(localStorage.getItem(trial + '_learner_profile_access_v1'))
      return { retired: access.activationId !== 'closed-window-activation',
        reviews: loadState().anki['2026-10-08'].reviewed }
    }, trial)).toEqual({ retired: true, reviews: 3 })
    if (engine) await expect(page.locator('#tinySwordsSurface')).toHaveAttribute('data-game-state', 'ready', { timeout: 60000 })
    expect(await retainedBytes(page)).toEqual(retained)
    await page.reload()
    await expect(page.locator('#mainApp')).toBeVisible()
    await expect(page.locator('#learnerProfileSyncStatus')).toHaveText('Up to date')
    expect(await page.evaluate(() => loadState().anki['2026-10-08'].reviewed)).toBe(3)
    expect(await retainedBytes(page)).toEqual(retained)
  })
}

test('a changed background head waits for a pending IndexedDB checkpoint at the interaction boundary', async ({ page }, testInfo) => {
  test.skip(!['desktop-standard', 'phone-small'].includes(testInfo.project.name))
  test.setTimeout(60000)
  const fixture = await owned(page, { indexedDb: true, engine: false })
  await page.goto('./?internal_test=1')
  await expect(page.locator('#mainApp')).toBeVisible()
  await expect(page.locator('#learnerProfileSyncStatus')).toHaveText('Up to date')
  let reads = 0
  await page.route(origin + '/rest/v1/learner_profile_heads?**', route => {
    const head = fixture.head()
    reads += 1
    return route.fulfill({ json: { user_id: owner, profile_id: profileId, generation: head.generation,
      revision: head.revision + (reads === 1 ? 1 : 0) } })
  })
  await page.evaluate(() => {
    window.boundarySafe = false
    window.boundaryMain = document.getElementById('mainApp')
    window.boundaryCheck = learnerProfileLifecycleAuthority.reverify({ canApplyRemote: () => window.boundarySafe })
  })
  await expect.poll(() => reads).toBe(1)
  await page.evaluate(() => {
    const repository = primaryProfileRepository
    const originalSave = repository.save
    const pending = new Promise(resolve => { window.finishBoundarySave = resolve })
    repository.save = async (state, options) => {
      repository.save = originalSave
      await pending
      return originalSave(state, options)
    }
    const state = loadState()
    state.tinySwordsIsland.chickens[0] = [544, 272]
    window.boundaryIsland = structuredClone(state.tinySwordsIsland)
    window.boundarySave = saveState(state, { syncCloud: false, localIslandCheckpoint: true,
      syncAnalytics: false, backup: false })
    window.boundarySafe = true
  })
  await page.waitForTimeout(1500)
  expect(reads).toBe(1)
  expect(await page.evaluate(() => document.getElementById('mainApp') === window.boundaryMain)).toBe(true)
  await page.evaluate(() => window.finishBoundarySave())
  expect(await page.evaluate(() => window.boundarySave)).toBe(true)
  await expect.poll(() => reads).toBe(2)
  await expect(page.locator('#learnerProfileSyncStatus')).toHaveText('Up to date')
  expect(await page.evaluate(() => document.getElementById('mainApp') === window.boundaryMain)).toBe(true)
  const island = await page.evaluate(() => window.boundaryIsland)
  expect(await page.evaluate(() => loadPersistedState({ persistCleanup: false }).tinySwordsIsland)).toEqual(island)
  await page.reload()
  await expect(page.locator('#mainApp')).toBeVisible()
  expect(await page.evaluate(() => loadState().tinySwordsIsland)).toEqual(island)
})
