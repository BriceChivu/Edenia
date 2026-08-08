const LETTER_RE = /\p{Letter}/u
const LATIN_RE = /\p{Script=Latin}/u

export function normalizeChannelSearchText(value) {
  return String(value || '')
    .normalize('NFKD')
    .replace(/\p{Mark}+/gu, '')
    .toLocaleLowerCase()
    .replace(/[^\p{Letter}\p{Number}]+/gu, ' ')
    .trim()
    .replace(/\s+/g, ' ')
}

export function containsNonLatinLetter(value) {
  return Array.from(String(value || '')).some(character => (
    LETTER_RE.test(character) && !LATIN_RE.test(character)
  ))
}

export function isSupportedChannelSearchQuery(value) {
  const normalized = normalizeChannelSearchText(value)
  if (!normalized) return false
  const characterCount = Array.from(normalized.replace(/\s+/g, '')).length
  return containsNonLatinLetter(normalized)
    ? characterCount >= 1
    : characterCount >= 2
}

export function tokenMatchesChannelSearch(token, candidateTokens) {
  const normalizedToken = normalizeChannelSearchText(token)
  if (!normalizedToken) return false
  return candidateTokens.some(candidateToken => {
    const normalizedCandidate = normalizeChannelSearchText(candidateToken)
    if (normalizedCandidate === normalizedToken) return true
    if (containsNonLatinLetter(normalizedToken)) {
      return normalizedCandidate.includes(normalizedToken)
    }
    return (
      normalizedToken.length >= 2 && normalizedCandidate.startsWith(normalizedToken)
    ) || (
      normalizedCandidate.length >= 2 && normalizedToken.startsWith(normalizedCandidate)
    )
  })
}
