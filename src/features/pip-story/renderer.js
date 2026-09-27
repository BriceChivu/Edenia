const PANELS = { pond: [0, 0], garden: [1, 0], lilies: [0, 1], village: [1, 1], crossing: [0, 2], landing: [1, 2] }
const INK = '#273f3c'
const DUCK = [
  '         oooooo        ',
  '       ooYYYYYYoo      ',
  '      oYyyyyyyyyYo     ',
  '     oYyyyhhyyyyyYo    ',
  '     oYyyhhyyyyyyyYo   ',
  '     oYyyyyyyyyyyyYo   ',
  '     oYyyyyyyyyEyeYo   ',
  '      oYyyyyyyyEEyYoooo',
  '      oYyyyyyyccyYbbbbbo',
  '       oYyyyyyyyyYbbBBo',
  '  oo   oYyyyyyyyyYoooo ',
  ' oYYoooYyyyyyyyyYoo    ',
  'oYyyyyYyyyyyyyyYoo     ',
  'oYyyyyyyywwwwwyYo      ',
  'oYyyyyyywHHHwwyYo      ',
  ' oYyyyyywHHwwyyYo      ',
  '  oYyyyyywwwyyyYo      ',
  '   oYyyyyyyyyyYo       ',
  '    ooYYYYYYoo         ',
  '      oooooo           '
]

