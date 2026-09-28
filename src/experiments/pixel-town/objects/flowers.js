export function drawFlowers(drawing, x, y, n = 16) {
  const { R, rand, P, breeze } = drawing
  for (let i = 0; i < n; i++) {
    const q = P(
      x + (rand(i + x) * 2 - 1) * 12,
      y + (rand(i + y + 65) * 2 - 1) * 6
    )
    R(q[0], q[1] - 4, 1, 4, 'leafD')
    const sway = i % 4 === 0 ? breeze(x + i) : 0
    R(q[0] - 1 + sway, q[1] - 5, 3, 2, i % 3 ? 'flower' : 'flower2')
    R(q[0] + sway, q[1] - 5, 1, 1, 'cream')
  }
}
