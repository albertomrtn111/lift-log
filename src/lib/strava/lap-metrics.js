function numberOrNull(value) {
  const number = Number(value)
  return Number.isFinite(number) ? number : null
}

function roundOrNull(value) {
  const number = numberOrNull(value)
  return number == null ? null : Math.round(number)
}

function average(values) {
  const numbers = values.map(numberOrNull).filter((value) => value != null)
  if (numbers.length === 0) return null
  return numbers.reduce((sum, value) => sum + value, 0) / numbers.length
}

function max(values) {
  const numbers = values.map(numberOrNull).filter((value) => value != null)
  if (numbers.length === 0) return null
  return Math.max(...numbers)
}

function streamData(streams, key) {
  const data = streams?.[key]?.data
  return Array.isArray(data) ? data : []
}

function lapSlice(streams, key, startIndex, endIndex) {
  const data = streamData(streams, key)
  if (!Number.isInteger(startIndex) || !Number.isInteger(endIndex) || endIndex < startIndex) {
    return []
  }
  return data.slice(startIndex, endIndex + 1)
}

function paceSecondsPerKm(distanceMeters, movingTimeSeconds) {
  const distance = numberOrNull(distanceMeters)
  const movingTime = numberOrNull(movingTimeSeconds)
  if (!distance || distance <= 0 || !movingTime || movingTime <= 0) return null
  return Math.round(movingTime / (distance / 1000))
}

export function calculateStravaLapMetrics(laps, streams = {}) {
  if (!Array.isArray(laps)) return []

  return laps.map((lap, index) => {
    const startIndex = Number.isInteger(lap.start_index) ? lap.start_index : null
    const endIndex = Number.isInteger(lap.end_index) ? lap.end_index : null
    const heartrate = startIndex == null || endIndex == null
      ? []
      : lapSlice(streams, 'heartrate', startIndex, endIndex)
    const cadence = startIndex == null || endIndex == null
      ? []
      : lapSlice(streams, 'cadence', startIndex, endIndex)
    const watts = startIndex == null || endIndex == null
      ? []
      : lapSlice(streams, 'watts', startIndex, endIndex)
    const velocity = startIndex == null || endIndex == null
      ? []
      : lapSlice(streams, 'velocity_smooth', startIndex, endIndex)

    return {
      provider_lap_id: lap.id != null ? String(lap.id) : null,
      lap_index: roundOrNull(lap.lap_index ?? lap.split ?? index + 1),
      name: lap.name ?? null,
      start_date: lap.start_date ?? null,
      start_date_local: lap.start_date_local ?? null,
      start_index: startIndex,
      end_index: endIndex,
      distance_meters: numberOrNull(lap.distance),
      moving_time_seconds: roundOrNull(lap.moving_time),
      elapsed_time_seconds: roundOrNull(lap.elapsed_time),
      avg_speed: numberOrNull(lap.average_speed),
      max_speed: numberOrNull(lap.max_speed),
      avg_pace_seconds_per_km: paceSecondsPerKm(lap.distance, lap.moving_time),
      avg_heartrate: roundOrNull(lap.average_heartrate) ?? roundOrNull(average(heartrate)),
      start_heartrate: roundOrNull(heartrate[0]),
      end_heartrate: roundOrNull(heartrate[heartrate.length - 1]),
      max_heartrate: roundOrNull(lap.max_heartrate) ?? roundOrNull(max(heartrate)),
      avg_cadence: roundOrNull(lap.average_cadence) ?? roundOrNull(average(cadence)),
      avg_watts: roundOrNull(lap.average_watts) ?? roundOrNull(average(watts)),
      avg_velocity_smooth: numberOrNull(average(velocity)),
      elevation_gain: numberOrNull(lap.total_elevation_gain),
      raw_lap: lap,
    }
  })
}