export function createSceneRenderer(canvas) {
  const ctx = canvas.getContext('2d', { alpha: false })
  const atlas = new Image()
  atlas.src = new URL('images/pip/world.png', document.baseURI).href
  const reduced = matchMedia('(prefers-reduced-motion: reduce)')
  let visual = null
  let frame = 0
  let tick = 0
  let start = 0
  let inView = true
  let disposed = false
  let running = true
  let lastDraw = 0
  const rect = (x, y, w, h, color) => {
    ctx.fillStyle = color
    ctx.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h))
  }
  const line = (points, color, width = 1) => {
    ctx.strokeStyle = color
    ctx.lineWidth = width
    ctx.beginPath()
    points.forEach(([x, y], i) => i ? ctx.lineTo(Math.round(x), Math.round(y)) : ctx.moveTo(Math.round(x), Math.round(y)))
    ctx.stroke()
  }
  function oval(x, y, w, h, color) {
    rect(x + 2, y, w - 4, h, color)
    rect(x, y + 2, w, Math.max(1, h - 4), color)
  }
  function sprite(grid, palette, x, y, scale = 1) {
    grid.forEach((row, ry) => [...row].forEach((c, rx) => {
      if (palette[c]) rect(x + Math.round(rx * scale), y + Math.round(ry * scale),
        Math.round((rx + 1) * scale) - Math.round(rx * scale),
        Math.round((ry + 1) * scale) - Math.round(ry * scale), palette[c])
    }))
  }
  function duck(name, blink) {
    const large = name !== 'Pip'
    if (name === 'Goose') {
      oval(0, 11, 29, 18, INK); oval(1, 11, 27, 15, '#f4ecd0')
      rect(18, -4, 8, 22, INK); rect(19, -4, 6, 22, '#f4ecd0')
      oval(16, -13, 13, 13, INK); oval(17, -13, 11, 11, '#fff5d9')
      rect(25, -9, 2, blink ? 1 : 3, INK); rect(28, -5, 9, 3, '#cb8b45')
      oval(4, 14, 15, 9, '#bdc9ad'); rect(6, 15, 10, 5, '#d9dfc3')
      rect(18, 6, 10, 3, '#a65948'); rect(22, 9, 4, 6, '#be7352')
      return
    }
    sprite(DUCK, { o: INK, Y: large ? '#c2cfae' : '#dda540', y: large ? '#fff2d2' : '#ffda68',
      h: '#fff1ad', w: large ? '#c2cfae' : '#eeb44c', H: large ? '#e3e8c7' : '#ffdf81',
      E: blink ? (large ? '#fff2d2' : '#ffda68') : INK, e: '#fff6d6', c: '#ec9e64', b: '#ea994b', B: '#b36b3f' }, 0, 0, large ? 1.25 : 1)
    if (blink) rect(16, 7, 3, 1, INK)
    if (name === 'Pip' && visual.leafHat) {
      rect(9, -1, 10, 2, '#2f6747'); rect(11, -3, 7, 2, '#6a9a58'); rect(15, -4, 1, 3, '#bad479')
    }
    if (name === 'Goose') { rect(7, 12, 12, 3, '#bf6554'); rect(15, 12, 3, 7, '#913f41') }
  }
  function frog(blink) {
    oval(1, 9, 24, 12, INK); oval(3, 7, 20, 12, '#5a905f')
    oval(5, 8, 16, 12, '#abd283'); rect(8, 15, 10, 5, '#e1dda1')
    for (const x of [5, 17]) {
      rect(x - 1, 2, 6, 8, INK); rect(x, 2, 4, 6, '#9dca72')
      rect(x + 1, blink ? 6 : 4, 2, blink ? 1 : 3, INK)
    }
    rect(9, 11, 9, 1, '#446c51'); rect(1, 20, 7, 2, '#639663'); rect(19, 20, 7, 2, '#639663')
  }
  function turtle(blink) {
    for (const x of [3, 15]) { rect(x, 18, 5, 4, '#507457'); rect(x - 1, 7, 5, 4, '#507457') }
    oval(0, 4, 24, 17, INK); oval(2, 3, 20, 16, '#638658')
    oval(5, 5, 13, 10, '#94ab65'); rect(9, 6, 4, 5, '#b5bd78')
    line([[4, 12], [9, 10], [15, 11], [18, 16]], '#415f46')
    oval(21, 10, 10, 9, INK); oval(23, 9, 9, 8, '#a5bd79')
    rect(29, blink ? 13 : 11, 2, blink ? 1 : 3, INK)
  }
  function butterfly(t) {
    const wing = 7 + Math.round(Math.sin(t * 7) * 2)
    oval(10 - wing, 2, wing, 13, '#284461'); oval(12, 2, wing, 13, '#284461')
    oval(11 - wing, 2, wing - 2, 10, '#79bbd0'); oval(13, 2, wing - 2, 10, '#79bbd0')
    rect(11 - wing, 4, 3, 4, '#c0e5cd'); rect(wing + 8, 4, 3, 4, '#c0e5cd')
    oval(5, 13, 6, 7, '#7588bd'); oval(12, 13, 6, 7, '#7588bd')
    rect(10, 4, 3, 15, INK); line([[11, 7], [7, 0]], INK); line([[12, 7], [16, 0]], INK)
  }
  function mouse(blink, keeper = false) {
    line([[3, 20], [-4, 19], [-7, 14]], '#b98b77', 2)
    oval(3, 10, 19, 13, INK); oval(4, 9, 17, 13, '#a77e62')
    oval(7, 1, 16, 13, INK); oval(8, 1, 14, 12, '#c69c74')
    oval(5, -3, 7, 8, '#866855'); oval(6, -2, 4, 5, '#d4a08b')
    rect(19, 6, 2, blink ? 1 : 3, INK); rect(21, 10, 4, 2, '#65534d')
    rect(7, 15, 12, 7, keeper ? '#6a96a0' : '#a94d46'); rect(10, 15, 5, 5, '#f1d7a0')
    rect(5, 22, 7, 2, '#705346'); rect(17, 22, 7, 2, '#705346')
    if (keeper) { rect(6, 1, 18, 3, '#436b72'); rect(10, -2, 12, 3, '#6a96a0') }
  }
  function beetle(t) {
    for (let i = 0; i < 3; i++) {
      const sy = i * 4 + 9
      line([[3, sy], [-2, sy + (i % 2 ? 2 : -1)]], INK)
      line([[15, sy], [21, sy + (i % 2 ? 2 : -1)]], INK)
    }
    oval(2, 6, 15, 15, INK); oval(4, 7, 11, 12, '#ab6d50'); rect(9, 8, 1, 11, '#734c41')
    rect(5, 8, 2, 5, '#db9b66'); oval(5, 1, 10, 7, INK); rect(12, 3, 2, 2, '#e8ddac')
    line([[7, 3], [4, -1], [2, -1]], INK); line([[13, 3], [17, 0]], INK)
  }
  function snail(blink) {
    oval(0, 17, 30, 6, '#78957b'); oval(2, 3, 21, 19, INK); oval(3, 3, 19, 17, '#c38c62')
    line([[18, 15], [8, 15], [6, 8], [15, 6], [17, 11], [11, 12], [11, 9]], '#815a4b', 2)
    rect(24, 8, 5, 12, '#a1b394'); rect(24, 4, 1, 6, INK); rect(29, 3, 1, 8, INK)
    rect(23, 3, 3, blink ? 1 : 2, INK); rect(28, 2, 3, blink ? 1 : 2, INK)
    rect(7, 10, 11, 7, '#f5e6b9'); line([[8, 11], [13, 15], [18, 11]], '#af8e69')
  }
  function dragonflies(t) {
    for (let i = 0; i < 3; i++) {
      const x = i * 13 - 13, y = Math.round(Math.sin(t * 3 + i) * 3) - i % 2 * 9
      rect(x, y, 2, 15, '#477879'); rect(x, y - 2, 3, 4, '#c3d8b1')
      rect(x - 6, y + 2, 14, 2, '#cee8d8'); rect(x - 4, y + 6, 10, 1, '#b1d5cd')
    }
  }
  function drawActor(name, x, y, t, index) {
    const bob = Math.round(Math.sin(t * 2.7 + index * 1.7) * (name === 'Luma' ? 3 : 1))
    const blink = !reduced.matches && (t + index * .6) % 4.3 > 4.12
    ctx.save(); ctx.translate(Math.round(x), Math.round(y))
    ctx.globalAlpha = .24; oval(-13, 21, 29, 5, '#203e39'); ctx.globalAlpha = 1
    ctx.translate(-12, -bob)
    if (['Pip', 'Mama', 'Papa', 'Goose'].includes(name)) {
      duck(name, blink)
    } else if (['Tumble', 'Map frog'].includes(name)) frog(blink)
    else if (name === 'Moss') turtle(blink)
    else if (name === 'Luma') butterfly(t)
    else if (name === 'Dragonflies') dragonflies(t)
    else if (name === 'Nell') snail(blink)
    else if (['Bram', 'Beetle', 'Ants'].includes(name)) beetle(t)
    else mouse(blink, name === 'Keeper')
    ctx.restore()
  }
  function prop(name, x, y, t) {
    ctx.save(); ctx.translate(Math.round(x), Math.round(y))
    if (name.includes('boat')) {
      if (name === 'upturned-boat') { oval(0, 1, 30, 12, '#72503e'); rect(4, 1, 22, 4, '#c39462') }
      else { rect(1, 9, 28, 4, '#664b3b'); rect(-3, 3, 37, 6, '#b18752'); rect(1, 3, 29, 3, '#e0b974'); rect(5, 0, 22, 3, '#715c3b') }
      if (name === 'broken-boat') { rect(13, 2, 6, 10, '#3c8884'); rect(20, 9, 12, 3, '#b18752') }
      if (visual.cargo !== 'Most things lost') { rect(6, -3, 8, 7, '#bfac74'); rect(17, -1, 5, 5, '#8a9b6b') }
    } else if (name === 'nursery') {
      oval(-32, -3, 65, 23, '#4b7570'); oval(-29, -3, 59, 18, '#78b8a1')
      for (let i = 0; i < 7; i++) {
        const xx = -23 + i * 7 + Math.round(Math.sin(t + i) * 3)
        const yy = 3 + Math.round(Math.cos(t * .7 + i) * 4)
        rect(xx, yy, 3, 2, '#375f56'); rect(xx + 3, yy - 1, 3, 1, '#375f56')
      }
      if (!visual.nurseryDone && !visual.nurseryAction && visual.nursery !== 'New channel') { rect(-30, -6, 56, 4, '#876343'); rect(-15, -11, 4, 9, '#876343') }
      if (visual.nursery === 'New channel') { rect(-60, 5, 34, 6, '#78b8a1'); line([[-58, 5], [-46, 6], [-38, 2], [-28, 3]], '#c8ddac') }
      if (visual.nursery === 'Moved baby frog pool') { oval(36, 0, 30, 18, '#5a8f7f'); oval(39, 1, 24, 13, '#8dc4ac') }
    } else if (name === 'basket') {
      line([[0, 3], [0, -14], [22, -14], [26, 3]], '#94704b', 3)
      rect(-5, 0, 39, 20, INK); rect(-3, 0, 35, 18, '#b98b55')
      for (let yy = 3; yy < 18; yy += 4) rect(-3, yy, 35, 1, '#e0b576')
      for (let xx = 1; xx < 32; xx += 5) rect(xx, 0, 1, 18, '#826844')
      if (visual.scene === 'detour') { rect(-6, -3, 41, 4, '#557d4d'); rect(1, -6, 25, 3, '#89a46a') }
    } else if (name === 'bottle') {
      rect(0, -5, 6, 7, '#c7d8a2'); oval(-4, 1, 15, 22, '#9bbfa0'); rect(-1, 6, 7, 12, '#eddfac'); rect(-2, 3, 2, 15, '#d4e6b7')
    } else if (name === 'letter') {
      const drift = visual.sent ? (Math.sin(t * .3) + 1) * 6 : 0
      rect(-13 + drift, 0, 29, 17, '#705d47'); rect(-12 + drift, -1, 27, 16, '#fff0bd')
      line([[-11 + drift, 0], [1 + drift, 9], [14 + drift, 0]], '#bb9d72')
      rect(-1 + drift, 7, 5, 4, '#ba6656')
    } else if (name === 'bars') {
      for (let i = 0; i < 6; i++) rect(i * 8, -13, 3, 29, '#6b8984')
      rect(-2, -8, 47, 3, '#b0b8a0')
    } else if (name === 'table') {
      rect(-33, 12, 6, 14, '#6c503d'); rect(25, 12, 6, 14, '#6c503d')
      rect(-38, 1, 76, 13, '#775c3f'); rect(-38, 1, 76, 3, '#ba995d'); rect(-35, 7, 70, 1, '#c2a167')
      for (let i = 0; i < 4; i++) { oval(-28 + i * 17, -2, 12, 6, '#e1ce96'); rect(-24 + i * 17, -2, 5, 2, '#9e7251') }
    } else if (name === 'bread') { oval(-10, 0, 30, 13, '#b98746'); oval(-8, -2, 26, 11, '#e8c780'); rect(-3, 0, 3, 2, '#f5dfa3'); rect(6, 2, 2, 2, '#a57e44') }
    else if (name === 'sign' || name === 'fork' || name === 'marker') {
      rect(0, -10, 3, 36, '#836244'); rect(-13, -9, 29, 11, '#c09b5d'); rect(-11, -7, 25, 1, '#e0be7c')
      if (name === 'fork') { rect(-9, 5, 28, 6, '#aa864e'); rect(17, 7, 4, 2, '#aa864e') }
      else { for (let i = 0; i < 3; i++) rect(-9, -5 + i * 2, 17 - i * 3, 1, '#795b3e') }
    } else if (name === 'cups') {
      for (let i = 0; i < 3; i++) { oval(i * 12, 0, 10, 8, '#5d8157'); rect(i * 12 + 2, 0, 6, 3, '#b2c784') }
    } else if (name === 'stones') { for (let i = 0; i < 4; i++) { oval(i * 8, i % 2 * 6, 7, 5, '#829486'); rect(i * 8 + 2, i % 2 * 6, 3, 1, '#b6c0a2') } }
    else if (name === 'root') { rect(-8, 16, 49, 5, '#856946'); rect(20, 7, 5, 12, '#856946') }
    else { rect(0, 8, 6, 4, '#dbbe78'); rect(12, 13, 9, 3, '#80a15c'); rect(-10, 16, 4, 4, '#a16b55') }
    ctx.restore()
  }
  function draw(now = 0) {
    if (disposed || !visual || !canvas.width) return
    const w = canvas.width, h = canvas.height
    const t = reduced.matches ? 0 : now / 1000
    const [col, row] = PANELS[visual.environment]
    ctx.imageSmoothingEnabled = false
    rect(0, 0, w, h, '#69a8a0')
    if (atlas.complete && atlas.naturalWidth) {
      const sw = atlas.naturalWidth / 2, sh = atlas.naturalHeight / 3
      // Fit each atlas panel to the frame; foreground sprites keep their scale.
      ctx.drawImage(atlas, col * sw + 2, row * sh + 2, sw - 4, sh - 4, 0, 0, w, h)
    } else {
      rect(0, 0, w, h * .32, '#90b980'); rect(0, 0, w, 15, '#385f4d')
      for (let i = 0; i < 28; i++) oval((i * 61) % w, (i * 37) % h, 20, 8, '#8aad70')
    }
    // Small independent motions preserve the quiet scene while reading.
    for (let i = 0; i < 15; i++) {
      const x = (i * 43 + t * 3) % w, y = h * (.27 + (i % 5) * .06)
      ctx.globalAlpha = .18 + Math.sin(t * 1.8 + i) * .08
      rect(x, y, 7 + i % 5, 1, '#e3eed1'); rect(x + 3, y + 2, 6, 1, '#e3eed1')
    }
    ctx.globalAlpha = 1
    for (let i = 0; i < 5; i++) {
      const x = i < 3 ? 8 + i * 7 : w - 12 - (i - 3) * 7
      const y = h * .67 - (i % 2) * 6, sway = Math.round(Math.sin(t * 1.3 + i) * 2)
      line([[x, y], [x + sway + 1, y - 16]], '#608752')
      line([[x, y - 4], [x + 6 + sway, y - 13], [x + 2, y - 7]], '#98af64')
    }
    const dialogue = canvas.parentElement.querySelector('.pip-dialogue')
    const ratio = w / Math.max(1, canvas.clientWidth)
    const reading = canvas.parentElement.dataset.mode === 'reading'
    const clearBottom = reading && dialogue ? dialogue.offsetTop * ratio : h * .65
    const ground = Math.max(26, Math.min(h * .37, clearBottom - 35))
    visual.props.forEach((name, i) => prop(name, w * (name === 'sign' ? .84 : name === 'table' ? .60 : .64 + i * .07), ground + (name === 'sign' ? -2 : 20), t))
    visual.actors.forEach((name, i) => {
      let x = w * (i === 0 ? .40 : i === 1 ? .56 : .73) + (i > 2 ? (i - 2) * 19 : 0)
      let y = ground + (i % 2 ? -10 : 0)
      const elapsed = Math.min(1, (now - start) / 1400)
      if (i === 0 && visual.effect === 'cross' && !reduced.matches) x += Math.round(elapsed * 24)
      if (i === 0 && visual.effect === 'rescue' && !reduced.matches) x += Math.round(Math.sin(elapsed * Math.PI) * 22)
      if (name === 'Luma' || name === 'Dragonflies') y -= 17
      drawActor(name, x, y, t, i)
      if (i === 0 && visual.effect && elapsed < 1 && !reduced.matches) {
        for (let j = 0; j < 5; j++) rect(x - 18 + j * 10, y + 21 - Math.sin(elapsed * Math.PI) * (8 + j % 3 * 3), 2, 3, '#d8edce')
      }
    })
    if (visual.scene === 'meeting' && visual.actors.includes('Tumble')) {
      ctx.globalAlpha = .65; oval(w * .56 + 2, ground - 23 + Math.sin(t * 2) * 2, 8, 8, '#d7ede0'); ctx.globalAlpha = 1
    }
    if (visual.evening) { ctx.globalAlpha = .14; rect(0, 0, w, h, '#805763'); ctx.globalAlpha = 1 }
    for (let i = 0; i < 5; i++) {
      ctx.globalAlpha = .2 + .3 * Math.max(0, Math.sin(t * 1.2 + i))
      rect((i * 77 + 34) % w, h * .2 + Math.sin(t * .6 + i) * 8, 1, 2, '#fff2b2')
    }
    ctx.globalAlpha = 1
    canvas.dataset.frame = String(++tick)
  }
  function loop(now) {
    frame = 0
    if (!running || disposed || !inView || document.hidden || reduced.matches) return
    if (now - lastDraw >= 65) { draw(now); lastDraw = now }
    frame = requestAnimationFrame(loop)
  }
  function wake() {
    cancelAnimationFrame(frame); frame = 0
    if (running && inView && !document.hidden && !disposed) { draw(performance.now()); if (!reduced.matches) frame = requestAnimationFrame(loop) }
  }
  const resize = new ResizeObserver(([entry]) => {
    const { width, height } = entry.contentRect
    if (!width || !height) return
    canvas.width = width < 500 ? 256 : 416
    canvas.height = Math.round(canvas.width * height / width)
    wake()
  })
  resize.observe(canvas)
  const visibility = new IntersectionObserver(([entry]) => { inView = entry.isIntersecting; wake() })
  visibility.observe(canvas)
  document.addEventListener('visibilitychange', wake)
  reduced.addEventListener('change', wake)
  atlas.onload = wake
  return {
    refresh: wake,
    show(next) {
      const signature = JSON.stringify(next)
      if (signature !== JSON.stringify(visual)) { visual = next; start = performance.now(); wake() }
    },
    destroy() {
      disposed = true; running = false; cancelAnimationFrame(frame)
      resize.disconnect(); visibility.disconnect()
      document.removeEventListener('visibilitychange', wake); reduced.removeEventListener('change', wake)
    }
  }
}
