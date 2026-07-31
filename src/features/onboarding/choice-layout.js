export const ONBOARDING_CHOICE_LAYOUT_STATES = Object.freeze([
  'single-stacked',
  'single-inline',
  'double-stacked',
  'double-inline'
])

export const ONBOARDING_CHOICE_SCROLL_LAYOUT = 'double-inline-scroll'

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
