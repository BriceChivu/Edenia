import { compose } from '../../src/experiments/pixel-town/compose.js'
import { artwork } from '../../src/experiments/pixel-town/artwork.js'
import { ASSETS } from '../../src/experiments/pixel-town/catalog-data.js'
import { SCENES } from '../../src/experiments/pixel-town/scenes.js'
import {
  DESIGN,
  EFFECTS,
  VARIANTS
} from '../../src/experiments/pixel-town/parameters.js'
const $ = (id) => document.getElementById(id)
let selected = ASSETS[0],
  playing = false,
  timer = null
const reduced = matchMedia('(prefers-reduced-motion: reduce)')
for (const stage of Object.keys(SCENES))
  $('stage').add(new Option(`Stage ${stage}`, stage))
$('stage').add(new Option('Preview-only stage', 'preview'))
$('stage').value = '2'
function isolated(canvas, asset, options) {
  const scratch = document.createElement('canvas')
  scratch.width = 768
  scratch.height = 460
  if (asset.variant) {
    const variant = (options.variants || VARIANTS)[asset.variant]
    options = {
      ...options,
      design: { ...DESIGN, tree: { blossom: variant.blossom } },
      effects: {
        ...EFFECTS,
        foliage: { ...EFFECTS.foliage, amplitude: variant.amplitude }
      }
    }
  }
  const art = artwork(scratch, options)
  art.at(384, 300, 1, () => art[asset.kind](...asset.args))
  const c = scratch.getContext('2d'),
    data = c.getImageData(0, 0, 768, 460).data
  let left = 768,
    right = 0,
    top = 460,
    bottom = 0
  for (let y = 0; y < 460; y++)
    for (let x = 0; x < 768; x++)
      if (data[(y * 768 + x) * 4 + 3]) {
        left = Math.min(left, x)
        right = Math.max(right, x)
        top = Math.min(top, y)
        bottom = Math.max(bottom, y)
      }
  canvas.width = 384
  canvas.height = 256
  const target = canvas.getContext('2d')
  target.imageSmoothingEnabled = false
  const width = right - left + 1,
    height = bottom - top + 1,
    scale = Math.min(3, 340 / width, 220 / height)
  if (width > 0 && height > 0)
    target.drawImage(
      scratch,
      left,
      top,
      width,
      height,
      (384 - width * scale) / 2,
      (256 - height * scale) / 2,
      width * scale,
      height * scale
    )
}
for (const asset of ASSETS) {
  const button = document.createElement('button'),
    canvas = document.createElement('canvas')
  isolated(canvas, asset, { light: 'day' })
  button.append(canvas, document.createTextNode(asset.name))
  button.dataset.asset = asset.id
  button.onclick = () => {
    selected = asset
    reset()
  }
  $('assets').append(button)
}
function settings() {
  return { light: $('light').value, time: Number($('phase').value) }
}
function draft() {
  if (selected.variant)
    return {
      design: DESIGN,
      effects: EFFECTS,
      variants: {
        ...VARIANTS,
        [selected.variant]: {
          blossom: $('blossom').value,
          amplitude: Number($('breeze').value)
        }
      }
    }
  return {
    design: { ...DESIGN, tree: { blossom: $('blossom').value } },
    effects: {
      ...EFFECTS,
      foliage: { ...EFFECTS.foliage, amplitude: Number($('breeze').value) },
      smoke: { ...EFFECTS.smoke, height: Number($('smoke').value) }
    }
  }
}
function render() {
  const options = settings(),
    change = draft(),
    stage = $('stage').value
  const scene =
    stage === 'preview'
      ? {
          id: 'preview',
          groups: [
            {
              id: 'extra-tree',
              at: [384, 300, 1.6],
              items: [
                { asset: 'island', args: [130, 110] },
                {
                  asset: selected.variant ? selected.id : 'tree',
                  args: [-25, -10]
                },
                { asset: 'tree', args: [25, 15] }
              ]
            }
          ],
          overlays: []
        }
      : SCENES[stage]
  compose($('before'), { scene, ...options })
  compose($('after'), { scene, ...options, ...change })
  isolated($('isolated-before'), selected, options)
  isolated($('isolated-after'), selected, { ...options, ...change })
  $('name').textContent = `${selected.name} · ${selected.id}`
  $('usage').textContent =
    `Used in stages: ${selected.stages.join(', ') || 'none'}. Supported variant: named tree variant; house color is a scene argument.`
  $('source').href = `../../${selected.source}`
  $('source').textContent = selected.source
  document
    .querySelectorAll('[data-asset]')
    .forEach((b) =>
      b.setAttribute('aria-pressed', String(b.dataset.asset === selected.id))
    )
  $('blossom').disabled = $('breeze').disabled = selected.kind !== 'tree'
  $('smoke').disabled = !['house', 'volcano'].includes(selected.kind)
  $('save').disabled = !['tree', 'house', 'volcano'].includes(selected.kind)
  $('scope').disabled = selected.kind !== 'tree'
  if (selected.kind !== 'tree') $('scope').value = 'shared'
  if (selected.variant) {
    $('scope').value = 'variant'
    $('scope').disabled = true
    $('variant').value = selected.variant
  }
  $('variant').disabled =
    Boolean(selected.variant) || $('scope').value !== 'variant'
  $('scope-note').textContent =
    $('scope').value === 'shared'
      ? 'Saving updates all instances of the selected shared asset. Scene placements and study facts stay unchanged.'
      : 'Saving creates a reusable tree variant. Reference tree:<variant ID> in only the desired scene entries; existing scenes stay unchanged. The draft town previews show candidate appearances before references are changed.'
  $('command').textContent =
    `node tools/pixel-town/save-draft.mjs ~/Downloads/pixel-town-draft.json\nEDENIA_PIXEL_TOWN_ENABLED=true npm run build\n\nReview git diff and deterministic before/after captures before committing.`
  $('town-pair').style.maxWidth = $('phone').checked ? '390px' : ''
}
function reset() {
  $('scope').value = selected.variant ? 'variant' : 'shared'
  $('blossom').value = selected.variant
    ? VARIANTS[selected.variant].blossom
    : DESIGN.tree.blossom
  $('breeze').value = selected.variant
    ? VARIANTS[selected.variant].amplitude
    : EFFECTS.foliage.amplitude
  $('smoke').value = EFFECTS.smoke.height
  render()
}
function stop() {
  clearTimeout(timer)
  timer = null
}
function tick() {
  stop()
  if (!playing || document.hidden || reduced.matches) return
  $('phase').value = (Number($('phase').value) + 1 / 6) % 6
  render()
  timer = setTimeout(tick, 1000 / 6)
}
$('play').onclick = () => {
  playing = !playing
  $('play').setAttribute('aria-pressed', String(playing))
  tick()
}
for (const id of [
  'stage',
  'light',
  'phase',
  'blossom',
  'breeze',
  'smoke',
  'scope',
  'phone'
])
  $(id).addEventListener('input', render)
$('reset').onclick = reset
$('save').onclick = () => {
  const payload = {
    schema: 1,
    asset: selected.kind,
    scope: $('scope').value,
    variant: $('variant').value,
    design: { ...DESIGN, tree: { blossom: $('blossom').value } },
    effects: {
      ...EFFECTS,
      foliage: { ...EFFECTS.foliage, amplitude: Number($('breeze').value) },
      smoke: { ...EFFECTS.smoke, height: Number($('smoke').value) }
    }
  }
  const url = URL.createObjectURL(
      new Blob([JSON.stringify(payload, null, 2) + '\n'], {
        type: 'application/json'
      })
    ),
    a = document.createElement('a')
  a.href = url
  a.download = 'pixel-town-draft.json'
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 0)
}
document.addEventListener('visibilitychange', tick)
reduced.addEventListener('change', tick)
window.addEventListener('pagehide', stop)
reset()
