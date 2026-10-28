import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
const cwd=fileURLToPath(new URL('../',import.meta.url))
const build=spawn(process.execPath,['prototype/email-preview/build-app.mjs'],{cwd,stdio:'inherit'})
await new Promise((resolve,reject)=>{build.on('error',reject);build.on('exit',code=>code===0?resolve():reject(new Error('Email preview build failed')))})
const children=['server.mjs','app-server.mjs'].map(file=>spawn(process.execPath,[`prototype/email-preview/${file}`],{cwd,stdio:'inherit'}))
let stopping=false
function stop(){if(stopping)return;stopping=true;for(const child of children)child.kill()}
for(const child of children){child.on('error',error=>{console.error(error.message);process.exitCode=1;stop()});child.on('exit',code=>{if(!stopping){process.exitCode=code||0;stop()}})}
process.on('SIGINT',stop);process.on('SIGTERM',stop)
