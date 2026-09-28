export function drawTree(drawing, x, y) {
  const { c, R, oval, rand, P, seg, breeze, effects, scale } = drawing
  const foot = P(x, y)
  c.globalAlpha = 0.18
  oval(
    foot[0] + 12 * scale,
    foot[1] + 3 * scale,
    23 * scale,
    9 * scale,
    'leafD'
  )
  c.globalAlpha = 1
  seg([x, y, 14], [x - 2, y, 52], 'barkD', 5 * scale)
  seg([x - 1, y, 14], [x - 3, y, 51], 'bark', 2 * scale)
  seg([x - 2, y, 34], [x - 12, y, 47], 'bark', 3 * scale)
  seg([x - 2, y, 37], [x + 9, y - 1, 53], 'bark', 3 * scale)
  const clusters = [
    [-13, 1, 49, 11],
    [9, 0, 51, 14],
    [-7, -3, 64, 15],
    [5, 4, 64, 15],
    [-15, 7, 59, 11],
    [0, 11, 54, 14],
    [10, 10, 59, 11]
  ]
  for (const [dx, dy, z, r] of clusters) {
    const a = P(x + dx, y + dy, z)
    a[0] += breeze(x + dx * 0.08) * effects.foliage.amplitude
    oval(a[0] + 2, a[1] + 3, r * scale, r * 0.84 * scale, 'leafD')
    oval(a[0], a[1], r * scale, r * 0.82 * scale, 'leaf')
    oval(
      a[0] - r * 0.22 * scale,
      a[1] - r * 0.25 * scale,
      r * 0.72 * scale,
      r * 0.48 * scale,
      'leafL'
    )
    for (let i = 0; i < 12; i++) {
      const xx = a[0] + (rand(i + dx + 33) * 2 - 1) * r * 0.74 * scale,
        yy = a[1] + (rand(i + dy + 44) * 2 - 1) * r * 0.57 * scale
      R(xx, yy, 2 * scale, 1 * scale, i % 3 ? 'leaf' : 'leafD')
    }
    for (let i = 0; i < 2; i++) {
      let xx = a[0] + (rand(i + z) * 2 - 1) * r * 0.55 * scale,
        yy = a[1] + (rand(i + z + 9) * 2 - 1) * r * 0.5 * scale
      R(xx, yy, 3, 2, 'treeBlossom')
      R(xx + 1, yy - 1, 1, 4, 'cream')
    }
  }
}
