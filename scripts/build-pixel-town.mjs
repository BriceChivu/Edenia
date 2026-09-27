import { createCanvas } from '@napi-rs/canvas'
import { createHash } from 'node:crypto'
import {
  mkdir,
  readdir,
  readFile,
  writeFile,
  cp,
  access
} from 'node:fs/promises'
import { resolve } from 'node:path'
import { build } from 'esbuild'
import {
  compose,
  WIDTH,
  HEIGHT
} from '../src/experiments/pixel-town/compose.js'
import { LIGHTS } from '../src/experiments/pixel-town/lighting.js'

export async function buildPixelTown(outputDir) {
  const sourceDir = resolve('src/experiments/pixel-town')
  const hash = createHash('sha256')
  hash.update(
    JSON.parse(
      await readFile(
        resolve('node_modules/@napi-rs/canvas/package.json'),
        'utf8'
      )
    ).version
  )
  for (const name of (await readdir(sourceDir)).sort())
    hash.update(await readFile(resolve(sourceDir, name)))
  hash.update(await readFile(new URL(import.meta.url)))
  const version = hash.digest('hex').slice(0, 16),
    relative = `pixel-town/${version}`
  const cache = resolve('.pixel-town-cache', version)
  let cached = false
  try {
    await access(`${cache}/complete`)
    cached = true
  } catch {}
  if (!cached) {
    await mkdir(cache, { recursive: true })
    const statistics = []
    for (let stage = 0; stage <= 12; stage++)
      for (const light of LIGHTS) {
        const base = createCanvas(WIDTH, HEIGHT),
          scratch = createCanvas(WIDTH, HEIGHT)
        compose(base, { stage, light })
        const bc = base.getContext('2d'),
          sc = scratch.getContext('2d')
        const still = base.toBuffer('image/png')
        await writeFile(`${cache}/${stage}-${light}.png`, still)
        const original = bc.getImageData(0, 0, WIDTH, HEIGHT).data
        const tiles = [],
          byHash = new Map(),
          frames = []
        for (let frame = 0; frame < 36; frame++) {
          compose(scratch, { stage, light, time: frame / 6 })
          const pixels = sc.getImageData(0, 0, WIDTH, HEIGHT).data,
            patches = []
          for (let y = 0; y < HEIGHT; y += 32)
            for (let x = 0; x < WIDTH; x += 32) {
              const w = Math.min(32, WIDTH - x),
                h = Math.min(32, HEIGHT - y)
              let changed = false
              for (let yy = y; yy < y + h && !changed; yy++)
                for (let xx = x; xx < x + w; xx++) {
                  const p = (yy * WIDTH + xx) * 4
                  if (
                    pixels[p] !== original[p] ||
                    pixels[p + 1] !== original[p + 1] ||
                    pixels[p + 2] !== original[p + 2]
                  ) {
                    changed = true
                    break
                  }
                }
              if (!changed) continue
              const tile = sc.getImageData(x, y, w, h),
                key = createHash('sha256')
                  .update(tile.data)
                  .update(`${w},${h}`)
                  .digest('hex')
              let id = byHash.get(key)
              if (id === undefined) {
                id = tiles.length
                tiles.push(tile)
                byHash.set(key, id)
              }
              patches.push([x, y, w, h, id])
            }
          frames.push(patches)
        }
        const atlas = createCanvas(
            768,
            Math.max(32, Math.ceil(tiles.length / 24) * 32)
          ),
          ac = atlas.getContext('2d')
        tiles.forEach((tile, id) =>
          ac.putImageData(tile, (id % 24) * 32, Math.floor(id / 24) * 32)
        )
        const pixelBytes = (atlas.width * atlas.height + WIDTH * HEIGHT * 3) * 4
        if (pixelBytes > 64 * 1024 * 1024)
          throw new Error(`Pixel cap exceeded: ${stage}/${light}`)
        const encoded = atlas.toBuffer('image/png')
        const manifest = {
          version,
          stage,
          light,
          width: WIDTH,
          height: HEIGHT,
          atlasWidth: atlas.width,
          atlasHeight: atlas.height,
          pixelBytes,
          frames
        }
        await writeFile(`${cache}/${stage}-${light}-motion.png`, encoded)
        await writeFile(
          `${cache}/${stage}-${light}.json`,
          JSON.stringify(manifest)
        )
        statistics.push({
          stage,
          light,
          stillBytes: still.length,
          atlasBytes: encoded.length,
          pixelBytes,
          maxDirtyRatio: Math.max(
            ...frames.map(
              (f) => f.reduce((n, p) => n + p[2] * p[3], 0) / (WIDTH * HEIGHT)
            )
          )
        })
      }
    await build({
      entryPoints: [`${sourceDir}/entry.js`],
      outfile: `${cache}/entry.js`,
      bundle: true,
      format: 'esm',
      minify: true,
      target: 'es2022'
    })
    await cp(`${sourceDir}/town.css`, `${cache}/town.css`)
    await writeFile(
      `${cache}/statistics.json`,
      JSON.stringify(statistics, null, 2)
    )
    await writeFile(`${cache}/complete`, version)
  }
  await mkdir(resolve(outputDir, relative), { recursive: true })
  await cp(cache, resolve(outputDir, relative), { recursive: true })
  return { version, base: `${relative}/` }
}
