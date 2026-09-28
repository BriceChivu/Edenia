import { drawShrub } from './shrub.js'

export function drawPot(drawing, x, y) {
  const { box } = drawing
  box(x - 3, y - 3, 14, 6, 6, 5, 'sand', 'roof', 'roofD')
  drawShrub(drawing, x, y, 5)
}
