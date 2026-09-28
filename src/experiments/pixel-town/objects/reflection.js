export function drawReflection(drawing, cx, cy, w, h) {
  const { c, R, rand, night, motion } = drawing
  for (let i = 0; i < 12; i++) {
    c.globalAlpha = (1 - i / 12) * (night ? 0.12 : 0.09)
    const rw = w * (1 - i / 17) * (0.35 + rand(i + 1) * 0.4)
    R(
      cx - rw / 2 + (rand(i + 71) - 0.5) * 12 + motion.water(i),
      cy + i * 3,
      rw,
      1,
      night ? '#efc993' : 'stoneL'
    )
  }
  c.globalAlpha = 1
}
