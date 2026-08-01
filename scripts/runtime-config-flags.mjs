export function parseRuntimeConfigFlag(value, name) {
  const normalizedValue = String(value || '').trim().toLowerCase()
  if (!normalizedValue || normalizedValue === 'false') return false
  if (normalizedValue === 'true') return true
  throw new Error(`${name} must be true or false`)
}
