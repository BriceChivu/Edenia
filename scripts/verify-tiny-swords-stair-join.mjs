// Render the reported narrow landing over lower grass, then check the pixels.
import assert from 'node:assert/strict'
import { chromium } from 'playwright'
import { createRequire } from 'node:module'
import { dirname, resolve } from 'node:path'
import { readFile, mkdir } from 'node:fs/promises'
const require = createRequire(import.meta.url)
const { PNG } = require(resolve(dirname(require.resolve('playwright-core/package.json')), 'lib/utilsBundle.js'))
const fixture = {
  version: 7, level: 3,
  tiles: [[0,0,'meadow',false,0,0],[1,0,'meadow',false,0,0],[0,1,'meadow',false,0,0],[1,1,'meadow',false,0,0],[3,2,'meadow',false,0,0],[2,0,'stairs',false,1,0],[3,0,'high_gold',false,0,0],[2,1,'meadow',false,0,0],[3,1,'meadow',false,0,0]],
  stock: { meadow:1, gold:1, violet:1, high_meadow:1, high_gold:0, stairs:1, tree:1 }, decorations: []
}
const browser = await chromium.launch()
try {
  const page = await browser.newPage({ viewport: { width:1152, height:496 }, deviceScaleFactor:1 })
  const errors = []
  page.on('pageerror', error => errors.push(error.message))
  // Isolated browser context; never touches the learner's island.
  await page.addInitScript(data => localStorage.setItem('edenia_tiny_swords_builder_preview_v1', JSON.stringify(data)), fixture)
  await page.goto('http://localhost:4183/tiny-swords/index.html')
  await page.locator('#status').waitFor({ state:'hidden', timeout:90000 })
  await page.waitForTimeout(800)
  await mkdir('test-results/tiny-swords-preview', { recursive:true })
  const rendered = PNG.sync.read(await page.screenshot({ path:'test-results/tiny-swords-preview/stair-layers-corrected.png' }))
  const source = PNG.sync.read(await readFile('godot/tiny-swords/Tiny Swords (Free Pack)/Terrain/Tileset/Tilemap_color1.png'))
  // The entire bottom 16px of the landing must retain the authored leafy rim.
  // The previous center-piece substitution fails this check.
  for (let y=48; y<64; y++) for (let x=0; x<64; x++) {
    const a=((192+y)*source.width+448+x)*4
    const b=((112+y)*rendered.width+704+x)*4
    if (source.data[a+3] !== 255) continue
    for (let channel=0; channel<3; channel++) assert.equal(rendered.data[b+channel],source.data[a+channel],'Landing must preserve the leafy grass-to-cliff edge')
  }
  // A few dark rock-edge pixels are expected; a continuous blue foam seam is not.
  // The broken layer produced 206 blue pixels in this 384px strip; fixed: 14.
  let blue = 0
  for (let y=240; y<248; y++) for (let x=712; x<760; x++) {
    const p=(y*rendered.width+x)*4
    if (rendered.data[p+2] >= rendered.data[p+1]*0.92) blue++
  }
  assert.ok(blue < 32, `False shoreline below cliff: ${blue} blue pixels`)
  assert.deepEqual(errors,[])
  console.log('PASS: authored grass rim matches pixel-for-pixel; no false shoreline beneath cliff')
} finally { await browser.close() }
