export function drawIsland(drawing, w, d) {
  const { c, R, oval, rand, P, face, seg, breeze, scale } = drawing
  const a = P(0, 0, 0)
  c.globalAlpha = 0.18
  oval(
    a[0] + 9 * scale,
    a[1] + 11 * scale,
    (w + d) * 0.45 * scale,
    (w + d) * 0.24 * scale,
    'deep'
  )
  c.globalAlpha = 1
  for (const [add, z, color] of [
    [19, -4, 'sea2'],
    [9, -2, 'ripple'],
    [4, -1, 'deep']
  ])
    face(
      rounded(w + add, d + add).map(([x, y]) => [x, y, z]),
      color
    )
  const pts = rounded(w, d)
  // Individual sandstone blocks around the full curved retaining wall.
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i],
      b = pts[(i + 1) % pts.length]
    face(
      [
        [...a, 0],
        [...b, 0],
        [...b, 14],
        [...a, 14]
      ],
      i < 13 ? 'stone' : 'stoneD'
    )
    seg([...a, 0], [...b, 0], 'stoneD')
    seg([...a, 1], [...a, 14], 'stoneD')
    seg([a[0], a[1], 7], [b[0], b[1], 7], 'stoneD')
  }
  face(
    pts.map(([x, y]) => [x, y, 14]),
    'sand'
  )
  face(
    rounded(w - 11, d - 11, 16).map(([x, y]) => [x, y, 14]),
    'grass'
  )
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i],
      b = pts[(i + 1) % pts.length]
    seg([...a, 14], [...b, 14], 'stoneL')
  }
  for (let i = 0; i < 220; i++) {
    const x = (rand(i + 41) - 0.5) * (w - 20),
      y = (rand(i + 87) - 0.5) * (d - 20)
    if (Math.abs(x) > w / 2 - 23 && Math.abs(y) > d / 2 - 23) continue
    const q = P(x, y)
    R(q[0], q[1], 1 + rand(i + 67) * 2, 1, i % 3 ? 'grassL' : 'grassD')
    if (i % 19 === 0) {
      R(q[0], q[1] - 2, 1, 2, 'grassD')
      R(q[0] + breeze(i), q[1] - 3, 1, 1, 'grassL')
    }
  }

}

function rounded(w, d, r = Math.min(w, d) * 0.29) {
  const pts = []
  for (const [x, y, start] of [
    [w / 2 - r, -d / 2 + r, -90],
    [w / 2 - r, d / 2 - r, 0],
    [-w / 2 + r, d / 2 - r, 90],
    [-w / 2 + r, -d / 2 + r, 180]
  ])
    for (let i = 0; i <= 6; i++) {
      let a = ((start + i * 15) * Math.PI) / 180
      pts.push([x + Math.cos(a) * r, y + Math.sin(a) * r])
    }
  return pts
}
