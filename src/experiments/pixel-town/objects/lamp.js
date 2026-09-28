export function drawLamp(drawing, x, y) {
  const { c, oval, P, face, seg, box, night, sunset, scale } = drawing
  box(x, y, 14, 3, 3, 30, 'woodL', 'wood', 'woodD')
  seg([x, y, 42], [x + 9, y, 42], 'woodD', 2)
  box(x + 6, y - 1, 32, 7, 5, 9, 'woodD', 'woodD', 'woodD')
  face(
    [
      [x + 7, y + 4, 34],
      [x + 12, y + 4, 34],
      [x + 12, y + 4, 39],
      [x + 7, y + 4, 39]
    ],
    night ? '#ffdc9b' : sunset ? '#ffe0a2' : 'sand'
  )
  const a = P(x + 9, y + 2, 37)
  if (night || sunset) {
    c.globalAlpha = night ? 0.13 : 0.065
    const ground = P(x + 9, y + 4, 15)
    oval(ground[0], ground[1], 15 * scale, 7 * scale, '#ffd38b')
    c.globalAlpha = night ? 0.12 : 0.06
    oval(a[0], a[1], 15 * scale, 15 * scale, '#ffd38b')
    c.globalAlpha = 1
  }
}
