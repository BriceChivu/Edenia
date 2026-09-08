import { mkdir, mkdtemp, readFile, writeFile, rm, lstat, readlink } from 'node:fs/promises'
import { spawn, execFileSync } from 'node:child_process'
import { X509Certificate, createHash } from 'node:crypto'
import { join } from 'node:path'
import http from 'node:http'
import https from 'node:https'
import { nativeDocumentSequenceScript, nativeDocumentSequenceComplete, stopOwnedNativeBrowser, cleanupNativeDocumentFixture } from './native-document-sequence.mjs'
import { createNativeOpeningAuthenticationProxy } from '../../scripts/native-opening-auth-proxy.mjs'
if (process.argv[2] !== '--prepare-local') throw Error('Explicit --prepare-local required')
const output = new URL('../../.cache/issue-315-native/', import.meta.url).pathname
await mkdir(output,{recursive:true,mode:0o700})
const root = await mkdtemp(join(output,'automatic-attempt-'))
const privateRoot = join(root, 'private'), profile = join(privateRoot, 'profile')
const origins = ['https://app.document-test.invalid', 'https://provider.document-test.invalid', 'https://challenge.document-test.invalid']
const owner = '11111111-1111-1111-1111-111111111111'
let chrome, chromeExited = true, proxy, upstream, prep, stopping = false, resetArmed = false
const sockets = new Set(), events = []
const result = { runnerSha256: createHash('sha256').update(await readFile(new URL(import.meta.url))).digest('hex'), proxySha256: createHash('sha256').update(await readFile(new URL('../../scripts/native-opening-auth-proxy.mjs',import.meta.url))).digest('hex'), sequenceSha256: createHash('sha256').update(nativeDocumentSequenceScript).digest('hex'), nativeChrome: true, localOnly: true, documentRequests: 0, renderedReports: 0, injectedResets: 0, cleanupVerified: false }
const pause = ms => new Promise(r => setTimeout(r, ms))
const exists = async path => { try { await lstat(path); return true } catch (e) { if (e.code === 'ENOENT') return false; throw e } }
const wait = async (predicate, ms, cleanup = false) => { const deadline = Date.now()+ms; while (!await predicate()) { if ((!cleanup && stopping) || Date.now()>deadline) throw Error('Bounded fixture wait ended'); await pause(100) } }
const record = async stage => { events.push({stage, utc:new Date().toISOString()}); await writeFile(join(root,'status.json'),JSON.stringify({stage,...result,diagnostic:proxy?.stats.diagnostic}),{mode:0o600}); console.log(JSON.stringify({ stage, attemptDirectory: root })) }
const listen = async server => { server.on('connection', s=>{sockets.add(s);s.once('close',()=>sockets.delete(s))}); await new Promise((r,j)=>{server.once('error',j);server.listen(0,'127.0.0.1',r)}); return server.address().port }
const launch = async (url, port) => {
 chromeExited=false
 chrome=spawn('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',['--user-data-dir='+profile,'--no-first-run','--no-default-browser-check','--proxy-server=http://127.0.0.1:'+port,'--proxy-bypass-list=<-loopback>','--disable-quic','--webrtc-ip-handling-policy=disable_non_proxied_udp',url],{stdio:'ignore'})
 chrome.once('exit',()=>{chromeExited=true});chrome.once('error',()=>{chromeExited=true})
 await wait(async()=>{try{return Number((await readlink(join(profile,'SingletonLock'))).split('-').at(-1))===chrome.pid}catch{return false}},10000)
}
const stopChrome = () => stopOwnedNativeBrowser(chrome,()=>chromeExited,ms=>wait(()=>chromeExited,ms,true))
process.on('SIGTERM',()=>{stopping=true});process.on('SIGINT',()=>{stopping=true})
try {
 await mkdir(privateRoot,{mode:0o700}); await mkdir(profile,{mode:0o700})
 const materials={}
 for(const origin of [...origins,'https://localhost']){
  const host=new URL(origin).hostname, certFile=join(root,host+'.crt'),keyFile=join(privateRoot,host+'.key')
  execFileSync('openssl',['req','-x509','-newkey','rsa:2048','-nodes','-keyout',keyFile,'-out',certFile,'-days','1','-subj','/CN='+host,'-addext','basicConstraints=critical,CA:FALSE','-addext','subjectAltName=DNS:'+host,'-addext','keyUsage=critical,digitalSignature,keyEncipherment','-addext','extendedKeyUsage=serverAuth'],{stdio:'ignore'})
  const cert=await readFile(certFile),key=await readFile(keyFile);materials[origin]={cert,key,sha256:createHash('sha256').update(new X509Certificate(cert).raw).digest('hex')}
 }
 result.leafSha256=materials[origins[0]].sha256
 prep=http.createServer((req,res)=>{ if(req.method==='GET' && req.url==='http://127.0.0.1:'+prep.address().port+'/'){res.setHeader('content-type','text/html');res.end('<title>Issue 315 disposable local test</title><h1>Issue 315: disposable local Chrome</h1><p>Fake site only. No account or sign-in.</p>')}else{res.writeHead(403);res.end('Local fixture only')} })
 prep.on('connect',(_req,socket)=>socket.destroy())
 const prepPort=await listen(prep)
 await launch('http://127.0.0.1:'+prepPort+'/',prepPort)
 await record('local-profile-awaiting-test-leaf')
 await wait(()=>exists(join(root,'start')),900000)
 await stopChrome()
 upstream=https.createServer(materials['https://localhost'],async(req,res)=>{
  if(req.headers.host!==new URL(origins[0]).hostname){res.writeHead(403);res.end();return}
  if(req.url==='/?internal_test=1'){
   result.documentRequests++
   if(resetArmed){result.injectedResets++;res.destroy();await record('injected-upstream-reset');return}
   res.setHeader('content-type','text/html');res.end('<!doctype html><meta charset="utf-8"><title>Issue 315 local page loaded</title><style>body{font:24px system-ui;background:#effbf2;color:#153d23;padding:60px}h1{font-size:40px}</style><h1>Local page loaded successfully</h1><p id="status">Checking page script…</p><script>'+nativeDocumentSequenceScript+'</script>');return
  }
  if(req.url==='/fixture/rendered'){result.renderedReports++;resetArmed=true;res.end('reset-armed');await record('local-page-script-ran');return}
  res.writeHead(204);res.end()
 })
 const upstreamPort=await listen(upstream)
 proxy=await createNativeOpeningAuthenticationProxy({applicationOrigin:origins[0],providerOrigin:origins[1],localChallengeOrigin:origins[2],expectedOwner:owner,expectedEmail:'approved@example.invalid',certificates:materials,localTestUpstreams:Object.fromEntries(origins.map(o=>[o,{hostname:'127.0.0.1',port:upstreamPort,servername:'localhost',ca:materials['https://localhost'].cert}])),authorize:async()=>!stopping,deadlineMs:300000,onProgress:diagnostic=>{result.diagnostic={...diagnostic,browserStarted:result.browserStarted===true}}})
 await launch(origins[0]+'/?internal_test=1',proxy.port)
 result.browserStarted=true
 result.diagnostic={...proxy.stats.diagnostic,browserStarted:true}
 await record('guarded-native-browser-started')
 await wait(()=>result.injectedResets === 1 && proxy.stats.diagnostic.failure === 'upstream-reset',60000)
 await record('automatic-local-sequence-verified')
} catch { result.fixtureIncomplete=true }
finally {
 proxy?.seal()
 result.cleanupVerified=await cleanupNativeDocumentFixture({
  stopBrowser:stopChrome,
  closeTransport:async()=>{
   const closures=[]
   for(const socket of sockets)socket.destroy()
   closures.push(Promise.resolve().then(()=>proxy?.close()))
   for(const server of [upstream,prep])if(server)closures.push(new Promise((resolve,reject)=>server.close(error=>error && error.code!=='ERR_SERVER_NOT_RUNNING'?reject(error):resolve())))
   const outcomes=await Promise.allSettled(closures)
   if(outcomes.some(outcome=>outcome.status==='rejected'))throw Error('Transport cleanup unverified')
  },
  removePrivate:async()=>{await rm(privateRoot,{recursive:true,force:true});if(await exists(privateRoot))throw Error('Private directory remains')}
 })
 result.events=events
 result.complete = nativeDocumentSequenceComplete(result)
 await writeFile(join(root,'result.json'),JSON.stringify(result,null,2),{mode:0o600})
 console.log(JSON.stringify(result))
 if(!result.complete) process.exitCode=1
}
