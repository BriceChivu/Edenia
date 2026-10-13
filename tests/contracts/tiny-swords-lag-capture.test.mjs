import { readFile } from 'node:fs/promises'
import vm from 'node:vm'
import { test } from 'node:test'
import assert from 'node:assert/strict'
const source = await readFile(new URL('../../godot/tiny-swords/scripts/lag_capture.js',import.meta.url),'utf8')
function fixture() {
  let now=1000, stopped=0, requested=0
  const events={}, parentEvents=new Map(), timers=[], blobs=new Map(), observers=[]
  const header={dataset:{syncStatus:'up-to-date'}}
  const track={stop(){stopped++},requestFrame(){requested++}}
  const stream={getTracks:()=>[track],getVideoTracks:()=>[track]}
  const canvas={width:1152,height:496,captureStream:()=>stream}
  const MainLoop={preMainLoop:[],postMainLoop:[]}
  class Observer {constructor(callback){this.callback=callback;observers.push(this)} observe(){this.connected=true} disconnect(){this.connected=false}}
  const parent={document:{querySelector:()=>header,querySelectorAll:()=>[{},{}]},MutationObserver:Observer,PerformanceObserver:Observer,
    performance:{timeOrigin:0},addEventListener(name,callback){parentEvents.set(name,callback)},removeEventListener(name){parentEvents.delete(name)}}
  const window={edeniaFrameTest:{getState:()=>({targetFps:30,running:false})},PerformanceObserver:Observer,performance:{timeOrigin:0}}
  class Recorder {static isTypeSupported(){return true} constructor(){this.state='inactive';this.mimeType='video/webm';fixture.recorder=this} start(){this.state='recording'} stop(){this.state='inactive';timers.push(()=>{this.ondataavailable({data:new Blob(['clip'])});this.onstop()})}}
  const context={window,parent,MainLoop,MediaRecorder:Recorder,Blob,URL:{createObjectURL(blob){const key=String(blobs.size);blobs.set(key,blob);return key},revokeObjectURL(){}},
    location:{pathname:'/tiny-swords-game/test/index.html'},navigator:{userAgent:'fixture',hardwareConcurrency:8},devicePixelRatio:2,innerWidth:576,innerHeight:248,
    document:{hidden:false,querySelector:()=>canvas,createElement:()=>({click(){}})},performance:{now:()=>now,timeOrigin:0},
    addEventListener(name,callback){events[name]=callback},setTimeout(callback){timers.push(callback);return callback},clearTimeout(callback){const index=timers.indexOf(callback);if(index>=0)timers.splice(index,1)}}
  vm.runInNewContext(source,context)
  return {api:window.edeniaLagCapture,MainLoop,parentEvents,observers,events,timers,header,
    pre(at){now=at;MainLoop.preMainLoop.forEach(callback=>callback())},post(at){now=at;MainLoop.postMainLoop.forEach(callback=>callback())},
    async report(){window.edeniaLagCapture.saveReport();return JSON.parse(await [...blobs.values()].at(-1).text())},
    get stopped(){return stopped},get requested(){return requested}}
}
test('starting inside an engine input callback does not fabricate a startup stall',async()=>{
  const f=fixture();f.pre(1000);assert.equal(f.api.start(false),true);f.post(1003)
  f.pre(1033);f.post(1036);f.pre(1066);f.post(1069);f.api.mark();f.api.stop()
  const report=await f.report()
  assert.equal(report.frames.length,1);assert.equal(report.frames[0].intervalMs,33)
  assert.equal(report.lagMarkers.length,1)
  assert.equal(f.parentEvents.size,0);assert.ok(f.observers.every(observer=>!observer.connected))
})
test('capture keeps sync transitions and persistence markers without profile data',async()=>{
  const f=fixture();f.api.start(false)
  f.parentEvents.get('edenia-profile-persisted')({detail:{authToken:'private-token'}})
  f.header.dataset.syncStatus='syncing';f.observers.at(-1).callback()
  f.api.probe('obstacle-search',2,{workMs:30,wallMs:500,cancelled:false,authToken:'private-token',profile:{secret:true}})
  f.api.stop();const report=await f.report()
  assert.ok(report.events.some(event=>event.type==='progress-sync'&&event.status==='syncing'))
  assert.ok(report.events.some(event=>event.type==='local-profile-persisted'))
  assert.equal(JSON.stringify(report).includes('private-token'),false)
  assert.deepEqual(report.probes[0].details,{workMs:30,wallMs:500,cancelled:false})
})
test('video requests follow rendered frames and retirement releases parent callbacks and tracks',()=>{
  const f=fixture();f.api.start(true);f.pre(1033);f.post(1036)
  assert.equal(f.requested,1)
  f.events.pagehide();assert.equal(f.parentEvents.size,0);assert.ok(f.stopped>0)
  // Late encoder completion from the retired capture cannot overwrite a new log.
  assert.equal(f.api.start(false),true)
  f.timers[0]()
  assert.equal(f.api.getState().active,true)
  assert.equal(f.api.getState().hasVideo,false)
})
