// THROWAWAY local wrapper. The fragment remains usable in Codex's inline preview.
import { readFile, writeFile } from 'node:fs/promises'

const fragment = await readFile(new URL('../../src/features/profile-access/prototype-island-previews/draft.html', import.meta.url), 'utf8')
const wrapper = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Draft — saved island comparison</title>
<style>
html{color-scheme:light dark;background:light-dark(#edf7f1,#101e23)}body{margin:0;padding:24px 16px 110px}main{max-width:736px;margin:auto}[hidden]{display:none!important}
#draft-controls{position:fixed;bottom:16px;left:50%;transform:translateX(-50%);padding:10px 14px;border-radius:18px;box-shadow:0 3px 12px #0003;background:light-dark(#fff,#1a3038);color:light-dark(#152a31,#eff8fa);font:13px system-ui;display:flex;align-items:center;gap:10px;flex-wrap:wrap;width:max-content;max-width:calc(100% - 32px);z-index:10}
#draft-controls button,#draft-controls select{font:inherit;border:1px solid #9dbcc4;border-radius:8px;background:light-dark(#f7fcfd,#14282e);color:inherit;padding:8px;min-height:40px;max-width:100%;min-width:0}#draft-controls label{display:flex;gap:8px;align-items:center;max-width:100%;min-width:0;flex-wrap:wrap}
</style></head><body>
<script>globalThis.draftBindings=[];globalThis.Tweak=class{constructor(options){this.options=options}addSelect(state,key,options){draftBindings.push({state,key,options,render:this.options.onChange})}};</script>
<main>${fragment}</main>
<nav id="draft-controls" aria-label="Draft preview controls" hidden></nav>
<script>
if(location.protocol==='file:'||['localhost','127.0.0.1','[::1]'].includes(location.hostname)){
  const controls=document.getElementById('draft-controls');controls.hidden=false;
  draftBindings.forEach(binding=>{
    const label=document.createElement('label');label.textContent=binding.options.label;
    const select=document.createElement('select');select.id=binding.key;
    binding.options.options.forEach(value=>{const option=document.createElement('option');option.textContent=value;select.append(option);});
    select.value=binding.state[binding.key];select.onchange=()=>{binding.state[binding.key]=select.value;binding.render();};
    label.append(select);controls.append(label);
  });
}
</script></body></html>`
await writeFile(new URL('index.html', import.meta.url), wrapper)
