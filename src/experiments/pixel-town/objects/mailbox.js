export function drawMailbox(drawing, x, y) {
  const { box } = drawing
  box(x, y, 14, 2, 2, 15, 'wood', 'wood', 'woodD')
  box(x - 3, y - 1, 28, 8, 6, 6, 'teal', 'teal', 'tealD')
}
