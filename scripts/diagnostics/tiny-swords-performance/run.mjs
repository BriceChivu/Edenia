import {chromium} from 'playwright';
import {createServer} from 'node:http';
import {readFile,writeFile,mkdir,readdir} from 'node:fs/promises';
import {resolve,extname} from 'node:path';
const suite=process.argv.find(a=>a.startsWith('--suite='))?.split('=')[1]||'causal';
const checkpointSuite=suite==='checkpoints'||suite==='checkpoint-game';
const root=process.cwd(), out=resolve('.cache/tiny-swords-perf');let variant='original';
const siteRoot=resolve(process.argv.find(a=>a.startsWith('--site='))?.slice(7)||'_site');
const releases=await readdir(resolve(siteRoot,'tiny-swords-game'));if(releases.length!==1)throw new Error('Build one integrated Tiny Swords release first');
const gamePrefix='/tiny-swords-game/'+releases[0]+'/';
const server=createServer(async(req,res)=>{try{
 const u=new URL(req.url,'http://localhost'); let p=u.pathname==='/'?'/index.html':u.pathname;
 let body; if(p==='/alone.html'){body=Buffer.from('<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><style>body{margin:0}iframe{width:min(1054px,100vw);height:454px;border:0;display:block}</style><iframe src="'+gamePrefix+'index.html"></iframe>')}else body=await readFile(p.startsWith(gamePrefix)&&variant==='instrument'&&!p.endsWith('/parent.js')?resolve(out,'export3',p.split('/').at(-1)):resolve(siteRoot,'.'+p));
 if(!process.argv.includes('--plain')&&variant==='original'&&p.startsWith(gamePrefix)&&/\.(wasm|pck)$/.test(p)&&req.headers['accept-encoding']?.includes('br')){
  try{body=await readFile(resolve(siteRoot,'.'+p+'.br'));res.setHeader('Content-Encoding','br');res.setHeader('Vary','Accept-Encoding');}catch{}
 }
 if(p.endsWith('.js'))body=Buffer.from(body.toString().replaceAll('8037','8047'));
 if(p==='/index.html'&&u.searchParams.has('nogame'))body=Buffer.from(body.toString().replace(/<script src="tiny-swords-game\/[^"]+\/parent.js" defer><\/script>/,''));
 res.setHeader('Content-Type',({'.html':'text/html','.js':'text/javascript','.wasm':'application/wasm','.css':'text/css','.json':'application/json','.png':'image/png'})[extname(p)]||'application/octet-stream');res.end(body);
 }catch{res.writeHead(404);res.end();}});await new Promise(r=>server.listen(8047,'127.0.0.1',r));
const browser=await chromium.launch({headless:false,channel:process.argv.includes('--chrome')?'chrome':undefined,args:['--no-first-run']});
const global=await browser.newBrowserCDPSession();await global.send('SystemInfo.getInfo').then(r=>writeFile(out+'/gpu.json',JSON.stringify(r.gpu,null,2)));
const results=[]; const {execFileSync}=await import('node:child_process');
async function sample(page,label,seconds=10,profile=false){
 const c=await page.context().newCDPSession(page);await c.send('Performance.enable');
 if(profile){await c.send('Profiler.enable');await c.send('Profiler.start');}
 await page.evaluate(()=>{window.__perf=[];window.__last=performance.now();window.__run=true;const tick=t=>{if(!window.__run)return;window.__perf.push(t-window.__last);window.__last=t;requestAnimationFrame(tick)};requestAnimationFrame(tick)});
 const a=await global.send('SystemInfo.getProcessInfo'),m1=await c.send('Performance.getMetrics'); const start=Date.now();const gf=page.frames().find(f=>f.url().includes('/tiny-swords-game/'));if(gf)await gf.evaluate(()=>window.__godotSamples=[]);
 await new Promise(r=>setTimeout(r,seconds*1000));
 const b=await global.send('SystemInfo.getProcessInfo'),m2=await c.send('Performance.getMetrics');
 const frames=await page.evaluate(()=>{window.__run=false;const d=window.__perf.filter(x=>x>0).sort((a,b)=>a-b);return {rafFrames:d.length,p50:d[Math.floor(d.length*.5)],p95:d[Math.floor(d.length*.95)],visibility:document.visibilityState,dpr:devicePixelRatio}});
 const processes=b.processInfo.map(p=>({...p,cpuPercent:100*(p.cpuTime-(a.processInfo.find(x=>x.id===p.id)?.cpuTime||p.cpuTime))/((Date.now()-start)/1000)}));
 const extras=gf?await gf.evaluate(()=>({samples:window.__godotSamples||[],canvas:[document.getElementById('canvas').width,document.getElementById('canvas').height],css:[innerWidth,innerHeight],wasmBytes:window.__memories?.map(m=>m.buffer.byteLength),glQueries:window.__gl,consoleErrors:window.__errorCount||0})):{};const rss=processes.map(p=>{try{return {id:p.id,type:p.type,rssKiB:Number(execFileSync('ps',['-p',String(p.id),'-o','rss=']).toString().trim())}}catch{return {id:p.id}}});const row={label,...extras,rss,seconds:(Date.now()-start)/1000,...frames,processes,metrics:Object.fromEntries(m2.metrics.map(m=>[m.name,m.value-(m1.metrics.find(x=>x.name===m.name)?.value||0)])),heap:m2.metrics.filter(m=>m.name.includes('Heap'))};results.push(row);
 if(profile){const p=await c.send('Profiler.stop');await writeFile(out+'/'+label+'.cpuprofile',JSON.stringify(p.profile));}
 await c.detach();console.log(JSON.stringify(row));await writeFile(out+'/'+suite+'.json',JSON.stringify(results,null,2));return row;
}
async function inventorySample(page,label,seconds=8,command=null){
 const c=await page.context().newCDPSession(page);await c.send('Performance.enable');
 const profiled=process.argv.includes('--profile');if(profiled){await c.send('Profiler.enable');await c.send('Profiler.start');}
 const a=await global.send('SystemInfo.getProcessInfo');const cpuStart=Date.now();
 const measured=await page.evaluate(({seconds,command})=>new Promise(resolve=>{
  const game=document.querySelector('iframe.tiny-swords-frame').contentWindow;
  game.__godotSamples=[];game.__longTasks=[];if(command)game.__perfCommand=command;const frameTimes=[],timers=[],longTasks=[];let running=true,previousFrame=performance.now(),previousTimer=previousFrame;const started=previousFrame;
  const observer=new PerformanceObserver(list=>longTasks.push(...list.getEntries().map(e=>({at:e.startTime,ms:e.duration}))));observer.observe({type:'longtask'});
  const frame=t=>{if(!running)return;frameTimes.push(t-previousFrame);previousFrame=t;requestAnimationFrame(frame)};requestAnimationFrame(frame);
  const timer=()=>{if(!running)return;const now=performance.now();timers.push(now-previousTimer);previousTimer=now;setTimeout(timer,16)};setTimeout(timer,16);
  setTimeout(()=>{running=false;observer.disconnect();const ended=performance.now();const quantile=(a,p)=>{a.sort((x,y)=>x-y);return a[Math.floor((a.length-1)*p)]};
   resolve({seconds:(ended-started)/1000,rafFrames:frameTimes.length,p50:quantile(frameTimes,.5),p95:quantile(frameTimes,.95),p99:quantile(frameTimes,.99),parent:{timerP95:quantile(timers,.95),timerP99:quantile(timers,.99),timerMax:Math.max(...timers),longTasks:longTasks.filter(t=>t.at>=started&&t.at<=ended)},gameLongTasks:(game.__longTasks||[]).filter(t=>t.at+game.performance.timeOrigin>=started+performance.timeOrigin&&t.at+game.performance.timeOrigin<=ended+performance.timeOrigin),samples:game.__godotSamples,canvas:[game.document.getElementById('canvas').width,game.document.getElementById('canvas').height],consoleErrors:game.__errorCount||0,visibility:document.visibilityState});
  },seconds*1000);
 }),{seconds,command});
 const b=await global.send('SystemInfo.getProcessInfo');const cpuSeconds=(Date.now()-cpuStart)/1000;
 const processes=b.processInfo.map(p=>({...p,cpuPercent:100*(p.cpuTime-(a.processInfo.find(x=>x.id===p.id)?.cpuTime||p.cpuTime))/cpuSeconds}));
 const row={label,...measured,cpuSeconds,cpuTimingReliable:Math.abs(cpuSeconds-measured.seconds)<1,processes};results.push(row);
 if(profiled){const result=await c.send('Profiler.stop');await writeFile(out+'/'+label+'.cpuprofile',JSON.stringify(result.profile));}
 await c.detach();await writeFile(out+'/'+suite+'.json',JSON.stringify(results,null,2));return row;
}
const fixture=JSON.parse(await readFile('tests/fixtures/tiny-swords-populated-island.json'));
function island(side=0,animals=true){if(!side)return null;const a=structuredClone(fixture);a.tiles=[];a.tree_offsets=[];a.tree_cut_remaining=[];a.house_bundle=0;a.decorations=[];a.stock.meadow=1000;a.stock.tree=100;a.level=7;
for(let y=side===20?-9:0;y<(side===20?11:side);y++)for(let x=0;x<side;x++){const tree=(x%3===2&&y%3===2);a.tiles.push([x,y,'meadow',tree,0,0,0]);if(tree)a.tree_offsets.push([x,y,0,0,'tree2']);}
a.chickens=animals?[[608,272]]:[];a.sheep=animals?[[672,208]]:[];a.version=24;a.playground_grants={ground:a.tiles.length+Object.entries(a.stock).filter(([k])=>['meadow','gold','high_gold','high_meadow','violet','stairs'].includes(k)).reduce((n,[k,v])=>n+v*(k==='stairs'?2:1),0)-27,tree:a.tree_offsets.length+a.stock.tree-2,sheep:a.sheep.length+a.stock.sheep-1,chicken:a.chickens.length+a.stock.chicken-1};return a;}
function natural(){const a=structuredClone(fixture);a.level=10;a.tiles=[];a.tree_offsets=[];a.tree_cut_remaining=[];a.house_bundle=0;a.decorations=[];for(const k of Object.keys(a.stock))a.stock[k]=0;a.stock.bridge=1;for(let y=0;y<6;y++)for(let x=0;x<6;x++){const tree=(x===2&&y===2)||(x===5&&y===5);a.tiles.push([x,y,'meadow',tree,0,0,0]);if(tree)a.tree_offsets.push([x,y,0,0,'tree2']);}a.chickens=[[608,272]];a.sheep=[[672,208]];return a;}
async function setup({mode='integrated',side=0,dpr=2,instrument=false,channels=0,videos=0,mobile=false,slow=false}={}){
 variant=instrument?'instrument':'original'; const context=await browser.newContext({viewport:mobile?{width:393,height:852}:{width:1440,height:1000},deviceScaleFactor:dpr,isMobile:mobile,hasTouch:mobile});const page=await context.newPage();page.on('console',m=>{if(m.text().includes('ERROR')||m.type()==='error')console.log('GAME_CONSOLE',m.text().slice(0,300))});
 if(slow){const network=await context.newCDPSession(page);await network.send('Network.enable');await network.send('Network.emulateNetworkConditions',{offline:false,latency:100,downloadThroughput:1250000,uploadThroughput:1250000});}
 await page.addInitScript(()=>{window.__memories=[];for(const k of ['instantiate','instantiateStreaming']){const original=WebAssembly[k];WebAssembly[k]=async function(...args){const result=await original.apply(WebAssembly,args);const exports=result.instance?.exports||result.exports;for(const v of Object.values(exports||{}))if(v instanceof WebAssembly.Memory)window.__memories.push(v);return result}};window.__errorCount=0;const e=console.error;console.error=function(...args){window.__errorCount++;return e.apply(console,args)};window.__gl={};for(const C of [WebGLRenderingContext,WebGL2RenderingContext]){const get=C.prototype.getParameter;C.prototype.getParameter=function(p){const t=performance.now();const r=get.call(this,p);const k=String(p);const v=window.__gl[k]||{calls:0,ms:0};v.calls++;v.ms+=performance.now()-t;window.__gl[k]=v;return r;}};window.__longTasks=[];new PerformanceObserver(l=>window.__longTasks.push(...l.getEntries().map(e=>({at:e.startTime,ms:e.duration})))).observe({type:'longtask',buffered:true});if(navigator.serviceWorker)Object.defineProperty(navigator.serviceWorker,'getRegistration',{value:async()=>undefined})});
 await page.route('**/*',r=>new URL(r.request().url()).hostname==='127.0.0.1'?r.continue():r.abort());
 if(checkpointSuite)await page.route('**/config.local.js*',r=>r.fulfill({contentType:'text/javascript',body:'window.EDENIA_CONFIG={tinySwordsEnabled:true,accountFeaturesRollout:"off",learnerProfileLifecycleEnabled:false,indexedDbProfileEnabled:true,indexedDbBackupsEnabled:true}'}));
 const target='http://127.0.0.1:8047/'+(mode==='nogame'?'?nogame':''); const islandPath=process.argv.find(a=>a.startsWith('--island='))?.slice(9); const a=islandPath?JSON.parse(await readFile(islandPath)):side===98?JSON.parse(await readFile(out+'/stair-fixture.json')):side===99?JSON.parse(await readFile(out+'/terraced-fixture.json')):side===6?natural():island(side);
 const navigationBegan=Date.now();
 if(mode==='alone'){
 await page.addInitScript(a=>{window.addEventListener('DOMContentLoaded',()=>{window.edeniaStudySession=1;window.edeniaStudyReady=true;window.edeniaStudyLevel=a?7:1;window.edeniaStudyLayout=a})},a);await page.goto('http://127.0.0.1:8047/alone.html');
 }else{
 await page.route('**/tiny-swords-game/*/index.html',r=>r.fulfill({contentType:'text/html',body:'<!doctype html>'}));await page.goto(target);await page.locator('#mainApp').waitFor({state:'visible'});
 const seeded=await page.evaluate(async({a,channels,videos,checkpointSuite})=>{const state=checkpointSuite?loadState():defaultState(4,[],'light',[],'en');const at=new Date().toISOString();state.onboarding={...state.onboarding,introSeenAt:at,setupCompleted:true,setupCompletedAt:at,walkthroughCompleted:true,walkthroughCompletedAt:at};state.config.ankiEnabled=false;state.tinySwordsIsland=a;state.config.channels=[];state.videos={};for(let c=0;c<channels;c++){const channelId='UC'+String(c).padStart(22,'0');state.config.channels.push({id:channelId,name:'Synthetic channel '+c,metadataFetchedAt:at});for(let n=0;n<videos;n++){const id='P'+String(c*videos+n).padStart(10,'0');state.videos[id]={id,title:'Synthetic video '+n+' '+ 'Language practice vocabulary and conversation '.repeat(2),channelId,channelTitle:'Synthetic channel '+c,duration:600,aspectRatio:16/9,metadataFetchedAt:at,publishedAt:at,status:'unwatched',watchProgress:[]}}}const json=JSON.stringify(state);try{const t=performance.now();const ok=await saveState(state,{backup:false,syncAnalytics:false,pruneBackups:false});return {ok,seedMs:performance.now()-t,inputBytes:new TextEncoder().encode(json).length,bytes:localStorage.getItem('edenia_v1')?.length,videos:Object.keys(state.videos).length}}catch(e){return {error:e.name,bytes:new TextEncoder().encode(json).length}}},{a,channels,videos,checkpointSuite});console.log('SEED',seeded);if(seeded.error){await context.close();return null;}
 await page.unroute('**/tiny-swords-game/*/index.html');await page.reload();
 }
 const gf=mode==='nogame'?null:page.frames().find(f=>f.url().includes('/tiny-swords-game/'));
 const start=Date.now();if(gf){try{await gf.waitForFunction(()=>window.edeniaGameLevel>=1,null,{timeout:60000});if(instrument)await gf.waitForFunction(()=>window.__godotPerf?.tiles>0,null,{timeout:60000})}catch(e){console.log('RESTORE DEBUG',await gf.evaluate(()=>({level:window.edeniaGameLevel,perf:window.__godotPerf,body:document.body.innerText})),await page.locator('.tiny-swords-save-status').innerText());throw e;}}
 const startup={readyAfterLoadMs:Date.now()-start,totalFromNavigationMs:Date.now()-navigationBegan,resources:gf?await gf.evaluate(()=>performance.getEntriesByType('resource').filter(x=>/wasm|pck|index.js/.test(x.name)).map(x=>({name:x.name.split('/').at(-1),duration:x.duration,transfer:x.transferSize,decoded:x.decodedBodySize}))):[]};console.log('STARTUP',startup);
 await new Promise(r=>setTimeout(r,6000));return {context,page,gf,startup};
}
async function flags(gf,value){await gf.evaluate(v=>window.__perfFlags=v,value);await new Promise(r=>setTimeout(r,1400));}
async function worldClick(page,gf,x,y){const c=await gf.evaluate(()=>window.edeniaCamera);const bounds=await page.locator('iframe').boundingBox();await page.mouse.click(bounds.x+((x-c.x)*c.zoom+c.width/2)*bounds.width/c.width,bounds.y+((y-c.y)*c.zoom+c.height/2)*bounds.height/c.height);}
try {
 if(suite==='gate'||suite==='baseline') {
  for(const mode of suite==='gate'?['integrated']:['nogame','integrated','alone']) {
   const s=await setup({mode});await sample(s.page,mode+'-idle',10,suite!=='gate');
   if(mode==='integrated'){
    await s.page.evaluate(()=>{document.body.append(Object.assign(document.createElement('div'),{style:'height:2000px'}));scrollTo(0,1500)});
    const bounds=await s.page.locator('iframe.tiny-swords-frame').boundingBox();if(bounds.y+bounds.height>=0)throw new Error('Offscreen fixture failed');
    if(suite==='gate')await s.gf.waitForFunction(()=>window.edeniaPresentationSuspended===true,null,{timeout:5000});
    const queriesBefore=await s.gf.evaluate(()=>window.__gl['36006']?.calls||0);
    const row=await sample(s.page,'integrated-offscreen',10,suite!=='gate');const cpu=row.processes.filter(p=>p.type==='renderer').reduce((n,p)=>n+p.cpuPercent,0);
    if(suite==='gate'){
     const queriesAfter=await s.gf.evaluate(()=>window.__gl['36006']?.calls||0);
     if(queriesAfter!==queriesBefore)throw new Error('Suspended island continued WebGL frame presentation');
     await s.page.evaluate(()=>scrollTo(0,0));
     await s.gf.waitForFunction(before=>window.edeniaPresentationSuspended===false&&(window.__gl['36006']?.calls||0)>before,queriesAfter,{timeout:5000});
     await s.page.evaluate(()=>scrollTo(0,1500));
     await s.gf.waitForFunction(()=>window.edeniaPresentationSuspended===true,null,{timeout:5000});
     console.log('OFFSCREEN_RESUME PASS: same frame resumed WebGL presentation and suspended again');
    }
    await s.page.locator('iframe.tiny-swords-frame').evaluate(frame=>frame.remove());await new Promise(r=>setTimeout(r,6000));const control=await sample(s.page,'iframe-removed-control',10,suite!=='gate');const controlCpu=control.processes.filter(p=>p.type==='renderer').reduce((n,p)=>n+p.cpuPercent,0);const excess=Math.max(0,cpu-controlCpu);const pass=excess<=5;console.log(`OFFSCREEN_BUDGET ${pass?'PASS':'FAIL'}: ${cpu.toFixed(1)}% total renderer CPU, ${controlCpu.toFixed(1)}% without iframe, ${excess.toFixed(1)}% excess, budget 5% of one core`);
    if(process.argv.includes('--assert-budgets')&&!pass)process.exitCode=1;
   }
   await s.context.close();
  }
 } else if(suite==='causal') {
  const s=await setup({instrument:true,side:10});
  for(const [label,value] of [['base',{}],['terrain-stop',{terrain_stop:true}],['terrain5',{terrain_hz:5}],['bridge-stop',{bridge_stop:true}],['animals-stop',{animals_stop:true}],['base-repeat',{}]]){await flags(s.gf,value);await sample(s.page,label,10,true);}
  await s.gf.evaluate(()=>window.__perfCommand={type:'edit'});await new Promise(r=>setTimeout(r,1200));await sample(s.page,'editor',10,true);await flags(s.gf,{preview_stop:true});await sample(s.page,'editor-no-preview',10,true);await flags(s.gf,{});await sample(s.page,'editor-repeat',10,true);await s.context.close();
 } else if(suite==='inventory-lag') {
  const side=Number(process.argv.find(a=>a.startsWith('--side='))?.split('=')[1]||99);
  const s=await setup({instrument:true,side});
  const bounds=await s.page.locator('iframe.tiny-swords-frame').boundingBox();
  const motion=async()=>{let i=0;while(moving){const phase=(i++%120)/120*Math.PI*2;await s.page.mouse.move(bounds.x+bounds.width*(.5+.26*Math.sin(phase)),bounds.y+bounds.height*(.48+.30*Math.cos(phase)));await new Promise(r=>setTimeout(r,16));}};
  let moving=false,commandId=0;
  const coldProbe=process.argv.find(a=>a.startsWith('--cold-probe='))?.slice(13);
  let conditions=[['open-cold',true,false,coldProbe?{[coldProbe]:true}:{}],['closed-moving',false,true,{}],['open-moving',true,true,{}],['open-clouds-hidden',true,true,{clouds_hidden:true}],['open-moving-repeat',true,true,{}],['open-preview-stopped',true,true,{preview_stop:true}],['open-outlines-stopped',true,true,{outlines_stop:true}],['open-mask-stopped',true,true,{mask_stop:true}],['open-ratio1',true,true,{pixel_ratio:1}],['open-moving-final',true,true,{pixel_ratio:2}],['closed-moving-repeat',false,true,{}]];
  if(process.argv.includes('--cold-only'))conditions=conditions.slice(0,1);
  const tag=process.argv.find(a=>a.startsWith('--tag='))?.slice(6)||'';
  for(const[label,open,move,value]of conditions){
   await flags(s.gf,value);
   const command={type:'inventory',open,id:++commandId};
   if(label!=='open-cold'){
    await s.gf.evaluate(v=>window.__perfCommand=v,command);
    await s.gf.waitForFunction(id=>window.__inventoryCommandDone===id,commandId,{timeout:10000});
    await new Promise(r=>setTimeout(r,1500));
   }
   await s.page.mouse.move(bounds.x+bounds.width/2,bounds.y+bounds.height/2);
   moving=move;const motionPromise=move?motion():Promise.resolve();
   const row=await inventorySample(s.page,`${side}-${label}${tag?'-'+tag:''}`,8,label==='open-cold'?command:null);
   moving=false;await motionPromise;
   console.log('LAG',JSON.stringify({label:row.label,seconds:row.seconds,rafP95:row.p95,timerP95:row.parent.timerP95,timerP99:row.parent.timerP99,timerMax:row.parent.timerMax,longTasks:row.parent.longTasks.length,cpuReliable:row.cpuTimingReliable,cpu:row.processes.filter(p=>p.type==='renderer').reduce((n,p)=>n+p.cpuPercent,0),canvas:row.canvas}));
   await writeFile(out+'/inventory-lag-'+side+(tag?'-'+tag:'')+'.json',JSON.stringify(results,null,2));
  }
  const lagging=results.filter(r=>r.label.includes('open-moving')||r.label.includes('open-cold')).some(r=>r.p99>50||r.parent.timerMax>100||r.parent.timerP95>50);
  console.log('INVENTORY_LAG',lagging?'REPRODUCED':'NOT_REPRODUCED');
  if(process.argv.includes('--assert-budgets')&&lagging)process.exitCode=1;
  await s.context.close();
 } else if(suite==='inventory') {
  const s=await setup({instrument:true,side:10});
  await s.gf.evaluate(()=>window.__perfCommand={type:'edit'});
  await s.gf.waitForFunction(()=>window.__godotPerf?.editing===true,null,{timeout:5000});
  await s.page.mouse.move(600,150);
  for(const[label,uncached]of [['inventory-uncached',true],['inventory-cached',false],['inventory-uncached-repeat',true],['inventory-cached-repeat',false]]){
   await flags(s.gf,{inventory_uncached:uncached});await sample(s.page,label,10,true);
  }
  await s.context.close();
 } else if(suite==='startup') {
  for(const config of [{dpr:1},{dpr:2},{dpr:3,mobile:true},{dpr:3,mobile:true,slow:true}]){
   const s=await setup({mode:'alone',...config});
   results.push({config,startup:s.startup,...await s.gf.evaluate(()=>({canvas:[canvas.width,canvas.height],maxPixelRatio:window.edeniaMaxPixelRatio,errors:window.__errorCount||0}))});
   await writeFile(out+'/startup.json',JSON.stringify(results,null,2));await s.context.close();
  }
 } else if(suite==='remaining') {
  const s=await setup({instrument:true,side:10});
  for(const[label,value]of [['forced-redraw',{terrain_uncached:true,mask_uncached:true,raf_interval:1}],['cached',{raf_interval:1}],['forced-mask',{mask_uncached:true,raf_interval:1}],['raf-divisor-2',{raf_interval:2}],['cached-repeat',{raf_interval:1}]]){
   await flags(s.gf,value);const row=await sample(s.page,label,10,true);
   if(row.consoleErrors)throw new Error('Remaining-work sample emitted console errors');
  }
  await s.context.close();
 } else if(suite==='soak') {
  const s=await setup({instrument:true,side:10}),memory=[];
  const original=await s.page.evaluate(()=>{const l=loadState().tinySwordsIsland;return JSON.stringify([l.tiles,l.tree_offsets,l.stock,l.resources]);});
  for(let batch=0;batch<50;batch++){
   await s.gf.evaluate(id=>window.__perfCommand={type:'batch',count:10,id},batch);
   await s.gf.waitForFunction(id=>window.__godotBatchDone===id,batch,{timeout:10000});
   await s.page.waitForTimeout(100);
   if(batch%5===4){await s.page.waitForTimeout(1200);memory.push({actions:(batch+1)*20,data:await s.gf.evaluate(()=>({perf:window.__godotPerf,wasm:window.__memories.map(m=>m.buffer.byteLength),errors:window.__errorCount}))});}
  }
  await s.page.waitForTimeout(3000);
  memory.push({actions:1000,data:await s.gf.evaluate(()=>({perf:window.__godotPerf,wasm:window.__memories.map(m=>m.buffer.byteLength),errors:window.__errorCount}))});
  await writeFile(out+'/soak-cycles.json',JSON.stringify(memory,null,2));
  if(memory.some(x=>x.data.errors))throw new Error('Soak emitted console errors');
  const retained=await s.page.evaluate(()=>{const l=loadState().tinySwordsIsland;return JSON.stringify([l.tiles,l.tree_offsets,l.stock,l.resources]);});
  if(retained!==original)throw new Error('Soak edits/undo changed retained terrain or inventory');
  const warm=memory.find(x=>x.actions>=200).data.perf,final=memory.at(-1).data.perf;
  for(const key of ['nodes','resources','objects'])if(final[key]>warm[key]*1.1)throw new Error('Soak retained '+key+' grew by more than 10% after warmup');
  console.log('SOAK PASS: 1000 tree edits/undo operations completed; inspect retained-resource samples');
  await s.context.close();
 } else if(suite==='cloud') {
  for(const dpr of [2,1]){const s=await setup({instrument:true,side:10,dpr});for(const[label,value]of [['base',{}],['mask-stop',{mask_stop:true}],['mask5',{mask_hz:5}],['base-repeat',{}]]){await flags(s.gf,value);await sample(s.page,`dpr${dpr}-${label}`,10,true);}await s.context.close();}
 } else if(suite==='shadows') {
  for(const side of [99,98]){const s=await setup({instrument:true,side});for(const[label,value]of [['base',{}],['shadow-stop',{shadow_stop:true}],['shadow-cache',{shadow_cache:true}],['base-repeat',{}]]){await flags(s.gf,value);await sample(s.page,'shadows-'+side+'-'+label,10,true);}await s.context.close();}
 } else if(suite==='caps') {
  const s=await setup({instrument:true,side:10});for(const cap of [0,60,30,10,0]){await flags(s.gf,{cap});await sample(s.page,'cap-'+cap,10,true)}await s.context.close();
 } else if(suite==='library') {
  for(const channels of [0,10,30,60,100]) {
   const s=await setup({instrument:true,channels,videos:300});if(!s)continue;
   const meta=await s.page.evaluate(()=>({channels:loadState().config.channels.length,videos:Object.keys(loadState().videos).length,bytes:localStorage.getItem('edenia_v1').length}));
   if(meta.videos!==channels*300){console.log('CORPUS_REJECTED',channels,meta);await s.context.close();continue;}
   await sample(s.page,'library-'+channels*300+'-idle',10,true);
   const c=await s.page.context().newCDPSession(s.page);await c.send('Profiler.enable');await c.send('Profiler.start');
   const saves=await s.page.evaluate(async()=>{const saves=[];window.__longTasks=[];for(let i=0;i<8;i++){const st=loadState(),layout=structuredClone(st.tinySwordsIsland);layout.stock.meadow+=1;const t=performance.now();const ok=await edeniaTinySwordsPersistence.save(layout,JSON.stringify(st.tinySwordsIsland));saves.push({ms:performance.now()-t,ok});await new Promise(r=>setTimeout(r,200));}return {saves,longTasks:__longTasks,channels:loadState().config.channels.length,videos:Object.keys(loadState().videos).length,bytes:localStorage.getItem('edenia_v1').length,cards:document.querySelectorAll('.video-card').length,nodes:document.querySelectorAll('*').length}});
   await writeFile(out+'/library-'+channels*300+'-saves.json',JSON.stringify(saves,null,2));await writeFile(out+'/library-'+channels*300+'-saves.cpuprofile',JSON.stringify((await c.send('Profiler.stop')).profile));await c.detach();
   await s.page.mouse.wheel(0,1400);await sample(s.page,'library-'+channels*300+'-scroll',10,true);await s.context.close();
  }
 } else if(suite==='checkpoints') {
  for(const channels of [0,60,100]) {
   const s=await setup({mode:'nogame',channels,videos:300});if(!s)continue;
   const measured=await s.page.evaluate(async fixture=>{
    const before=loadState();const channels=before.config.channels.length,videos=Object.keys(before.videos).length;
    const times=[];let island=edeniaTinySwordsPersistence.readIsland().tinySwordsIsland;
    for(let i=0;i<21;i++){
     const expected=JSON.stringify(island);island={...(island||fixture),diagnosticCheckpoint:i};
     const started=performance.now();const ok=await edeniaTinySwordsPersistence.save(island,expected);const ms=performance.now()-started;
     if(!ok)throw new Error('Synthetic checkpoint rejected');times.push(ms);
     island=edeniaTinySwordsPersistence.readIsland().tinySwordsIsland;
    }
    const after=loadState();return {channels,videos,retainedChannels:after.config.channels.length,retainedVideos:Object.keys(after.videos).length,
     profileChars:JSON.stringify(after).length,firstMs:times.shift(),warmMs:times,latest:after.tinySwordsIsland.diagnosticCheckpoint};
   },fixture);
   if(measured.retainedChannels!==channels||measured.retainedVideos!==channels*300||measured.latest!==20)throw new Error('Synthetic library lost data');
   results.push(measured);console.log('CHECKPOINTS',JSON.stringify(measured));await writeFile(out+'/checkpoints.json',JSON.stringify(results,null,2));await s.context.close();
  }
 } else if(suite==='checkpoint-game') {
  const s=await setup();await s.gf.waitForFunction(()=>window.edeniaLastSavePersisted===true,null,{timeout:15000});
  const before=await s.page.evaluate(()=>loadState().tinySwordsIsland);
  const session=await s.gf.evaluate(()=>window.edeniaStudySession);
  const studySaved=await s.page.evaluate(async()=>{const state=loadState();state.anki['2026-10-05']={reviewed:12,created:3};return await saveState(state,{backup:false,syncAnalytics:false,pruneBackups:false});});
  if(!studySaved||await s.gf.evaluate(()=>window.edeniaStudySession)!==session)throw new Error('Study save replaced the active island frame');
  await s.page.reload();const gf=s.page.frames().find(f=>f.url().includes('/tiny-swords-game/'));
  await gf.waitForFunction(()=>window.edeniaGameLevel>=1&&window.edeniaLastSavePersisted===true,null,{timeout:60000});
  const after=await s.page.evaluate(()=>loadState());
  if(JSON.stringify(before.tiles)!==JSON.stringify(after.tinySwordsIsland.tiles)||JSON.stringify(before.resources)!==JSON.stringify(after.tinySwordsIsland.resources)||after.anki['2026-10-05'].reviewed!==12)throw new Error('Game restore lost island or study facts');
  console.log('CHECKPOINT_GAME PASS: real Godot save acknowledgment, ordinary study save, and reload retained island and study facts');
  await s.context.close();
 } else if(suite==='growth') {
  for(const side of [0,6,10,20,99]){const s=await setup({instrument:true,side});await sample(s.page,'side-'+side,10,true);await s.context.close()}
 } else if(suite==='offscreen-actions') {
  const s=await setup({instrument:true,side:10});
  const durable=()=>s.page.evaluate(()=>loadState().tinySwordsIsland);
  const hide=async()=>{await s.page.evaluate(()=>{if(!document.getElementById('offscreen-spacer'))document.body.append(Object.assign(document.createElement('div'),{id:'offscreen-spacer',style:'height:2000px'}));scrollTo(0,1500)});await s.gf.waitForFunction(()=>window.edeniaPresentationSuspended===true,null,{timeout:5000});};
  const resume=async()=>{await s.page.evaluate(()=>scrollTo(0,0));await s.gf.waitForFunction(()=>window.edeniaPresentationSuspended===false,null,{timeout:5000});};
  await s.gf.evaluate(()=>window.__perfCommand={type:'build',x:3,y:0});
  await s.page.waitForFunction(()=>Object.keys(loadState().tinySwordsIsland?.house_build||{}).length>0,null,{timeout:15000});
  const hiddenMs=Number(process.argv.find(x=>x.startsWith('--hidden-ms='))?.split('=')[1]||21000);
  const building=await durable();await hide();await new Promise(r=>setTimeout(r,Math.max(21000,hiddenMs)));
  if(JSON.stringify((await durable()).house_build)!==JSON.stringify(building.house_build))throw new Error('Suspension altered durable construction before resume');
  await resume();await s.page.waitForFunction(()=>Object.keys(loadState().tinySwordsIsland?.house_build||{}).length===0,null,{timeout:10000});
  const built=await durable();if(built.houses.length!==building.houses.length||built.house_bundle!==0||built.resources.wood!==building.resources.wood)throw new Error('Construction resume lost or duplicated house/logs');
  await s.gf.evaluate(()=>window.__perfCommand={type:'cut',x:2,y:2});
  await s.page.waitForFunction(()=>loadState().tinySwordsIsland?.tree_cut_remaining?.some(x=>x[0]===2&&x[1]===2),null,{timeout:15000});
  const cutting=await durable();await hide();await new Promise(r=>setTimeout(r,11000));
  if((await durable()).resources.wood!==cutting.resources.wood)throw new Error('Tree granted logs without its final swing');
  await resume();await s.page.waitForFunction(()=>loadState().tinySwordsIsland?.tree_stumps?.some(x=>x[0]===2&&x[1]===2),null,{timeout:10000});
  const cut=await durable();if(cut.resources.wood!==cutting.resources.wood+1)throw new Error('Cutting resume lost or duplicated logs');
  console.log('OFFSCREEN_ACTIONS PASS: construction clock/reservation and cutting clock/final swing survived actual suspension');
  await s.context.close();
 } else if(suite==='actions') {
  const s=await setup({instrument:true,side:10});await s.gf.evaluate(()=>window.__perfCommand={type:'build',x:3,y:0});await sample(s.page,'construction',22,true);await s.gf.waitForFunction(()=>window.__godotPerf?.construction===0,null,{timeout:30000});await s.gf.evaluate(()=>window.__perfCommand={type:'cut',x:2,y:2});await sample(s.page,'cutting',15,true);await s.context.close();
 } else if(suite==='memory') {
  const s=await setup({instrument:true,side:10}),memory=[];for(let i=0;i<30;i++){for(const command of [{type:'cycle',x:8,y:8},{type:'edit'},{type:'edit'}]){await s.gf.evaluate(v=>window.__perfCommand=v,command);await new Promise(r=>setTimeout(r,1100));}memory.push({i,data:await s.gf.evaluate(()=>({perf:window.__godotPerf,wasm:window.__memories.map(m=>m.buffer.byteLength)}))})}await writeFile(out+'/memory-cycles.json',JSON.stringify(memory,null,2));await sample(s.page,'after-cycles',10);await s.context.close();
 } else throw new Error('Unknown suite '+suite);
} finally {await browser.close();server.close();}
