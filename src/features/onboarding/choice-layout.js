export const ONBOARDING_CHOICE_LAYOUT_STATES = Object.freeze([
  'single-stacked',
  'single-inline',
  'double-stacked',
  'double-inline'
])

export const ONBOARDING_CHOICE_SCROLL_LAYOUT = 'double-inline-scroll'
const VISUAL_VIEWPORT_SCALE_TOLERANCE = 0.01

export function shouldSyncOnboardingChoiceLayoutForViewportResize({
  previousSize,
  nextSize,
  visualScale = 1
}) {
  // Pinch zoom changes the visual viewport without changing page layout.
  if (
    Number.isFinite(visualScale)
    && Math.abs(visualScale - 1) > VISUAL_VIEWPORT_SCALE_TOLERANCE
  ) {
    return false
  }

  if (!previousSize || !nextSize) return true

  return (
    previousSize.width !== nextSize.width
    || previousSize.height !== nextSize.height
  )
}

export function selectOnboardingChoiceLayout({
  applyLayout,
  candidateLayouts = ONBOARDING_CHOICE_LAYOUT_STATES,
  fallbackLayout = ONBOARDING_CHOICE_SCROLL_LAYOUT,
  isContained
}) {
  if (
    typeof applyLayout !== 'function'
    || typeof isContained !== 'function'
  ) {
    throw new TypeError(
      'Onboarding choice layout requires applyLayout and isContained callbacks'
    )
  }
  if (
    !Array.isArray(candidateLayouts)
    || !candidateLayouts.length
    || candidateLayouts.some(layout => typeof layout !== 'string' || !layout)
    || typeof fallbackLayout !== 'string'
    || !fallbackLayout
  ) {
    throw new TypeError(
      'Onboarding choice layout requires candidate layouts and a fallback layout'
    )
  }

  for (const layout of candidateLayouts) {
    applyLayout(layout)
    if (isContained()) return layout
  }

  applyLayout(fallbackLayout)
  return fallbackLayout
}
