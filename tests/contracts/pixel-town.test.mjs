import test from 'node:test'
import assert from 'node:assert/strict'
import { createCanvas } from '@napi-rs/canvas'
import { compose } from '../../src/experiments/pixel-town/compose.js'
import { SCENES } from '../../src/experiments/pixel-town/scenes.js'
import { localLight } from '../../src/experiments/pixel-town/lighting.js'
import { DESIGN, EFFECTS } from '../../src/experiments/pixel-town/parameters.js'
import {
  createDegradationMonitor,
  validateManifest
} from '../../src/experiments/pixel-town/player.js'
import { CITY_LEVELS } from '../../src/features/city/model.js'
const pixels = (options) =>
  compose(createCanvas(768, 460), options).toBuffer('image/png')
test('all thirteen visual scenes render deterministically; preview additions do not extend rewards', () => {
  for (let stage = 0; stage <= 12; stage++)
    assert.deepEqual(pixels({ stage }), pixels({ stage }))
  const before = JSON.stringify(CITY_LEVELS)
  pixels({
    scene: {
      id: 'extra',
      groups: [
        {
          id: 'tree',
          at: [384, 300, 1],
          items: [
            { asset: 'island', args: [100, 100] },
            { asset: 'tree', args: [0, 0] }
          ]
        }
      ],
      overlays: []
    }
  })
  assert.equal(JSON.stringify(CITY_LEVELS), before)
  assert.equal(CITY_LEVELS.length, 12)
})
test('shared tree edit changes dependent stages, leaves empty stage and placements untouched', () => {
  const scenes = JSON.stringify(SCENES),
    design = { ...DESIGN, tree: { blossom: '#f199cc' } }
  assert.deepEqual(pixels({ stage: 0 }), pixels({ stage: 0, design }))
  for (const stage of [1, 2, 12])
    assert.notDeepEqual(pixels({ stage }), pixels({ stage, design }))
  assert.equal(JSON.stringify(SCENES), scenes)
})
test('independent smoke adjustment preserves empty landscape', () => {
  const effects = { ...EFFECTS, smoke: { ...EFFECTS.smoke, height: 0.6 } }
  assert.deepEqual(
    pixels({ stage: 0, time: 2 }),
    pixels({ stage: 0, time: 2, effects })
  )
  assert.notDeepEqual(
    pixels({ stage: 12, time: 2 }),
    pixels({ stage: 12, time: 2, effects })
  )
})
test('local-clock lighting handles dawn, sunset, rollover and clock changes without study state', () => {
  for (const [hour, minute, expected] of [
    [0, 0, 'night'],
    [5, 30, 'dawn'],
    [7, 30, 'day'],
    [18, 30, 'sunset'],
    [20, 0, 'night'],
    [23, 59, 'night'],
    [12, 0, 'day']
  ])
    assert.equal(localLight(new Date(2026, 8, 27, hour, minute)), expected)
})
test('degradation requires sustained attributed slowdown; target misses and one spike do not strip motion', () => {
  const m = createDegradationMonitor()
  for (let t = 1; t < 60000; t += 167) m.observe(4, t, false)
  assert.equal(m.cadence, 6)
  m.observe(51, 60001)
  assert.equal(m.cadence, 6)
  m.observe(51, 60168)
  assert.equal(m.cadence, 3)
  const unmeasured = createDegradationMonitor()
  for (let t = 1; t < 60000; t += 167) unmeasured.observe(9, t)
  assert.equal(unmeasured.cadence, 6)
  const slow = createDegradationMonitor()
  for (let t = 1; t < 31000; t += 167) slow.observe(9, t, true)
  assert.equal(slow.cadence, 3)
})
test('rejects stale version, oversize buffers and out-of-bounds patch metadata', () => {
  const m = {
    version: 'v1',
    width: 768,
    height: 460,
    atlasWidth: 768,
    atlasHeight: 32,
    pixelBytes: 5000000,
    frames: Array.from({ length: 36 }, () => [])
  }
  validateManifest(m, 'v1')
  assert.throws(() => validateManifest(m, 'v0'))
  assert.throws(() =>
    validateManifest({ ...m, pixelBytes: 65 * 1024 * 1024 }, 'v1')
  )
  assert.throws(() =>
    validateManifest(
      { ...m, frames: Array.from({ length: 36 }, () => [[760, 0, 32, 32, 0]]) },
      'v1'
    )
  )
})

test('tree color changes leave unrelated flower beds and houses pixel-identical', async () => {
  const { artwork } = await import(
    '../../src/experiments/pixel-town/artwork.js'
  )
  const draw = (asset, design) => {
    const canvas = createCanvas(768, 460),
      art = artwork(canvas, { design })
    art.at(384, 300, 1, () => art[asset](0, 0))
    return canvas.toBuffer('image/png')
  }
  const changed = { ...DESIGN, tree: { blossom: '#ef88bb' } }
  for (const asset of ['flowers', 'house', 'shrub'])
    assert.deepEqual(draw(asset, DESIGN), draw(asset, changed))
  assert.notDeepEqual(draw('tree', DESIGN), draw('tree', changed))
})

test('shared-tree draft save is source-backed and cannot modify unrelated parameters', async () => {
  const { mkdtemp, readFile, writeFile, cp, mkdir, rm } = await import(
    'node:fs/promises'
  )
  const { tmpdir } = await import('node:os')
  const { join } = await import('node:path')
  const { execFileSync } = await import('node:child_process')
  const dir = await mkdtemp(join(tmpdir(), 'pixel-authoring-'))
  try {
    await mkdir(join(dir, 'tools/pixel-town'), { recursive: true })
    await mkdir(join(dir, 'src/experiments/pixel-town'), { recursive: true })
    await cp(
      new URL('../../tools/pixel-town/save-draft.mjs', import.meta.url),
      join(dir, 'tools/pixel-town/save-draft.mjs')
    )
    await cp(
      new URL(
        '../../src/experiments/pixel-town/parameters.js',
        import.meta.url
      ),
      join(dir, 'src/experiments/pixel-town/parameters.js')
    )
    await writeFile(join(dir, 'package.json'), '{"type":"module"}')
    await writeFile(
      join(dir, 'draft.json'),
      JSON.stringify({
        schema: 1,
        asset: 'tree',
        scope: 'shared',
        design: { tree: { blossom: '#ef88bb' } },
        effects: { foliage: { amplitude: 1.2 }, smoke: { height: 100 } }
      })
    )
    execFileSync(process.execPath, [
      join(dir, 'tools/pixel-town/save-draft.mjs'),
      join(dir, 'draft.json')
    ])
    const saved = await import(
      `file://${join(dir, 'src/experiments/pixel-town/parameters.js')}`
    )
    assert.equal(saved.DESIGN.tree.blossom, '#ef88bb')
    assert.equal(saved.EFFECTS.foliage.amplitude, 1.2)
    assert.deepEqual(saved.EFFECTS.smoke, EFFECTS.smoke)
    assert.deepEqual(saved.DESIGN.roof, DESIGN.roof)
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})
