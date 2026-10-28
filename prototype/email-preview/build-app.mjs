import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { build } from 'esbuild'
import { createProductionSourceResolver } from '../../scripts/build-production-experience.mjs'
const projectRoot=resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const output=resolve(projectRoot,'.cache/email-preview-app')
await mkdir(output,{recursive:true})
const {sourcePath,plugin}=await createProductionSourceResolver(projectRoot)
await build({entryPoints:[sourcePath('src/app.js')],bundle:true,format:'esm',platform:'browser',target:'es2022',outfile:resolve(output,'app.js'),plugins:[plugin,{name:'local-email-sandbox',setup(builder){
 builder.onLoad({filter:/\/core\/runtime-environment\.js$/},async args=>({contents:(await readFile(args.path,'utf8')).replace("locationLike.origin === 'http://localhost:8001'", "locationLike.origin === 'http://localhost:4190'"),loader:'js'}))
}}]})
const cssIndex=await readFile(sourcePath('src/styles/index.css'),'utf8')
const css=await Promise.all([...cssIndex.matchAll(/@import "\.\/([^"\n]+)";/g)].map(match=>readFile(sourcePath(`src/styles/${match[1]}`),'utf8')))
await writeFile(resolve(output,'style.css'),css.join('\n'))
let html=await readFile(sourcePath('index.html'),'utf8')
html=html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/g,'').replace('</head>', '<script>window.EDENIA_CONFIG={};</script><script type="module" src="app.js"></script></head>')
html=html.replace('</body>', '<div style="position:fixed;top:8px;right:12px;z-index:10000;background:#c9ef68;border:1px solid #050505;padding:6px 10px;border-radius:8px;font:12px Arial">Email preview · Local sandbox</div></body>')
await writeFile(resolve(output,'index.html'),html)
console.log('Built local Edenia email destination sandbox from production source.')
