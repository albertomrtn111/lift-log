function numberOrNull(value) {
  const number = Number(value)
  return Number.isFinite(number) && number > 0 ? number : null
}

function roundToOne(value) {
  return Math.round(value * 10) / 10
}

function roundToMeters(value) {
  return Math.round(value * 1000) / 1000
}

function formatDistanceKm(km, { preferMeters = false } = {}) {
  const distance = numberOrNull(km)
  if (!distance) return null
  if (distance < 1) return `${Math.round(distance * 1000)} m`
  if (preferMeters && distance <= 5) return `${Math.round(distance * 1000)} m`
  if (Number.isInteger(distance)) return `${distance} km`
  return `${Number(distance.toFixed(3))} km`
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
    block.targetRpe ? `RPE ${block.targetRpe}` : null,
  ])
}

function describeIntervalsBlock(block) {
  const sets = numberOrNull(block.sets)
  const effort = joinParts([formatDistanceKm(block.workDistance, { preferMeters: true }), formatDurationMin(block.workDuration)])
  const work = sets && effort ? `${sets} x ${effort}` : effort
  const target = joinParts([block.workTargetPace || block.workIntensity, block.workTargetHR])
  const rest = joinParts([formatDistanceKm(block.restDistance, { preferMeters: true }), formatDurationMin(block.restDuration)])

  return joinParts([
    work,
    target ? `@ ${target}` : null,
    block.workTargetRpe ? `RPE ${block.workTargetRpe}` : null,
    rest ? `rec ${rest}${block.restTargetPace ? ` @ ${block.restTargetPace}` : ''}${block.restAfterLastRep === true ? ' (también al final)' : ''}` : null,
  ])
}

function isNativeBlock(block) {
  if (!block || typeof block !== 'object') return false
  if (block.type === 'intervals') {
    return Number.isInteger(Number(block.sets)) && numberOrNull(block.sets) !== null
      && (numberOrNull(block.workDistance) !== null || numberOrNull(block.workDuration) !== null)
  }
  if (!['warmup', 'continuous', 'cooldown', 'station'].includes(block.type)) return false
  return numberOrNull(block.distance) !== null
    || numberOrNull(block.duration) !== null
    || Boolean(block.targetPace || block.targetHR || block.targetRpe || block.notes)
}

export function hasRenderableCardioBlocks(structure) {
  const blocks = Array.isArray(structure) ? structure : structure?.blocks
  return Array.isArray(blocks) && blocks.length > 0 && blocks.every(isNativeBlock)
}

export function resolveCardioPlanForDisplay(session) {
  if (session?.structure?.mode === 'free_text') return null
  if (hasRenderableCardioBlocks(session?.planned_structure)) return session.planned_structure
  if (hasRenderableCardioBlocks(session?.structure)) return session.structure
  return null
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
  if (!hasRenderableCardioBlocks(structure)) return typeof structure.description === 'string' ? structure.description.trim() : ''
  return structure.blocks
    .map(describeCardioBlock)
    .filter(Boolean)
    .join(' · ')
}

export function getCardioStructureLines(structure) {
  if (!structure) return []
  if (typeof structure === 'string') return structure.trim() ? [structure.trim()] : []
  if (Array.isArray(structure)) {
    if (!hasRenderableCardioBlocks(structure)) return []
    return structure
      .map((block) => {
        const details = describeCardioBlock(block)
        const label = block?.label || block?.name
        const description = block?.description && block.description !== details ? block.description : null
        return [label, [details, description].filter(Boolean).join(' — ')].filter(Boolean).join(': ')
      })
      .filter(Boolean)
  }
  if (hasRenderableCardioBlocks(structure)) {
    return getCardioStructureLines(structure.blocks)
  }
  if (typeof structure.description === 'string' && structure.description.trim()) {
    return [structure.description.trim()]
  }
  return []
}

export function calculateCardioStructureTotals(structure) {
  const totals = analyzeCardioStructure(structure)
  return { distanceKm: totals.distanceKm, durationMin: totals.durationMin }
}

export function cardioSessionMetrics(session) {
  const structure = resolveCardioPlanForDisplay(session) ?? session?.structure
  const totals = calculateCardioStructureTotals(structure)
  return { distanceKm: totals.distanceKm ?? numberOrNull(session?.target_distance_km ?? session?.distance_km),
    durationMin: totals.durationMin ?? numberOrNull(session?.target_duration_min ?? session?.duration_minutes) }
}

