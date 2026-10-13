import { readFile } from 'node:fs/promises'
import vm from 'node:vm'
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { unzipSync } from 'fflate'
const source = await readFile(new URL('../../godot/tiny-swords/scripts/lag_capture.js',import.meta.url),'utf8')
const packageSource = await readFile(new URL('../../godot/tiny-swords/scripts/lag_capture_package.js',import.meta.url),'utf8')
async function fixture({unsupportedVideo=false}={}) {
  let now=1000, stopped=0, requested=0
  const events={}, parentEvents=new Map(), timers=[], blobs=new Map(), observers=[], canvasEvents=new Map()
  const header={dataset:{syncStatus:'up-to-date'}}
  const track={stop(){stopped++},requestFrame(){requested++}}
  const stream={getTracks:()=>[track],getVideoTracks:()=>[track]}
  const canvas={width:1152,height:496,captureStream:()=>stream,
    addEventListener(name,callback){canvasEvents.set(name,callback)},removeEventListener(name){canvasEvents.delete(name)}}
  const MainLoop={preMainLoop:[],postMainLoop:[]}
  class Observer {constructor(callback){this.callback=callback;observers.push(this)} observe(){this.connected=true} disconnect(){this.connected=false}}
  const parentDocumentEvents=new Map()
  const parent={document:{querySelector:()=>header,querySelectorAll:()=>[{},{}],
    addEventListener(name,callback){parentDocumentEvents.set(name,callback)},removeEventListener(name){parentDocumentEvents.delete(name)}},
    location:{href:'https://www.edenia.study/?internal_test=1&tiny_swords_fps=60&token=private-token#auth-secret'},
    MutationObserver:Observer,PerformanceObserver:Observer,performance:{timeOrigin:0},
    addEventListener(name,callback){parentEvents.set(name,callback)},removeEventListener(name){parentEvents.delete(name)}}
  const window={edeniaFrameTest:{getState:()=>({targetFps:60,running:false})},PerformanceObserver:Observer,performance:{timeOrigin:0}}
  class Recorder {static isTypeSupported(){return !unsupportedVideo} constructor(){this.state='inactive';this.mimeType='video/webm'} start(){this.state='recording'} stop(){this.state='inactive';queueMicrotask(()=>{this.ondataavailable({data:new Blob(['clip'])});this.onstop()})}}
  const document={hidden:false,querySelector:()=>canvas,createElement:()=>({click(){}})}
  class ClockDate extends Date {constructor(...args){super(...(args.length?args:[now]))}}
  const context={window,parent,MainLoop,MediaRecorder:Recorder,Blob,TextEncoder,Date:ClockDate,URL,URLSearchParams,
    location:{pathname:'/tiny-swords-game/test/index.html'},navigator:{userAgent:'fixture',hardwareConcurrency:8},devicePixelRatio:2,innerWidth:576,innerHeight:248,
    document,performance:{now:()=>now,timeOrigin:0},addEventListener(name,callback){events[name]=callback},
    setTimeout(callback,ms){const timer={callback,at:now+ms};timers.push(timer);return timer},clearTimeout(timer){const i=timers.indexOf(timer);if(i>=0)timers.splice(i,1)},
  }
  context.URL={...URL,createObjectURL(blob){const key=String(blobs.size);blobs.set(key,blob);return key},revokeObjectURL(){}}
  // Preserve URL parsing while replacing only object URL helpers.
  context.URL=class extends URL {static createObjectURL(blob){const key=String(blobs.size);blobs.set(key,blob);return key} static revokeObjectURL(){}}
  vm.runInNewContext(packageSource,context);vm.runInNewContext(source,context)
  await window.edeniaLagCaptureStore.ready;await Promise.resolve()
  const api=window.edeniaLagCapture
  return {api,MainLoop,parentEvents,observers,events,timers,header,document,canvasEvents,parentDocumentEvents,store:window.edeniaLagCaptureStore,
    pre(at){now=at;MainLoop.preMainLoop.forEach(callback=>callback())},post(at){now=at;MainLoop.postMainLoop.forEach(callback=>callback())},
    async phaseEnd(){const timer=timers.find(timer=>timer.at>now);timers.splice(timers.indexOf(timer),1);now=timer.at;timer.callback();for(let i=0;i<30;i++)await new Promise(resolve=>setImmediate(resolve))},
    async report(){api.saveReport();return JSON.parse(await [...blobs.values()].at(-1).text())},
    async package(){assert.equal(api.savePackage(),true);return unzipSync(new Uint8Array(await [...blobs.values()].at(-1).arrayBuffer()))},
    get stopped(){return stopped},get requested(){return requested}}
}
test('starting inside an engine callback excludes startup; pauses are automatic and separate from human marks',async()=>{
  const f=await fixture();f.pre(1000);assert.equal(f.api.start(false),true);f.post(1003)
  f.pre(1033);f.post(1036);f.pre(1066);f.post(1069);f.pre(1266);f.post(1269);f.api.mark();await f.api.stop()
  const report=await f.report()
  assert.equal(report.frames.length,2);assert.equal(report.frames[0].intervalMs,33)
  assert.equal(report.stalls.length,1);assert.equal(report.stalls[0].intervalMs,200)
  assert.equal(report.lagMarkers.length,1)
  assert.equal(f.parentEvents.size,0);assert.equal(f.canvasEvents.size,0);assert.equal(f.parentDocumentEvents.size,0)
  assert.ok(f.observers.every(observer=>!observer.connected))
})
test('capture automatically includes safe route/actions, sync and persistence without learner data',async()=>{
  const f=await fixture();f.api.start(false)
  f.parentEvents.get('edenia-profile-persisted')({detail:{authToken:'private-token'}})
  f.header.dataset.syncStatus='syncing';f.observers.at(-1).callback()
  f.api.probe('obstacle-search',2,{workMs:30,wallMs:500,cancelled:false,authToken:'private-token',profile:{secret:true}})
  f.api.activity('walking');f.api.activity('walking');f.api.activity('private-token')
  f.canvasEvents.get('pointermove')({});f.canvasEvents.get('pointerdown')({pointerType:'touch'})
  await f.api.stop();const report=await f.report()
  assert.ok(report.events.some(event=>event.type==='progress-sync'&&event.status==='syncing'))
  assert.ok(report.events.some(event=>event.type==='local-profile-persisted'))
  assert.equal(JSON.stringify(report).includes('private-token'),false)
  assert.equal(report.environment.pageUrl,'https://www.edenia.study/?internal_test=1&tiny_swords_fps=60')
  assert.equal(report.actions.filter(action=>action.type==='gameplay').length,1)
  assert.deepEqual(report.actions.find(action=>action.type==='interaction-counts').counts,{gamePointerMoves:1,gameTouches:1})
  assert.deepEqual(report.probes[0].details,{workMs:30,wallMs:500,cancelled:false})
})
test('record-and-compare automatically creates two matched reports and a valid single ZIP',async()=>{
  const f=await fixture();assert.equal(f.api.startComparison({phaseMs:1000}),true)
  f.pre(1033);f.post(1036);f.pre(1050);f.post(1054)
  assert.equal(f.requested,2)
  await f.phaseEnd()
  assert.equal(f.api.getState().active,true);assert.equal(f.api.getState().recording,false);assert.equal(f.api.getState().phase,'log-only')
  const requested=f.requested
  f.pre(2033);f.post(2036);f.pre(2050);f.post(2054)
  await f.phaseEnd();assert.equal(f.api.getState().active,false);assert.equal(f.api.getState().busy,false)
  assert.equal(f.requested,requested);assert.ok(f.stopped>0)
  const files=await f.package(), names=Object.keys(files)
  assert.equal(names.length,5);assert.equal(names.filter(name=>name.endsWith('.webm')).length,1)
  const summary=JSON.parse(new TextDecoder().decode(files[names.find(name=>name.endsWith('-summary.json'))]))
  assert.equal(summary.comparisonComplete,true);assert.equal(summary.runs.length,2)
  for(const run of summary.runs)assert.equal(JSON.parse(new TextDecoder().decode(files[run.reportFile])).captureId,summary.captureId)
  assert.equal(summary.runs[0].phase,'recorded');assert.equal(summary.runs[1].phase,'log-only')
})
test('a new run keeps previous packages and storage failure explicitly reports tab-only retention',async()=>{
  const f=await fixture();f.api.start(false);f.pre(1033);f.post(1036);await f.api.stop()
  const first=f.api.getState().selectedId;const firstBytes=await f.store.list()[0].blob.arrayBuffer()
  assert.match(f.api.getState().status,/kept in this tab/)
  f.pre(4000);assert.equal(f.api.start(false),true);f.pre(4033);f.post(4036);await f.api.stop()
  assert.equal(f.api.getState().captures.length,2)
  f.api.select(first);const files=await f.package();assert.ok(Object.keys(files).some(name=>name.startsWith(first)))
  assert.deepEqual(await f.store.list().find(item=>item.id===first).blob.arrayBuffer(),firstBytes)
})
test('hidden paired capture keeps its clip and diagnostics but does not launch another phase',async()=>{
  const f=await fixture();f.api.startComparison({phaseMs:1000});f.pre(1033);f.post(1036)
  f.document.hidden=true;await f.api.pause('page hidden')
  assert.equal(f.api.getState().active,false);assert.equal(f.api.getState().captures.length,1)
  assert.equal(f.parentEvents.size,0);assert.ok(f.stopped>0)
  const files=await f.package(), name=Object.keys(files).find(name=>name.endsWith('-summary.json'))
  const summary=JSON.parse(new TextDecoder().decode(files[name]));assert.equal(summary.interrupted,true);assert.equal(summary.comparisonComplete,false)
})
test('unsupported encoder still delivers a diagnostic package and cannot falsely claim a clip',async()=>{
  const f=await fixture({unsupportedVideo:true});assert.equal(f.api.startComparison({phaseMs:1000}),true)
  assert.equal(f.api.getState().recording,false);await f.phaseEnd();await f.phaseEnd()
  const files=await f.package();assert.ok(!Object.keys(files).some(name=>name.endsWith('.webm')))
  const summary=JSON.parse(new TextDecoder().decode(files[Object.keys(files).find(name=>name.endsWith('-summary.json'))]))
  assert.equal(summary.comparisonComplete,false)
  const first=JSON.parse(new TextDecoder().decode(files[summary.runs[0].reportFile]));assert.match(first.video.error,/Video unavailable/)
})
test('archive capacity prevents replacing retained captures and explicit deletion makes room',async()=>{
  const f=await fixture()
  for(let i=0;i<5;i++){f.pre(1000+i*1000);assert.equal(f.api.start(false),true);await f.api.stop()}
  assert.equal(f.api.start(false),false);assert.equal(f.api.getState().captures.length,5)
  assert.equal(await f.api.deleteSelected(),true);assert.equal(f.api.start(false),true);await f.api.stop()
  assert.equal(f.api.getState().captures.length,5)
})
