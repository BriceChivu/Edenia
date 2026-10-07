import assert from 'node:assert/strict'
import vm from 'node:vm'
import fs from 'node:fs'
import test from 'node:test'
import { createTinySwordsPersistence, islandIdentity } from '../../src/state/tiny-swords-island.js'

function harness({ legacy = null, island = 'absent', denied = false, delayed = false, developer = true } = {}) {
  const handlers = {}; const sent = []; const frames = []; const storage = new Map()
  if (legacy !== null) storage.set('edenia_tiny_swords_xp_layout_v1', legacy)
  let state = { cityProgress: { maxLevelIndex: 2 }, ...(island === 'absent' ? {} : { tinySwordsIsland: island }) }
  let durable = structuredClone(state); let writes = 0
  let finishPending
  const persistence = createTinySwordsPersistence({
    read: () => state, readDurable: () => structuredClone(durable),
    save(next, options) {
      assert.equal(options.backup, false); assert.equal(options.syncAnalytics, false)
      if (denied) return false
      durable = structuredClone(next); writes++
      if (delayed) return new Promise(resolve => { finishPending = () => resolve(true) })
      return true
    }
  })
  const node = { dataset:{}, querySelector(){return node}, focus(){this.focusCount=(this.focusCount||0)+1}, blur(){}, setAttribute(){}, removeAttribute(){}, classList:{contains(){return false},add(){},remove(){},toggle(){}},style:{setProperty(){}},addEventListener(){},querySelectorAll(){return []},cloneNode(){return this},replaceWith(){},append(){} }
  const context = {
    location:{hostname:'localhost',port:'8037',origin:'http://localhost:8037'},
    URL,
    window:{edeniaTinySwordsEnabled:true,edeniaTinySwordsLegacyPreview:developer,EDENIA_CONFIG:{tinySwordsEnabled:true},edeniaTinySwordsPersistence:persistence,addEventListener(type,fn){handlers[type]=fn}},
    document:{body:node,querySelectorAll(){return []},currentScript:{src:'http://localhost:8037/tiny-swords-game/test/parent.js'},documentElement:node,visibilityState:'visible',addEventListener(type,fn){handlers[type]=fn},createElement(type){
      if(type!=='iframe') return {...node}
      const frame = {...node,contentWindow:{postMessage(data){sent.push(data)}}}; frames.push(frame); return frame
    },querySelector(){return node},getElementById(){return node}},
    localStorage:{getItem:k=>storage.get(k)??null,removeItem:k=>storage.delete(k)},
    setTimeout(){return 1}, clearTimeout(){}, MutationObserver:class{observe(){}},
    TextEncoder, Image:class{addEventListener(){}},ResizeObserver:class{observe(){} unobserve(){}},
    IntersectionObserver:class{constructor(fn){handlers.intersection=fn}observe(){}unobserve(){}}
  }
  vm.runInNewContext(fs.readFileSync('scripts/tiny-swords-xp-parent.js','utf8'),context)
  handlers.DOMContentLoaded()
  const emit = data => handlers.message({origin:context.location.origin,source:frames.at(-1).contentWindow,data})
  const ready = async () => {
    await emit({type:'edenia-game-progression',thresholds:[0,15,45,90,150,225,315,420,540,675]})
    await emit({type:'edenia-tiny-restored', session:sent.findLast(x=>x.type==='edenia-study-level').session, accepted:true})
  }
  return { ready, emit, sent, storage, frames, handlers, persistence, document:context.document,
    attemptClaim(index, persisted) {
      state.cityProgress.maxLevelIndex = index
      if (persisted) { durable = structuredClone(state); handlers['edenia-profile-persisted']({detail:{}}) }
    },
    finishPending(){finishPending()},get writes(){return writes},get durable(){return durable},replace(next){state=next;durable=structuredClone(next);handlers['edenia-profile-persisted']({detail:{replacement:true}})} }
}
const island = { version:23, level:4,tiles:[[0,0,'meadow']],stock:{meadow:3},resources:{wood:6},house_bundle:6 }

test('keyboard exit returns to the host only for the ready current game session', async () => {
  const h = harness({island})
  const controls = h.document.getElementById('tinySwordsSurface')
  await h.emit({type:'edenia-game-focus-exit',session:1})
  assert.equal(controls.focusCount,undefined,'a loading frame cannot steal host focus')
  await h.ready()
  await h.emit({type:'edenia-game-focus-exit',session:99})
  assert.equal(controls.focusCount,undefined,'stale messages cannot move host focus')
  await h.emit({type:'edenia-game-focus-exit',session:1})
  assert.equal(controls.focusCount,1)
  assert.equal(h.writes,0,'keyboard exit cannot write learner data')
})

