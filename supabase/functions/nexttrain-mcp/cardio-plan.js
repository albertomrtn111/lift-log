const BLOCK_LABELS = {
  warmup: 'Calentamiento',
  continuous: 'Continuo',
  intervals: 'Series',
  cooldown: 'Vuelta a la calma',
  station: 'Estación',
}

function normalizedTrainingType(activityType, trainingType) {
  const value = `${trainingType || ''} ${activityType || ''}`.toLowerCase()
  if (/swim|nataci[oó]n/.test(value)) return 'swim'
  if (/bike|bici|ciclismo|cycling/.test(value)) return 'bike'
  if (/h[ií]brid|hybrid/.test(value)) return 'hybrid'
  const requested = String(trainingType || '').toLowerCase().trim()
  if (['rodaje', 'series', 'tempo', 'fartlek', 'progressive', 'other'].includes(requested)) return requested
  return 'rodaje'
}

function positive(value) {
  return typeof value === 'number' && Number.isFinite(value) && value > 0
}

function normalizeBlock(block, index) {
  const interval = block.type === 'intervals'
  if (interval) {
    if (!Number.isInteger(block.repetitions) || block.repetitions < 1) {
      throw new Error(`Bloque ${index + 1}: indica repetitions para las series.`)
    }
    if (!positive(block.distance_per_rep_m) && !positive(block.duration_per_rep_seconds)) {
      throw new Error(`Bloque ${index + 1}: indica distance_per_rep_m o duration_per_rep_seconds.`)
    }
    if (block.distance_m !== undefined || block.duration_min !== undefined) {
      throw new Error(`Bloque ${index + 1}: las series usan distancia o tiempo por repetición, no totales del bloque.`)
    }
  } else if (block.repetitions !== undefined || block.distance_per_rep_m !== undefined || block.duration_per_rep_seconds !== undefined || block.recovery_seconds !== undefined) {
    throw new Error(`Bloque ${index + 1}: solo los intervalos admiten repeticiones y recuperación.`)
  } else if (!positive(block.distance_m) && !positive(block.duration_min) && !block.target_pace && !block.target_hr && !block.target_rpe) {
    throw new Error(`Bloque ${index + 1}: indica distance_m, duration_min o un objetivo medible.`)
  }

  const native = {
    id: `mcp-block-${index + 1}`,
    type: block.type,
    label: BLOCK_LABELS[block.type],
    description: block.description.trim(),
  }
  if (interval) {
    native.sets = block.repetitions
    if (positive(block.distance_per_rep_m)) native.workDistance = block.distance_per_rep_m / 1000
    if (positive(block.duration_per_rep_seconds)) native.workDuration = block.duration_per_rep_seconds / 60
    if (positive(block.recovery_seconds)) {
      native.restDuration = block.recovery_seconds / 60
      native.restAfterLastRep = false
      native.restType = 'passive'
    }
    if (block.target_pace) native.workTargetPace = block.target_pace
    if (block.target_hr) native.workTargetHR = block.target_hr
    if (block.target_rpe) native.workTargetRpe = block.target_rpe
  } else {
    if (positive(block.distance_m)) native.distance = block.distance_m / 1000
    if (positive(block.duration_min)) native.duration = block.duration_min
    if (block.target_pace) native.targetPace = block.target_pace
    if (block.target_hr) native.targetHR = block.target_hr
    if (block.target_rpe) native.targetRpe = block.target_rpe
  }
  return native
}

export function normalizeCardioPlan(input) {
  const trainingType = normalizedTrainingType(input.activity_type, input.training_type)
  const notes = input.coach_notes?.trim() || undefined

  if (input.planning_mode === 'quick') {
    if (input.blocks?.length) throw new Error('Planificación rápida no admite bloques; escribe la sesión en description.')
    if (!input.description?.trim()) throw new Error('Planificación rápida requiere description.')
    if (input.target_pace?.trim()) throw new Error('En planificación rápida incluye el ritmo en description, no en target_pace.')
    const description = input.description.trim()
    return {
      planning_mode: 'quick',
      description,
      structure: { mode: 'free_text', trainingType, description, notes, blocks: [] },
      planned_structure: null,
      target_distance_km: input.target_distance_km ?? null,
      target_duration_min: input.target_duration_min ?? null,
      target_pace: null,
      distance_validation: { status: 'not_applicable' },
    }
  }

  if (input.planning_mode !== 'structured') throw new Error('Indica planning_mode: quick o structured.')
  if (!Array.isArray(input.blocks) || input.blocks.length === 0) {
    throw new Error('La planificación estructurada requiere al menos un bloque.')
  }

  const blocks = input.blocks.map(normalizeBlock)
  let calculatedDistanceM = 0
  let completeDistance = true
  let calculatedDurationMin = 0
  let completeDuration = true
  for (const block of input.blocks) {
    if (block.type === 'intervals') {
      if (positive(block.distance_per_rep_m)) calculatedDistanceM += block.distance_per_rep_m * block.repetitions
      else completeDistance = false
      if (positive(block.duration_per_rep_seconds)) {
        calculatedDurationMin += (block.duration_per_rep_seconds * block.repetitions + (block.recovery_seconds || 0) * (block.repetitions - 1)) / 60
      } else completeDuration = false
    } else {
      if (positive(block.distance_m)) calculatedDistanceM += block.distance_m
      else completeDistance = false
      if (positive(block.duration_min)) calculatedDurationMin += block.duration_min
      else completeDuration = false
    }
  }

  const targetDistanceM = positive(input.target_distance_km) ? input.target_distance_km * 1000 : null
  if (targetDistanceM !== null && ((completeDistance && Math.abs(calculatedDistanceM - targetDistanceM) > 2) || calculatedDistanceM > targetDistanceM + 2)) {
    throw new Error(`Los bloques suman ${Math.round(calculatedDistanceM)} m y el objetivo indica ${Math.round(targetDistanceM)} m. Corrige la distancia antes de guardar.`)
  }

  const description = input.description?.trim() || input.blocks.map((block) => block.description.trim()).join('\n')
  const structure = { mode: 'structured', trainingType, description, notes, blocks }
  return {
    planning_mode: 'structured',
    description,
    structure,
    planned_structure: structure,
    target_distance_km: input.target_distance_km ?? (completeDistance ? Number((calculatedDistanceM / 1000).toFixed(3)) : null),
    target_duration_min: input.target_duration_min ?? (completeDuration ? Number(calculatedDurationMin.toFixed(2)) : null),
    target_pace: input.target_pace?.trim() || null,
    distance_validation: {
      status: targetDistanceM === null ? (completeDistance ? 'derived' : 'partial') : (completeDistance ? 'matched' : 'partial'),
      block_distance_m: Math.round(calculatedDistanceM),
      target_distance_m: targetDistanceM === null ? null : Math.round(targetDistanceM),
    },
  }
}
