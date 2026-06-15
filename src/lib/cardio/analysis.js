function numberOrNull(value) {
  const number = Number(value)
  return Number.isFinite(number) ? number : null
}

function positiveNumberOrNull(value) {
  const number = numberOrNull(value)
  return number != null && number > 0 ? number : null
}

function roundTo(value, decimals = 0) {
  const number = numberOrNull(value)
  if (number == null) return null
  const factor = 10 ** decimals
  return Math.round(number * factor) / factor
}

function average(values) {
  const numbers = values.map(numberOrNull).filter((value) => value != null)
  if (numbers.length === 0) return null
  return numbers.reduce((sum, value) => sum + value, 0) / numbers.length
}

function max(values) {
  const numbers = values.map(numberOrNull).filter((value) => value != null)
  return numbers.length > 0 ? Math.max(...numbers) : null
}

function paceSecondsPerKm(distanceMeters, durationSeconds) {
  const distance = positiveNumberOrNull(distanceMeters)
  const duration = positiveNumberOrNull(durationSeconds)
  if (!distance || !duration) return null
  return Math.round(duration / (distance / 1000))
}

function streamData(streams, key) {
  const data = streams?.[key]?.data
  return Array.isArray(data) ? data : []
}

function hasUsefulStreams(streams) {
  return streamData(streams, 'time').length > 1 && streamData(streams, 'distance').length > 1
}

function formatDistanceMeters(meters) {
  const value = positiveNumberOrNull(meters)
  if (!value) return null
  if (value < 1000) return `${Math.round(value)} m`
  const km = value / 1000
  return `${Number.isInteger(km) ? km : km.toFixed(1)} km`
}

function formatDurationSeconds(seconds) {
  const value = positiveNumberOrNull(seconds)
  if (!value) return null
  const minutes = value / 60
  if (minutes < 60) return `${Number.isInteger(minutes) ? minutes : minutes.toFixed(1)} min`
  const h = Math.floor(minutes / 60)
  const m = Math.round(minutes % 60)
  return m > 0 ? `${h}h ${m}min` : `${h}h`
}

function joinParts(parts) {
  return parts.filter(Boolean).join(' ')
}

function describeTarget(segment) {
  return joinParts([
    formatDistanceMeters(segment.targetDistanceMeters),
    formatDurationSeconds(segment.targetDurationSec),
    segment.target,
  ]) || '—'
}

function expandPlannedSegments(structure) {
  const blocks = Array.isArray(structure?.blocks) ? structure.blocks : []
  const segments = []

  for (const block of blocks) {
    if (!block || typeof block !== 'object') continue

    if (block.type === 'intervals') {
      const sets = Math.max(1, Math.round(positiveNumberOrNull(block.sets) || 1))
      for (let index = 1; index <= sets; index += 1) {
        segments.push({
          label: `Serie ${index}`,
          kind: 'work',
          targetDistanceMeters: positiveNumberOrNull(block.workDistance) ? Number(block.workDistance) * 1000 : null,
          targetDurationSec: positiveNumberOrNull(block.workDuration) ? Number(block.workDuration) * 60 : null,
          target: block.workTargetPace || block.workIntensity || block.workTargetHR || null,
        })

        if (positiveNumberOrNull(block.restDistance) || positiveNumberOrNull(block.restDuration)) {
          segments.push({
            label: `Rec ${index}`,
            kind: 'recovery',
            targetDistanceMeters: positiveNumberOrNull(block.restDistance) ? Number(block.restDistance) * 1000 : null,
            targetDurationSec: positiveNumberOrNull(block.restDuration) ? Number(block.restDuration) * 60 : null,
            target: block.restTargetPace || block.restIntensity || block.restTargetHR || null,
          })
        }
      }
      continue
    }

    const kind = block.type === 'cooldown' ? 'cooldown' : block.type === 'warmup' ? 'warmup' : 'steady'
    segments.push({
      label: block.label || (block.type === 'cooldown' ? 'Vuelta calma' : block.type === 'warmup' ? 'Calentamiento' : 'Continuo'),
      kind,
      targetDistanceMeters: positiveNumberOrNull(block.distance) ? Number(block.distance) * 1000 : null,
      targetDurationSec: positiveNumberOrNull(block.duration) ? Number(block.duration) * 60 : null,
      target: block.targetPace || block.intensity || block.targetHR || null,
    })
  }

  return segments.map((segment) => ({
    ...segment,
    targetSummary: describeTarget(segment),
  }))
}

