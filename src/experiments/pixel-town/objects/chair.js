export function drawChair(drawing, x, y) {
  const { face, seg } = drawing
  for (let i = 0; i < 4; i++)
    face(
      [
        [x + i * 3, y, 18],
        [x + i * 3 + 3, y, 18],
        [x + i * 3 + 3, y - 13, 28],
        [x + i * 3, y - 13, 28]
      ],
      i % 2 ? 'teal' : 'cream'
    )
  for (let i = 0; i < 4; i++)
    face(
      [
        [x + i * 3, y, 18],
        [x + i * 3 + 3, y, 18],
        [x + i * 3 + 3, y + 12, 16],
        [x + i * 3, y + 12, 16]
      ],
      i % 2 ? 'teal' : 'cream'
    )
  for (const xx of [x - 1, x + 13]) {
    seg([xx, y - 13, 28], [xx, y + 13, 14], 'wood', 2)
    seg([xx, y - 4, 14], [xx, y + 5, 21], 'wood', 2)
  }
}
