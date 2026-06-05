const BIKE_TOKENS = ['bike', 'bici', 'bicicleta', 'ride', 'cycling']
const SWIM_TOKENS = ['swim', 'natacion', 'natación']
const RUNNING_TOKENS = ['running', 'run', 'walk', 'hike']

function normalize(value) {
  return String(value || '').trim().toLowerCase()
}

function includesAny(value, tokens) {
  return tokens.some((token) => value.includes(token))
}

export function resolveCardioDisplayKind(activityType, trainingType) {
  const activity = normalize(activityType)
  const training = normalize(trainingType)

  if (includesAny(activity, BIKE_TOKENS)) return 'bike'
  if (includesAny(activity, SWIM_TOKENS)) return 'swim'

  const runningDiscipline = includesAny(activity, RUNNING_TOKENS)
  if (runningDiscipline) {
    if (['series', 'intervals', 'hiit'].includes(training)) return 'series'
    if (['tempo', 'umbral'].includes(training)) return 'tempo'
    if (['hybrid', 'hibrido'].includes(training)) return 'hybrid'
    if (['progressive', 'progresivo', 'progresivos'].includes(training)) return 'progressive'
    if (training === 'fartlek') return 'fartlek'
    return 'running'
  }

  if (includesAny(training, BIKE_TOKENS)) return 'bike'
  if (includesAny(training, SWIM_TOKENS)) return 'swim'
  return 'running'
}
