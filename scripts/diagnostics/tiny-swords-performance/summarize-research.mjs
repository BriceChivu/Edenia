import {readFile,writeFile} from 'node:fs/promises';
const paths=process.argv.slice(2);const output=[];
const mean=a=>a.reduce((n,x)=>n+x,0)/a.length;
const cpu=row=>row.processes?.filter(x=>x.type==='renderer').reduce((n,x)=>n+x.cpuPercent,0);
for(const path of paths){
 const rows=JSON.parse(await readFile(path));
 for(let i=0;i+2<rows.length;i+=3){
  const [before,on,after]=rows.slice(i,i+3);
  if(!on.label?.endsWith('-enabled')&&!on.label?.endsWith('-static'))continue;
  const controls=mean([cpu(before),cpu(after)]);
  const timings={};for(const s of on.samples||[])for(const [k,v] of Object.entries(s.timings||{})){timings[k]??={us:0,calls:0};timings[k].us+=v.us;timings[k].calls+=v.calls;}
  const seconds=on.samples?.reduce((n,s)=>n+s.seconds,0)||on.seconds;
  output.push({file:path,label:on.label,scenario:on.scenario,cpuThrottle:on.cpuThrottle,
   canvas:on.canvas,cpuControl:controls,cpuEnabled:cpu(on),cpuPercentReduction:100*(controls-cpu(on))/controls,
   controlP99:[before.p99,after.p99],enabledP99:on.p99,
   controlTimerMax:[before.parent.timerMax,after.parent.timerMax],enabledTimerMax:on.parent.timerMax,
   fps:mean((on.samples||[]).map(s=>s.fps)),drawCalls:mean((on.samples||[]).map(s=>s.draw_calls)),
   timings:Object.fromEntries(Object.entries(timings).map(([k,v])=>[k,{msPerSecond:v.us/1000/seconds,callsPerSecond:v.calls/seconds}]))});
 }
}
console.log(JSON.stringify(output,null,2));
