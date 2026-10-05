import { readFile, writeFile } from 'node:fs/promises'

// Godot owns the progression curve. Materialize it before bundling the host,
// so even the first profile normalization sees the complete table.
export async function generateTinySwordsProgression(root) {
  const source = await readFile(new URL('godot/tiny-swords/scripts/terrain_layout.gd', root), 'utf8')
  const declaration = source.match(/^const XP_THRESHOLDS := (\[[^\n]+\])$/m)
  if (!declaration) throw new Error('Missing Godot XP_THRESHOLDS declaration')
  const thresholds = JSON.parse(declaration[1])
  if (thresholds.length !== 10 || thresholds[0] !== 0
    || thresholds.some((value, index) => !Number.isInteger(value) || value < 0
      || (index > 0 && value <= thresholds[index - 1]))) {
    throw new Error('Invalid Tiny Swords progression thresholds')
  }
  await writeFile(new URL('src/features/city/tiny-swords-progression.js', root),
    `// Generated from Godot by scripts/tiny-swords-progression.mjs.\nexport const TINY_SWORDS_XP_THRESHOLDS = Object.freeze(${JSON.stringify(thresholds)})\n`)
}
