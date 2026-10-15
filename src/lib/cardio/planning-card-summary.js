import { cardioSessionMetrics } from './structure.js'

function numberOrNull(value) {
  const number = Number(value)
  return Number.isFinite(number) && number > 0 ? number : null
}

function formatNumber(value) {
  return String(Number(value.toFixed(3)))
}

function formatDistanceKm(value) {
  const distance = numberOrNull(value)
  return distance ? `${formatNumber(distance)} km` : null
}

function formatDurationMin(value) {
  const duration = numberOrNull(value)
  return duration ? `${formatNumber(duration)} min` : null
}

export function buildPlanningCardioSummary(session) {
  if (!session || typeof session !== 'object') return ''

  const { distanceKm: distance, durationMin: duration } = cardioSessionMetrics(session)

  return [formatDistanceKm(distance), formatDurationMin(duration)]
    .filter(Boolean)
    .join(' / ')
}