export function cardioActivityType(trainingType, requested = '') {
  if (/swim|nataci[oó]n/i.test(trainingType)) return 'Natación'
  if (/bike|bici|ciclismo|cycling/i.test(trainingType)) return 'Bicicleta'
  if (/hybrid|h[ií]brido/i.test(trainingType)) return 'Híbrido'
  return trainingType === 'other' ? requested || 'Otro' : 'Running'
}

// Solo un ritmo numérico inequívoco permite estimar la magnitud que falta.
// Z2, "suave", rangos, vatios y FC nunca se convierten en kilómetros/minutos.
export function cardioPaceMinutesPerKm(value, trainingType = '') {
  const match = String(value ?? '').trim().match(/^(\d{1,2}):([0-5]\d)(?:\s*\/?\s*(km|100\s*m))?$/i)
  if (!match) return null
  const minutes = Number(match[1]) + Number(match[2]) / 60
  if (!(minutes > 0)) return null
  return minutes * (match[3] ? /100/i.test(match[3]) ? 10 : 1 : /swim|nataci[oó]n/i.test(trainingType) ? 10 : 1)
}

export function cardioRecoveryCount(block) {
  if (!numberOrNull(block?.restDuration) && !numberOrNull(block?.restDistance)) return 0
  const sets = Number(block.sets)
  if (!Number.isInteger(sets) || sets < 1) return 0
  return block.restAfterLastRep === true ? sets : Math.max(0, sets - 1)
}

export function cardioRecoveryType(block) {
  // Un registro antiguo sin tipo no demuestra que la pausa fuera parada.
  return block.restType ?? (numberOrNull(block.restDistance) ? 'active' : undefined)
}

export function validateCardioStructure(structure) {
  const blocks = Array.isArray(structure) ? structure : structure?.blocks
  if (!Array.isArray(blocks) || !blocks.length) return ['Añade al menos un bloque.']
  const errors = []
  blocks.forEach((block, index) => {
    const prefix = `Bloque ${index + 1}`
    if (!block || !['warmup', 'continuous', 'cooldown', 'station', 'intervals'].includes(block.type)) {
      errors.push(`${prefix}: tipo de bloque no válido.`); return
    }
    const fields = block.type === 'intervals' ? ['workDistance', 'workDuration', 'restDistance', 'restDuration'] : ['distance', 'duration']
    if (fields.some(key => block[key] !== undefined && block[key] !== null && (!Number.isFinite(Number(block[key])) || Number(block[key]) < 0))) {
      errors.push(`${prefix}: las distancias y duraciones no pueden ser negativas ni inválidas.`)
    }
    if (!isNativeBlock(block)) errors.push(`${prefix}: completa la distancia o duración${block.type === 'intervals' ? ' por repetición y el número de repeticiones' : ' u objetivo'}.`)
    if (block.type === 'intervals') {
      if (Number(block.sets) > 100) errors.push(`${prefix}: el máximo es 100 repeticiones.`)
      if (block.restType && !['active', 'passive'].includes(block.restType)) errors.push(`${prefix}: recuperación no válida.`)
      if (block.restType === 'passive' && numberOrNull(block.restDistance)) errors.push(`${prefix}: una pausa parada no puede tener distancia. Elige recuperación activa.`)
    }
  })
  return errors
}

export function analyzeCardioStructure(structure) {
  const blocks = structure?.mode === 'free_text' ? [] : Array.isArray(structure) ? structure : Array.isArray(structure?.blocks) ? structure.blocks : []
  const trainingType = structure?.trainingType ?? ''
  const breakdown = []
  let distanceKnown = 0, durationKnown = 0
  let distanceComplete = blocks.length > 0, durationComplete = blocks.length > 0
  let distanceEstimated = false, durationEstimated = false
  function add(index, phase, repetitions, distance, duration, pace, passive = false) {
    let d = passive ? 0 : numberOrNull(distance)
    let t = numberOrNull(duration)
    let dEstimated = false, tEstimated = false
    const numericPace = passive ? null : cardioPaceMinutesPerKm(pace, trainingType)
    if (numericPace && d !== null && t === null) { t = d * numericPace; tEstimated = true }
    if (numericPace && t !== null && d === null) { d = t / numericPace; dEstimated = true }
    if (d === null) distanceComplete = false
    if (t === null) durationComplete = false
    distanceKnown += (d ?? 0) * repetitions
    durationKnown += (t ?? 0) * repetitions
    distanceEstimated ||= dEstimated
    durationEstimated ||= tEstimated
    breakdown.push({ block_index: index, phase, repetitions,
      distanceKm: d === null ? null : roundToMeters(d * repetitions),
      durationMin: t === null ? null : roundToOne(t * repetitions),
      distanceEstimated: dEstimated, durationEstimated: tEstimated })
  }
  blocks.forEach((block, index) => {
    if (!block || !isNativeBlock(block)) { distanceComplete = false; durationComplete = false; return }
    if (block.type === 'intervals') {
      add(index, 'work', Number(block.sets), block.workDistance, block.workDuration, block.workTargetPace)
      const recoveries = cardioRecoveryCount(block)
      if (recoveries) add(index, 'recovery', recoveries, block.restDistance, block.restDuration, block.restTargetPace, cardioRecoveryType(block) === 'passive')
    } else add(index, block.type, 1, block.distance, block.duration, block.targetPace)
  })
  const errors = validateCardioStructure(structure)
  if (errors.length) { distanceComplete = false; durationComplete = false }
  return {
    distanceKm: distanceComplete ? roundToMeters(distanceKnown) : null,
    durationMin: durationComplete ? roundToOne(durationKnown) : null,
    knownDistanceKm: distanceKnown > 0 ? roundToMeters(distanceKnown) : null,
    knownDurationMin: durationKnown > 0 ? roundToOne(durationKnown) : null,
    distanceComplete, durationComplete,
    distanceEstimated, durationEstimated,
    recoveryCount: breakdown.filter(part => part.phase === 'recovery').reduce((sum, part) => sum + part.repetitions, 0),
    breakdown, errors,
  }
}

