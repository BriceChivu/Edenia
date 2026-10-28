import assert from 'node:assert/strict'
import vm from 'node:vm'
import { createTinySwordsPersistence } from '../../src/state/tiny-swords-island.js'
import { readTinySwordsParentSource } from './tiny-swords-parent-source.mjs'

export function harness({ legacy = null, island = 'absent', denied = false, delayed = false, developer = true, inactive = false, search = '' } = {}) {
  let time = 0, nextTimer = 0; const timers = new Map(), intervals = new Map();
  const handlers = {}; const sent = []; const frames = []; const storage = new Map(); const saves = []; const activities = []
  const styles = new Map(), cursorImages = [], cursorCanvases = []
  if (legacy !== null) storage.set('edenia_tiny_swords_xp_layout_v1', legacy)
  let state = { cityProgress: { maxLevelIndex: 2 }, ...(island === 'absent' ? {} : { tinySwordsIsland: island }) }
  if (inactive) state = null
  let access = 'owner-a'
  let durable = structuredClone(state); let writes = 0
  let finishPending
  const persistence = createTinySwordsPersistence({
    read: () => state, readAccessIdentity: () => access, readDurable: () => structuredClone(durable),
    save(next, options) {
      saves.push(options)
      assert.equal(options.backup, false); assert.equal(options.syncAnalytics, false)
      if (denied) return false
      durable = structuredClone(next); writes++
      if (delayed) return new Promise(resolve => { finishPending = () => resolve(true) })
      return true
    }
  })
  const node = { dataset:{}, querySelector(){return node}, focus(){this.focusCount=(this.focusCount||0)+1}, blur(){}, setAttribute(){}, removeAttribute(){}, classList:{contains(){return false},add(){},remove(){},toggle(){}},style:{setProperty(key,value){styles.set(key,value)}},addEventListener(type,fn){if(type==='pointerenter')handlers.cameraPointerEnter=fn;this.events??={};this.events[type]=fn},querySelectorAll(){return []},cloneNode(){return this},replaceWith(){},remove(){this.removed=true},append(){} }
  const context = {
    location:{hostname:'localhost',port:'8037',origin:'http://localhost:8037',search},
    URL, URLSearchParams,
    CustomEvent: class { constructor(type, options) { this.type = type; this.detail = options.detail } },
    window:{edeniaTinySwordsEnabled:true,edeniaTinySwordsLegacyPreview:developer,EDENIA_CONFIG:{tinySwordsEnabled:true},edeniaTinySwordsPersistence:persistence,addEventListener(type,fn){handlers[type]=fn},dispatchEvent(event){ if (event.type === 'edenia-tiny-swords-activity') activities.push(event.detail) }},
    document:{body:node,querySelectorAll(){return []},currentScript:{src:'http://localhost:8037/tiny-swords-game/test/parent.js'},documentElement:node,visibilityState:'visible',addEventListener(type,fn){handlers[type]=fn},createElement(type){
      if(type==='canvas') {
        const canvas={getContext(){return {drawImage(){}}},toDataURL(){return 'data:image/png;base64,cursor'}}
        cursorCanvases.push(canvas);return canvas
      }
      if(type!=='iframe') return {...node}
      const frame = {...node,getBoundingClientRect(){return {width:800}},contentWindow:{postMessage(data){sent.push(data)}}}; frames.push(frame); return frame
    },querySelector(){return node},getElementById(){return node}},
    localStorage:{getItem:k=>storage.get(k)??null,removeItem:k=>storage.delete(k)},
    setTimeout(fn,delay){timers.set(++nextTimer,{fn,at:time+delay});return nextTimer}, clearTimeout(id){timers.delete(id)}, setInterval(fn,delay){intervals.set(++nextTimer,{fn,delay});return nextTimer}, clearInterval(id){intervals.delete(id)}, performance:{now:()=>time},
    MutationObserver:class{observe(){}},
    TextEncoder, Image:class{constructor(){this.complete=false;this.naturalWidth=0;this.handlers={};cursorImages.push(this)}addEventListener(type,fn){this.handlers[type]=fn}},ResizeObserver:class{constructor(fn){handlers.cameraResize=fn}observe(){} unobserve(){}},
    IntersectionObserver:class{constructor(fn){handlers.intersection=fn}observe(){}unobserve(){}}
  }
  vm.runInNewContext(readTinySwordsParentSource(),context)
  handlers.DOMContentLoaded()
  const emit = (data,frame=frames.at(-1)) => handlers.message({origin:context.location.origin,source:frame.contentWindow,data})
  const ready = async () => {
    await emit({type:'edenia-game-progression',thresholds:[0,15,45,90,150,225,315,420,540,675]})
    await emit({type:'edenia-tiny-restored', session:sent.findLast(x=>x.type==='edenia-study-level').session, accepted:true})
  }
  return { timers, intervals, surface:node, advance(ms){const end=time+ms;for(let guard=0;guard<1000;guard++){const item=[...timers].filter(([,t])=>t.at<=end).sort((a,b)=>a[1].at-b[1].at)[0];if(!item){time=end;return}time=item[1].at;timers.delete(item[0]);item[1].fn()}throw new Error('timer loop')}, ready, emit, sent, storage, frames, handlers, persistence, saves, activities, window:context.window, document:context.document, styles, cursorImages, cursorCanvases,
    attemptClaim(index, persisted) {
      state.cityProgress.maxLevelIndex = index
      if (persisted) { durable = structuredClone(state); handlers['edenia-profile-persisted']({detail:{}}) }
    },
    lock(){state=null;durable=null;handlers['edenia-profile-access']()},
    activate(next,identity){state=next;durable=structuredClone(next);access=identity;handlers['edenia-profile-access']()},
    finishPending(){finishPending()},get writes(){return writes},get durable(){return durable},
    refreshAmbient(next){state=next;durable=structuredClone(next);handlers['edenia-profile-persisted']({detail:{islandOnly:true,animalCheckpoint:true}})},
    replace(next){state=next;durable=structuredClone(next);handlers['edenia-profile-persisted']({detail:{replacement:true}})} }
}
