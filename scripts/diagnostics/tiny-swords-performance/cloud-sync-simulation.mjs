// Local full-application fixture. Only Supabase transport/server receipts are
// simulated; the production auth, sync adapter, serialization and IDB paths run.
import { createPortableLearnerProfileEnvelope } from '../../../src/state/portable-learner-profile.js'
import { canonicalizeJson, sha256Base64UrlSync } from '../../../src/state/portable-state.js'

export async function installCloudSyncSimulation(page, profile) {
  const origin = 'https://tiny-swords-sync-fixture.supabase.co'
  const owner = '123e4567-e89b-42d3-a456-426614174000'
  const profileId = '223e4567-e89b-42d3-a456-426614174001'
  const key = 'edenia_v1_auth_trial_v1'
  const encode = value => Buffer.from(JSON.stringify(value)).toString('base64url')
  const session = {access_token:`${encode({alg:'HS256',typ:'JWT'})}.${encode({aud:'authenticated',role:'authenticated',sub:owner,exp:1893456000})}.fixture`,
    refresh_token:'simulation-refresh',expires_at:1893456000,expires_in:31536000,token_type:'bearer',
    user:{id:owner,email:'fps@example.test',aud:'authenticated',role:'authenticated',app_metadata:{provider:'email',providers:['email']},user_metadata:{},identities:[]}}
  let envelope = (await createPortableLearnerProfileEnvelope(profile)).envelope
  let revision = 1
  const receipts = new Map(), requests = []
  await page.route('**/config.local.js*', route => route.fulfill({contentType:'text/javascript',body:`window.EDENIA_CONFIG=${JSON.stringify({
    youtubeApiKey:'local-simulation-only',authTrialEnabled:true,accountFeaturesRollout:'off',learnerProfileLifecycleEnabled:false,
    emergencyAccountlessRollbackEnabled:true,tinySwordsEnabled:true,tinySwordsPublicEnabled:false,
    indexedDbProfileEnabled:true,indexedDbBackupsEnabled:true,indexedDbBackupCleanupEnabled:true,
    googleSignInMode:'off',supabaseUrl:origin,supabasePublishableKey:'simulation-key'
  })}`}))
  await page.evaluate(({key,envelope,session,owner,profileId}) => {
    localStorage.setItem(key,JSON.stringify(envelope.profile))
    localStorage.setItem(key+'_plus_auth_v1',JSON.stringify(session))
    localStorage.setItem(key+'_learner_profile_access_v1',JSON.stringify({version:1,ownerId:owner,profileId,generation:1,revision:1,activatedAt:Date.now(),activationId:null,onboardingFinalizationPending:false}))
    localStorage.setItem(key+'_learner_profile_sync_v1',JSON.stringify({version:1,ownerId:owner,profileId,generation:1,acceptedRevision:1,pending:null,queued:null}))
  },{key,envelope,session,owner,profileId})
  await page.route(origin+'/**',async route => {
    const request = route.request(), path = new URL(request.url()).pathname
    const headers = {'access-control-allow-origin':'*','access-control-allow-methods':'GET,POST,OPTIONS',
      'access-control-allow-headers':'authorization,apikey,x-client-info,content-type'}
    if(request.method()==='OPTIONS') { await route.fulfill({status:204,headers}); return }
    const startEpochMs = Date.now(), requestBytes = Buffer.byteLength(request.postData() || '')
    let response
    const identity = () => ({profile_id:profileId,generation:1,revision})
    if(path==='/auth/v1/user') response=session.user
    else if(path==='/auth/v1/token') response=session
    else if(path==='/rest/v1/reminder_preferences') response=[]
    else if(path==='/rest/v1/rpc/sync_my_reminder_eligibility_snapshot') response=true
    else if(path==='/rest/v1/learner_profile_heads') response={user_id:owner,...identity()}
    else if(path==='/rest/v1/rpc/resolve_my_learner_profile') response=[{status:'profile_ready',created:false,...identity(),envelope}]
    else if(['/rest/v1/rpc/commit_my_learner_profile','/rest/v1/rpc/commit_my_learner_profile_handoff'].includes(path)) {
      const args=request.postDataJSON()
      if(receipts.has(args.p_operation_id)) response=[{...receipts.get(args.p_operation_id),status:'already_accepted'}]
      else {
        if(args.p_base_revision!==revision || args.p_generation!==1 || args.p_profile_id!==profileId) throw Error('Simulation received an invalid predecessor')
        envelope=args.p_envelope;revision++
        const receipt={status:'accepted',...identity(),base_revision:args.p_base_revision,payload_sha256:envelope.integrity.payloadSha256,
          request_sha256:sha256Base64UrlSync(canonicalizeJson({baseRevision:args.p_base_revision,envelope:args.p_envelope,generation:1,operationId:args.p_operation_id,ownerId:owner,profileId}))}
        receipts.set(args.p_operation_id,receipt);response=[receipt]
      }
    } else if(path==='/rest/v1/rpc/read_my_learner_profile_write_receipt') {
      const receipt=receipts.get(request.postDataJSON().p_operation_id)
      response=[receipt?{...receipt,status:'already_accepted'}:{status:'not_accepted'}]
    } else if(path==='/rest/v1/rpc/read_my_latest_learner_profile_reset') response=[{status:'none'}]
    else if (path.startsWith('/rest/v1/') && !path.includes('learner_profile')) response=[] // Empty unrelated account preferences/Free-plan fixtures.
    else throw Error('Unexpected simulated profile request: '+path)
    const body=JSON.stringify(response), responseBytes=Buffer.byteLength(body)
    // Declared carrier-like assumptions, not measurements of Brice's connection.
    const delayMs=500+1000*(requestBytes/125000+responseBytes/250000)
    await new Promise(resolve=>setTimeout(resolve,delayMs))
    await route.fulfill({status:200,headers,contentType:'application/json',body})
    requests.push({path,startEpochMs,endEpochMs:Date.now(),requestBytes,responseBytes,delayMs,revision})
  })
  return {getEvidence:()=>({simulated:true,realCloudWrites:false,transport:{latencyMs:500,uploadMbps:1,downloadMbps:2},
    revision,commits:receipts.size,requests})}
}