test('integrated developer save transfers only after accepted restore and successful profile persistence', async () => {
  const h = harness({legacy:JSON.stringify(island),island:undefined,denied:true})
  await h.emit({type:'edenia-tiny-ready'}); assert.equal(h.sent.filter(message => message.type === 'edenia-study-level').length,0)
  await h.ready()
  const restored = h.sent.findLast(x=>x.type==='edenia-study-level')
  assert.equal(restored.level,3,'only claimed study progress sets the upgrade floor')
  assert.equal(restored.layout.level,4,'Godot receives the higher saved game level to restore')
  await h.emit({type:'edenia-tiny-layout',session:1,id:1,layout:island})
  assert.equal(h.sent.findLast(x=>x.type==='edenia-tiny-saved').persisted,false); assert.equal(h.storage.size,1); assert.equal(h.writes,0)
})

test('successful migration retires the old source, while reset cannot resurrect it', async () => {
  const h = harness({legacy:JSON.stringify(island),island:undefined})
  await h.ready(); await h.emit({type:'edenia-tiny-layout',session:1,id:1,layout:island})
  assert.equal(h.sent.findLast(x=>x.type==='edenia-tiny-saved').persisted,true); assert.equal(h.storage.size,0)
  h.storage.set('edenia_tiny_swords_xp_layout_v1',JSON.stringify(island))
  h.replace({cityProgress:{maxLevelIndex:0},tinySwordsIsland:null})
  await h.ready(); const restored=h.sent.findLast(x=>x.type==='edenia-study-level');assert.equal(restored.layout,null); assert.equal(restored.level,1)
  await h.emit({type:'edenia-tiny-layout',session:1,id:2,layout:island})
  assert.equal(h.durable.tinySwordsIsland,null,'retired session cannot save')
})

test('rejected restore retains the input and refuses subsequent frame saves', async () => {
  const rejected = {...island,version:999}
  const h=harness({island:rejected})
  await h.emit({type:'edenia-game-progression',thresholds:[0,15,45,90,150]})
  await h.emit({type:'edenia-tiny-restored',session:1,accepted:false})
  await h.emit({type:'edenia-tiny-layout',session:1,id:1,layout:island})
  assert.equal(h.writes,0); assert.equal(h.sent.findLast(x=>x.type==='edenia-tiny-saved').persisted,false)
  assert.deepEqual(h.durable.tinySwordsIsland,rejected)
})

test('one stale tab cannot overwrite a replacement even before its storage event arrives', async () => {
  let live = {tinySwordsIsland:island}
  let durable = structuredClone(live)
  const expected = islandIdentity(live)
  const adapter = createTinySwordsPersistence({read:()=>live,readDurable:()=>durable,save(){assert.fail('stale write')}})
  durable = {tinySwordsIsland:null}
  assert.equal(await adapter.save({...island,resources:{wood:10}},expected),false)
  assert.equal(durable.tinySwordsIsland,null)
})

test('profile replacement during an acknowledgment clears the old frame even with an identical island', async () => {
  const h = harness({ island, delayed: true })
  await h.ready()
  const pending = h.emit({ type: 'edenia-tiny-layout', session: 1, id: 1, layout: island })
  h.replace({ cityProgress: { maxLevelIndex: 0 }, tinySwordsIsland: island })
  h.finishPending()
  await pending
  assert.equal(h.frames.length, 2, 'replacement must clear transient actions after the pending acknowledgment')
  await h.ready()
  await h.emit({ type: 'edenia-tiny-layout', session: 1, id: 2, layout: island })
  assert.equal(h.writes, 1, 'the retired frame cannot save again')
})

test('host visibility preserves the frame, resumes partial intersection, and ignores retired observers', async () => {
  const h = harness({island})
  await h.ready()
  const original = h.frames[0]
  const report = (target, shown) => h.handlers.intersection([{target,isIntersecting:shown,intersectionRect:{width:shown?100:0,height:shown?1:0}}])
  report(original,false)
  assert.deepEqual({...h.sent.at(-1)},{type:'edenia-host-visibility',session:1,visible:false})
  report(original,true)
  assert.equal(h.sent.at(-1).visible,true,'even a partially visible island must run')
  h.document.visibilityState='hidden';h.handlers.visibilitychange()
  assert.equal(h.sent.at(-1).visible,false)
  h.document.visibilityState='visible';h.handlers.visibilitychange()
  assert.equal(h.sent.at(-1).visible,true)
  assert.equal(h.frames.length,1,'scroll and tab visibility never replace the iframe')
  h.replace({cityProgress:{maxLevelIndex:0},tinySwordsIsland:null})
  await h.ready()
  const count=h.sent.length
  report(original,false)
  assert.equal(h.sent.length,count,'an old observer cannot suspend the new island')
  report(h.frames.at(-1),false)
  assert.equal(h.sent.at(-1).session,2)
  assert.equal(h.writes,0,'visibility facts do not write learner data')
})

