// Read-only startup probe against an existing integration export. Uses a local
// HTTP host and disposable browsers; prints only timings, byte counts, and
// memory estimates. It never opens the user's browser profile or cloud account.
import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { readFile, readdir, writeFile, mkdir, mkdtemp, rm } from 'node:fs/promises'
import { resolve, relative, extname } from 'node:path'
import { chromium } from '@playwright/test'
const root = resolve(process.argv.find(arg=>arg.startsWith('--site='))?.slice(7)||'_site')
const out = resolve('.cache/tiny-swords-startup')
const [release] = await readdir(resolve(root, 'tiny-swords-game'))
const islandPath = process.argv.find(arg => arg.startsWith('--island='))?.slice(9) || 'tests/fixtures/tiny-swords-populated-island.json'
const layout = JSON.parse(await readFile(islandPath, 'utf8'))
assert.ok(Number.isInteger(layout.level) && Array.isArray(layout.tiles), 'Use an island snapshot, not a complete learner-profile export')
const serializedLayout = JSON.stringify(layout).replaceAll('<', '\\u003c')
const cpu = Number(process.argv.find(arg => arg.startsWith('--cpu='))?.slice(6) || 1)
const bandwidth = Number(process.argv.find(arg => arg.startsWith('--mbps='))?.slice(7) || 0)
const visits = Number(process.argv.find(arg => arg.startsWith('--visits='))?.slice(9) || 3)
assert.ok(Number.isInteger(visits) && visits > 0 && visits <= 100)
assert.ok(cpu >= 1 && bandwidth >= 0, 'Use CPU slowdown >= 1 and nonnegative Mbps')
const warmBudgetMs = Number(process.argv.find(arg => arg.startsWith('--budget='))?.slice(9) || 15000)
let nextByteAt = 0
const requests = []
const wrapper = `<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><style>body{margin:0}iframe{width:100%;height:300px;border:0}</style><script>
window.events=[];window.addEventListener('message',e=>{
 const frame=document.querySelector('iframe');if(e.source!==frame?.contentWindow||e.origin!==location.origin)return;
 const d=e.data;if(!d.type?.startsWith('edenia-'))return;
 if(!['edenia-game-loading-progress','edenia-tiny-layout'].includes(d.type))events.push({type:d.type,at:performance.now(),accepted:d.accepted});
 if(d.type==='edenia-game-progression')e.source.postMessage({type:'edenia-study-level',session:1,level:${layout.level},layout:${serializedLayout}},location.origin);
 if(d.type==='edenia-tiny-layout')e.source.postMessage({type:'edenia-tiny-saved',session:1,id:d.id,persisted:true},location.origin);
 if(d.type==='edenia-tiny-restored'&&d.accepted===true)window.restored=true;
});</script><iframe src="/tiny-swords-game/${release}/index.html"></iframe>`
const host = createServer(async(req,res)=>{
 try {
  const url=new URL(req.url,'http://localhost')
  if(url.pathname==='/probe') {res.setHeader('Content-Type','text/html');res.end(wrapper);return}
  const file=resolve(root,'.'+url.pathname)
  if(relative(root,file).startsWith('..')) {res.writeHead(403).end();return}
  let body=await readFile(file)
  if(file.endsWith('/index.js')) body=Buffer.from(body.toString()
    .replace('Godot(me.config.getModuleConfig(loadPath, cloned)).then(function (module) {', 'Godot(me.config.getModuleConfig(loadPath, cloned)).then(function (module) { window.startupTimings.moduleReady=performance.now();')
    .replace("module['initFS'](paths).then(function (err) {", "window.startupTimings.fsBegin=performance.now();module['initFS'](paths).then(function (err) { window.startupTimings.fsEnd=performance.now();")
    .replace("me.rtenv['callMain'](me.config.args);", "window.startupTimings.mainBegin=performance.now();me.rtenv['callMain'](me.config.args);window.startupTimings.mainEnd=performance.now();"));
  if(/\/index\.(wasm|pck)$/.test(url.pathname)) {body=await readFile(file+'.gz');res.setHeader('Content-Encoding','gzip')}
  requests.push({path:url.pathname,bytes:body.length})
  res.setHeader('Content-Type',({'.html':'text/html','.js':'text/javascript','.wasm':'application/wasm','.json':'application/json','.png':'image/png'})[extname(file)]||'application/octet-stream')
  res.setHeader('Content-Length',body.length)
  res.setHeader('Cache-Control','public,max-age=600')
  if(!bandwidth){res.end(body);return}
  for(let offset=0;offset<body.length;offset+=16384) {
   const chunk=body.subarray(offset,offset+16384)
   const at=Math.max(Date.now(),nextByteAt)
   nextByteAt=at+chunk.length/(bandwidth*125)
   await new Promise(resolve=>setTimeout(resolve,Math.max(0,at-Date.now())))
   if(res.destroyed)return;res.write(chunk)
  }
  res.end()
 }catch{res.writeHead(404).end()}
})
await mkdir(out,{recursive:true})
await new Promise(resolve=>host.listen(0,'127.0.0.1',resolve))
const url=`http://127.0.0.1:${host.address().port}/probe?internal_test=1`
const result=[]
async function visit(context,name,visit) {
 const page=await context.newPage()
 const session=await context.newCDPSession(page)
 await session.send('Emulation.setCPUThrottlingRate',{rate:cpu});const profiling=process.argv.includes('--profile');if(profiling){await session.send('Profiler.enable');await session.send('Profiler.start')}
 await page.addInitScript(()=>{
  window.startupTimings={};window.memories=[];window.instantiations=[];window.assetWorkers=[];window.responseClones=[];
  const clone=Response.prototype.clone;Response.prototype.clone=function(...args){responseClones.push({at:performance.now(),bytes:Number(this.headers.get('content-length'))});return clone.apply(this,args)};
  window.glReadbacks=[];
  const readPixels=WebGL2RenderingContext.prototype.readPixels;
  WebGL2RenderingContext.prototype.readPixels=function(...args){const start=performance.now();const result=readPixels.apply(this,args);glReadbacks.push({at:start,ms:performance.now()-start,width:args[2],height:args[3]});return result};
  const OriginalWorker=Worker;
  window.Worker=class extends OriginalWorker {
   constructor(...args){super(...args);this.probe={asset:null,start:performance.now(),chunks:0,bytes:0};assetWorkers.push(this.probe);this.addEventListener('message',({data})=>{if(data.type==='ready'||data.type==='chunk'){this.probe.first??=performance.now();this.probe.chunks++;this.probe.bytes+=data.buffer?.byteLength||0}if(data.type==='done')this.probe.end=performance.now()})}
   postMessage(data,...args){if(data.type==='start')this.probe.asset=new URL(data.url).pathname.split('/').at(-1);return super.postMessage(data,...args)}
  };
  for(const name of ['instantiate','instantiateStreaming']) {
   const original=WebAssembly[name];WebAssembly[name]=async function(...args) {
    const began=performance.now();const result=await original.apply(WebAssembly,args);instantiations.push({name,start:began,end:performance.now()});const exports=result.instance?.exports||result.exports;
    for(const value of Object.values(exports||{})) if(value instanceof WebAssembly.Memory) memories.push(value);
    return result;
   }
  }
 })
 let crashed=false;page.on('crash',()=>crashed=true)
 const began=Date.now(),requestStart=requests.length
 let failure
 try {await page.goto(url,{waitUntil:'domcontentloaded'});await page.waitForFunction(()=>window.restored===true,null,{timeout:45000})}catch(e){failure=e.message.slice(0,160)}
 const startupMs=Date.now()-began;if(profiling){const profiled=await session.send('Profiler.stop');await writeFile(out+`/${name}-${visit}.cpuprofile`,JSON.stringify(profiled.profile))}
 const game=page.frames().find(frame=>frame.url().includes('/tiny-swords-game/'))
 const events=crashed?[]:await page.evaluate(()=>window.events)
 const memory=crashed||!game?null:await game.evaluate(()=>({timings:window.startupTimings,readbacks:window.glReadbacks,clones:window.responseClones,instantiations:window.instantiations,workers:window.assetWorkers,wasmBytes:window.memories.map(m=>m.buffer.byteLength),heapBytes:performance.memory?.usedJSHeapSize,canvas:[document.getElementById('canvas').width,document.getElementById('canvas').height],renderer:(()=>{const gl=document.getElementById('canvas').getContext('webgl2');const info=gl?.getExtension('WEBGL_debug_renderer_info');return info?gl.getParameter(info.UNMASKED_RENDERER_WEBGL):null})()}))
 const row={name,visit,cpu,bandwidth,startupMs,crashed,failure,events,memory,networkBytes:requests.slice(requestStart).reduce((n,r)=>n+r.bytes,0),engineRequests:requests.slice(requestStart).filter(r=>r.path.includes('tiny-swords-engine')).map(r=>({asset:r.path.split('/').at(-1),bytes:r.bytes}))}
 console.log(JSON.stringify(row));result.push(row);await writeFile(out+'/startup-probe.json',JSON.stringify(result,null,2))
 await page.close()
 assert.equal(crashed,false,'renderer crashed');assert.equal(failure,undefined,'island did not restore')
 if(visit>0) assert.ok(startupMs<=warmBudgetMs,`warm island startup ${startupMs} ms exceeds ${warmBudgetMs} ms`)
}
const regularProfile = await mkdtemp(out+'/browser-')
const settings={headless:!process.argv.includes("--headful"),viewport:{width:393,height:852},deviceScaleFactor:3,isMobile:true,hasTouch:true}
try {
 const regular=await chromium.launchPersistentContext(regularProfile,settings)
 try {for(let index=0;index<visits;index++) await visit(regular,'regular',index)}finally{await regular.close()}
 const browser=await chromium.launch({headless:!process.argv.includes("--headful")})
 try {const fresh=await browser.newContext(settings);for(let index=0;index<visits;index++) await visit(fresh,'private',index);await fresh.close()}finally{await browser.close()}
}finally{await new Promise(resolve=>host.close(resolve));await rm(regularProfile,{recursive:true,force:true})}
