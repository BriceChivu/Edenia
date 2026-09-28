export function drawBridge(drawing, cx, cy) {
  const { R, poly, line } = drawing
  for (let i = 0; i < 16; i++) {
    let x = cx + i * 5,
      y = cy + Math.sin((i / 15) * Math.PI) * -9
    poly(
      [
        [x, y],
        [x + 5, y + 1],
        [x + 5, y + 15],
        [x, y + 14]
      ],
      i % 3 ? 'wood' : 'woodL'
    )
    line([x, y - 8], [x + 5, y - 7], 'woodL', 2)
    line([x, y + 7], [x + 5, y + 8], 'woodL', 2)
    line([x, y + 16], [x + 5, y + 17], 'woodD', 2)
    if (i % 4 === 0 || i === 15) {
      R(x, y - 9, 3, 25, 'wood')
      R(x, y + 5, 3, 15, 'woodD')
      R(x, y + 4, 3, 2, 'woodL')
    }
  }
}
