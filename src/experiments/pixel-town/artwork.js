import { createDrawing } from './shared/drawing.js'
export { WIDTH, HEIGHT } from './shared/drawing.js'
import { drawSea } from './objects/sea.js'
import { drawIsland } from './objects/island.js'
import { drawPaving } from './objects/paving.js'
import { drawFlowers } from './objects/flowers.js'
import { drawShrub } from './objects/shrub.js'
import { drawPot } from './objects/pot.js'
import { drawFence } from './objects/fence.js'
import { drawLamp } from './objects/lamp.js'
import { drawTree } from './objects/tree.js'
import { drawHouse } from './objects/house.js'
import { drawDock } from './objects/dock.js'
import { drawBoat } from './objects/boat.js'
import { drawPool } from './objects/pool.js'
import { drawChair } from './objects/chair.js'
import { drawPlayground } from './objects/playground.js'
import { drawRocks } from './objects/rocks.js'
import { drawReflection } from './objects/reflection.js'
import { drawMailbox } from './objects/mailbox.js'
import { drawBridge } from './objects/bridge.js'
import { drawVolcano } from './objects/volcano.js'
import { drawBirds } from './objects/birds.js'

// Compatible composition/workshop interface. Geometry belongs in objects/;
// group projection and rasterization belong in shared/drawing.js.
// Coordinate defaults preserve the original no-argument workshop previews;
// scenes pass their own anchors explicitly.
export function artwork(canvas, options = {}) {
  const drawing = createDrawing(canvas, options)
  return {
    at: drawing.at,
    sea: (...args) => drawSea(drawing, ...args),
    island: (...args) => drawIsland(drawing, ...args),
    paving: (...args) => drawPaving(drawing, ...args),
    flowers: (...args) => drawFlowers(drawing, ...args),
    shrub: (...args) => drawShrub(drawing, ...args),
    pot: (...args) => drawPot(drawing, ...args),
    fence: (...args) => drawFence(drawing, ...args),
    lamp: (...args) => drawLamp(drawing, ...args),
    tree: (...args) => drawTree(drawing, ...args),
    house: (...args) => drawHouse(drawing, ...args),
    dock: (x = -21, y = 53) => drawDock(drawing, x, y),
    boat: (x = -12, y = 105) => drawBoat(drawing, x, y),
    pool: (...args) => drawPool(drawing, ...args),
    chair: (...args) => drawChair(drawing, ...args),
    playground: (...args) => drawPlayground(drawing, ...args),
    rocks: (...args) => drawRocks(drawing, ...args),
    reflection: (...args) => drawReflection(drawing, ...args),
    mailbox: (x = -30, y = 33) => drawMailbox(drawing, x, y),
    bridge: (x = 200, y = 283) => drawBridge(drawing, x, y),
    volcano: (...args) => drawVolcano(drawing, ...args),
    birds: (x = 438, y = 403) => drawBirds(drawing, x, y)
  }
}