function findEndIndex({ basis, target, startIndex, time, distance }) {
  if (!target || target <= 0) return null
  const source = basis === 'distance' ? distance : time
  const startValue = numberOrNull(source[startIndex]) || 0
  const targetValue = startValue + target

  for (let index = startIndex + 1; index < source.length; index += 1) {
    const value = numberOrNull(source[index])
    if (value != null && value >= targetValue) return index
  }

  return source.length - 1
}

function sliceValues(values, startIndex, endIndex) {
  if (!Array.isArray(values) || startIndex == null || endIndex == null || endIndex < startIndex) return []
  return values.slice(startIndex, endIndex + 1)
}

function buildSegmentFromRange(planned, streams, startIndex, endIndex) {
  const time = streamData(streams, 'time')
  const distance = streamData(streams, 'distance')
  const heartrate = sliceValues(streamData(streams, 'heartrate'), startIndex, endIndex)
  const startTime = numberOrNull(time[startIndex]) || 0
  const endTime = numberOrNull(time[endIndex]) || startTime
  const startDistance = numberOrNull(distance[startIndex]) || 0
  const endDistance = numberOrNull(distance[endIndex]) || startDistance
  const actualDurationSec = Math.max(0, Math.round(endTime - startTime))
  const actualDistanceMeters = Math.max(0, Math.round(endDistance - startDistance))
  const targetValue = planned.targetDistanceMeters || planned.targetDurationSec
  const actualValue = planned.targetDistanceMeters ? actualDistanceMeters : actualDurationSec

  return {
    ...planned,
    startIndex,
    endIndex,
    actualDistanceMeters,
    actualDurationSec,
    actualSummary: joinParts([
      formatDistanceMeters(actualDistanceMeters),
      formatDurationSeconds(actualDurationSec),
    ]) || '—',
    avgPaceSecondsPerKm: paceSecondsPerKm(actualDistanceMeters, actualDurationSec),
    avgHeartRate: roundTo(average(heartrate)),
    maxHeartRate: roundTo(max(heartrate)),
    startHeartRate: roundTo(heartrate[0]),
    endHeartRate: roundTo(heartrate[heartrate.length - 1]),
    delta: targetValue ? roundTo(actualValue - targetValue, 1) : null,
    deltaUnit: planned.targetDistanceMeters ? 'm' : planned.targetDurationSec ? 's' : null,
  }
}

function buildChartPoints(streams) {
  const time = streamData(streams, 'time')
  const distance = streamData(streams, 'distance')
  const velocity = streamData(streams, 'velocity_smooth')
  const heartrate = streamData(streams, 'heartrate')
  const points = []

  for (let index = 0; index < time.length; index += 1) {
    const seconds = numberOrNull(time[index])
    const meters = numberOrNull(distance[index])
    if (seconds == null || meters == null) continue
    const speed = numberOrNull(velocity[index])
    points.push({
      x: roundTo(meters / 1000, 2),
      distanceKm: roundTo(meters / 1000, 2),
      timeMin: roundTo(seconds / 60, 2),
      paceSecondsPerKm: speed && speed > 0 ? Math.round(1000 / speed) : null,
      heartRate: roundTo(heartrate[index]),
    })
  }

  return points
}

function inferChartAxis(plannedSegments, streams) {
  const hasDistanceTargets = plannedSegments.some((segment) => segment.targetDistanceMeters)
  const hasDurationTargets = plannedSegments.some((segment) => segment.targetDurationSec)
  if (hasDistanceTargets) return 'distance'
  if (hasDurationTargets) return 'time'
  return streamData(streams, 'distance').length > 1 ? 'distance' : 'time'
}

