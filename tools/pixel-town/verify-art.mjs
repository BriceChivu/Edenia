import { createCanvas, loadImage } from '@napi-rs/canvas'
import { compose } from '../../src/experiments/pixel-town/compose.js'
import { DESIGN, EFFECTS } from '../../src/experiments/pixel-town/parameters.js'
import { readdir, readFile, writeFile, mkdir } from 'node:fs/promises'
import { createHash } from 'node:crypto'
const out = new URL(
  '../../docs/experiments/pixel-town/evidence/',
  import.meta.url
)
const root = new URL('../../_site/pixel-town/', import.meta.url),
  version = (await readdir(root))[0]
const bytes = (canvas) =>
  canvas.getContext('2d').getImageData(0, 0, 768, 460).data
const digest = (data) => createHash('sha256').update(data).digest('hex')
await mkdir(out,{recursive:true})
const result = []
for (const light of ['dawn', 'day', 'sunset', 'night']) {
  const sheet = createCanvas(768 * 4, 460 * 4),
    c = sheet.getContext('2d')
  for (let stage = 0; stage <= 12; stage++) {
    const canvas = compose(createCanvas(768, 460), { stage, light })
    c.drawImage(canvas, (stage % 4) * 768, Math.floor(stage / 4) * 460)
    const manifest = JSON.parse(
      await readFile(new URL(`${version}/${stage}-${light}.json`, root))
    )
    const base = await loadImage(
        new URL(`${version}/${stage}-${light}.png`, root).pathname
      ),
      atlas = await loadImage(
        new URL(`${version}/${stage}-${light}-motion.png`, root).pathname
      )
    for (const frame of [0, 7, 18, 35]) {
      const replay = createCanvas(768, 460),
        r = replay.getContext('2d')
      r.drawImage(base, 0, 0)
      for (const [x, y, w, h, id] of manifest.frames[frame])
        r.drawImage(
          atlas,
          (id % 24) * 32,
          Math.floor(id / 24) * 32,
          w,
          h,
          x,
          y,
          w,
          h
        )
      const expected = compose(createCanvas(768, 460), {
        stage,
        light,
        time: frame / 6
      })
      if (digest(bytes(replay)) !== digest(bytes(expected)))
        throw new Error(`Patch mismatch ${stage}/${light}/${frame}`)
    }
    result.push({
      stage,
      light,
      patchReplay: 'four deterministic frames pixel-identical'
    })
  }
  await writeFile(
    new URL(`progression-${light}.png`, out),
    sheet.toBuffer('image/png')
  )
}
const author = createCanvas(768 * 2, 460 * 3),
  ac = author.getContext('2d')
for (const [row, stage] of [2, 12, 0].entries()) {
  ac.drawImage(compose(createCanvas(768, 460), { stage }), 0, row * 460)
  ac.drawImage(
    compose(createCanvas(768, 460), {
      stage,
      design: { ...DESIGN, tree: { blossom: '#e888ba' } },
      effects: { ...EFFECTS, foliage: { amplitude: 1.4 } }
    }),
    768,
    row * 460
  )
}
await writeFile(
  new URL('tree-before-after.png', out),
  author.toBuffer('image/png')
)
await writeFile(
  new URL('art-checks.json', out),
  JSON.stringify({ version, checks: result }, null, 2)
)
console.log(`Verified ${result.length} scenes and 208 exact patch replays`)
