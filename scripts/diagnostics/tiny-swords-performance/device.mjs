// Disposable physical-device diagnostics. Serves only the instrumented export
// and synthetic fixtures, never the user's learner profile or application.
import { createServer } from 'node:http'
import { readFile } from 'node:fs/promises'
import { resolve, extname } from 'node:path'
const option = (name, fallback) => process.argv.find(x => x.startsWith(`--${name}=`))?.split('=')[1] || fallback
const host = option('host', '127.0.0.1'), port = Number(option('port', '8051'))
const root = resolve('.cache/tiny-swords-perf')
const fixture = JSON.parse(await readFile(resolve(root, 'terraced-fixture.json')))
const observe = `<script>
window.__deviceErrors=[];window.__deviceMemories=[];
addEventListener('error',event=>window.__deviceErrors.push(event.message));
addEventListener('unhandledrejection',event=>window.__deviceErrors.push(String(event.reason)));
for(const name of ['error','log']){const original=console[name];console[name]=function(...args){if(name==='error'||args.some(x=>String(x).includes('ERROR:')))window.__deviceErrors.push(args.map(String).join(' '));return original.apply(console,args)}}
for(const name of ['instantiate','instantiateStreaming']){const original=WebAssembly[name];WebAssembly[name]=async function(...args){const result=await original.apply(WebAssembly,args);for(const value of Object.values(result.instance?.exports||result.exports||{}))if(value instanceof WebAssembly.Memory)window.__deviceMemories.push(value);return result}}
</script>`
const html = `<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><title>Tiny Swords device check</title>
<style>body{font:16px system-ui;margin:0;background:#eef4f2;color:#233}iframe{width:100%;height:454px;border:0}main{padding:16px}button,input,select{font:inherit;margin:4px;padding:8px}pre{white-space:pre-wrap}</style>
<iframe id="game" src="/game/index.html"></iframe><main>
<p>Synthetic terraced island. Record the device and power conditions. Scroll the island fully offscreen or switch apps to test suspension; return to test resume.</p>
<label>Device <input id="device" placeholder="Model / OS / browser / battery"></label>
<label>Frame interval <select id="interval"><option value="1">Every display frame</option><option value="2">Every second frame</option></select></label>
<button id="download">Download measurements</button><pre id="status">Loading…</pre><div style="height:150vh"></div></main>
<script>
const game=document.getElementById('game'),interval=document.getElementById('interval'),status=document.getElementById('status'),device=document.getElementById('device'),download=document.getElementById('download'),samples=[],events=[],started=performance.now();let intersecting=true;
const facts=()=>{const visible=intersecting&&document.visibilityState==='visible';game.contentWindow.postMessage({type:'edenia-host-visibility',session:1,visible},location.origin);events.push({at:performance.now()-started,visible});};
new IntersectionObserver(entries=>{intersecting=entries[0].isIntersecting;facts()}).observe(game);document.addEventListener('visibilitychange',facts);
addEventListener('message',e=>{if(e.origin!==location.origin||e.source!==game.contentWindow)return;const d=e.data;
if(d.type==='edenia-tiny-ready')e.source.postMessage({type:'edenia-study-level',session:1,level:10,layout:${JSON.stringify(fixture)}},location.origin);
if(d.type==='edenia-tiny-restored'){events.push({at:performance.now()-started,restored:d.accepted});facts();}
if(d.type==='edenia-tiny-layout')e.source.postMessage({type:'edenia-tiny-saved',session:1,id:d.id,persisted:true},location.origin);
});
interval.onchange=()=>game.contentWindow.__perfFlags={raf_interval:Number(interval.value)};
setInterval(()=>{const w=game.contentWindow;if(!w.__godotPerf)return;const row={at:performance.now()-started,perf:w.__godotPerf,canvas:[w.document.getElementById('canvas').width,w.document.getElementById('canvas').height],wasm:w.__deviceMemories.map(m=>m.buffer.byteLength),suspended:w.edeniaPresentationSuspended===true,errors:w.__deviceErrors.length};if(samples.length<10000)samples.push(row);status.textContent=JSON.stringify(row,null,2)},1000);
download.onclick=()=>{const w=game.contentWindow;const data={device:device.value,ua:navigator.userAgent,dpr:devicePixelRatio,startedAt:new Date(Date.now()-performance.now()+started).toISOString(),events,samples,errors:w.__deviceErrors,resources:w.performance.getEntriesByType('resource').map(x=>({name:x.name,duration:x.duration,transfer:x.transferSize}))};const link=document.createElement('a');link.href=URL.createObjectURL(new Blob([JSON.stringify(data,null,2)],{type:'application/json'}));link.download='tiny-swords-device-check.json';link.click();setTimeout(()=>URL.revokeObjectURL(link.href),1000)};
</script>`
const server=createServer(async(req,res)=>{
 try {
  const path=new URL(req.url,'http://localhost').pathname
  if(path==='/'){res.setHeader('Content-Type','text/html');res.end(html);return}
  if(!/^\/game\/[\w.-]+$/.test(path)){res.writeHead(404);res.end();return}
  let body=await readFile(resolve(root,'export3',path.split('/').at(-1)))
  if(path.endsWith('.html'))body=body.toString().replace('<head>','<head>'+observe)
  res.setHeader('Content-Type',({'.html':'text/html','.js':'text/javascript','.wasm':'application/wasm','.png':'image/png'})[extname(path)]||'application/octet-stream');res.end(body)
 } catch {res.writeHead(404);res.end('Prepare the instrumented export first.')}
})
server.listen(port,host,()=>console.log(`Device diagnostics: http://${host}:${port}/`))
