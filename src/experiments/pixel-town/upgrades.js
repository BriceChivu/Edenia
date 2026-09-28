// Purchase catalog: only garden-flower-1 is enabled in the first milestone.
// Its 15-coin cost is fixed; other costs and placements remain provisional.
// The proposed starting town includes the main island, a small house, a basic
// path, and an empty garden. Water, reflections, and shoreline are free scenery.
//
// Each ID represents one purchase at a fixed location. Save purchases and spent
// coins in the learner profile, not here. Spending coins must not reduce XP or level. Show an unpurchased item's outline
// only when all prerequisites are owned and the current unspent balance covers
// its cost. After buying, deduct the cost and recalculate affordable outlines.
//
// Locations below describe intent. Coordinates, footprint, and draw order must
// be reviewed together before implementation; new islands must not move items
// already built. Artwork IDs refer to catalog-data.js. Existing artwork may need
// adjustment; a null asset marks artwork that still needs to be created.
// Only the first flower placement has reviewed coordinates, footprint and depth.

export const UPGRADES = [
  {
    id: 'garden-flower-1',
    name: 'First flower patch',
    description: 'A small patch of flowers beside your front door.',
    cost: 15,
    placement: {
      area: 'home',
      location: 'Beside the front door',
      coordinates: [-49, 13],
      footprint: [28, 18],
      depth: 10
    },
    artwork: { asset: 'flowers', status: 'existing' },
    requires: []
  },
  {
    id: 'garden-flower-2',
    name: 'Second flower patch',
    description: 'More flowers to brighten the front path.',
    cost: 15,
    placement: {
      area: 'home',
      location: 'Along the front path',
      coordinates: null,
      footprint: null,
      depth: null
    },
    artwork: { asset: 'flowers', status: 'existing' },
    requires: []
  },
  {
    id: 'garden-shrub',
    name: 'Small shrub',
    description: 'A leafy shrub for the garden corner.',
    cost: 20,
    placement: {
      area: 'home',
      location: 'Right corner of the garden',
      coordinates: null,
      footprint: null,
      depth: null
    },
    artwork: { asset: 'shrub', status: 'existing' },
    requires: []
  },
  {
    id: 'door-planter',
    name: 'Doorstep planter',
    description: 'A potted plant to welcome you home.',
    cost: 20,
    placement: {
      area: 'home',
      location: 'Left of the front door',
      coordinates: null,
      footprint: null,
      depth: null
    },
    artwork: { asset: 'pot', status: 'existing' },
    requires: []
  },
  {
    id: 'mailbox',
    name: 'Mailbox',
    description: 'A mailbox at the end of your path.',
    cost: 25,
    placement: {
      area: 'home',
      location: 'Where the path reaches the shore',
      coordinates: null,
      footprint: null,
      depth: null
    },
    artwork: { asset: 'mailbox', status: 'existing' },
    requires: []
  },
  {
    id: 'garden-fence',
    name: 'Garden fence',
    description: 'A fence along the front of your garden.',
    cost: 30,
    placement: {
      area: 'home',
      location: 'Front boundary of the garden',
      coordinates: null,
      footprint: null,
      depth: null
    },
    artwork: { asset: 'fence', status: 'existing' },
    requires: []
  },
  {
    id: 'garden-lantern',
    name: 'Garden lantern',
    description: 'A lantern beside the path to your house.',
    cost: 35,
    placement: {
      area: 'home',
      location: 'Beside the front path',
      coordinates: null,
      footprint: null,
      depth: null
    },
    artwork: { asset: 'lamp', status: 'existing' },
    requires: []
  },
  {
    id: 'fishing-dock',
    name: 'Wooden fishing dock',
    description: 'A wooden dock with room to moor a boat.',
    cost: 35,
    placement: {
      area: 'home',
      location: 'Lower-right shore of the main island',
      coordinates: null,
      footprint: null,
      depth: null
    },
    artwork: { asset: 'dock', status: 'existing' },
    requires: []
  },
  {
    id: 'fishing-boat',
    name: 'Small fishing boat',
    description: 'A small fishing boat moored beside your dock.',
    cost: 40,
    placement: {
      area: 'home',
      location: 'On the water beside the dock',
      coordinates: null,
      footprint: null,
      depth: null
    },
    artwork: { asset: 'boat', status: 'existing' },
    requires: ['fishing-dock']
  },
  {
    id: 'flowering-tree',
    name: 'Flowering tree',
    description: 'A tree in bloom behind your house.',
    cost: 50,
    placement: {
      area: 'home',
      location: 'Behind and right of the house',
      coordinates: null,
      footprint: null,
      depth: null
    },
    artwork: { asset: 'tree', status: 'existing' },
    requires: []
  },
  {
    id: 'garden-bench',
    name: 'Garden bench',
    description: 'A place to sit beneath the flowering tree.',
    cost: 45,
    placement: {
      area: 'home',
      location: 'Under the flowering tree',
      coordinates: null,
      footprint: null,
      depth: null
    },
    artwork: { asset: null, status: 'needs-artwork' },
    requires: ['flowering-tree']
  },
  {
    id: 'dock-lantern',
    name: 'Dock lantern',
    description: 'A lantern at the end of your fishing dock.',
    cost: 25,
    placement: {
      area: 'home',
      location: 'End of the dock',
      coordinates: null,
      footprint: null,
      depth: null
    },
    artwork: { asset: 'lamp', status: 'existing' },
    requires: ['fishing-dock']
  },
  {
    id: 'playground',
    name: 'Children’s playground',
    description: 'A playground on the open side of your island.',
    cost: 100,
    placement: {
      area: 'home',
      location: 'Open ground on the right of the main island',
      coordinates: null,
      footprint: null,
      depth: null
    },
    artwork: { asset: 'playground', status: 'existing' },
    requires: []
  },
  {
    id: 'west-island',
    name: 'Small western island',
    description: 'A new island with space for a pool and cottage.',
    cost: 120,
    placement: {
      area: 'pool-island',
      location: 'Water to the left of the main island',
      coordinates: null,
      footprint: null,
      depth: null
    },
    artwork: { asset: 'island', status: 'existing' },
    requires: []
  },
  {
    id: 'west-bridge',
    name: 'Wooden footbridge',
    description: 'A footbridge connecting your main and western islands.',
    cost: 65,
    placement: {
      area: 'bridge',
      location: 'Between the main and western islands',
      coordinates: null,
      footprint: null,
      depth: null
    },
    artwork: { asset: 'bridge', status: 'existing' },
    requires: ['west-island']
  },
  {
    id: 'swimming-pool',
    name: 'Swimming pool',
    description: 'A pool on your western island.',
    cost: 90,
    placement: {
      area: 'pool-island',
      location: 'Front half of the western island',
      coordinates: null,
      footprint: null,
      depth: null
    },
    artwork: { asset: 'pool', status: 'existing' },
    requires: ['west-island']
  },
  {
    id: 'pool-chair',
    name: 'Deckchair',
    description: 'A deckchair for relaxing beside the pool.',
    cost: 25,
    placement: {
      area: 'pool-island',
      location: 'Right side of the pool',
      coordinates: null,
      footprint: null,
      depth: null
    },
    artwork: { asset: 'chair', status: 'existing' },
    requires: ['swimming-pool']
  },
  {
    id: 'west-flower-bed',
    name: 'Island flower bed',
    description: 'Flowers along the edge of your western island.',
    cost: 30,
    placement: {
      area: 'pool-island',
      location: 'Front edge of the western island',
      coordinates: null,
      footprint: null,
      depth: null
    },
    artwork: { asset: 'flowers', status: 'existing' },
    requires: ['west-island']
  },
  {
    id: 'west-fence',
    name: 'Island fence',
    description: 'A fence around the western island’s garden edge.',
    cost: 35,
    placement: {
      area: 'pool-island',
      location: 'Along the western island’s garden edge',
      coordinates: null,
      footprint: null,
      depth: null
    },
    artwork: { asset: 'fence', status: 'existing' },
    requires: ['west-island']
  },
  {
    id: 'west-cottage',
    name: 'Small cottage',
    description: 'A small cottage overlooking the pool.',
    cost: 110,
    placement: {
      area: 'pool-island',
      location: 'Back half of the western island',
      coordinates: null,
      footprint: null,
      depth: null
    },
    artwork: { asset: 'house', status: 'existing' },
    requires: ['west-island']
  },
  {
    id: 'northeast-island',
    name: 'Northeastern island',
    description: 'Another island with room for a neighboring home.',
    cost: 150,
    placement: {
      area: 'neighbor',
      location: 'Water behind and right of the main island',
      coordinates: null,
      footprint: null,
      depth: null
    },
    artwork: { asset: 'island', status: 'existing' },
    requires: []
  },
  {
    id: 'neighbor-house',
    name: 'Neighbor’s house',
    description: 'A neighboring house on the northeastern island.',
    cost: 120,
    placement: {
      area: 'neighbor',
      location: 'Center of the northeastern island',
      coordinates: null,
      footprint: null,
      depth: null
    },
    artwork: { asset: 'house', status: 'existing' },
    requires: ['northeast-island']
  },
  {
    id: 'neighbor-tree',
    name: 'Neighbor’s flowering tree',
    description: 'A flowering tree beside the neighboring house.',
    cost: 50,
    placement: {
      area: 'neighbor',
      location: 'Right of the neighbor’s house',
      coordinates: null,
      footprint: null,
      depth: null
    },
    artwork: { asset: 'tree', status: 'existing' },
    requires: ['neighbor-house']
  },
  {
    id: 'neighbor-garden',
    name: 'Neighbor’s flower garden',
    description: 'A flower garden in front of the neighboring house.',
    cost: 40,
    placement: {
      area: 'neighbor',
      location: 'In front of the neighbor’s house',
      coordinates: null,
      footprint: null,
      depth: null
    },
    artwork: { asset: 'flowers', status: 'existing' },
    requires: ['neighbor-house']
  },
  {
    id: 'neighbor-lantern',
    name: 'Neighbor’s lantern',
    description: 'A lantern to light the neighboring front path.',
    cost: 35,
    placement: {
      area: 'neighbor',
      location: 'Beside the neighbor’s front path',
      coordinates: null,
      footprint: null,
      depth: null
    },
    artwork: { asset: 'lamp', status: 'existing' },
    requires: ['neighbor-house']
  }
]
