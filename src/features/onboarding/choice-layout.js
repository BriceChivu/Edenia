export const ONBOARDING_CHOICE_LAYOUT_STATES = Object.freeze([
  'single-stacked',
  'single-inline',
  'double-stacked',
  'double-inline'
])

export const ONBOARDING_CHOICE_SCROLL_LAYOUT = 'double-inline-scroll'

export function selectOnboardingChoiceLayout({
  applyLayout,
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

  for (const layout of ONBOARDING_CHOICE_LAYOUT_STATES) {
    applyLayout(layout)
    if (isContained()) return layout
  }

  applyLayout(ONBOARDING_CHOICE_SCROLL_LAYOUT)
  return ONBOARDING_CHOICE_SCROLL_LAYOUT
}
