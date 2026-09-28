// Visual stages only. Study thresholds remain in features/city/model.js.
const item = (asset, args = [], depth = 0) => ({ asset, args, depth })
const homeGround = [
  item('paving', [-33, -5, 24, 57]),
  item('paving', [-29, 18, 65, 17]),
  item('shrub', [-45, -7, 8]),
  item('shrub', [17, 39, 7]),
  item('shrub', [36, 38, 7]),
  item('flowers', [-43, 42, 27]),
  item('flowers', [24, 41, 25])
]
const homeObjects = [
  item('house', [-42, -35], -53),
  item('tree', [30, -24], 6),
  item('lamp', [-46, 30], 17),
  item('flowers', [-49, 13, 23], 10),
  item('pot', [-24, 40], 49),
  item('pot', [7, 34], 48),
  item('fence', [11, 40, 28], 50),
  item('mailbox', [-30, 33], 56)
]
const home = (wide, playground = false, boat = true) => ({
  id: 'home',
  at: wide ? [383, 305, 1.18] : [384, 308, 1.6],
  items: [
    item('island', [wide ? 148 : 109, 108]),
    ...homeGround,
    ...[
      ...homeObjects,
      ...(playground ? [item('playground', [31, 7], 60)] : [])
    ].sort((a, b) => a.depth - b.depth),
    ...(boat ? [item('dock', [-21, 53]), item('boat', [-12, 105])] : []),
    item('rocks', [-51, 55])
  ]
})
const poolIsland = (extras = []) => ({
  id: 'pool-island',
  at: [140, 293, 1],
  items: [
    item('island', [103, 82]),
    item('paving', [-15, -12, 29, 45]),
    ...extras
  ]
})
const neighbor = (garden) => ({
  id: 'neighbor',
  at: [544, 208, 1],
  items: [
    item('island', [97, 83]),
    item('paving', [-13, -4, 24, 44]),
    ...(garden ? [item('fence', [-39, 28, 68])] : []),
    item('house', [-28, -27, 43, 37, 42, true]),
    item('tree', [29, -22]),
    item('lamp', [-36, 9]),
    ...(garden
      ? [item('flowers', [-25, 29, 32]), item('flowers', [22, 25, 32])]
      : []),
    item('rocks', [53, 20])
  ]
})
const cottage = item('house', [-22, -29, 33, 29, 33]),
  pool = item('pool', [-19, 25]),
  chair = item('chair', [21, 22])
const flowers = [
  item('flowers', [-32, 2, 25]),
  item('flowers', [32, 8, 22]),
  item('fence', [-32, 33, 45])
]
const poolStages = [
  [],
  [],
  [],
  [],
  [],
  [pool],
  [pool],
  [pool],
  [pool, chair, ...flowers],
  [cottage, pool, chair, ...flowers],
  [cottage, pool, chair, ...flowers],
  [cottage, pool, chair, ...flowers],
  [cottage, pool, chair, ...flowers]
]
// Each definition is a complete declarative scene. Authoring more scenes does not extend rewards.
export const SCENES = {
  0: { id: 0, groups: [], overlays: [] },
  1: {
    id: 1,
    groups: [home(false, false, false)],
    overlays: [item('reflection', [388, 426, 110, 30])]
  },
  2: {
    id: 2,
    groups: [home(false)],
    overlays: [item('reflection', [388, 426, 110, 30])]
  },
  3: { id: 3, groups: [poolIsland(), home(true)], overlays: [] },
  4: { id: 4, groups: [poolIsland(), home(true, true)], overlays: [] },
  5: {
    id: 5,
    groups: [poolIsland(poolStages[5]), home(true, true)],
    overlays: []
  },
  6: {
    id: 6,
    groups: [poolIsland(poolStages[6]), home(true, true)],
    overlays: [item('birds', [438, 403])]
  },
  7: {
    id: 7,
    groups: [
      poolIsland(poolStages[7]),
      { id: 'bridge', at: [0, 0, 1], items: [item('bridge', [200, 283])] },
      home(true, true)
    ],
    overlays: [item('birds', [438, 403])]
  },
  8: {
    id: 8,
    groups: [
      poolIsland(poolStages[8]),
      { id: 'bridge', at: [0, 0, 1], items: [item('bridge', [200, 283])] },
      home(true, true)
    ],
    overlays: [item('birds', [438, 403])]
  },
  9: {
    id: 9,
    groups: [
      poolIsland(poolStages[9]),
      { id: 'bridge', at: [0, 0, 1], items: [item('bridge', [200, 283])] },
      home(true, true)
    ],
    overlays: [item('birds', [438, 403])]
  },
  10: {
    id: 10,
    groups: [
      neighbor(false),
      poolIsland(poolStages[10]),
      { id: 'bridge', at: [0, 0, 1], items: [item('bridge', [200, 283])] },
      home(true, true)
    ],
    overlays: [item('birds', [438, 403])]
  },
  11: {
    id: 11,
    groups: [
      neighbor(true),
      poolIsland(poolStages[11]),
      { id: 'bridge', at: [0, 0, 1], items: [item('bridge', [200, 283])] },
      home(true, true)
    ],
    overlays: [item('birds', [438, 403])]
  },
  12: {
    id: 12,
    groups: [
      neighbor(true),
      {
        id: 'neighbor-reflection',
        at: [0, 0, 1],
        items: [item('reflection', [546, 250, 85, 42])]
      },
      poolIsland(poolStages[12]),
      {
        id: 'pool-reflection',
        at: [0, 0, 1],
        items: [item('reflection', [140, 337, 70, 33])]
      },
      { id: 'bridge', at: [0, 0, 1], items: [item('bridge', [200, 283])] },
      home(true, true),
      {
        id: 'home-reflection',
        at: [0, 0, 1],
        items: [item('reflection', [388, 390, 110, 30])]
      },
      {
        id: 'volcano',
        at: [663, 325, 1],
        items: [item('island', [43, 40]), item('volcano')]
      }
    ],
    overlays: [item('birds', [438, 403])]
  }
}
