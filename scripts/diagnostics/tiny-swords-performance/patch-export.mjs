import {readFile,writeFile} from 'node:fs/promises';
const receiver=`<script>${await readFile('scripts/tiny-swords-xp-messages.js','utf8')}</script>`;
const visibility=await readFile('scripts/tiny-swords-xp-visibility.js','utf8');
const directory=process.argv.find(x=>x.startsWith('--export-dir='))?.split('=')[1]||'export3';
if(!/^[\w-]+$/.test(directory))throw new Error('Invalid diagnostic export directory');
const path='.cache/tiny-swords-perf/'+directory+'/index.html';let html=await readFile(path,'utf8');await writeFile(path,html.replace('</head>',receiver+`<script>${visibility}</script></head>`));
