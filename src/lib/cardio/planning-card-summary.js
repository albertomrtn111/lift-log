import { calculateCardioStructureTotals } from './structure.js'

function numberOrNull(value) {
  const number = Number(value)
  return Number.isFinite(number) && number > 0 ? number : null
}

function formatNumber(value) {
  return Number.isInteger(value) ? String(value) : value.toFixed(1)
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

  const explicitDistance = numberOrNull(session.target_distance_km ?? session.distance_km)
  const explicitDuration = numberOrNull(session.target_duration_min ?? session.duration_minutes)
  const hasExplicitMetrics = Boolean(explicitDistance || explicitDuration)
  const totals = hasExplicitMetrics ? {} : calculateCardioStructureTotals(session.structure)
  const distance = explicitDistance ?? totals.distanceKm
  const duration = explicitDuration ?? totals.durationMin

  return [formatDistanceKm(distance), formatDurationMin(duration)]
    .filter(Boolean)
    .join(' / ')
}
