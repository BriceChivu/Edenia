import { readFile } from 'node:fs/promises'
import { expect, test } from '../support/network-fixture.mjs'
import { createPortableLearnerProfileEnvelope } from '../../src/state/portable-learner-profile.js'

const trial = 'edenia_v1_auth_trial_v1'
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
async function configure(page, { enabled = true, indexedDb = false, engine = false } = {}) {
  await page.route('**/config.local.js*', route => route.fulfill({contentType:'text/javascript',body:`window.EDENIA_CONFIG=${JSON.stringify({
    authTrialEnabled: enabled, accountFeaturesRollout:'off',learnerProfileLifecycleEnabled:false,
    emergencyAccountlessRollbackEnabled:true,legacyProgressMigrationEnabled:true,
    tinySwordsEnabled:engine,tinySwordsPublicEnabled:false,indexedDbProfileEnabled:indexedDb,indexedDbBackupsEnabled:indexedDb,
    googleSignInMode:'off',supabaseUrl:origin,supabasePublishableKey:'test-key'
  })}`}))
}
function session() {
  const encode = value => Buffer.from(JSON.stringify(value)).toString('base64url')
  return {access_token:`${encode({alg:'HS256',typ:'JWT'})}.${encode({aud:'authenticated',role:'authenticated',sub:owner,exp:1893456000})}.fixture`,
    refresh_token:'trial-refresh',expires_at:1893456000,expires_in:31536000,token_type:'bearer',
    user:{id:owner,email:'trial@example.test',aud:'authenticated',role:'authenticated',app_metadata:{provider:'email',providers:['email']},user_metadata:{},identities:[]}}
}
async function owned(page,{indexedDb,engine}) {
  await configure(page,{indexedDb,engine})
  const island = JSON.parse(await readFile(new URL('../fixtures/tiny-swords-populated-island.json',import.meta.url)))
  const at='2026-10-08T00:00:00.000Z'
  let envelope=(await createPortableLearnerProfileEnvelope({
    config:{locale:'en',ankiEnabled:false,channels:[],weeklyGoalHours:4},anki:{},videos:{},
    learnerProfile:{languages:['french'],level:'beginner',createdAt:at,updatedAt:at},
    onboarding:{introSeenAt:at,setupCompleted:true,setupCompletedAt:at,walkthroughCompleted:true,walkthroughCompletedAt:at},
    cityProgress:{maxLevelIndex:6,experienceVersion:1},tinySwordsIsland:island
  })).envelope
  let revision=1
  const commits=[]
  await page.addInitScript(({trial,owner,profileId,envelope,authenticated}) => {
    if(sessionStorage.getItem('owned-trial-installed'))return
    localStorage.setItem(trial,JSON.stringify(envelope.profile))
    localStorage.setItem(trial+'_plus_auth_v1',JSON.stringify(authenticated))
    localStorage.setItem(trial+'_learner_profile_access_v1',JSON.stringify({version:1,ownerId:owner,profileId,generation:1,revision:1,activatedAt:Date.now(),activationId:null,onboardingFinalizationPending:false}))
    localStorage.setItem(trial+'_learner_profile_sync_v1',JSON.stringify({version:1,ownerId:owner,profileId,generation:1,acceptedRevision:1,pending:null,queued:null}))
    sessionStorage.setItem('owned-trial-installed','1')
  },{trial,owner,profileId,envelope,authenticated:session()})
  await page.route(origin+'/**',async route => {
    const path=new URL(route.request().url()).pathname
    if(path==='/auth/v1/logout'){await route.fulfill({status:204});return}
    if(path==='/auth/v1/token'){await route.fulfill({json:session()});return}
    if(path==='/rest/v1/rpc/resolve_my_learner_profile'){await route.fulfill({json:[{status:'profile_ready',created:false,profile_id:profileId,generation:1,revision,envelope}]});return}
    if(path==='/rest/v1/rpc/read_my_latest_learner_profile_reset'){await route.fulfill({json:[{status:'none'}]});return}
    if(path==='/rest/v1/rpc/commit_my_learner_profile'){
      const args=route.request().postDataJSON();commits.push(args);envelope=args.p_envelope;revision=args.p_base_revision+1
      await route.fulfill({json:[{status:'accepted',profile_id:profileId,generation:1,revision,base_revision:args.p_base_revision,payload_sha256:envelope.integrity.payloadSha256}]});return
    }
    await route.fulfill({json:[]})
  })
  return {commits,island}
}

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
  await page.getByRole('button',{name:'Skip intro'}).click()
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
    test.setTimeout(90000)
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
      await expect.poll(()=>commits.some(c=>c.p_envelope.profile.cityProgress.maxLevelIndex===7)).toBe(true)
    }
    await page.evaluate(async ()=>{const state=loadState();state.config.weeklyGoalHours=9;await saveState(state)})
    await expect.poll(()=>commits.some(c=>c.p_envelope.profile.config.weeklyGoalHours===9)).toBe(true)
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
    await page.evaluate(()=>{if(window.trialRetiredFrame)window.dispatchEvent(new MessageEvent('message',{origin:location.origin,source:window.trialRetiredFrame,data:{type:'edenia-tiny-layout',session:1,id:99,layout:{version:23,resources:{wood:999}}}}))})
    expect(commits.length).toBe(commitCount)
    expect(await retainedBytes(page)).toEqual(retained)
    const raw=await page.evaluate(trial=>localStorage.getItem(trial+'_learner_profile_access_v1'),trial)
    await page.unroute('**/config.local.js*');await configure(page,{enabled:false,indexedDb})
    await page.reload();await expect(page.locator('#authTrialUnavailable')).toBeVisible()
    expect(await page.evaluate(trial=>localStorage.getItem(trial+'_learner_profile_access_v1'),trial)).toBe(raw)
    expect(await retainedBytes(page)).toEqual(retained)
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
