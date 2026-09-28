export function drawShrub(drawing, x, y, r = 7) {
  const { R, oval, rand, P, scale } = drawing
  let a = P(x, y, 18)
  oval(a[0] + 2, a[1] + 3, r * scale, r * 0.6 * scale, 'grassD')
  oval(a[0], a[1], r * scale, r * 0.7 * scale, 'leafD')
  oval(a[0] - 1, a[1] - 2, (r - 1) * scale, r * 0.6 * scale, 'leaf')
  for (let i = 0; i < 8; i++)
    R(
      a[0] + (rand(i + x) * 2 - 1) * r * 0.7 * scale,
      a[1] - rand(i + y) * r * 0.5 * scale,
      2,
      1,
      'leafL'
    )
}
