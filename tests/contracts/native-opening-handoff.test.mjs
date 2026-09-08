import test from 'node:test'
import assert from 'node:assert/strict'
import { fork, execFileSync } from 'node:child_process'
import { mkdtemp, mkdir, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { once } from 'node:events'
import { X509Certificate, createHash } from 'node:crypto'
import http from 'node:http'
import https from 'node:https'
import tls from 'node:tls'
import { CanaryExecutionStore } from '../../scripts/canary-execution-store.mjs'
import { prepareNativeOpeningAuthentication } from '../../scripts/native-opening-authentication.mjs'
import { access, writeFile, chmod } from 'node:fs/promises'

for (const wrongOwner of [false, true]) test(`real IPC worker ${wrongOwner ? 'rejects a mismatched fresh owner' : 'hands off only after cleanup and exit'}`, { timeout: 10000 }, async t => {
  const root = await mkdtemp(join(tmpdir(), 'native-ipc-regression-'))
  t.after(() => rm(root, { recursive: true, force: true }))
  const origins = ['https://app.native-test.invalid', 'https://provider.native-test.invalid', 'https://challenges.cloudflare.com']
  const certificates = [], materials = {}
  for (const origin of [...origins, 'https://localhost']) {
    const hostname = new URL(origin).hostname, certificateFile = join(root, hostname + '.crt'), keyFile = join(root, hostname + '.key')
    execFileSync('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-keyout', keyFile, '-out', certificateFile, '-days', '1', '-subj', '/CN=' + hostname,
      '-addext', 'basicConstraints=critical,CA:FALSE', '-addext', 'subjectAltName=DNS:' + hostname, '-addext', 'keyUsage=critical,digitalSignature,keyEncipherment', '-addext', 'extendedKeyUsage=serverAuth'], { stdio: 'ignore' })
    const cert = await readFile(certificateFile), key = await readFile(keyFile), sha256 = createHash('sha256').update(new X509Certificate(cert).raw).digest('hex')
    await chmod(keyFile, 0o600)
    materials[origin] = { cert, key }; certificates.push({ origin, certificateFile, keyFile, sha256 })
  }
  const observed = [], owner = '11111111-1111-1111-1111-111111111111'
  const ownerArrived = Promise.withResolvers(), releaseOwner = Promise.withResolvers()
  const upstream = https.createServer(materials['https://localhost'], async (req, res) => {
    for await (const part of req) { /* synthetic body is not retained */ }
    observed.push(req.url)
    if(req.url === '/auth/v1/verify') res.end(JSON.stringify({access_token:'synthetic-access',refresh_token:'synthetic-refresh',expires_in:3600,user:{id:owner}}))
    else if(req.url === '/auth/v1/user') { ownerArrived.resolve(); await releaseOwner.promise; res.end(JSON.stringify({id:wrongOwner ? '22222222-2222-2222-2222-222222222222' : owner})) }
    else res.end('{}')
  })
  await new Promise(resolve => upstream.listen(0, '127.0.0.1', resolve))
  t.after(() => new Promise(resolve => { upstream.closeAllConnections(); upstream.close(resolve) }))
  await mkdir(join(root, '.cache/canary-execution'), {recursive:true})
  const storePath = join(root, '.cache/canary-execution/packet-1.sqlite'), store = new CanaryExecutionStore(storePath), candidate = 'a'.repeat(40), executor = 'fixture'
  store.initialize({ candidate, gate: 'off', phase: 'delivered' }); store.acquire(executor, Date.now(), 30000)
  t.after(() => store.close())
  const profileDirectory = join(root, 'profile'); await mkdir(profileDirectory)
  const manifest = JSON.stringify({profileDirectory,candidate,procedure:'native-opening-authentication-v1',authenticationMethod:'email-code',profileContainsOnlyReviewedPreparation:true,certificates:certificates.slice(0,3)})
  const manifestFile=join(root,'manifest.json'); await writeFile(manifestFile,manifest)
  let worker, port, resolved=false
  const ready=Promise.withResolvers()
  const result=prepareNativeOpeningAuthentication({applicationOrigin:origins[0],providerOrigin:origins[1],expectedOwner:owner,expectedEmail:'approved@example.invalid',verifyGateOff:async()=>{},verifyPreparation:async()=>true,onReady:()=>ready.resolve(),timeoutMs:5000,
    native:{preparationRoot:root,manifestFile,manifestSha256:createHash('sha256').update(manifest).digest('hex')},lease:{workdir:root,candidate,executor}}, {
    fork:()=>{
      worker=fork(new URL('../fixtures/native-opening-worker.mjs',import.meta.url),[],{stdio:['ignore','ignore','ignore','ipc']})
      worker.on('message',message=>{if(message.type==='test-proxy')port=message.port})
      const send=worker.send.bind(worker)
      worker.send=message=>{
        if(message.type==='start')message.config.localTestUpstreams=Object.fromEntries(origins.map(origin=>[origin,{hostname:'127.0.0.1',port:upstream.address().port,servername:'localhost',ca:materials['https://localhost'].cert.toString('utf8')}]))
        return send(message)
      }
      return worker
    }
  })
  void result.then(()=>{resolved=true},()=>{})
  t.after(async()=>{if(worker.exitCode===null&&worker.signalCode===null){const exited=once(worker,'exit');worker.kill('SIGTERM');await exited}})
  await ready.promise
  const requestThroughProxy = (path, body) => new Promise(resolve => {
    const hostname = new URL(origins[1]).hostname
    const request = http.request({ hostname: '127.0.0.1', port, method: 'CONNECT', path: hostname + ':443', headers: { host: hostname + ':443' } })
    request.on('connect', (_response, socket) => {
      const stream = tls.connect({ socket, servername: hostname, ca: materials[origins[1]].cert }, () => stream.write('POST '+path+' HTTP/1.1\r\nHost: ' + hostname + '\r\nSec-Fetch-Dest: empty\r\nApikey: synthetic-key\r\nContent-Length: '+Buffer.byteLength(body)+'\r\nConnection: close\r\n\r\n'+body))
      let responseBody = ''; stream.on('data', part => { responseBody += part }); stream.on('close', () => resolve(responseBody)); stream.on('error', () => resolve(responseBody))
    })
    request.on('error', () => resolve('')); request.end()
  })
  const email='approved@example.invalid'
  assert.match(await requestThroughProxy('/auth/v1/otp',JSON.stringify({email,data:{edenia_auth_locale:'en'},create_user:true,gotrue_meta_security:{},code_challenge:null,code_challenge_method:null})),/200 OK/)
  const verification=requestThroughProxy('/auth/v1/verify',JSON.stringify({email,token:'123456',type:'email',gotrue_meta_security:{}}))
  await ownerArrived.promise
  assert.equal(resolved,false)
  await access(profileDirectory)
  releaseOwner.resolve()
  await verification
  if (wrongOwner) await assert.rejects(result, /Native authentication incomplete/)
  else assert.equal((await result).user.id,owner)
  assert.deepEqual(observed,['/auth/v1/otp','/auth/v1/verify','/auth/v1/user'])
  assert.equal(worker.exitCode,0)
  await assert.rejects(access(profileDirectory),{code:'ENOENT'})
})
