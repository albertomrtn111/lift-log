import { cardioRecoveryType, prepareCardioSessionPlan, resolveCardioPlanForDisplay } from '../../../src/lib/cardio/structure.js'

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
  return !value.trim() || /running|run|carrera|trail/.test(value) ? 'rodaje' : 'other'
}

function positive(value) {
  return typeof value === 'number' && Number.isFinite(value) && value > 0
}

function normalizeBlock(block, index) {
  if (!block || !BLOCK_LABELS[block.type] || !block.description?.trim()) throw new Error(`Bloque ${index + 1}: indica tipo y descripción.`)
  for (const key of ['recovery_seconds', 'recovery_distance_m']) if (block[key] != null && (!Number.isFinite(block[key]) || block[key] < 0)) throw new Error(`Bloque ${index + 1}: recuperación no válida.`)
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
  } else if (['repetitions', 'distance_per_rep_m', 'duration_per_rep_seconds', 'recovery_seconds', 'recovery_distance_m', 'recovery_type', 'recovery_after_last_rep', 'recovery_target_pace'].some(key => block[key] !== undefined)) {
    throw new Error(`Bloque ${index + 1}: solo los intervalos admiten repeticiones y recuperación.`)
  } else if (!positive(block.distance_m) && !positive(block.duration_min) && !block.target_pace && !block.target_hr && !block.target_rpe) {
    throw new Error(`Bloque ${index + 1}: indica distance_m, duration_min o un objetivo medible.`)
  }

  const native = {
    id: block.id || `mcp-block-${index + 1}`,
    type: block.type,
    label: block.label || BLOCK_LABELS[block.type],
    description: block.description.trim(),
    ...(block.notes ? { notes: block.notes } : {}),
  }
  if (interval) {
    native.sets = block.repetitions
    if (positive(block.distance_per_rep_m)) native.workDistance = block.distance_per_rep_m / 1000
    if (positive(block.duration_per_rep_seconds)) native.workDuration = block.duration_per_rep_seconds / 60
    if (positive(block.recovery_seconds)) {
      native.restDuration = block.recovery_seconds / 60
    }
    if (positive(block.recovery_distance_m)) native.restDistance = block.recovery_distance_m / 1000
    native.restAfterLastRep = block.recovery_after_last_rep === true
    native.restType = block.recovery_type ?? (native.restDistance ? 'active' : 'passive')
    if (block.recovery_target_pace) native.restTargetPace = block.recovery_target_pace
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

  if (input.target_distance_m != null && input.target_distance_km != null && Math.abs(input.target_distance_m - input.target_distance_km * 1000) > 2) throw new Error('target_distance_m y target_distance_km no coinciden; usa una sola unidad.')
  const distanceKm = input.target_distance_m != null ? input.target_distance_m / 1000 : input.target_distance_km
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
      target_distance_km: distanceKm ?? null,
      target_duration_min: input.target_duration_min ?? null,
      target_pace: null,
      distance_validation: { status: 'not_applicable' },
      duration_validation: { status: 'not_applicable' },
      totals: null,
    }
  }

  if (input.planning_mode !== 'structured') throw new Error('Indica planning_mode: quick o structured.')
  if (!Array.isArray(input.blocks) || input.blocks.length === 0) {
    throw new Error('La planificación estructurada requiere al menos un bloque.')
  }

  const blocks = input.blocks.map(normalizeBlock)
  const description = input.description?.trim() || input.blocks.map((block) => block.description.trim()).join('\n')
  const structure = { mode: 'structured', trainingType, description, notes, blocks }
  const normalized = prepareCardioSessionPlan({ structure, description, targetDistanceKm: distanceKm,
    targetDurationMin: input.target_duration_min, targetPace: input.target_pace })
  const totals = normalized.totals
  const targetDistanceM = distanceKm != null ? distanceKm * 1000 : null
  return {
    ...normalized,
    planning_mode: 'structured',
    description,
    structure,
    planned_structure: structure,
    distance_validation: {
      status: totals.distanceComplete ? targetDistanceM === null ? 'derived' : 'matched' : 'partial',
      estimated: totals.distanceEstimated,
      block_distance_m: Math.round((totals.distanceKm ?? totals.knownDistanceKm ?? 0) * 1000),
      target_distance_m: targetDistanceM === null ? null : Math.round(targetDistanceM),
    },
    duration_validation: { status: totals.durationComplete ? input.target_duration_min == null ? 'derived' : 'matched' : 'partial',
      estimated: totals.durationEstimated, block_duration_min: totals.durationMin ?? totals.knownDurationMin, target_duration_min: input.target_duration_min ?? null },
  }
}

export function cardioPlanInputFromSession(session) {
  const native = resolveCardioPlanForDisplay(session)
  const blocks = (Array.isArray(native) ? native : native?.blocks ?? []).map((block, index) => {
    const base = { id: block.id, label: block.label, notes: block.notes, type: block.type,
      description: block.description || block.notes || block.label || `Bloque ${index + 1}` }
    return block.type === 'intervals' ? { ...base, repetitions: block.sets,
      distance_per_rep_m: block.workDistance == null ? undefined : block.workDistance * 1000,
      duration_per_rep_seconds: block.workDuration == null ? undefined : block.workDuration * 60,
      recovery_seconds: block.restDuration == null ? undefined : block.restDuration * 60,
      recovery_distance_m: block.restDistance == null ? undefined : block.restDistance * 1000,
      recovery_type: cardioRecoveryType(block), recovery_after_last_rep: block.restAfterLastRep === true,
      recovery_target_pace: block.restTargetPace, target_pace: block.workTargetPace,
      target_hr: block.workTargetHR, target_rpe: block.workTargetRpe,
    } : { ...base, distance_m: block.distance == null ? undefined : block.distance * 1000,
      duration_min: block.duration, target_pace: block.targetPace, target_hr: block.targetHR, target_rpe: block.targetRpe }
  })
  return { planning_mode: native ? 'structured' : 'quick',
    description: session.description || native?.description || session.structure?.description || '',
    training_type: native?.trainingType || session.structure?.trainingType || session.training_type,
    activity_type: session.activity_type,
    target_distance_km: session.target_distance_km ?? undefined, target_duration_min: session.target_duration_min ?? undefined,
    target_pace: native ? session.target_pace ?? undefined : undefined,
    coach_notes: session.coach_notes ?? session.notes ?? session.structure?.notes ?? undefined,
    ...(native ? { blocks } : {}),
  }
}

export function mergeCardioPlanEdit(session, changes) {
  const existing = cardioPlanInputFromSession(session)
  const replace = changes.blocks !== undefined || changes.planning_mode !== undefined
  const mode = changes.planning_mode ?? existing.planning_mode
  return normalizeCardioPlan({ ...existing, ...changes, planning_mode: mode,
    training_type: changes.training_type ?? (changes.activity_type ? undefined : existing.training_type),
    target_distance_km: changes.target_distance_m != null ? undefined : changes.target_distance_km !== undefined ? changes.target_distance_km : replace ? undefined : existing.target_distance_km,
    target_duration_min: changes.target_duration_min !== undefined ? changes.target_duration_min : replace ? undefined : existing.target_duration_min,
    target_pace: mode === 'quick' ? changes.target_pace ?? undefined : changes.target_pace ?? existing.target_pace,
    description: changes.description !== undefined ? changes.description : changes.blocks ? undefined : existing.description,
    blocks: changes.blocks !== undefined ? changes.blocks : mode === 'structured' ? existing.blocks : undefined,
  })
}
