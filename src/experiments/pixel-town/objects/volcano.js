import { drawShrub } from './shrub.js'

export function drawVolcano(drawing) {
  const { c, oval, P, face, seg, motion, effects } = drawing
  const facets = [
    [
      [-17, 13, 14],
      [-8, -4, 62],
      [0, -8, 68],
      [2, 12, 14]
    ],
    [
      [2, 12, 14],
      [0, -8, 68],
      [9, -6, 66],
      [20, 8, 14]
    ],
    [
      [20, 8, 14],
      [9, -6, 66],
      [16, 1, 49],
      [23, 10, 14]
    ]
  ]
  facets.forEach((a, i) => face(a, ['stone', 'stoneD', 'outline'][i]))
  seg([-8, 4, 24], [-5, -2, 54], 'stoneL', 2)
  seg([5, 7, 19], [5, -3, 55], 'stone', 2)
  const a = P(1, -5, 66)
  oval(a[0], a[1], 9, 4, 'stoneL')
  oval(a[0], a[1], 6, 2, 'outline')
  smokeAt(a)
  drawShrub(drawing, -12, 11, 5)
  drawShrub(drawing, 18, 6, 5)

  function smokeAt(a) {
    for (let i = 0; i < 5; i++) {
      const age = motion.smokeAge(i)
      c.globalAlpha = 0.13 * Math.sin(age * Math.PI)
      oval(
        a[0] + age * 9,
        a[1] - (4 + age * 28) * effects.smoke.height,
        3 + age * 4,
        2 + age * 3,
        'cream'
      )
    }
    c.globalAlpha = 1
  }
}
