export const RESPONSIVE_QUERIES = Object.freeze({
  phone: '(max-width: 640px)',
  phoneOrAnyCoarse: '(max-width: 640px), (any-pointer: coarse)',
  compactPortrait: '(max-aspect-ratio: 590/736)',
  coarsePrimary: '(pointer: coarse)',
  tabletCoarse: '(min-width: 641px) and (any-pointer: coarse)',
  wideFineHover:
    '(min-width: 641px) and (hover: hover) and (pointer: fine)',
  wideNoHover: '(min-width: 641px) and (hover: none)',
  reducedMotion: '(prefers-reduced-motion: reduce)'
})

export function matchesResponsiveMedia(query, matchMedia = null) {
  const matcher = matchMedia || globalThis.matchMedia
  return Boolean(
    typeof matcher === 'function'
    && matcher.call(globalThis, query)?.matches
  )
}

export function usesPhoneComposition(matchMedia = null) {
  return matchesResponsiveMedia(RESPONSIVE_QUERIES.phone, matchMedia)
}

export function usesCompactPortraitComposition(matchMedia = null) {
  return matchesResponsiveMedia(
    RESPONSIVE_QUERIES.compactPortrait,
    matchMedia
  )
}

export function supportsAnkiIntegrationInput(matchMedia = null) {
  return !matchesResponsiveMedia(
    RESPONSIVE_QUERIES.phoneOrAnyCoarse,
    matchMedia
  )
}

export function hasCoarsePrimaryPointer(matchMedia = null) {
  return matchesResponsiveMedia(
    RESPONSIVE_QUERIES.coarsePrimary,
    matchMedia
  )
}

export function usesTabletCoarseInput(matchMedia = null) {
  return matchesResponsiveMedia(
    RESPONSIVE_QUERIES.tabletCoarse,
    matchMedia
  )
}

export function supportsChannelShelfMouseDrag(matchMedia = null) {
  return matchesResponsiveMedia(
    RESPONSIVE_QUERIES.wideFineHover,
    matchMedia
  )
}

export function usesTapVideoShelfPreviewInput(matchMedia = null) {
  return matchesResponsiveMedia(
    RESPONSIVE_QUERIES.wideNoHover,
    matchMedia
  )
}

export function supportsVideoShelfPreviewInput(matchMedia = null) {
  return (
    matchesResponsiveMedia(RESPONSIVE_QUERIES.wideFineHover, matchMedia)
    || usesTapVideoShelfPreviewInput(matchMedia)
  )
}

export function prefersReducedMotion(matchMedia = null) {
  return matchesResponsiveMedia(
    RESPONSIVE_QUERIES.reducedMotion,
    matchMedia
  )
}

export function usesDocumentHeatmapPositioning(
  viewportWidth,
  matchMedia = null
) {
  return (
    hasCoarsePrimaryPointer(matchMedia)
    || Number(viewportWidth) <= 768
  )
}
