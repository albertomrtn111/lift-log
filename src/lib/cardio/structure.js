function numberOrNull(value) {
  const number = Number(value)
  return Number.isFinite(number) && number > 0 ? number : null
}

function roundToOne(value) {
  return Math.round(value * 10) / 10
}

function formatDistanceKm(km, { preferMeters = false } = {}) {
  const distance = numberOrNull(km)
  if (!distance) return null
  if (distance < 1) return `${Math.round(distance * 1000)} m`
  if (preferMeters && distance <= 5) return `${Math.round(distance * 1000)} m`
  if (Number.isInteger(distance)) return `${distance} km`
  return `${distance.toFixed(1)} km`
}

function formatDurationMin(minutes) {
  const duration = numberOrNull(minutes)
  if (!duration) return null
  return `${Number.isInteger(duration) ? duration : duration.toFixed(1)} min`
}

function joinParts(parts) {
  return parts.filter(Boolean).join(' ')
}

function describeContinuousBlock(block) {
  return joinParts([
    formatDistanceKm(block.distance),
    formatDurationMin(block.duration),
    block.targetPace || block.intensity,
    block.targetHR,
  ])
}

function describeIntervalsBlock(block) {
  const sets = numberOrNull(block.sets)
  const effort = formatDistanceKm(block.workDistance, { preferMeters: true }) || formatDurationMin(block.workDuration)
  const work = sets && effort ? `${sets} x ${effort}` : effort
  const target = block.workTargetPace || block.workIntensity || block.workTargetHR
  const rest = formatDistanceKm(block.restDistance, { preferMeters: true }) || formatDurationMin(block.restDuration)

  return joinParts([
    work,
    target ? `@ ${target}` : null,
    rest ? `rec ${rest}` : null,
  ])
}

export function describeCardioBlock(block) {
  if (!block || typeof block !== 'object') return ''
  if (block.type === 'intervals') return describeIntervalsBlock(block)
  return describeContinuousBlock(block)
}

export function summarizeCardioStructure(structure) {
  if (!structure) return ''
  if (typeof structure === 'string') return structure.trim()
  if (typeof structure.description === 'string' && structure.description.trim() && structure.mode !== 'structured') {
    return structure.description.trim()
  }
  if (!Array.isArray(structure.blocks)) return ''
  return structure.blocks
    .map(describeCardioBlock)
    .filter(Boolean)
    .join(' · ')
}

export function getCardioStructureLines(structure) {
  if (!structure) return []
  if (typeof structure === 'string') return structure.trim() ? [structure.trim()] : []
  if (Array.isArray(structure)) {
    return structure
      .map((block) => {
        const details = describeCardioBlock(block)
        const label = block?.label || block?.name
        return [label, details].filter(Boolean).join(': ')
      })
      .filter(Boolean)
  }
  if (Array.isArray(structure.blocks) && structure.blocks.length > 0) {
    return getCardioStructureLines(structure.blocks)
  }
  if (typeof structure.description === 'string' && structure.description.trim()) {
    return [structure.description.trim()]
  }
  return []
}

export function calculateCardioStructureTotals(structure) {
  const blocks = Array.isArray(structure?.blocks) ? structure.blocks : []
  let distanceKm = 0
  let durationMin = 0

  for (const block of blocks) {
    if (block.type === 'intervals') {
      const sets = numberOrNull(block.sets) || 1
      distanceKm += (numberOrNull(block.workDistance) || 0) * sets
      distanceKm += (numberOrNull(block.restDistance) || 0) * sets
      durationMin += (numberOrNull(block.workDuration) || 0) * sets
      durationMin += (numberOrNull(block.restDuration) || 0) * sets
    } else {
      distanceKm += numberOrNull(block.distance) || 0
      durationMin += numberOrNull(block.duration) || 0
    }
  }

  return {
    distanceKm: distanceKm > 0 ? roundToOne(distanceKm) : null,
    durationMin: durationMin > 0 ? roundToOne(durationMin) : null,
  }
}
