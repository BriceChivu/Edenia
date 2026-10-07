import { createHash } from 'node:crypto'
import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { brotliCompressSync, constants, gzipSync } from 'node:zlib'
import { build } from 'esbuild'

export const ENGINE_DIRECTORY = 'tiny-swords-engine'
export const DECODER_DIRECTORY = 'tiny-swords-decoder'
const digest = bytes => createHash('sha256').update(bytes).digest('hex')

async function variants(path, bytes) {
  // Reuse costly quality-11 compression across local builds without making the
  // delivery URL depend on pack/UI changes or compression-tool versions.
  const cache = resolve('.cache/tiny-swords-compression')
  await mkdir(cache, { recursive: true })
  const cached = resolve(cache, `${digest(bytes)}-br11.br`)
  let brotli
  try { brotli = await readFile(cached) } catch {
    brotli = brotliCompressSync(bytes, { params: { [constants.BROTLI_PARAM_QUALITY]: 11 } })
    await writeFile(cached, brotli)
  }
  await writeFile(path + '.br', brotli)
  await writeFile(path + '.gz', gzipSync(bytes, { level: 9 }))
}

export async function prepareTinySwordsDelivery(staging, outputDir) {
  const engine = await readFile(resolve(staging, 'index.wasm'))
  const engineHash = digest(engine)
  const engines = resolve(outputDir, ENGINE_DIRECTORY)
  await rm(engines, { recursive: true, force: true })
  const engineDir = resolve(engines, engineHash)
  await mkdir(engineDir, { recursive: true })
  await writeFile(resolve(engineDir, 'index.wasm'), engine)
  await variants(resolve(engineDir, 'index.wasm'), engine)
  await rm(resolve(staging, 'index.wasm'))

  const worker = (await build({
    entryPoints: ['scripts/tiny-swords-brotli-worker.js'], bundle: true,
    format: 'esm', platform: 'browser', target: 'es2022', minify: true, write: false
  })).outputFiles[0].contents
  const decoder = await readFile(fileURLToPath(import.meta.resolve('brotli-dec-wasm/web/bg.wasm')))
  const decoderHash = digest(Buffer.concat([worker, decoder]))
  const decoders = resolve(outputDir, DECODER_DIRECTORY)
  await rm(decoders, { recursive: true, force: true })
  const decoderDir = resolve(decoders, decoderHash)
  await mkdir(decoderDir, { recursive: true })
  await writeFile(resolve(decoderDir, 'worker.js'), worker)
  await writeFile(resolve(decoderDir, 'decoder.wasm'), decoder)
  await variants(resolve(decoderDir, 'worker.js'), worker)
  await variants(resolve(decoderDir, 'decoder.wasm'), decoder)
  await cp('node_modules/brotli-dec-wasm/LICENSE-MIT.txt', resolve(staging, 'notices/BROTLI-DEC-WASM-MIT.txt'))
  await cp('scripts/tiny-swords-asset-loader.js', resolve(staging, 'asset-loader.js'))

  const pack = await readFile(resolve(staging, 'index.pck'))
  await variants(resolve(staging, 'index.pck'), pack)
  const config = {
    worker: `../../${DECODER_DIRECTORY}/${decoderHash}/worker.js`,
    decoder: `../../${DECODER_DIRECTORY}/${decoderHash}/decoder.wasm`,
    files: {
      'index.wasm': { url: `../../${ENGINE_DIRECTORY}/${engineHash}/index.wasm`, bytes: engine.length, type: 'application/wasm' },
      'index.pck': { url: 'index.pck', bytes: pack.length, type: 'application/octet-stream' }
    }
  }
  let engineJs = await readFile(resolve(staging, 'index.js'), 'utf8')
  const hook = 'return fetch(file).then(function (response) {'
  if (engineJs.split(hook).length !== 2) throw new Error('Godot asset-loader hook changed')
  engineJs = engineJs.replace(hook, 'return window.edeniaFetchGameAsset(file).then(function (response) {')
  const errorHook = 'controller.close();\n\t\t\t\t});'
  if (engineJs.split(errorHook).length !== 2) throw new Error('Godot progress-stream hook changed')
  engineJs = engineJs.replace(errorHook, 'controller.close();\n\t\t\t\t}, function (error) { controller.error(error); });')
  await writeFile(resolve(staging, 'index.js'), engineJs)
  let html = await readFile(resolve(staging, 'index.html'), 'utf8')
  const progressHook = "'onProgress': function (current, total) {"
  if (html.split(progressHook).length !== 2) throw new Error('Godot loading-progress hook changed')
  // All configured assets count from the start, even if Godot registers their
  // downloads in separate frames. Download completion is followed by restore.
  html = html.replace(progressHook, `${progressHook}\n\t\t\t\tparent.postMessage({type:'edenia-game-loading-progress',current,total:Object.values(GODOT_CONFIG.fileSizes).reduce((sum,size)=>sum+size,0)},location.origin);`)
  const script = '<script src="index.js"></script>'
  if (html.split(script).length !== 2) throw new Error('Godot engine-script hook changed')
  await writeFile(resolve(staging, 'index.html'), html.replace(script,
    `<script>window.edeniaGameAssets=${JSON.stringify(config)};</script><script src="asset-loader.js"></script>${script}`))
  return { engineHash, decoderHash, engineBytes: engine.length }
}
