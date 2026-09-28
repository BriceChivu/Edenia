export function drawBoat(drawing, x, y) {
  const { face, seg, box, motion, withOffsetY } = drawing
  withOffsetY(motion.boat(1), () => {
    face(
      [
        [x - 9, y - 21, 0],
        [x + 9, y - 18, 0],
        [x + 12, y + 12, 0],
        [x, y + 22, 0],
        [x - 10, y + 12, 0]
      ],
      'deep'
    )
    const pts = [
      [x - 8, y - 19, 5],
      [x + 7, y - 19, 5],
      [x + 11, y + 10, 5],
      [x, y + 20, 5],
      [x - 10, y + 10, 5]
    ]
    face(pts, 'woodD')
    face(
      pts.map(([xx, yy, z]) => [
        x + (xx - x) * 0.8,
        y + (yy - y) * 0.89,
        z + 1
      ]),
      'woodL'
    )
    face(
      pts.map(([xx, yy, z]) => [
        x + (xx - x) * 0.58,
        y + (yy - y) * 0.77,
        z + 1.1
      ]),
      'woodD'
    )
    for (const yy of [y - 9, y + 5])
      box(x - 7, yy, 6, 14, 3, 2, 'woodL', 'wood', 'woodD')
    seg([x - 17, y - 10, 9], [x + 17, y + 11, 9], 'wood', 2)
  })
}
