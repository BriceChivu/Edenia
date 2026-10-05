import assert from 'node:assert/strict'
import vm from 'node:vm'
import fs from 'node:fs'
import test from 'node:test'
import { createTinySwordsPersistence, islandIdentity } from '../../src/state/tiny-swords-island.js'

function harness({ legacy = null, island = 'absent', denied = false } = {}) {
  const handlers = {}; const sent = []; const frames = []; const storage = new Map()
  if (legacy !== null) storage.set('edenia_tiny_swords_xp_layout_v1', legacy)
  let state = { cityProgress: { maxLevelIndex: 2 }, ...(island === 'absent' ? {} : { tinySwordsIsland: island }) }
  let durable = structuredClone(state); let writes = 0
  const persistence = createTinySwordsPersistence({
    read: () => state, readDurable: () => structuredClone(durable),
    save(next, options) {
      assert.equal(options.backup, false); assert.equal(options.syncAnalytics, false)
      if (denied) return false
      durable = structuredClone(next); writes++; return true
    }
  })
  const node = { setAttribute(){}, classList:{add(){}},style:{setProperty(){}},addEventListener(){},querySelectorAll(){return []},cloneNode(){return this},replaceWith(){},append(){} }
  const context = {
    location:{hostname:'localhost',port:'8037',origin:'http://localhost:8037'},
    window:{edeniaTinySwordsPersistence:persistence,addEventListener(type,fn){handlers[type]=fn}},
    document:{documentElement:node,createElement(type){
      if(type!=='iframe') return {...node}
      const frame = {...node,contentWindow:{postMessage(data){sent.push(data)}}}; frames.push(frame); return frame
    },querySelector(){return node},getElementById(){return node}},
    localStorage:{getItem:k=>storage.get(k)??null,removeItem:k=>storage.delete(k)},
    TextEncoder, CITY_LEVELS:[{threshold:0}],renderCity(){},getCurrentCityScore(){return 0},Image:class{addEventListener(){}},ResizeObserver:class{observe(){}},MutationObserver:class{observe(){}}
  }
  vm.runInNewContext(fs.readFileSync('scripts/tiny-swords-xp-parent.js','utf8'),context)
  handlers.DOMContentLoaded()
  const emit = data => handlers.message({origin:context.location.origin,source:frames.at(-1).contentWindow,data})
  const ready = async () => {
    await emit({type:'edenia-game-progression',thresholds:[0,15,45,90,150,225,315,420,540,675]})
    await emit({type:'edenia-tiny-restored', session:sent.at(-1).session, accepted:true})
  }
  return { ready, emit, sent, storage, frames, handlers, get writes(){return writes},get durable(){return durable},replace(next){state=next;durable=structuredClone(next);handlers['edenia-profile-persisted']({detail:{replacement:true}})} }
}
const island = { version:23, level:4,tiles:[[0,0,'meadow']],stock:{meadow:3},resources:{wood:6},house_bundle:6 }

test('integrated developer save transfers only after accepted restore and successful profile persistence', async () => {
  const h = harness({legacy:JSON.stringify(island),island:undefined,denied:true})
  await h.emit({type:'edenia-tiny-ready'}); assert.equal(h.sent.length,0)
  await h.ready(); assert.equal(h.sent.at(-1).level,4)
  await h.emit({type:'edenia-tiny-layout',session:1,id:1,layout:island})
  assert.equal(h.sent.at(-1).persisted,false); assert.equal(h.storage.size,1); assert.equal(h.writes,0)
})

test('successful migration retires the old source, while reset cannot resurrect it', async () => {
  const h = harness({legacy:JSON.stringify(island),island:undefined})
  await h.ready(); await h.emit({type:'edenia-tiny-layout',session:1,id:1,layout:island})
  assert.equal(h.sent.at(-1).persisted,true); assert.equal(h.storage.size,0)
  h.storage.set('edenia_tiny_swords_xp_layout_v1',JSON.stringify(island))
  h.replace({cityProgress:{maxLevelIndex:0},tinySwordsIsland:null})
  await h.ready(); assert.equal(h.sent.at(-1).layout,null); assert.equal(h.sent.at(-1).level,1)
  await h.emit({type:'edenia-tiny-layout',session:1,id:2,layout:island})
  assert.equal(h.durable.tinySwordsIsland,null,'retired session cannot save')
})

test('rejected restore retains the input and refuses subsequent frame saves', async () => {
  const rejected = {...island,version:999}
  const h=harness({island:rejected})
  await h.emit({type:'edenia-game-progression',thresholds:[0,15,45,90,150]})
  await h.emit({type:'edenia-tiny-restored',session:1,accepted:false})
  await h.emit({type:'edenia-tiny-layout',session:1,id:1,layout:island})
  assert.equal(h.writes,0); assert.equal(h.sent.at(-1).persisted,false)
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
