import { createCanvas } from '@napi-rs/canvas'
import { createHash } from 'node:crypto'
import { ASSETS } from '../../src/experiments/pixel-town/catalog-data.js'
import { LIGHTS } from '../../src/experiments/pixel-town/lighting.js'

// Raw RGBA avoids PNG encoder metadata differences. The fixture was captured
// from the pre-extraction renderer, not regenerated from the implementation.
export function fingerprints({ compose, artwork }) {
  const result = {}
  const times = [0, 7 / 6, 3, 35 / 6]
  const pixels = (canvas) =>
    canvas.getContext('2d').getImageData(0, 0, 768, 460).data
  for (let stage = 0; stage <= 12; stage++) {
    for (const light of LIGHTS) {
      const hash = createHash('sha256')
      for (const time of times)
        hash.update(pixels(compose(createCanvas(768, 460), { stage, light, time })))
      result[`scene/${stage}/${light}`] = hash.digest('hex')
    }
  }
  for (const asset of ASSETS.filter((asset) => !asset.variant)) {
    const hash = createHash('sha256')
    for (const light of LIGHTS)
      for (const scale of [0.75, 1.6])
        for (const time of [0, 7 / 6]) {
          const canvas = createCanvas(768, 460)
          const art = artwork(canvas, { light, time })
          art.at(384, 230, scale, () => art[asset.kind](...asset.args))
          hash.update(pixels(canvas))
        }
    result[`asset/${asset.id}`] = hash.digest('hex')
  }
  const hash = createHash('sha256')
  for (const light of LIGHTS)
    for (const time of times) {
      const canvas = compose(createCanvas(768, 460), {
        light, time,
        variants: { blossom: { blossom: '#ef88bb', amplitude: 1.4 } },
        scene: {
          groups: [
            { at: [250, 300, 0.75], items: [{ asset: 'tree:blossom', args: [0, 0] }] },
            { at: [500, 300, 1.6], items: [{ asset: 'tree', args: [0, 0] }] }
          ],
          overlays: []
        }
      })
      hash.update(pixels(canvas))
    }
  result['variant/blossom-and-default'] = hash.digest('hex')
  return result
}
