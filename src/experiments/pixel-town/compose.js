import { VARIANTS, DESIGN, EFFECTS } from './parameters.js'
import { artwork, WIDTH, HEIGHT } from './artwork.js'
import { SCENES } from './scenes.js'
export { WIDTH, HEIGHT }
export function compose(
  canvas,
  { stage = 12, scene = SCENES[stage], variants = VARIANTS, ...options } = {}
) {
  if (!scene) throw new Error('Unknown visual stage')
  canvas.width = WIDTH
  canvas.height = HEIGHT
  const art = artwork(canvas, options)
  let placement = [0, 0, 1]
  const draw = (entry) => {
    if (entry.asset.startsWith('tree:')) {
      const variant = variants[entry.asset.slice(5)]
      if (!variant) throw new Error('Unknown tree variant')
      const scoped = artwork(canvas, {
        ...options,
        design: {
          ...(options.design || DESIGN),
          tree: { blossom: variant.blossom }
        },
        effects: {
          ...(options.effects || EFFECTS),
          foliage: { ...EFFECTS.foliage, amplitude: variant.amplitude }
        }
      })
      scoped.at(...placement, () => scoped.tree(...entry.args))
      return
    }
    if (typeof art[entry.asset] !== 'function')
      throw new Error(`Unknown asset: ${entry.asset}`)
    art[entry.asset](...entry.args)
  }
  art.sea()
  for (const group of scene.groups) {
    placement = group.at
    art.at(...group.at, () => group.items.forEach(draw))
  }
  scene.overlays.forEach(draw)
  return canvas
}
