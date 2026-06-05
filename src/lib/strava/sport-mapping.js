const CYCLING_TOKENS = ['ride', 'bike', 'cycling']
const SWIM_TOKENS = ['swim']
const RUNNING_TOKENS = ['run']
const EXCLUDED_TOKENS = [
  'weight',
  'strength',
  'workout',
  'crossfit',
  'yoga',
  'pilates',
]

function normalizeSport(activity) {
  return `${activity?.sport_type || ''} ${activity?.type || ''}`.toLowerCase()
}

function includesAny(value, tokens) {
  return tokens.some((token) => value.includes(token))
}

export function mapStravaSportToDiscipline(activity) {
  const sport = normalizeSport(activity)
  if (includesAny(sport, CYCLING_TOKENS)) return 'Bicicleta'
  if (includesAny(sport, SWIM_TOKENS)) return 'Natación'
  if (includesAny(sport, RUNNING_TOKENS)) return 'Running'
  return null
}

export function shouldImportStravaActivity(activity) {
  const sport = normalizeSport(activity)
  if (!sport.trim()) return false
  if (includesAny(sport, EXCLUDED_TOKENS)) return false
  return mapStravaSportToDiscipline(activity) != null
}
