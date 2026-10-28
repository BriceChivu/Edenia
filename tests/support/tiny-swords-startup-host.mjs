import { createServer } from 'node:http'
import { readFile, readdir } from 'node:fs/promises'
import { extname, relative, resolve } from 'node:path'

// Actual exported Godot, synthetic durable island, no account or external calls.
// HTTP faults retain real browser caching, unlike Playwright request routing.
export async function startupHost({ root = '_site', mode = 'normal', instrument = false, stale = false, incompatible = false } = {}) {
  root = resolve(root)
  const [release] = await readdir(resolve(root, 'tiny-swords-game'))
  const staleRelease = 'a'.repeat(64), adapterRelease = stale ? staleRelease : release
  const island = JSON.parse(await readFile('tests/fixtures/tiny-swords-populated-island.json', 'utf8'))
  let starts = 0, fault = mode
  const requests = [], sockets = new Set()
  const server = createServer(async (req, res) => {
    try {
      const url = new URL(req.url, 'http://localhost'), path = url.pathname
      requests.push({ path, at: Date.now(), start: starts })
      if (path === '/probe') {
        res.setHeader('Content-Type', 'text/html')
        const inactive = url.searchParams.has('inactive')
        res.end(`<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1">
          <style>body{margin:0}#tinySwordsSurface{position:relative;height:454px;background:#47aba9}iframe{position:absolute;inset:0;width:100%;height:100%;border:0}.tiny-swords-load-status{position:absolute;inset:0;z-index:7;background:#47aba9;display:grid;place-content:center}.tiny-swords-load-status[hidden],[hidden]{display:none!important}</style>
          <button id="study">Study stays usable</button><div id="tinySwordsSurface"><div class="tiny-swords-camera-controls" hidden></div>
          <div id="tinySwordsLoadStatus" class="tiny-swords-load-status"><span id="tinySwordsLoadMessage"></span><div id="tinySwordsLoadProgress"><div id="tinySwordsLoadBar"></div><span id="tinySwordsLoadProgressLabel"></span></div><button id="tinySwordsRetry" hidden>Retry island</button></div></div>
          <script>
          window.edeniaTinySwordsEnabled=true;window.saves=[];window.health=[];window.fixture=${JSON.stringify(island)};
          window.current=${inactive ? 'null' : '{tinySwordsIsland:structuredClone(fixture)}'};window.durable=structuredClone(current);window.owner='owner-a';
          window.edeniaTranslate=key=>({'island.preparing':'Preparing your island...','island.failed':'Your island could not start.','island.retry':'Retry island'}[key]||key);
          window.edeniaHealth={report:(...args)=>health.push(args)};
          window.edeniaTinySwordsPersistence={readIsland:()=>current,readClaimedLevel:()=>${island.level},readAccessIdentity:()=>owner,
            save(layout,expected){if(!current||JSON.stringify(current.tinySwordsIsland)!==expected)return false;saves.push(structuredClone(layout));current={tinySwordsIsland:structuredClone(layout)};durable=structuredClone(current);return true}};
          window.replaceIsland=(layout=fixture)=>{current={tinySwordsIsland:structuredClone(layout)};durable=structuredClone(current);dispatchEvent(new CustomEvent('edenia-profile-persisted',{detail:{replacement:true}}))};
          window.activateProfile=()=>{current={tinySwordsIsland:structuredClone(fixture)};durable=structuredClone(current);dispatchEvent(new Event('edenia-profile-access'))};
          window.lockProfile=()=>{current=null;dispatchEvent(new Event('edenia-profile-access'))};
          window.exposure={failureFrames:0,retryFrames:0};window.probeFinished=false;
          function exposureFrame(){if(probeFinished)return;const s=document.getElementById('tinySwordsSurface');if(['failed','slow'].includes(s.dataset.gameState)||document.getElementById('tinySwordsLoadMessage').textContent.includes('could not start'))exposure.failureFrames++;if(!document.getElementById('tinySwordsRetry').hidden)exposure.retryFrames++;requestAnimationFrame(exposureFrame)};requestAnimationFrame(exposureFrame);
          </script><script src="/tiny-swords-game/${adapterRelease}/parent.js"></script>`)
        return
      }
      if (path.endsWith('/index.html')) {
        starts++
        if (stale && path.includes(staleRelease)) { res.writeHead(404).end(); return }
        if (starts === 1 && ['silent-scene-once', 'silent-restore-once'].includes(fault)) {
          res.setHeader('Content-Type', 'text/html')
          res.end(`<!doctype html><script>parent.postMessage({type:'edenia-game-engine-initialized'},location.origin);${fault === 'silent-restore-once' ? "parent.postMessage({type:'edenia-game-progression',thresholds:Array(20).fill(0)},location.origin);" : ''}</script>`)
          return
        }
        if (fault === 'silent-document' || fault === 'silent-once' && starts === 1) {
          res.setHeader('Content-Type', 'text/html'); res.end('<!doctype html><title>Silent transport peer</title>'); return
        }
        if (fault === 'missing-document' || fault === 'missing-once' && starts === 1) { res.writeHead(404).end(); return }
      }
      if (path.endsWith('/index.js') && (fault === 'scripts-fail' || fault === 'script-once' && starts === 1)) {
        res.writeHead(503).end(); return
      }
      const mapped = stale && path.includes(staleRelease) && path.endsWith('/parent.js') ? path.replace(staleRelease, release) : path
      const file = resolve(root, '.' + mapped)
      if (relative(root, file).startsWith('..')) { res.writeHead(403).end(); return }
      const gzip = /\/index\.(wasm|pck)$/.test(path)
      let body = await readFile(file + (gzip ? '.gz' : ''))
      if (incompatible && path === '/tiny-swords-current.json') {
        const manifest = JSON.parse(body); manifest.compatibility = 'b'.repeat(64); body = Buffer.from(JSON.stringify(manifest))
      }
      if (fault === 'corrupt-engine' && path.endsWith('index.wasm.br')) body = body.subarray(0, Math.floor(body.length / 2))
      if (fault === 'worker-silent' && path.endsWith('/worker.js')) body = Buffer.from('self.onmessage=()=>{}')
      if (fault === 'ordinary-stall' && /\/index\.(wasm|pck)$/.test(path)) return
      if (fault === 'ordinary-once' && path.endsWith('/index.wasm') && starts === 1) { res.writeHead(503).end(); return }
      if (instrument && path.endsWith('/index.js')) {
        let source = body.toString()
        const begin = 'runIter(func){if(ABORT)return;'
        const end = 'callUserCallback(func);for(var post of MainLoop.postMainLoop)'
        if (source.split(begin).length !== 2 || source.split(end).length !== 2) throw new Error('Engine main-loop probe hook changed')
        source = source.replace(begin, begin + 'const probe=window.edeniaEngineBenchmark;const began=probe?performance.now():0;if(probe){probe.wasmBytes=HEAPU8.byteLength;if(probe.last)probe.intervals.push(began-probe.last);probe.last=began;}')
          .replace(end, 'callUserCallback(func);if(probe)probe.work.push(performance.now()-began);for(var post of MainLoop.postMainLoop)')
        body = Buffer.from(source)
      }
      res.setHeader('Content-Type', ({ '.html': 'text/html', '.js': 'text/javascript', '.wasm': 'application/wasm', '.png': 'image/png', '.json': 'application/json' })[extname(file)] || 'application/octet-stream')
      res.setHeader('Cache-Control', /\/tiny-swords-(engine|decoder)\//.test(path) ? 'public,max-age=600' : 'no-store')
      if (gzip) res.setHeader('Content-Encoding', 'gzip')
      res.setHeader('Content-Length', body.length); res.end(body)
    } catch (error) { res.writeHead(404).end() }
  })
  server.on('connection', socket => { sockets.add(socket); socket.on('close', () => sockets.delete(socket)) })
  await new Promise(accept => server.listen(0, '127.0.0.1', accept))
  return { url: `http://127.0.0.1:${server.address().port}/probe`, requests, island, release,
    get starts() { return starts }, set mode(value) { fault = value },
    close: () => new Promise(accept => { for (const socket of sockets) socket.destroy(); server.close(accept) }) }
}
