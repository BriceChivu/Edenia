export const LIGHTS = ['dawn', 'day', 'sunset', 'night']
export function localLight(date = new Date()) {
  const hour = date.getHours() + date.getMinutes() / 60
  return hour < 5.5 || hour >= 20
    ? 'night'
    : hour < 7.5
      ? 'dawn'
      : hour < 17.5
        ? 'day'
        : 'sunset'
}
export function paletteFor(light, design) {
  const night = light === 'night',
    sunset = light === 'sunset' || light === 'dawn'
  const base = {
    sea: '#78b5c9',
    sea2: '#81bfce',
    ripple: '#b0d4d6',
    deep: '#5594a7',
    sand: '#ebd7aa',
    stone: '#b9a483',
    stoneD: '#92856f',
    stoneL: '#f1dfb9',
    grass: '#a7b981',
    grassD: '#718f67',
    grassL: '#c1cf99',
    leaf: '#729d7b',
    leafD: '#477865',
    leafL: '#a7c294',
    bark: '#997856',
    barkD: '#705b47',
    cream: '#f3dfb8',
    wall: '#dbc69c',
    wallD: '#b7a17e',
    outline: '#706d5c',
    roof: '#e69b72',
    roofL: '#f1b78c',
    roofD: '#b86f53',
    purple: '#aaa0c2',
    purpleL: '#c3b3d0',
    purpleD: '#827593',
    teal: '#78a69d',
    tealD: '#527d79',
    glass: '#86bec2',
    flower: '#e7b2c5',
    flower2: '#d7cd9d',
    wood: '#c79e6b',
    woodL: '#edc491',
    woodD: '#957349'
  }
  if (design?.tree?.blossom) base.treeBlossom = design.tree.blossom
  const tint = night ? [34, 54, 83] : sunset ? [219, 140, 119] : [0, 0, 0],
    mix = night ? 0.6 : sunset ? 0.19 : 0,
    p = {}
  for (const [key, hex] of Object.entries(base)) {
    p[key] =
      '#' +
      [1, 3, 5]
        .map((i, j) =>
          Math.round(
            parseInt(hex.slice(i, i + 2), 16) * (1 - mix) + tint[j] * mix
          )
            .toString(16)
            .padStart(2, '0')
        )
        .join('')
  }
  if (night)
    Object.assign(p, {
      sea: '#294963',
      sea2: '#325771',
      ripple: '#678a9b',
      deep: '#223d56',
      cream: '#8c9ca5',
      wall: '#6f8391',
      wallD: '#566c7d',
      stoneL: '#9caeb5',
      sand: '#8d9d9f',
      stone: '#6d828c',
      stoneD: '#4f6678',
      grass: '#5d7a70',
      grassD: '#3c5c59',
      grassL: '#789285',
      leaf: '#557e78',
      leafD: '#365a5d',
      leafL: '#789c8c',
      roof: '#8e7478',
      roofL: '#bba3a1',
      roofD: '#695b6b',
      purple: '#827b9d',
      purpleL: '#ada5c4',
      purpleD: '#615d7e'
    })
  if (sunset)
    Object.assign(p, {
      sea: '#94adb4',
      sea2: '#a2bdbe',
      ripple: '#d4c9bd',
      cream: '#f3d2ad',
      roof: '#e59a77',
      roofL: '#f8b991',
      roofD: '#ae6e5f'
    })
  return p
}
