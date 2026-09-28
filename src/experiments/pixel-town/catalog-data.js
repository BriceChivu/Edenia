import { VARIANTS } from './parameters.js'
import { SCENES } from './scenes.js'
export const ASSETS = [
  ['tree', 'Flowering tree', [0, 0]],
  ['house', 'Tiled house', [-22, -18]],
  ['island', 'Sandstone island', [109, 108]],
  ['paving', 'Paving', [-20, -10, 40, 30]],
  ['flowers', 'Flower bed', [0, 0, 25]],
  ['shrub', 'Shrub', [0, 0]],
  ['pot', 'Planter', [0, 0]],
  ['fence', 'Fence', [-20, 0, 40]],
  ['lamp', 'Lantern', [0, 0]],
  ['dock', 'Dock', []],
  ['boat', 'Boat', []],
  ['pool', 'Pool', [0, 0]],
  ['chair', 'Deckchair', [0, 0]],
  ['playground', 'Playground', [-25, 0]],
  ['rocks', 'Shore rocks', [-10, 0]],
  ['mailbox', 'Mailbox', []],
  ['bridge', 'Bridge', []],
  ['volcano', 'Volcano', []],
  ['birds', 'Visiting birds', []],
  ['reflection', 'Reflection', [384, 230, 100, 30]],
  ['sea', 'Water', []],
  ...Object.keys(VARIANTS).map((id) => [`tree:${id}`, `Tree: ${id}`, [0, 0]])
].map(([id, name, args]) => ({
  id,
  name,
  kind: id.split(':')[0],
  variant: id.includes(':') ? id.slice(5) : null,
  args,
  source: id.includes(':')
    ? 'src/experiments/pixel-town/parameters.js'
    : `src/experiments/pixel-town/objects/${id}.js`,
  stages: Object.values(SCENES)
    .filter(
      (scene) =>
        id === 'sea' ||
        [...scene.groups.flatMap((g) => g.items), ...scene.overlays].some(
          (a) => a.asset === id
        )
    )
    .map((s) => s.id)
}))
