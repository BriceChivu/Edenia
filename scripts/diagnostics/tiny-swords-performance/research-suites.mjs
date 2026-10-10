// Native-density crossover experiments. Imported by the existing local runner.
export async function research({suite,setup,inventorySample,sample,flags,worldClick,results,out,writeFile}) {
 const option=(key,fallback)=>process.argv.find(x=>x.startsWith(`--${key}=`))?.split('=')[1]??fallback;
 const seconds=Number(option('seconds',12)),repeat=Number(option('repeat',2));
 const cpu=Number(option('cpu',1));
 const inventory=process.argv.includes("--inventory");let moving=false;
 const capture=async(s,label)=>{
  const b=await s.page.locator("iframe").boundingBox();moving=inventory;
  const motion=(async()=>{let i=0;while(moving){const t=i++/30;await s.page.mouse.move(b.x+b.width*(.5+.28*Math.sin(t)),b.y+b.height*(.48+.25*Math.cos(t)));await new Promise(r=>setTimeout(r,16));}})();
  let row;try{row=await inventorySample(s.page,label,seconds);}finally{moving=false;await motion;}
  row.cpuThrottle=cpu;row.dpr=await s.gf.evaluate(()=>devicePixelRatio);
  row.game=await s.gf.evaluate(()=>({staticClouds:window.__perfFlags?.static_original_clouds===true,actualCloudMode:window.__cloudResearchApplied,frameInterval:window.edeniaFrameInterval,pixelRatioPolicy:window.edeniaMaxPixelRatio,camera:window.edeniaCamera}));
  row.scenario=inventory?"inventory-moving":row.game.camera?.editing?"inventory-stationary":"idle";
  row.frameBudgetPass=row.p99<=25&&row.parent.timerMax<=100;
  console.log(JSON.stringify({label,p95:row.p95,p99:row.p99,timerMax:row.parent.timerMax,
   rendererCPU:row.processes.filter(x=>x.type==='renderer').reduce((n,x)=>n+x.cpuPercent,0),
   canvas:row.canvas,pass:row.frameBudgetPass}));return row;
 };
 const attach=async s=>{const c=await s.context.newCDPSession(s.page);await c.send('Emulation.setCPUThrottlingRate',{rate:cpu});return c;};
 if(suite==='research-inventory-ui'){
  // Canonical export: no Perf autoload, injected gameplay, or cache flags.
  const mobile=process.argv.includes('--mobile');
  const s=await setup({side:10,mobile,dpr:mobile?3:2});const c=await attach(s);
  if(await s.gf.evaluate(()=>!!window.__godotPerf))throw new Error('UI validation requires an uninstrumented game export');
  const b=await s.page.locator('iframe').boundingBox();
  const opened=inventorySample(s.page,'ui-cold-open',seconds);
  await s.page.waitForTimeout(250);
  await s.page.mouse.click(b.x+b.width-22,b.y+b.height-24);
  await s.gf.waitForFunction(()=>window.edeniaCamera?.editing===true,null,{timeout:5000});
  const opening=await opened;
  if(opening.consoleErrors)throw new Error('Game console errors during inventory opening');
  console.log(JSON.stringify({label:opening.label,p99:opening.p99,timerMax:opening.parent.timerMax,canvas:opening.canvas,errors:opening.consoleErrors}));
  const durable=()=>s.page.evaluate(()=>{const a=loadState().tinySwordsIsland;return JSON.stringify([a.tiles,a.tree_offsets,a.stock,a.resources]);});
  const original=await durable();
  for(let r=0;r<repeat;r++){
   const measurement=inventorySample(s.page,`ui-edit-undo-${r}`,seconds);
   await s.page.waitForTimeout(250);
   await worldClick(s.page,s.gf,672,296);
   await s.page.waitForFunction(()=>loadState().tinySwordsIsland?.tree_offsets?.some(a=>a[0]===2&&a[1]===2&&a[4]==='tree3'),null,{timeout:5000});
   await s.page.mouse.click(b.x+b.width-40,b.y+b.height-44);
   await s.page.waitForFunction(()=>loadState().tinySwordsIsland?.tree_offsets?.some(a=>a[0]===2&&a[1]===2&&a[4]==='tree2'),null,{timeout:5000});
   const row=await measurement;row.actionCount=2;row.dpr=mobile?3:2;row.cpuThrottle=cpu;
   if(row.consoleErrors)throw new Error('Game console errors during inventory edits');
   if(await durable()!==original)throw new Error('UI edit/undo changed retained terrain, trees, stock or resources');
   console.log(JSON.stringify({label:row.label,p99:row.p99,timerMax:row.parent.timerMax,canvas:row.canvas,errors:row.consoleErrors}));
  }
  await s.page.locator('iframe').screenshot({path:out+'/inventory-ui.png'});
  console.log('INVENTORY_UI PASS: actual tree click and Undo button retained the exact durable island');
  await c.detach();await s.context.close();
 }else if(suite==='research-baseline'){
  for(const side of option("sides","6,99").split(",").map(Number))for(const mobile of option("layouts","desktop,phone").split(",").map(x=>x==="phone")){
   const s=await setup({side,mobile,dpr:mobile?3:2});const c=await attach(s);
   for(let r=0;r<repeat;r++){
    await capture(s,`baseline-${side}-${mobile?'phone':'desktop'}-idle-${r}`);
    await s.page.locator('iframe').evaluate(f=>f.contentWindow.postMessage({type:'edenia-camera-command',command:'reset',session:f.contentWindow.edeniaStudySession},location.origin));
    const b=await s.page.locator('iframe').boundingBox();await s.page.mouse.click(b.x+b.width-22,b.y+b.height-24);
    await s.gf.waitForFunction(()=>window.edeniaCamera?.editing===true,null,{timeout:5000});
    await capture(s,`baseline-${side}-${mobile?'phone':'desktop'}-inventory-${r}`);
    await s.gf.locator("canvas").focus();await s.page.keyboard.press("Escape");
    await s.gf.waitForFunction(()=>window.edeniaCamera?.editing===false,null,{timeout:5000});
   }
   await c.detach();await s.context.close();
  }
  const failed=results.filter(x=>!x.frameBudgetPass).length;console.log(`FRAME_PACING ${failed?'FAIL':'PASS'}: ${failed}/${results.length} samples exceeded p99 25ms or timer maximum 100ms`);
  if(process.argv.includes('--assert-budgets')&&failed)process.exitCode=1;
 }else if(suite==='research-probes'){
  const s=await setup({instrument:true,side:Number(option('side',99)),mobile:process.argv.includes('--mobile'),dpr:process.argv.includes('--mobile')?3:2});const c=await attach(s);
  if(inventory){await s.gf.evaluate(()=>window.__perfCommand={type:"inventory",open:true,id:101});await s.gf.waitForFunction(()=>window.__inventoryCommandDone===101,null,{timeout:5000});}
  const probes=option('probes','static_original_clouds,mask_stop,cloud_motion_stop,tree_setter_cache,depth_stop,pawn_idle_skip,trees_stop,animals_stop,bridge_stop').split(',');
  for(let r=0;r<repeat;r++)for(const probe of probes){
   await flags(s.gf,{});await capture(s,`probe-${r}-${probe}-before`);
   await flags(s.gf,{[probe]:true});await capture(s,`probe-${r}-${probe}-enabled`);
   if(r===0)await s.page.locator("iframe").screenshot({path:out+"/"+probe+".png"});
   await flags(s.gf,{});await capture(s,`probe-${r}-${probe}-after`);
  }
  await c.detach();await s.context.close();
 }else if(suite==='research-inventory'){
  const s=await setup({instrument:true,side:10,mobile:process.argv.includes('--mobile'),dpr:process.argv.includes('--mobile')?3:2});const c=await attach(s);
  for(let r=0;r<repeat;r++){
   const row=await inventorySample(s.page,`cold-open-${r}`,seconds,{type:'inventory',open:true,id:200+r});
   console.log(JSON.stringify({label:row.label,p99:row.p99,timerMax:row.parent.timerMax,errors:row.consoleErrors}));
   await s.gf.evaluate(id=>window.__perfCommand={type:'inventory',open:false,id},300+r);await s.gf.waitForFunction(id=>window.__inventoryCommandDone===id,300+r);
  }
  // Edits are valid tree-variant changes plus undo at the generated tree cell.
  const original=await s.page.evaluate(()=>JSON.stringify(loadState().tinySwordsIsland));
  for(let r=0;r<3;r++){
   const measurement=inventorySample(s.page,`edit-undo-${r}`,seconds);
   await s.page.waitForTimeout(250);
   await s.gf.evaluate(id=>window.__perfCommand={type:'batch',count:20,id},400+r);await s.gf.waitForFunction(id=>window.__godotBatchDone===id,400+r);
   const row=await measurement;console.log(JSON.stringify({label:row.label,p99:row.p99,timerMax:row.parent.timerMax,errors:row.consoleErrors}));
  }
  await s.page.waitForTimeout(1500);
  const latest=await s.page.evaluate(()=>loadState().tinySwordsIsland);
  if(JSON.stringify([JSON.parse(original).tiles,JSON.parse(original).stock,JSON.parse(original).resources])!==JSON.stringify([latest.tiles,latest.stock,latest.resources]))throw new Error('Edit/undo changed terrain, stock or resources');
  console.log('INVENTORY_EDIT_UNDO PASS: 120 edits/undo retained terrain, stock and wood');
  await c.detach();await s.context.close();
 }else if(suite==='research-inventory-actions'){
  const s=await setup({instrument:true,side:10});const c=await attach(s);
  await s.gf.evaluate(()=>window.__perfCommand={type:'inventory',open:true,id:600});
  await s.gf.waitForFunction(()=>window.__inventoryCommandDone===600);
  const probe=option('edit-probe','static_original_clouds');
  for(let r=0;r<repeat;r++)for(const mode of ['before','enabled','after']){
   await flags(s.gf,probe==='tree_texture_cache'?{[probe]:mode==='enabled'}:mode==='enabled'?{[probe]:true}:{});
   const measurement=inventorySample(s.page,`single-edit-undo-${r}-${probe}-${mode}`,seconds);
   await s.page.waitForTimeout(250);
   const id=700+r*3+['before','enabled','after'].indexOf(mode);
   await s.gf.evaluate(id=>window.__perfCommand={type:'batch',count:1,id},id);
   await s.gf.waitForFunction(id=>window.__godotBatchDone===id,id);
   const row=await measurement;row.actionCount=2;
   console.log(JSON.stringify({label:row.label,p99:row.p99,timerMax:row.parent.timerMax,errors:row.consoleErrors}));
  }
  await c.detach();await s.context.close();
 }else if(suite==='research-recycle'){
  const s=await setup({instrument:true,side:99});const c=await attach(s);
  for(let r=0;r<repeat;r++)for(const cached of [false,true,false]){
   await flags(s.gf,{cloud_metadata_cached:cached});
   const p=inventorySample(s.page,`recycle-${r}-${cached?'cached':'runtime'}`,seconds);
   for(let i=0;i<3;i++){await s.page.waitForTimeout(1000);await s.gf.evaluate(id=>window.__perfCommand={type:'recycle',id,count:1},1000+r*20+i);await s.gf.waitForFunction(id=>window.__cloudRecycleDone===id,1000+r*20+i);}
   const row=await p;console.log(JSON.stringify({label:row.label,p99:row.p99,timerMax:row.parent.timerMax,errors:row.consoleErrors}));
  }
  await c.detach();await s.context.close();
 }else if(suite==='research-plain'){
  const s=await setup({instrument:true,side:Number(option('side',99)),mobile:process.argv.includes('--mobile'),dpr:process.argv.includes('--mobile')?3:2});const c=await attach(s);
  if(inventory){const b=await s.page.locator("iframe").boundingBox();await s.page.mouse.click(b.x+b.width-22,b.y+b.height-24);await s.gf.waitForFunction(()=>window.edeniaCamera?.editing===true);}
  for(let r=0;r<repeat;r++)for(const mode of ['animated','static','animated']){
   await s.gf.evaluate(mode=>window.__cloudResearchMode=mode,mode);await new Promise(r=>setTimeout(r,1400));
   const row=await capture(s,`plain-${inventory?'inventory':'idle'}-${r}-${mode}`);row.cloudMode=mode;
   if(mode==='static')await s.gf.waitForFunction(()=>window.__cloudResearchApplied==='static');
  }
  await c.detach();await s.context.close();
 }else if(suite==='research-soak'){
  const s=await setup({instrument:true,side:99});const c=await attach(s);
  for(let i=0;i<Number(option('samples',10));i++)await capture(s,`soak-${i}`);
  await c.detach();await s.context.close();
 }
 await writeFile(out+'/'+suite+'.json',JSON.stringify(results,null,2));
}
