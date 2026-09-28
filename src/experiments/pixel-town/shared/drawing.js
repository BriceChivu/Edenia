import { motionAt } from '../effects.js'
import { paletteFor } from '../lighting.js'
import { EFFECTS, DESIGN } from '../parameters.js'
export const WIDTH = 768,
  HEIGHT = 460
// Integer-grid artwork transcribed from the owner-approved isometric study at 238297c.
// Shared rasterization, materials, deterministic motion and group projection.
// Object modules receive this context; no scene or learner state lives here.
export function createDrawing(
  canvas,
  { light = 'day', time = 0, effects = EFFECTS, design = DESIGN } = {}
) {
  const W = WIDTH,
    H = HEIGHT,
    c = canvas.getContext('2d')
  c.imageSmoothingEnabled = false
  const p = paletteFor(light, design),
    night = light === 'night',
    sunset = light === 'sunset' || light === 'dawn'
  const motion = motionAt(time, effects),
    breeze = (seed = 0) => motion.foliage(seed)
  const R = (x, y, w, h, col) => {
    c.fillStyle = p[col] || col
    c.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h))
  }
  const poly = (ps, col) => {
    const ymin = Math.floor(Math.min(...ps.map((a) => a[1]))),
      ymax = Math.ceil(Math.max(...ps.map((a) => a[1])))
    for (let y = ymin; y < ymax; y++) {
      const xs = []
      for (let i = 0; i < ps.length; i++) {
        const a = ps[i],
          b = ps[(i + 1) % ps.length]
        if (
          (a[1] <= y + 0.5 && b[1] > y + 0.5) ||
          (b[1] <= y + 0.5 && a[1] > y + 0.5)
        )
          xs.push(a[0] + ((y + 0.5 - a[1]) * (b[0] - a[0])) / (b[1] - a[1]))
      }
      xs.sort((a, b) => a - b)
      for (let i = 0; i < xs.length; i += 2)
        R(
          Math.round(xs[i]),
          y,
          Math.round(xs[i + 1]) - Math.round(xs[i]),
          1,
          col
        )
    }
  }
  const line = (a, b, col, w = 1) => {
    let [x, y] = a.map(Math.round),
      [tx, ty] = b.map(Math.round),
      dx = Math.abs(tx - x),
      sx = x < tx ? 1 : -1,
      dy = -Math.abs(ty - y),
      sy = y < ty ? 1 : -1,
      err = dx + dy
    while (true) {
      R(x, y, w, w, col)
      if (x === tx && y === ty) break
      const e = 2 * err
      if (e >= dy) {
        err += dy
        x += sx
      }
      if (e <= dx) {
        err += dx
        y += sy
      }
    }
  }
  const oval = (x, y, rx, ry, col) => {
    for (let j = -Math.ceil(ry); j <= ry; j++) {
      let half = Math.floor(
        rx * Math.sqrt(Math.max(0, 1 - (j * j) / (ry * ry)))
      )
      R(x - half, y + j, half * 2 + 1, 1, col)
    }
  }
  const rand = (n) => {
    const k = Math.sin(n * 78.233 + 12.9898) * 43758.5453
    return k - Math.floor(k)
  }
  let ox = 0,
    oy = 0,
    scale = 1
  const P = (x, y, z = 14) => [
    ox + (x - y) * 0.866 * scale,
    oy + (x + y) * 0.5 * scale - z * scale
  ]
  const face = (ps, col) =>
    poly(
      ps.map((a) => P(...a)),
      col
    )
  const seg = (a, b, col, w = 1) => line(P(...a), P(...b), col, w)
  function box(
    x,
    y,
    z,
    w,
    d,
    h,
    top = 'stoneL',
    front = 'stone',
    side = 'stoneD'
  ) {
    face(
      [
        [x, y, z + h],
        [x + w, y, z + h],
        [x + w, y + d, z + h],
        [x, y + d, z + h]
      ],
      top
    )
    face(
      [
        [x, y + d, z],
        [x + w, y + d, z],
        [x + w, y + d, z + h],
        [x, y + d, z + h]
      ],
      front
    )
    face(
      [
        [x + w, y, z],
        [x + w, y + d, z],
        [x + w, y + d, z + h],
        [x + w, y, z + h]
      ],
      side
    )
  }
  function at(x, y, s, fn) {
    ox = x
    oy = y
    scale = s
    fn()
  }
  // Boat bobbing is a temporary screen-space offset, independent of group scale.
  function withOffsetY(offset, draw) {
    const previous = oy
    oy += offset
    try {
      draw()
    } finally {
      oy = previous
    }
  }
  return {
    c,
    R,
    poly,
    line,
    oval,
    rand,
    P,
    face,
    seg,
    box,
    W,
    H,
    night,
    sunset,
    motion,
    breeze,
    effects,
    design,
    at,
    withOffsetY,
    get scale() {
      return scale
    }
  }
}
