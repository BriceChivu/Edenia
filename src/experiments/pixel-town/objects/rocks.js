export function drawRocks(drawing, x, y) {
  const { poly, oval, rand, P, scale } = drawing
  for (let i = 0; i < 3; i++) {
    const a = P(x + i * 13, y + rand(i + 8) * 7, 1)
    oval(a[0], a[1], 5 * scale, 3 * scale, 'ripple')
    poly(
      [
        [a[0] - 4 * scale, a[1]],
        [a[0] - 3 * scale, a[1] - 7 * scale],
        [a[0] + 1 * scale, a[1] - 9 * scale],
        [a[0] + 5 * scale, a[1] - 3 * scale],
        [a[0] + 3 * scale, a[1] + 2 * scale]
      ],
      i % 2 ? 'stone' : 'sand'
    )
  }
}
