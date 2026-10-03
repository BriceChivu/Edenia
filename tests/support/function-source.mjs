// Source contracts accept either persistence adapter without assuming callbacks
// complete synchronously. Runtime regressions verify the transaction boundary.
export function indexOfFunction(source, name, from = 0) {
  const match = new RegExp(`(?:async\\s+)?function\\s+${name}\\s*(?:\\(|$)`).exec(source.slice(from))
  return match ? from + match.index : -1
}