function analyzeFromStreams(structure, streams) {
  const plannedSegments = expandPlannedSegments(structure)
  if (plannedSegments.length === 0 || !hasUsefulStreams(streams)) return null

  const time = streamData(streams, 'time')
  const distance = streamData(streams, 'distance')
  let cursor = 0
  const segments = []

  plannedSegments.forEach((planned, index) => {
    const basis = planned.targetDistanceMeters ? 'distance' : planned.targetDurationSec ? 'time' : null
    const target = planned.targetDistanceMeters || planned.targetDurationSec
    const isLast = index === plannedSegments.length - 1
    const endIndex = basis
      ? findEndIndex({ basis, target, startIndex: cursor, time, distance })
      : isLast
        ? time.length - 1
        : null

    if (endIndex == null || endIndex <= cursor) return
    segments.push(buildSegmentFromRange(planned, streams, cursor, endIndex))
    cursor = endIndex
  })

  if (segments.length === 0) return null

  return {
    source: 'streams',
    chartAxis: inferChartAxis(plannedSegments, streams),
    segments,
    chartPoints: buildChartPoints(streams),
  }
}

function analyzeFromLaps(laps) {
  if (!Array.isArray(laps) || laps.length === 0) return null
  const segments = laps.map((lap, index) => ({
    label: lap.name || `Lap ${lap.lap_index || index + 1}`,
    kind: 'lap',
    targetSummary: '—',
    actualDistanceMeters: roundTo(lap.distance_meters),
    actualDurationSec: roundTo(lap.moving_time_seconds),
    actualSummary: joinParts([
      formatDistanceMeters(lap.distance_meters),
      formatDurationSeconds(lap.moving_time_seconds),
    ]) || '—',
    avgPaceSecondsPerKm: roundTo(lap.avg_pace_seconds_per_km),
    avgHeartRate: roundTo(lap.avg_heartrate),
    maxHeartRate: roundTo(lap.max_heartrate),
    startHeartRate: roundTo(lap.start_heartrate),
    endHeartRate: roundTo(lap.end_heartrate),
    delta: null,
    deltaUnit: null,
  }))

  return {
    source: 'laps',
    chartAxis: 'distance',
    segments,
    chartPoints: [],
  }
}

function parsePaceString(value) {
  if (typeof value !== 'string') return null
  const match = value.match(/(\d+):(\d{2})/)
  if (!match) return null
  return Number(match[1]) * 60 + Number(match[2])
}

function analyzeFromSummary(session) {
  const distanceMeters = positiveNumberOrNull(session?.actualDistanceKm)
    ? Number(session.actualDistanceKm) * 1000
    : null
  const durationSec = positiveNumberOrNull(session?.actualDurationMin)
    ? Number(session.actualDurationMin) * 60
    : null

  return {
    source: 'summary',
    chartAxis: distanceMeters ? 'distance' : 'time',
    segments: [{
      label: 'Actividad completa',
      kind: 'summary',
      targetSummary: '—',
      actualDistanceMeters: roundTo(distanceMeters),
      actualDurationSec: roundTo(durationSec),
      actualSummary: joinParts([
        formatDistanceMeters(distanceMeters),
        formatDurationSeconds(durationSec),
      ]) || '—',
      avgPaceSecondsPerKm: parsePaceString(session?.actualAvgPace) || paceSecondsPerKm(distanceMeters, durationSec),
      avgHeartRate: roundTo(session?.avgHeartRate),
      maxHeartRate: roundTo(session?.maxHeartRate),
      startHeartRate: null,
      endHeartRate: null,
      delta: null,
      deltaUnit: null,
    }],
    chartPoints: [],
  }
}

export function analyzeCardioSessionExecution({ structure, streams, laps, session = {} }) {
  return analyzeFromStreams(structure, streams)
    || analyzeFromLaps(laps)
    || analyzeFromSummary(session)
}
