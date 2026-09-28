export function drawHouse(drawing, x, y, w = 48, d = 40, h = 43, purple = false) {
  const {
    c,
    R,
    oval,
    rand,
    P,
    face,
    seg,
    box,
    night,
    sunset,
    motion,
    effects,
    design,
    scale
  } = drawing
  const z = 14,
    rh = w * 0.68,
    roof = purple ? 'purple' : 'roof',
    rL = purple ? 'purpleL' : 'roofL',
    rD = purple ? 'purpleD' : 'roofD'
  c.globalAlpha = 0.18
  face(
    [
      [x, y + d, z],
      [x + w + 23, y + d + 13, z],
      [x + w + 25, y - 2, z],
      [x + w, y - 7, z]
    ],
    'outline'
  )
  c.globalAlpha = 1
  box(x - 1, y - 1, z, w + 2, d + 2, 5, 'stoneL', 'stone', 'stoneD')
  box(x, y, z + 5, w, d, h - 5, 'cream', 'cream', 'wall')
  face(
    [
      [x, y + d, z + h],
      [x + w, y + d, z + h],
      [x + w / 2, y + d, z + h + rh]
    ],
    'cream'
  )
  // Small masonry courses remain subordinate to the windows and roof.
  for (let zz = z + 8; zz < z + h - 2; zz += 7)
    for (let xx = x + 2; xx < x + w - 3; xx += 10) {
      if (rand(xx + zz) > 0.55)
        seg([xx, y + d + 0.1, zz], [xx + 5, y + d + 0.1, zz], 'wall')
    }
  for (let zz = z + 8; zz < z + h - 2; zz += 8)
    for (let yy = y + 3; yy < y + d - 3; yy += 11)
      if (rand(yy + zz) > 0.35)
        seg([x + w + 0.1, yy, zz], [x + w + 0.1, yy + 7, zz], 'wallD')
  // Arched front door, drawn directly in its isometric wall plane.
  const doorx = x + w * 0.39,
    doorw = w * 0.23,
    doorh = h * 0.57
  const arch = (xx, ww, hh, col) => {
    let a = [
      [xx, y + d + 0.3, z + 4],
      [xx + ww, y + d + 0.3, z + 4],
      [xx + ww, y + d + 0.3, z + hh - ww / 2]
    ]
    for (let i = 0; i <= 12; i++) {
      const t = (i / 12) * Math.PI
      a.push([
        xx + ww / 2 + (Math.cos(t) * ww) / 2,
        y + d + 0.3,
        z + hh - ww / 2 + (Math.sin(t) * ww) / 2
      ])
    }
    face(a, col)
  }
  arch(doorx - 2, doorw + 4, doorh + 3, 'wallD')
  arch(doorx, doorw, doorh, 'tealD')
  arch(doorx + 1, doorw - 2, doorh - 1, 'teal')
  for (let i = 3; i < doorw - 1; i += 3)
    seg(
      [doorx + i, y + d + 0.6, z + 5],
      [doorx + i, y + d + 0.6, z + doorh - 7],
      'tealD'
    )
  let knob = P(doorx + doorw - 3, y + d + 0.8, z + 13)
  R(knob[0], knob[1], 2, 2, 'sand')
  box(doorx - 3, y + d + 1, z, doorw + 6, 7, 3, 'sand', 'stone', 'stoneD')
  // Round attic window in the gable, with a warm inset and cross mullion.
  let cx = x + w / 2,
    cz = z + h + rh * 0.28
  const circle = []
  for (let i = 0; i < 32; i++) {
    let a = (i * Math.PI) / 16
    circle.push([cx + Math.cos(a) * 5.7, y + d + 0.5, cz + Math.sin(a) * 6.5])
  }
  face(circle, 'woodD')
  const inner = circle.map(([xx, yy, zz]) => [
    cx + (xx - cx) * 0.72,
    yy,
    cz + (zz - cz) * 0.72
  ])
  face(inner, night ? '#f4d394' : sunset ? '#f6d49f' : 'glass')
  seg([cx, y + d + 0.6, cz - 4.5], [cx, y + d + 0.6, cz + 4.5], 'cream')
  seg([cx - 3.5, y + d + 0.6, cz], [cx + 3.5, y + d + 0.6, cz], 'cream')
  // Side window with shutters and planter.
  let wy = y + d * 0.34,
    wz = z + h * 0.43
  face(
    [
      [x + w + 0.3, wy, wz],
      [x + w + 0.3, wy + 14, wz],
      [x + w + 0.3, wy + 14, wz + 15],
      [x + w + 0.3, wy, wz + 15]
    ],
    'tealD'
  )
  face(
    [
      [x + w + 0.5, wy + 2, wz + 2],
      [x + w + 0.5, wy + 12, wz + 2],
      [x + w + 0.5, wy + 12, wz + 13],
      [x + w + 0.5, wy + 2, wz + 13]
    ],
    night ? '#e9c890' : 'glass'
  )
  seg([x + w + 0.7, wy + 7, wz + 2], [x + w + 0.7, wy + 7, wz + 13], 'cream')
  seg([x + w + 0.7, wy + 2, wz + 7], [x + w + 0.7, wy + 12, wz + 7], 'cream')
  box(x + w, wy - 1, wz - 3, 3, 16, 3, 'woodL', 'wood', 'woodD')
  // Swept roof slope. Each terracotta tile is its own polygon, not a texture filter.
  const rz = (u) => z + h + rh * (1 - u) - Math.sin(u * Math.PI) * 2
  const left = [
    [x - 4, y - 4, z + h - 2],
    [x + w / 2, y - 4, z + h + rh],
    [x + w / 2, y + d + 4, z + h + rh],
    [x - 4, y + d + 4, z + h - 2]
  ]
  face(left, rD)
  const roofRows = design.roof.rows,
    roofCols = 7
  for (let row = 0; row < roofRows; row++) {
    let u = row / roofRows,
      v = (row + 1) / roofRows
    for (let j = -1; j < roofCols; j++) {
      let ya = Math.max(
          y - 4,
          y - 4 + ((j + (row % 2) * 0.5) * (d + 8)) / roofCols
        ),
        yb = Math.min(
          y + d + 4,
          y - 4 + ((j + 1 + (row % 2) * 0.5) * (d + 8)) / roofCols
        )
      if (yb <= ya) continue
      const xa = x + w / 2 + u * (w / 2 + 5),
        xb = x + w / 2 + v * (w / 2 + 5)
      face(
        [
          [xa, ya, rz(u)],
          [xb, ya, rz(v)],
          [xb, yb - 0.7, rz(v)],
          [xa, yb - 0.7, rz(u)]
        ],
        roof
      )
      seg([xb, ya, rz(v)], [xb, yb - 0.7, rz(v)], rD)
      seg([xa, ya, rz(u)], [xb, ya, rz(v)], rD)
      if (row % 2 === 0)
        seg(
          [xa + 0.5, ya + 0.8, rz(u) + 0.4],
          [xa + (xb - xa) * 0.48, ya + 0.8, rz((u + v) / 2) + 0.4],
          rL
        )
    }
  }
  seg(
    [x + w + 5, y - 4, z + h - 2],
    [x + w + 5, y + d + 4, z + h - 2],
    rD,
    3 * scale
  )
  seg(
    [x - 4, y + d + 4, z + h - 2],
    [x + w / 2, y + d + 4, z + h + rh],
    rL,
    3 * scale
  )
  seg(
    [x + w / 2, y + d + 4, z + h + rh],
    [x + w + 5, y + d + 4, z + h - 2],
    rL,
    3 * scale
  )
  seg(
    [x + w / 2, y - 4, z + h + rh + 1],
    [x + w / 2, y + d + 4, z + h + rh + 1],
    rL,
    3 * scale
  )
  box(
    x + w * 0.58,
    y + 3,
    z + h + rh * 0.58,
    8,
    8,
    23,
    'stoneL',
    'cream',
    'wall'
  )
  box(
    x + w * 0.58 - 1,
    y + 2,
    z + h + rh * 0.58 + 22,
    10,
    10,
    3,
    'sand',
    'stone',
    'stoneD'
  )
  face(
    [
      [x + w * 0.58 + 1, y + 4, z + h + rh * 0.58 + 25.1],
      [x + w * 0.58 + 6, y + 4, z + h + rh * 0.58 + 25.1],
      [x + w * 0.58 + 6, y + 9, z + h + rh * 0.58 + 25.1],
      [x + w * 0.58 + 1, y + 9, z + h + rh * 0.58 + 25.1]
    ],
    'outline'
  )
  const smoke = P(x + w * 0.58 + 4, y + 6, z + h + rh * 0.58 + 29)
  for (let i = 0; i < 5; i++) {
    const age = motion.smokeAge(i)
    c.globalAlpha = 0.22 * Math.sin(age * Math.PI)
    oval(
      smoke[0] + (Math.sin(age * 5 + x) * 2 + age * 6) * scale,
      smoke[1] - age * 32 * scale * effects.smoke.height,
      (2 + age * 3) * scale,
      (1.5 + age * 2) * scale,
      'cream'
    )
  }
  c.globalAlpha = 1
  if (night || sunset) {
    c.globalAlpha = night ? 0.15 : 0.05
    face(
      [
        [doorx, y + d + 5, 14.7],
        [doorx + doorw, y + d + 5, 14.7],
        [doorx + doorw + 8, y + d + 25, 14.7],
        [doorx - 8, y + d + 25, 14.7]
      ],
      '#ffd596'
    )
    c.globalAlpha = 1
  }
}
