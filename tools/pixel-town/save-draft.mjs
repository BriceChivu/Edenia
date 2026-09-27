import { readFile, writeFile } from 'node:fs/promises'
import {
  DESIGN,
  EFFECTS,
  VARIANTS
} from '../../src/experiments/pixel-town/parameters.js'
const input = process.argv[2]
if (!input)
  throw new Error('Usage: node tools/pixel-town/save-draft.mjs <draft.json>')
const draft = JSON.parse(await readFile(input, 'utf8'))
if (
  draft.schema !== 1 ||
  !['tree', 'house', 'volcano'].includes(draft.asset) ||
  !['shared', 'variant'].includes(draft.scope)
)
  throw new Error('Unsupported draft')
const design = structuredClone(DESIGN),
  effects = structuredClone(EFFECTS),
  variants = structuredClone(VARIANTS)
if (draft.asset === 'tree') {
  const blossom = draft.design?.tree?.blossom,
    amplitude = draft.effects?.foliage?.amplitude
  if (
    !/^#[0-9a-f]{6}$/i.test(blossom) ||
    !Number.isFinite(amplitude) ||
    amplitude < 0 ||
    amplitude > 2
  )
    throw new Error('Invalid tree parameters')
  if (draft.scope === 'variant') {
    if (!/^[a-z][a-z0-9-]{1,40}$/.test(draft.variant))
      throw new Error('Invalid variant ID')
    variants[draft.variant] = { blossom, amplitude }
  } else {
    design.tree.blossom = blossom
    effects.foliage.amplitude = amplitude
  }
} else {
  if (draft.scope !== 'shared')
    throw new Error('Named variants currently apply to trees')
  const height = draft.effects?.smoke?.height
  if (!Number.isFinite(height) || height < 0.5 || height > 1.5)
    throw new Error('Invalid smoke height')
  effects.smoke.height = height
}
const source = `// Version-controlled workshop parameters. Regenerate stills and patches after editing.\nexport const DESIGN = ${JSON.stringify(design, null, 2)}\nexport const EFFECTS = ${JSON.stringify(effects, null, 2)}\nexport const VARIANTS = ${JSON.stringify(variants, null, 2)}\n`
await writeFile(
  new URL('../../src/experiments/pixel-town/parameters.js', import.meta.url),
  source
)
console.log(
  'Saved parameters.js. Review the diff, rebuild, and compare dependent stages.'
)
