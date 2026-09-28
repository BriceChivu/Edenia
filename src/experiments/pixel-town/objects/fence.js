export function drawFence(drawing, x, y, n, dir = 'x') {
  const { seg, box } = drawing
  const dx = dir === 'x' ? 1 : 0,
    dy = 1 - dx
  for (const z of [18, 23])
    seg([x, y, z], [x + dx * n, y + dy * n, z], 'cream', 2)
  for (let i = 0; i <= n; i += 8)
    box(x + dx * i, y + dy * i, 14, 3, 3, 13, 'stoneL', 'cream', 'wall')
}
