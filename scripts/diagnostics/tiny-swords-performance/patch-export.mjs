import {readFile,writeFile} from 'node:fs/promises';
const live=await readFile('_site/tiny-swords-xp-game/index.html','utf8');const receiver=live.match(/<script>window\.edeniaCameraCommands[\s\S]*?<\/script>/)[0];
const visibility=await readFile('scripts/tiny-swords-xp-visibility.js','utf8');
const path='.cache/tiny-swords-perf/export3/index.html';let html=await readFile(path,'utf8');await writeFile(path,html.replace('</head>',receiver+`<script>${visibility}</script></head>`));
