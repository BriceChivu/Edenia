import assert from 'node:assert/strict'
import vm from 'node:vm'
import fs from 'node:fs'
import test from 'node:test'

test('local map saves and restores independently of lower study claims', () => {
  const key='edenia_tiny_swords_xp_layout_v1'
  const saved={level:4,cells:[[0,0,'meadow']],resources:{wood:3}}
  const storage=new Map([[key,JSON.stringify(saved)]])
  const handlers={}; const sent=[]
  const node={classList:{add(){}},style:{setProperty(){}},addEventListener(){},querySelectorAll(){return []},cloneNode(){return this},replaceWith(){},append(){}}
  const frame={...node,contentWindow:{postMessage(data){sent.push(data)}}}
  const context={location:{hostname:'localhost',port:'8037',origin:'http://localhost:8037'},window:{addEventListener(type,fn){handlers[type]=fn}},document:{documentElement:node,createElement(){return frame},querySelector(){return node},getElementById(){return node}},loadState(){return {cityProgress:{maxLevelIndex:2}}},localStorage:{getItem:k=>storage.get(k),setItem:(k,v)=>storage.set(k,v)},Image:class{addEventListener(){}},ResizeObserver:class{observe(){}},MutationObserver:class{observe(){}}}
  vm.runInNewContext(fs.readFileSync('scripts/tiny-swords-xp-parent.js','utf8'),context)
  handlers.DOMContentLoaded()
  handlers.message({origin:context.location.origin,source:frame.contentWindow,data:{type:'edenia-tiny-ready'}})
  assert.equal(sent.at(-1).level,4,'refresh must preserve saved preview level even when study claims are lower')
  handlers.message({origin:context.location.origin,source:frame.contentWindow,data:{type:'edenia-tiny-layout',layout:{...saved,resources:{wood:4}}}})
  assert.equal(JSON.parse(storage.get(key)).resources.wood,4,'save higher-level map updates')
})
