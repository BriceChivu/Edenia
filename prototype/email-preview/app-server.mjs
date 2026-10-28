import http from 'node:http'
import {readFile} from 'node:fs/promises'
import {resolve,extname,dirname} from 'node:path'
import {fileURLToPath} from 'node:url'
const root=resolve(dirname(fileURLToPath(import.meta.url)),'../..')
const built=resolve(root,'.cache/email-preview-app')
const types={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.png':'image/png','.jpg':'image/jpeg','.svg':'image/svg+xml','.woff2':'font/woff2','.webp':'image/webp'}
http.createServer(async(req,res)=>{
 const path=new URL(req.url,'http://localhost:4190').pathname
 const file=path==='/'?'index.html':decodeURIComponent(path.slice(1))
 const base=['index.html','app.js','style.css'].includes(file)?built:root
 const target=resolve(base,file)
 if(!target.startsWith(base+'/')||(!['index.html','app.js','style.css'].includes(file)&& !/^(assets|images|data)\//.test(file))){res.writeHead(404);res.end();return}
 try{const data=await readFile(target);res.writeHead(200,{'Content-Type':types[extname(target)]||'application/octet-stream','Cache-Control':'no-store'});res.end(data)}catch{res.writeHead(404);res.end()}
}).listen(4190,'127.0.0.1',()=>console.log('Local Edenia destination: http://localhost:4190/?sandbox=1'))
