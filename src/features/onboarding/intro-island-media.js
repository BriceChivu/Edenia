import { RESPONSIVE_QUERIES } from '../../core/responsive-capabilities.js'

export function bindIntroIslandMediaChanges(refresh) {
  for (const query of [RESPONSIVE_QUERIES.reducedMotion, RESPONSIVE_QUERIES.phone]) {
    globalThis.matchMedia?.(query).addEventListener('change', refresh)
  }
}
