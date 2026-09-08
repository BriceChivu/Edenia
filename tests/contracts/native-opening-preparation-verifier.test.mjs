import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, mkdir, writeFile, readFile, rm, symlink, chmod } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { execFileSync } from 'node:child_process'
import { createHash, X509Certificate } from 'node:crypto'
import { createNativePreparationVerifier, hashNativePreparationProfile, nativePreparationSources } from '../../scripts/native-opening-preparation-verifier.mjs'
const hash = value => createHash('sha256').update(value).digest('hex')
async function fixture(t) {
  const root=await mkdtemp(join(tmpdir(),'native-verifier-'));t.after(()=>rm(root,{recursive:true,force:true}))
  const profileDirectory=join(root,'profile');await mkdir(profileDirectory);await writeFile(join(profileDirectory,'Preferences'),'synthetic stopped preparation')
  const chrome={version:'1.2.3.4',executable:join(root,'chrome'),framework:join(root,'framework')}
  await writeFile(chrome.executable,'synthetic executable');await writeFile(chrome.framework,'synthetic framework')
  const certificates=[]
  for(const origin of ['https://app.example.invalid','https://provider.example.invalid','https://challenges.cloudflare.com']) {
    const host=new URL(origin).hostname,certificateFile=join(root,host+'.crt'),keyFile=join(root,host+'.key')
    execFileSync('openssl',['req','-x509','-newkey','rsa:2048','-nodes','-keyout',keyFile,'-out',certificateFile,'-days','1','-subj','/CN='+host,'-addext','basicConstraints=critical,CA:FALSE','-addext','subjectAltName=DNS:'+host,'-addext','keyUsage=critical,digitalSignature,keyEncipherment','-addext','extendedKeyUsage=serverAuth'],{stdio:'ignore'})
    await chmod(keyFile,0o600)
    certificates.push({origin,certificateFile,keyFile,sha256:hash(new X509Certificate(await readFile(certificateFile)).raw)})
  }
  const manifest={profileDirectory,certificates},manifestSha256=hash(JSON.stringify(manifest)),candidate='a'.repeat(40),reviewed='b'.repeat(40),invocation='synthetic-invocation',now=Date.now()
  const sources={};for(const name of nativePreparationSources)sources[name]=hash(await readFile(new URL('../../scripts/'+name,import.meta.url)))
  const evidence={}
  for(const [name,value] of Object.entries({
    trust:'reviewed local isolation evidence',transport:'reviewed positive transport controls',review:'synthetic independent approval',
    egress:JSON.stringify({sourceKind:'native-local-egress',complete:true,cleanupVerified:true,hostedUpstreamRequests:0,directControlCompleted:true,beforeReport:{ok:true,checks:18},afterReport:{ok:true,attempts:20,failedProbes:20},crashCounts:Object.fromEntries(['turnTcp','turnTls','directTls','forwarded','udp','forbidden'].map(k=>[k,0]))}),
    preparation:JSON.stringify({procedure:'native-real-origin-preparation-v1',startedEmpty:true,hostedRequests:0,browserStopped:true,cleanupRequired:true,profileDirectory,manifestSha256,chromeVersion:chrome.version,acceptedLeaves:certificates.map(c=>({origin:c.origin,sha256:c.sha256,connections:1}))})
  })) {const file=join(root,name+'.json');await writeFile(file,value);evidence[name]={file,sha256:hash(value)}}
  const cleanupRunbookSha256=hash(await readFile(new URL('../../docs/runbooks/native-opening-authentication.md',import.meta.url)))
  const record={cleanupRunbookSha256,procedure:'reviewed-native-preparation-v1',candidate,reviewed,invocation,manifestSha256,createdUtc:new Date(now-1000).toISOString(),expiresUtc:new Date(now+600000).toISOString(),review:{approved:true,sha256:evidence.review.sha256},cleanupOwner:'packet-1-coordinator',recoveryProcedure:'native-opening-authentication.md#cleanup-and-recovery',sources,chrome:{version:chrome.version,executableSha256:hash(await readFile(chrome.executable)),frameworkSha256:hash(await readFile(chrome.framework))},evidence,profileSha256:await hashNativePreparationProfile(profileDirectory)}
  const acceptanceFile=join(root,'acceptance.json')
  async function verifier() {const bytes=JSON.stringify(record);await writeFile(acceptanceFile,bytes);return createNativePreparationVerifier({acceptanceFile,acceptanceSha256:hash(bytes),manifestSha256,candidate,reviewed,invocation},{now:()=>now,readChromeIdentity:()=>chrome})}
  return {root,record,manifest,chrome,verifier}
}
test('reviewed pinned preparation verifies actual sources, profile and leaf key pairs',async t=>{
 const f=await fixture(t);assert.equal(await (await f.verifier())(f.manifest),true)
})
for(const change of ['runner','runbook','source','candidate','invocation','expired','browser','profile','evidence','key-pair','leaf-result','unapproved'])test('preparation rejects changed '+change,async t=>{
 const f=await fixture(t)
 if(change==='runner')f.record.reviewed='c'.repeat(40)
 if(change==='runbook')f.record.cleanupRunbookSha256='0'.repeat(64)
 if(change==='source')f.record.sources['native-opening-auth-worker.mjs']='0'.repeat(64)
 if(change==='candidate')f.record.candidate='b'.repeat(40)
 if(change==='invocation')f.record.invocation='different'
 if(change==='expired')f.record.expiresUtc=f.record.createdUtc
 if(change==='browser')await writeFile(f.chrome.framework,'changed')
 if(change==='profile')await writeFile(join(f.manifest.profileDirectory,'Preferences'),'changed')
 if(change==='evidence')await writeFile(f.record.evidence.egress.file,'changed')
 if(change==='key-pair')f.manifest.certificates[0].keyFile=f.manifest.certificates[1].keyFile
 if(change==='leaf-result'){
  const p=f.record.evidence.preparation,value=JSON.parse(await readFile(p.file));value.acceptedLeaves[0].connections=0
  const bytes=JSON.stringify(value);await writeFile(p.file,bytes);p.sha256=hash(bytes)
 }
 if(change==='unapproved')f.record.review.approved=false
 await assert.rejects((await f.verifier())(f.manifest))
})
test('missing acceptance and symlinked profile cannot authorize a worker',async t=>{
 await assert.rejects(createNativePreparationVerifier({})({}))
 const root=await mkdtemp(join(tmpdir(),'native-profile-link-'));t.after(()=>rm(root,{recursive:true,force:true}))
 await writeFile(join(root,'file'),'synthetic');await symlink(join(root,'file'),join(root,'link'))
 await assert.rejects(hashNativePreparationProfile(root))
})
