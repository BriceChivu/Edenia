// Pure, deterministic motion definitions. Geometry consumes offsets/ages only.
// Defaults preserve the approved six-second loop exactly.
export function motionAt(time, effects) {
  const phase = (period) => (time * Math.PI) / ((period || 6) / 2)
  const wave = (period, seed) => Math.round(Math.sin(phase(period) + seed))
  return {
    foliage: (seed) => wave(effects.foliage.period, seed),
    water: (seed) =>
      wave(effects.water?.period, seed) * (effects.water?.travel ?? 2),
    waterAlpha: (seed) =>
      0.8 + Math.sin(phase(effects.water?.period) + seed) * 0.2,
    boat: (seed) =>
      wave(effects.boat?.period, seed) * (effects.boat?.amplitude ?? 0.8),
    smokeAge: (index) => (index / 5 + time / effects.smoke.period) % 1
  }
}