test('visibility receiver accepts only current parent/session facts', () => {
  const handlers={};const calls=[];const parent={}
  const context={parent,location:{origin:'http://localhost:8037'},window:{matchMedia:()=>({matches:false,addEventListener(){}}),edeniaStudySession:2,edeniaReceiveHostVisibility:value=>calls.push(value),addEventListener(type,fn){handlers[type]=fn}}}
  context.document={readyState:'loading',addEventListener(){}}
  vm.runInNewContext(fs.readFileSync('scripts/tiny-swords-xp-visibility.js','utf8'),context)
  const message={origin:context.location.origin,source:parent,data:{type:'edenia-host-visibility',session:2,visible:false}}
  handlers.message({...message,source:{}})
  handlers.message({...message,origin:'https://example.com'})
  handlers.message({...message,data:{...message.data,session:1}})
  handlers.message({...message,data:{...message.data,visible:'false'}})
  assert.equal(calls.length,0)
  handlers.message(message)
  handlers.message({...message,data:{...message.data,visible:true}})
  assert.deepEqual(calls,[false,true])
})

test('failed and in-flight claims cannot publish through readiness, access, or DOM changes', async () => {
  const h = harness({island})
  await h.ready()
  h.attemptClaim(9, false)
  assert.equal(h.persistence.readClaimedLevel(),3)
  await h.emit({type:'edenia-tiny-ready'})
  h.handlers['edenia-profile-access']()
  assert.ok(h.sent.filter(x=>x.type==='edenia-study-level').every(x=>x.level===3))
  h.attemptClaim(9, true)
  assert.equal(h.sent.findLast(x=>x.type==='edenia-study-level').level,10)
  assert.equal(h.frames.length,1,'a durable claim updates the existing game')
})

test('save acknowledgments identify the actual saved level and preserve queued checkpoints', () => {
  const handlers = {}; const sent = []; const acknowledgments = []; const parent = {postMessage(data){sent.push(data)}}
  const context = {parent,location:{origin:'http://localhost:8037'},document:{addEventListener(){}},
    window:{addEventListener(type,fn){handlers[type]=fn},edeniaReceiveLayoutSaved:(...args)=>acknowledgments.push(args)}}
  vm.runInNewContext(fs.readFileSync('scripts/tiny-swords-xp-messages.js','utf8'),context)
  const emit = data => handlers.message({origin:context.location.origin,source:parent,data})
  emit({type:'edenia-study-level',session:1,level:10,layout:null})
  context.window.edeniaQueueLayout({level:1})
  context.window.edeniaQueueLayout({level:2})
  emit({type:'edenia-tiny-saved',session:2,id:1,persisted:true})
  emit({type:'edenia-tiny-saved',session:1,id:99,persisted:true})
  assert.deepEqual(acknowledgments,[])
  emit({type:'edenia-tiny-saved',session:1,id:1,persisted:false})
  assert.deepEqual(acknowledgments,[[1,false]])
  assert.equal(sent.at(-1).layout.level,2)
  emit({type:'edenia-tiny-saved',session:1,id:2,persisted:true})
  emit({type:'edenia-tiny-saved',session:1,id:2,persisted:true})
  assert.deepEqual(acknowledgments,[[1,false],[2,true]])
})

test('a claim persisted while an island checkpoint is in flight reaches the game afterward', async () => {
  const h = harness({island, delayed:true})
  await h.ready()
  const checkpoint = h.emit({type:'edenia-tiny-layout',session:1,id:1,layout:island})
  h.attemptClaim(7,true)
  assert.equal(h.sent.findLast(x=>x.type==='edenia-study-level').level,3)
  h.finishPending()
  await checkpoint
  assert.equal(h.sent.findLast(x=>x.type==='edenia-study-level').level,8)
  assert.equal(h.frames.length,1)
})

test('IndexedDB claim publication uses the durable head without composing the profile', () => {
  const head={cityProgress:{maxLevelIndex:9}}
  const adapter=createTinySwordsPersistence({
    read(){assert.fail('Claim publication must not compose the full profile')},
    readDurable(){assert.fail('Claim publication must use the durable head')},
    getCheckpointRepository:()=>({readIslandState:()=>head}),save(){assert.fail('Read-only publication')}
  })
  assert.equal(adapter.readClaimedLevel(),10)
})

test('tester profiles never inherit or retire a developer island', async () => {
  const raw = JSON.stringify(island)
  const h = harness({ legacy: raw, developer: false })
  await h.ready()
  assert.equal(h.sent.findLast(message => message.type === 'edenia-study-level').layout, null)
  await h.emit({ type: 'edenia-tiny-layout', session: 1, id: 1, layout: island })
  assert.equal(h.storage.get('edenia_tiny_swords_xp_layout_v1'), raw)
})
