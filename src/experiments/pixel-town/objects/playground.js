export function drawPlayground(drawing, x, y) {
  const { face, seg, box } = drawing
  for (const xx of [x, x + 27]) {
    seg([xx, y - 5, 14], [xx, y, 43], 'wood', 3)
    seg([xx, y + 12, 14], [xx, y, 43], 'wood', 3)
  }
  seg([x - 3, y, 43], [x + 30, y, 43], 'woodL', 3)
  for (const xx of [x + 9, x + 20]) seg([xx, y, 41], [xx, y + 2, 24], 'woodD')
  box(x + 8, y, 23, 14, 5, 2, 'roofL', 'roof', 'roofD')
  box(x + 37, y - 5, 14, 3, 3, 25, 'woodL', 'wood', 'woodD')
  box(x + 49, y - 5, 14, 3, 3, 25, 'woodL', 'wood', 'woodD')
  face(
    [
      [x + 34, y - 9, 39],
      [x + 44, y - 9, 47],
      [x + 55, y - 9, 39],
      [x + 55, y + 2, 39],
      [x + 44, y + 2, 47],
      [x + 34, y + 2, 39]
    ],
    'roof'
  )
  face(
    [
      [x + 38, y + 1, 33],
      [x + 46, y + 1, 33],
      [x + 46, y + 26, 14],
      [x + 38, y + 26, 14]
    ],
    'teal'
  )
  seg([x + 37, y + 1, 34], [x + 37, y + 26, 15], 'sand', 2)
  seg([x + 47, y + 1, 34], [x + 47, y + 26, 15], 'sand', 2)
}
