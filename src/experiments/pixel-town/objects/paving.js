export function drawPaving(drawing, x, y, w, d) {
  const { rand, face, seg } = drawing
  for (let yy = y; yy < y + d; yy += 8)
    for (let xx = x; xx < x + w; xx += 10) {
      const n = xx + yy * 123
      face(
        [
          [xx + 0.7, yy + 0.7, 14.5],
          [Math.min(xx + 9, x + w), yy + 0.4, 14.5],
          [Math.min(xx + 9, x + w), Math.min(yy + 7, y + d), 14.5],
          [xx + 0.3, Math.min(yy + 7, y + d), 14.5]
        ],
        rand(n) > 0.4 ? 'sand' : 'stoneL'
      )
      seg(
        [xx + 0.5, Math.min(yy + 7, y + d), 14.6],
        [Math.min(xx + 9, x + w), Math.min(yy + 7, y + d), 14.6],
        'stone'
      )
    }
}
