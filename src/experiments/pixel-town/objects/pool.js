export function drawPool(drawing, x, y) {
  const { R, line, oval, P, scale } = drawing
  const a = P(x, y, 18)
  oval(a[0], a[1] + 3, 23 * scale, 12 * scale, 'stone')
  oval(a[0], a[1], 23 * scale, 12 * scale, 'stoneL')
  oval(a[0], a[1] - 2, 19 * scale, 9 * scale, 'teal')
  oval(a[0], a[1] - 3, 16 * scale, 7 * scale, 'glass')
  line(
    [a[0] - 11 * scale, a[1] - 5 * scale],
    [a[0] + 3 * scale, a[1] - 5 * scale],
    'ripple'
  )
  oval(a[0] - 3 * scale, a[1] - 4 * scale, 4 * scale, 2 * scale, 'roofL')
  R(a[0], a[1] - 8 * scale, 3 * scale, 4 * scale, 'roofL')
}