/** Normaliza alta/edición desde el editor y desde el MCP con el mismo contrato. */
export function prepareCardioSessionPlan({ structure, description, targetDistanceKm, targetDurationMin, targetPace }) {
  const mode = structure?.mode ?? (structure?.blocks?.length ? 'structured' : 'free_text')
  for (const [name, value] of [['distancia', targetDistanceKm], ['duración', targetDurationMin]]) {
    if (value != null && (!Number.isFinite(Number(value)) || Number(value) <= 0)) throw new Error(`La ${name} objetivo debe ser mayor que cero.`)
  }
  const detail = String(description ?? structure?.description ?? '').trim()
  if (mode === 'free_text') {
    if (!detail) throw new Error('El detalle del entrenamiento es obligatorio.')
    const quick = { ...structure, mode, description: detail, blocks: [] }
    return { description: detail, structure: quick, planned_structure: null,
      target_distance_km: targetDistanceKm ?? null, target_duration_min: targetDurationMin ?? null, target_pace: null,
      totals: null }
  }
  if (mode !== 'structured') throw new Error('Elige configuración rápida o estructurada.')
  const totals = analyzeCardioStructure(structure)
  if (totals.errors.length) throw new Error(totals.errors[0])
  const distanceTolerance = totals.distanceEstimated ? Math.max(0.002, (totals.distanceKm ?? 0) * 0.02) : 0.002
  if (targetDistanceKm != null && ((totals.distanceComplete && Math.abs(Number(targetDistanceKm) - totals.distanceKm) > distanceTolerance + 1e-9)
      || (!totals.distanceComplete && totals.knownDistanceKm > Number(targetDistanceKm) + 0.002))) {
    throw new Error(`Los bloques${totals.distanceComplete ? '' : ' conocidos'} suman ${Math.round((totals.distanceKm ?? totals.knownDistanceKm) * 1000)} m y el objetivo indica ${Math.round(Number(targetDistanceKm) * 1000)} m; revisa la distancia objetivo.`)
  }
  const durationTolerance = totals.durationEstimated ? Math.max(0.1, (totals.durationMin ?? 0) * 0.05) : 0.1
  if (targetDurationMin != null && ((totals.durationComplete && Math.abs(Number(targetDurationMin) - totals.durationMin) > durationTolerance + 1e-9)
      || (!totals.durationComplete && totals.knownDurationMin > Number(targetDurationMin) + 0.1))) {
    throw new Error(`Los bloques${totals.durationComplete ? '' : ' conocidos'} suman ${totals.durationMin ?? totals.knownDurationMin} min; revisa la duración objetivo.`)
  }
  const normalized = { ...structure, mode, description: detail || summarizeCardioStructure(structure),
    blocks: structure.blocks.map(block => block.type === 'intervals'
      ? { ...block, restAfterLastRep: block.restAfterLastRep === true, restType: cardioRecoveryType(block) } : { ...block }) }
  return { description: normalized.description, structure: normalized, planned_structure: normalized,
    target_distance_km: targetDistanceKm ?? totals.distanceKm,
    target_duration_min: targetDurationMin ?? totals.durationMin,
    target_pace: targetPace?.trim() || null, totals }
}
