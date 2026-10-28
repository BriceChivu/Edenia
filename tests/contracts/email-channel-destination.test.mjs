import test from 'node:test'
import assert from 'node:assert/strict'
import { consumeEmailChannelDestination, addRecommendedChannels } from '../../src/integrations/email-channel-destination.js'
const a='UCaaaaaaaaaaaaaaaaaaaaaa',b='UCbbbbbbbbbbbbbbbbbbbbbb'
function parse(search,enabled=true){const updates=[];const result=consumeEmailChannelDestination({enabled,location:{href:`https://www.edenia.study/?internal_test=1&${search}`},history:{state:null,replaceState:(...args)=>updates.push(args[2])}});return {result,updates}}
test('single and bulk channel intent is bounded, consumes only its keys, and preserves trial routing',()=>{
 assert.deepEqual(parse(`reminder=discovery&channel=${a}`).result,{mode:'single',channelIds:[a]})
 const bulk=parse(`reminder=discovery&channels=${a},${b}`)
 assert.deepEqual(bulk.result,{mode:'all',channelIds:[a,b]});assert.deepEqual(bulk.updates,['/?internal_test=1'])
 for(const query of [`reminder=discovery&channel=${a}&channels=${b}`,`reminder=discovery&channels=${a},${a}`,`reminder=discovery&channel=bad`,`reminder=discovery&channels=${Array(7).fill(a).join(',')}`])assert.equal(parse(query).result,null)
 assert.equal(parse(`reminder=discovery&channel=${a}`,false).result,null)
 assert.deepEqual(parse(`reminder=discovery&channel=${a}&video=abcdefghijk`).updates,[])
})
test('bulk addition is sequential, skips owned channels and stops after profile change or a failed save',async()=>{
 const state={config:{channels:[{id:a}]}};const progress=[];const writes=[]
 const result=await addRecommendedChannels({channels:[{channelId:a},{channelId:b}],read:()=>state,isCurrent:()=>true,progress:(...args)=>progress.push(args),add:async channel=>{writes.push(channel.channelId);state.config.channels.push({id:channel.channelId})}})
 assert.deepEqual(result,{added:1,skipped:1,stopped:false});assert.deepEqual(writes,[b]);assert.equal(progress[0][1],2)
 assert.equal((await addRecommendedChannels({channels:[{channelId:'missing'}],read:()=>state,isCurrent:()=>true,progress:()=>{},add:()=>{}})).stopped,true)
 assert.deepEqual(await addRecommendedChannels({channels:[{channelId:b}],read:()=>state,isCurrent:()=>false,progress:()=>assert.fail(),add:()=>assert.fail()}),{added:0,skipped:0,stopped:true})
})
