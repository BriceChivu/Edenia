export function drawSea(drawing) {
  const { c, R, rand, W, H, motion } = drawing
  R(0, 0, W, H, 'sea')
  // Quiet broad bands replace the wallpaper-like ripples of the rejected pass.
  for (let i = 0; i < 380; i++) {
    const moving = i % 6 === 0,
      x = Math.floor(rand(i + 50) * W) + (moving ? motion.water(i) : 0),
      y = Math.floor(rand(i + 730) * H)
    c.globalAlpha =
      (0.08 + rand(i + 800) * 0.13) * (moving ? motion.waterAlpha(i) : 1)
    R(x, y, 3 + rand(i + 310) * 17, 1, i % 3 ? 'ripple' : 'deep')
  }
  c.globalAlpha = 1
}
