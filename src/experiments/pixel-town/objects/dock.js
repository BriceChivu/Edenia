export function drawDock(drawing, x, y) {
  const { seg, box } = drawing
  for (let i = 0; i < 6; i++)
    box(x, y + i * 5, 10, 32, 4.5, 3, 'woodL', 'wood', 'woodD')
  for (const xx of [x - 2, x + 31])
    for (const yy of [y + 3, y + 26])
      box(xx, yy, 0, 4, 4, 23, 'woodL', 'wood', 'woodD')
  seg([x + 31, y + 24, 3], [x + 31, y + 24, 13], 'woodL', 2)
  for (let z = 1; z < 12; z += 4)
    seg([x + 31, y + 22, z], [x + 31, y + 32, z], 'woodL')
}
