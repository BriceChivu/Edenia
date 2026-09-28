export function drawBirds(drawing, cx, cy) {
  const { R, oval, breeze } = drawing
  for (let i = 0; i < 3; i++) {
    const x = cx + i * 17,
      y = cy + (i % 2) * 9
    oval(x + breeze(i), y + 3, 7, 2, 'sea2')
    R(x, y, 6, 3, 'cream')
    R(x + 5, y - 3, 3, 5, 'cream')
    R(x + 8, y - 1, 2, 1, 'roofL')
  }
}
