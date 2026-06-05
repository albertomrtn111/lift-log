export function roundToDecimals(value, decimals = 2) {
  if (value == null || value === '') return undefined
  const number = Number(value)
  if (!Number.isFinite(number)) return undefined
  const factor = 10 ** decimals
  return Math.round((number + Number.EPSILON) * factor) / factor
}

export function formatNumberForInput(value, decimals = 2) {
  const rounded = roundToDecimals(value, decimals)
  if (rounded == null) return ''
  return String(rounded)
}
