export function getCityImageCoverGeometry({
  viewportWidth,
  viewportHeight,
  imageWidth,
  imageHeight,
  scale = 1
}) {
  const dimensions = [
    viewportWidth,
    viewportHeight,
    imageWidth,
    imageHeight,
    scale
  ]
  if (dimensions.some(value => !Number.isFinite(value) || value <= 0)) {
    return null
  }

  const coverScale = Math.max(
    viewportWidth / imageWidth,
    viewportHeight / imageHeight
  )
  const baseWidth = imageWidth * coverScale
  const baseHeight = imageHeight * coverScale
  const renderedWidth = baseWidth * scale
  const renderedHeight = baseHeight * scale

  return {
    baseWidth,
    baseHeight,
    renderedWidth,
    renderedHeight,
    maxX: Math.max(0, (renderedWidth - viewportWidth) / 2),
    maxY: Math.max(0, (renderedHeight - viewportHeight) / 2)
  }
}
